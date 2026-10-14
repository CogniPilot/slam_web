import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {D435_PAIRED_RESOLUTIONS} from '../src/camera-resolutions.mjs';
import {summarizeCpuProfiles} from './browser-profile-summary.mjs';
const output=process.argv[2]??join(homedir(),'scratch/slam_web/profiles/browser-native-slam');
const url=process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173';
const cameraHz=Number(process.env.SLAM_PROFILE_CAMERA_HZ??5);
const imuHz=Number(process.env.SLAM_PROFILE_IMU_HZ??10);
const count=Number(process.env.SLAM_PROFILE_FRAMES??90);
const resolution=process.env.SLAM_PROFILE_RESOLUTION??'424x240';
const mode=D435_PAIRED_RESOLUTIONS.find(mode=>mode.id===resolution);
if(!mode||!Number.isInteger(count)||count<1||!Number.isFinite(cameraHz)||cameraHz<=0||cameraHz>mode.maxHz||!Number.isFinite(imuHz)||imuHz<=0)throw new Error('Invalid profile resolution, frame count or rates');
const cpuProfiling=process.env.SLAM_PROFILE_CPU_PROFILING==='1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);
  await page.waitForFunction(()=>window.__slamLab?.initialized&&window.__slamLab.ready,{},{timeout:120000});
  console.log('Baseline ready');
  const preparation=await page.evaluate(async({cameraHz,imuHz,resolution})=>{
    const lab=window.__slamLab,r=lab.runtime;
    r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));
    const p=structuredClone(lab.project);
    Object.assign(p,{slamBackend:'native',cameraResolution:resolution,sceneDetail:'low',depthCloudEnabled:false,lidarEnabled:false,
      sensorRates:{cameraHz,lidarHz:5,imuHz,gpsHz:1}});
    Object.assign(lab.project,p);
    const progress=[],originalStatus=r.onStatus;
    r.onStatus=text=>{progress.push(text);originalStatus(text);};
    const started=performance.now();await r.compile(p);r.onStatus=originalStatus;
    return {prepareMs:performance.now()-started,program:r.slamProgram,graphics:r.world.graphics,
      camera:r.world.calibration,rates:r.sensorClock.rates,progress};
  },{cameraHz,imuHz,resolution});
  console.log(JSON.stringify({preparation}));
  for(let i=0;i<10;i++)await page.evaluate(()=>window.__slamLab.runtime.step());
  const main=await page.context().newCDPSession(page),root=await browser.newBrowserCDPSession();
  const pending=new Map();let sequence=0;
  root.on('Target.receivedMessageFromTarget',event=>{
    const message=JSON.parse(event.message),key=`${event.sessionId}/${message.id}`,request=pending.get(key);
    if(request){clearTimeout(request.timer);pending.delete(key);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}
  });
  const call=(sessionId,method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,key=`${sessionId}/${id}`,timer=setTimeout(()=>{pending.delete(key);reject(Error(`Worker profiler timeout: ${method}`));},10000);
    pending.set(key,{resolve,reject,timer});
    root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);
  });
  const workers=[];
  if(cpuProfiling){
    await main.send('Profiler.enable');await main.send('Profiler.setSamplingInterval',{interval:1000});await main.send('Profiler.start');
    for(const target of (await root.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker')){
      const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
      await call(sessionId,'Profiler.enable');await call(sessionId,'Profiler.setSamplingInterval',{interval:1000});await call(sessionId,'Profiler.start');
      workers.push({sessionId,url:target.url});
    }
  }
  const report=await page.evaluate(async({count,cameraHz})=>{
    const lab=window.__slamLab,r=lab.runtime,rows=[];
    const step=r.slam.step.bind(r.slam);let stepMs=[];
    r.slam.step=async frame=>{const result=await step(frame);stepMs=result.stepMs;return result;};
    const timeBefore=r.time,sequenceBefore=lab.latest.frame.sequence,start=performance.now();
    for(let i=0;i<count;i++){
      const started=performance.now();await r.step();
      const {frame,estimate}=lab.latest;
      if(frame.sequence!==sequenceBefore+i+1)throw Error('Frame skipped');
      if(Math.abs(frame.time-timeBefore-(i+1)/cameraHz)>1e-8)throw Error('Clock drift');
      if(estimate.diagnostics.runtime!=='Rumoca native SLAM program')throw Error('Wrong estimator');
      if(![estimate.x,estimate.y,estimate.z,...estimate.quaternion].every(Number.isFinite))throw Error('Nonfinite estimate');
      if(Math.abs(Math.hypot(...estimate.quaternion)-1)>1e-6)throw Error('Quaternion not normalized');
      rows.push({sequence:frame.sequence,time:frame.time,wallMs:performance.now()-started,
        nodeMs:{...r.lastTimings},workerMs:structuredClone(r.lastWorkerTimings),
        stepMs:stepMs.slice(),position:[estimate.x,estimate.y,estimate.z],truth:structuredClone(lab.latest.truth),
        features:estimate.features?.length,points:estimate.points.length,
        diagnostics:{...estimate.diagnostics},tracking:estimate.tracking?.accepted});
    }
    const elapsedMs=performance.now()-start,simulationSeconds=r.time-timeBefore;
    return {elapsedMs,simulationSeconds,rtf:simulationSeconds/(elapsedMs/1000),rows,
      pendingNodes:Array.from(r.pendingNodes),final:rows.at(-1)};
  },{count,cameraHz});
  const profiles=[];
  if(cpuProfiling){
    const profile=(await main.send('Profiler.stop')).profile;
    await writeFile(join(output,'main.cpuprofile'),JSON.stringify(profile));profiles.push({role:'main',file:'main.cpuprofile'});
    for(const [i,worker]of workers.entries()){
      const {profile}=await call(worker.sessionId,'Profiler.stop'),file=`worker-${i}.cpuprofile`;
      await writeFile(join(output,file),JSON.stringify(profile));profiles.push({role:worker.url,file});
      await root.send('Target.detachFromTarget',{sessionId:worker.sessionId});
    }
    await writeFile(join(output,'profiles.json'),JSON.stringify(profiles,null,2));
    const attribution=await summarizeCpuProfiles(output);
    console.log(JSON.stringify({sampledCpuPercent:attribution.aggregatePercent}));
  }
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const sorted=report.rows.map(r=>r.wallMs).sort((a,b)=>a-b);
  const summary={recordedAt:new Date().toISOString(),browser:browser.version(),resolution,cameraHz,imuHz,frames:count,cpuProfiling,preparation,
    meanFrameMs:mean(sorted),p50FrameMs:sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.floor(sorted.length*.95)],
    meanNativeMs:mean(report.rows.map(r=>r.diagnostics.stepMsTotal)),
    meanImageStepMs:mean(report.rows.map(r=>r.stepMs[0])),
    meanImuStepMs:mean(report.rows.flatMap(r=>r.stepMs.slice(1))),
    meanNodeMs:Object.fromEntries(Object.keys(report.rows[0].nodeMs).map(k=>[k,mean(report.rows.map(r=>r.nodeMs[k]))])),
    elapsedMs:report.elapsedMs,simulationSeconds:report.simulationSeconds,rtf:report.rtf,
    final:report.final,pendingNodes:report.pendingNodes,errors,
    scope:`Actual built SLAM Web: live ${resolution} GPU RGB-D captures, physics, sensor model, native full SLAM worker, visible viewer; low graphics, no LiDAR or depth-cloud display. Ten warmup frames; unpaced sequential runtime.step calls; CPU sampling ${cpuProfiling?'enabled':'disabled'}. Shared host.`};
  await writeFile(join(output,'report.json'),JSON.stringify({summary,rows:report.rows},null,2));
  await page.screenshot({path:join(output,'world.png'),fullPage:true});
  console.log(JSON.stringify(summary,null,2));
  if(errors.length)process.exitCode=1;
}catch(error){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2));throw error;}
finally{await browser.close();}
