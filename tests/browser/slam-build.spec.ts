import {test,expect,type Page} from '@playwright/test';
import {readFileSync,appendFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {defaultGraph} from '../../src/graph';
import {rgbdSlamNativeSourceManifest as manifest} from '../../src/modelica-slam-source-manifest.mjs';

const candidate=process.env.SLAM_BUILD_CANDIDATE;
test.setTimeout(120000);
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const progress=(message:string)=>{if(process.env.SLAM_WORKSPACE_PROGRESS)appendFileSync(process.env.SLAM_WORKSPACE_PROGRESS,`${new Date().toISOString()} build: ${message}\n`);};
async function openWorkspace(page:Page){
  progress('seed');
  const fixture={format:'slam-lab-project',version:1,name:'Browser WASM build check',environment:'warehouse',seed:7,
    sceneDetail:'low',depthCloudEnabled:false,carsEnabled:false,peopleEnabled:false,
    algorithm:readFileSync('models/ModelicaInertial.mo','utf8'),algorithmPreset:'Modelica inertial propagation',
    physics:readFileSync('models/LabQuadrotor.mo','utf8'),detector:['D435ImageProfile','FastNativeFrame','D435FastFeatures'].map(name=>readFileSync(`models/${name}.mo`,'utf8')).join('\n'),
    detectorPreset:'Modelica FAST · integration pending',detectorLanguage:'modelica',runtime:'modelica',graph:defaultGraph()};
  // Seed storage on the actual origin without starting a disposable city and
  // compiler session through the static server's index fallback.
  await page.route('**/__slam_build_seed__.txt',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Seed project</title>'}));
  await page.goto('/__slam_build_seed__.txt');
  await page.evaluate(value=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('slam-lab-projects',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('projects');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put(value,'slam-lab.project.v1');
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  }),fixture);
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.ready;}),{timeout:90000}).toBe(true);
  await page.getByRole('button',{name:'▶ Run',exact:true}).click();
  progress('baseline ready');
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await page.getByLabel('SLAM source file').selectOption('models/RGBDFastSLAMReset.mo');
  await expect(page.getByRole('button',{name:'Check WASM build',exact:true})).toBeVisible();
  const snapshot=await page.evaluate(()=>{
    const project=(window as any).__slamLab.project;
    return {algorithm:project.algorithm,physics:project.physics,workspace:project.slamWorkspace};
  });
  expect(snapshot.workspace.schemaVersion).toBe(2);
  expect(Object.keys(snapshot.workspace.sources)).toHaveLength(59);
  const source=manifest.paths.map(file=>snapshot.workspace.sources[file]).join(manifest.separator);
  return {...snapshot,sourceSha256:sha(source)};
}

test('static application requests an exact saved-source WASM build and preserves the running estimator',async({page},testInfo)=>{
  const before=await openWorkspace(page);
  await page.getByRole('button',{name:'Check WASM build',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt),{timeout:75000}).toBeTruthy();
  const receipt=await page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt);
  expect(receipt.sourceSha256).toBe(before.sourceSha256);
  expect(receipt.compiler.version).toBe('0.10.0');
  expect(receipt.status).toBe('failed');
  expect(receipt.error).toContain('does not expose native WASM program compilation');
  expect(receipt.programs).toEqual([]);
  await expect(page.locator('#slam-build-result')).toContainText('WASM build failed');
  await expect(page.getByRole('button',{name:'Cancel build',exact:true})).toBeHidden();
  await expect(page.getByRole('button',{name:'Check WASM build',exact:true})).toBeEnabled();
  const after=await page.evaluate(()=>{
    const project=(window as any).__slamLab.project;
    return {algorithm:project.algorithm,physics:project.physics,workspace:project.slamWorkspace};
  });
  expect(after).toEqual({algorithm:before.algorithm,physics:before.physics,workspace:before.workspace});
  await testInfo.attach('installed-compiler-build.json',{body:JSON.stringify(receipt,null,2),contentType:'application/json'});
  await testInfo.attach('installed-build-status.png',{body:await page.locator('.slam-source-build').screenshot(),contentType:'image/png'});
  progress('installed compiler refusal verified');
});

