// Test-only RGB MSAA comparison. No plant reacquisition, estimator, image math,
// production source mutation or private framebuffer binding.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {build} from 'vite';import {chromium} from '@playwright/test';
const self=fileURLToPath(import.meta.url),repo=path.resolve(path.dirname(self),'..');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),assert=(ok,message)=>{if(!ok)throw Error(message);};
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
const files=root=>fs.readdirSync(root,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)):[path.join(root,e.name)]).sort();
const proof=(root,name)=>{const b=fs.readFileSync(path.join(root,name));return {path:name,bytes:b.length,sha256:sha(b)};};
// Preserve the frozen package's public ESM export routes, including addons.
// A generic three/* alias bypasses package exports and is deliberately absent.
function threeRoutes(source){
 const pkg=JSON.parse(fs.readFileSync(path.join(source,'three/package.json')));
 return Object.entries(pkg.exports).map(([key,value])=>{
  const target=typeof value==='string'?value:value.import;
  assert(typeof target==='string'&&target.startsWith('./'),'Supported public Three ESM export: '+key);
  const specifier=key==='.'?'three':'three'+key.slice(1),wildcard=specifier.endsWith('*');
  assert((specifier.match(/\*/g)?.length??0)===(target.match(/\*/g)?.length??0)&&(!specifier.includes('*')||wildcard),'Single terminal Three export wildcard');
  return {specifier,target,wildcard};
 }).sort((a,b)=>Number(a.wildcard)-Number(b.wildcard)||b.specifier.length-a.specifier.length);
}
const regexEscape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function threeAliases(source){return threeRoutes(source).map(route=>({find:new RegExp('^'+regexEscape(route.wildcard?route.specifier.slice(0,-1):route.specifier)+(route.wildcard?'(.+)':'')+'$'),replacement:path.join(source,'three',route.target.slice(2).replace('*','$1'))}));}
function checkThreeImports(source){
 const routes=threeRoutes(source),aliases=threeAliases(source),imports=new Map();let occurrences=0;
 const resolve=specifier=>{
  const route=routes.find(r=>r.wildcard?specifier.startsWith(r.specifier.slice(0,-1))&&specifier.length>=r.specifier.length:specifier===r.specifier);
  assert(route,'Non-public Three import: '+specifier);
  const suffix=route.wildcard?specifier.slice(route.specifier.length-1):'',target=path.join(source,'three',route.target.slice(2).replace('*',suffix));
  assert(fs.statSync(target).isFile(),'Public Three import target must be a file: '+specifier);
  const alias=aliases.find(a=>a.find.test(specifier));assert(alias&&specifier.replace(alias.find,alias.replacement)===target,'Alias differs from frozen Three public export: '+specifier);
  return path.relative(source,target);
 };
 for(const route of routes.filter(r=>!r.wildcard))resolve(route.specifier);
 for(const file of files(source).filter(f=>/\.(?:[cm]?js|tsx?)$/.test(f))){
  const expression=/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](three(?:\/[^'"]*)?)['"]/g;
  for(const match of fs.readFileSync(file,'utf8').matchAll(expression)){
   const specifier=match[1],target=resolve(specifier);occurrences++;
   if(!imports.has(specifier))imports.set(specifier,{specifier,target,files:new Set()});imports.get(specifier).files.add(path.relative(source,file));
  }
 }
 return {schema:'frozen-three-public-import-resolution-v1',package:proof(source,'three/package.json'),routes,occurrences,imports:[...imports.values()].sort((a,b)=>a.specifier.localeCompare(b.specifier)).map(i=>({...i,files:[...i.files].sort()})),allResolved:true};
}
const beforeLine='  private rgbTarget = new THREE.WebGLRenderTarget(D435.width, D435.height, { depthBuffer: true, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });';
const afterLine=beforeLine.replace('depthBuffer: true,','depthBuffer: true, samples: 4,');
const args=process.argv.slice(2);
if(args[0]==='--run'){
 assert(args.length===2,'Usage: --run <prepared-directory>');const run=fs.realpathSync(args[1]),plan=JSON.parse(fs.readFileSync(path.join(run,'plan.json')));
 assert(plan.schema==='modelica-rendered-flight-msaa-plan-v1','Prepared comparison required');
 assert(!fs.existsSync(path.join(run,'output/manifest.json'))&&!fs.existsSync(path.join(run,'resources.json')),'Prepared run already executed; preserve prior receipt');
 const r=spawnSync(process.execPath,[path.join(run,'source/driver/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(run,'capture.log'),'--','env','OMP_NUM_THREADS=1',`TMPDIR=${run}`,'nice','-n','15','taskset','-c','6,7',process.execPath,path.join(run,'source/driver/capture-modelica-slam-msaa-frames.mjs'),'--execute',run],{encoding:'utf8',maxBuffer:4*1024*1024});
 fs.writeFileSync(path.join(run,'resources.json'),r.stdout??'');fs.writeFileSync(path.join(run,'watchdog-stderr.log'),r.stderr??'');
 const durable=path.join(repo,'dev/artifacts/modelica-msaa-flight-comparison',path.basename(run));fs.mkdirSync(durable,{recursive:true});
 if(fs.existsSync(path.join(run,'output')))fs.cpSync(path.join(run,'output'),durable,{recursive:true});
 for(const name of ['plan.json','capture.log','resources.json','watchdog-stderr.log'])copy(path.join(run,name),path.join(durable,name));
 console.log(JSON.stringify({status:r.status===0?'MATCHED_MSAA_CAPTURE_PASS':'MATCHED_MSAA_CAPTURE_FAILED',processStatus:r.status,directory:path.relative(repo,durable),scratchHomeRelative:path.relative(os.homedir(),run)}));process.exitCode=r.status??1;
}else if(args[0]==='--execute'){
 assert(args.length===2,'Internal --execute requires prepared-directory');await execute(fs.realpathSync(args[1]));
}else{
 assert(args.length===2&&!args[0].startsWith('--'),'Prepare only: node dev/capture-modelica-slam-msaa-frames.mjs <original-flight-capture> <original-flight-slam-receipt>');
 const capture=fs.realpathSync(args[0]),replay=fs.realpathSync(args[1]);
 const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});const run=fs.realpathSync(fs.mkdtempSync(path.join(scratch,'msaa-'))),source=path.join(run,'source'),output=path.join(run,'output');
 fs.mkdirSync(source,{recursive:true});fs.mkdirSync(output,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(capture,'manifest.json'))),report=JSON.parse(fs.readFileSync(path.join(replay,'report.json')));
 assert(manifest.schema==='modelica-rendered-flight-frames-v1'&&manifest.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'&&manifest.frameCount===13&&manifest.sourceBookendsEqual,'Actual original13-frame corpus required');
 const hardwareRequested=manifest.capture.graphics.acceleration==='hardware-reported';
 const launchArgs=['--no-sandbox',...(hardwareRequested?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])];
 assert(report.captureManifestSha256===sha(fs.readFileSync(path.join(capture,'manifest.json')))&&report.model==='RGBDRenderedFlightSLAMAcceptance','Replay must bind the exact original flight');
 const inventory=JSON.parse(fs.readFileSync(path.join(capture,'sources-before.json')));
 assert(JSON.stringify(inventory)===JSON.stringify(JSON.parse(fs.readFileSync(path.join(capture,'sources-after.json')))),'Original capture source bookends');
 const retained=['manifest.json','sources-before.json','sources-after.json',manifest.measurements.path,manifest.oracleSnapshots.path,manifest.oracle.path,...manifest.frames.flatMap(f=>[f.rgb.path,f.depth.path])];
 for(const name of new Set(retained))copy(path.join(capture,name),path.join(output,'input-flight',name));
 for(const item of [manifest.measurements,manifest.oracleSnapshots,manifest.oracle,...manifest.frames.flatMap(f=>[f.rgb,f.depth])])assert(sha(fs.readFileSync(path.join(capture,item.path)))===item.sha256,'Original measured/oracle input hash: '+item.path);
 copy(path.join(replay,'report.json'),path.join(output,'input-replay/report.json'));copy(path.join(replay,report.mat.path),path.join(output,'input-replay/rendered-flight.mat'));
 assert(sha(fs.readFileSync(path.join(output,'input-replay/rendered-flight.mat')))===report.mat.sha256,'Original replay MAT hash');
 for(const entry of inventory.filter(e=>e.path.startsWith('src/'))){
  const input=path.join(capture,'source-preimages',entry.path);assert(sha(fs.readFileSync(input))===entry.sha256,'Original rendering source preimage: '+entry.path);
  copy(input,path.join(source,'baseline',entry.path));copy(input,path.join(source,'msaa4',entry.path));
 }
 for(const entry of inventory.filter(e=>e.path.startsWith('public/'))){
  const input=path.join(repo,entry.path);assert(sha(fs.readFileSync(input))===entry.sha256,'Current asset differs from original capture: '+entry.path);copy(input,path.join(source,entry.path));
 }
 const variantPath=path.join(source,'msaa4/src/world.ts'),baseline=fs.readFileSync(variantPath,'utf8');assert(baseline.split(beforeLine).length===2,'Exact one-line source overlay');
 fs.writeFileSync(variantPath,baseline.replace(beforeLine,afterLine));
 const overlay={path:'src/world.ts',before:beforeLine,after:afterLine,preimageSha256:sha(baseline),postimageSha256:sha(fs.readFileSync(variantPath)),depthTargetUnchanged:true};
 fs.writeFileSync(path.join(output,'rgb-msaa4.patch'),'--- baseline/src/world.ts\n+++ msaa4/src/world.ts\n@@ -105,1 +105,1 @@\n-'+beforeLine+'\n+'+afterLine+'\n');
 fs.cpSync(path.join(repo,'node_modules/three'),path.join(source,'three'),{recursive:true});
 assert(JSON.parse(fs.readFileSync(path.join(source,'three/package.json'))).version==='0.180.0','Inspected Three version0.180.0');
 fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'node_modules'),'dir');
 copy(self,path.join(source,'driver/capture-modelica-slam-msaa-frames.mjs'));copy(path.join(repo,'dev/rumoca-bounded-run.mjs'),path.join(source,'driver/rumoca-bounded-run.mjs'));
 // The frozen driver resolves its build-host packages through this explicit symlink.
 fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'driver/node_modules'),'dir');
 for(const name of ['package.json','package-lock.json'])copy(path.join(repo,name),path.join(source,'driver',name));
 const snapshots=JSON.parse(fs.readFileSync(path.join(output,'input-flight',manifest.oracleSnapshots.path))).snapshots;
 assert(snapshots.length===37,'37 actual acquired snapshots');
 const input={calibration:manifest.calibration,snapshots:Array.from({length:13},(_,i)=>snapshots[i*3])};
 input.snapshots.forEach((s,i)=>assert(Math.abs(s.time-i/30)<1e-12,'Actual camera snapshot chronology'));
 json(path.join(source,'input.json'),input);
 fs.writeFileSync(path.join(source,'index.html'),'<!doctype html><meta charset="utf-8"><title>Matched RGB MSAA diagnostic</title><canvas id="camera" width="160" height="90" style="width:640px;height:360px;image-rendering:pixelated"></canvas><div id="view" style="display:none"></div><script type="module" src="/harness.ts"></script>');
 fs.writeFileSync(path.join(source,'harness.ts'),harnessSource());
 const threePublicImports=checkThreeImports(source);json(path.join(source,'three-public-imports.json'),threePublicImports);
 const entries=files(source).filter(file=>!file.includes('/node_modules/')).map(file=>proof(source,path.relative(source,file)));
 const inputFiles=files(path.join(output,'input-flight')).map(file=>proof(output,path.relative(output,file))).concat(files(path.join(output,'input-replay')).map(file=>proof(output,path.relative(output,file))));
 const plan={schema:'modelica-rendered-flight-msaa-plan-v1',status:'PREPARED_NOT_EXECUTED',sourceFlight:{manifest:proof(output,'input-flight/manifest.json'),sourcesBefore:proof(output,'input-flight/sources-before.json'),sourcesAfter:proof(output,'input-flight/sources-after.json'),measurements:proof(output,'input-flight/'+manifest.measurements.path),oracleSnapshots:proof(output,'input-flight/'+manifest.oracleSnapshots.path),oracle:proof(output,'input-flight/'+manifest.oracle.path)},sourceReplay:{report:proof(output,'input-replay/report.json'),mat:proof(output,'input-replay/rendered-flight.mat')},sourceFlightDirectory:path.relative(repo,capture),sourceReplayDirectory:path.relative(repo,replay),physicsReacquired:false,overlay,threePublicImports:proof(source,'three-public-imports.json'),entries,inputFiles,resources:{seconds:120,rssMiB:8192,availableMiB:16384,cpus:'6,7',nice:15,omp:1},variants:['baselinePbo0','baselinePublic0','baselineRepeat0','msaaPublic4','msaaRepeat4']};
 plan.hardwareRequested=hardwareRequested;plan.launchArgs=launchArgs;
 json(path.join(run,'plan.json'),plan);json(path.join(output,'source-before.json'),entries);
 console.log(JSON.stringify({status:plan.status,preparedDirectory:run,planSha256:sha(fs.readFileSync(path.join(run,'plan.json'))),runCommand:[process.execPath,self,'--run',run]}));
}

