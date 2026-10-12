import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {readExport} from '../scripts/slam-native-manifest.mjs';
import {ModelicaSlamSession} from '../src/modelica-slam-session';
import {slamInitialFrameFromSensor,slamIntervalFrameFromSensor} from '../src/modelica-slam-frame';
import type {SlamNativeManifest} from '../src/slam-native-program';
import type {InitialSensorFrame,SensorFrame} from '../src/types';

// Actual compiler-exported programs on actual captured D435 frames. Both come
// from local deliveries, so the check runs only where they exist.
// Opt in explicitly: the real programs take minutes per frame in V8.
const exportsRoot=process.env.SLAM_NATIVE_EXPORTS??'';
const flight=process.env.SLAM_NATIVE_FLIGHT??'dev/artifacts/modelica-rendered-flight-frames/flight-FOUpJK';
const available=!!exportsRoot&&existsSync(join(exportsRoot,'init-named/layout.json'))&&existsSync(join(exportsRoot,'step-named/layout.json'))&&existsSync(join(flight,'manifest.json'));

describe.skipIf(!available)('native SLAM programs on captured flight frames',()=>{
  it('initializes on the first image and steps each IMU interval of the following frames',async()=>{
    const capture=JSON.parse(readFileSync(join(flight,'manifest.json'),'utf8'));
    const oracle=JSON.parse(readFileSync(join(flight,'oracle-poses.json'),'utf8')).poses as {sequence:number;x:number;y:number;z:number;quaternion:number[]}[];
    const exported={initialize:await readExport('D435FastSLAMInitialize',join(exportsRoot,'init-named')),step:await readExport('D435FastSLAMStep',join(exportsRoot,'step-named'))};
    const store=new Map<string,Uint8Array>();
    const models:SlamNativeManifest['models']={} as never;
    for(const [key,{layout,files}] of Object.entries(exported)){
      const references:Record<string,{file:string;sha256:string;bytes:number;encoding:'identity'}>={};
      for(const [name,bytes] of Object.entries(files)){const file=`${key}/${name}`;store.set(file,bytes);references[name.replace(/\.(wasm|bin)$/,'')]={file,sha256:'',bytes:bytes.length,encoding:'identity'};}
      models[key]={...layout,files:references};
    }
    const manifest:SlamNativeManifest={schemaVersion:1,sourceSha256:'',models};
    const frame=(index:number):SensorFrame=>{
      const entry=capture.frames[index];
      const rgb=new Uint8Array(readFileSync(join(flight,entry.rgb.path)));
      const raw=readFileSync(join(flight,entry.depth.path));
      const depth=new Uint16Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
      return {sequence:entry.sequence,time:entry.time,dt:entry.dt,imu:entry.imu,imuIntervals:entry.imuIntervals.map((i:any)=>({time:i.time,dt:i.dt,imu:i.imu})),
        rgb,depth,imageLayout:entry.imageLayout,calibration:{...capture.calibration,depthEncoding:'axial-z16-le'}};
    };
    const first=frame(0);
    const initial:InitialSensorFrame={...first,dt:0,imuIntervals:[]};
    const log:string[]=[];
    const started=performance.now();
    const session=await ModelicaSlamSession.create(manifest,async file=>store.get(file)!,slamInitialFrameFromSensor(initial),text=>log.push(text));
    const initMs=performance.now()-started;
    const estimate0=session.initialEstimate;
    expect([estimate0.x,estimate0.y,estimate0.z].every(Number.isFinite)).toBe(true);
    const results=[];
    for(let index=1;index<=3;index++){
      const result=session.advance(slamIntervalFrameFromSensor(frame(index)));
      const truth=oracle.find(pose=>pose.sequence===index)!;
      // The estimator starts at the origin of its own frame; the oracle starts at the take-off pose.
      const origin=oracle[0];
      const error=Math.hypot(result.estimate.x-(truth.x-origin.x),result.estimate.y-(truth.y-origin.y),result.estimate.z-(truth.z-origin.z));
      results.push({sequence:index,intervals:result.stepMs.length,stepMs:result.stepMs.map(ms=>Math.round(ms)),position:[result.estimate.x,result.estimate.y,result.estimate.z],quaternion:result.estimate.quaternion,errorM:error,
        features:result.estimate.features?.length,points:result.estimate.points.length,status:result.status});
      expect(result.estimate.quaternion).toHaveLength(4);
      expect(Math.abs(Math.hypot(...result.estimate.quaternion)-1)).toBeLessThan(1e-6);
    }
    console.log(JSON.stringify({scope:'Actual Rumoca native_step exports on actual captured flight frames',initMs:Math.round(initMs),log,models:Object.fromEntries(Object.entries(manifest.models).map(([k,v])=>[k,{model:v.model,pages:v.pages,inputs:Object.keys(v.inputs),outputs:v.outputs.map(o=>o.name),namedOutputs:v.model_outputs.length,stateRuns:v.state_runs.length}])),results},null,1));
  },900_000);
});
