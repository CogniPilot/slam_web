import {D435_IMAGE} from "../../src/camera-profile";
import {openModelicaPropagation} from './reference-project';
import {test,expect} from '@playwright/test';

test('Native D435 cameras share lockstep timestamps while the dedicated viewer keeps rendering',async({page})=>{
  const packed=process.env.SLAM_TEST_PACKED_READBACK;
  if(packed!==undefined&&!['0','1'].includes(packed))throw Error('SLAM_TEST_PACKED_READBACK must be 0 or 1');
  const readback=process.env.SLAM_TEST_READBACK;
  if(readback!==undefined&&readback!=='sync'&&readback!=='async')throw Error('SLAM_TEST_READBACK must be sync or async');
  await page.goto('/');await openModelicaPropagation(page,packed===undefined?undefined:packed==='1',readback);
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.latest?.frame.sequence??-1),{timeout:90000}).toBeGreaterThan(1);
  await page.getByRole('button',{name:'Ⅱ Pause'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  await expect(page.getByLabel('Sensor source')).toHaveCount(0);
  await expect(page.getByLabel('Lockstep sensor rate')).toHaveCount(0);
  const result=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,r=lab.runtime,viewer=lab.viewer;
    if(!viewer)throw new Error('Expected dedicated viewer and sensor workers');
    const worker=r.modelicaState,original=worker.call.bind(worker),snapshots:any[]=[];
    viewer.onPerformance=(sample:any)=>snapshots.push(sample);
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>release=resolve);
    worker.call=async(type:string,args:any,timeout:any)=>{if(type==='step'&&args.kind==='slam')await gate;return original(type,args,timeout);};
    const beforeTime=r.time,pending=r.step();
    try{
      await new Promise(resolve=>setTimeout(resolve,150));
      const heldTime=r.time,second=await r.step().then(()=>'',(error:Error)=>error.message);
      await new Promise(resolve=>setTimeout(resolve,1200));
      const stillHeld=r.time;release();await pending;
      const frame=lab.latest.frame;
      // A real main-thread stall must not stop the worker's rendering loop.
      const start=performance.now();while(performance.now()-start<250){}
      await new Promise(resolve=>setTimeout(resolve,1100));
      return {beforeTime,heldTime,stillHeld,frameTime:frame.time,truthTime:lab.latest.truth.time,dt:frame.dt,
        rgb:frame.rgb.length,depth:frame.depth.length,second,snapshots,graphics:r.world.graphics,camera:r.world.captureTimings};
    }finally{release();await pending;worker.call=original;viewer.onPerformance=()=>{};}
  });
  expect(result.dt).toBe(1/30);expect(result.heldTime-result.beforeTime).toBeCloseTo(1/30,7);
  expect(result.stillHeld).toBe(result.heldTime);expect(result.frameTime).toBe(result.truthTime);
  expect(result.second).toContain('already executing');expect(result.rgb).toBe(D435_IMAGE.width*D435_IMAGE.height*3);expect(result.depth).toBe(D435_IMAGE.width*D435_IMAGE.height);
  expect(result.snapshots.length).toBeGreaterThanOrEqual(2);
  for(const sample of result.snapshots){expect(sample.renderedFrames).toBeGreaterThan(0);expect(sample.fps).toBeLessThanOrEqual(31.5);}
  // CI software rendering can miss30FPS; report rather than invent GPU speed.
  if(result.graphics.acceleration==='hardware-reported'){
    expect(result.snapshots.some((sample:any)=>sample.fps>=28)).toBe(true);
    expect(result.camera.method).toContain(readback==='async'?'pooled asynchronous':'synchronous');
  }
  console.log('LOCKSTEP WORKER DISPLAY',result);
});
