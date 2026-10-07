import {it,expect} from 'vitest';
import {allocateRealSenseImages,cameraImageLayout} from '../src/gpu-realsense-packing';
import {packFrame,unpackFrame,validateSensorFrame,recordedCameraFrame} from '../src/packet';
import {localizationFrameFromSensor} from '../src/modelica-localization-frame';
import type {SensorFrame} from '../src/types';
function rawFrame():SensorFrame {
 const {images}=allocateRealSenseImages({width:3,height:2},{width:3,height:2},.001);
 images.color.data.set([1,2,3,254,255,0,4,5,6,0,0,0,7,8,9,10,11,12,13,14,15]);
 images.depth.data.set([0,1,65535,0,500,12345,2000,0]);
 return {sequence:4,time:.1,dt:1/30,calibration:{width:3,height:2,fx:2,fy:2,cx:1,cy:.5,near:.28,far:10,forward:.18,up:-.04,baseline:.05,rgbFx:3,rgbFy:3,depthEncoding:'axial-z16-le'},
   rgb:images.color.data,depth:images.depth.data,imageLayout:cameraImageLayout(images),imu:{accel:[0,0,9.81],gyro:[0,0,0]}};
}
it('round trips RGB8/Z16 bytes, scale, padding and simulation metadata without float conversion',()=>{
 const frame=rawFrame();validateSensorFrame(frame);
 const packet=packFrame(frame),offsetPacket=new Uint8Array(packet.length+7);offsetPacket.set(packet,3);
 expect(unpackFrame(offsetPacket.subarray(3,3+packet.length))).toEqual(frame);
 expect(unpackFrame(Buffer.from(packet))).toEqual(frame);
 expect(new DataView(packet.buffer).getUint32(0,true)).toBe(0x32424c53);
 expect(unpackFrame(packet).depth).toBeInstanceOf(Uint16Array);
 expect(()=>unpackFrame(packet.subarray(0,packet.length-1))).toThrow('Truncated');
 expect(()=>localizationFrameFromSensor(frame)).toThrow('Rumoca raw U8/U16');
});
it('refuses wrong raw sample types, scale, format, orientation, stride and clock metadata',()=>{
 const changes=[(f:SensorFrame)=>{f.depth=new Float32Array(8);},
  (f:SensorFrame)=>{f.imageLayout!.depth.unitsMeters=0;},(f:SensorFrame)=>{f.imageLayout!.depth.isBigEndian=true as false;},
  (f:SensorFrame)=>{f.imageLayout!.color.strideBytes=9;},(f:SensorFrame)=>{f.imageLayout!.depth.bytes=3;},
  (f:SensorFrame)=>{f.imageLayout!.rowOrder='bottom-up' as 'top-down';},(f:SensorFrame)=>{f.imageLayout!.clockDomain='hardware' as 'simulation';}];
 for(const change of changes){const frame=rawFrame();change(frame);expect(()=>validateSensorFrame(frame)).toThrow();}
 const packet=packFrame(rawFrame());new DataView(packet.buffer).setUint32(0,0x31424c53,true);expect(()=>unpackFrame(packet)).toThrow();
});
it('allocates one aligned destination for all camera and optional GPU streams',()=>{
 const {images,destination}=allocateRealSenseImages({width:848,height:480},{width:848,height:480},.001,1024);
 expect(images.color.bytes+images.depth.bytes).toBe(2035200);expect(destination.byteLength).toBe(2036224);
 expect(images.color.data.buffer).toBe(destination.buffer);expect(images.depth.data.buffer).toBe(destination.buffer);
 expect(images.color.strideBytes).toBe(2544);expect(images.depth.strideBytes).toBe(1696);
 expect(()=>allocateRealSenseImages({width:0,height:4},{width:4,height:4},.001)).toThrow();
 expect(()=>allocateRealSenseImages({width:4,height:4},{width:4,height:4},1e-100)).toThrow();
});
it('recording retains only camera bytes from a larger shared sensor allocation',()=>{
 const frame=rawFrame(),combined=new ArrayBuffer(frame.rgb.byteLength+frame.depth.byteLength+4096);
 const rgb=new Uint8Array(combined,0,frame.rgb.byteLength),depth=new Uint16Array(combined,frame.rgb.byteLength,frame.depth.length);
 rgb.set(frame.rgb);depth.set(frame.depth);
 const shared={...frame,rgb,depth},saved=recordedCameraFrame(shared);
 expect(saved).toEqual(frame);expect(saved.rgb.buffer.byteLength).toBe(saved.rgb.byteLength);expect(saved.depth.buffer.byteLength).toBe(saved.depth.byteLength);
 expect(recordedCameraFrame(frame)).toBe(frame);expect(shared.rgb.buffer.byteLength).toBe(combined.byteLength);
});
