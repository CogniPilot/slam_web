// Test-only measured renderer fixture. No estimator, feature detector or host projection.
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
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
function files(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(root,entry.name)):[path.join(root,entry.name)]).sort();}
const relative=file=>path.relative(repo,file).split(path.sep).join('/');
const inventory=()=>[...files(path.join(repo,'src')),...files(path.join(repo,'public')),self,path.join(repo,'models/LabQuadrotor.mo'),path.join(repo,'dev/rumoca-bounded-run.mjs'),path.join(repo,'package.json'),path.join(repo,'package-lock.json')].sort().map(file=>({path:relative(file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
const startup=process.argv.includes('--startup');
if(process.argv.slice(2).some(arg=>arg.startsWith('--')&&!['--execute','--startup'].includes(arg)))throw new Error('Expected only --startup (or internal --execute directory)');

if(process.argv[2]!=='--execute'){
  const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
  // Vite resolves entries through symlinks; use the canonical scratch root too.
  const run=fs.realpathSync(fs.mkdtempSync(path.join(scratch,'rendered-city-frames-')));
  const result=spawnSync(process.execPath,[path.join(repo,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(run,'capture.log'),'--','env','OMP_NUM_THREADS=1',`TMPDIR=${run}`,'nice','-n','15','taskset','-c','6,7',process.execPath,self,'--execute',run,...(startup?['--startup']:[])],{encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(run,'resources.json'),result.stdout??'');fs.writeFileSync(path.join(run,'watchdog-stderr.log'),result.stderr??'');
  const durable=path.join(repo,'dev/artifacts/modelica-rendered-city-frames',path.basename(run));fs.mkdirSync(durable,{recursive:true});
  if(fs.existsSync(path.join(run,'output')))fs.cpSync(path.join(run,'output'),durable,{recursive:true});
  for(const name of ['capture.log','resources.json','watchdog-stderr.log'])fs.copyFileSync(path.join(run,name),path.join(durable,name));
  console.log(JSON.stringify({status:result.status===0?'RENDERED_CITY_CAPTURE_PASS':'RENDERED_CITY_CAPTURE_FAILED',exitCode:result.status,signal:result.signal,durable:relative(durable),scratch:run}));
  process.exitCode=result.status??1;
}else{
  const run=path.resolve(process.argv[3]),output=path.join(run,'output'),source=path.join(run,'source'),dist=path.join(run,'build');
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(source,{recursive:true});
  const before=inventory();json(path.join(output,'sources-before.json'),before);
  for(const folder of ['src','public'])fs.cpSync(path.join(repo,folder),path.join(source,folder),{recursive:true});
  fs.mkdirSync(path.join(source,'models'),{recursive:true});fs.copyFileSync(path.join(repo,'models/LabQuadrotor.mo'),path.join(source,'models/LabQuadrotor.mo'));
  for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(repo,file),path.join(source,file));
  fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'node_modules'),'dir');
  // Retain source preimages, but keep the large frozen asset/build workspace on scratch.
  fs.cpSync(path.join(source,'src'),path.join(output,'source-preimages/src'),{recursive:true});
  fs.cpSync(path.join(source,'models'),path.join(output,'source-preimages/models'),{recursive:true});
  fs.mkdirSync(path.join(output,'source-preimages/dev'),{recursive:true});
  for(const file of [self,path.join(repo,'dev/rumoca-bounded-run.mjs')])fs.copyFileSync(file,path.join(output,'source-preimages',relative(file)));
  for(const file of ['package.json','package-lock.json'])fs.copyFileSync(path.join(source,file),path.join(output,'source-preimages',file));
  for(const entry of before){const frozen=entry.path.startsWith('src/')||entry.path.startsWith('public/')?path.join(source,entry.path):path.join(output,'source-preimages',entry.path);if(sha(fs.readFileSync(frozen))!==entry.sha256)throw new Error(`Freeze raced: ${entry.path}`);}
  const html=`<!doctype html><meta charset="utf-8"><title>Measured city RGB-D fixture</title><style>body{margin:20px;background:#15202a;color:white;font:16px monospace}#view{width:640px;height:360px}#camera{width:640px;height:360px;image-rendering:pixelated}#view{display:none}</style><h1>Actual city RGB / 160 × 90</h1><canvas id="camera" width="160" height="90"></canvas><pre id="status">Preparing frozen Three.js city</pre><div id="view"></div><script type="module" src="/harness.ts"></script>`;
  const harness=`import {World,D435} from './src/world';
import {readPhysicsSnapshot} from './src/physics-snapshot';
import physicsSource from './models/LabQuadrotor.mo?raw';
const world=new World(document.querySelector('#view') as HTMLElement);
world.build('city','medium');world.configureActors(false,false);world.setDepthCloudEnabled(false);world.setLighting('day');
await world.ready;
const encode=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s);};
const poses=[0,.01,.02,0].map((x,i)=>({x,y:5.5,z:2.4,quaternion:[1,0,0,0],time:i/30}));
let startupPhysics:any;
if(${startup}){
 const modulePath=new URL('/vendor/rumoca/rumoca_bind_wasm.js',location.href).href;
 const module=await import(/* @vite-ignore */ modulePath);
 await module.default({module_or_path:new URL('/vendor/rumoca/rumoca_bind_wasm_bg.wasm',location.href).href});
 const session=module.WasmSimulationSession.withInteractiveOptions(physicsSource,'LabQuadrotor',.005,'rk-like',1e-8,1e-6,'[["forward",0],["left",0],["up",0],["yaw",0]]');
 try{startupPhysics={initialSnapshot:readPhysicsSnapshot(session,true),stateJson:session.state_json(),initializationApi:'WasmSimulationSession.withInteractiveOptions',snapshotApi:'readPhysicsSnapshot(session,true)',modelName:'LabQuadrotor',options:{stepSize:.005,solver:'rk-like',absoluteTolerance:1e-8,relativeTolerance:1e-6,inputs:'[["forward",0],["left",0],["up",0],["yaw",0]]'},advanced:false};}finally{session.free();}
 const s=startupPhysics.initialSnapshot;poses.push({x:s.x,y:s.y,z:s.z,quaternion:[...s.quaternion],time:s.time});
}else poses.push({x:0,y:0,z:2.4,quaternion:[1,0,0,0],time:0});
const frames=[];
for(let i=0;i<poses.length;i++){
 const pose=poses[i];world.update(i===4&&startupPhysics?startupPhysics.initialSnapshot:{...pose,velocity:[0,0,0],accel:[0,0,0],gyro:[0,0,0]});
 const [frame,scan]=await world.captureSensorPair(false,'sync',false);
 if(scan||frame.depthCloud)throw new Error('Disabled auxiliary sensor unexpectedly produced output');
 frames.push({sequence:i,time:pose.time,rgb:encode(frame.rgb),depth:encode(new Uint8Array(frame.depth.buffer,frame.depth.byteOffset,frame.depth.byteLength)),depthEncoding:frame.depthEncoding});
 if(i===0){const c=document.querySelector('#camera') as HTMLCanvasElement;c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.rgb),D435.width,D435.height),0,0);}
}
(window as any).result={calibration:D435,graphics:world.graphics,poses,frames,startupPhysics,userAgent:navigator.userAgent,threeCameraRgbColorSpace:'SRGBColorSpace',rendererToneMapping:world.renderer.toneMapping,rendererToneMappingExposure:world.renderer.toneMappingExposure};
document.querySelector('#status')!.textContent='4 measured near-facade views + 1 street-centre diagnostic: city / medium / day / actors off. No estimator.';
`;
  fs.writeFileSync(path.join(source,'index.html'),html);fs.writeFileSync(path.join(source,'harness.ts'),harness);
  fs.writeFileSync(path.join(output,'harness.ts'),harness);fs.writeFileSync(path.join(output,'index.html'),html);
  const bundled=new Set();
  await build({root:source,configFile:false,base:'/',publicDir:false,worker:{format:'es'},plugins:[{name:'capture-source-inventory',moduleParsed(info){if(info.id.startsWith(source+'/src/'))bundled.add(path.relative(source,info.id));}}],build:{outDir:dist,emptyOutDir:true,target:'es2022',minify:true}});
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
    browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const page=await browser.newPage({viewport:{width:1000,height:620},deviceScaleFactor:1});
    page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{consoleMessages.push({type:msg.type(),text:msg.text()});if(msg.type()==='error')errors.push(msg.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>!!window.result,null,{timeout:90000});
    const result=await page.evaluate(()=>window.result);await page.locator('#camera').screenshot({path:path.join(output,'first-camera.png')});
    const calibration={...result.calibration,opticalToBody:[0,0,1,-1,0,0,0,-1,0],originFlu:[result.calibration.forward,0,result.calibration.up]};
    const frames=result.frames.map(frame=>{
      const rgb=Buffer.from(frame.rgb,'base64'),depth=Buffer.from(frame.depth,'base64'),pixels=calibration.width*calibration.height;
      if(rgb.length!==pixels*4||depth.length!==pixels*4)throw new Error('Unexpected raw frame dimensions');
      const prefix=frame.sequence===4?'diagnostic-street-center':`frame-${frame.sequence}`,rgbFile=prefix+'.rgba8',depthFile=prefix+'.depth-f32-le';fs.writeFileSync(path.join(output,rgbFile),rgb);fs.writeFileSync(path.join(output,depthFile),depth);
      let finite=0,positive=0,zero=0,nonfinite=0,min=Infinity,max=-Infinity;for(let i=0;i<pixels;i++){const z=depth.readFloatLE(i*4);if(Number.isFinite(z)){finite++;if(z>0){positive++;min=Math.min(min,z);max=Math.max(max,z);}if(z===0)zero++;}else nonfinite++;}
      const rgbStats={nonzeroBytes:rgb.reduce((n,v)=>n+Number(v!==0),0),uniqueByteValues:new Set(rgb).size,nonopaqueAlpha:0};for(let i=3;i<rgb.length;i+=4)if(rgb[i]!==255)rgbStats.nonopaqueAlpha++;
      return {sequence:frame.sequence,time:frame.time,rgb:{path:rgbFile,sha256:sha(rgb),bytes:rgb.length,type:'Uint8',shape:[calibration.height,calibration.width,4],order:'row-major top-down RGBA',colorSpace:'sRGB display encoded'},depth:{path:depthFile,sha256:sha(depth),bytes:depth.length,type:'Float32',endianness:'little',shape:[calibration.height,calibration.width],order:'row-major top-down',meaning:'axial optical-Z metres',encoding:frame.depthEncoding},stats:{rgb:rgbStats,depth:{finite,positive,zero,nonfinite,minPositive:positive?min:null,maxPositive:positive?max:null}}};
    });
    const diagnostic=frames.pop();
    json(path.join(output,'oracle-poses.json'),{scope:'Separate renderer oracle; never feed truth into estimator after initialization. Kinematic view fixture, not an inertially simulated flight.',frame:'world FLU',quaternionOrder:'wxyz',poses:result.poses.slice(0,4)});
    json(path.join(output,'diagnostic-street-center-oracle.json'),{scope:'Separate diagnostic renderer oracle, not estimator input.',frame:'world FLU',quaternionOrder:'wxyz',pose:result.poses[4]});
    let startupPhysics;
    if(startup){
      if(!result.startupPhysics)throw new Error('Requested physics startup was not produced');
      const {stateJson,...physics}=result.startupPhysics;
      const stateFile='physics-initial-state.json',sourceFile='physics-source.mo';
      fs.writeFileSync(path.join(output,stateFile),stateJson);
      fs.copyFileSync(path.join(source,'models/LabQuadrotor.mo'),path.join(output,sourceFile));
      const identity=(sourcePath,proofPath)=>{const entry=before.find(item=>item.path===sourcePath);if(!entry)throw new Error(`Missing physics input ${sourcePath}`);return {sourcePath,path:proofPath??sourcePath,...{sha256:entry.sha256,bytes:entry.bytes}};};
      const js=identity('public/vendor/rumoca/rumoca_bind_wasm.js'),wasm=identity('public/vendor/rumoca/rumoca_bind_wasm_bg.wasm');
      for(const input of [js,wasm])if(!requests.some(request=>request.sourcePath===input.sourcePath&&request.sha256===input.sha256))throw new Error(`Physics resource not actually served: ${input.sourcePath}`);
      for(const input of [js,wasm]){const destination=path.join(output,input.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(source,input.sourcePath),destination);if(sha(fs.readFileSync(destination))!==input.sha256)throw new Error(`Physics proof copy changed: ${input.sourcePath}`);}
      startupPhysics={...physics,source:identity('models/LabQuadrotor.mo',sourceFile),js,wasm,physicsWorker:identity('src/physics.worker.ts','source-preimages/src/physics.worker.ts'),snapshotReader:identity('src/physics-snapshot.ts','source-preimages/src/physics-snapshot.ts'),stateJson:{path:stateFile,sha256:sha(fs.readFileSync(path.join(output,stateFile)))},scope:'Actual published Rumoca initialization snapshot used only for diagnostic renderer World.update; not estimator replay input.'};
    }
    const after=inventory();json(path.join(output,'sources-after.json'),after);if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Source/asset bookends changed');
    // No favicon is requested by this harness; every actual resource must resolve locally.
    if(errors.length)throw new Error(errors.join('\n'));
    json(path.join(output,'manifest.json'),{schema:'modelica-rendered-city-frames-v1',status:'ACTUAL_THREE_RGBD_CAPTURE_PASS',frameCount:frames.length,calibration,startupPhysics,scene:{environment:'city',detail:'medium',lighting:'day',daylightPhase:.43,cars:false,people:false,lidar:false,depthCloud:false,poseChoice:'Existing street road edge y=5.5m selected from geometric facade/FOV reasoning; actual association counts remain unmeasured. Separate street-centre diagnostic retained; --startup uses actual initialized physics snapshot. Scene unchanged.'},capture:{api:"World.update; await World.captureSensorPair(false,'sync',false)",depthNoise:'Raw renderer axial depths, no disparity noise applied; exact declared D435 noise model metadata retained for replay.',rgbClipFar:200,depthClipFar:calibration.far,graphics:result.graphics,browserVersion:browser.version(),browserExecutable:{path:executablePath,sha256:sha(fs.readFileSync(executablePath))},userAgent:result.userAgent,launchArgs:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],rendererToneMapping:result.rendererToneMapping,rendererToneMappingExposure:result.rendererToneMappingExposure,performanceClaim:false},frames,diagnostics:{streetCenter:{...diagnostic,oraclePath:'diagnostic-street-center-oracle.json',poseSource:startup?'startupPhysics.initialSnapshot':'specified diagnostic view',scope:'Separate street-centre control; no feature/depth association count claimed.'}},oraclePath:'oracle-poses.json',screenshot:{path:'first-camera.png',sha256:sha(fs.readFileSync(path.join(output,'first-camera.png'))),note:'Nearest-neighbour 4x screenshot of actual first raw RGB camera, not overview.'},sourceBookendsEqual:true,sourcesManifestSha256:sha(Buffer.from(JSON.stringify(before))),build:{viteVersion:JSON.parse(fs.readFileSync(path.join(repo,'node_modules/vite/package.json'))).version,projectModuleIds:[...bundled].sort(),files:built},servedResources:requests,consoleMessages,limitations:['Renderer-only RGB-D dataset; no actual hardware, measured IMU trajectory, estimator or SLAM acceptance.','Static actors disabled. Distinct RGB/depth optics retained; no host alignment/resampling.','D435-inspired simulation profile, not physical D435 calibration.','No speed claim from software graphics or four-frame capture.']});
    console.log(JSON.stringify({status:'ACTUAL_THREE_RGBD_CAPTURE_PASS',frames:frames.map(frame=>({sequence:frame.sequence,time:frame.time,stats:frame.stats})),graphics:result.graphics}));
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
