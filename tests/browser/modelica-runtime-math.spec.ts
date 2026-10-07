import {openExperimentFile} from './source-files';
import {test,expect} from '@playwright/test';
import {openModelicaPropagation} from './reference-project';

test('sensor and evaluation Modelica edits run in workers, persist, and preserve replay timing and origin',async({page})=>{
 await page.goto('/');await openModelicaPropagation(page);
 await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
 const baseline=await page.evaluate(async()=>{
  const lab=(window as any).__slamLab,r=lab.runtime;
  const onFrame=r.onFrame;r.onFrame=(...args:any[])=>{(window as any).__mathMetrics=args[3];onFrame(...args);};
  const sensor=r.world.sensorRpc,original=sensor.call.bind(sensor);let acquisition:any;
  sensor.call=async(type:string,args:any,timeout:any)=>{if(type==='capture')acquisition=structuredClone(args);return original(type,args,timeout);};
  const viewer=lab.viewer,actorMotion=viewer.actorMotion.bind(viewer);let displayed:any;
  viewer.actorMotion=(frame:any)=>{displayed=structuredClone(frame);actorMotion(frame);};
  try{
   await r.compile(lab.project);await r.step();
   return {frame:lab.latest.frame,truth:lab.latest.truth,metrics:(window as any).__mathMetrics,actors:r.world.actorMotion,acquisition,displayed,
    actorPositions:r.world.actors.group.children.map((actor:any)=>actor.position.toArray())};
  }finally{sensor.call=original;viewer.actorMotion=actorMotion;}
 });
 expect(baseline.actors.time).toBe(baseline.frame.time);expect(baseline.acquisition.actorMotion).toEqual(baseline.actors);expect(baseline.acquisition.truth.time).toBe(baseline.actors.time);
 expect(baseline.displayed).toEqual(baseline.actors);
 baseline.actorPositions.forEach((position:number[],i:number)=>expect(position).toEqual([baseline.actors.east[i],0,-baseline.actors.north[i]]));
 await openExperimentFile(page,'sensor');
 const sensor=await page.getByLabel('Modelica source').inputValue();
 expect(sensor).toContain('{0.015,-0.012,0.02}');
 expect(sensor).toContain('model ActorMotion');
 const editedSensor=sensor.replace('{0.015,-0.012,0.02}','{0.115,-0.012,0.02}').replace('{0.78,0.78,0.78,2.2,2.2,2.2}','{1.56,0.78,0.78,2.2,2.2,2.2}');
 await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),editedSensor);
 await openExperimentFile(page,'evaluation');
 const evaluation=await page.getByLabel('Modelica source').inputValue();
 expect(evaluation).toContain('currentError = sqrt(squaredDistance);');
 const editedEvaluation=evaluation.replace('currentError = sqrt(squaredDistance);','currentError = 2.0*sqrt(squaredDistance);');
 await page.evaluate(source=>(window as any).__slamLab.sourceEditor.editor.setValue(source),editedEvaluation);
 await page.getByRole('button',{name:'Apply & reset',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.ready),{timeout:90000}).toBe(true);
 const edited=await page.evaluate(async()=>{
  const lab=(window as any).__slamLab;await lab.runtime.step();
  return {frame:lab.latest.frame,truth:lab.latest.truth,estimate:lab.latest.estimate,origin:lab.runtime.evaluationOrigin,metrics:(window as any).__mathMetrics,project:lab.project,actors:lab.runtime.world.actorMotion};
 });
 expect(edited.truth).toEqual(baseline.truth);
 expect(edited.frame.imu.accel[0]-baseline.frame.imu.accel[0]).toBeCloseTo(.1,10);
 expect(edited.frame.imu.accel.slice(1)).toEqual(baseline.frame.imu.accel.slice(1));
 expect(edited.frame.imu.gyro).toEqual(baseline.frame.imu.gyro);
 expect(edited.frame.time).toBe(baseline.frame.time);expect(edited.frame.dt).toBe(baseline.frame.dt);
 expect(edited.project.sensorModelica).toBe(editedSensor);
 expect(edited.project.evaluationModelica).toBe(editedEvaluation);
 expect(edited.actors.distance[0]).toBeCloseTo(2*baseline.actors.distance[0],12);
 expect(edited.actors.east[0]-baseline.actors.east[0]).toBeCloseTo(.78*edited.frame.time,12);
 for(const field of ['east','north','sceneYaw','distance','walkTime'])expect(edited.actors[field].slice(1)).toEqual(baseline.actors[field].slice(1));
 const expectedError=Math.hypot(edited.estimate.x-(edited.truth.x-edited.origin.x),edited.estimate.y-(edited.truth.y-edited.origin.y),edited.estimate.z-(edited.truth.z-edited.origin.z));
 expect(expectedError).toBeGreaterThan(0);
 expect(edited.metrics.currentError).toBeCloseTo(2*expectedError,12);
 expect(edited.metrics.ate).toBeCloseTo(expectedError,12);
 await page.getByRole('button',{name:'Save project',exact:true}).click();
 await expect(page.locator('#saved')).toHaveText('Saved locally');
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab?.ready),{timeout:90000}).toBe(true);
 await page.evaluate(()=>(window as any).__slamLab.runtime.pause());
 await expect.poll(()=>page.evaluate(()=>(window as any).__slamLab.runtime.busy)).toBe(false);
 expect(await page.evaluate(()=>(window as any).__slamLab.project.sensorModelica)).toBe(editedSensor);
 expect(await page.evaluate(()=>(window as any).__slamLab.project.evaluationModelica)).toBe(editedEvaluation);
 const replay=await page.evaluate(async record=>{
  const lab=(window as any).__slamLab,r=lab.runtime;
  const onFrame=r.onFrame;let metrics:any;r.onFrame=(...args:any[])=>{metrics=args[3];onFrame(...args);};
  const frame={...record.frame,rgb:new Uint8Array(Object.values(record.frame.rgb)),depth:record.frame.imageLayout?new Uint16Array(Object.values(record.frame.depth)):new Float32Array(Object.values(record.frame.depth))};
  const origin={x:record.truth.x+2,y:record.truth.y-3,z:record.truth.z+1,quaternion:[Math.cos(.3),0,0,Math.sin(.3)]};
  await r.loadReplay([{frame,truth:record.truth}],origin);await r.step();
  return {reference:r.referenceTruth(record.truth),frame:lab.latest.frame,metrics,origin,estimate:lab.latest.estimate,actors:r.world.actorMotion};
 },baseline);
 expect(replay.frame.time).toBe(baseline.frame.time);
 expect(replay.frame.imu).toEqual(baseline.frame.imu);
 expect(replay.actors).toEqual(edited.actors);
 const c=Math.cos(.6),s=Math.sin(.6);
 expect(replay.reference.x).toBeCloseTo(-2*c+3*s,10);
 expect(replay.reference.y).toBeCloseTo(2*s+3*c,10);
 expect(replay.reference.z).toBeCloseTo(-1,10);
 const error=Math.hypot(replay.estimate.x-replay.reference.x,replay.estimate.y-replay.reference.y,replay.estimate.z-replay.reference.z);
 expect(replay.metrics.currentError).toBeCloseTo(2*error,10);
 expect(replay.metrics.ate).toBeCloseTo(error,10);
});
