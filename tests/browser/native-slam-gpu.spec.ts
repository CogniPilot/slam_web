import {expect,test} from '@playwright/test';
import {existsSync} from 'node:fs';
import {D435_PAIRED_RESOLUTIONS} from '../../src/camera-profile';

// Hardware rendering only. The run measures real in-browser evaluation cost.
for(const mode of D435_PAIRED_RESOLUTIONS)test(`native Modelica SLAM initializes and steps live ${mode.id} RGB-D`,async({page},testInfo)=>{
  test.skip(!existsSync('public/vendor/slam/manifest.json'),'Native SLAM assets are not published');
  test.setTimeout(900_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.ready&&lab.compiling===false;}),{timeout:90000}).toBe(true);
  const profile=await page.evaluate(()=>{const w=(window as any).__slamLab.runtime.world;return {acceleration:w.graphics.acceleration,renderer:w.graphics.renderer,sensorProfile:w.sensorProfile};});
  test.skip(profile.acceleration==='software','Software rendering serves the reduced camera');
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('RGB + depth resolution',{exact:true}).selectOption(mode.id);
  await expect(page.getByLabel('RGB + depth resolution',{exact:true})).toBeEnabled({timeout:90000});
  await page.getByLabel('Estimator backend',{exact:true}).selectOption('native');
  const started=Date.now();
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.compiling===false;}),{timeout:600_000}).toBe(true);
  const initMs=Date.now()-started;
  const status=await page.locator('#status').textContent();
  expect(status,status??'').not.toMatch(/error|cannot|failed/i);
  expect(await page.evaluate(()=>(window as any).__slamLab.ready)).toBe(true);
  const program=await page.evaluate(()=>(window as any).__slamLab.runtime.slamProgram);
  expect(program.models.step.model).toBe(`D435_${mode.id}Step`);
  const rates=await page.evaluate(()=>(window as any).__slamLab.project.sensorRates);
  const frames:{sequence:number;wallMs:number;diagnostics:Record<string,number|string>;points:number;features:number;position:number[]}[]=[];
  for(let i=0;i<3;i++){
    const before=await page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1);
    const t=Date.now();
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return !lab.runtime.busy&&(lab.latest?.frame.sequence??-1);}),{timeout:300_000}).toBeGreaterThan(before);
    const wallMs=Date.now()-t;
    const latest=await page.evaluate(()=>{const lab=(window as any).__slamLab;const {frame,estimate:e}=lab.latest;return {sequence:frame.sequence,diagnostics:e.diagnostics,points:e.points.length,features:e.features?.length??0,position:[e.x,e.y,e.z],
      imageSize:[frame.imageLayout.color.width,frame.imageLayout.color.height],rgbBytes:frame.rgb.byteLength,depthBytes:frame.depth.byteLength,
      pixelsInBounds:(e.features??[]).every((feature:number[])=>feature[0]>=0&&feature[0]<frame.calibration.width&&feature[1]>=0&&feature[1]<frame.calibration.height)};});
    frames.push({...latest,wallMs});
    expect(latest.diagnostics.runtime).toBe('Rumoca native SLAM program');
    expect(latest.diagnostics.imageCompleted).toBe(1);
    expect(latest.position.every(Number.isFinite)).toBe(true);
    expect(latest.imageSize).toEqual([mode.width,mode.height]);
    expect(latest.rgbBytes).toBe(mode.width*mode.height*3);expect(latest.depthBytes).toBe(mode.width*mode.height*2);
    expect(latest.pixelsInBounds).toBe(true);
  }
  await expect(page.locator('#flight-status')).not.toContainText('visual SLAM pending');
  const report={profile,rates,initMs,frames,errors,status};
  console.log(JSON.stringify({profile,rates,initMs,frames:frames.length,last:frames.at(-1),errors,status},null,1));
  await testInfo.attach('native-slam-browser.json',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  await page.screenshot({path:testInfo.outputPath('native-slam-browser.png'),fullPage:true});
  expect(errors).toEqual([]);
  expect(frames.some(frame=>frame.features>0)).toBe(true);
  // The legacy mapping gate retains its calibrated 848 × 480 input. The
  // smallest raster can have too few features to map the initial city view.
  if(mode.id==='848x480')expect(frames.at(-1)!.points).toBeGreaterThan(0);
});
