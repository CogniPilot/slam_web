import {beforeAll,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ModelicaLocalizationSession,type LocalizationFrame,type LocalizationSnapshot} from '../../src/modelica-localization-session';
import type {NativeProgram,NativeProgramArtifact} from '../../src/modelica-native-program';

// Explicit review gate only: no synthetic WASM, mocked numerical outputs or
// reduced-image acceptance. The producer must first issue the full source.
const directory=process.env.RUMOCA_LOCALIZATION_ARTIFACT_DIRECTORY;
let source:string,artifact:NativeProgramArtifact;
beforeAll(()=>{
  if(!directory)return;
  source=readFileSync(resolve(directory,'source.mo'),'utf8');artifact=JSON.parse(readFileSync(resolve(directory,'native.json'),'utf8'));
  expect(artifact.var_layout.shapes.rgb).toEqual([90,160,4]);
  expect(artifact.var_layout.shapes.depth).toEqual([90,160]);
  expect(artifact.var_layout.shapes.referenceDescriptor).toEqual([350,49]);
});
async function create(snapshot?:LocalizationSnapshot){return ModelicaLocalizationSession.create(artifact,source,snapshot??{time:0});}
function frame(snapshot:LocalizationSnapshot,sequence=0,n=1):LocalizationFrame {
  const initial=(name:string)=>{
    const index=artifact.var_layout.bindings[name].P!.index,count=artifact.var_layout.shapes[name]?.reduce((a,b)=>a*b,1)??1;
    return artifact.parameters.slice(index,index+count);
  };
  const h=1/180,imu={accel:initial('accel'),gyro:initial('gyro')};
  return {sequence,time:snapshot.time+n*h,dt:n*h,imu,
    imuIntervals:Array.from({length:n},(_,i)=>({time:snapshot.time+(i+1)*h,dt:h,imu:structuredClone(imu)})),
    rgb:new Uint8Array(90*160*4),depth:new Float32Array(90*160),captureRequested:true,
    calibration:{rgbCalibration:initial('rgbCalibration'),depthCalibration:initial('depthCalibration'),
      opticalToBody:initial('opticalToBody'),cameraOriginBody:initial('cameraOriginBody'),
      disparityNoise:initial('disparityNoise')[0],noiseReferenceFx:initial('noiseReferenceFx')[0],baseline:initial('baseline')[0]},
    ...(artifact.model_name==='RGBDInertialLocalizationStep'?{pixels:Array(350*2).fill(0),activeCount:0}:{})};
}
const internals=(session:ModelicaLocalizationSession)=>(session as unknown as {program:NativeProgram}).program;
it.skipIf(!directory)('executes full compiler-issued model with source initialization, invalid-image prediction and copied outputs',async()=>{
  const session=await create(),before=session.snapshot(),f=frame(before);
  const untouched=structuredClone(f),result=session.advance(f);
  expect(f).toEqual(untouched);expect(result.flags.predictionAccepted).toBe(1);
  expect(result.flags.captureAccepted).toBe(0);expect(result.flags.captureRejected).toBe(1);
  expect(result.snapshot.state.referenceEpoch).toEqual(before.state.referenceEpoch);
  expect(result.snapshot.state.referenceDescriptor).toEqual(before.state.referenceDescriptor);
  expect(result.snapshot.state.referencePixels).toEqual(before.state.referencePixels);
  expect(result.estimate.quaternion).toEqual([1,0,0,0]);
  for(const value of [...result.snapshot.state.position,...result.snapshot.state.velocity])expect(Math.abs(value)).toBeLessThan(1e-12);
  expect(result.estimate.points).toEqual([]);expect(result.estimate.features).toEqual([]);
  expect(result.estimate.confidence).toBe(0);expect(result.estimate.tracking!.matches).toEqual([]);
  expect(result.snapshot.state.covariance).toHaveLength(225);expect(result.snapshot.state.crossCovariance).toHaveLength(90);
  const saved=session.snapshot();result.snapshot.state.covariance[0]=999;result.estimate.quaternion[0]=999;
  expect(session.snapshot()).toEqual(saved);
  expect(session.reset()).toEqual(before);expect(session.advance(f).snapshot).toEqual(saved);
},120000);
it.skipIf(!directory)('keeps every measured interval and images/capture exclusively on final interval, with readonly P',async()=>{
  const session=await create(),program=internals(session),evaluate=program.evaluate.bind(program),calls:number[][]=[];
  const spy=vi.spyOn(program,'evaluate').mockImplementation(time=>{
    calls.push([time,program.input('h')[0],program.input('frameEnabled')[0],program.input('imageCaptureRequested')[0]]);
    const bytes=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();evaluate(time);
    expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(bytes);
  });
  const result=session.advance(frame(session.snapshot(),0,2));spy.mockRestore();
  expect(calls).toEqual([[1/180,1/180,0,0],[2/180,1/180,1,1]]);expect(result.snapshot.steps).toBe(2);
  const snapshot=session.snapshot(),reload=await create(JSON.parse(JSON.stringify(snapshot))),next=frame(snapshot,1);
  expect(reload.advance(next)).toEqual(session.advance(next));
  expect(()=>session.restore({...snapshot,sourceSha256:'0'.repeat(64)})).toThrow('source/model');
  await expect(ModelicaLocalizationSession.create(artifact,source+'\n// stale',snapshot)).rejects.toThrow('does not match its source');
},120000);
it.skipIf(!directory)('restores the entire actual native memory and reference state after a later fault, then recovers',async()=>{
  const session=await create(),program=internals(session),snapshot=session.snapshot();
  const bytes=new Uint8Array(program.memory.buffer).slice(),evaluate=program.evaluate.bind(program);let calls=0;
  // Execute the real first interval; fault injection tests transport atomicity,
  // while every successful numerical result still comes from the issued module.
  const spy=vi.spyOn(program,'evaluate').mockImplementation(time=>{evaluate(time);if(++calls===2)throw new Error('late transport fault');});
  const f=frame(snapshot,0,2);expect(()=>session.advance(f)).toThrow('late transport fault');
  expect(session.snapshot()).toEqual(snapshot);expect(new Uint8Array(program.memory.buffer)).toEqual(bytes);spy.mockRestore();
  const control=await create();expect(session.advance(f)).toEqual(control.advance(f));
},120000);
it.skipIf(!directory)('rejects malformed transport, repeated epochs, non-source initialization and mismatched layouts before mutation',async()=>{
  const session=await create(),snapshot=session.snapshot(),program=internals(session),bytes=new Uint8Array(program.memory.buffer).slice();
  const f=frame(snapshot),wrong=structuredClone(f);wrong.imuIntervals![0].dt=.03;
  expect(()=>session.advance(wrong)).toThrow('interval');
  expect(()=>session.advance({...f,rgb:f.rgb.subarray(4)})).toThrow('image layout');
  expect(()=>session.advance({...f,calibration:{...f.calibration,opticalToBody:[1]}})).toThrow('requires 9');
  expect(session.snapshot()).toEqual(snapshot);expect(new Uint8Array(program.memory.buffer)).toEqual(bytes);
  await expect(ModelicaLocalizationSession.create(artifact,source,{time:0,inputs:{truth:[1,2,3]}})).rejects.toThrow('Unsupported');
  session.advance(f);const committed=session.snapshot();expect(()=>session.advance(frame(committed,0))).toThrow('Noncontiguous');expect(session.snapshot()).toEqual(committed);
},120000);
