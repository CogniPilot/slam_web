import type { SensorFrame } from './types';
import {imuIntervals} from './imu-intervals';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
// Versioned camera envelope: magic, JSON length, color bytes, depth elements.
// V1: historical RGBA8/F32 meters. V2: explicit RGB8/Z16 layouts and scale.
// Synapse sensors/odometry use their canonical fixed structs separately.
const MAGIC = 0x31424c53;
const RAW_MAGIC=0x32424c53;
const littleEndian=new Uint8Array(new Uint16Array([0x0102]).buffer)[0]===2;
/** Recording is explicit I/O. Retain camera bytes without keeping the optional
 * cloud/LiDAR portions of a combined capture allocation alive for300 frames. */
export function recordedCameraFrame(frame:SensorFrame):SensorFrame {
  if(!frame.imageLayout||frame.rgb.buffer!==frame.depth.buffer||frame.rgb.buffer.byteLength===frame.rgb.byteLength+frame.depth.byteLength)return frame;
  return {...frame,rgb:frame.rgb.slice(),depth:frame.depth.slice()};
}
export function packFrame(frame: SensorFrame): Uint8Array {
  if(!littleEndian)throw Error('Camera byte transport requires a little-endian host');
  const { rgb, depth, ...metadata } = frame;
  const header = encoder.encode(JSON.stringify(metadata));
  const bytes = new Uint8Array(16 + header.length + rgb.length + depth.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0,frame.imageLayout?RAW_MAGIC:MAGIC,true); view.setUint32(4, header.length, true);
  view.setUint32(8, rgb.length, true); view.setUint32(12, depth.length, true);
  bytes.set(header, 16); bytes.set(rgb, 16 + header.length);
  bytes.set(new Uint8Array(depth.buffer,depth.byteOffset,depth.byteLength),16+header.length+rgb.length);
  return bytes;
}
export function unpackFrame(bytes: Uint8Array): SensorFrame {
  if(bytes.length>8_000_000)throw new Error('Camera frame exceeds limit');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if(!littleEndian)throw Error('Camera byte transport requires a little-endian host');
  if(bytes.length<16)throw new Error('Unsupported camera envelope');
  const magic=view.getUint32(0,true),raw=magic===RAW_MAGIC;
  if(magic!==MAGIC&&!raw)throw new Error('Unsupported camera envelope');
  const jsonLength = view.getUint32(4, true), rgbLength = view.getUint32(8, true), depthLength = view.getUint32(12, true);
  if(16+jsonLength+rgbLength+(raw?2:4)*depthLength!==bytes.length)throw new Error('Truncated camera frame');
  const metadata = JSON.parse(decoder.decode(bytes.subarray(16, 16 + jsonLength)));
  if(!!metadata.imageLayout!==raw)throw Error('Camera envelope format/layout mismatch');
  const offset = 16 + jsonLength + rgbLength;
  // Explicit byte copies keep storage aligned even for offset Node Buffer views.
  const depthBytes=new Uint8Array(bytes.length-offset);depthBytes.set(bytes.subarray(offset));
  const depth=raw?new Uint16Array(depthBytes.buffer):new Float32Array(depthBytes.buffer);
  const rgb=new Uint8Array(rgbLength);rgb.set(bytes.subarray(16+jsonLength,offset));
  const frame={...metadata,rgb,depth};
  validateSensorFrame(frame);return frame;
}
export function validateSensorFrame(frame:SensorFrame) {
  const k=frame.calibration;
  if(!k||!Number.isInteger(k.width)||!Number.isInteger(k.height)||k.width<=0||k.height<=0||k.width*k.height>990_000||!(frame.rgb instanceof Uint8Array))throw new Error('Invalid sensor frame shape');
  if(frame.imageLayout){
    const {color,depth,rowOrder,aligned,clockDomain}=frame.imageLayout;
    if(rowOrder!=='top-down'||aligned!==false||clockDomain!=='simulation'||color?.format!=='RGB8'||depth?.format!=='Z16'||depth.isBigEndian!==false||!Number.isFinite(depth.unitsMeters)||depth.unitsMeters<=0||!(frame.depth instanceof Uint16Array))throw Error('Invalid raw camera format');
    for(const [layout,channels,bytes] of [[color,3,frame.rgb.byteLength],[depth,2,frame.depth.byteLength]] as const)
      if(layout.width!==k.width||layout.height!==k.height||!Number.isSafeInteger(layout.strideBytes)||layout.strideBytes<k.width*channels||layout.strideBytes%4||layout.bytes!==layout.strideBytes*k.height||layout.bytes!==bytes)throw Error('Invalid raw camera stride/shape');
  }else if(!(frame.depth instanceof Float32Array)||frame.rgb.length!==k.width*k.height*4||frame.depth.length!==k.width*k.height)throw Error('Invalid sensor frame shape');
  if(!Number.isSafeInteger(frame.sequence)||frame.sequence<0||!Number.isFinite(frame.time)||frame.time<0||!Number.isFinite(frame.dt)||frame.dt<=0||frame.dt>1)throw new Error('Invalid sensor frame timestamp or timestep');
  if(![k.fx,k.fy,k.rgbFx,k.rgbFy,k.cx,k.cy,k.near,k.far,k.forward,k.up,k.baseline].every(Number.isFinite)||Math.min(k.fx,k.fy,k.rgbFx,k.rgbFy)<=0||k.near<0||k.far<=k.near||k.baseline<0)throw new Error('Invalid camera calibration');
  if(k.depthNoiseDisparityPx!==undefined&&(!Number.isFinite(k.depthNoiseDisparityPx)||k.depthNoiseDisparityPx<0))throw new Error('Invalid depth noise calibration');
  if(k.depthNoiseReferenceFx!==undefined&&(!Number.isFinite(k.depthNoiseReferenceFx)||k.depthNoiseReferenceFx<=0))throw new Error('Invalid depth noise reference focal length');
  if(!frame.imu||frame.imu.accel.length!==3||frame.imu.gyro.length!==3||![...frame.imu.accel,...frame.imu.gyro].every(Number.isFinite))throw new Error('Invalid airframe IMU');
  if(frame.imuIntervals!==undefined)imuIntervals(frame);
  if(!frame.imageLayout&&!frame.depth.every(z=>Number.isFinite(z)&&z>=0))throw new Error('Invalid optical depth');
  if((k.opticalToBody===undefined)!==(k.originFlu===undefined))throw new Error('Camera mount requires rotation and origin');
  if(k.opticalToBody){
    const r=k.opticalToBody,t=k.originFlu!;
    if(r.length!==9||t.length!==3||![...r,...t].every(Number.isFinite))throw new Error('Invalid camera mount');
    let error=0;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){let dot=0;for(let q=0;q<3;q++)dot+=r[3*q+i]*r[3*q+j];error+=(dot-Number(i===j))**2;}
    const det=r[0]*(r[4]*r[8]-r[5]*r[7])-r[1]*(r[3]*r[8]-r[5]*r[6])+r[2]*(r[3]*r[7]-r[4]*r[6]);
    if(Math.sqrt(error)>1e-6||Math.abs(det-1)>1e-6)throw new Error('Camera mount must be a proper rotation');
  }
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
