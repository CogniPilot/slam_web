import {it,expect} from 'vitest';
import {SampleReceiver} from '../src/sample-transfer';
import {packFrame,unpackFrame} from '../src/packet';
import type {SensorFrame} from '../src/types';
const frame:SensorFrame={sequence:101,time:1234.5,dt:.1,calibration:{width:96,height:54,fx:55,fy:58,cx:47.5,cy:26.5,near:.28,far:10,forward:.18,up:-.04,baseline:0,rgbFx:55,rgbFy:58,opticalToBody:[0,0,1,-1,0,0,0,-1,0],originFlu:[.18,.02,-.04]},rgb:new Uint8Array(96*54*4).fill(200),depth:new Float32Array(96*54).fill(4),imu:{accel:[0,0,9.81],gyro:[0,0,0]},capture:{clockDomain:'measured-test-clock',timestampNs:1234500000000}};
it('reassembles native live samples with acknowledgements and unchanged clocks/mount',()=>{
  const receiver=new SampleReceiver(()=> 'lab/node/sensor/frame'),bytes=packFrame(frame),total=Math.ceil(bytes.length/24000);
  let sample:Uint8Array|undefined;
  for(let index=0;index<total;index++){
    const message={requestId:'native-camera',key:'lab/node/sensor/frame',index,total,data:btoa(String.fromCharCode(...bytes.subarray(index*24000,(index+1)*24000)))};
    const result=receiver.receive(new TextEncoder().encode(JSON.stringify(message)));
    expect(result.ack).toEqual({requestId:'native-camera',received:index+1});sample=result.sample?.bytes;
  }
  expect(unpackFrame(sample!)).toEqual(frame);
});
it('rejects reordered streams, topic changes and reflected mounts',()=>{
  const receiver=new SampleReceiver(()=> 'lab/node/sensor/frame');
  const chunk={requestId:'one',key:'lab/node/sensor/frame',index:1,total:2,data:btoa('foo')};
  expect(receiver.receive(new TextEncoder().encode(JSON.stringify(chunk))).ack.error).toMatch(/Out-of-order/);
  expect(receiver.receive(new TextEncoder().encode(JSON.stringify({...chunk,index:0,key:'lab/node/another/frame'}))).ack.error).toMatch(/Unexpected/);
  const invalid=structuredClone(frame);invalid.calibration.opticalToBody=[1,0,0,0,1,0,0,0,-1];
  expect(()=>unpackFrame(packFrame(invalid))).toThrow('proper rotation');
});
