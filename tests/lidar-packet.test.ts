import {expect,it} from 'vitest';
import {packLidar} from '../src/lidar-packet';
it('publishes unmodified GPU sample bytes and a declared FLU mount',()=>{
  const storage=new Uint32Array(64*1024*4+8),bits=storage.subarray(4,-4);
  bits.set([0x80000000,0x3f800000,0xff800000,0x4b7ffffe]);
  const samples=new Float32Array(bits.buffer,bits.byteOffset,bits.length);
  const bytes=packLidar({time:12.5,beams:64,columns:1024,near:.1,far:80,samples,format:'FLU_XYZ_PACK24',frame:'FLU'}),view=new DataView(bytes.buffer);
  expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('SLR2');expect(bytes.length).toBe(32+1048576);
  expect(view.getUint16(4,true)).toBe(64);expect(view.getUint16(6,true)).toBe(1024);expect(view.getFloat64(8,true)).toBe(12.5);
  expect(view.getFloat32(24,true)).toBeCloseTo(.18);
  expect(Buffer.from(bytes.subarray(32)).equals(Buffer.from(bits.buffer,bits.byteOffset,bits.byteLength))).toBe(true);
  expect(view.getUint32(32,true)).toBe(0x80000000);
});
