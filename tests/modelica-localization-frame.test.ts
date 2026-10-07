import {afterEach,expect,it,vi} from 'vitest';
import {localizationFrameFromSensor} from '../src/modelica-localization-frame';
import {ModelicaLocalizationClient} from '../src/modelica-localization-client';
import type {SensorFrame} from '../src/types';

function sensor():SensorFrame {
  return {sequence:350,time:12.5,dt:.02,
    calibration:{width:160,height:90,fx:82,fy:79,rgbFx:117,rgbFy:121,cx:73.25,cy:41.75,
      near:.28,far:10,forward:.18,up:-.04,baseline:.05,depthNoiseDisparityPx:.08,depthNoiseReferenceFx:421,
      depthEncoding:'axial-f32-le-rgba8'},
    rgb:new Uint8Array(90*160*4),depth:new Float32Array(90*160),
    imu:{accel:[1,2,9.81],gyro:[.1,.2,.3]},
    imuIntervals:[{time:12.49,dt:.01,imu:{accel:[4,5,6],gyro:[.4,.5,.6]}},
      {time:12.5,dt:.01,imu:{accel:[7,8,9],gyro:[.7,.8,.9]}}]};
}
afterEach(()=>vi.unstubAllGlobals());

it('maps distinct calibrated optics and off-axis centre without aligning or copying images',()=>{
  const frame=sensor(),result=localizationFrameFromSensor(frame,true);
  expect(result.rgb).toBe(frame.rgb);expect(result.depth).toBe(frame.depth);
  expect(result.calibration).toEqual({rgbCalibration:[117,121,73.25,41.75],depthCalibration:[82,79,73.25,41.75],
    opticalToBody:[0,0,1,-1,0,0,0,-1,0],cameraOriginBody:[.18,0,-.04],
    disparityNoise:.08,noiseReferenceFx:421,baseline:.05});
  expect(result.captureRequested).toBe(true);
  expect([result.sequence,result.time,result.dt]).toEqual([350,12.5,.02]);
});

it('preserves a nontrivial proper mount and all three body-origin coordinates',()=>{
  const frame=sensor();frame.calibration.opticalToBody=[0,-1,0,0,0,-1,1,0,0];frame.calibration.originFlu=[.2,-.3,.4];
  const result=localizationFrameFromSensor(frame);
  expect(result.calibration.opticalToBody).toEqual([0,-1,0,0,0,-1,1,0,0]);
  expect(result.calibration.cameraOriginBody).toEqual([.2,-.3,.4]);
  frame.calibration.opticalToBody[0]=999;frame.calibration.originFlu[1]=999;
  expect(result.calibration.opticalToBody).toEqual([0,-1,0,0,0,-1,1,0,0]);
  expect(result.calibration.cameraOriginBody).toEqual([.2,-.3,.4]);
});

it('owns small metadata including every held IMU interval without substituting endpoint samples',()=>{
  const frame=sensor(),before=structuredClone(frame),result=localizationFrameFromSensor(frame,false);
  expect(result.imuIntervals).toEqual(before.imuIntervals);expect(result.imu).toEqual(before.imu);
  expect(result.imuIntervals).not.toBe(frame.imuIntervals);
  frame.sequence=0;frame.time=0;frame.dt=1;frame.calibration.cx=0;frame.calibration.rgbFx=0;
  frame.imu.accel[0]=999;frame.imu.gyro[1]=999;
  frame.imuIntervals![0].dt=1;frame.imuIntervals![0].imu.accel[1]=999;frame.imuIntervals!.pop();
  expect([result.sequence,result.time,result.dt]).toEqual([350,12.5,.02]);
  expect(result.calibration.rgbCalibration).toEqual([117,121,73.25,41.75]);
  expect(result.imu).toEqual(before.imu);expect(result.imuIntervals).toEqual(before.imuIntervals);
});

it('keeps absent interval and capture-request metadata absent',()=>{
  const frame=sensor();delete frame.imuIntervals;
  const result=localizationFrameFromSensor(frame);
  expect(Object.hasOwn(result,'imuIntervals')).toBe(false);expect(Object.hasOwn(result,'captureRequested')).toBe(false);
});

it('excludes truth, capture/world points and undeclared metadata',()=>{
  const frame=Object.assign(sensor(),{truth:{x:900,y:800,z:700},capture:{clockDomain:'external'},
    depthCloud:{pose:{x:800},samples:new Float32Array([600])},points:[[500,400,300]],pixels:[123],featureScore:[5]});
  const result=localizationFrameFromSensor(frame);
  expect(Object.keys(result).sort()).toEqual(['calibration','depth','dt','imu','imuIntervals','rgb','sequence','time']);
  expect(Object.keys(result.calibration).sort()).toEqual(['baseline','cameraOriginBody','depthCalibration','disparityNoise',
    'noiseReferenceFx','opticalToBody','rgbCalibration']);
});

