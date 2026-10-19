import test from 'node:test';
import assert from 'node:assert/strict';
import {registerDepth} from './rgbd-registration.mjs';
const calibration = {width:5,height:3,fx:1,fy:1,rgbFx:1,rgbFy:1,cx:2,cy:1};
const layout = {width:5,height:3,format:'Z16',isBigEndian:false,strideBytes:10,unitsMeters:.001};
const pack = values => {const b=Buffer.alloc(values.length*2);values.forEach((v,i)=>b.writeUInt16LE(v,i*2));return b;};
const unpack = b => Array.from({length:b.length/2},(_,i)=>b.readUInt16LE(i*2));
test('identity optics preserve depths, units, invalid samples and raster order',()=>{
  const values=[0,1000,2000,0,4000,5000,6000,7000,8000,9000,0,11,12,13,14];
  assert.deepEqual(unpack(registerDepth(pack(values),calibration,layout)),values);
});
test('known ray projects right/down under focal magnification without a baseline translation',()=>{
  const values=Array(15).fill(0);values[2*5+3]=2000;
  const result=unpack(registerDepth(pack(values),{...calibration,rgbFx:2,rgbFy:2,baseline:.05},layout));
  // Source ray x=1,y=1,z=2 projects to color pixel(4,3), outside height;
  // its pixel footprint still covers last-row pixel(3,2),(4,2).
  assert.equal(result[2*5+4],2000); assert.equal(result[1*5+2],0);
});
test('overlap takes near surface regardless of source order',()=>{
  const values=Array(15).fill(0);values[6]=4000;values[7]=1000;values[8]=3000;
  const result=unpack(registerDepth(pack(values),{...calibration,rgbFx:.5},layout));
  assert.equal(result[7],1000);
});
test('constant plane covers the narrow RGB field, no invented depth for invalid source',()=>{
  assert.deepEqual(unpack(registerDepth(pack(Array(15).fill(2345)),{...calibration,rgbFx:2,rgbFy:2},layout)),Array(15).fill(2345));
  assert.deepEqual(unpack(registerDepth(pack(Array(15).fill(0)),calibration,layout)),Array(15).fill(0));
});
test('malformed calibration, byte count and endian are rejected',()=>{
  assert.throws(()=>registerDepth(Buffer.alloc(30),{...calibration,fx:NaN},layout));
  assert.throws(()=>registerDepth(Buffer.alloc(29),calibration,layout));
  assert.throws(()=>registerDepth(Buffer.alloc(30),calibration,{...layout,isBigEndian:true}));
});
