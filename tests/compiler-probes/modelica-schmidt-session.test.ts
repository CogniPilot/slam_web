import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ModelicaSchmidtSession,schmidtStateFields,type SchmidtInitialState,type SchmidtFrame,type SchmidtSnapshot} from '../../src/modelica-schmidt-session';
import type {NativeProgram,NativeProgramArtifact} from '../../src/modelica-native-program';
const archive='dev/artifacts/schmidt-reference-transaction/';
const artifact=JSON.parse(readFileSync(archive+'native.json','utf8')) as NativeProgramArtifact;
const source=readFileSync(archive+'source.mo','utf8');
type Case={label:string;inputs:Record<string,number[]>;expected:Record<string,{values:number[];tolerance:number}>};
const cases=JSON.parse(readFileSync(archive+'fixtures.json','utf8')).groups.ES15SchmidtReferenceStep as Case[];
function initial(index:number,time=0):SchmidtInitialState {
 const x=cases[index].inputs,config=cases[16].inputs;
 return {position:x.position,velocity:x.velocity,rotation:x.rotation,accelBias:x.accelBias,gyroBias:x.gyroBias,covariance:x.covariance,crossCovariance:x.crossCovariance,referenceCovariance:x.referenceCovariance,referencePosition:x.referencePosition,referenceRotation:x.referenceRotation,referenceAvailable:x.referenceAvailable,referenceEpoch:x.referenceEpoch,referenceUsed:x.referenceUsed,lastUsedEpoch:x.lastUsedEpoch,time,
  gravity:x.gravity,density:x.density,opticalToBody:config.opticalToBody,cameraOriginBody:config.cameraOriginBody} as SchmidtInitialState;
}
function frame(index:number,time:number):SchmidtFrame {
 const x=cases[index].inputs;return {time,dt:x.h[0],imu:{accel:x.accel,gyro:x.gyro},currentEpoch:x.currentEpoch[0],captureRequested:x.captureRequested[0]===1,
  observation:x.measurementEnabled[0]===1?{rotation:x.measuredRotation??[1,0,0,0,1,0,0,0,1],translation:x.measuredTranslation??[0,0,0],covariance:x.relativeCovariance??Array.from({length:36},(_,i)=>i%7===0?1:0)}:undefined};
}
function compare(value:SchmidtSnapshot,index:number){for(const [name,expected]of Object.entries(cases[index].expected)){
 const key=name.startsWith('next')?name[4].toLowerCase()+name.slice(5):name;
 const actual=name.startsWith('next')?value[key as keyof typeof schmidtStateFields]:[value.flags[key as keyof typeof value.flags]];
 expect(actual.length,`${index}/${name}`).toBe(expected.values.length);
 for(let i=0;i<actual.length;i++)expect(Math.abs(actual[i]-expected.values[i]),`${index}/${name}/${i}`).toBeLessThanOrEqual(expected.tolerance);
}}
const internals=(s:ModelicaSchmidtSession)=>(s as unknown as {program:NativeProgram}).program;
it('carries complete actual21 state through independent20 transaction fixtures, forks and source-bound JSON restore',async()=>{
 const zero=await ModelicaSchmidtSession.create(artifact,source,initial(0)),before=zero.snapshot();
 expect(()=>zero.advance(frame(0,0))).toThrow('Noncontiguous');expect(zero.snapshot()).toEqual(before);
 const missing=await ModelicaSchmidtSession.create(artifact,source,initial(1));compare(missing.advance(frame(1,1/90)),1);
 let session=await ModelicaSchmidtSession.create(artifact,source,initial(2));compare(session.advance(frame(2,1/90)),2);
 let checkpoint:SchmidtSnapshot|undefined,corrected:SchmidtSnapshot|undefined,resetBaseline=session.snapshot();
 for(let index=3;index<20;index++){
  if(index>=15&&index<=18)session.restore(checkpoint!);if(index===19)session.restore(corrected!);
  const t=session.snapshot().time+1/90;
  const result=session.advance(frame(index,t));compare(result,index);
  expect(result.covariance).toHaveLength(225);expect(result.crossCovariance).toHaveLength(90);expect(result.referenceCovariance).toHaveLength(36);
  if(index===8){const saved=JSON.parse(JSON.stringify(session.snapshot()));session=await ModelicaSchmidtSession.create(artifact,source,saved);expect(session.snapshot()).toEqual(saved);resetBaseline=saved;}
  if(index===14)checkpoint=session.snapshot();if(index===16)corrected=session.snapshot();
 }
 const final=session.snapshot(),reloaded=await ModelicaSchmidtSession.create(artifact,source,JSON.parse(JSON.stringify(final)));expect(reloaded.snapshot()).toEqual(final);
 const copy=reloaded.snapshot();copy.covariance[0]=-1;copy.density[0]=-1;copy.flags.predictionAccepted=0;expect(reloaded.snapshot()).toEqual(final);
 expect(()=>session.restore({...final,sourceSha256:'0'.repeat(64)})).toThrow('source/schema');expect(session.snapshot()).toEqual(final);
 const wrongConfig=structuredClone(final);wrongConfig.density[0]*=2;expect(()=>session.restore(wrongConfig)).toThrow('calibration/config');expect(session.snapshot()).toEqual(final);
 await expect(ModelicaSchmidtSession.create(artifact,source+'\n// stale',final)).rejects.toThrow('does not match its source');
 expect(session.reset()).toEqual(resetBaseline);
 compare(session.advance(frame(9,resetBaseline.time+1/90)),9);
});
it('consumes measured intervals only and applies observation/capture once at final interval with readonly inputs',async()=>{
 const session=await ModelicaSchmidtSession.create(artifact,source,initial(2)),program=internals(session);
 const original=program.evaluate.bind(program),calls:{h:number;measurement:number;capture:number}[]=[];
 vi.spyOn(program,'evaluate').mockImplementation(time=>{
  calls.push({h:program.input('h')[0],measurement:program.input('measurementEnabled')[0],capture:program.input('captureRequested')[0]});
  const before=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();original(time);
  expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(before);
 });
 const f=frame(2,2/90);f.dt=2/90;f.imuIntervals=[{time:1/90,dt:1/90,imu:f.imu},{time:2/90,dt:1/90,imu:f.imu}];
 const result=session.advance(f);expect(result.steps).toBe(2);expect(calls).toEqual([{h:1/90,measurement:0,capture:0},{h:1/90,measurement:1,capture:1}]);
 expect(result.referenceEpoch).toEqual([0]);expect(result.flags.captureAccepted).toBe(1);
 const before=session.snapshot();expect(()=>session.advance({...frame(3,3/90),dt:.03})).toThrow();expect(session.snapshot()).toEqual(before);
 expect(()=>session.advance({...frame(3,4/90),dt:2/90,imuIntervals:undefined})).toThrow('interval');expect(session.snapshot()).toEqual(before);
});
it('rolls back full memory and retained state on a later injected execution failure, then recovers',async()=>{
 const session=await ModelicaSchmidtSession.create(artifact,source,initial(2)),p=internals(session),before=session.snapshot();
 const bytes=new Uint8Array(p.memory.buffer).slice(),evaluate=p.evaluate.bind(p);let count=0;
 const spy=vi.spyOn(p,'evaluate').mockImplementation(time=>{if(++count===2)throw new Error('injected transport/execution failure');evaluate(time);});
 const f=frame(2,2/90);f.dt=2/90;f.imuIntervals=[{time:1/90,dt:1/90,imu:f.imu},{time:2/90,dt:1/90,imu:f.imu}];
 expect(()=>session.advance(f)).toThrow('injected');expect(session.snapshot()).toEqual(before);expect(new Uint8Array(p.memory.buffer)).toEqual(bytes);spy.mockRestore();session.restore(JSON.parse(JSON.stringify(before)));
 compare(session.advance(frame(2,1/90)),2);
 const invalid=initial(2),badCovariance=Array.from(invalid.covariance);badCovariance[0]=-1;invalid.covariance=badCovariance;
 const rejected=await ModelicaSchmidtSession.create(artifact,source,invalid),saved=rejected.snapshot();
 expect(()=>rejected.advance(frame(2,1/90))).toThrow('rejected prediction');expect(rejected.snapshot()).toEqual(saved);rejected.restore(before);compare(rejected.advance(frame(2,1/90)),2);
});

