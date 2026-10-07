import {expect,test} from '@playwright/test';

test('free camera keys move the actual worker view while simulation is paused and leave editing alone',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>{const lab=(window as any).__slamLab;return lab?.ready&&lab.compiling===false;}),{timeout:90000}).toBe(true);
  await page.evaluate(()=>{const lab=(window as any).__slamLab;lab.runtime.pause();});
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
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
    const previous=await state();await page.keyboard.down(key);await page.waitForTimeout(320);await page.keyboard.up(key);
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
