import {openModelicaPropagation} from './reference-project';
import {test,expect} from '@playwright/test';
import process from 'node:process';

// Pending the replacement direct adapter and native Modelica host.
test.fixme('browser RGB-D reaches real ROS DDS and ROS odometry returns through an explicit adapter',async({page})=>{
  test.skip(!process.env.SLAM_ROS2_TEST,'Requires the replacement native ROS DDS adapter');
  await page.goto('/');await openModelicaPropagation(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await page.getByLabel('External adapter endpoint').fill(process.env.SLAM_ROS2_ENDPOINT??'ws://127.0.0.1:19983');
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(page.locator('#remote-state')).toContainText('Connected',{timeout:15000});
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Step',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
    await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.externalSamples),{timeout:20000}).toBeGreaterThanOrEqual(i+1);
  }
  const state=await page.evaluate(()=>{
    const lab=(window as any).__slamLab;return {external:lab.externalLatest,time:lab.latest.frame.time,samples:lab.externalSamples};
  });
  expect(state.samples).toBeGreaterThanOrEqual(3);
  expect(state.external.x).toBeGreaterThanOrEqual(14);
  expect(state.external.y).toBe(2);expect(state.external.z).toBe(3);
  expect(state.external.quaternion).toEqual([1,0,0,0]);
  expect(state.external.time).toBeCloseTo(state.time,8);
});