it('keeps private configuration isolated and refuses changed native memory without changing retained state',async()=>{
 const input=initial(2);input.gravity=Array.from(input.gravity);const session=await ModelicaSchmidtSession.create(artifact,source,input),before=session.snapshot();
 (input.gravity as number[])[0]=123;expect(session.snapshot()).toEqual(before);
 const program=internals(session);program.memory.grow(0);
 expect(()=>session.advance(frame(2,1/90))).toThrow('memory buffer changed');expect(session.snapshot()).toEqual(before);
});
it('restores a saved state after a later-interval failure following an already committed capture',async()=>{
 const session=await ModelicaSchmidtSession.create(artifact,source,initial(2));compare(session.advance(frame(2,1/90)),2);
 const before=JSON.parse(JSON.stringify(session.snapshot())),p=internals(session),bytes=new Uint8Array(p.memory.buffer).slice(),evaluate=p.evaluate.bind(p);let calls=0;
 const spy=vi.spyOn(p,'evaluate').mockImplementation(time=>{if(++calls===2)throw new Error('later interval');evaluate(time);});
 const f=frame(3,3/90);f.dt=2/90;f.imuIntervals=[{time:2/90,dt:1/90,imu:f.imu},{time:3/90,dt:1/90,imu:f.imu}];
 expect(()=>session.advance(f)).toThrow('later interval');expect(session.snapshot()).toEqual(before);expect(new Uint8Array(p.memory.buffer)).toEqual(bytes);
 spy.mockRestore();session.restore(before);compare(session.advance(frame(3,2/90)),3);
});
