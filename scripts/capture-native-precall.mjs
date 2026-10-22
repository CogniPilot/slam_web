// Diagnostic only: capture an actual accepted prediction at the WASM boundary.
import {chromium} from '@playwright/test';
import {launchHardwareBrowser,requireHardwareGraphics} from './hardware-browser.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {gunzipSync} from 'node:zlib';

function installCapture(layout,imageRequested){
  const original=WebAssembly.instantiate;
  let instances=0;
  const capture=globalThis.__nativePrecall={armed:false};
  WebAssembly.instantiate=async function(...args){
    const instance=await original.apply(this,args);
    if(!args[1]?.env?.memory||++instances!==2)return instance;
    const memory=args[1].env.memory,entry=instance.exports.eval_assignments;
    if(memory.buffer.byteLength!==layout.pages*65536)throw Error('Step memory does not match capture layout');
    const read=(bytes,slot)=>{
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      return slot.lane==='u8'?view.getUint8(slot.offset):slot.lane==='i64'?Number(view.getBigInt64(slot.offset,true)):view.getFloat64(slot.offset,true);
    };
    const output=name=>{
      const typed=layout.outputs.find(slot=>slot.name===name);
      if(typed)return typed;
      const real=layout.model_outputs.find(slot=>slot.name===name);
      if(!real)throw Error(`Missing capture output ${name}`);
      return {lane:'f64',offset:real.index*8};
    };
    const prediction=output('predictionAccepted');
    return {exports:{...instance.exports,eval_assignments(y,p,time,scratch,typed){
      const entryArgs=[y,p,time,scratch,typed];
      const live=new Uint8Array(memory.buffer);
      const selected=capture.armed&&!capture.before&&read(live,layout.inputs.imageRequested)===imageRequested;
      const before=selected?live.slice():undefined;
      const status=entry(...entryArgs);
      if(selected&&status===0&&read(live,prediction)===1){
        capture.armed=false;capture.before=before;capture.after=live.slice();
        capture.args=entryArgs;capture.status=status;
        capture.inputs=Object.fromEntries(Object.entries(layout.inputs).map(([name,slot])=>[name,
          slot.count>16?{...slot,includedInMemory:true}:{...slot,values:Array.from({length:slot.count},(_,i)=>read(before,{...slot,offset:slot.offset+i*(slot.lane==='u8'?1:8)}))}]));
        capture.outputs=Object.fromEntries(['predictionAccepted','accepted','graphCorrectionAccepted','graphReason','covarianceStatus'].map(name=>[name,read(live,output(name))]));
      }
      return status;
    }}};
  };
}

