// Current application pipeline, including real GPU captures and the visible viewer.
// Component timings are diagnostic; this is not a full-SLAM acceptance gate.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {startProfileRun} from './start-profile-run.mjs';

const [directory]=process.argv.slice(2);
if(!directory)throw Error('OUTPUT_DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const url=process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173';
const skeletonMode=process.env.SLAM_PROFILE_SKELETONS==='1';
const cameraHz=Number(process.env.SLAM_PROFILE_CAMERA_HZ??30);
if(![15,30,60].includes(cameraHz))throw Error('SLAM_PROFILE_CAMERA_HZ must match a supported paired RGB-D rate:15,30,60');
const warmFrames=12,timedFrames=Number(process.env.SLAM_PROFILE_FRAMES??180);
if(!Number.isInteger(timedFrames)||timedFrames<1||timedFrames>2000)throw Error('SLAM_PROFILE_FRAMES must be an integer in 1..2000');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(url);
  await startProfileRun(page,1);
  const cdp=await browser.newBrowserCDPSession();
  const cpu=async()=>{
    const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');
    return processInfo.map(p=>({id:p.id,type:p.type,cpuTime:p.cpuTime}));
  };
  const rows=[];
  // A/B/B/A, the same initial source, seed, trajectory and selected camera clock.
  const controls=[false,true,true,false].map(enabled=>({lidarEnabled:skeletonMode?true:enabled,skeletonSharing:skeletonMode?enabled:undefined}));
  for(const [ordinal,{lidarEnabled,skeletonSharing}] of controls.entries()){
    await page.evaluate(async({lidarEnabled,skeletonSharing,warmFrames,cameraHz})=>{
      const lab=window.__slamLab,r=lab.runtime;
      const p=structuredClone(lab.project);
      if(p.algorithmPreset!=='Modelica inertial propagation')throw Error('Unexpected estimator');
      p.sceneDetail='medium';p.depthCloudEnabled=false;p.lidarEnabled=lidarEnabled;
      p.sensorRates={cameraHz,lidarHz:10,imuHz:90,gpsHz:5};
      Object.assign(lab.project,p);
      await r.compile(p);
      if(skeletonSharing!==undefined){
        if(!r.world.sensorRpc)throw Error('Skeleton experiment requires dedicated sensor worker');
        await r.world.sensorRpc.call('configure',{skeletonSharing});
      }
      for(let i=0;i<warmFrames;i++)await r.step();
    },{lidarEnabled,skeletonSharing,warmFrames,cameraHz});
    const before=await cpu();
    const result=await page.evaluate(async({timedFrames,cameraHz})=>{
      const lab=window.__slamLab,r=lab.runtime,w=r.world,rows=[],display=[];
      const start=performance.now(),timeBefore=r.time;
      const initialDisplayTimestamp=lab.viewer?.latest?.timestamp??-Infinity;
      let sequence=lab.latest.frame.sequence;
      for(let index=0;index<timedFrames;index++){
        const t=performance.now();await r.step();
        const latest=lab.latest;
        if(latest.frame.sequence!==sequence+1)throw Error('Frame skipped or replayed');
        if(Math.abs(latest.frame.dt-1/cameraHz)>1e-12)throw Error('Camera clock changed');
        if(Math.abs(latest.frame.time-timeBefore-(index+1)/cameraHz)>1e-9)throw Error('Simulation clock drift');
        sequence=latest.frame.sequence;
        rows.push({frameMs:performance.now()-t,nodeMs:{...r.lastTimings},
          workerMs:structuredClone(r.lastWorkerTimings),camera:{...w.captureTimings},
          lidar:w.latestLidar?.time===latest.frame.time?{...w.lidar.timings}:null,
          features:latest.estimate.features?.length??0});
        if(lab.viewer?.latest&&lab.viewer.latest.timestamp>initialDisplayTimestamp)display.push({...lab.viewer.latest});
      }
      const elapsedMs=performance.now()-start;
      const uniqueDisplay=Array.from(new Map(display.map(s=>[s.timestamp,s])).values());
      return {elapsedMs,simSeconds:r.time-timeBefore,rtf:(r.time-timeBefore)/(elapsedMs/1000),
        frames:rows.length,sequenceStart:sequence-rows.length,sequenceEnd:sequence,
        graphics:w.graphics,viewerWorker:!!lab.viewer,sensorWorker:!!w.sensorRpc,
        depthCloudEnabled:w.depthCloudEnabled,rows,display:uniqueDisplay,
        viewerGraphics:lab.viewer?.graphics,algorithm:r.project.algorithmPreset,
        detail:r.project.sceneDetail,rates:r.project.sensorRates,detector:r.project.detectorPreset};
    },{timedFrames,cameraHz});
    const after=await cpu(),old=new Map(before.map(p=>[p.id,p]));
    const processCpu=after.map(p=>({...p,cpuDeltaSeconds:old.has(p.id)?p.cpuTime-old.get(p.id).cpuTime:null}));
    const cpuSeconds=processCpu.reduce((sum,p)=>sum+(p.cpuDeltaSeconds??0),0);
    const record={ordinal,lidarEnabled,skeletonSharing,...result,processCpu,cpuSeconds,
      approximateCpuCores:cpuSeconds/(result.elapsedMs/1000)};
    rows.push(record);fs.writeFileSync(path.join(directory,`window-${ordinal}.json`),JSON.stringify(record,null,2)+'\n');
    console.log(JSON.stringify({ordinal,lidarEnabled,rtf:result.rtf,elapsedMs:result.elapsedMs,
      cpuCores:record.approximateCpuCores,viewerFps:result.display.map(s=>s.fps)}));
  }
  const summary=rows.map(r=>{
    const mean=values=>values.reduce((sum,v)=>sum+v,0)/values.length;
    const nodeMs={};for(const name of Object.keys(r.rows[0].nodeMs))nodeMs[name]=mean(r.rows.map(s=>s.nodeMs[name]));
    return {ordinal:r.ordinal,lidarEnabled:r.lidarEnabled,skeletonSharing:r.skeletonSharing,rtf:r.rtf,meanFrameMs:mean(r.rows.map(s=>s.frameMs)),nodeMs,
      meanViewerFps:r.display.length?mean(r.display.map(s=>s.fps)):null,
      approximateCpuCores:r.approximateCpuCores};
  });
  const report={schemaVersion:1,status:errors.length?'BROWSER_ERRORS':'LIVE_INERTIAL_LOCKSTEP_PROFILE_COMPLETE',
    recordedAt:new Date().toISOString(),browser:browser.version(),url,probeSha256:sha(fs.readFileSync(import.meta.filename)),
    order:skeletonMode?'ABBA, A=original skeletons, B=shared skeletons, LiDAR10Hz on throughout':'ABBA, A=LiDAR off, B=10Hz LiDAR on',warmFrames,timedFrames,cameraHz,
    summary,errors,fullSlam:false,
    scope:'Current built application, Modelica inertial preset and current detector, medium city, visible independent viewer, real RGB/depth GPU capture, optional64beam10HzLiDAR. Identical seeded initial state per window, integer lockstep checks. Browser process CPU deltas include all browser processes over approximately the timed window; process creation/exit and CDP overhead limit precision. Profiling excludes startup/warmup and does not prove fullSLAM,10x, physical-core utilization or cross-machine performance.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw Error('Browser errors during live pipeline profile');
}catch(error){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2)+'\n');throw error;}
finally{await browser.close();}