it('preserves raw NaN payload, signed zero, negative depth and RGB bytes at nonzero buffer offsets without scanning raster',()=>{
  const frame=sensor(),depthBacking=new ArrayBuffer(frame.depth.byteLength+16),rgbBacking=new ArrayBuffer(frame.rgb.byteLength+16);
  frame.depth=new Float32Array(depthBacking,8,90*160);frame.rgb=new Uint8Array(rgbBacking,8,90*160*4);
  const bits=new Uint32Array(depthBacking,8,90*160);bits[0]=0x7fc12345;bits[1]=0x80000000;bits[2]=0;bits[3]=0xbf800000;
  bits[bits.length-1]=0x7f800001;frame.rgb.set([3,17,255,42]);frame.rgb[frame.rgb.length-1]=99;
  const depthBytes=new Uint8Array(depthBacking).slice(),rgbBytes=new Uint8Array(rgbBacking).slice();
  // Metadata conversion must not attempt pixel iteration, rejection or conversion.
  for(const image of [frame.rgb,frame.depth]){
    Object.defineProperty(image,Symbol.iterator,{value:()=>{throw new Error('Raster iteration');}});
    Object.defineProperty(image,'every',{value:()=>{throw new Error('Raster validation');}});
  }
  const result=localizationFrameFromSensor(frame);
  expect(result.rgb).toBe(frame.rgb);expect(result.depth).toBe(frame.depth);
  expect(new Uint8Array(result.depth.buffer)).toEqual(depthBytes);expect(new Uint8Array(result.rgb.buffer)).toEqual(rgbBytes);
  expect(Object.is(result.depth[1],-0)).toBe(true);expect(result.depth[3]).toBe(-1);
});

it.each(['depthNoiseDisparityPx','depthNoiseReferenceFx'] as const)('refuses absent explicit %s metadata',name=>{
  const frame=sensor();delete frame.calibration[name];
  expect(()=>localizationFrameFromSensor(frame)).toThrow(name);
});

it('refuses malformed small metadata and mismatched image storage without changing raw buffers',()=>{
  const changes:((frame:SensorFrame)=>void)[]=[
    f=>{f.calibration.depthNoiseDisparityPx=-1;},f=>{f.calibration.depthNoiseReferenceFx=0;},
    f=>{f.calibration.rgbFy=NaN;},f=>{f.calibration.fx=0;},f=>{f.calibration.baseline=-1;},
    f=>{f.calibration.opticalToBody=[1,0,0,0,1,0,0,0,-1];},
    f=>{f.calibration.originFlu=[0,Infinity,0];},f=>{f.imu.gyro=[1,2];},
    f=>{f.imuIntervals![1].time=12.6;},f=>{f.calibration.width=159;},f=>{f.sequence=.5;},
    f=>{f.depth=new Float64Array(90*160) as unknown as Float32Array;},
  ];
  for(const change of changes){const frame=sensor();change(frame);const before=new Uint8Array(frame.depth.buffer).slice();
    expect(()=>localizationFrameFromSensor(frame)).toThrow();expect(new Uint8Array(frame.depth.buffer)).toEqual(before);}
});

// A transport-only worker endpoint: no compiler or estimator is simulated.
class TransportWorker {
  static last:TransportWorker;
  onmessage?:({data}:{data:unknown})=>void;
  messages:any[]=[];
  constructor(){TransportWorker.last=this;}
  postMessage(message:unknown,transfer:Transferable[]){this.messages.push(structuredClone(message,{transfer}));}
  reply(index:number){this.onmessage?.({data:{id:this.messages[index].id,result:undefined}});}
  terminate(){}
}
it('client sensor entry transfers raw buffers and takes ownership of pending-frame metadata immediately',async()=>{
  vi.stubGlobal('Worker',TransportWorker);
  const client=new ModelicaLocalizationClient(),worker=TransportWorker.last,first=sensor(),second=sensor();
  second.sequence++;second.time+=second.dt;second.imuIntervals=undefined;
  const firstRgb=first.rgb,firstDepth=first.depth;
  const active=client.stepSensorFrame(first,true),waiting=client.stepSensorFrame(second,false);
  expect(firstRgb.byteLength).toBe(0);expect(firstDepth.byteLength).toBe(0);
  expect(second.rgb.byteLength).toBe(0);expect(second.depth.byteLength).toBe(0);
  second.calibration.fx=999;second.imu.accel[0]=999;
  expect(worker.messages[0].frame.calibration.depthCalibration).toEqual([82,79,73.25,41.75]);
  expect(worker.messages[0].frame.captureRequested).toBe(true);
  worker.reply(0);await active;
  expect(worker.messages[1].frame.calibration.depthCalibration).toEqual([82,79,73.25,41.75]);
  expect(worker.messages[1].frame.imu.accel).toEqual([1,2,9.81]);expect(worker.messages[1].frame.captureRequested).toBe(false);
  worker.reply(1);await waiting;client.close();
});

it('client refuses missing calibrated noise before transferring any image',()=>{
  vi.stubGlobal('Worker',TransportWorker);
  const client=new ModelicaLocalizationClient(),frame=sensor();delete frame.calibration.depthNoiseReferenceFx;
  expect(()=>client.stepSensorFrame(frame)).toThrow('depthNoiseReferenceFx');
  expect(frame.rgb.byteLength).toBe(90*160*4);expect(frame.depth.byteLength).toBe(90*160*4);
  expect(TransportWorker.last.messages).toEqual([]);client.close();
});
