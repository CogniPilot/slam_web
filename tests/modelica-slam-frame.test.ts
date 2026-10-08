import {expect,it} from 'vitest';
import {allocateRealSenseImages,cameraImageLayout} from '../src/gpu-realsense-packing';
import {slamInitialFrameFromSensor,slamIntervalFrameFromSensor} from '../src/modelica-slam-frame';
import {packFrame,unpackFrame} from '../src/packet';
import {D435} from '../src/camera-profile';
import type {InitialSensorFrame,SensorFrame} from '../src/types';

function sensor(width=3,height=2):SensorFrame {
  const {images}=allocateRealSenseImages({width,height},{width,height},.002,128);
  images.color.data.set([3,17,255,42]);images.depth.data.set([0,1,65535,12345]);
  return {sequence:12,time:.1,dt:.02,
    calibration:{...D435,width,height,depthEncoding:'axial-z16-le',
      fx:21,fy:22,rgbFx:31,rgbFy:32,cx:1.25,cy:.75,
      opticalToBody:[0,-1,0,0,0,-1,1,0,0],originFlu:[.2,-.3,.4]},
    rgb:images.color.data,depth:images.depth.data,imageLayout:cameraImageLayout(images),
    imu:{accel:[9,8,7],gyro:[.9,.8,.7]},
    imuIntervals:[{time:.09,dt:.01,imu:{accel:[1,2,3],gyro:[.1,.2,.3]}},
      {time:.1,dt:.01,imu:{accel:[4,5,6],gyro:[.4,.5,.6]}}]};
}
function initial():InitialSensorFrame {return {...sensor(),sequence:0,time:0,dt:0,imuIntervals:[]};}

it('initializes from the time-zero camera and measured IMU without inventing an interval or copying rasters',()=>{
  const frame=initial(),result=slamInitialFrameFromSensor(frame);
  expect(result.frameTime).toBe(0);expect(result.imageEpoch).toBe(0);expect(result.imu).toEqual(frame.imu);
  expect(result.imu).not.toBe(frame.imu);expect(result.rgb).toBe(frame.rgb);expect(result.depth).toBe(frame.depth);
  expect(Object.hasOwn(result,'intervals')).toBe(false);
  frame.imu.accel[0]=999;expect(result.imu.accel[0]).toBe(9);
  expect(()=>slamIntervalFrameFromSensor(frame)).toThrow('timestep');
});

it('refuses nonzero initialization clocks, elapsed intervals and missing initialization metadata',()=>{
  for(const change of [{time:.01},{time:NaN},{dt:.01},{imuIntervals:undefined},{imuIntervals:sensor().imuIntervals}])
    expect(()=>slamInitialFrameFromSensor({...initial(),...change} as InitialSensorFrame)).toThrow('time zero');
  const frame=initial();frame.imu.accel=Array(3);
  expect(()=>slamInitialFrameFromSensor(frame)).toThrow('IMU');
});

it.each([[3,2],[848,480]])('borrows native %i×%i images with strides and exact Z16 units, without raster access',(width,height)=>{
  const frame=sensor(width,height),before=new Uint8Array(frame.rgb.buffer).slice();
  for(const image of [frame.rgb,frame.depth])for(const name of [Symbol.iterator,'every','map','slice'])
    Object.defineProperty(image,name,{value:()=>{throw Error('Raster access');}});
  const result=slamIntervalFrameFromSensor(frame);
  expect(result.rgb).toBe(frame.rgb);expect(result.depth).toBe(frame.depth);
  expect(result.imageLayout).toEqual(frame.imageLayout);expect(result.imageLayout).not.toBe(frame.imageLayout);
  expect(result.rgbCalibration).toEqual([31,32,1.25,.75]);expect(result.depthCalibration).toEqual([21,22,1.25,.75]);
  expect(result.depthUnits).toBe(.002);expect(result.depth[2]).toBe(65535);
  expect(Buffer.from(frame.rgb.buffer).equals(Buffer.from(before))).toBe(true);
});

