import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('GPU camera packing produces top-down RGB8 and little-endian scaled Z16 in one host copy',async({page},testInfo)=>{
 const bundle=await build({stdin:{contents:"import * as THREE from 'three';import {GpuRealSensePacking} from './src/gpu-realsense-packing';import {GpuReadback} from './src/gpu-readback';globalThis.__realSensePacking={THREE,GpuRealSensePacking,GpuReadback};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'});
 await page.route('**/__realsense-packing__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>RealSense GPU formats</title>'}));
 await page.goto('/__realsense-packing__');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const report=await page.evaluate(()=>{
  const {THREE,GpuRealSensePacking,GpuReadback}=(window as any).__realSensePacking;
  const renderer=new THREE.WebGLRenderer({antialias:false}),gl=renderer.getContext();
  const ext=gl.getExtension('WEBGL_debug_renderer_info'),graphics=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const packing=new GpuRealSensePacking(),readback=new GpuReadback(gl),rows=[];
  const sentinel=new THREE.WebGLRenderTarget(19,23);
  for(const colorSpace of [THREE.NoColorSpace,THREE.SRGBColorSpace])for(const [width,height,depthWidth,depthHeight,units] of [[17,13,13,17,1/1024],[13,17,17,13,.001],[848,480,848,480,.001]]){
   const rgba=new Uint8Array(width*height*4),z=new Float32Array(depthWidth*depthHeight);
   for(let i=0;i<rgba.length;i++)rgba[i]=(i*73+Math.floor(i/(width*4))*17)%256;
   for(let i=0;i<z.length;i++)z[i]=((i*17)%65536)*units;
   z.set([0,-0,-1,NaN,Infinity,-Infinity,units*.25,units*.75,65536*units]);
   const depthBytes=new Uint8Array(z.buffer),colorTarget=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,colorSpace}),depthTarget=new THREE.WebGLRenderTarget(depthWidth,depthHeight,{depthBuffer:false,colorSpace:THREE.NoColorSpace});
   const colorUpload=new THREE.DataTexture(rgba,width,height,THREE.RGBAFormat,THREE.UnsignedByteType),depthUpload=new THREE.DataTexture(depthBytes,depthWidth,depthHeight,THREE.RGBAFormat,THREE.UnsignedByteType);
   colorUpload.needsUpdate=true;depthUpload.needsUpdate=true;
   renderer.initRenderTarget(colorTarget);renderer.initRenderTarget(depthTarget);
   renderer.copyTextureToTexture(colorUpload,colorTarget.texture);renderer.copyTextureToTexture(depthUpload,depthTarget.texture);
   renderer.setRenderTarget(sentinel);renderer.setViewport(3,4,5,6);renderer.setScissor(2,3,4,5);renderer.setScissorTest(true);gl.enable(gl.DITHER);
   let copies=0;const copy=gl.getBufferSubData.bind(gl);
   gl.getBufferSubData=(...args:any[])=>{copies++;return copy(...args);};
   let pair:any;
   try{pair=packing.capture(renderer,readback,colorTarget,depthTarget,units);}finally{gl.getBufferSubData=copy;}
   const stateRestored=renderer.getRenderTarget()===sentinel&&renderer.getViewport(new THREE.Vector4()).toArray().join()=== '3,4,5,6'&&renderer.getScissor(new THREE.Vector4()).toArray().join()==='2,3,4,5'&&renderer.getScissorTest()&&gl.isEnabled(gl.DITHER);
   let colorExact=true,depthExact=true,paddingZero=true;
   const raw=new DataView(pair.depth.data.buffer,pair.depth.data.byteOffset,pair.depth.data.byteLength);
   for(let y=0;y<height;y++){
    for(let x=0;x<width;x++)for(let channel=0;channel<3;channel++)colorExact&&=pair.color.data[y*pair.color.strideBytes+x*3+channel]===rgba[((height-1-y)*width+x)*4+channel];
    for(let i=width*3;i<pair.color.strideBytes;i++)paddingZero&&=pair.color.data[y*pair.color.strideBytes+i]===0;
   }
   for(let y=0;y<depthHeight;y++){
    for(let x=0;x<depthWidth;x++){
     const value=z[(depthHeight-1-y)*depthWidth+x];
     const expected=!Number.isFinite(value)||value<=0?0:Math.min(65535,Math.floor(Math.fround(Math.fround(value/Math.fround(units))+.5)));
     depthExact&&=raw.getUint16(y*pair.depth.strideBytes+x*2,true)===expected;
    }
    for(let i=depthWidth*2;i<pair.depth.strideBytes;i++)paddingZero&&=raw.getUint8(y*pair.depth.strideBytes+i)===0;
   }
   const afterColor=new Uint8Array(rgba.length),afterDepth=new Uint8Array(depthBytes.length);
   renderer.readRenderTargetPixels(colorTarget,0,0,width,height,afterColor);renderer.readRenderTargetPixels(depthTarget,0,0,depthWidth,depthHeight,afterDepth);
   const sourceUnchanged=rgba.every((v,i)=>v===afterColor[i])&&depthBytes.every((v,i)=>v===afterDepth[i]);
   rows.push({width,height,depthWidth,depthHeight,units,colorSpace,colorExact,depthExact,paddingZero,sourceUnchanged,stateRestored,copies,
    formats:[pair.color.format,pair.depth.format],strides:[pair.color.strideBytes,pair.depth.strideBytes],bytes:pair.color.bytes+pair.depth.bytes,
    sameBuffer:pair.color.data.buffer===pair.depth.data.buffer,unitsReported:pair.depth.unitsMeters,isBigEndian:pair.depth.isBigEndian,error:gl.getError()});
   colorUpload.dispose();depthUpload.dispose();colorTarget.dispose();depthTarget.dispose();
  }
  packing.dispose();readback.dispose();sentinel.dispose();renderer.dispose();
  return {graphics,rows,scope:'Device-format component qualification only; live camera noise/Modelica adapter migration is pending.'};
 });
 await testInfo.attach('realsense-packing.json',{body:JSON.stringify(report,null,2),contentType:'application/json'});
 expect(report.rows).toHaveLength(6);
 for(const row of report.rows){
  for(const key of ['colorExact','depthExact','paddingZero','sourceUnchanged','stateRestored','sameBuffer'] as const)expect(row[key],`${key}: ${JSON.stringify(row)}`).toBe(true);
  expect(row.copies).toBe(1);expect(row.formats).toEqual(['RGB8','Z16']);expect(row.unitsReported).toBe(row.units);expect(row.isBigEndian).toBe(false);expect(row.error).toBe(0);
 }
 expect(report.rows.at(-1)!.bytes).toBe(848*480*5);
});
