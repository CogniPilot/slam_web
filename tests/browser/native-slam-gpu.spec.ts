import {expect,test} from '@playwright/test';
import {existsSync} from 'node:fs';

// Hardware rendering only: the native programs need the 848 × 480 camera and
// about 1.2 GB of memory. The run measures the real in-browser evaluation cost.
test('native Modelica SLAM initializes on the first image and estimates every lockstep frame',async({page},testInfo)=>{
  test.skip(!existsSync('public/vendor/slam/manifest.json'),'Native SLAM assets are not published');
  test.setTimeout(900_000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.initialized&&lab.ready&&lab.compiling===false;}),{timeout:90000}).toBe(true);
  const profile=await page.evaluate(()=>{const w=(window as any).__slamLab.runtime.world;return {acceleration:w.graphics.acceleration,renderer:w.graphics.renderer,sensorProfile:w.sensorProfile};});
  test.skip(profile.acceleration==='software','Software rendering serves the reduced camera');
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Estimator backend',{exact:true}).selectOption('native');
  const started=Date.now();
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.compiling===false;}),{timeout:600_000}).toBe(true);
  const initMs=Date.now()-started;
  const status=await page.locator('#status').textContent();
  expect(status,status??'').not.toMatch(/error|cannot|failed/i);
  expect(await page.evaluate(()=>(window as any).__slamLab.ready)).toBe(true);
  const program=await page.evaluate(()=>(window as any).__slamLab.runtime.slamProgram);
  expect(program.models.step.model).toBe('D435FastSLAMStep');
  const rates=await page.evaluate(()=>(window as any).__slamLab.project.sensorRates);
  const frames:{sequence:number;wallMs:number;diagnostics:Record<string,number|string>;points:number;features:number;position:number[]}[]=[];
  for(let i=0;i<3;i++){
    const before=await page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1);
    const t=Date.now();
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return !lab.runtime.busy&&(lab.latest?.frame.sequence??-1);}),{timeout:300_000}).toBeGreaterThan(before);
    const wallMs=Date.now()-t;
    const latest=await page.evaluate(()=>{const lab=(window as any).__slamLab;const e=lab.latest.estimate;return {sequence:lab.latest.frame.sequence,diagnostics:e.diagnostics,points:e.points.length,features:e.features?.length??0,position:[e.x,e.y,e.z]};});
    frames.push({...latest,wallMs});
    expect(latest.diagnostics.runtime).toBe('Rumoca native SLAM program');
    expect(latest.position.every(Number.isFinite)).toBe(true);
  }
  await expect(page.locator('#flight-status')).not.toContainText('visual SLAM pending');
  const report={profile,rates,initMs,frames,errors,status};
  console.log(JSON.stringify(report,null,1));
  await testInfo.attach('native-slam-browser.json',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  await page.screenshot({path:'test-results/native-slam-browser.png',fullPage:true});
  expect(errors).toEqual([]);
  expect(frames.at(-1)!.points).toBeGreaterThan(0);
});
