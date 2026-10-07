// Hardware sensor parity and a matched old/new rendering experiment. No SLAM
// or whole-simulation throughput claim follows from this held-pose benchmark.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const [directory]=process.argv.slice(2);
if(!directory)throw Error('OUTPUT_DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const settings={warmCaptures:Number(process.env.SLAM_SKELETON_WARM??20),timedCaptures:Number(process.env.SLAM_SKELETON_TIMED??200)};
if(!Object.values(settings).every(value=>Number.isInteger(value)&&value>0&&value<=5000))throw Error('Capture counts must be integers in 1..5000');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4181');
  await page.waitForFunction(()=>window.__slamLab?.latest?.frame.sequence>=5,{},{timeout:90000});
  await page.evaluate(async()=>{const r=window.__slamLab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));});
  const result=await page.evaluate(async settings=>{
    const lab=window.__slamLab,r=lab.runtime,w=r.world,rpc=w.sensorRpc,timeBefore=r.time;
    if(!rpc)throw Error('Dedicated sensor worker unavailable');
    const same=(a,b)=>a.byteLength===b.byteLength&&new Uint8Array(a.buffer,a.byteOffset,a.byteLength)
      .every((value,index)=>value===new Uint8Array(b.buffer,b.byteOffset,b.byteLength)[index]);
    const shape=frame=>({rgb:frame.rgb.byteLength,depth:frame.depth.byteLength,cloud:frame.depthCloud?.samples.byteLength??0,lidar:frame.scan?.samples.byteLength??0});
    const parity=[];
    let truth,actorMotion;
    for(const time of [0,3,11]){
      truth={...w.committedTruth,time,x:2,y:-1,z:2.4,quaternion:[1,0,0,0]};
      actorMotion=await r.modelicaMath.call('actors',{time});
      for(const lidarEnabled of [false,true]){
        const capture=profileGpu=>rpc.call('capture',{truth,actorMotion,lidarEnabled,profileGpu});
        await rpc.call('configure',{skeletonSharing:false,depthCloudEnabled:true});
        const original=await capture(false);
        await rpc.call('configure',{skeletonSharing:true});
        const shared=await capture(false);
        if(!same(original.rgb,shared.rgb)||!same(original.depth,shared.depth)
          ||!same(original.depthCloud.samples,shared.depthCloud.samples)
          ||lidarEnabled&&!same(original.scan.samples,shared.scan.samples))throw Error(`Sensor byte mismatch at ${time}, lidar=${lidarEnabled}`);
        parity.push({time,lidarEnabled,rawBytesMatch:true,bytes:shape(shared)});
      }
    }
    await rpc.call('configure',{depthCloudEnabled:false});
    truth={...w.committedTruth,time:3};actorMotion=await r.modelicaMath.call('actors',{time:3});
    const profiles=[];
    for(const skeletonSharing of [false,true]){
      await rpc.call('configure',{skeletonSharing});
      const profile=await rpc.call('capture',{truth,actorMotion,lidarEnabled:true,profileGpu:true});
      profiles.push({skeletonSharing,graphics:profile.graphics,gpuProfile:profile.gpuProfile});
    }
    const windows=[];
    // ABBA then BAAB for each sensor load. Configuration/rebuild,
    // profiling, parity comparisons and warmup are outside timed windows.
    for(const lidarEnabled of [false,true])for(let repetition=0;repetition<2;repetition++){
      for(const skeletonSharing of repetition===0?[false,true,true,false]:[true,false,false,true]){
        await rpc.call('configure',{skeletonSharing});
        const capture=()=>rpc.call('capture',{truth,actorMotion,lidarEnabled});
        for(let index=0;index<settings.warmCaptures;index++)await capture();
        const samples=[],worker=[],camera=[],start=performance.now();
        for(let index=0;index<settings.timedCaptures;index++){
          const began=performance.now(),frame=await capture();samples.push(performance.now()-began);
          worker.push(rpc.lastTimings?.workerMs??null);camera.push({...frame.cameraTimings});
        }
        windows.push({lidarEnabled,repetition,skeletonSharing,captures:samples.length,
          wallMs:performance.now()-start,samples,worker,camera});
      }
    }
    await rpc.call('configure',{skeletonSharing:true});
    if(r.time!==timeBefore)throw Error('Sensor experiment advanced simulation time');
    return {timeBefore,timeAfter:r.time,parity,profiles,windows};
  },settings);
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const summary=[false,true].map(lidarEnabled=>{
    const groups=[false,true].map(skeletonSharing=>{
      const selected=result.windows.filter(window=>window.lidarEnabled===lidarEnabled&&window.skeletonSharing===skeletonSharing);
      return {skeletonSharing,captures:selected.reduce((sum,window)=>sum+window.captures,0),
        meanRpcMs:mean(selected.flatMap(window=>window.samples)),
        meanCameraMs:mean(selected.flatMap(window=>window.camera.map(camera=>camera.total)))};
    });
    return {lidarEnabled,groups,rpcReductionPercent:100*(1-groups[1].meanRpcMs/groups[0].meanRpcMs)};
  });
  const report={schemaVersion:1,status:'SHARED_SKELETON_SENSOR_RAW_PARITY_AND_MATCHED_CAPTURE_COMPLETE',
    recordedAt:new Date().toISOString(),browser:browser.version(),probeSha256:sha(fs.readFileSync(import.meta.filename)),
    ...result,summary,settings,order:'ABBA then BAAB per sensor load',errors,fullSlam:false,
    scope:'Freshly cloned pedestrian meshes share only identical inverse-array owners and identical ordered bone objects. Six full RGB/depth/cloud/optional-LiDAR byte comparisons cover three Modelica actor-motion times. Held-pose captures in the actual dedicated worker with a visible viewer, ABBA then BAAB per sensor load and the recorded warm/timed capture counts. No physics advance, sensor cadence, full pipeline, 10x, cross-machine or uninstrumented GPU-profile performance claim.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(errors.length)throw Error('Browser errors during skeleton experiment');
  console.log(JSON.stringify({status:report.status,parity:report.parity,summary,errors}));
}catch(error){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2)+'\n');throw error;}
finally{await browser.close();}
