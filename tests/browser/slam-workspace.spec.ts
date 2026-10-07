import {modelicaSourcePath} from '../../src/modelica-source-locations.mjs';
import {test,expect} from '@playwright/test';
import {readFileSync,appendFileSync} from 'node:fs';
import {defaultGraph} from '../../src/graph';
const progress=(phase:string)=>{if(process.env.SLAM_WORKSPACE_PROGRESS)
  appendFileSync(process.env.SLAM_WORKSPACE_PROGRESS,`${new Date().toISOString()} ${phase}\n`);};

test.afterEach(async({page},testInfo)=>{
  if(testInfo.status===testInfo.expectedStatus)return;
  const state=await page.evaluate(()=>({
    diagnostics:(window as any).__slamLab?.sourceEditor.getDiagnostics(),
    lspStatus:(window as any).__slamLab?.sourceEditor.status,
    appStatus:document.getElementById('status')?.textContent,
    title:document.getElementById('editor-title')?.textContent
  })).catch(error=>({error:String(error)}));
  await testInfo.attach('editor-state',{body:JSON.stringify(state),contentType:'application/json'});
});

test('full Modelica source workspace edits, diagnostics, download and local reload preserve all dependencies',async({page})=>{
  progress('seed project');
  // Use an economical scene for this editor test. The rendering/SLAM gates
  // retain their own settings; software-renderer throughput is not under test.
  const fixture={format:'slam-lab-project',version:1,name:'Source workspace test',
    environment:'warehouse',seed:7,sceneDetail:'low',depthCloudEnabled:false,carsEnabled:false,peopleEnabled:false,
    algorithm:readFileSync('models/Estimation/Inertial/ModelicaInertial.mo','utf8'),algorithmPreset:'Modelica inertial propagation',
    physics:readFileSync('models/Vehicles/LabQuadrotor.mo','utf8'),
    detector:['D435ImageProfile','FastNativeFrame','D435FastFeatures'].map(name=>readFileSync(modelicaSourcePath(name),'utf8')).join('\n'),detectorPreset:'Modelica FAST · integration pending',
    detectorLanguage:'modelica',runtime:'modelica',graph:defaultGraph()};
  await page.goto('/__workspace_seed__.txt');
  await page.evaluate(project=>new Promise<void>((resolve,reject)=>{
    const request=indexedDB.open('slam-lab-projects',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('projects');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('projects','readwrite');
      tx.objectStore('projects').put(project,'slam-lab.project.v1');
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
    };
  }),fixture);
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.project.name),{timeout:30000}).toBe(fixture.name);
  progress('project loaded');
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  const active=await page.evaluate(()=>(window as any).__slamLab.project.algorithm);
  const path='models/SLAM/RGBDFastSLAMInterface.mo';
  await page.getByLabel('SLAM source file').selectOption(path);
  await expect(page.locator('#editor-title')).toHaveText('SLAM/RGBDFastSLAMInterface.mo');
  progress('workspace opened');
  await page.getByLabel('SLAM source file').selectOption('models/SLAM/D435FastSLAM.mo');
  await expect(page.getByLabel('Node source code')).toHaveValue(readFileSync('models/SLAM/D435FastSLAM.mo','utf8'));
  await page.getByLabel('SLAM source file').selectOption(path);
  await expect(page.getByRole('button',{name:'Full SLAM execution pending',exact:true})).toBeDisabled();
  const original=await page.getByLabel('Node source code').inputValue();
  expect(original).toBe(readFileSync(path,'utf8'));
  const edited=original.replace('minimumMeasuredDescriptors = 8;','minimumMeasuredDescriptors = 12;');
  expect(edited).not.toBe(original);
  // The actual Rumoca worker diagnoses this file through the existing editor.
  await page.evaluate(()=>(window as any).__slamLab.sourceEditor.editor.setValue('model Broken\n equation\n x = ;\nend Broken;'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().some((d:any)=>d.severity===1)),{timeout:30000}).toBe(true);
  progress('broken syntax diagnosed');
  await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),edited);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.sourceEditor.getDiagnostics().filter((d:any)=>d.severity===1).length),{timeout:30000}).toBe(0);
  progress('valid source diagnostics cleared');
  const lines=edited.split('\n'),declaration=lines.findIndex(line=>line.includes('parameter Integer minimumMeasuredDescriptors'));
  const position={line:declaration,character:lines[declaration].indexOf('minimumMeasuredDescriptors')+5};
  const hover=await page.evaluate(at=>(window as any).__slamLab.sourceEditor.requestHover(at),position);
  expect(hover).not.toBeNull();
  const completion=await page.evaluate(at=>(window as any).__slamLab.sourceEditor.requestCompletion(at),position);
  expect(completion.length).toBeGreaterThan(0);
  const stale=await page.evaluate(async at=>{
    const editor=(window as any).__slamLab.sourceEditor;
    const hover=editor.requestHover(at),completion=editor.requestCompletion(at);
    await Promise.resolve(); // Requests have left; switch before their replies.
    const select=document.querySelector<HTMLSelectElement>('[aria-label="SLAM source file"]')!;
    select.value='models/Optimization/ModelicaPoseGraph.mo';select.dispatchEvent(new Event('change',{bubbles:true}));
    return {hover:await hover,completion:await completion};
  },position);
  expect(stale).toEqual({hover:null,completion:[]});
  progress('stale language replies discarded on file switch');
  await expect(page.getByLabel('Node source code')).toHaveValue(readFileSync('models/Optimization/ModelicaPoseGraph.mo','utf8'));
  await page.getByLabel('SLAM source file').selectOption(path);
  await expect(page.getByLabel('Node source code')).toHaveValue(edited);
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Saved locally');
  progress('project saved');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download',exact:true}).click();
  const download=await downloadPromise;
  const portable=JSON.parse(readFileSync((await download.path())!,'utf8'));
  expect(portable.algorithm).toBe(active);
  expect(portable.slamWorkspace.schemaVersion).toBe(2);
  expect(Object.keys(portable.slamWorkspace.sources)).toHaveLength(59);
  for(const file of ['models/SLAM/D435FastSLAM.mo','models/Sensors/D435ImageProfile.mo','models/SLAM/RGBDFastSLAMIntervals.mo'])
    expect(portable.slamWorkspace.sources[file]).toBe(readFileSync(file,'utf8'));
  expect(portable.slamWorkspace.sources[path]).toBe(edited);
  // Every unedited dependency is present verbatim, including files never opened.
  for(const [file,source] of Object.entries(portable.slamWorkspace.sources)){
    expect(source).toBe(file===path?edited:readFileSync(file,'utf8'));
  }
  progress('portable project verified');
  await page.reload();
  await expect.poll(()=>page.evaluate(file=>(window as any).__slamLab?.project.slamWorkspace?.sources[file],path),{timeout:30000}).toBe(edited);
  progress('saved project reloaded');
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  expect(await page.evaluate(()=>(window as any).__slamLab.project.slamWorkspace)).toEqual(portable.slamWorkspace);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.algorithm)).toBe(active);
  await page.getByLabel('SLAM source file').selectOption(path);
  await expect(page.getByLabel('Node source code')).toHaveValue(edited);
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Environment',{exact:true}).selectOption('courtyard');
  await expect(page.getByLabel('Environment',{exact:true})).toBeEnabled({timeout:30000});
  await page.getByRole('tab',{name:'Editor',exact:true}).click();
  await expect(page.getByRole('button',{name:'Full SLAM execution pending',exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Graphics quality').selectOption('medium');
  await expect(page.getByLabel('Graphics quality')).toBeEnabled({timeout:30000});
  await page.getByRole('tab',{name:'Editor',exact:true}).click();
  await expect(page.getByRole('button',{name:'Full SLAM execution pending',exact:true})).toBeDisabled();
  progress('configuration changes preserve pending execution control');
  await page.getByLabel('SLAM source file').selectOption('');
  await expect(page.getByLabel('Node source code')).toHaveValue(active);
  await expect(page.getByRole('button',{name:'Apply & reset',exact:true})).toBeVisible();
  progress('editor restored to active estimator');
  // Opening a version1 project while viewing a native-only file must restore
  // its exact56-file workspace, without undefined source or injected files.
  await page.getByLabel('SLAM source file').selectOption('models/SLAM/D435FastSLAM.mo');
  const old=structuredClone(portable);old.slamWorkspace.schemaVersion=1;
  for(const file of ['models/SLAM/D435FastSLAM.mo','models/Sensors/D435ImageProfile.mo','models/SLAM/RGBDFastSLAMIntervals.mo'])
    delete old.slamWorkspace.sources[file];
  await page.locator('#open').setInputFiles({name:'old-workspace.slam.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.project.slamWorkspace?.schemaVersion)).toBe(1);
  await expect(page.getByLabel('Node source code')).toHaveValue(active);
  expect(await page.getByLabel('SLAM source file').locator('option[value="models/SLAM/D435FastSLAM.mo"]').count()).toBe(0);
  expect(await page.evaluate(()=>(window as any).__slamLab.project.slamWorkspace)).toEqual(old.slamWorkspace);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  progress('historical workspace import preserved exact inventory');
});
