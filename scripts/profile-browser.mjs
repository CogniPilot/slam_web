import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {nativeProfileMetadata} from '../dev/chromium-native-profile.mjs';
import {startSessionTiming,startRpcTiming} from '../dev/profile-session-instrumentation.mjs';

// Run against the built preview. One browser, bounded sample count, no server
// or machine settings changed. perf can wrap this process and its descendants.
const output=path.resolve(process.env.SLAM_PROFILE_OUT??path.join(process.env.HOME,'scratch/slam_web/profiles/browser'));
const count=Number(process.env.SLAM_PROFILE_FRAMES??60);
if(!Number.isInteger(count)||count<10||count>1800)throw new Error('Profile frames must be 10..1800');
await mkdir(output,{recursive:true});
// Bind timings to the actual built renderer/worker bundle, not subsequently
// edited source. Modelica input hashes are captured from the live project below.
const bundle={};
const bundleRoot=path.resolve(process.env.SLAM_PROFILE_BUNDLE_DIR??'dist');
const profileUrl=process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173';
for(const name of ['index.html',...(await readdir(path.join(bundleRoot,'assets'))).filter(name=>/\.(js|wasm)$/.test(name)).map(name=>'assets/'+name)]){
  const bytes=await readFile(path.join(bundleRoot,name));
  const served=await fetch(new URL(name,profileUrl));
  if(!served.ok||!Buffer.from(await served.arrayBuffer()).equals(bytes))throw Error(`Profile server does not serve the inventoried bundle: ${name}`);
  bundle[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile(path.join(output,'bundle.json'),JSON.stringify(bundle,null,2));
// Review a paired compiler package without changing the deployed application's pin.
const compilerDirectory=process.env.SLAM_PROFILE_COMPILER_DIR;
const compilerFiles=new Map(),compilerManifest={source:compilerDirectory?'review-package':'served-static-package',files:[]};
for(const name of ['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm']){
  let bytes;
  if(compilerDirectory)bytes=await readFile(path.join(compilerDirectory,name));
  else{
    const response=await fetch(new URL(`vendor/rumoca/${name}`,profileUrl));
    if(!response.ok)throw Error(`Cannot inventory compiler asset: ${name}`);
    bytes=Buffer.from(await response.arrayBuffer());
  }
  compilerFiles.set(name,bytes);
  compilerManifest.files.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(path.join(output,'compiler.json'),JSON.stringify(compilerManifest,null,2));
const hardware=process.env.SLAM_PROFILE_SOFTWARE!=='1';
const phoneViewport=process.env.SLAM_PROFILE_PHONE_VIEWPORT==='1';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox',...(process.env.SLAM_PROFILE_JIT==='1'?['--js-flags=--perf-basic-prof --interpreted-frames-native-stack']:[]),...(hardware?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])]});
const perfProcesses=[];
const stopPerf=async()=>{for(const child of perfProcesses){if(child.pid&&child.exitCode===null&&child.signalCode===null){child.kill('SIGINT');await new Promise(resolve=>child.once('exit',resolve));}}};
try {
  const page=await browser.newPage(phoneViewport
    ?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3}
    :{viewport:{width:1440,height:1000}}),errors=[];
  await page.route('**/vendor/rumoca/rumoca_bind_wasm*',route=>{
    const name=path.basename(new URL(route.request().url()).pathname),bytes=compilerFiles.get(name);
    return bytes?route.fulfill({body:bytes,contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript'}):route.continue();
  });
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(profileUrl);
  await page.waitForFunction(()=>{const lab=window.__slamLab;return lab?.initialized&&lab.ready;},{},{timeout:90000});
  await page.evaluate(async()=>{const r=window.__slamLab.runtime;r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));});
  const settings={environment:process.env.SLAM_PROFILE_SCENE??'city',sceneDetail:process.env.SLAM_PROFILE_DETAIL??'high',lidarEnabled:process.env.SLAM_PROFILE_LIDAR==='1',depthCloudEnabled:process.env.SLAM_PROFILE_DEPTH_CLOUD!=='0'};
  if(process.env.SLAM_PROFILE_SENSOR_RATES)settings.sensorRates=JSON.parse(process.env.SLAM_PROFILE_SENSOR_RATES);
  // The complete Modelica SLAM profile is pending. Select the available INS
  // workload explicitly and keep that limitation in the durable report.
  const algorithm=await readFile(new URL('../models/Libraries/CogniPilot/SLAM/Examples/InertialOnly.mo',import.meta.url),'utf8');
  await page.evaluate(async({settings,algorithm})=>{
    const lab=window.__slamLab;
    Object.assign(lab.project,settings,{algorithm,algorithmPreset:'Modelica inertial propagation',runtime:'modelica',
      entryPoint:'SLAM.Examples.InertialOnly',mainSourcePath:'models/Libraries/CogniPilot/SLAM/Examples/InertialOnly.mo'});
    delete lab.project.algorithmArtifact;await lab.runtime.compile(lab.project);
  },{settings,algorithm});
  const readback=process.env.SLAM_PROFILE_READBACK??(hardware?'sync':'async');
  if(!['async','sync'].includes(readback))throw new Error('SLAM_PROFILE_READBACK must be async or sync');
  await page.evaluate(mode=>window.__slamLab.runtime.world.setSensorReadback(mode),readback);
  const packedReadback=process.env.SLAM_PROFILE_PACKED_READBACK;
  if(packedReadback!==undefined){
    if(!['0','1'].includes(packedReadback))throw new Error('Invalid packed readback mode');
    await page.evaluate(enabled=>window.__slamLab.runtime.world.setSensorPackedReadback(enabled),packedReadback==='1');
  }
  const denseCloudReadback=process.env.SLAM_PROFILE_DENSE_CLOUD_READBACK;
  if(denseCloudReadback!==undefined){
    if(!['0','1'].includes(denseCloudReadback))throw new Error('Invalid dense cloud readback mode');
    await page.evaluate(enabled=>window.__slamLab.runtime.world.setDepthCloudReadback(enabled),denseCloudReadback==='1');
  }
  const geometryBatching=process.env.SLAM_PROFILE_GEOMETRY_BATCHING;
  if(geometryBatching!==undefined){
    if(!['0','1'].includes(geometryBatching))throw new Error('SLAM_PROFILE_GEOMETRY_BATCHING must be 0 or 1');
    await page.evaluate(enabled=>window.__slamLab.runtime.world.setSensorGeometryBatching(enabled),geometryBatching==='1');
  }
  if(process.env.SLAM_PROFILE_GPU_TIMERS==='1')await page.evaluate(()=>{
    const rpc=window.__slamLab.runtime.world.sensorRpc,call=rpc.call.bind(rpc);
    rpc.call=(type,args,timeout)=>call(type,['capture','capture-lidar'].includes(type)?{...args,profileGpu:true}:args,timeout);
  });
  for(let i=0;i<10;i++)await page.evaluate(()=>window.__slamLab.runtime.step());
  const workload=await page.evaluate(async()=>{
    const p=window.__slamLab.project;
    const hash=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),v=>v.toString(16).padStart(2,'0')).join('');
    return {profile:window.__slamLab.runtime.pendingNodes?.size?'Camera + Modelica inertial propagation; native vision and full SLAM pending':'Modelica inertial propagation with RGB-D feature detection; full SLAM is not measured',seed:p.seed,detectorPreset:p.detectorPreset,detectorLanguage:p.detectorLanguage,
      algorithmPreset:p.algorithmPreset,runtime:p.runtime,carsEnabled:p.carsEnabled??true,
      peopleEnabled:p.peopleEnabled??true,lightingMode:p.lightingMode??'day',depthCloudEnabled:p.depthCloudEnabled??true,
      sensorRates:window.__slamLab.runtime.sensorClock.rates,
      cloudPresentation:window.__slamLab.runtime.world.latestDepthRaster?'native-z16-gpu-unprojection':window.__slamLab.runtime.world.latestDepthCloud?'dense-flu-xyz-f32':null,
      camera:{width:window.__slamLab.latest.frame.calibration.width,height:window.__slamLab.latest.frame.calibration.height,
        rgbBytes:window.__slamLab.latest.frame.rgb.byteLength,depthBytes:window.__slamLab.latest.frame.depth.byteLength,
        imageLayout:window.__slamLab.latest.frame.imageLayout},
      sourceSha256:{physics:await hash(p.physics),sensor:await hash(p.sensorModelica),evaluation:await hash(p.evaluationModelica),detector:await hash(p.detector),algorithm:await hash(p.algorithm),graph:await hash(JSON.stringify(p.graph))}};
  });
  const detectorArtifact=await page.evaluate(()=>window.__slamLab.project.detectorArtifact);
  if(detectorArtifact)await writeFile(path.join(output,'detector-artifact.json'),JSON.stringify(detectorArtifact));
  await writeFile(path.join(output,'pending-nodes.json'),JSON.stringify(await page.evaluate(()=>Array.from(window.__slamLab.runtime.pendingNodes??[]))));
  const cpuProfiling=process.env.SLAM_PROFILE_CPU_PROFILING!=='0';
  const cdp=await page.context().newCDPSession(page);
  const throttle=Number(process.env.SLAM_PROFILE_MAIN_CPU_THROTTLE??1);
  if(throttle>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
  if(cpuProfiling){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');}
  // Attach the same CPU profiler to actual dedicated WASM workers.
  const root=await browser.newBrowserCDPSession(),pending=new Map();let id=0;
  root.on('Target.receivedMessageFromTarget',event=>{
    const message=JSON.parse(event.message),key=`${event.sessionId}/${message.id}`,request=pending.get(key);
    if(request){clearTimeout(request.timer);pending.delete(key);message.error?request.reject(new Error(message.error.message)):request.resolve(message.result);}
  });
  const call=(sessionId,method,params={})=>new Promise((resolve,reject)=>{
    const sequence=++id,key=`${sessionId}/${sequence}`,timer=setTimeout(()=>{pending.delete(key);reject(new Error(`Worker profiler timeout: ${method}`));},10000);
    pending.set(key,{resolve,reject,timer});
    root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:sequence,method,params})}).catch(error=>{clearTimeout(timer);pending.delete(key);reject(error);});
  });
  const workers=[];
  for(const target of cpuProfiling?(await root.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker'):[]){
    const {sessionId}=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
    try{await call(sessionId,'Profiler.enable');await call(sessionId,'Profiler.setSamplingInterval',{interval:1000});await call(sessionId,'Profiler.start');workers.push({sessionId,url:target.url});}
    catch(error){console.log(`Worker profile unavailable for ${target.url}: ${error.message}`);}
  }
  const sessionTiming=process.env.SLAM_PROFILE_SESSION_TIMING==='1'?await startSessionTiming(root,call,new URL('.',profileUrl).href):undefined;
  if(sessionTiming)await page.evaluate(startRpcTiming);
  const executionReceipt=()=>page.evaluate(()=>window.__slamLab.runtime.physics.call('executionReceipt'));
  const executionBefore=process.env.SLAM_PROFILE_EXECUTION_RECEIPT==='1'?await executionReceipt():undefined;
  const cpuBefore=(await root.send('SystemInfo.getProcessInfo')).processInfo;
  const processSnapshot=async processes=>{
    const result=[];
    for(const process of processes){
      try{const [status,stat]=await Promise.all([readFile('/proc/'+process.id+'/status','utf8'),readFile('/proc/'+process.id+'/stat','utf8')]);
        const fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);
        result.push({pid:process.id,type:process.type,affinity:status.match(/^Cpus_allowed_list:\s*(.+)$/m)?.[1],nice:Number(fields[16])});
      }catch{}
    }return {loadavg:(await readFile('/proc/loadavg','utf8')).trim(),processes:result};
  };
  const normalBefore=!cpuProfiling?await processSnapshot(cpuBefore):undefined;
  const finishNative=process.env.SLAM_PROFILE_NATIVE_TRACE==='1'?await nativeProfileMetadata(root,output,cpuBefore):undefined;
  // Attach perf only to this browser's process IDs, after assets and warmup.
  // This excludes compiler startup and never samples another browser or build.
  if(process.env.SLAM_PROFILE_PERF){
    const pids=cpuBefore.map(info=>info.id).join(',');
    for(const [kind,args] of [['stat',['stat','-o',path.join(output,'perf-stat.txt'),'-e','task-clock,page-faults','-p',pids]],['record',['record','-o',path.join(output,'perf.data'),'-e','cpu-clock:u','-F','99','--call-graph','dwarf,8192','-p',pids]]]){
      const child=spawn(process.env.SLAM_PROFILE_PERF,args,{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',data=>stderr+=data);
      child.once('error',error=>errors.push(`perf ${kind}: ${error.message}`));child.once('exit',code=>{if(code&&code!==130)errors.push(`perf ${kind}: ${stderr.trim()}`);});perfProcesses.push(child);
    }
  }
  const report=await page.evaluate(async({count})=>{
    const lab=window.__slamLab,r=lab.runtime,samples=[],wall=performance.now();
    const flowBefore=new Map(Array.from(r.flow.stats,([key,value])=>[key,value.count]));
    const startSimulationTime=r.time;
    const displayCloudTransferBefore=lab.viewer?.cloudTransfer?.stats;
    for(let i=0;i<count;i++){
      const start=performance.now();await r.step();
      samples.push({sequence:lab.latest.frame.sequence,time:lab.latest.frame.time,totalMs:performance.now()-start,nodes:{...r.lastTimings},workers:structuredClone(r.lastWorkerTimings),transport:structuredClone(r.lastTransportTimings),camera:{...r.world.captureTimings},sensorGpu:r.world.sensorGpuProfile,lidar:r.world.lidar.timings?{...r.world.lidar.timings}:undefined,display:lab.viewer?.latest??lab.performanceMonitor.latest,ate:Number(document.getElementById('metric-ate').textContent.replace(/[^0-9.]/g,'')),points:lab.latest.estimate.points.length,diagnostics:structuredClone(lab.latest.estimate.diagnostics),trackingReason:lab.latest.estimate.tracking?.reason});
    }
    return {graphics:r.world.graphics,elapsedMs:performance.now()-wall,dt:r.dt,samples,startSimulationTime,displayCloudTransferBefore,displayCloudTransferAfter:lab.viewer?.cloudTransfer?.stats,
      flowCounts:Object.fromEntries(Array.from(r.flow.stats,([key,value])=>[key,value.count-(flowBefore.get(key)??0)]))};
  },{count});
  const cpuAfter=(await root.send('SystemInfo.getProcessInfo')).processInfo;
  const executionAfter=executionBefore?await executionReceipt():undefined;
  const sessionReport=sessionTiming?{...await sessionTiming.finish(),rpc:await page.evaluate(()=>window.__profileRpcTiming.finish())}:undefined;
  if(normalBefore)await writeFile(path.join(output,'normal-process-metadata.json'),JSON.stringify({before:normalBefore,after:await processSnapshot(cpuAfter),scope:'One-time process metadata outside measured loop; no CPU/GPU/native sampling'},null,2));
  await stopPerf();
  await finishNative?.();
  const previousCpu=new Map(cpuBefore.map(info=>[info.id,info.cpuTime]));
  const cpuSeconds=cpuAfter.reduce((sum,info)=>sum+Math.max(0,info.cpuTime-(previousCpu.get(info.id)??info.cpuTime)),0);
  if(cpuProfiling){const main=(await cdp.send('Profiler.stop')).profile;await writeFile(path.join(output,'main.cpuprofile'),JSON.stringify(main));}
  for(const [i,worker] of workers.entries()){
    const {profile}=await call(worker.sessionId,'Profiler.stop');await writeFile(path.join(output,`worker-${i}.cpuprofile`),JSON.stringify(profile));
    worker.file=`worker-${i}.cpuprofile`;await root.send('Target.detachFromTarget',{sessionId:worker.sessionId});
  }
  const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
  const summary={cpuProfiling,settings,workload,bundleManifest:'bundle.json',readback,targetSimulationRate:10,targetFrameMs:report.dt*1000/10,simulationRate:report.dt*count/(report.elapsedMs/1000),startSimulationTime:report.startSimulationTime,flowCounts:report.flowCounts,browserCpu:{seconds:cpuSeconds,meanActiveCores:cpuSeconds/(report.elapsedMs/1000),method:cpuProfiling?'CDP process CPU deltas after warmup; includes profiler overhead':'CDP process CPU deltas after warmup; CPU sampling disabled'},mainCpuThrottle:throttle,graphics:report.graphics,frames:count,elapsedMs:report.elapsedMs,meanFrameMs:mean(report.samples.map(s=>s.totalMs)),meanNodeMs:Object.fromEntries(Object.keys(report.samples[0].nodes).map(key=>[key,mean(report.samples.map(s=>s.nodes[key]))])),final:report.samples.at(-1),workers:workers.map(({url,file})=>({url,file})),errors};
  summary.viewport={...page.viewportSize(),phoneEmulation:phoneViewport};
  if(packedReadback!==undefined)summary.packedReadback=packedReadback==='1';
  if(report.displayCloudTransferBefore)summary.displayCloudTransfer={before:report.displayCloudTransferBefore,after:report.displayCloudTransferAfter};
  if(geometryBatching!==undefined)summary.geometryBatching=geometryBatching==='1';
  if(sessionReport)summary.sessionTiming=sessionReport;
  summary.compilerAssets=compilerManifest;
  if(executionBefore)summary.physicsExecution={before:executionBefore,after:executionAfter};
  await writeFile(path.join(output,'timings.json'),JSON.stringify({summary,samples:report.samples},null,2));
  await page.screenshot({path:path.join(output,'world.png'),fullPage:true});
  console.log(JSON.stringify(summary,null,2));
  if(errors.length)process.exitCode=1;
} finally {await stopPerf();await browser.close();}
