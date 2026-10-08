import {imuIntervals} from './imu-intervals';
import {validateSensorFrame} from './packet';
import type {CameraImageLayout} from './gpu-realsense-packing';
import type {SensorFrame} from './types';

export interface SlamIntervalFrame {
  imageEpoch:number;frameTime:number;
  rgb:Uint8Array;depth:Uint16Array;imageLayout:CameraImageLayout;
  rgbCalibration:number[];depthCalibration:number[];depthUnits:number;
  opticalToBody:number[];cameraOriginBody:number[];
  disparityNoise:number;noiseReferenceFx:number;baseline:number;
  intervals:NonNullable<SensorFrame['imuIntervals']>;
}

/** Transport for RGBDFastSLAMIntervals, independent of the pending Rumoca ABI.
 * Borrow images unchanged; own only small metadata. The compiler must bind the
 * declared strides and raw element types, and carry the complete Modelica State. */
export function slamIntervalFrameFromSensor(frame:SensorFrame):SlamIntervalFrame {
  if(!frame.imageLayout||!(frame.depth instanceof Uint16Array))
    throw new Error('Modelica SLAM requires native RGB8/Z16 camera observations');
  validateSensorFrame(frame);
  const k=frame.calibration;
  if(k.depthEncoding!=='axial-z16-le')throw new Error('Modelica SLAM requires axial Z16 depth encoding');
  if(k.depthNoiseDisparityPx===undefined||k.depthNoiseReferenceFx===undefined)
    throw new Error('Modelica SLAM requires explicit depth noise calibration');
  const intervals=imuIntervals(frame).map(({time,dt,imu})=>({time,dt,
    imu:{accel:imu.accel.slice(),gyro:imu.gyro.slice()}}));
  const {color,depth}=frame.imageLayout;
  const dimensions=(image:CameraImageLayout['color']|CameraImageLayout['depth'])=>({
    width:image.width,height:image.height,strideBytes:image.strideBytes,bytes:image.bytes});
  return {imageEpoch:frame.sequence,frameTime:frame.time,rgb:frame.rgb,depth:frame.depth,
    imageLayout:{color:{...dimensions(color),format:'RGB8'},
      depth:{...dimensions(depth),format:'Z16',unitsMeters:depth.unitsMeters,isBigEndian:false},
      rowOrder:'top-down',aligned:false,clockDomain:'simulation'},
    rgbCalibration:[k.rgbFx,k.rgbFy,k.cx,k.cy],depthCalibration:[k.fx,k.fy,k.cx,k.cy],
    depthUnits:frame.imageLayout.depth.unitsMeters,
    opticalToBody:k.opticalToBody?.slice()??[0,0,1,-1,0,0,0,-1,0],
    cameraOriginBody:k.originFlu?.slice()??[k.forward,0,k.up],
    disparityNoise:k.depthNoiseDisparityPx,noiseReferenceFx:k.depthNoiseReferenceFx,baseline:k.baseline,
    intervals};
}