it('owns metadata and every held interval, excluding endpoint replacement, truth and renderer data',()=>{
  const frame=Object.assign(sensor(),{truth:{x:999},capture:{truth:{x:998}},points:[[997]],depthCloud:{samples:new Float32Array([996])}});
  Object.assign(frame.imageLayout!,{truth:{x:995}});Object.assign(frame.imageLayout!.color,{truth:{x:994}});
  const result=slamIntervalFrameFromSensor(frame),expected=structuredClone(result);
  frame.calibration.opticalToBody![0]=999;frame.calibration.originFlu![0]=999;
  frame.imageLayout!.color.strideBytes=999;frame.imageLayout!.depth.unitsMeters=999;
  frame.imuIntervals![0].imu.accel[0]=999;frame.imuIntervals!.pop();frame.time=999;frame.sequence=999;
  expect(result).toEqual(expected);expect(result.intervals.map(i=>i.imu.accel[0])).toEqual([1,4]);
  expect(result.opticalToBody).toEqual([0,-1,0,0,0,-1,1,0,0]);expect(result.cameraOriginBody).toEqual([.2,-.3,.4]);
  expect(Object.keys(result).sort()).toEqual(['baseline','cameraOriginBody','depth','depthCalibration','depthUnits',
    'disparityNoise','frameTime','imageEpoch','imageLayout','intervals','noiseReferenceFx','opticalToBody','rgb','rgbCalibration']);
  expect(Object.keys(result.imageLayout.color).sort()).toEqual(['bytes','format','height','strideBytes','width']);
  expect(Object.keys(result.imageLayout).sort()).toEqual(['aligned','clockDomain','color','depth','rowOrder']);
});

it('uses the declared camera mount and one held measurement when no explicit batch is present',()=>{
  const frame=sensor();delete frame.imuIntervals;delete frame.calibration.opticalToBody;delete frame.calibration.originFlu;
  const result=slamIntervalFrameFromSensor(frame);
  expect(result.intervals).toEqual([{time:.1,dt:.02,imu:frame.imu}]);expect(result.intervals[0].imu).not.toBe(frame.imu);
  expect(result.opticalToBody).toEqual([0,0,1,-1,0,0,0,-1,0]);expect(result.cameraOriginBody).toEqual([.18,0,-.04]);
});

it('preserves native recorded observations on reload without conversion or metadata drift',()=>{
  const frame=sensor(),reloaded=unpackFrame(packFrame(frame));
  const result=slamIntervalFrameFromSensor(reloaded);
  expect(result).toEqual(slamIntervalFrameFromSensor(frame));expect(result.rgb).toBe(reloaded.rgb);expect(result.depth).toBe(reloaded.depth);
});

it('rejects malformed clocks, incomplete batches, calibration and native storage before borrowing buffers',()=>{
  const changes:((f:SensorFrame)=>void)[]=[
    f=>{delete f.imageLayout;},f=>{f.depth=new Float32Array(f.depth.length);},
    f=>{f.calibration.depthEncoding='axial-f32-le-rgba8';},f=>{delete f.calibration.depthNoiseDisparityPx;},
    f=>{delete f.calibration.depthNoiseReferenceFx;},f=>{f.imageLayout!.depth.unitsMeters=0;},
    f=>{f.imageLayout!.color.strideBytes=9;},f=>{f.imageLayout!.rowOrder='bottom-up' as 'top-down';},
    f=>{f.imageLayout!.aligned=true as false;},f=>{f.calibration.rgbFx=NaN;},
    f=>{f.calibration.opticalToBody![0]=1;},f=>{f.time=NaN;},f=>{f.dt=0;},
    f=>{f.imuIntervals![1].time=.11;},f=>{f.imuIntervals![0].dt=.005;},
    f=>{f.imuIntervals![0].imu.gyro=[NaN,0,0];},f=>{f.imuIntervals=[];},
  ];
  for(const change of changes){const frame=sensor();change(frame);const before=new Uint8Array(frame.rgb.buffer).slice();
    expect(()=>slamIntervalFrameFromSensor(frame)).toThrow();expect(Buffer.from(frame.rgb.buffer).equals(Buffer.from(before))).toBe(true);}
});
