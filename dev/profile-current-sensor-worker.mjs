// Actual dedicated sensor worker, one held pose; independent from throughput.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
import {startWorkerProfiler} from './browser-worker-profiler.mjs';
import {startProfileRun} from './start-profile-run.mjs';
const [directory]=process.argv.slice(2);
if(!directory)throw Error('OUTPUT_DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceManifest=()=>{
  const files={};
  function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,item.name);
    if(item.isDirectory())walk(file);else if(item.isFile())files[file]=sha(fs.readFileSync(file));
  }}
  for(const directory of ['src','models'])walk(directory);
  for(const file of ['dev/start-profile-run.mjs','package-lock.json','public/vendor/rumoca/rumoca_bind_wasm.js','public/vendor/rumoca/rumoca_bind_wasm_bg.wasm'])
    files[file]=sha(fs.readFileSync(file));
  return files;
};
if(process.env.SENSOR_DRAIN_BEFORE_COPY==='1')throw Error('gl.finish is not a completion barrier in Chromium; use the asynchronous fence profile');
const hostOnly=process.env.SENSOR_PROFILE_HOST_ONLY==='1';
const repeats=Number(process.env.SENSOR_PROFILE_REPEATS??5);
if(!Number.isSafeInteger(repeats)||repeats<1||repeats>100)throw Error('SENSOR_PROFILE_REPEATS must be1..100');
const sourcesBefore=sourceManifest();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];let recorder,workerProfiler;
let profileRouteRequests=0;
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  if(hostOnly)await page.context().route('**/src/sensor-render.worker.ts*',async route=>{
    const response=await route.fetch(),source=await response.text();
    if(!source.includes('new GpuSensorProfiler(world)'))throw Error('Sensor profiler constructor absent');
    profileRouteRequests++;
    await route.fulfill({response,body:source.replace('new GpuSensorProfiler(world)',
      'new GpuSensorProfiler(world, {gpuTimers:false})')});
  });
  if(process.env.SENSOR_CPU_PROFILE==='1')workerProfiler=await startWorkerProfiler(page,
    {workerUrlIncludes:'sensor-render.worker',autoStart:false,interval:1000});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173');
  await startProfileRun(page,5);
  const readbackMode=process.env.SENSOR_READBACK_MODE;
  if(readbackMode&&!['sync','async'].includes(readbackMode))throw Error('Invalid SENSOR_READBACK_MODE');
  if(readbackMode)await page.evaluate(mode=>window.__slamLab.runtime.world.sensorRpc.call('configure',{readbackMode:mode}),readbackMode);
  const result=await page.evaluate(async repeats=>{
    const lab=window.__slamLab,r=lab.runtime,w=r.world;
    if(!w.sensorRpc)throw Error('Dedicated sensor worker unavailable');
    const pose=w.committedTruth,motion=w.actorMotion,timeBefore=r.time;
    const capture=(lidarEnabled,profileGpu=false)=>w.sensorRpc.call('capture',{truth:pose,actorMotion:motion,lidarEnabled,profileGpu});
    const rows=[];
    for(const lidarEnabled of [false,true]){
      const base=await capture(lidarEnabled),bytes=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
      for(let index=0;index<repeats;index++){
        const start=performance.now(),current=await capture(lidarEnabled,true);
        const rpcWallMs=performance.now()-start;
        for(const name of ['rgb','depth']){
          const a=bytes(base[name]),b=bytes(current[name]);
          if(a.length!==b.length||!a.every((v,i)=>v===b[i]))throw Error(`Profile changed raw ${name} bytes`);
        }
        if(lidarEnabled){const a=bytes(base.scan.samples),b=bytes(current.scan.samples);if(!a.every((v,i)=>v===b[i]))throw Error('Profile changed scan bytes');}
        rows.push({index,lidarEnabled,rpcWallMs,parityCheckWallMs:performance.now()-start-rpcWallMs,
          graphics:current.graphics,cameraTimings:current.cameraTimings,lidarTimings:current.lidarTimings,
          gpuProfile:current.gpuProfile,rawBytesMatch:true,rgbBytes:current.rgb.byteLength,depthBytes:current.depth.byteLength,
          scanBytes:current.scan?.samples.byteLength??0});
      }
    }
    if(r.time!==timeBefore)throw Error('Capture diagnostic advanced physics');
    return {timeBefore,timeAfter:r.time,viewerWorker:!!lab.viewer,viewerGraphics:lab.viewer?.graphics,rows};
  },repeats);
  if(process.env.PERF_PATH||workerProfiler){
    if(process.env.PERF_PATH){
    const cdp=await browser.newBrowserCDPSession(),{processInfo}=await cdp.send('SystemInfo.getProcessInfo');
    const targets=processInfo.filter(p=>/renderer|gpu/i.test(p.type));
    if(!targets.length)throw Error('No browser process targets');
    fs.writeFileSync(path.join(directory,'perf-targets.json'),JSON.stringify(targets,null,2)+'\n');
    const fd=fs.openSync(path.join(directory,'perf-record.log'),'w');
    recorder=spawn(process.env.PERF_PATH,['record','-e','cpu-clock:u','-F','99','-g','--call-graph','dwarf,8192',
      '-p',targets.map(p=>p.id).join(','),'-o',path.join(directory,'perf.data'),'--','sleep','8'],{stdio:['ignore',fd,fd]});
    fs.closeSync(fd);
    result.perfRecorderPending=new Promise((resolve,reject)=>{recorder.once('error',reject);recorder.once('close',(code,signal)=>resolve({code,signal}));});
    }
    if(workerProfiler)await workerProfiler.start();
    result.perfCapture=await page.evaluate(async()=>{
      const r=window.__slamLab.runtime,w=r.world,start=performance.now(),time=r.time;
      let captures=0;while(performance.now()-start<8500){await w.sensorRpc.call('capture',{truth:w.committedTruth,actorMotion:w.actorMotion,lidarEnabled:true});captures++;}
      if(r.time!==time)throw Error('Profile loop advanced physics');
      return {captures,wallMs:performance.now()-start,time};
    });
    if(workerProfiler){
      const profile=await workerProfiler.stop();workerProfiler=undefined;
      fs.writeFileSync(path.join(directory,'sensor-worker.cpuprofile.json'),JSON.stringify(profile)+'\n');
      if(profile.status!=='ACTUAL_WORKER_CPU_PROFILE_CAPTURED')throw Error(`Sensor worker CPU profiler failed: ${profile.error}`);
      result.cpuProfile={worker:profile.worker,samples:profile.profile.samples.length,
        durationMs:(profile.profile.endTime-profile.profile.startTime)/1000};
    }
    if(result.perfRecorderPending){
      result.perfRecorder=await result.perfRecorderPending;delete result.perfRecorderPending;
      if(result.perfRecorder.code!==0)throw Error('Sensor perf recorder failed');
    }
  }
  const sourcesAfter=sourceManifest();
  if(JSON.stringify(sourcesBefore)!==JSON.stringify(sourcesAfter))throw Error('Profile sources changed during capture');
  if(hostOnly&&profileRouteRequests<1)throw Error('Profiler diagnostic route was not used');
  for(const row of result.rows){
    const events=row.gpuProfile.events;
    if(readbackMode==='async'&&!events.some(event=>event.kind==='fence-wait'))
      throw Error('Asynchronous capture has no completed fence measurement');
    if(hostOnly&&row.gpuProfile.timerSupported)throw Error('Host-only diagnostic enabled GPU timer queries');
  }
  fs.writeFileSync(path.join(directory,'sources.json'),JSON.stringify(sourcesBefore,null,2)+'\n');
  const report={schemaVersion:1,status:'HELD_POSE_SENSOR_WORKER_GPU_TIMING_AND_RAW_PARITY_COMPLETE',
    recordedAt:new Date().toISOString(),browser:browser.version(),probeSha256:sha(fs.readFileSync(import.meta.filename)),
    ...result,readbackMode:readbackMode??'hardware-default',hostOnly,repeats,profileRouteRequests,
    sourceBookendsEqual:true,errors,fullSlam:false,
    scope:'Current application sensor-worker captures at one held committed pose with medium detail and visible viewer. Profiled repeats with LiDAR off/on compare every raw RGB/depth/scan byte against uninstrumented captures. RPC wall time excludes the subsequent parity check but includes profiler completion/query waits. Fence wait includes event-loop scheduling; post-fence copy includes browser/driver mapping/transport, not just memcpy. Host-only mode omits GPU timer queries. This is not a pipeline throughput benchmark. Optional perf samples include renderer/UI/viewer/sensor/physics workers and GPU process; no kernel/off-CPU or complete causal attribution.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,captures:report.rows.length,errors,perf:report.perfRecorder}));
}catch(error){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2)+'\n');throw error;}
finally{if(recorder&&recorder.exitCode===null)recorder.kill('SIGTERM');if(workerProfiler)await workerProfiler.stop();await browser.close();}
