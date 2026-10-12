import {expect,test} from '@playwright/test';
import {openEconomicalPropagation} from './reference-project';

test('two drones produce independent synchronized frames and selection routes control and follow',async({page})=>{
  test.setTimeout(180_000);
  await openEconomicalPropagation(page,true);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await expect(page.getByLabel('Controlled and followed drone')).toBeHidden();
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Number of drones',{exact:true}).selectOption('2');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.ready&&!lab.compiling&&lab.runtime.vehicleCount===2;}),{timeout:120_000}).toBe(true);
  const initial=await page.evaluate(()=>{
    const runtime=(window as any).__slamLab.runtime;
    return [0,1].map(index=>{const vehicle=runtime.getVehicle(index);return {time:vehicle.time,y:vehicle.world.truth.y};});
  });
  expect(initial).toEqual([{time:0,y:0},{time:0,y:2}]);
  await page.getByRole('button',{name:'Step',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{const r=(window as any).__slamLab.runtime;return !r.busy&&!!r.getVehicle(1).lastFrame;})).toBe(true);
  const frames=await page.evaluate(()=>{
    const runtime=(window as any).__slamLab.runtime;
    return [0,1].map(index=>{const {frame,estimate,truth}=runtime.getVehicle(index).lastFrame;return {time:frame.time,sequence:frame.sequence,rgb:Array.from(frame.rgb),depth:Array.from(frame.depth),estimateTime:estimate.diagnostics?.time,truthY:truth.y};});
  });
  expect(frames[0].time).toBe(frames[1].time);expect(frames[0].sequence).toBe(frames[1].sequence);
  expect(frames[0].rgb).not.toEqual(frames[1].rgb);expect(frames[0].depth).not.toEqual(frames[1].depth);
  await page.getByLabel('Controlled and followed drone',{exact:true}).selectOption('1');
  expect(await page.evaluate(()=>{const r=(window as any).__slamLab.runtime;return [r.activeVehicleIndex,r.world.cameraVehicle];})).toEqual([1,1]);
  await page.locator('#world').focus();await page.keyboard.down('w');
  try{await page.getByRole('button',{name:'Step',exact:true}).click();}
  finally{await page.keyboard.up('w');}
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const commands=await page.evaluate(()=>{const r=(window as any).__slamLab.runtime;return [0,1].map(index=>r.getVehicle(index).lastFrame.truth.command.forward);});
  expect(commands).toEqual([0,1.6]);
  await page.getByRole('button',{name:'Add series',exact:true}).click();
  await page.getByLabel('Series drone',{exact:true}).last().selectOption('1');
  await page.getByLabel('Series signal',{exact:true}).last().selectOption('vx');
  await page.getByRole('button',{name:'Full screen plot',exact:true}).click();
  await expect(page.locator('.telemetry-plot')).toHaveClass(/pane-fullscreen/);
  await page.keyboard.press('Escape');
  await page.getByLabel('Number of drones',{exact:true}).selectOption('1');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab.ready&&!lab.compiling&&lab.runtime.vehicleCount===1;}),{timeout:90_000}).toBe(true);
  await expect(page.getByLabel('Controlled and followed drone')).toBeHidden();
});