test('actual CI compiler refusal is visible and a synchronous WASM build can be cancelled and retried',async({page},testInfo)=>{
  test.skip(!candidate,'Set SLAM_BUILD_CANDIDATE to a paired downloaded Rumoca browser package');
  const before=await openWorkspace(page);
  // Replace static assets only for the subsequently created build worker. The
  // initialized physics and LSP workers keep the installed production package.
  await page.route('**/vendor/rumoca/rumoca_bind_wasm*',route=>{
    const name=path.basename(new URL(route.request().url()).pathname);
    if(!['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm'].includes(name))return route.continue();
    return route.fulfill({body:readFileSync(path.join(candidate!,name)),contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript'});
  });
  const edited=readFileSync('models/RGBDFastSLAMReset.mo','utf8')+'\n// Edited while the prior snapshot compiles.\n';
  // Change source in the progress notification's microtask, before the final
  // worker response can be dispatched, independent of rendering speed.
  await page.evaluate(source=>{
    const result=document.querySelector('#slam-build-result')!;
    const observer=new MutationObserver(()=>{
      if(result.textContent==='Compiling RGBDFastSLAMReset…'){
        observer.disconnect();(window as any).__slamLab.sourceEditor.editor.setValue(source);
      }
    });
    observer.observe(result,{childList:true,subtree:true,characterData:true});
  },edited);
  await page.getByRole('button',{name:'Check WASM build',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt),{timeout:75000}).toBeTruthy();
  const receipt=await page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt);
  expect(receipt.sourceSha256).toBe(before.sourceSha256);
  expect(receipt.status).toBe('failed');
  expect(receipt.failedAt).toEqual({phase:'compiling',model:'RGBDFastSLAMReset'});
  expect(receipt.error).toContain('function assignment target');
  expect(receipt.compiler.version).toBe('0.10.2');
  await expect(page.locator('#slam-build-result')).toContainText('RGBDFastSLAMReset');
  await expect(page.locator('#slam-build-result')).toContainText('Source changed during this build');
  const editedWorkspace=await page.evaluate(()=>(window as any).__slamLab.project.slamWorkspace);
  expect(editedWorkspace.sources['models/RGBDFastSLAMReset.mo']).toBe(edited);
  const editedSha256=sha(manifest.paths.map(file=>editedWorkspace.sources[file]).join(manifest.separator));
  expect(editedSha256).not.toBe(before.sourceSha256);
  await testInfo.attach('ci-compiler-build.json',{body:JSON.stringify(receipt,null,2),contentType:'application/json'});
  progress('CI refusal and stale edit verified');

  const created=page.waitForEvent('worker',{predicate:worker=>worker.url().includes('modelica-slam-build.worker'),timeout:15000});
  await page.getByRole('button',{name:'Check WASM build',exact:true}).click();
  const compilerWorker=await created;
  await expect(page.locator('#slam-build-result')).toHaveText('Compiling RGBDFastSLAMReset…');
  await page.getByLabel('Edit node').selectOption('evaluation');
  await expect(page.getByRole('button',{name:'Cancel build',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel build',exact:true}).click();
  await expect(page.locator('#slam-build-result')).toHaveText('Build cancelled.');
  progress('cancellation UI completed');
  await expect.poll(()=>page.workers().includes(compilerWorker),{timeout:15000}).toBe(false);
  progress('compiler worker terminated');
  expect(await page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt)).toBeUndefined();
  await page.getByLabel('Edit node').selectOption('slam');
  await expect(page.getByRole('button',{name:'Check WASM build',exact:true})).toBeEnabled();
  // A retry must start a new compiler worker after cancellation.
  await page.getByRole('button',{name:'Check WASM build',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt),{timeout:75000}).toBeTruthy();
  const retry=await page.evaluate(()=>(window as any).__slamLab.slamBuildReceipt);
  expect(retry.sourceSha256).toBe(editedSha256);expect(retry.failedAt).toEqual(receipt.failedAt);
  expect(retry.compiler).toEqual(receipt.compiler);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.algorithm)).toBe(before.algorithm);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.slamWorkspace)).toEqual(editedWorkspace);
  await expect(page.getByRole('button',{name:'Cancel build',exact:true})).toBeHidden();
  await testInfo.attach('ci-build-status.png',{body:await page.locator('.slam-source-build').screenshot(),contentType:'image/png'});
  progress('retry and source preservation verified');
});
