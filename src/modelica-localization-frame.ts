import {imuIntervals} from './imu-intervals';
import type {LocalizationFrame} from './modelica-localization-session';
import type {SensorFrame} from './types';

function finite(value:unknown,name:string):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`Invalid localization ${name}`);
}
function vector(value:unknown,size:number,name:string):number[]{
  if(!Array.isArray(value)||value.length!==size)throw new Error(`Invalid localization ${name}`);
  const result=value.slice();for(const cell of result)finite(cell,name);return result;
}
function measurement(value:SensorFrame['imu']):SensorFrame['imu'] {
  return {accel:vector(value?.accel,3,'acceleration'),gyro:vector(value?.gyro,3,'gyro')};
}

/** Measured transport only: preserve the raw image objects and own small
 * metadata. Pixel rejection, projection and numerical admission stay in Modelica.
 * The session checks these dimensions against its compiler-issued layout. */
export function localizationFrameFromSensor(frame:SensorFrame,captureRequested?:boolean):LocalizationFrame {
  if(frame.imageLayout)throw new Error('Native RGB8/Z16 localization requires Rumoca raw U8/U16 input support; host conversion is not provided');
  const k=frame?.calibration;
  if(!k||!Number.isSafeInteger(k.width)||!Number.isSafeInteger(k.height)||k.width<=0||k.height<=0
    ||!(frame.rgb instanceof Uint8Array)||!(frame.depth instanceof Float32Array)
    ||!Number.isSafeInteger(k.width*k.height)||frame.rgb.length!==k.width*k.height*4||frame.depth.length!==k.width*k.height)
    throw new Error('Invalid localization sensor image layout');
  if(!Number.isSafeInteger(frame.sequence)||frame.sequence<0)throw new Error('Invalid localization sequence');
  finite(frame.time,'time');finite(frame.dt,'dt');
  if(frame.time<0||frame.dt<=0)throw new Error('Invalid localization sensor clock');
  if(captureRequested!==undefined&&typeof captureRequested!=='boolean')throw new Error('Invalid localization capture request');
  for(const [name,value]of Object.entries({fx:k.fx,fy:k.fy,rgbFx:k.rgbFx,rgbFy:k.rgbFy,cx:k.cx,cy:k.cy,
    baseline:k.baseline,depthNoiseDisparityPx:k.depthNoiseDisparityPx,depthNoiseReferenceFx:k.depthNoiseReferenceFx}))finite(value,name);
  if(Math.min(k.fx,k.fy,k.rgbFx,k.rgbFy,k.depthNoiseReferenceFx!)<=0||k.baseline<0||k.depthNoiseDisparityPx!<0)
    throw new Error('Invalid localization calibrated optics/noise');
  const rotation=k.opticalToBody===undefined?[0,0,1,-1,0,0,0,-1,0]:vector(k.opticalToBody,9,'camera rotation');
  // Admission of a mount is metadata validation, independent of image contents.
  let error=0;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    let dot=0;for(let q=0;q<3;q++)dot+=rotation[3*q+i]*rotation[3*q+j];
    error+=(dot-Number(i===j))**2;
  }
  const [a,b,c,d,e,f,g,h,i]=rotation,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  if(Math.sqrt(error)>1e-6||Math.abs(det-1)>1e-6)throw new Error('Localization camera mount must be a proper rotation');
  const origin=k.originFlu===undefined?vector([k.forward,0,k.up],3,'camera origin'):vector(k.originFlu,3,'camera origin');
  const imu=measurement(frame.imu);
  const intervals=frame.imuIntervals===undefined?undefined:imuIntervals(frame).map(interval=>({
    time:interval.time,dt:interval.dt,imu:measurement(interval.imu)}));
  return {sequence:frame.sequence,time:frame.time,dt:frame.dt,rgb:frame.rgb,depth:frame.depth,imu,
    ...(intervals===undefined?{}:{imuIntervals:intervals}),
    calibration:{rgbCalibration:[k.rgbFx,k.rgbFy,k.cx,k.cy],depthCalibration:[k.fx,k.fy,k.cx,k.cy],
      opticalToBody:rotation,cameraOriginBody:origin,disparityNoise:k.depthNoiseDisparityPx!,
      noiseReferenceFx:k.depthNoiseReferenceFx!,baseline:k.baseline},
    ...(captureRequested===undefined?{}:{captureRequested})};
}
