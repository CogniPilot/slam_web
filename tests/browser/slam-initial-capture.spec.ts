import {expect,test} from '@playwright/test';
import {build} from 'esbuild';
import {openEconomicalPropagation} from './reference-project';

test('time-zero RGB-D initialization holds physics and leaves the first scheduled camera/IMU tick intact',async({page},testInfo)=>{
  await openEconomicalPropagation(page,true);
  await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
  await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
  const bundle=await build({stdin:{contents:"export {slamInitialFrameFromSensor,slamIntervalFrameFromSensor} from './src/modelica-slam-frame';",
    resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'slamInputs',logLevel:'silent'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const result=await page.evaluate(async()=>{
    const lab=(window as any).__slamLab,r=lab.runtime,inputs=(window as any).slamInputs;
    const error=async(action:()=>Promise<unknown>)=>{try{await action();return null;}catch(e){return String(e);}};
    const digest=async(view:Uint8Array|Uint16Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',view as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
    await r.compile(lab.project);r.recording=true;
    const before=await r.physics.call('snapshot'),capture=r.world.captureSensors.bind(r.world);
    let failedCapture:string|null;
    r.world.captureSensors=async()=>{throw Error('initial capture fixture fault');};
    try{failedCapture=await error(()=>r.captureInitialFrame());}finally{r.world.captureSensors=capture;}
    const afterFault={busy:r.busy,time:r.time,cameraSequence:r.cameraSequence,records:r.records.length};
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    r.world.captureSensors=async(...args:unknown[])=>{await hold;return capture(...args);};
    const pending=r.captureInitialFrame();
    let guards:Record<string,unknown>;
    try{
      guards={busy:r.busy,step:await error(()=>r.step()),compile:await error(()=>r.compile(lab.project)),
        capture:await error(()=>r.captureInitialFrame())};
      await new Promise(requestAnimationFrame);
    }finally{release();r.world.captureSensors=capture;}
    const initial=await pending,prepared=inputs.slamInitialFrameFromSensor(initial);
    const after=await r.physics.call('snapshot');
    const initialization={time:initial.time,dt:initial.dt,sequence:initial.sequence,intervals:initial.imuIntervals,
      rgb:await digest(initial.rgb),depth:await digest(initial.depth),layout:initial.imageLayout,
      borrowed:prepared.rgb===initial.rgb&&prepared.depth===initial.depth,
      imuPreserved:JSON.stringify(prepared.imu)===JSON.stringify(initial.imu),
      fields:Object.keys(prepared).sort(),records:r.records.length,frames:r.sequence};
    const repeated=await error(()=>r.captureInitialFrame());
    await r.step();r.recording=false;
    const frame=lab.latest.frame,advanced=inputs.slamIntervalFrameFromSensor(frame);
    const first={time:frame.time,dt:frame.dt,sequence:frame.sequence,intervals:advanced.intervals,
      frames:r.sequence,records:r.records.length,backend:lab.latest.estimate.diagnostics.backend};
    const afterAdvance=await error(()=>r.captureInitialFrame());
    await r.compile(lab.project);
    const reset=await r.captureInitialFrame();
    return {graphics:r.world.graphics,failedCapture,afterFault,guards,physicsUnchanged:JSON.stringify(before)===JSON.stringify(after),
      initialization,repeated,first,afterAdvance,
      reset:{time:reset.time,dt:reset.dt,sequence:reset.sequence,rgb:await digest(reset.rgb),depth:await digest(reset.depth)},
      scope:'Camera initialization/lockstep transport with real Rumoca physics and INS; not full SLAM execution.'};
  });
  await testInfo.attach('slam-initial-capture.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.failedCapture).toContain('fixture fault');expect(result.afterFault).toEqual({busy:false,time:0,cameraSequence:0,records:0});
  expect(result.guards.busy).toBe(true);expect(result.guards.step).toContain('already executing');
  expect(result.guards.compile).toContain('Wait');expect(result.guards.capture).toContain('fresh time-zero');
  expect(result.physicsUnchanged).toBe(true);
  expect(result.initialization).toMatchObject({time:0,dt:0,sequence:0,intervals:[],borrowed:true,imuPreserved:true,records:0,frames:0});
  for(const name of ['truth','capture','depthCloud','points','intervals'])expect(result.initialization.fields).not.toContain(name);
  expect(result.repeated).toContain('fresh time-zero');expect(result.afterAdvance).toContain('fresh time-zero');
  expect(result.first).toMatchObject({time:1/30,dt:1/30,sequence:1,frames:1,records:1,backend:'Rumoca Solve IR session'});
  expect(result.first.intervals).toHaveLength(6);expect(result.first.intervals[0].time).toBe(1/180);
  expect(result.first.intervals.reduce((sum:number,i:any)=>sum+i.dt,0)).toBeCloseTo(1/30,12);
  expect(result.reset).toEqual({time:0,dt:0,sequence:0,rgb:result.initialization.rgb,depth:result.initialization.depth});
  expect(result.graphics.acceleration).toBe('hardware-reported');
});
