// Test-only actual Rumoca flight + renderer capture. No estimator, authored
// trajectory, feature detector, host dynamics, projection or pixel conversion.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {chromium} from '@playwright/test';

const self=fileURLToPath(import.meta.url),repo=path.resolve(path.dirname(self),'..');
const hardwareRequested=process.env.SLAM_BROWSER_GPU==='1';
const revisit=process.env.SLAM_CAPTURE_TRAJECTORY==='revisit';
if(!['flight','revisit'].includes(process.env.SLAM_CAPTURE_TRAJECTORY??'flight'))throw Error('Unknown capture trajectory');
const cameraHz=revisit?15:30,holdsPerFrame=90/cameraHz;
const controllerFile='tests/modelica/RenderedRevisitQuadrotor.mo';
const libraryDirectory='models/Libraries/CogniPilot';
const frameCount=Number(process.env.SLAM_CAPTURE_FRAME_COUNT??(revisit?97:13));
if(!Number.isSafeInteger(frameCount)||frameCount<13||frameCount>121)throw Error('SLAM_CAPTURE_FRAME_COUNT must be13..121');
const heldIntervalCount=(frameCount-1)*holdsPerFrame,imuSampleCount=heldIntervalCount+1;
const probeCpus=process.env.SLAM_PROBE_CPUS??'6,7';
if(!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(probeCpus))throw Error('SLAM_PROBE_CPUS must be a taskset CPU list');
const launchArgs=['--no-sandbox',...(hardwareRequested?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
function files(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(root,entry.name)):[path.join(root,entry.name)]).sort();}
const relative=file=>path.relative(repo,file).split(path.sep).join('/');
const inventory=()=>[...files(path.join(repo,'src')),...files(path.join(repo,'public')),
  ...files(path.join(repo,libraryDirectory)),self,path.join(repo,'models/Vehicles/LabQuadrotor.mo'),
  ...(revisit?[path.join(repo,controllerFile)]:[]),path.join(repo,'dev/rumoca-bounded-run.mjs'),
  path.join(repo,'package.json'),path.join(repo,'package-lock.json')].sort()
  .map(file=>({path:relative(file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
if(process.argv.slice(2).some(arg=>arg.startsWith('--')&&arg!=='--execute'))throw new Error('No public options; --execute directory is internal');

if(process.argv[2]!=='--execute'){
  const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
  // Vite resolves entries through symlinks; use the canonical scratch root too.
  // Chromium's Unix SingletonSocket also lives under TMPDIR; keep its owned
  // scratch prefix short enough for the kernel's socket path bound.
  const run=fs.realpathSync(fs.mkdtempSync(path.join(scratch,'flight-')));
  const browserTmp=fs.realpathSync(fs.mkdtempSync(path.join(os.homedir(),'scratch','sw-flight-')));
  const result=spawnSync(process.execPath,[path.join(repo,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(run,'capture.log'),'--','env','OMP_NUM_THREADS=1',`TMPDIR=${browserTmp}`,'nice','-n','15','taskset','-c',probeCpus,process.execPath,self,'--execute',run],{encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(run,'resources.json'),result.stdout??'');fs.writeFileSync(path.join(run,'watchdog-stderr.log'),result.stderr??'');
  const durable=path.join(repo,'dev/artifacts/modelica-rendered-flight-frames',path.basename(run));fs.mkdirSync(durable,{recursive:true});
  if(fs.existsSync(path.join(run,'output')))fs.cpSync(path.join(run,'output'),durable,{recursive:true,
    filter:source=>frameCount===13||!/^frame-\d+\.(rgb8|z16-le)$/.test(path.basename(source))});
  for(const name of ['capture.log','resources.json','watchdog-stderr.log'])fs.copyFileSync(path.join(run,name),path.join(durable,name));
  console.log(JSON.stringify({status:result.status===0?'RENDERED_FLIGHT_CAPTURE_PASS':'RENDERED_FLIGHT_CAPTURE_FAILED',exitCode:result.status,signal:result.signal,durable:relative(durable),scratch:run,captureDirectory:frameCount===13?durable:path.join(run,'output')}));
  process.exitCode=result.status??1;
}else{
  const run=path.resolve(process.argv[3]),output=path.join(run,'output'),source=path.join(run,'source'),dist=path.join(run,'build');
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(source,{recursive:true});
  const before=inventory();json(path.join(output,'sources-before.json'),before);
  for(const folder of ['src','public'])fs.cpSync(path.join(repo,folder),path.join(source,folder),{recursive:true});
  fs.mkdirSync(path.join(source,'models/Vehicles'),{recursive:true});fs.copyFileSync(path.join(repo,'models/Vehicles/LabQuadrotor.mo'),path.join(source,'models/Vehicles/LabQuadrotor.mo'));
  fs.cpSync(path.join(repo,libraryDirectory),path.join(source,libraryDirectory),{recursive:true});
  if(revisit){fs.mkdirSync(path.dirname(path.join(source,controllerFile)),{recursive:true});fs.copyFileSync(path.join(repo,controllerFile),path.join(source,controllerFile));}
  for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(repo,file),path.join(source,file));
  fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'node_modules'),'dir');
  // Retain source preimages, but keep the large frozen asset/build workspace on scratch.
  fs.cpSync(path.join(source,'src'),path.join(output,'source-preimages/src'),{recursive:true});
  fs.cpSync(path.join(source,'models'),path.join(output,'source-preimages/models'),{recursive:true});
  if(revisit){fs.mkdirSync(path.dirname(path.join(output,'source-preimages',controllerFile)),{recursive:true});fs.copyFileSync(path.join(source,controllerFile),path.join(output,'source-preimages',controllerFile));}
  fs.mkdirSync(path.join(output,'source-preimages/dev'),{recursive:true});
  for(const file of [self,path.join(repo,'dev/rumoca-bounded-run.mjs')])fs.copyFileSync(file,path.join(output,'source-preimages',relative(file)));
  for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(source,file),path.join(output,'source-preimages',file));
  for(const entry of before){const frozen=entry.path.startsWith('src/')||entry.path.startsWith('public/')?path.join(source,entry.path):path.join(output,'source-preimages',entry.path);if(sha(fs.readFileSync(frozen))!==entry.sha256)throw new Error(`Freeze raced: ${entry.path}`);}
  const html=`<!doctype html><meta charset="utf-8"><title>Measured Rumoca flight RGB-D fixture</title><style>body{margin:20px;background:#15202a;color:white;font:16px monospace}#view{width:640px;height:360px}#camera{width:640px;height:auto}#view{display:none}</style><h1 id="camera-title">Actual city RGB</h1><canvas id="camera"></canvas><pre id="status">Preparing frozen Three.js city</pre><div id="view"></div><script type="module" src="/harness.ts"></script>`;
  const harness=`import {World,D435} from './src/world';
import {readPhysicsSnapshot} from './src/physics-snapshot';
import {SensorClock} from './src/sensor-clock';
import {modelicaModelsSources} from './src/modelica-models-library';
import {sourceDigest} from './src/source-digest';
import physicsSource from './models/Vehicles/LabQuadrotor.mo?raw';
${revisit?`import controllerSource from './${controllerFile}?raw';`:"const controllerSource='';"}
const harnessStarted=performance.now();
const world=new World(document.querySelector('#view') as HTMLElement);
world.build('city','medium');world.configureActors(false,false);world.setDepthCloudEnabled(false);world.setLighting('day');
await world.ready;
const noise={seed:7,disparityNoisePx:D435.depthNoiseDisparityPx!,referenceFx:D435.depthNoiseReferenceFx!,baselineMeters:D435.baseline,dropoutProbability:.005,unitsMeters:.001};
await world.setDepthNoise(noise);
const worldReadyMs=performance.now()-harnessStarted;
const encode=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s);};
const modulePath=new URL('/vendor/rumoca/rumoca_bind_wasm.js',location.href).href;
const moduleStarted=performance.now();
const module=await import(/* @vite-ignore */ modulePath);
await module.default({module_or_path:new URL('/vendor/rumoca/rumoca_bind_wasm_bg.wasm',location.href).href});
const workspaceLoaded=JSON.parse(module.sync_workspace_sources(JSON.stringify(modelicaModelsSources)));
if(workspaceLoaded.error_count)throw new Error('Physics library could not be loaded');
const workspaceSourcePaths=Object.keys(modelicaModelsSources).sort();
const workspaceSourceSha256=await sourceDigest(JSON.stringify(workspaceSourcePaths.map(file=>[file,modelicaModelsSources[file]])));
const moduleLoadMs=performance.now()-moduleStarted,sessionStarted=performance.now();
const modelName=${JSON.stringify(revisit?'RenderedRevisitQuadrotor':'LabQuadrotor')};
const initialInputs=${JSON.stringify(revisit?'[]':'[["forward",0],["left",0],["up",0],["yaw",0]]')};
const compiledSource=physicsSource+(controllerSource?'\\n'+controllerSource:'');
const session=module.WasmSimulationSession.withInteractiveOptions(compiledSource,modelName,.005,'rk-like',1e-8,1e-6,initialInputs);
const sessionInitializationMs=performance.now()-sessionStarted;
try{
 const initialSnapshotStarted=performance.now();
 const initial=readPhysicsSnapshot(session,true);
 const initialSnapshotMs=performance.now()-initialSnapshotStarted;
 if(initial.time!==0)throw new Error('Expected actual time-zero physics initialization');
 const rates={cameraHz:${cameraHz},lidarHz:10,imuHz:90,gpsHz:5} as const;
 const clock=new SensorClock(rates,initial.time),frames:any[]=[],imuSamples:any[]=[],batches:any[]=[],oracleSnapshots:any[]=[],physicsStates:string[]=[],calls:any[]=[];
 const measurement=(sample:any)=>({accel:[...sample.accel],gyro:[...sample.gyro]});
 const observe=(sample:any)=>{const index=imuSamples.length;imuSamples.push({index,time:sample.time,imu:measurement(sample)});oracleSnapshots.push(sample);physicsStates.push(session.state_json());return index;};
 let truth=initial,time=initial.time,held=measurement(initial),heldSample=observe(initial);
 const capture=async(sequence:number,intervals:any[])=>{
   world.update(truth);
   const captureStarted=performance.now();
   const [frame,scan]=await world.captureSensorPair(false,'sync',false,true,false);
   const captureMs=performance.now()-captureStarted;
   if(scan||frame.depthCloud)throw new Error('Disabled auxiliary sensor unexpectedly produced output');
   if(!('imageLayout' in frame)||!frame.imageLayout||!(frame.depth instanceof Uint16Array))throw new Error('Expected native RGB8/Z16 capture');
   frames.push({sequence,time:truth.time,dt:sequence===0?0:truth.time-time,imu:measurement(truth),imuIntervals:intervals,rgb:encode(frame.rgb),depth:encode(new Uint8Array(frame.depth.buffer,frame.depth.byteOffset,frame.depth.byteLength)),imageLayout:frame.imageLayout,oracleSampleIndex:heldSample,timings:{captureMs,worldCapture:world.captureTimings}});
   if(sequence===0){
     // Test screenshot presentation only. Algorithm/dataset bytes stay RGB8.
     const c=document.querySelector('#camera') as HTMLCanvasElement;c.width=D435.width;c.height=D435.height;
     document.querySelector('#camera-title')!.textContent=\`Actual city RGB / \${D435.width} × \${D435.height}\`;
     const image=new ImageData(D435.width,D435.height);
     for(let row=0;row<D435.height;row++)for(let column=0;column<D435.width;column++){
       const input=row*frame.imageLayout.color.strideBytes+column*3,output=(row*D435.width+column)*4;
       image.data.set(frame.rgb.subarray(input,input+3),output);image.data[output+3]=255;
     }
     c.getContext('2d')!.putImageData(image,0,0);
   }
 };
 await capture(0,[]);
 for(let sequence=1;sequence<${frameCount};sequence++){
   const command={forward:0,left:0,up:0,yaw:0},commandTime=time;
   let intervalStart=time;const intervals:any[]=[];
   for(const event of clock.nextFrame(false)){
     const inputs=${revisit?"'[]'":"JSON.stringify([...Object.entries(command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]])"};
     const setStarted=performance.now();session.set_inputs(inputs);const setInputsMs=performance.now()-setStarted;
     const advanceStarted=performance.now();session.advance_to(event.time);const advanceMs=performance.now()-advanceStarted;
     const snapshotStarted=performance.now();truth=readPhysicsSnapshot(session,true);const snapshotMs=performance.now()-snapshotStarted;
     if(truth.time!==event.time)throw new Error('Physics did not reach the scheduled sensor endpoint');
     world.update(truth);
     if(event.imu||event.camera){intervals.push({time:event.time,dt:event.time-intervalStart,imu:{accel:[...held.accel],gyro:[...held.gyro]},sampleIndex:heldSample,sampleTime:imuSamples[heldSample].time});intervalStart=event.time;}
     const provenanceStarted=performance.now(),nextSample=observe(truth),provenanceStateMs=performance.now()-provenanceStarted;
     calls.push({index:calls.length,sequence,event,inputsJson:inputs,commandTime,previousHeldSampleIndex:heldSample,resultSampleIndex:nextSample,stateIndex:nextSample,timings:{setInputsMs,advanceMs,snapshotMs,provenanceStateMs}});
     if(event.imu){held=measurement(truth);heldSample=nextSample;}
   }
   if(intervals.length!==${holdsPerFrame})throw new Error('Unexpected held interval count at the recorded camera rate');
   batches.push({sequence,time:truth.time,dt:truth.time-time,imuIntervals:intervals});
   await capture(sequence,intervals);time=truth.time;
 }
 (window as any).result={calibration:D435,depthNoise:noise,graphics:world.graphics,frames,measurements:{schema:'rumoca-modeled-imu-hold-v1',frame:'body FLU',accelUnits:'m/s^2 specific force',gyroUnits:'rad/s',samples:imuSamples,batches,semantics:'Previous sample held over (start,time]; endpoint sample applies to next interval. Raw LabQuadrotor modeled readings; SensorObservations bias/random noise not applied.'},oracleSnapshots,physicsStates,calls,startupPhysics:{initialSnapshot:initial,finalSnapshot:truth,initializationApi:'WasmSimulationSession.withInteractiveOptions',snapshotApi:'readPhysicsSnapshot(session,true)',modelName,options:{stepSize:.005,solver:'rk-like',absoluteTolerance:1e-8,relativeTolerance:1e-6,inputs:initialInputs},advanced:true,rates,workspaceSourcePaths,workspaceSourceSha256},timings:{worldReadyMs,moduleLoadMs,sessionInitializationMs,initialSnapshotMs,harnessTotalMs:performance.now()-harnessStarted,scope:'Instrumented test-only capture; actual renderer identified in graphics, not full SLAM throughput.'},userAgent:navigator.userAgent,rendererToneMapping:world.renderer.toneMapping,rendererToneMappingExposure:world.renderer.toneMappingExposure};
 document.querySelector('#status')!.textContent='${frameCount} actual Rumoca flight camera frames /${imuSampleCount} IMU snapshots /${heldIntervalCount} held intervals. City medium/day; actors off. No estimator.';
}finally{session.free();}
`;
  fs.writeFileSync(path.join(source,'index.html'),html);fs.writeFileSync(path.join(source,'harness.ts'),harness);
  fs.writeFileSync(path.join(output,'harness.ts'),harness);fs.writeFileSync(path.join(output,'index.html'),html);
  const bundled=new Set();
  const buildStarted=performance.now();
  await build({root:source,configFile:false,base:'/',publicDir:false,worker:{format:'es'},plugins:[{name:'capture-source-inventory',moduleParsed(info){if(info.id.startsWith(source+'/src/'))bundled.add(path.relative(source,info.id));}}],build:{outDir:dist,emptyOutDir:true,target:'es2022',minify:true}});
  const buildElapsedMs=performance.now()-buildStarted;
  const built=files(dist).map(file=>({path:path.relative(dist,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
  fs.cpSync(dist,path.join(output,'built-harness'),{recursive:true});
  const requests=[],errors=[],consoleMessages=[];
  const server=http.createServer((request,response)=>{
    if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}
    try{const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname),buildFile=path.resolve(dist,'.'+name),assetFile=path.resolve(source,'public','.'+name);
      if((buildFile!==dist&&!buildFile.startsWith(dist+path.sep))||(assetFile!==path.join(source,'public')&&!assetFile.startsWith(path.join(source,'public')+path.sep)))throw new Error('Unsafe path');
      const file=name==='/'?path.join(dist,'index.html'):fs.existsSync(buildFile)?buildFile:assetFile;
      const bytes=fs.readFileSync(file);requests.push({path:name,sourcePath:file.startsWith(dist)?'build/'+path.relative(dist,file):'public/'+path.relative(path.join(source,'public'),file),bytes:bytes.length,sha256:sha(bytes)});
      const mime={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.hdr':'application/octet-stream','.glb':'model/gltf-binary'}[path.extname(file)]??'application/octet-stream';
      response.writeHead(200,{'Content-Type':mime});response.end(bytes);
    }catch(error){errors.push(`HTTP ${request.url}: ${error.message}`);response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const executablePath=process.env.CHROMIUM_PATH;if(!executablePath)throw new Error('Set CHROMIUM_PATH to the existing pinned Chromium executable');
    browser=await chromium.launch({executablePath,headless:true,args:launchArgs});
    const page=await browser.newPage({viewport:{width:1000,height:620},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{consoleMessages.push({type:msg.type(),text:msg.text()});if(msg.type()==='error')errors.push(msg.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>!!window.result,null,{timeout:90000});
    const result=await page.evaluate(()=>window.result);await page.locator('#camera').screenshot({path:path.join(output,'first-camera.png')});
    const calibration={...result.calibration,depthEncoding:'axial-z16-le',opticalToBody:[0,0,1,-1,0,0,0,-1,0],originFlu:[result.calibration.forward,0,result.calibration.up]};
    const frames=result.frames.map(frame=>{
      const rgb=Buffer.from(frame.rgb,'base64'),depth=Buffer.from(frame.depth,'base64'),pixels=calibration.width*calibration.height;
      const layout=frame.imageLayout;
      if(layout?.color?.format!=='RGB8'||layout?.depth?.format!=='Z16'||layout.rowOrder!=='top-down'||layout.aligned!==false||layout.clockDomain!=='simulation'||layout.depth.isBigEndian!==false)throw new Error('Unexpected native image layout');
      if(layout.color.strideBytes!==calibration.width*3||layout.depth.strideBytes!==calibration.width*2||rgb.length!==pixels*3||depth.length!==pixels*2||layout.color.bytes!==rgb.length||layout.depth.bytes!==depth.length)throw new Error('Unexpected raw frame dimensions');
      const prefix=`frame-${frame.sequence}`,rgbFile=prefix+'.rgb8',depthFile=prefix+'.z16-le';fs.writeFileSync(path.join(output,rgbFile),rgb);fs.writeFileSync(path.join(output,depthFile),depth);
      let positive=0,zero=0,min=Infinity,max=-Infinity;for(let i=0;i<pixels;i++){const code=depth.readUInt16LE(i*2);if(code>0){positive++;min=Math.min(min,code);max=Math.max(max,code);}else zero++;}
      const rgbStats={nonzeroBytes:rgb.reduce((n,v)=>n+Number(v!==0),0),uniqueByteValues:new Set(rgb).size};
      return {sequence:frame.sequence,time:frame.time,dt:frame.dt,imu:frame.imu,imuIntervals:frame.imuIntervals,timings:frame.timings,imageLayout:layout,depthNoiseTick:Math.round(frame.time*180),rgb:{path:rgbFile,sha256:sha(rgb),bytes:rgb.length,type:'Uint8',shape:[calibration.height,calibration.width,3],strideBytes:layout.color.strideBytes,order:'row-major top-down RGB',colorSpace:'sRGB display encoded'},depth:{path:depthFile,sha256:sha(depth),bytes:depth.length,type:'Uint16',unitsMeters:layout.depth.unitsMeters,endianness:'little',shape:[calibration.height,calibration.width],strideBytes:layout.depth.strideBytes,order:'row-major top-down',meaning:'axial optical-Z depth units',encoding:'axial-z16-le'},stats:{rgb:rgbStats,depth:{finite:pixels,positive,zero,nonfinite:0,minPositive:positive?min:null,maxPositive:positive?max:null}}};
    });
    if(frames.length!==frameCount||result.measurements.samples.length!==imuSampleCount||result.calls.length!==heldIntervalCount||result.measurements.batches.length!==frameCount-1)throw new Error('Unexpected full flight acquisition counts');
    if(hardwareRequested&&result.graphics.acceleration!=='hardware-reported')throw new Error('Requested hardware renderer unavailable: '+JSON.stringify(result.graphics));
    const proof=name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name))),bytes:fs.statSync(path.join(output,name)).size});
    const sourceFile='physics-source.mo',plantFile=revisit?'plant-source.mo':sourceFile;
    fs.copyFileSync(path.join(source,'models/Vehicles/LabQuadrotor.mo'),path.join(output,plantFile));
    if(revisit)fs.writeFileSync(path.join(output,sourceFile),fs.readFileSync(path.join(source,'models/Vehicles/LabQuadrotor.mo'),'utf8')+'\n'+fs.readFileSync(path.join(source,controllerFile),'utf8'));
    const identity=(sourcePath,proofPath)=>{const entry=before.find(item=>item.path===sourcePath);if(!entry)throw new Error(`Missing physics input ${sourcePath}`);return {sourcePath,path:proofPath??sourcePath,sha256:entry.sha256,bytes:entry.bytes};};
    const js=identity('public/vendor/rumoca/rumoca_bind_wasm.js'),wasm=identity('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
    for(const input of [js,wasm]){
      if(!requests.some(request=>request.sourcePath===input.sourcePath&&request.sha256===input.sha256))throw new Error(`Physics resource not actually served: ${input.sourcePath}`);
      const destination=path.join(output,input.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(source,input.sourcePath),destination);if(sha(fs.readFileSync(destination))!==input.sha256)throw new Error(`Physics proof copy changed: ${input.sourcePath}`);
    }
    // Sensor measurements contain no position/orientation/velocity fields.
    json(path.join(output,'measurements.json'),result.measurements);
    json(path.join(output,'physics-calls.json'),result.calls);
    json(path.join(output,'oracle-poses.json'),{scope:'Actual Rumoca flight oracle only, never estimator input.',frame:'world FLU',quaternionOrder:'wxyz',poses:result.frames.map(frame=>{const truth=result.oracleSnapshots[frame.oracleSampleIndex];return {sequence:frame.sequence,time:truth.time,x:truth.x,y:truth.y,z:truth.z,quaternion:truth.quaternion};})});
    json(path.join(output,'oracle-physics-snapshots.json'),{scope:'Full Rumoca snapshots for independent acquisition review only; measurements.json is the sensor input.',snapshots:result.oracleSnapshots});
    fs.mkdirSync(path.join(output,'oracle'),{recursive:true});
    const states=result.physicsStates.map((text,index)=>{const name=`oracle/physics-state-${String(index).padStart(3,'0')}.json`;fs.writeFileSync(path.join(output,name),text);return {index,time:result.measurements.samples[index].time,...proof(name)};});
    const {initialSnapshot,finalSnapshot,workspaceSourcePaths,workspaceSourceSha256,...physicsOptions}=result.startupPhysics;
    const expectedPaths=before.filter(file=>file.path.startsWith(libraryDirectory+'/')&&file.path.endsWith('.mo'))
      .map(file=>file.path).sort();
    if(JSON.stringify(workspaceSourcePaths)!==JSON.stringify(expectedPaths))throw new Error('Incomplete compiled physics workspace');
    const workspaceBytes=Buffer.from(JSON.stringify(expectedPaths.map(file=>[file,fs.readFileSync(path.join(source,file),'utf8')])));
    if(sha(workspaceBytes)!==workspaceSourceSha256)throw new Error('Compiled physics workspace differs from frozen sources');
    fs.writeFileSync(path.join(output,'physics-workspace.json'),workspaceBytes);
    const workspace={...proof('physics-workspace.json'),files:expectedPaths.length,
      sourceMapSha256:workspaceSourceSha256,libraryManifest:'source-preimages/'+libraryDirectory+'/provenance.json'};
    const physics={...physicsOptions,initialSnapshot:{path:'oracle-physics-snapshots.json',index:0},finalSnapshot:{path:'oracle-physics-snapshots.json',index:heldIntervalCount},source:identity('models/Vehicles/LabQuadrotor.mo',plantFile),...(revisit?{composition:{controller:identity(controllerFile,'source-preimages/'+controllerFile),source:proof(sourceFile),separator:'\n'}}:{}),js,wasm,workspace,physicsWorker:identity('src/physics.worker.ts','source-preimages/src/physics.worker.ts'),snapshotReader:identity('src/physics-snapshot.ts','source-preimages/src/physics-snapshot.ts'),runtime:identity('src/runtime.ts','source-preimages/src/runtime.ts'),sensorClock:identity('src/sensor-clock.ts','source-preimages/src/sensor-clock.ts'),stateJson:states,calls:proof('physics-calls.json'),scope:'Actual source/session acquisition provenance. Truth fields and raw session states are separate oracle evidence, not estimator inputs.'};
    const after=inventory();json(path.join(output,'sources-after.json'),after);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Source/asset bookends changed');
    // No favicon is requested by this harness; every actual resource must resolve locally.
    if(errors.length)throw new Error(errors.join('\n'));
    json(path.join(output,'manifest.json'),{
      schema:'modelica-rendered-flight-frames-v2',status:'ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS',frameCount,imuSampleCount,heldIntervalCount,calibration,physics,
      rawStorage:{durableCopy:frameCount===13,originalHomeRelative:path.relative(os.homedir(),output)},
      scene:{environment:'city',detail:'medium',lighting:'day',daylightPhase:.43,cars:false,people:false,lidar:false,depthCloud:false,trajectory:revisit?'Actual Modelica out-and-back controller and quadrotor plant; no pose override.':'Only actual LabQuadrotor session snapshots; initial source state and source-owned autopilot. No pose override.'},
      acquisition:{cameraHz,imuHz:90,firstTime:frames[0].time,lastTime:frames.at(-1).time,autopilot:!revisit,indoorTour:false,trajectory:revisit?'revisit':'flight',command:{forward:0,left:0,up:0,yaw:0},commandTime:'Previous camera timestamp held for every physics event in that camera interval.',imuConvention:'Previous raw sample held over (start,end]; endpoint sample applies next. Initial frame has dt0 and no intervals.',imuNoise:'Raw LabQuadrotor modeled specific-force/gyro only. SensorObservations bias/random noise not applied.',depthNoise:{model:'independent-pixel-hash-v1',...result.depthNoise}},
      capture:{api:"World.update(actual snapshot); await World.captureSensorPair(false,'sync',false,true,false)",rgbClipFar:200,depthClipFar:calibration.far,graphics:result.graphics,browserVersion:browser.version(),browserExecutable:{path:executablePath,sha256:sha(fs.readFileSync(executablePath))},userAgent:result.userAgent,launchArgs,hardwareRequested,rendererToneMapping:result.rendererToneMapping,rendererToneMappingExposure:result.rendererToneMappingExposure,performanceClaim:false},
      frames,measurements:proof('measurements.json'),oracle:proof('oracle-poses.json'),oracleSnapshots:proof('oracle-physics-snapshots.json'),screenshot:{...proof('first-camera.png'),note:'Actual native camera screenshot; algorithm inputs retained as raw RGB8.'},
      sourceBookendsEqual:true,sourcesManifestSha256:sha(Buffer.from(JSON.stringify(before))),timings:result.timings,build:{elapsedMs:buildElapsedMs,viteVersion:JSON.parse(fs.readFileSync(path.join(repo,'node_modules/vite/package.json'))).version,projectModuleIds:[...bundled].sort(),files:built},servedResources:requests,consoleMessages,
      limitations:['Actual simulated physics/renderer measurements, not physical hardware.','No SensorObservations stochastic IMU bias/noise. GPU depth noise/dropout is enabled.','Distinct RGB/depth optics retained; no host alignment/resampling.','No estimator, visual tracking, full SLAM, browser runtime or performance qualification.']});
    console.log(JSON.stringify({status:'ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS',frames:frames.map(frame=>({sequence:frame.sequence,time:frame.time,stats:frame.stats})),initialPosition:[initialSnapshot.x,initialSnapshot.y,initialSnapshot.z],finalPosition:[finalSnapshot.x,finalSnapshot.y,finalSnapshot.z],graphics:result.graphics}));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