function harnessSource(){return `
import input from './input.json';
const mode=new URLSearchParams(location.search).get('mode');
if(mode!=='0'&&mode!=='4')throw Error('Explicit samples mode required');
const loaded=mode==='0'?await import('./baseline/src/world'):await import('./msaa4/src/world');
const {World,D435}=loaded;const world=new World(document.querySelector('#view') as HTMLElement);
world.build('city','medium');world.configureActors(false,false);world.setDepthCloudEnabled(false);world.setLighting('day');await world.ready;
const gl=world.renderer.getContext() as WebGL2RenderingContext;
const supported=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.SRGB8_ALPHA8,gl.SAMPLES) as Int32Array);
const capabilities={maxSamples:world.renderer.capabilities.maxSamples,srgb8Alpha8Samples:supported,requestedSamples:Number(mode),multisampledRenderToTexture:!!gl.getExtension('WEBGL_multisampled_render_to_texture')};
if(mode==='4'&&(capabilities.maxSamples<4||!supported.includes(4)))throw Error('Actual4-sample sRGB target unsupported');
const encode=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return btoa(s);};
const packed=(frame:any)=>({rgb:encode(frame.rgb),depth:encode(new Uint8Array(frame.depth.buffer,frame.depth.byteOffset,frame.depth.byteLength)),depthEncoding:frame.depthEncoding});
const frames:any[]=[];
for(let sequence=0;sequence<input.snapshots.length;sequence++){
 const pose=input.snapshots[sequence],variants:any={};
 const take=async(id:string,kind:'pbo'|'public')=>{world.update(pose);const before=performance.now();const frame=kind==='pbo'?(await world.captureSensorPair(false,'sync',false))[0]:world.capture();const elapsedMs=performance.now()-before;variants[id]={...packed(frame),elapsedMs};
 if(sequence===0&&id===(mode==='0'?'baselinePublic0':'msaaPublic4'))(document.querySelector('#camera') as HTMLCanvasElement).getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.rgb),D435.width,D435.height),0,0);};
 if(mode==='0'){await take('baselinePbo0','pbo');await take('baselinePublic0','public');await take('baselineRepeat0','pbo');}
 else{await take('msaaPublic4','public');if(sequence===0)await take('msaaRepeat4','public');}
 const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL error after matched frame: '+error);
 frames.push({sequence,time:pose.time,variants});
}
(window as any).result={mode,frames,capabilities,calibration:D435,graphics:world.graphics,userAgent:navigator.userAgent,toneMapping:world.renderer.toneMapping,exposure:world.renderer.toneMappingExposure};
`;}

