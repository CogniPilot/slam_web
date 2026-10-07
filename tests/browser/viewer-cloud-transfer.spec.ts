import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

for(const raster of [false,true])test(`viewer worker recycles native ${raster?'Z16':'XYZ'} cloud buffers without detaching live geometry or moving held scans`,async({page},testInfo)=>{
 const inspect=`
 self.addEventListener('message',({data})=>{
  if(data.type!=='fixture-inspect')return;
  queue=queue.then(async()=>{
   world.environment.clear();world.actors.group.visible=false;world.navigation.group.visible=false;world.robot.visible=false;world.lighting.celestialGroup.visible=false;
   world.scene.fog=null;world.render(false);
   const hash=async(array)=>array?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(array.buffer,array.byteOffset,array.byteLength))),b=>b.toString(16).padStart(2,'0')).join(''):null;
   const cloud=world.depthCloudView.geometry.getAttribute('position'),lidar=world.lidarView.geometry.getAttribute('position');
   self.postMessage({fixture:data.token,result:{
    graphics:world.graphics,cloudHash:await hash(world.latestDepthRaster?.samples??cloud?.data.array),lidarHash:await hash(lidar?.data.array),
    cloudTime:(world.latestDepthRaster??world.latestDepthCloud)?.time,lidarTime:world.latestLidar?.time,
    cloudGeometry:world.depthCloudView.geometry.id,lidarGeometry:world.lidarView.geometry.id,
    cloudCount:cloud?.count??world.depthCloudView.geometry.drawRange.count,lidarCount:lidar?.count,
    position:world.lidarView.position.toArray(),quaternion:world.lidarView.quaternion.toArray(),error:world.renderer.getContext().getError()
   }});
  });
 });`;
 const workerSource=await readFile('src/viewer.worker.ts','utf8');
 const [host,worker]=await Promise.all([
  build({stdin:{contents:"import {ViewerCloudTransfer} from './src/viewer-cloud-transfer';globalThis.__cloudTransfer=ViewerCloudTransfer;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'}),
  build({stdin:{contents:workerSource+inspect,resolveDir:process.cwd()+'/src',loader:'ts'},bundle:true,write:false,format:'iife',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'}),
 ]);
 await page.route('**/__viewer-clouds__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Viewer cloud ownership</title>'}));
 await page.goto('/__viewer-clouds__');await page.addScriptTag({content:host.outputFiles[0].text});
 const result=await page.evaluate(async({workerSource,raster})=>{
  const Sender=(window as any).__cloudTransfer,sender=new Sender(),url=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'})),worker=new Worker(url);
  let sequence=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
  worker.onmessage=({data})=>{const id=data.fixture??data.id,r=pending.get(id);if(r){pending.delete(id);data.error?r.reject(Error(data.error)):r.resolve(data.result);}};
  worker.onerror=event=>{for(const r of pending.values())r.reject(Error(event.message));pending.clear();};
  const call=(type:string,args:any={},transfer:Transferable[]=[])=>new Promise<any>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,type,...args},transfer);});
  const inspect=()=>new Promise<any>((resolve,reject)=>{const token=++sequence;pending.set(token,{resolve,reject});worker.postMessage({type:'fixture-inspect',token});});
  const hash=async(array:Float32Array<ArrayBuffer>|Uint16Array<ArrayBuffer>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(array.buffer,array.byteOffset,array.byteLength))),b=>b.toString(16).padStart(2,'0')).join('');
  const pose={x:0,y:0,z:1.5,quaternion:[1,0,0,0]},clouds:any[]=[],scans:any[]=[],checks:any[]=[];
  try{
   const canvas=new OffscreenCanvas(64,64),initialized=call('init',{canvas,width:64,height:64,pixelRatio:1,base:location.origin+'/'},[canvas]);
   worker.postMessage({type:'visibility',visible:false});await initialized;await call('depth-cloud-enabled',{enabled:true});
   let held:any;
   for(let frame=0;frame<12;frame++){
    const samples=raster?new Uint16Array(848*480):new Float32Array(848*480*4);
    if(raster)samples.set([4000+frame,0,65535,280,9999,10000]);
    else{samples.set([4+frame/10,0,0,4]);new Uint32Array(samples.buffer).set([0x80000000,0x7fc01234,0x3f800000,0],4);}
    const cloud={time:frame/30,width:848,height:480,samples,pose,originFlu:[.18,0,-.04],...(raster?{encoding:'Z16',strideBytes:1696,unitsMeters:.001,calibration:{fx:421,fy:421,cx:423.5,cy:239.5,near:.28,far:10}}:{})};clouds.push(cloud);sender.cloud(cloud);
    if(frame%3===0){const data=new Float32Array(64*1024*4);data.set([2+frame/10,0,0,12345]);held={time:frame/30,beams:64,columns:1024,near:.1,far:80,samples:data,format:'FLU_XYZ_PACK24',frame:'FLU'};scans.push(held);}
    const placedAt=Math.floor(frame/3)*3;
    sender.lidar(held,()=>({position:[placedAt,2,3],quaternion:[0,0,0,1]}));
    const batch=sender.take();const reply=await call('sensor-clouds',batch,[batch.buffer]);sender.complete(reply.released);
    // A newer body pose must not reposition an older scan already displayed.
    await call('pose',{truth:{time:frame/30,x:frame+100,y:20,z:3,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,0],gyro:[0,0,0]}});
    const view=await inspect();checks.push({frame,...view,expectedCloud:await hash(samples),expectedLidar:await hash(held.samples),expectedPosition:[placedAt,2,3]});
   }
   return {checks,stats:sender.stats,sensorStorageIntact:clouds.every(c=>c.samples.byteLength===848*480*(raster?2:16))&&scans.every(s=>s.samples.byteLength===64*1024*16)};
  }finally{worker.terminate();URL.revokeObjectURL(url);}
 },{workerSource:worker.outputFiles[0].text,raster});
 await testInfo.attach('viewer-cloud-transfer.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result.sensorStorageIntact).toBe(true);expect(result.stats).toMatchObject({batches:12,clouds:12,lidarScans:4,inFlight:false});
 expect(result.stats.allocations).toBeLessThanOrEqual(4);expect(result.stats.reuses).toBeGreaterThanOrEqual(8);
 const cloudGeometry=result.checks[0].cloudGeometry,lidarGeometry=result.checks[0].lidarGeometry;
 for(const c of result.checks){
  expect(c.cloudHash).toBe(c.expectedCloud);expect(c.lidarHash).toBe(c.expectedLidar);expect(c.position).toEqual(c.expectedPosition);expect(c.quaternion).toEqual([0,0,0,1]);
  expect(c.cloudGeometry).toBe(cloudGeometry);expect(c.lidarGeometry).toBe(lidarGeometry);expect(c.cloudCount).toBe(848*480);expect(c.lidarCount).toBe(64*1024);expect(c.error).toBe(0);
 }
});
