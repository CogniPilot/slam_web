import {expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {ViewerCloudTransfer,ViewerCloudRetention,type ViewerCloudBatch} from '../src/viewer-cloud-transfer';
import {setDensePointBuffer} from '../src/dense-point-buffer';
import type {DepthCloud} from '../src/depth-cloud';
import {GpuDepthCloudRaster,type DepthCloudDisplay,type DepthCloudRaster} from '../src/depth-cloud-raster';
import type {LidarScan} from '../src/lidar';

const pose={x:1,y:2,z:3,quaternion:[1,0,0,0]};
const cloud=(time:number,samples=new Float32Array([1,2,3,4])):DepthCloud=>({time,width:samples.length/4,height:1,samples,pose,originFlu:[.18,0,-.04]});
const scan=(time:number,samples=new Float32Array([5,6,7,8])):LidarScan=>({time,beams:64,columns:1,near:.1,far:80,samples,format:'FLU_XYZ_PACK24',frame:'FLU'});
const placement=()=>({position:[1,2,3],quaternion:[0,0,0,1]});
const transfer=(batch:ViewerCloudBatch)=>structuredClone(batch,{transfer:[batch.buffer]});

it('coalesces unchanged scans, snapshots placement once and preserves raw bytes without transferring sensor storage',()=>{
  const sender=new ViewerCloudTransfer(),source=new Uint32Array([0x80000000,0x7fc01234,0x3f800000,0xff800000,0,1,2,3]);
  const c=cloud(1,new Float32Array(source.buffer,0,4)),s=scan(1,new Float32Array(source.buffer,16,4)),snapshot=vi.fn(placement);
  sender.cloud(c);sender.lidar(s,snapshot);sender.lidar(s,snapshot);sender.cloud(c);
  const outgoing=sender.take()!,received=transfer(outgoing);
  expect(snapshot).toHaveBeenCalledTimes(1);expect(source.buffer.byteLength).toBe(32);expect(outgoing.buffer.byteLength).toBe(0);
  expect(new Uint32Array(received.buffer)).toEqual(source);expect(received.cloud!.samples.buffer).toBe(received.lidar!.scan.samples.buffer);
  sender.complete();sender.cloud(c);sender.lidar(s,snapshot);expect(sender.take()).toBeUndefined();
  expect(sender.stats).toMatchObject({batches:1,clouds:1,lidarScans:1,copiedBytes:32,inFlight:false});
});

it('keeps only the newest pending presentation while a batch is in flight',()=>{
  const sender=new ViewerCloudTransfer();sender.cloud(cloud(1));sender.lidar(scan(1),placement);const first=transfer(sender.take()!);
  for(let time=2;time<=100;time++){sender.cloud(cloud(time));sender.lidar(scan(time),placement);expect(sender.take()).toBeUndefined();}
  expect(sender.stats).toMatchObject({batches:1,allocations:1});sender.complete();
  const latest=sender.take()!;expect(latest.cloud!.time).toBe(100);expect(latest.lidar!.scan.time).toBe(100);
  expect(first.cloud!.time).toBe(1);expect(sender.stats.batches).toBe(2);sender.complete();
});

it('retains a combined allocation until both geometry users have replaced it',()=>{
  const retention=new ViewerCloudRetention(),shared=new ArrayBuffer(32),newCloud=new ArrayBuffer(16),newLidar=new ArrayBuffer(16);
  expect(retention.replace(shared,shared)).toEqual([]);
  expect(retention.replace(newCloud)).toEqual([]);
  expect(retention.replace(undefined,newLidar)).toEqual([shared]);
  expect(retention.replace(newLidar)).toEqual([newCloud]);
  expect(retention.replace(newLidar,newLidar)).toEqual([]);
});

it('recycles transferred allocations across different sensor rates with bounded pool and exact content',()=>{
  const sender=new ViewerCloudTransfer(),retention=new ViewerCloudRetention();let held=scan(0),displayedCloud:DepthCloudDisplay|undefined,displayedScan:LidarScan|undefined;
  const sourceWords=new Uint32Array([0x80000000,0x7fc01234,0x3f800000,0xff800000]);
  for(let time=0;time<100;time++){
    const c=cloud(time,new Float32Array(sourceWords.buffer));if(time%3===0)held=scan(time);
    sender.cloud(c);sender.lidar(held,placement);const incoming=transfer(sender.take()!);
    if(incoming.cloud)displayedCloud=incoming.cloud;if(incoming.lidar)displayedScan=incoming.lidar.scan;
    const old=retention.replace(incoming.cloud?.samples.buffer as ArrayBuffer|undefined,incoming.lidar?.scan.samples.buffer as ArrayBuffer|undefined);
    const released=structuredClone(old,{transfer:old});sender.complete(released);
    expect(new Uint32Array(displayedCloud!.samples.buffer,displayedCloud!.samples.byteOffset,4)).toEqual(sourceWords);
    expect(displayedScan!.samples).toEqual(new Float32Array([5,6,7,8]));expect(sender.stats.freeBuffers).toBeLessThanOrEqual(3);
  }
  expect(sender.stats).toMatchObject({batches:100,clouds:100,lidarScans:34});
  expect(sender.stats.allocations).toBeLessThanOrEqual(4);expect(sender.stats.reuses).toBeGreaterThan(90);
  expect(sourceWords.buffer.byteLength).toBe(16);
});

it('transfers padded Z16 rows without conversion and aligns a following LiDAR view',()=>{
  const sender=new ViewerCloudTransfer(),samples=new Uint16Array([0,65535,4000,123,2000,3000,9999,456]);
  const raster:DepthCloudRaster={...cloud(1),width:3,height:2,encoding:'Z16',samples,strideBytes:8,unitsMeters:.001,
    calibration:{fx:4,fy:5,cx:1,cy:.5,near:.28,far:10}};
  sender.cloud(raster);sender.lidar(scan(1),placement);const received=transfer(sender.take()!);
  expect(received.cloud!.samples).toBeInstanceOf(Uint16Array);expect(received.cloud!.samples).toEqual(samples);
  expect(received.lidar!.scan.samples.byteOffset%4).toBe(0);sender.complete();
  // A tightly packed diagnostic raster can end on a two-byte boundary.
  sender.cloud({...raster,width:3,height:1,strideBytes:6,samples:samples.subarray(0,3)});sender.lidar(scan(2),placement);
  const odd=transfer(sender.take()!);expect(odd.buffer.byteLength).toBe(24);expect(odd.lidar!.scan.samples.byteOffset).toBe(8);
  expect(new Uint8Array(odd.buffer,6,2)).toEqual(new Uint8Array(2));expect(odd.cloud!.samples).toEqual(samples.subarray(0,3));sender.complete();
});

it('retains one raw texture/geometry at stable shapes, including replaced source storage',()=>{
  const gpu=new GpuDepthCloudRaster(),samples=new Uint16Array([0,1000,4000,65535]);
  const raster:DepthCloudRaster={...cloud(1),width:3,height:1,encoding:'Z16',samples,strideBytes:8,unitsMeters:.001,
    calibration:{fx:4,fy:5,cx:1,cy:0,near:.28,far:10}};
  gpu.set(raster);const geometry=gpu.geometry,texture=gpu.texture,version=texture.version,dispose=vi.spyOn(texture,'dispose');
  const replacement=samples.slice();gpu.set({...raster,samples:replacement});
  expect(gpu.geometry).toBe(geometry);expect(gpu.texture).toBe(texture);expect(texture.image.data).toBe(replacement);
  expect(texture.version).toBe(version+1);expect(dispose).not.toHaveBeenCalled();
  expect(geometry.drawRange).toEqual({start:0,count:3});expect(geometry.getAttribute('position')).toBeUndefined();
  expect(texture.format).toBe(THREE.RedIntegerFormat);expect(texture.type).toBe(THREE.UnsignedShortType);
  expect(()=>gpu.set({...raster,strideBytes:5})).toThrow('Invalid');expect(()=>gpu.set({...raster,samples:samples.subarray(0,2)})).toThrow('Invalid');
  gpu.set({...raster,width:2,strideBytes:4,samples:samples.subarray(0,2)});expect(dispose).toHaveBeenCalledTimes(1);gpu.dispose();
});

it('copies separate subviews byte-exactly and bounds idle storage during shape changes and failures',()=>{
  const sender=new ViewerCloudTransfer(),retention=new ViewerCloudRetention();
  for(let size=4;size<80;size+=4){
    const parent=new Uint32Array(size+4).fill(0x7fc01234),c=cloud(size,new Float32Array(parent.buffer,8,size));
    sender.cloud(c);const received=transfer(sender.take()!);expect(new Uint32Array(received.buffer)).toEqual(parent.subarray(2,2+size));
    const old=retention.replace(received.buffer);sender.complete(structuredClone(old,{transfer:old}));expect(sender.stats.freeBuffers).toBeLessThanOrEqual(3);
  }
  expect(()=>sender.complete()).toThrow('No viewer');sender.cloud(cloud(100));sender.take();sender.clearCloud();sender.complete();expect(sender.take()).toBeUndefined();
  sender.cloud(cloud(101));expect(sender.take()).toBeDefined();sender.complete();
});

it('clears pending data on a new project while preserving completion ownership of an older batch',()=>{
  const sender=new ViewerCloudTransfer(),c=cloud(1),s=scan(1);
  sender.cloud(c);sender.lidar(s,placement);sender.take();sender.cloud(cloud(2));sender.lidar(scan(2),placement);
  sender.reset();expect(sender.stats.inFlight).toBe(true);expect(sender.take()).toBeUndefined();sender.complete();expect(sender.take()).toBeUndefined();
  sender.cloud(c);sender.lidar(s,placement);expect(sender.take()).toBeDefined();sender.complete();
});

it('reuses dense geometry/GL attributes at stable shapes, replaces array references and disposes only on shape changes',()=>{
  const points=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial()),first=new Float32Array([1,2,3,4]);
  setDensePointBuffer(points,first,10);const geometry=points.geometry,position=geometry.getAttribute('position') as THREE.InterleavedBufferAttribute,buffer=position.data,dispose=vi.spyOn(geometry,'dispose'),version=buffer.version;
  const next=new Float32Array([5,6,7,8]);setDensePointBuffer(points,next,20);
  expect(points.geometry).toBe(geometry);expect(position.data).toBe(buffer);expect(buffer.array).toBe(next);expect(buffer.version).toBe(version+1);
  expect(buffer.usage).toBe(THREE.DynamicDrawUsage);expect(geometry.boundingSphere!.radius).toBe(20);expect(dispose).not.toHaveBeenCalled();
  setDensePointBuffer(points,new Float32Array(8),30);expect(points.geometry).not.toBe(geometry);expect(dispose).toHaveBeenCalledTimes(1);
  expect(points.geometry.getAttribute('position').count).toBe(2);points.geometry.dispose();points.material.dispose();
});