async function execute(run){
 const plan=JSON.parse(fs.readFileSync(path.join(run,'plan.json'))),source=path.join(run,'source'),output=path.join(run,'output'),dist=path.join(run,'build');
 const verify=()=>{for(const entry of plan.entries)assert(sha(fs.readFileSync(path.join(source,entry.path)))===entry.sha256,'Frozen source changed: '+entry.path);for(const entry of plan.inputFiles)assert(sha(fs.readFileSync(path.join(output,entry.path)))===entry.sha256,'Frozen input changed: '+entry.path);};verify();
 const parsed=new Set(),buildStarted=performance.now();
 await build({root:source,configFile:false,base:'/',publicDir:false,resolve:{alias:threeAliases(source)},worker:{format:'es'},plugins:[{name:'matched-source-record',moduleParsed(info){if(info.id.startsWith(source+path.sep))parsed.add(path.relative(source,info.id));}}],build:{outDir:dist,emptyOutDir:true,target:'es2022',minify:true}});
 const buildMs=performance.now()-buildStarted,built=files(dist).map(file=>proof(dist,path.relative(dist,file)));fs.cpSync(dist,path.join(output,'built-harness'),{recursive:true});
 const requests=[],errors=[],consoleMessages=[];
 const server=http.createServer((request,response)=>{if(request.url==='/favicon.ico'){response.writeHead(204);response.end();return;}try{
  const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname),buildFile=path.resolve(dist,'.'+name),assetFile=path.resolve(source,'public','.'+name);
  assert(buildFile.startsWith(dist+path.sep)&&assetFile.startsWith(path.join(source,'public')+path.sep)||name==='/','Safe local URL');
  const file=name==='/'?path.join(dist,'index.html'):fs.existsSync(buildFile)?buildFile:assetFile,bytes=fs.readFileSync(file);
  requests.push({path:name,sourcePath:file.startsWith(dist)?'build/'+path.relative(dist,file):'public/'+path.relative(path.join(source,'public'),file),bytes:bytes.length,sha256:sha(bytes)});
  response.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.hdr':'application/octet-stream','.glb':'model/gltf-binary'})[path.extname(file)]??'application/octet-stream'});response.end(bytes);
 }catch(e){errors.push(String(e));response.writeHead(404);response.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const executablePath=process.env.CHROMIUM_PATH;assert(executablePath,'Set pinned CHROMIUM_PATH');let browser;
 const variants={baselinePbo0:{rgbSamples:0,api:"World.captureSensorPair(false,'sync',false)",frames:[]},baselinePublic0:{rgbSamples:0,api:'World.capture()',frames:[]},baselineRepeat0:{rgbSamples:0,api:"World.captureSensorPair(false,'sync',false)",frames:[]},msaaPublic4:{rgbSamples:4,api:'World.capture()',frames:[]},msaaRepeat4:{rgbSamples:4,api:'World.capture()',frames:[]}};
 try{
  browser=await chromium.launch({executablePath,headless:true,args:plan.launchArgs});const results=[];
  for(const mode of ['0','4']){
   const page=await browser.newPage({viewport:{width:1000,height:620},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{consoleMessages.push({mode,type:m.type(),text:m.text()});if(m.type()==='error')errors.push(m.text());});
   try{await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);await page.waitForFunction(()=>!!window.result,null,{timeout:90000});const result=await page.evaluate(()=>window.result);results.push(result);
    await page.locator('#camera').screenshot({path:path.join(output,`first-camera-samples${mode}.png`)});
    for(const frame of result.frames)for(const[id,raw]of Object.entries(frame.variants)){
     const rgb=Buffer.from(raw.rgb,'base64'),depth=Buffer.from(raw.depth,'base64');assert(rgb.length===90*160*4&&depth.length===90*160*4,'Raw160x90 shape');
     const prefix=`variants/${id}/frame-${frame.sequence}`;for(const[suffix,bytes]of[['.rgba8',rgb],['.depth-f32-le',depth]]){const file=path.join(output,prefix+suffix);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
     variants[id].frames.push({sequence:frame.sequence,time:frame.time,elapsedMs:raw.elapsedMs,
      rgb:{...proof(output,prefix+'.rgba8'),type:'Uint8',shape:[90,160,4],order:'row-major top-down RGBA',colorSpace:'sRGB display encoded'},
      depth:{...proof(output,prefix+'.depth-f32-le'),type:'Float32',endianness:'little',shape:[90,160],order:'row-major top-down',meaning:'axial optical-Z metres',encoding:raw.depthEncoding}});
    }
   }finally{await page.close();}
  }
  const original=JSON.parse(fs.readFileSync(path.join(output,'input-flight/manifest.json'))),comparisons=[];
  const read=(id,frame,kind)=>fs.readFileSync(path.join(output,variants[id].frames[frame][kind].path));
  for(let frame=0;frame<13;frame++){
   const old=original.frames[frame],oldRGB=fs.readFileSync(path.join(output,'input-flight',old.rgb.path)),oldDepth=fs.readFileSync(path.join(output,'input-flight',old.depth.path));
   const a=read('baselinePbo0',frame,'rgb'),b=read('baselinePublic0',frame,'rgb'),repeat=read('baselineRepeat0',frame,'rgb'),c=read('msaaPublic4',frame,'rgb');
   let changedBytes=0,changedPixels=0;for(let pixel=0;pixel<90*160;pixel++){let changed=false;for(let channel=0;channel<4;channel++)if(b[pixel*4+channel]!==c[pixel*4+channel]){changedBytes++;changed=true;}if(changed)changedPixels++;}
   const baselineRGBEqual=a.equals(b)&&a.equals(repeat),historicalRGBEqual=a.equals(oldRGB),depthEqual=['baselinePbo0','baselinePublic0','baselineRepeat0','msaaPublic4'].every(id=>read(id,frame,'depth').equals(oldDepth));
   comparisons.push({sequence:frame,time:old.time,baselineRGBEqual,historicalRGBEqual,allDepthBitEqualOriginal:depthEqual,msaaChangedRGBBytes:changedBytes,msaaChangedRGBPixels:changedPixels});
  }
  const msaaRepeatEqual=read('msaaPublic4',0,'rgb').equals(read('msaaRepeat4',0,'rgb'))&&read('msaaPublic4',0,'depth').equals(read('msaaRepeat4',0,'depth'));
  verify();assert(errors.length===0,'Browser/local resource errors: '+errors.join(';'));
  const match=results.every(r=>['fx','fy','rgbFx','rgbFy','cx','cy','near','far','width','height','baseline','depthNoiseDisparityPx','depthNoiseReferenceFx','forward','up'].every(key=>r.calibration[key]===original.calibration[key]));assert(match,'Original separate optics/mount/noise calibration changed');
  assert(!plan.hardwareRequested||results.every(r=>r.graphics.acceleration==='hardware-reported'&&r.graphics.renderer===original.capture.graphics.renderer),'Matched hardware renderer required');
  const pass=comparisons.every(c=>c.baselineRGBEqual&&c.historicalRGBEqual&&c.allDepthBitEqualOriginal)&&msaaRepeatEqual;
  fs.mkdirSync(path.join(output,'source-preimages'),{recursive:true});for(const file of ['baseline/src/world.ts','msaa4/src/world.ts','harness.ts','input.json','three-public-imports.json','driver/capture-modelica-slam-msaa-frames.mjs','driver/rumoca-bounded-run.mjs','driver/package.json','driver/package-lock.json','three/package.json','three/build/three.module.js','three/build/three.core.js','three/src/renderers/WebGLRenderer.js','three/src/renderers/webgl/WebGLTextures.js'])copy(path.join(source,file),path.join(output,'source-preimages',file));
  const manifest={schema:'modelica-rendered-flight-msaa-comparison-v1',status:pass?'MATCHED_MSAA_CAPTURE_PASS':'MATCHED_MSAA_CAPTURE_COMPARISON_FAILED',physicsReacquired:false,frameCount:13,imuSampleCount:37,heldIntervalCount:36,
   sourceFlight:plan.sourceFlight,sourceReplay:plan.sourceReplay,calibration:original.calibration,variants,comparisons,msaaRepeatEqual,sourceBookendsEqual:true,overlay:plan.overlay,
   scene:{environment:'city',detail:'medium',lighting:'day',daylightPhase:.43,cars:false,people:false,lidar:false,depthCloud:false},
   capture:{browserVersion:browser.version(),browserExecutable:{path:executablePath,sha256:sha(fs.readFileSync(executablePath))},launchArgs:plan.launchArgs,hardwareRequested:plan.hardwareRequested,pages:results.map(r=>({mode:r.mode,capabilities:r.capabilities,graphics:r.graphics,toneMapping:r.toneMapping,exposure:r.exposure,userAgent:r.userAgent})),performanceClaim:false},
   sourceIdentity:{frozenEntriesManifestSha256:sha(Buffer.from(JSON.stringify(plan.entries))),projectModules:[...parsed].sort(),threeVersion:'0.180.0',threePublicImports:proof(output,'source-preimages/three-public-imports.json'),threePackage:proof(output,'source-preimages/three/package.json'),baselineWorld:proof(output,'source-preimages/baseline/src/world.ts'),variantWorld:proof(output,'source-preimages/msaa4/src/world.ts'),overlay:proof(output,'rgb-msaa4.patch'),driver:proof(output,'source-preimages/driver/capture-modelica-slam-msaa-frames.mjs')},
   build:{elapsedMs:buildMs,files:built},servedResources:requests,consoleMessages,limitations:['Frozen actual plant snapshots place the renderer; no physics is reacquired and no oracle enters estimator inputs.','RGB-only source-copy4sample overlay. All depth transport and images remain unchanged when comparison passes.','No Modelica tracking, browser estimator, fullSLAM or hardware throughput qualification.']};
  json(path.join(output,'source-after.json'),plan.entries.map(entry=>proof(source,entry.path)));json(path.join(output,'manifest.json'),manifest);
  console.log(JSON.stringify({status:manifest.status,comparisons,msaaRepeatEqual}));assert(pass,'Matched capture byte equivalence failed; all raw results retained');
 }catch(error){json(path.join(output,'failure.json'),{error:String(error?.stack??error),errors,consoleMessages});throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
