/// <reference lib="webworker" />
import {World,D435} from './world';
import {SOFTWARE_CAMERA,type SensorProfileSelection} from './camera-profile';
import type {Calibration,Environment,SceneDetail,Truth} from './types';
import type {LidarScan,LidarTimings} from './lidar';
import type {DepthCloud} from './depth-cloud';
import type {DepthCloudRaster} from './depth-cloud-raster';
import type {GraphicsInfo} from './graphics-info';
import type {DaylightMode} from './world-lighting';
import {validateActorMotionFrame,type ActorMotionFrame} from './modelica-actor-motion';
import {GpuSensorProfiler,type GpuSensorProfile} from './gpu-sensor-profiler';
import type {DepthNoiseSettings} from './gpu-depth-noise';
import type {CameraImageLayout} from './gpu-realsense-packing';

export interface SensorRenderSettings {
  environment?:Environment;
  detail?:SceneDetail;
  carsEnabled?:boolean;
  peopleEnabled?:boolean;
  environmentVisible?:boolean;
  lightingMode?:DaylightMode;
  readbackMode?:'async'|'sync';
  depthCloudEnabled?:boolean;
  geometryBatching?:boolean;
  packedReadback?:boolean;
  skeletonSharing?:boolean;
  depthNoise?:DepthNoiseSettings;
}
export interface SensorRenderResult {
  rgb:Uint8Array;
  depth:Float32Array|Uint16Array;
  imageLayout?:CameraImageLayout;
  depthEncoding?:Calibration['depthEncoding'];
  depthCloud?:DepthCloud;
  depthRaster?:DepthCloudRaster;
  scan?:LidarScan;
  cameraTimings?:World['captureTimings'];
  lidarTimings?:LidarTimings;
  graphics:GraphicsInfo;
  gpuProfile?:GpuSensorProfile;
}
type Message=SensorRenderSettings&{id:number;type:string;base?:string;truth?:Truth;actorMotion?:ActorMotionFrame;lidarEnabled?:boolean;profileGpu?:boolean;sensorProfile?:SensorProfileSelection;denseCloudReadback?:boolean};
const scope=self as unknown as DedicatedWorkerGlobalScope;
const maximumPending=8;
let world:World|undefined;
let settings:Required<Omit<SensorRenderSettings,'depthNoise'>>&Pick<SensorRenderSettings,'depthNoise'>={environment:'city',detail:'high',carsEnabled:true,peopleEnabled:true,environmentVisible:true,lightingMode:'day',readbackMode:'async',depthCloudEnabled:false,geometryBatching:true,packedReadback:true,skeletonSharing:true};

async function configure(message:SensorRenderSettings) {
  if(!world)throw new Error('Sensor renderer is not initialized');
  const candidate={...settings};
  if(message.depthNoise!==undefined){await world.setDepthNoise(message.depthNoise);candidate.depthNoise={...message.depthNoise};}
  if(message.environment!==undefined){
    if(!['city','warehouse','courtyard','tokyo','asset-city','big-city'].includes(message.environment))throw new Error('Unknown sensor environment');
    candidate.environment=message.environment;
  }
  if(message.detail!==undefined){
    if(!['low','medium','high'].includes(message.detail))throw new Error('Unknown sensor scene detail');
    candidate.detail=message.detail;
  }
  if(message.lightingMode!==undefined){
    if(!['day','night','cycle'].includes(message.lightingMode))throw new Error('Unknown sensor lighting mode');
    candidate.lightingMode=message.lightingMode;
  }
  if(message.readbackMode!==undefined){
    if(!['async','sync'].includes(message.readbackMode))throw new Error('Unknown sensor readback mode');
    candidate.readbackMode=message.readbackMode;
  }
  for(const key of ['carsEnabled','peopleEnabled','environmentVisible','depthCloudEnabled'] as const)if(message[key]!==undefined){
    if(typeof message[key]!=='boolean')throw new Error(`Sensor ${key} must be boolean`);
    candidate[key]=message[key];
  }
  if(message.packedReadback!==undefined){
    if(typeof message.packedReadback!=='boolean')throw new Error('Packed sensor readback must be boolean');
    candidate.packedReadback=message.packedReadback;
    await world.setSensorPackedReadback(candidate.packedReadback);
  }
  if(message.geometryBatching!==undefined){
    if(typeof message.geometryBatching!=='boolean')throw new Error('Sensor geometry batching must be boolean');
    candidate.geometryBatching=message.geometryBatching;
    await world.setSensorGeometryBatching(candidate.geometryBatching);
  }
  if(message.skeletonSharing!==undefined){
    if(typeof message.skeletonSharing!=='boolean')throw new Error('Actor skeleton sharing must be boolean');
    candidate.skeletonSharing=message.skeletonSharing;
    world.actors.setSkeletonSharing(candidate.skeletonSharing);
  }
  if(candidate.environment!==settings.environment||candidate.detail!==settings.detail)world.build(candidate.environment,candidate.detail);
  world.actors.setEnabled(candidate.carsEnabled,candidate.peopleEnabled);
  world.setEnvironmentVisible(candidate.environmentVisible);
  world.setLighting(candidate.lightingMode);
  world.setDepthCloudEnabled(candidate.depthCloudEnabled);
  await world.ready;
  settings=candidate;
  return {graphics:world.graphics,settings:{...settings}};
}

