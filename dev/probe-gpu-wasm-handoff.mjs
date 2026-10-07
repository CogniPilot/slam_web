// Raw WebGL transport into WASM memory. This does not establish compatibility
// with Rumoca's current F64 model-input ABI or execute a SLAM algorithm.
// Historical160x90 profile only. Use probe-native-gpu-transport.mjs for D435.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [directory]=process.argv.slice(2);
if(!directory)throw Error('OUTPUT_DIRECTORY required');fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const compiled=await build({entryPoints:['src/gpu-readback.ts'],bundle:true,format:'esm',platform:'neutral',write:false});
const module=compiled.outputFiles[0].text;fs.writeFileSync(path.join(directory,'readback.mjs'),module);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.__slamLab?.latest?.frame.sequence>=5,{},{timeout:90000});
  await page.evaluate(async()=>{const r=window.__slamLab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));});
  const result=await page.evaluate(async module=>{
    const url=URL.createObjectURL(new Blob([module],{type:'text/javascript'}));
    const {GpuReadback}=await import(url);URL.revokeObjectURL(url);
    const lab=window.__slamLab,r=lab.runtime,w=r.world,renderer=w.renderer,gl=renderer.getContext(),time=r.time;
    const readback=new GpuReadback(gl),rows=[];
    await w.ready;
    if(w.rgbTarget.width!==160||w.rgbTarget.height!==90||w.depthTarget.width!==160||w.depthTarget.height!==90)throw Error('Historical160x90 transport probe cannot measure native camera targets; use dev/probe-native-gpu-transport.mjs');
    await w.captureSensorPair(true,'sync',false);
    const byteLength=160*90*4,scanLength=w.lidar.readbackByteLength,guard=64;
    const before=renderer.getRenderTarget(),copy=gl.getBufferSubData;
    let expectedMemory,observedDirectCopies=0;
    gl.getBufferSubData=(...args)=>{
      if(expectedMemory){if(args[2].buffer!==expectedMemory)throw Error('GPU read went through an intermediate host buffer');observedDirectCopies++;}
      return copy.apply(gl,args);
    };
    try{
      for(const lidarEnabled of [false,true]){
        const size=byteLength*2+(lidarEnabled?scanLength:0),pages=Math.ceil((size+guard*2)/65536);
        const memory=new WebAssembly.Memory({initial:pages,maximum:pages}),all=new Uint8Array(memory.buffer);all.fill(99);
        const packed=new Uint8Array(memory.buffer,guard,size);
        const direct=[new Uint8Array(memory.buffer,guard,byteLength),new Uint8Array(memory.buffer,guard+byteLength,byteLength)];
        if(lidarEnabled)direct.push(new Float32Array(memory.buffer,guard+byteLength*2,scanLength/4));
        const buffered=[new Uint8Array(byteLength),new Uint8Array(byteLength)];if(lidarEnabled)buffered.push(new Float32Array(scanLength/4));
        const submit=destinations=>read=>{
          renderer.setRenderTarget(w.rgbTarget);read(160,90,destinations[0]);
          renderer.setRenderTarget(w.depthTarget);read(160,90,destinations[1]);
          if(lidarEnabled){renderer.setRenderTarget(w.lidar.target);read(w.lidar.columns,64,destinations[2]);}
        };
        const capture=intoWasm=>{
          if(intoWasm){expectedMemory=memory.buffer;try{readback.readBatchPackedSync(size,submit(direct),packed);}finally{expectedMemory=undefined;}}
          else {
            readback.readBatchPackedSync(size,submit(buffered));let offset=0;
            for(const view of buffered){packed.set(new Uint8Array(view.buffer,view.byteOffset,view.byteLength),offset);offset+=view.byteLength;}
          }
        };
        capture(false);const reference=packed.slice();capture(true);
        if(!packed.every((byte,index)=>byte===reference[index]))throw Error('Raw GPU→WASM byte mismatch');
        if(!all.subarray(0,guard).every(byte=>byte===99)||!all.subarray(guard+size).every(byte=>byte===99))throw Error('WASM guard overwrite');
        const windows=[];
        for(let repetition=0;repetition<2;repetition++)for(const intoWasm of repetition===0?[false,true,true,false]:[true,false,false,true]){
          for(let index=0;index<100;index++)capture(intoWasm);
          const start=performance.now();for(let index=0;index<1000;index++)capture(intoWasm);
          windows.push({repetition,intoWasm,captures:1000,wallMs:performance.now()-start});
        }
        if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL transport error');
        rows.push({lidarEnabled,bytes:size,rawBytesMatch:true,guardsPreserved:true,windows});
      }
    }finally{gl.getBufferSubData=copy;renderer.setRenderTarget(before);readback.dispose();}
    if(r.time!==time)throw Error('Transport experiment advanced physics');
    return {graphics:w.graphics,timeBefore:time,timeAfter:r.time,observedDirectCopies,rows};
  },module);
  for(const row of result.rows){
    const mean=direct=>{const windows=row.windows.filter(window=>window.intoWasm===direct);return windows.reduce((sum,window)=>sum+window.wallMs,0)/windows.reduce((sum,window)=>sum+window.captures,0);};
    row.meanBufferedMs=mean(false);row.meanDirectMs=mean(true);row.reductionPercent=100*(1-row.meanDirectMs/row.meanBufferedMs);
  }
  const report={schemaVersion:1,status:'RAW_GPU_WASM_MEMORY_DIRECT_COPY_PARITY_AND_TRANSPORT_PROFILE_PASS',
    recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(fs.readFileSync('src/gpu-readback.ts')),
    bundleSha256:sha(module),probeSha256:sha(fs.readFileSync(import.meta.filename)),...result,errors,
    rumocaInputAbiCompatible:false,fullSlam:false,productionChanged:false,
    scope:'Actual RGB/depth/LiDAR GPU targets from the current scene at one committed pose. One packed PBO getBufferSubData writes directly into nonshared WASM-memory byte/F32 views. Full raw-byte and guard comparisons, observed GPU destination identity, ABBA/BAAB transport-only timings, 16000 reads. Rendering/physics/algorithm execution/worker RPC are excluded. Current Rumoca inputs use F64 storage; source-issued raw-buffer representation or a compiled ingestion stage is still required. No zero GPU→CPU copy, full pipeline or10x claim.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw Error('Browser errors');console.log(JSON.stringify({status:report.status,rows:report.rows,errors}));
}catch(error){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2)+'\n');throw error;}
finally{await browser.close();}
