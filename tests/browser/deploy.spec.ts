import {openExperimentFile} from './source-files';
// Pending the replacement native host deployment adapter. Existing parity assertions stay intact.
import {test,expect} from '@playwright/test';
import process from 'node:process';
import {openModelicaPropagation} from './reference-project';
for(const detector of ['Modelica FAST · full resolution','Modelica Harris','Modelica Harris + NMS'])test.fixme(`Modelica host deploys ${detector} and matches propagation odometry`,async({page})=>{
  test.skip(!process.env.SLAM_COMPANION_TEST,'Requires a running isolated test companion');
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90_000}).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await openModelicaPropagation(page);
  await openExperimentFile(page,'detector');
  if(detector.startsWith('Modelica '))await page.getByLabel('Feature detector preset').selectOption(detector);
  if(detector.startsWith('Modelica Harris')) {
    // Exercise edited Modelica, rather than deploying a fixed prebuilt detector.
    const editor=page.getByLabel('Modelica source');
    await editor.fill((await editor.inputValue()).replace('harris_k = 0.04','harris_k = 0.07'));
  }
  await openExperimentFile(page,'slam');await page.getByLabel('Run model').selectOption('ModelicaInertial');
  await page.getByRole('button',{name:'Apply & reset'}).click();
  await expect(page.getByRole('button',{name:'Step',exact:true})).toBeEnabled({timeout:90_000});
  await page.getByLabel('External adapter endpoint').fill(process.env.SLAM_COMPANION_ENDPOINT??'ws://127.0.0.1:19979');await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(page.locator('#remote-state')).toContainText('Connected',{timeout:15_000});
  await page.getByLabel('Companion target ID').fill('test-companion');await page.getByLabel('Deployment token').fill('test-only');
  await page.getByRole('button',{name:'Deploy project',exact:true}).click();
  await expect(page.locator('#deploy-state')).toContainText('activated',{timeout:30_000});
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence)).toBe(0);
  // The native process returns its results through the explicit adapter.
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.externalSamples??0)).toBeGreaterThan(0);
  for(let sequence=1;sequence<8;sequence++) {
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.latest?.frame.sequence)).toBe(sequence);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.externalSamples??0)).toBeGreaterThan(sequence);
    const comparison=await page.evaluate(()=>{
      const lab=(window as any).__slamLab;
      return {local:lab.latest.estimate,native:lab.externalLatest};
    });
    for(const axis of ['x','y','z'])expect(comparison.native[axis]).toBeCloseTo(comparison.local[axis],8);
    expect(comparison.native.quaternion).toEqual(comparison.local.quaternion);
    expect(comparison.native.features.map((p:number[])=>p.slice(0,2))).toEqual(comparison.local.features.map((p:number[])=>p.slice(0,2)));
  }
  console.log('DEPLOYMENT',await page.locator('#deploy-state').innerText());
  if(detector==='Modelica Harris + NMS'){
    const digest=await page.evaluate(()=>(window as any).__slamLab.project.detectorArtifact.sourceSha256);
    await page.getByRole('button',{name:'Save project',exact:true}).click();
    await expect(page.locator('#saved')).toHaveText('Saved locally');
    await page.reload();
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
    expect(await page.evaluate(()=>(window as any).__slamLab.project.detectorArtifact.sourceSha256)).toBe(digest);
    expect(await page.evaluate(()=>(window as any).__slamLab.project.detectorArtifact.profile)).toBe('rgb90x160x3-score14x28-nms');
  }
});