const nativeDirectory=resolve(process.env.SLAM_PROFILE_NATIVE_DIR??join(homedir(),'scratch/slam_web/build/replay-main-assets'));
const output=resolve(process.argv[2]??join(homedir(),'scratch/slam_web/profiles/accepted-imu-precall'));
const url=process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4187';
const warmupFrames=Number(process.env.SLAM_CAPTURE_WARMUP_FRAMES??10);
const imageRequested=Number(process.env.SLAM_CAPTURE_IMAGE??0);
const tour=process.env.SLAM_CAPTURE_TOUR??'hover';
if(!Number.isInteger(warmupFrames)||warmupFrames<0||![0,1].includes(imageRequested)||!['hover','warehouse-loop'].includes(tour))throw Error('Invalid capture warmup, image gate or tour');
const manifest=JSON.parse(await readFile(join(nativeDirectory,'manifest.json'),'utf8'));
const profile=manifest.profiles?.['424x240'];
if(!profile)throw Error('Capture requires an explicit 424x240 native profile');
const layout=profile.models.step,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(output,{recursive:true});
const {browser,receipt:browserGpu}=await launchHardwareBrowser(chromium,{
  args:['--no-sandbox'],receiptPath:join(output,'browser-gpu.json')});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.route('**/assets/modelica-slam.worker-*.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({body:`(${installCapture.toString()})(${JSON.stringify(layout)},${imageRequested});\n${await response.text()}`,contentType:'text/javascript'});
  });
  const assets=new Map();
  await page.route('**/vendor/slam/*',async route=>{
    const file=new URL(route.request().url()).pathname.split('/').at(-1);
    const bytes=await readFile(join(nativeDirectory,file));assets.set(file,{file,bytes:bytes.length,sha256:sha(bytes)});
    await route.fulfill({body:bytes,contentType:file.endsWith('.json')?'application/json':'application/octet-stream'});
  });
  await page.goto(url);
  await page.waitForFunction(()=>window.__slamLab?.initialized&&window.__slamLab.ready,{},{timeout:120000});
  const preparation=await page.evaluate(async({warmupFrames,tour})=>{
    const lab=window.__slamLab,r=lab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));
    const p=structuredClone(lab.project);
    Object.assign(p,{environment:'warehouse',slamBackend:'native',cameraResolution:'424x240',sceneDetail:'low',depthCloudEnabled:false,lidarEnabled:false,
      sensorRates:{cameraHz:5,lidarHz:5,imuHz:10,gpsHz:1}});
    Object.assign(lab.project,p);await r.compile(p);r.autopilot=false;r.overlapSlamPrediction=true;
    const command=()=>{
      if(tour!=='warehouse-loop')return;
      const phase=r.time%24;
      r.command={forward:phase<6?.5:phase<12?0:phase<18?-.5:0,
        left:phase<6?0:phase<12?.25:phase<18?0:-.25,up:0,yaw:0};
    };
    for(let i=0;i<warmupFrames;i++){command();await r.step();}
    command();
    return {sourceSha256:r.slamProgram.sourceSha256,time:r.time,graphics:r.world.graphics};
  },{warmupFrames,tour});
  requireHardwareGraphics(preparation.graphics);
  if(preparation.sourceSha256!==profile.sourceSha256)throw Error('Prepared native source differs from capture manifest');
  const workers=page.workers().filter(worker=>worker.url().includes('/modelica-slam.worker-'));
  if(workers.length!==1)throw Error('Capture requires exactly one native worker');
  const worker=workers[0];await worker.evaluate(()=>{globalThis.__nativePrecall.armed=true;});
  await page.evaluate(()=>window.__slamLab.runtime.step());
  const receipt=await worker.evaluate(async()=>{
    const c=globalThis.__nativePrecall;
    if(!c.before||c.outputs.predictionAccepted!==1)throw Error('No accepted IMU prediction captured');
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    const files={};
    for(const key of ['before','after']){
      const raw=c[key],compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
      files[key]={bytes:raw.length,sha256:await digest(raw),gzipBytes:compressed.length};
      c[key]=compressed;
    }
    return {args:c.args,status:c.status,inputs:c.inputs,outputs:c.outputs,files};
  });
  let beforeMemory;
  for(const key of ['before','after']){
    const chunks=[];
    for(let offset=0;offset<receipt.files[key].gzipBytes;offset+=262144){
      const base64=await worker.evaluate(({key,offset})=>{
        const bytes=globalThis.__nativePrecall[key].subarray(offset,offset+262144);
        let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return btoa(text);
      },{key,offset});
      chunks.push(Buffer.from(base64,'base64'));
    }
    const gzip=Buffer.concat(chunks),raw=gunzipSync(gzip);
    if(raw.length!==receipt.files[key].bytes||sha(raw)!==receipt.files[key].sha256)throw Error('Capture transfer verification failed');
    if(key==='before')beforeMemory=raw;
    receipt.files[key].gzipSha256=sha(gzip);
    await writeFile(join(output,`${key}.memory.bin.gz`),gzip);
  }
  const initialized=layout.state_runs.find(run=>run.name==='estimator.localization.initialized');
  if(!initialized||initialized.lane!=='u8'||beforeMemory[initialized.previous]!==1)throw Error('Captured estimator was not initialized');
  for(const [name,value] of Object.entries({requested:1,localCaptureRequested:1,graphCorrectionRequested:1,imageRequested}))
    if(receipt.inputs[name]?.values?.[0]!==value)throw Error(`Captured prediction has unexpected ${name}`);
  let moduleBytes=await readFile(join(nativeDirectory,layout.files.module.file));
  if(moduleBytes[0]===0x1f&&moduleBytes[1]===0x8b)moduleBytes=gunzipSync(moduleBytes);
  const module=await WebAssembly.compile(moduleBytes),memory=new WebAssembly.Memory({initial:layout.pages,maximum:layout.pages}),env={memory};
  for(const item of WebAssembly.Module.imports(module)){
    if(item.module!=='env')throw Error('Unexpected native import module');
    if(item.kind==='function'){
      if(typeof Math[item.name]!=='function')throw Error('Unexpected native math import');
      env[item.name]=Math[item.name];
    }
  }
  const instance=await WebAssembly.instantiate(module,{env});
  new Uint8Array(memory.buffer).set(beforeMemory);
  const replayStatus=instance.exports.eval_assignments(...receipt.args),postSha256=sha(new Uint8Array(memory.buffer));
  const verification={status:replayStatus,initializedBefore:1,moduleSha256:sha(moduleBytes),postSha256,
    expectedPostSha256:receipt.files.after.sha256,exact:postSha256===receipt.files.after.sha256};
  await writeFile(join(output,'replay-verification.json'),JSON.stringify(verification,null,2)+'\n');
  if(replayStatus!==0||!verification.exact)throw Error('Independent native replay did not reproduce the captured post-call memory');
  await writeFile(join(output,'layout.json'),JSON.stringify(layout,null,2)+'\n');
  await writeFile(join(output,'capture.json'),JSON.stringify({sourceSha256:profile.sourceSha256,browserGpu,preparation,warmupFrames,imageRequested,tour,...receipt,assets:[...assets.values()],
    scope:`Accepted live warehouse prediction, imageRequested=${imageRequested}, after ${warmupFrames} camera frames (${tour}). Full memory immediately before eval_assignments, AFTER host carry and input writes; after memory immediately upon return, BEFORE next carry. Original WASM module unchanged. args are [y,p,time,scratch,typed]; replay eval_assignments once directly, without another host carry. Diagnostic copying invalidates timing.`},null,2)+'\n');
  console.log(JSON.stringify({output,outputs:receipt.outputs,args:receipt.args,files:receipt.files},null,2));
}finally{await browser.close();}
