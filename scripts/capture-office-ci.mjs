// Deliberate software-rendered diagnostic, separate from strict hardware capture.
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile,statfs} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {chromiumLaunchOptions} from './browser-launch.mjs';
import {officeLoopPhysics} from './office-loop-physics.mjs';
import {OFFICE_MISSION,SOFTWARE_ARGS,sha256,requireSoftwareGraphics,validateOfficeSample,assertCompleteOfficeCapture} from './office-ci-contract.mjs';

const output=process.argv[2];
if(!output||process.argv.length!==3)throw Error('Usage: capture-office-ci.mjs NEW_OUTPUT');
const base=new URL(process.env.OFFICE_CI_URL??'http://127.0.0.1:4173/');
if(base.protocol!=='http:'||!['127.0.0.1','localhost'].includes(base.hostname)||base.username||base.password)throw Error('Office CI preview must be local HTTP');
const tracePath=process.env.OFFICE_CI_TRACE_WORKER;if(!tracePath)throw Error('OFFICE_CI_TRACE_WORKER must name the separately built diagnostic worker');
const traceWorker=await readFile(tracePath);
const wallSeconds=1800,started=performance.now();
const physics=await officeLoopPhysics(await readFile(new URL('../models/Vehicles/LabQuadrotor.mo',import.meta.url),'utf8'));
const profile=await readFile(new URL('../models/Benchmarks/OfficeLoopProfile.mo',import.meta.url));
await mkdir(output);await mkdir(join(output,'frames'));await mkdir(join(output,'native-frames'));
await writeFile(join(output,'trace-worker.js'),traceWorker);
await writeFile(join(output,'prepared-physics.mo'),physics);await writeFile(join(output,'OfficeLoopProfile.mo'),profile);
const receipt={schemaVersion:1,scope:'Software SwiftShader office RGB-D+IMU diagnostic; no hardware GPU, estimator accuracy or loop-closure acceptance.',
  startedAt:new Date().toISOString(),mission:OFFICE_MISSION,framesCompleted:0,firstTime:null,lastTime:null,complete:false,
  traceWorkerSha256:sha256(traceWorker),physicsSourceSha256:sha256(physics),flightProfileSha256:sha256(profile),wallSecondsLimit:wallSeconds,
  launcher:{chromiumSandbox:true,args:[...SOFTWARE_ARGS]},pageErrors:[]};
