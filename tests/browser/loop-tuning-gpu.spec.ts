import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DEFAULT_LOOP_CLOSURE_SETTINGS} from '../../src/loop-closure-settings';
import {installNativeStateCapture,captureNativeState} from '../../scripts/native-state-profile.mjs';

// Runs against real native programs and the hardware RGB-D camera. Optional
// private assets let the same regression qualify a delivery before publishing.
test('loop tuning reaches native inputs, preserves the map and survives reload',async({page},testInfo)=>{
  test.setTimeout(300_000);
  const directory=process.env.SLAM_PROFILE_NATIVE_DIR;
  if(directory)await page.route('**/vendor/slam/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1)!;
    const body=await readFile(join(directory,name));
    await route.fulfill({body,contentType:name.endsWith('.json')?'application/json':'application/octet-stream'});
  });
  await page.route('**/assets/modelica-slam.worker-*.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({body:`(${installNativeStateCapture.toString()})();\n${await response.text()}`,contentType:'text/javascript'});
  });
  await page.goto('/');
  await page.waitForFunction(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.ready&&!lab.compiling;},{},{timeout:90_000});
  test.skip(await page.evaluate(()=>(window as any).__slamLab.runtime.world.graphics.acceleration==='software'),'Hardware RGB-D camera required');
  const manifest=await (await page.request.get('/vendor/slam/manifest.json')).json();
  // API requests bypass page routes; use the private manifest when selected.
  const layout=(directory?JSON.parse(await readFile(join(directory,'manifest.json'),'utf8')):manifest).profiles['424x240'].models.step;
  await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,r=lab.runtime;
    const p=structuredClone(lab.project);
    Object.assign(p,{environment:'warehouse',slamBackend:'inertial',cameraResolution:'424x240',sceneDetail:'low',lidarEnabled:false,depthCloudEnabled:false,
      sensorRates:{cameraHz:5,lidarHz:5,imuHz:10,gpsHz:1}});
    Object.assign(lab.project,p);r.autopilot=false;
  });
  await page.getByRole('button',{name:'Parameters',exact:true}).click();
  await page.getByLabel('Estimator backend',{exact:true}).selectOption('native');
  await page.waitForFunction(()=>{const lab=(window as any).__slamLab;return lab.ready&&!lab.compiling&&lab.runtime.slamProgram?.tuningSupported;},{},{timeout:120_000});
  await page.evaluate(async()=>{for(let i=0;i<20;i++)await (window as any).__slamLab.runtime.step();});
  const worker=page.workers().find(worker=>worker.url().includes('modelica-slam.worker-'))!;
  expect(worker).toBeTruthy();
  const beforeState=await worker.evaluate(captureNativeState,layout);
  const before=await page.evaluate(()=>{const l=(window as any).__slamLab;return {time:l.runtime.time,sequence:l.latest.frame.sequence,graph:l.latest.estimate.poseGraph};});
  await page.getByRole('button',{name:'Parameters',exact:true}).click();
  await expect(page.getByLabel('Run model',{exact:true})).toBeDisabled();
  await page.getByLabel('Minimum revisit age (s)',{exact:true}).fill('1000');
  await page.getByRole('button',{name:'Apply tuning',exact:true}).click();
  await expect(page.locator('#status')).toContainText('current map retained');
  const afterState=await worker.evaluate(captureNativeState,layout);
  const after=await page.evaluate(()=>{const l=(window as any).__slamLab;return {time:l.runtime.time,sequence:l.latest.frame.sequence,graph:l.latest.estimate.poseGraph};});
  expect(after).toEqual(before);expect(afterState.sha256).toBe(beforeState.sha256);
  const settings={...DEFAULT_LOOP_CLOSURE_SETTINGS,loopMinimumAge:1000};
  const readInputs=async(target=worker)=>target.evaluate(inputs=>{
    const view=new DataView((globalThis as any).__nativeStateMemories[1].buffer);
    return Object.fromEntries(Object.entries(inputs).map(([name,slot]:[string,any])=>[name,slot.lane==='i64'?Number(view.getBigInt64(slot.offset,true)):slot.lane==='u8'?!!view.getUint8(slot.offset):view.getFloat64(slot.offset,true)]));
  },Object.fromEntries(Object.keys(settings).map(key=>[key,layout.inputs[key]])));
  expect(await readInputs()).toEqual(settings);
  const outcome=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,r=lab.runtime;let candidates=0,visualUpdates=0;
    for(let i=0;i<60;i++){
      const phase=r.time%24;r.command={forward:phase<6?.5:phase<12?0:phase<18?-.5:0,left:phase<6?0:phase<12?.25:phase<18?0:-.25,up:0,yaw:0};
      await r.step();const d=lab.latest.estimate.diagnostics;candidates+=d.loopCandidateCount;visualUpdates=Math.max(visualUpdates,d.visualUpdates);
    }
    return {candidates,visualUpdates,loops:lab.latest.estimate.diagnostics.loopEdges,keyframes:lab.latest.estimate.diagnostics.keyframes};
  });
  expect(outcome.candidates).toBe(0);expect(outcome.loops).toBe(0);expect(outcome.visualUpdates).toBeGreaterThan(0);expect(outcome.keyframes).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Save project',exact:true}).click();
  await expect(page.locator('#saved')).toHaveText('Saved locally');
  await page.screenshot({path:testInfo.outputPath('loop-tuning.png'),fullPage:true});
  await page.reload();
  await page.waitForFunction(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.ready&&!lab.compiling;},{},{timeout:120_000});
  expect(await page.evaluate(()=>(window as any).__slamLab.project.loopClosureSettings)).toEqual(settings);
  expect(await readInputs(page.workers().find(worker=>worker.url().includes('modelica-slam.worker-'))!)).toEqual(settings);
  await page.getByRole('button',{name:'Parameters',exact:true}).click();
  await expect(page.getByLabel('Minimum revisit age (s)',{exact:true})).toHaveValue('1000');
  const receipt=testInfo.outputPath('loop-tuning.json');
  await writeFile(receipt,JSON.stringify({before,after,beforeState,afterState,settings,outcome},null,2));
  await testInfo.attach('loop-tuning.json',{path:receipt,contentType:'application/json'});
});
