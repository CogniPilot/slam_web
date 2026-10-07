import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('native raw camera/cloud/LiDAR share one direct GPU readback with exact capture parity and recovery',async({page},testInfo)=>{
 const bundle=await build({stdin:{contents:"import * as THREE from 'three';import {World,D435} from './src/world';globalThis.__rawCapture={THREE,World,D435};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent'});
 await page.route('**/__raw-capture__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Raw capture</title>'}));
 await page.goto('/__raw-capture__');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  const {THREE,World,D435:c}=(window as any).__rawCapture,world=new World({canvas:new OffscreenCanvas(640,400),width:640,height:400,pixelRatio:1,base:location.origin+'/'});
  await world.ready;world.configureActors(false,false);world.actors.group.visible=false;world.navigation.group.visible=false;world.sensorGeometryBatches.clear();world.environment.clear();world.scene.fog=null;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial({color:0x789abc,side:THREE.DoubleSide}));
  plane.rotation.y=Math.PI/2;plane.position.set(c.forward+4,1.5+c.up,0);world.environment.add(plane);
  world.update({time:.1,x:0,y:0,z:1.5,quaternion:[1,0,0,0],velocity:[0,0,0],accel:[0,0,0],gyro:[0,0,0]});
  await world.setDepthNoise({seed:7,disparityNoisePx:.08,referenceFx:c.fx,baselineMeters:c.baseline,dropoutProbability:.005,unitsMeters:.001});world.setDepthCloudEnabled(true);
  const [normalized,oldScan]=await world.captureSensorPair(true,'sync',false),gl=world.renderer.getContext();
  const copy=gl.getBufferSubData.bind(gl);let copies=0;gl.getBufferSubData=(...args:any[])=>{copies++;return copy(...args);};
  const [raw,scan]=await world.captureSensorPair(true,'sync',false,true);const syncCopies=copies;gl.getBufferSubData=copy;
  copies=0;gl.getBufferSubData=(...args:any[])=>{copies++;return copy(...args);};
  const [asyncRaw,asyncScan]=await world.captureSensorPair(true,'async',false,true);const asyncCopies=copies;gl.getBufferSubData=copy;
  world.setSensorPackedReadback(false);
  const [unpacked,unpackedScan]=await world.captureSensorPair(true,'async',false,true);
  world.setSensorPackedReadback(true);
  const [fallback,fallbackScan]=await world.captureSensors(true);
  const equal=(a:any,b:any)=>{const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);return x.length===y.length&&x.every((v,i)=>v===y[i]);};
  let rgbExact=true,depthExact=true,cloudError=0;
  for(let i=0;i<c.width*c.height;i++){
   for(let channel=0;channel<3;channel++)rgbExact&&=raw.rgb[i*3+channel]===normalized.rgb[i*4+channel];
   depthExact&&=raw.depth[i]===Math.min(65535,Math.max(0,Math.round(normalized.depth[i]/.001)));
   const row=Math.floor(i/c.width),column=i%c.width,offset=((c.height-1-row)*c.width+column)*4;
   cloudError=Math.max(cloudError,Math.abs(raw.depthCloud.samples[offset+3]-raw.depth[i]*.001));
  }
  const render=world.renderer.render.bind(world.renderer);let rejected=false;
  world.renderer.render=(scene:any,camera:any)=>{if(world.renderer.getRenderTarget()===world.realSensePacking.depth)throw Error('raw packing fixture fault');return render(scene,camera);};
  try{await world.captureSensorPair(true,'sync',false,true);}catch(error){rejected=String(error).includes('raw packing fixture fault');}
  world.renderer.render=render;
  const restored=world.renderer.getRenderTarget()===null&&world.scene.overrideMaterial===null&&world.scene.matrixWorldAutoUpdate&&!world.asyncCapture&&!world.lidar.busy;
  const [recovered]=await world.captureSensorPair(false,'sync',false,true);
  const result={graphics:world.graphics,copies:syncCopies,asyncCopies,rgbExact,depthExact,cloudError,
   shared:[raw.depth,raw.depthCloud.samples,scan.samples].every(view=>view.buffer===raw.rgb.buffer),
   cameraBytes:raw.rgb.byteLength+raw.depth.byteLength,totalBytes:raw.rgb.buffer.byteLength,
   lidarExact:equal(oldScan.samples,scan.samples),cloudExact:equal(normalized.depthCloud.samples,raw.depthCloud.samples),
   asyncExact:equal(raw.rgb,asyncRaw.rgb)&&equal(raw.depth,asyncRaw.depth)&&equal(raw.depthCloud.samples,asyncRaw.depthCloud.samples)&&equal(scan.samples,asyncScan.samples),
   unpackedExact:equal(raw.rgb,unpacked.rgb)&&equal(raw.depth,unpacked.depth)&&equal(raw.depthCloud.samples,unpacked.depthCloud.samples)&&equal(scan.samples,unpackedScan.samples),
   fallbackExact:equal(raw.rgb,fallback.rgb)&&equal(raw.depth,fallback.depth)&&equal(scan.samples,fallbackScan.samples),
   fallbackKeys:Object.keys(fallback).sort(),
   rejected,restored,recovery:equal(raw.rgb,recovered.rgb)&&equal(raw.depth,recovered.depth),layout:raw.imageLayout,error:gl.getError()};
  world.renderer.dispose();return result;
 });
 await testInfo.attach('raw-camera-capture.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 for(const key of ['rgbExact','depthExact','shared','lidarExact','cloudExact','asyncExact','unpackedExact','fallbackExact','rejected','restored','recovery'] as const)expect(result[key]).toBe(true);
 expect(result.fallbackKeys).toEqual(['depth','imageLayout','rgb']);
 expect(result.copies).toBe(1);expect(result.asyncCopies).toBe(1);expect(result.cameraBytes).toBe(2035200);expect(result.cloudError).toBeLessThan(2e-6);expect(result.error).toBe(0);
});
