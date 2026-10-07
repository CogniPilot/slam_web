import {test,expect} from '@playwright/test';
import {build} from 'esbuild';

test('GPU depth noise is reproducible, depth dependent and quantized without changing the source',async({page},testInfo)=>{
 const bundle=await build({stdin:{contents:"import * as THREE from 'three';import {GpuDepthNoise} from './src/gpu-depth-noise';globalThis.__noise={THREE,GpuDepthNoise};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',logLevel:'silent'});
 await page.route('**/__gpu-noise__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>GPU sensor noise</title>'}));
 await page.goto('/__gpu-noise__');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(()=>{
  const {THREE,GpuDepthNoise}=(window as any).__noise,renderer=new THREE.WebGLRenderer({antialias:false}),gl=renderer.getContext();
  const ext=gl.getExtension('WEBGL_debug_renderer_info'),graphics=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  const width=848,height=480,source=new Float32Array(width*height);
  source.fill(2,0,source.length/2);source.fill(4,source.length/2);source.set([0,-0,-1,NaN,Infinity,-Infinity]);
  const target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,colorSpace:THREE.NoColorSpace});
  const upload=new THREE.DataTexture(new Uint8Array(source.buffer),width,height,THREE.RGBAFormat,THREE.UnsignedByteType);upload.needsUpdate=true;
  renderer.initRenderTarget(target);renderer.copyTextureToTexture(upload,target.texture);
  const noise=new GpuDepthNoise(),settings={seed:7,disparityNoisePx:.08,referenceFx:421,baselineMeters:.05,dropoutProbability:.005,unitsMeters:.001};
  const capture=(options:any,time:number)=>{const result=noise.submit(renderer,target,options,time),bytes=new Uint8Array(source.byteLength);renderer.readRenderTargetPixels(result,0,0,width,height,bytes);return new Float32Array(bytes.buffer);};
  const first=capture(settings,.1),repeat=capture(settings,.1),next=capture(settings,.1+1/180),seeded=capture({...settings,seed:8},.1);
  const groups=[{count:0,dropped:0,sum:0,sum2:0},{count:0,dropped:0,sum:0,sum2:0}];
  let quantized=true,finite=true;
  for(let i=6;i<source.length;i++){
   const z=first[i],g=groups[source[i]===2?0:1];g.count++;
   finite&&=Number.isFinite(z)&&z>=0;
   if(z===0){g.dropped++;continue;}
   const e=z-source[i];g.sum+=e;g.sum2+=e*e;
   quantized&&=Math.abs(z/settings.unitsMeters-Math.round(z/settings.unitsMeters))<.001;
  }
  const stats=groups.map(g=>{const accepted=g.count-g.dropped,mean=g.sum/accepted;return {dropout:g.dropped/g.count,mean,std:Math.sqrt(g.sum2/accepted-mean*mean)};});
  const allDrop=capture({...settings,dropoutProbability:1},.1),clean=capture({...settings,dropoutProbability:0,disparityNoisePx:0},.1);
  const sourceBefore=new Uint8Array(source.buffer),sourceAfter=new Uint8Array(source.byteLength);renderer.readRenderTargetPixels(target,0,0,width,height,sourceAfter);
  const words=(x:Float32Array)=>new Uint32Array(x.buffer),beforeWords=words(first),repeatWords=words(repeat);
  const output={graphics,stats,quantized,finite,sourceExact:sourceAfter.every((v,i)=>v===sourceBefore[i]),repeatExact:beforeWords.every((v,i)=>v===repeatWords[i]),
   changedTime:first.filter((v,i)=>v!==next[i]).length/source.length,changedSeed:first.filter((v,i)=>v!==seeded[i]).length/source.length,
   invalidZero:first.slice(0,6).every(v=>v===0),allDrop:allDrop.every(v=>v===0),clean:clean.slice(6).every((v,i)=>v===source[i+6]),error:gl.getError()};
  noise.dispose();upload.dispose();target.dispose();renderer.dispose();return output;
 });
 await testInfo.attach('gpu-depth-noise.json',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 for(const key of ['quantized','finite','sourceExact','repeatExact','invalidZero','allDrop','clean'] as const)expect(result[key]).toBe(true);
 expect(result.changedTime).toBeGreaterThan(.9);expect(result.changedSeed).toBeGreaterThan(.9);expect(result.error).toBe(0);
 for(const [i,g] of result.stats.entries()){
  expect(g.dropout).toBeGreaterThan(.0044);expect(g.dropout).toBeLessThan(.0056);
  const expected=[2,4][i]**2*.08/(421*.05);
  expect(Math.abs(g.mean)).toBeLessThan(expected*.015);expect(g.std/expected).toBeGreaterThan(.98);expect(g.std/expected).toBeLessThan(1.02);
 }
});