let browser,stopped=false,deadlineHit=false,bytesWritten=0;const savedReferences=new Set(),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let firstTruth,previousPosition,pathMeters=0;
const stop=()=>{stopped=true;void browser?.close().catch(()=>{});};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
const deadline=setTimeout(()=>{deadlineHit=true;stop();},wallSeconds*1000);deadline.unref();
const writeReceipt=()=>writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
await writeReceipt();
try{
  const disk=await statfs(output);if(disk.bavail*disk.bsize<2*1024**3)throw Error('Office CI capture requires at least 2 GiB free');
  browser=await chromium.launch({headless:true,...chromiumLaunchOptions(),args:[...SOFTWARE_ARGS],handleSIGINT:false,handleSIGTERM:false,timeout:60000});
  receipt.chromiumVersion=browser.version();
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(120000);
  page.on('console',message=>console.log(JSON.stringify({kind:'browser-console',type:message.type(),text:message.text(),wallMs:performance.now()-started})));
  page.on('pageerror',error=>{receipt.pageErrors.push(String(error));console.error(String(error));});
  await page.route('**/assets/modelica-slam.worker-*.js',route=>route.fulfill({body:traceWorker,contentType:'text/javascript'}));
  await page.goto(base.href,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>window.__slamLab?.initialized&&window.__slamLab.ready&&!window.__slamLab.compiling,undefined,{timeout:180000});
  const preparation=await page.evaluate(async({physics,mission})=>{
    const lab=window.__slamLab,r=lab.runtime;r.pause();while(r.busy)await new Promise(done=>setTimeout(done,10));
    // Use this build's default source closure; no external legacy capture is needed.
    const project=structuredClone(lab.project);
    Object.assign(project,{name:'Office loop software CI diagnostic',environment:'office-loop',physics,
      slamBackend:'native',cameraResolution:'424x240',seed:7,vehicleCount:1,sceneDetail:'low',carsEnabled:false,peopleEnabled:false,
      lidarEnabled:false,depthCloudEnabled:false,sensorRates:{cameraHz:mission.cameraHz,imuHz:10,lidarHz:5,gpsHz:1}});
    delete project.algorithmArtifact;Object.assign(lab.project,project);
    const originalInitial=r.onInitialFrame;let initial;
    r.onInitialFrame=(vehicle,frame,estimate)=>{
      if(vehicle===0)initial={frame,estimate,truth:structuredClone(r.world.truth)};
      originalInitial.call(r,vehicle,frame,estimate);
    };
    try{await r.compile(project);}finally{r.onInitialFrame=originalInitial;}
    if(!initial)throw Error('Native initialization did not retain its actual time-zero image');
    r.autopilot=false;r.recording=false;
    lab.viewer?.worker?.postMessage({type:'visibility',visible:false});
    window.__officeInitial=initial;
    return {project:structuredClone(r.project),graphics:r.world.graphics,calibration:r.world.calibration,
      nativeProgram:structuredClone(r.slamProgram),physics:await r.physics.call('executionReceipt')};
  },{physics,mission:OFFICE_MISSION});
  receipt.graphics=requireSoftwareGraphics(preparation.graphics);receipt.environment=preparation.project.environment;
  receipt.loadedPhysicsSourceSha256=sha256(preparation.project.physics);receipt.physics=preparation.physics;receipt.nativeProgram=preparation.nativeProgram;
  if(receipt.physicsSourceSha256!==receipt.loadedPhysicsSourceSha256||receipt.environment!=='office-loop'||preparation.project.sensorRates.cameraHz!==5)throw Error('Wrong office mission loaded');
  await writeFile(join(output,'project.json'),JSON.stringify(preparation.project)+'\n');
  const manifestResponse=await fetch(new URL('vendor/slam/manifest.json',base));if(!manifestResponse.ok)throw Error('Native manifest unavailable');
  const manifestBytes=Buffer.from(await manifestResponse.arrayBuffer()),manifest=JSON.parse(manifestBytes);
  const selected=manifest.profiles?.['424x240']??manifest;
  if(selected.sourceSha256!==preparation.nativeProgram.sourceSha256)throw Error('Native source receipt mismatch');
  receipt.nativeManifestSha256=sha256(manifestBytes);await writeFile(join(output,'native-manifest.json'),manifestBytes);
  const workers=page.workers().filter(worker=>worker.url().includes('/modelica-slam.worker-'));
  if(workers.length!==1)throw Error('Expected exactly one native diagnostic worker');const worker=workers[0];
  await writeReceipt();
  for(let index=0;index<OFFICE_MISSION.frames;index++){
    if(stopped||performance.now()-started>wallSeconds*1000)throw Error(deadlineHit?'Capture hard wall deadline exceeded':'Capture interrupted');
    if(index%50===0){const d=await statfs(output);if(d.bavail*d.bsize<512*1024**2)throw Error('Capture free disk guard reached');}
    const sample=await page.evaluate(async index=>{
      const lab=window.__slamLab,r=lab.runtime;
      if(index){r.command={forward:0,left:0,up:0,yaw:0};await r.step();}
      const data=index?r.lastFrame:window.__officeInitial,{rgb,depth,...metadata}=data.frame;
      const b64=array=>{const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);};
      const {x,y,z,quaternion,diagnostics,poseGraph,loopClosure}=data.estimate;
      return {index,time:metadata.time,sequence:metadata.sequence,metadata,truth:structuredClone(data.truth),
        native:{x,y,z,quaternion,diagnostics,poseGraph,loopClosure},command:structuredClone(r.command),rgb:b64(rgb),depth:b64(depth)};
    },index);
    const trace=await worker.evaluate(()=>{if(!globalThis.__officeNativeTrace)throw Error('Native entry snapshot missing');return globalThis.__officeNativeTrace;});
    if(trace.status!==0||trace.inputs?.imageEpoch?.[0]!==index)throw Error('Native entry snapshot does not match acquired frame');
    const saveReference=async frame=>{
      const bytes=Buffer.from(JSON.stringify(frame)+'\n'),digest=sha256(bytes),file=`native-frames/${frame.generation}-${frame.id}-${frame.epoch}-${digest.slice(0,16)}.json`;
      if(!savedReferences.has(digest)){await writeFile(join(output,file),bytes);savedReferences.add(digest);}
      return {file,sha256:digest,id:frame.id,epoch:frame.epoch,time:frame.imageTime,generation:frame.generation};
    };
    trace.references=await Promise.all((trace.references??[]).map(saveReference));
    trace.retainedCurrent=trace.retainedCurrent?await saveReference(trace.retainedCurrent):null;
    sample.nativeTrace=trace;
    const stem=String(index).padStart(4,'0');sample.image={};
    for(const kind of ['rgb','depth']){
      const bytes=Buffer.from(sample[kind],'base64');delete sample[kind];bytesWritten+=bytes.length;
      if(bytesWritten>2*1024**3)throw Error('Capture byte budget exceeded');
      const file=`frames/${stem}-${kind}.bin`;await writeFile(join(output,file),bytes);
      sample.image[kind]={file,bytes:bytes.length,sha256:sha256(bytes)};
    }
    validateOfficeSample(sample,index);
    const position=[sample.truth?.x,sample.truth?.y,sample.truth?.z],quaternion=sample.truth?.quaternion;
    if(!position.every(Number.isFinite)||!Array.isArray(quaternion)||quaternion.length!==4||!quaternion.every(Number.isFinite))throw Error('Physics truth unavailable for mission evaluation');
    firstTruth??={position,quaternion};
    if(previousPosition)pathMeters+=Math.hypot(...position.map((value,axis)=>value-previousPosition[axis]));previousPosition=position;
    for(let axis=0;axis<3;axis++){bounds.min[axis]=Math.min(bounds.min[axis],position[axis]);bounds.max[axis]=Math.max(bounds.max[axis],position[axis]);}
    const cosine=Math.abs(quaternion.reduce((sum,value,axis)=>sum+value*firstTruth.quaternion[axis],0))/(Math.hypot(...quaternion)*Math.hypot(...firstTruth.quaternion));
    receipt.flightEvaluation={scope:'Physics truth used only for mission evaluation, never matching, pairing, estimation or trajectory integration.',pathMeters,bounds,
      endToStartMeters:Math.hypot(...position.map((value,axis)=>value-firstTruth.position[axis])),orientationReturnRadians:2*Math.acos(Math.min(1,cosine))};
    await writeFile(join(output,'frames',stem+'.json'),JSON.stringify(sample)+'\n');
    receipt.framesCompleted++;receipt.firstTime??=sample.time;receipt.lastTime=sample.time;receipt.imageBytes=bytesWritten;
    if(index%25===0||index===OFFICE_MISSION.frames-1){await writeReceipt();console.log(JSON.stringify({kind:'capture-progress',index,time:sample.time,wallSeconds:(performance.now()-started)/1000,bytesWritten}));}
  }
  assertCompleteOfficeCapture(receipt);receipt.complete=true;
  receipt.flightEvaluation.referenceExtentMeters=[24,16];receipt.flightEvaluation.note='Measured achieved path; authored reference does not by itself establish physical coverage or a return closure.';
}catch(error){receipt.failure=String(error);process.exitCode=1;console.error(receipt.failure);}
finally{
  clearTimeout(deadline);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
  await browser?.close().catch(()=>{});receipt.finishedAt=new Date().toISOString();receipt.wallSeconds=(performance.now()-started)/1000;
  await writeReceipt();console.log(JSON.stringify({kind:'capture-finished',frames:receipt.framesCompleted,complete:receipt.complete,failure:receipt.failure??null}));
}
