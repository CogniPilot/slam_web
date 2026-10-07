// Matched ABBA of the real lockstep pipeline. Experimental code is served only
// to this owned browser through diagnostic routes; production stays unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
import {readBatchPackedSync as directSyncReadback} from '../tests/fixtures/direct-sync-readback-method.mjs';
const [directory]=process.argv.slice(2);
if(!directory)throw Error('OUTPUT_DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const experiment=process.env.SENSOR_READBACK_EXPERIMENT??'combined';
if(!['combined','static-read','direct-sync','cpu-cores'].includes(experiment))throw Error('Unknown sensor experiment');
const parseCpus=value=>{
  if(!/^\d+(,\d+)*$/.test(value??''))throw Error('CPU experiment requires explicit comma-separated baseline/candidate CPU lists');
  const cpus=value.split(',').map(Number);
  if(new Set(cpus).size!==cpus.length||cpus.length>4)throw Error('Use distinct CPU IDs, at most four');
  return cpus;
};
const cpuSets=experiment==='cpu-cores'?[parseCpus(process.env.SENSOR_PROFILE_BASELINE_CPUS),parseCpus(process.env.SENSOR_PROFILE_CANDIDATE_CPUS)]:null;
const topology=cpuSets?[...new Set(cpuSets.flat())].map(cpu=>({cpu,
  core:Number(fs.readFileSync(`/sys/devices/system/cpu/cpu${cpu}/topology/core_id`)),
  socket:Number(fs.readFileSync(`/sys/devices/system/cpu/cpu${cpu}/topology/physical_package_id`))})):null;
if(topology&&new Set(topology.map(cpu=>`${cpu.socket}:${cpu.core}`)).size!==topology.length)
  throw Error('CPU experiment requires different physical cores, not sibling threads');
const files=['src/gpu-realsense-packing.ts','tests/fixtures/split-camera-packing.ts',
  'tests/fixtures/combined-camera-packing.ts',
  'tests/fixtures/direct-sync-readback-method.mjs',
  'src/world.ts','src/gpu-readback.ts','src/lidar.ts','src/runtime.ts','src/sensor-render.worker.ts',
  'public/vendor/rumoca/rumoca_bind_wasm_bg.wasm'];
const bookend=()=>Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(file))]));
const sourcesBefore=bookend(),errors=[],rows=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const cdp=await browser.newBrowserCDPSession();
const cpu=async()=>(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
const setBrowserAffinity=async cpus=>{
  // These IDs come from this freshly launched, owned browser's CDP session.
  // Set every current thread; future threads inherit their parent's mask.
  const processes=await cpu(),observed=[];
  for(const process of processes){
    execFileSync('taskset',['-apc',cpus.join(','),String(process.id)],{stdio:'pipe'});
    const threads=fs.readdirSync(`/proc/${process.id}/task`);
    for(const tid of threads){
      let status;
      try{status=fs.readFileSync(`/proc/${process.id}/task/${tid}/status`,'utf8');}
      catch(error){if(error.code==='ENOENT')continue;throw error;}
      const allowed=status.match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1];
      const expanded=allowed?.split(',').flatMap(part=>{
        const [first,last=first]=part.split('-').map(Number);
        return Array.from({length:last-first+1},(_,index)=>first+index);
      });
      if(JSON.stringify(expanded)!==JSON.stringify([...cpus].sort((a,b)=>a-b)))throw Error('Owned browser thread affinity mismatch');
      observed.push({pid:process.id,tid:Number(tid),type:process.type,allowed});
    }
  }
  return {requested:cpus,observed};
};
try{
  for(const [ordinal,combined] of [false,true,true,false].entries()){
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    let referenceRequests=0;
    if(combined&&experiment==='combined')await context.route('**/src/gpu-realsense-packing.ts*',async route=>{
      const reference=new URL('/tests/fixtures/combined-camera-packing.ts',route.request().url());
      const response=await route.fetch({url:reference.href});
      if(!response.ok())throw Error('Cannot serve frozen packing reference');
      referenceRequests++;await route.fulfill({response});
    });
    if(combined&&experiment==='static-read')await context.route('**/src/gpu-readback.ts*',async route=>{
      const response=await route.fetch(),source=await response.text();
      if(!source.includes('gl.STREAM_READ'))throw Error('Readback allocation hint absent');
      referenceRequests++;await route.fulfill({response,body:source.replaceAll('gl.STREAM_READ','gl.STATIC_READ')});
    });
    if(combined&&experiment==='direct-sync')await context.route('**/src/gpu-readback.ts*',async route=>{
      const response=await route.fetch(),source=await response.text();
      const method=/  readBatchPackedSync\(capacity, submit, destination\) \{[\s\S]*?\n  \}/g;
      if([...source.matchAll(method)].length!==1)throw Error('Expected one compiled packed synchronous method');
      const body=source.replace(method,directSyncReadback.toString().replace(/^function /,''));
      referenceRequests++;await route.fulfill({response,body});
    });
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173');
    await page.waitForFunction(()=>window.__slamLab?.latest?.frame.sequence>=2,{},{timeout:90000});
    await page.evaluate(async()=>{
      const lab=window.__slamLab,r=lab.runtime;r.pause();
      while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));
      const p=structuredClone(lab.project);
      if(p.algorithmPreset!=='Modelica inertial propagation')throw Error('Unexpected estimator');
      Object.assign(p,{sceneDetail:'medium',environment:'city',lidarEnabled:true,depthCloudEnabled:false,
        carsEnabled:true,peopleEnabled:true,sensorRates:{cameraHz:30,lidarHz:10,imuHz:90,gpsHz:5}});
      await r.compile(p);
      await r.world.sensorRpc.call('configure',{readbackMode:'sync'});
    });
    const affinity=cpuSets?await setBrowserAffinity(cpuSets[Number(combined)]):undefined;
    const parity=await page.evaluate(async()=>{
      const lab=window.__slamLab,r=lab.runtime;
      const rows=[],digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
        byte=>byte.toString(16).padStart(2,'0')).join('');
      for(let index=0;index<12;index++){
        await r.step();
        if(index%3===0){
          const f=lab.latest.frame,s=r.world.latestLidar;
          const bytes=array=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
          rows.push({sequence:f.sequence,time:f.time,rgb:await digest(bytes(f.rgb)),depth:await digest(bytes(f.depth)),
            lidarTime:s?.time,lidar:s?await digest(bytes(s.samples)):null});
        }
      }
      return rows;
    });
    const before=await cpu();
    const result=await page.evaluate(async()=>{
      const lab=window.__slamLab,r=lab.runtime,start=performance.now(),time=r.time;
      const sequence=lab.latest.frame.sequence,display=new Map(),frames=[];
      for(let index=0;index<150;index++){
        const started=performance.now();await r.step();const f=lab.latest.frame;
        if(f.sequence!==sequence+index+1||Math.abs(f.dt-1/30)>1e-12
          ||Math.abs(f.time-time-(index+1)/30)>1e-9)throw Error('Lockstep frame clock changed');
        frames.push({wallMs:performance.now()-started,nodes:{...r.lastTimings},camera:{...r.world.captureTimings}});
        if(lab.viewer?.latest)display.set(lab.viewer.latest.timestamp,{...lab.viewer.latest});
      }
      const wallMs=performance.now()-start;
      return {wallMs,simSeconds:r.time-time,rtf:(r.time-time)*1000/wallMs,frames,
        graphics:r.world.graphics,viewerGraphics:lab.viewer?.graphics,display:[...display.values()],rates:r.project.sensorRates};
    });
    const after=await cpu(),old=new Map(before.map(process=>[process.id,process.cpuTime]));
    const cpuSeconds=after.reduce((sum,process)=>sum+(old.has(process.id)?process.cpuTime-old.get(process.id):0),0);
    if(combined&&experiment!=='cpu-cores'&&referenceRequests<1)throw Error('Experimental route was not used');
    const row={ordinal,combined,referenceRequests,affinity,parity,cpuSeconds,approximateCpuCores:cpuSeconds*1000/result.wallMs,...result};
    rows.push(row);fs.writeFileSync(path.join(directory,`window-${ordinal}.json`),JSON.stringify(row,null,2)+'\n');
    console.log(JSON.stringify({ordinal,combined,rtf:row.rtf,cpuCores:row.approximateCpuCores}));
    await context.close();
  }
  if(errors.length)throw Error(`Browser errors: ${errors.join('; ')}`);
  if(rows.some(row=>JSON.stringify(row.parity)!==JSON.stringify(rows[0].parity)))throw Error('Raw RGB/depth/LiDAR flight hashes differ');
  const sourcesAfter=bookend();
  if(JSON.stringify(sourcesBefore)!==JSON.stringify(sourcesAfter))throw Error('Sources changed during benchmark');
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const group=combined=>{
    const selected=rows.filter(row=>row.combined===combined);
    return {meanRtf:mean(selected.map(row=>row.rtf)),meanCpuSeconds:mean(selected.map(row=>row.cpuSeconds)),
      meanCameraRenderMs:mean(selected.flatMap(row=>row.frames.map(frame=>frame.camera.renderSubmission))),
      meanCameraReadbackMs:mean(selected.flatMap(row=>row.frames.map(frame=>frame.camera.readback)))};
  };
  const baseline=group(false),combined=group(true);
  const report={status:'CAMERA_PACKING_ABBA_RAW_PARITY_PASS',recordedAt:new Date().toISOString(),
    browser:browser.version(),sources:sourcesBefore,sourceBookendsEqual:true,probeSha256:sha(fs.readFileSync(import.meta.filename)),
    experiment,topology,order:'production,experimental,experimental,production',baseline,combined,speedRatio:combined.meanRtf/baseline.meanRtf,
    cpuReduction:1-combined.meanCpuSeconds/baseline.meanCpuSeconds,errors,fullSlam:false,
    scope:'150 timed30Hz RGB8/Z16 camera frames per window,64beam10Hz GPU LiDAR,90Hz IMU,5Hz GPS, moving actors and visible independent viewer. Modelica inertial propagation only. Four raw-frame hash samples per window. '
      +(experiment==='cpu-cores'?'Only owned browser-process CPU affinity changes; this measures a diagnostic CPU-budget restriction, not a production optimization. '
        :'Experimental code is routed only into the owned browser; ')
      +'Tracked production sources are unchanged across windows. Browser CPU deltas are approximate. Not full SLAM or10x qualification.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}catch(error){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2)+'\n');throw error;}
finally{await browser.close();}
