import {expect,test} from '@playwright/test';
import {openEconomicalPropagation} from './reference-project';

test('free camera keys move the actual worker view while simulation is paused and leave editing alone',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await openEconomicalPropagation(page,true);
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.ready&&lab.compiling===false;}),{timeout:90000}).toBe(true);
  await page.evaluate(()=>{const lab=(window as any).__slamLab;lab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Keyboard control',{exact:true}).selectOption('viewer');
  await page.getByLabel('Camera view',{exact:true}).selectOption('free');
  await expect(page.getByLabel('Camera view',{exact:true})).toHaveValue('free');
  await page.evaluate(()=>{
    const lab=(window as any).__slamLab,viewer=lab.viewer;
    if(!viewer)throw new Error('Dedicated viewer required');
    const send=viewer.worker.postMessage.bind(viewer.worker);
    (window as any).__cameraMessages=[];
    viewer.worker.postMessage=(data:any,transfer?:any)=>{if(data.type==='camera')(window as any).__cameraMessages.push(structuredClone(data));send(data,transfer??[]);};
  });
  const state=()=>page.evaluate(()=>{
    const lab=(window as any).__slamLab,w=lab.runtime.world;
    return {position:w.view.position.toArray(),quaternion:w.view.quaternion.toArray(),time:lab.runtime.time,sequence:lab.latest?.frame.sequence,truth:JSON.stringify(w.committedTruth),command:lab.runtime.command};
  });
  await page.locator('#world').click({position:{x:350,y:220}});
  const initial=await state();
  const before=await page.locator('#world').screenshot();
  for(const key of ['w','a','q','r']){
    const previous=await state();await page.keyboard.down(key);
    try{
      // Wait for the actual camera tick, rather than assuming CPU rendering
      // can complete a frame inside a fixed wall-clock sleep.
      await expect.poll(async()=>{
        const next=await state();
        if(key==='r')return next.position[1]-previous.position[1]>.5;
        return JSON.stringify(key==='q'?next.quaternion:next.position)!==JSON.stringify(key==='q'?previous.quaternion:previous.position);
      },{timeout:15000}).toBe(true);
    }finally{await page.keyboard.up(key);}
    const next=await state();
    if(key==='q')expect(next.quaternion).not.toEqual(previous.quaternion);
    else expect(next.position).not.toEqual(previous.position);
    if(key==='r')expect(next.position[1]-previous.position[1]).toBeGreaterThan(.5);
  }
  const moved=await state(),after=await page.locator('#world').screenshot();expect(after.equals(before)).toBe(false);
  expect(moved.time).toBe(initial.time);expect(moved.sequence).toBe(initial.sequence);expect(moved.truth).toBe(initial.truth);
  expect(moved.command).toEqual({forward:0,left:0,up:0,yaw:0});
  const posted=await page.evaluate(()=>(window as any).__cameraMessages.at(-1));
  expect(posted.position).toEqual(moved.position);expect(posted.quaternion).toEqual(moved.quaternion);
  await page.locator('#name').focus();await page.keyboard.type('wasdqerf');await page.waitForTimeout(160);
  expect((await state()).position).toEqual(moved.position);
  await page.locator('#world').click({position:{x:350,y:220}});await page.keyboard.down('w');await page.waitForTimeout(120);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('w');
  await page.waitForTimeout(100);const stopped=await state();await page.waitForTimeout(200);expect((await state()).position).toEqual(stopped.position);
  await page.screenshot({path:'test-results/main-street-camera.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('follow view defaults, V cycling and manual flight toggle stay in sync',async({page})=>{
  await openEconomicalPropagation(page,true);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await expect(page.getByRole('button',{name:'Manual flight',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  const view=page.getByLabel('Camera view',{exact:true});
  await expect(view).toHaveValue('follow');
  await expect(page.getByLabel('Flight tour route')).toBeDisabled();
  await page.locator('#world').focus();
  for(const mode of ['orbit-follow','chase','side','overhead','free','follow']){
    await page.keyboard.press('v');await expect(view).toHaveValue(mode);
  }
  await page.locator('#name').focus();await page.keyboard.type('vv');await expect(view).toHaveValue('follow');
  await view.selectOption('overhead');
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.world.viewerCamera.mode)).toBe('overhead');
  await page.getByRole('button',{name:'Manual flight',exact:true}).click();
  await expect(page.locator('#flight-control')).toHaveText('Flight tour');
  await expect(page.getByLabel('Flight tour route')).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.autopilot)).toBe(true);
  await page.locator('#world').focus();await page.keyboard.down('w');
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.command.forward)).toBe(0);
  await page.keyboard.up('w');
  await page.locator('#flight-control').click();
  await page.locator('#world').focus();await page.keyboard.down('w');
  expect(await page.evaluate(()=>(window as any).__slamLab.runtime.command.forward)).toBe(1.6);
  await page.keyboard.up('w');
});

test('free-orbit follow accepts drag and wheel while preserving vehicle-relative view through translation and yaw',async({page})=>{
  await openEconomicalPropagation(page,true);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await page.getByRole('tab',{name:'Configuration',exact:true}).click();
  await page.getByLabel('Camera view',{exact:true}).selectOption('orbit-follow');
  const state=()=>page.evaluate(()=>{
    const lab=(window as any).__slamLab,w=lab.runtime.world;
    return {eye:w.view.position.toArray(),target:w.controls.target.toArray(),
      offset:w.view.position.clone().sub(w.controls.target).toArray(),distance:w.view.position.distanceTo(w.controls.target),
      time:lab.runtime.time,truth:JSON.stringify(w.committedTruth),command:lab.runtime.command,
      enabled:w.controls.enabled,pan:w.controls.enablePan};
  });
  const initial=await state();expect(initial.enabled).toBe(true);expect(initial.pan).toBe(false);
  const box=(await page.locator('#world').boundingBox())!;
  await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.5+100,box.y+box.height*.5+30,{steps:8});await page.mouse.up();
  await expect.poll(async()=>JSON.stringify((await state()).offset)!==JSON.stringify(initial.offset)).toBe(true);
  const orbited=await state();await page.mouse.wheel(0,-400);
  await expect.poll(async()=>(await state()).distance).toBeLessThan(orbited.distance*.9);
  // Settle ordinary orbit damping before introducing a synthetic presentation
  // pose. This does not step the plant or make a flight/SLAM claim.
  await page.evaluate(()=>{const w=(window as any).__slamLab.runtime.world;w.controls.enableDamping=false;w.controls.update();});
  const selected=await state();
  expect(selected.time).toBe(initial.time);expect(selected.truth).toBe(initial.truth);expect(selected.command).toEqual(initial.command);
  await page.evaluate(()=>{
    const w=(window as any).__slamLab.runtime.world,t=w.committedTruth;
    w.update({...t,x:t.x+6,z:t.z+3,quaternion:[Math.SQRT1_2,0,0,Math.SQRT1_2]});
  });
  await expect.poll(async()=>(await state()).target[0]).toBeCloseTo(initial.target[0]+6,8);
  const moved=await state();
  for(let i=0;i<3;i++)expect(moved.offset[i]).toBeCloseTo(selected.offset[i],8);
  expect(moved.distance).toBeCloseTo(selected.distance,8);expect(moved.time).toBe(initial.time);
  await page.screenshot({path:'test-results/orbit-follow-camera.png',fullPage:true});
});
