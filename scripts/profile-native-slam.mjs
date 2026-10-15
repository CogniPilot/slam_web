import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {D435_PAIRED_RESOLUTIONS} from '../src/camera-resolutions.mjs';
import {summarizeCpuProfiles} from './browser-profile-summary.mjs';
import {startSessionTiming,startRpcTiming} from '../dev/profile-session-instrumentation.mjs';
import {installNativeFunctionTiming} from './native-function-instrumentation.mjs';
const output=process.argv[2]??join(homedir(),'scratch/slam_web/profiles/browser-native-slam');
const url=process.env.SLAM_PROFILE_URL??'http://127.0.0.1:4173';
const cameraHz=Number(process.env.SLAM_PROFILE_CAMERA_HZ??5);
const imuHz=Number(process.env.SLAM_PROFILE_IMU_HZ??10);
const count=Number(process.env.SLAM_PROFILE_FRAMES??90);
const resolution=process.env.SLAM_PROFILE_RESOLUTION??'424x240';
const environment=process.env.SLAM_PROFILE_ENVIRONMENT??'city';
const tour=process.env.SLAM_PROFILE_TOUR??'hover';
const mode=D435_PAIRED_RESOLUTIONS.find(mode=>mode.id===resolution);
if(!mode||!Number.isInteger(count)||count<1||!Number.isFinite(cameraHz)||cameraHz<=0||cameraHz>mode.maxHz||!Number.isFinite(imuHz)||imuHz<=0)throw new Error('Invalid profile resolution, frame count or rates');
const cpuProfiling=process.env.SLAM_PROFILE_CPU_PROFILING==='1';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
  args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  // Review another compiler in this browser only; keep served assets and native
  // SLAM programs unchanged, and record the exact compared compiler bytes.
  const compilerDirectory=process.env.SLAM_PROFILE_COMPILER_DIR;
  if(compilerDirectory){
    const files=new Map(),manifest=[];
    for(const name of ['rumoca_bind_wasm.js','rumoca_bind_wasm_bg.wasm']){
      const bytes=await readFile(join(compilerDirectory,name));files.set(name,bytes);
      manifest.push({file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    }
    await page.route('**/vendor/rumoca/rumoca_bind_wasm*',route=>{
      const name=new URL(route.request().url()).pathname.split('/').at(-1),bytes=files.get(name);
      return bytes?route.fulfill({body:bytes,contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript'}):route.continue();
    });
    await writeFile(join(output,'compiler-comparison.json'),JSON.stringify(manifest,null,2));
  }
  // Optional, explicitly selected native-program experiment. Missing files
  // fall through to the published delivery; record every overridden byte.
  const nativeDirectory=process.env.SLAM_PROFILE_NATIVE_DIR;
  const nativeFunctionTiming=process.env.SLAM_PROFILE_NATIVE_TRACE==='1';
  if(nativeFunctionTiming){
    if(!nativeDirectory)throw Error('Native function timing requires an explicitly instrumented SLAM_PROFILE_NATIVE_DIR');
    await page.route('**/assets/modelica-slam.worker-*.js',async route=>{
      const response=await route.fetch();
      await route.fulfill({body:`(${installNativeFunctionTiming.toString()})();\n${await response.text()}`,contentType:'text/javascript'});
    });
  }
  const nativeOverrides=new Map();
  if(nativeDirectory)await page.route('**/vendor/slam/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    let bytes;
    try{bytes=await readFile(join(nativeDirectory,name));}
    catch(error){if(error.code==='ENOENT')return route.continue();throw error;}
    nativeOverrides.set(name,{file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    return route.fulfill({body:bytes,contentType:name.endsWith('.json')?'application/json':name.endsWith('.wasm')?'application/wasm':'application/octet-stream'});
  });
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);
  await page.waitForFunction(()=>window.__slamLab?.initialized&&window.__slamLab.ready,{},{timeout:120000});
  console.log('Baseline ready');
  const overlapSlamPrediction=process.env.SLAM_PROFILE_OVERLAP!=='0';
  const preparation=await page.evaluate(async({cameraHz,imuHz,resolution,environment,tour,overlapSlamPrediction})=>{
    const lab=window.__slamLab,r=lab.runtime;
    r.pause();while(r.busy)await new Promise(resolve=>setTimeout(resolve,10));
    const p=structuredClone(lab.project);
    Object.assign(p,{environment,slamBackend:'native',cameraResolution:resolution,sceneDetail:'low',depthCloudEnabled:false,lidarEnabled:false,
      sensorRates:{cameraHz,lidarHz:5,imuHz,gpsHz:1}});
    Object.assign(lab.project,p);
    const progress=[],originalStatus=r.onStatus;
    r.onStatus=text=>{progress.push(text);originalStatus(text);};
    const started=performance.now();await r.compile(p);r.onStatus=originalStatus;
    r.overlapSlamPrediction=overlapSlamPrediction;
    r.autopilot=tour==='indoor'||tour==='circuit';r.tourMode=tour==='indoor'?'indoor':'circuit';
    return {prepareMs:performance.now()-started,program:r.slamProgram,graphics:r.world.graphics,
      camera:r.world.calibration,rates:r.sensorClock.rates,origin:r.evaluationOrigin,progress};
  },{cameraHz,imuHz,resolution,environment,tour,overlapSlamPrediction});
  console.log(JSON.stringify({preparation}));
  if(process.env.SLAM_PROFILE_SOURCE_SHA&&preparation.program.sourceSha256!==process.env.SLAM_PROFILE_SOURCE_SHA)
    throw new Error(`The served native source is ${preparation.program.sourceSha256}, expected ${process.env.SLAM_PROFILE_SOURCE_SHA}`);
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
  const sessionTiming=process.env.SLAM_PROFILE_SESSION_TIMING==='1'
    ?await startSessionTiming(root,call,new URL('.',url).href):undefined;
  if(sessionTiming)await page.evaluate(startRpcTiming);
  let nativeTimingSession;
  if(nativeFunctionTiming){
    const target=(await root.send('Target.getTargets')).targetInfos.find(t=>t.type==='worker'&&t.url.includes('/modelica-slam.worker-'));
    if(!target)throw Error('Native SLAM worker is unavailable');
    nativeTimingSession=(await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false})).sessionId;
    const result=await call(nativeTimingSession,'Runtime.evaluate',{expression:'globalThis.__nativeFunctionTiming.active=true',returnByValue:true});
    if(result.exceptionDetails||result.result?.value!==true)throw Error('Native function timing installation failed');
  }
  const executionReceipt=()=>page.evaluate(()=>window.__slamLab.runtime.physics.call('executionReceipt'));
  const executionBefore=process.env.SLAM_PROFILE_EXECUTION_RECEIPT==='1'?await executionReceipt():undefined;
  const cpuBefore=(await root.send('SystemInfo.getProcessInfo')).processInfo;
  const report=await page.evaluate(async({count,cameraHz,tour})=>{
    const lab=window.__slamLab,r=lab.runtime,rows=[];
    const step=r.slam.step.bind(r.slam);let stepMs=[];
    r.slam.step=async frame=>{const result=await step(frame);stepMs=result.stepMs;return result;};
    const timeBefore=r.time,sequenceBefore=lab.latest.frame.sequence,start=performance.now();
    for(let i=0;i<count;i++){
      if(tour==='warehouse-loop'){
        // A small fixed-heading circuit stays inside the warehouse aisle.
        const phase=r.time%24;
        r.command={forward:phase<6?.5:phase<12?0:phase<18?-.5:0,
          left:phase<6?0:phase<12?.25:phase<18?0:-.25,up:0,yaw:0};
      }
      const started=performance.now();await r.step();
      const {frame,estimate}=lab.latest;
      if(frame.sequence!==sequenceBefore+i+1)throw Error('Frame skipped');
      if(Math.abs(frame.time-timeBefore-(i+1)/cameraHz)>1e-8)throw Error('Clock drift');
      if(estimate.diagnostics.runtime!=='Rumoca native SLAM program')throw Error('Wrong estimator');
      if(![estimate.x,estimate.y,estimate.z,...estimate.quaternion].every(Number.isFinite))throw Error('Nonfinite estimate');
      if(Math.abs(Math.hypot(...estimate.quaternion)-1)>1e-6)throw Error('Quaternion not normalized');
      const reference=lab.latest.truth?r.referenceTruth(lab.latest.truth):undefined;
      rows.push({sequence:frame.sequence,time:frame.time,wallMs:performance.now()-started,
        nodeMs:{...r.lastTimings},workerMs:structuredClone(r.lastWorkerTimings),
        transport:structuredClone(r.lastTransportTimings),camera:{...r.world.captureTimings},
        display:lab.viewer?.latest??lab.performanceMonitor.latest,
        uiDisplay:lab.performanceMonitor.latest,
        stepMs:stepMs.slice(),position:[estimate.x,estimate.y,estimate.z],truth:structuredClone(lab.latest.truth),
        features:estimate.features?.length,points:estimate.points.length,
        diagnostics:{...estimate.diagnostics},tracking:estimate.tracking?.accepted,
        reference,positionErrorM:reference?Math.hypot(estimate.x-reference.x,estimate.y-reference.y,estimate.z-reference.z):null});
    }
    const elapsedMs=performance.now()-start,simulationSeconds=r.time-timeBefore;
    const loops=lab.loopHistories?.[0];
    const loopClosureView=loops?{accepted:loops.acceptedCount,candidates:loops.candidateCount,snapshots:loops.images.size,
      history:loops.closures.map(({edgeId,referenceId,currentId,time,reference,current,similarity})=>({edgeId,referenceId,currentId,time,
        referenceImage:reference?.imageEpoch,currentImage:current?.imageEpoch,similarity}))}:undefined;
    return {elapsedMs,simulationSeconds,rtf:simulationSeconds/(elapsedMs/1000),rows,loopClosureView,
      pendingNodes:Array.from(r.pendingNodes),final:rows.at(-1)};
  },{count,cameraHz,tour});
  const cpuAfter=(await root.send('SystemInfo.getProcessInfo')).processInfo;
  const executionAfter=executionBefore?await executionReceipt():undefined;
  const previousCpu=new Map(cpuBefore.map(info=>[info.id,info.cpuTime]));
  const cpuSeconds=cpuAfter.reduce((sum,info)=>sum+Math.max(0,info.cpuTime-(previousCpu.get(info.id)??info.cpuTime)),0);
  if(sessionTiming)await writeFile(join(output,'session-timing.json'),JSON.stringify({
    ...await sessionTiming.finish(),rpc:await page.evaluate(()=>window.__profileRpcTiming.finish())},null,2));
  if(nativeTimingSession){
    const result=await call(nativeTimingSession,'Runtime.evaluate',{expression:'globalThis.__nativeFunctionTiming.finish()',returnByValue:true});
    if(result.exceptionDetails||!result.result?.value)throw Error('Native function timing extraction failed');
    await writeFile(join(output,'native-function-timing.json'),JSON.stringify(result.result.value,null,2));
    await root.send('Target.detachFromTarget',{sessionId:nativeTimingSession});
  }
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
  const summary={recordedAt:new Date().toISOString(),browser:browser.version(),environment,tour,resolution,cameraHz,imuHz,frames:count,cpuProfiling,overlapSlamPrediction,preparation,
    sessionTiming:!!sessionTiming,nativeFunctionTiming,browserCpu:{seconds:cpuSeconds,meanActiveCores:cpuSeconds/(report.elapsedMs/1000)},
    ...(executionBefore?{physicsExecution:{before:executionBefore,after:executionAfter}}:{}),
    meanFrameMs:mean(sorted),p50FrameMs:sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.floor(sorted.length*.95)],
    meanNativeMs:mean(report.rows.map(r=>r.diagnostics.stepMsTotal)),
    meanImageStepMs:mean(report.rows.map(r=>r.stepMs.at(-1))),
    meanImuStepMs:mean(report.rows.flatMap(r=>r.stepMs.slice(0,-1))),
    meanDisplaySubmitMs:mean(report.rows.map(r=>r.display?.meanRenderSubmitMs).filter(Number.isFinite)),
    meanUiSubmitMs:mean(report.rows.map(r=>r.uiDisplay?.meanRenderSubmitMs).filter(Number.isFinite)),
    meanNodeMs:Object.fromEntries(Object.keys(report.rows[0].nodeMs).map(k=>[k,mean(report.rows.map(r=>r.nodeMs[k]))])),
    elapsedMs:report.elapsedMs,simulationSeconds:report.simulationSeconds,rtf:report.rtf,
    positionRmseM:Math.sqrt(mean(report.rows.filter(row=>row.positionErrorM!==null).map(row=>row.positionErrorM**2))),
    maximumPositionErrorM:Math.max(...report.rows.map(row=>row.positionErrorM??0)),
    maximumKeyframes:Math.max(...report.rows.map(row=>Number(row.diagnostics.keyframes??0))),
    maximumLoopEdges:Math.max(...report.rows.map(row=>Number(row.diagnostics.loopEdges??0))),
    final:report.final,loopClosureView:report.loopClosureView,pendingNodes:report.pendingNodes,errors,
    scope:`Actual built SLAM Web: live ${resolution} GPU RGB-D captures, physics, sensor model, native full SLAM worker, visible viewer; low graphics, no LiDAR or depth-cloud display. Ten warmup frames; unpaced sequential runtime.step calls; CPU sampling ${cpuProfiling?'enabled':'disabled'}. Shared host.`};
  await writeFile(join(output,'report.json'),JSON.stringify({summary,rows:report.rows},null,2));
  if(nativeDirectory)await writeFile(join(output,'native-comparison.json'),JSON.stringify([...nativeOverrides.values()],null,2));
  await page.screenshot({path:join(output,'world.png'),fullPage:true});
  if(await page.locator('.loop-closure-panel').count())await page.locator('.loop-closure-panel').screenshot({path:join(output,'loop-closures.png')});
  console.log(JSON.stringify(summary,null,2));
  if(errors.length)process.exitCode=1;
}catch(error){await writeFile(join(output,'failure.json'),JSON.stringify({error:String(error.stack||error),errors},null,2));throw error;}
finally{await browser.close();}