async function execute(message:Message):Promise<SensorRenderResult|unknown> {
  if(message.type==='init'){
    if(world)throw new Error('Sensor renderer is already initialized; use configure');
    if(typeof message.base!=='string')throw new Error('Sensor renderer requires a site base URL');
    const base=new URL(message.base,scope.location.href).href;
    const camera=message.sensorProfile==='software'?SOFTWARE_CAMERA:D435;
    world=new World({canvas:new OffscreenCanvas(camera.width,camera.height),width:camera.width,height:camera.height,pixelRatio:1,base,sensorProfile:message.sensorProfile});
    // Direct reads avoid PBO copy/fence overhead on the measured hardware
    // driver. Blocking stays in this dedicated worker; software/unknown
    // drivers retain pooled asynchronous reads. Configure can override this
    // implementation choice for matched profiling, never the sensor clocks.
    settings.readbackMode=world.graphics.acceleration==='hardware-reported'?'sync':'async';
    return configure(message);
  }
  if(message.type==='configure')return configure(message);
  if(!['capture','capture-lidar'].includes(message.type))throw new Error(`Unknown sensor worker request: ${message.type}`);
  if(!world)throw new Error('Sensor renderer is not initialized');
  const truth=message.truth;
  if(!truth||![truth.time,truth.x,truth.y,truth.z].every(Number.isFinite)||truth.time<0||truth.quaternion?.length!==4||!truth.quaternion.every(Number.isFinite)||truth.quaternion.reduce((sum,value)=>sum+value*value,0)<=0)throw new Error('Sensor capture requires a finite pose and nonnegative simulation time');
  if(message.actorMotion){
    if(message.actorMotion.time!==truth.time)throw new Error('Actor motion and camera must share the committed simulation time');
    validateActorMotionFrame(message.actorMotion);
  }
  await world.ready;
  world.update(truth);
  if(message.actorMotion)world.setActorMotion(message.actorMotion);
  if(message.profileGpu!==undefined&&typeof message.profileGpu!=='boolean')throw new Error('GPU profiling must be boolean');
  const profiler=message.profileGpu?new GpuSensorProfiler(world):undefined;
  try{
  if(message.type==='capture-lidar'){
    const scan=await world.captureLidar(truth.time,false,settings.readbackMode);
    return {scan,lidarTimings:world.lidar.timings?{...world.lidar.timings}:undefined,graphics:world.graphics,gpuProfile:profiler?await profiler.finish():undefined};
  }
  // RGB, depth, optional cloud and LiDAR share one readback batch. Every pass
  // restores scene state before the wait; processing still holds simulation.
  if(message.denseCloudReadback!==undefined&&typeof message.denseCloudReadback!=='boolean')throw Error('Dense cloud readback must be boolean');
  const [camera,scan]=await world.captureSensorPair(!!message.lidarEnabled,settings.readbackMode,false,true,message.denseCloudReadback??false);
  return {rgb:camera.rgb,depth:camera.depth,...('imageLayout' in camera?{imageLayout:camera.imageLayout}:{depthEncoding:camera.depthEncoding}),...(camera.depthCloud?{depthCloud:camera.depthCloud}:{}),...('depthRaster' in camera&&camera.depthRaster?{depthRaster:camera.depthRaster}:{}),...(scan?{scan}:{}),cameraTimings:world.captureTimings?{...world.captureTimings}:undefined,
    lidarTimings:scan&&world.lidar.timings?{...world.lidar.timings}:undefined,graphics:world.graphics,gpuProfile:profiler?await profiler.finish():undefined} satisfies SensorRenderResult;
  }finally{profiler?.dispose();}
}

function transfers(result:unknown):ArrayBuffer[] {
  if(!result||typeof result!=='object'||!('rgb' in result||'scan' in result))return [];
  const data=result as SensorRenderResult;
  const arrays=[data.rgb,data.depth,data.depthCloud?.samples,data.scan?.samples];
  return [...new Set(arrays.filter((array):array is Uint8Array|Float32Array|Uint16Array=>!!array).map(array=>array.buffer).filter((buffer):buffer is ArrayBuffer=>buffer instanceof ArrayBuffer))];
}

let queue=Promise.resolve(),pending=0;
scope.onmessage=({data}:{data:Message})=>{
  if(pending>=maximumPending){scope.postMessage({id:data.id,error:'Sensor worker queue is full; await the current lockstep request'});return;}
  pending++;
  const received=performance.now();
  const handle=async()=>{
    const started=performance.now();
    try{
      const result=await execute(data);
      scope.postMessage({id:data.id,result,timings:{queueMs:started-received,workerMs:performance.now()-started}},transfers(result));
    }catch(error){scope.postMessage({id:data.id,error:String(error),timings:{queueMs:started-received,workerMs:performance.now()-started}});}
    finally{pending--;}
  };
  // A failed postMessage must not poison later requests either.
  queue=queue.then(handle,handle);
};
