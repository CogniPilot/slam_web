// GPU-only RGB integration experiment on immutable actual flight snapshots.
// No plant reacquisition, host image filtering, estimator math or production change.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';import {chromium} from '@playwright/test';
const self=fileURLToPath(import.meta.url),repo=path.resolve(path.dirname(self),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(value,message)=>{if(!value)throw Error(message);};
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
const walk=root=>fs.readdirSync(root,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()).flatMap(e=>e.isDirectory()?walk(path.join(root,e.name)):[path.join(root,e.name)]).sort();
const proof=(root,name)=>{const bytes=fs.readFileSync(path.join(root,name));return {path:name,bytes:bytes.length,sha256:sha(bytes)};};
const args=process.argv.slice(2);
if(args[0]==='--run'){
  assert(args.length===2,'Usage: --run <prepared directory>');
  const run=fs.realpathSync(args[1]);assert(!fs.existsSync(path.join(run,'resources.json')),'Run already executed; preserve it');
  const result=spawnSync(process.execPath,[path.join(run,'source/driver/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
    '--log',path.join(run,'capture.log'),'--','env','OMP_NUM_THREADS=1',`TMPDIR=${run}`,'nice','-n','15','taskset','-c','6,7',
    process.execPath,path.join(run,'source/driver/capture-modelica-slam-integrated-rgb.mjs'),'--execute',run],{encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(run,'resources.json'),result.stdout??'');fs.writeFileSync(path.join(run,'watchdog-stderr.log'),result.stderr??'');
  const durable=path.join(repo,'dev/artifacts/modelica-integrated-rgb',path.basename(run));fs.mkdirSync(durable,{recursive:true});
  if(fs.existsSync(path.join(run,'output')))fs.cpSync(path.join(run,'output'),durable,{recursive:true});
  for(const name of ['plan.json','capture.log','resources.json','watchdog-stderr.log'])copy(path.join(run,name),path.join(durable,name));
  console.log(JSON.stringify({directory:path.relative(repo,durable),processStatus:result.status,signal:result.signal}));process.exitCode=result.status===0?0:1;
}else if(args[0]==='--execute'){
  assert(args.length===2,'Internal execution requires prepared directory');await execute(fs.realpathSync(args[1]));
}else{
  assert(args.length===2,'Prepare: node dev/capture-modelica-slam-integrated-rgb.mjs <actual-flight-capture> <native-flight-receipt>');
  const capture=fs.realpathSync(args[0]),replay=fs.realpathSync(args[1]);
  const manifest=JSON.parse(fs.readFileSync(path.join(capture,'manifest.json'))),report=JSON.parse(fs.readFileSync(path.join(replay,'report.json')));
  assert(manifest.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'&&manifest.sourceBookendsEqual&&manifest.frameCount===13,'Complete actual capture required');
  assert(report.captureManifestSha256===sha(fs.readFileSync(path.join(capture,'manifest.json'))),'Replay/capture binding');
  const inventory=JSON.parse(fs.readFileSync(path.join(capture,'sources-before.json')));
  assert(JSON.stringify(inventory)===JSON.stringify(JSON.parse(fs.readFileSync(path.join(capture,'sources-after.json')))),'Original source bookends');
  const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
  const run=fs.mkdtempSync(path.join(scratch,'integrated-rgb-')),source=path.join(run,'source'),output=path.join(run,'output');
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(source,{recursive:true});
  const retained=['manifest.json','sources-before.json','sources-after.json',manifest.oracleSnapshots.path,manifest.oracle.path,manifest.measurements.path,
    ...manifest.frames.flatMap(frame=>[frame.rgb.path,frame.depth.path])];
  for(const name of retained)copy(path.join(capture,name),path.join(output,'input-flight',name));
  for(const entry of [manifest.oracleSnapshots,manifest.oracle,manifest.measurements,...manifest.frames.flatMap(f=>[f.rgb,f.depth])])
    assert(sha(fs.readFileSync(path.join(capture,entry.path)))===entry.sha256,'Original input hash: '+entry.path);
  copy(path.join(replay,'report.json'),path.join(output,'input-replay/report.json'));
  copy(path.join(replay,report.mat.path),path.join(output,'input-replay/rendered-flight.mat'));
  assert(sha(fs.readFileSync(path.join(output,'input-replay/rendered-flight.mat')))===report.mat.sha256,'Original MAT identity');
  for(const entry of inventory.filter(e=>e.path.startsWith('src/'))){
    const from=path.join(capture,'source-preimages',entry.path);assert(sha(fs.readFileSync(from))===entry.sha256,'Original source preimage: '+entry.path);
    copy(from,path.join(source,entry.path));
  }
  copy(path.join(repo,'src/gpu-rgb-integrator.ts'),path.join(source,'src/gpu-rgb-integrator.ts'));
  fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'node_modules'),'dir');
  copy(self,path.join(source,'driver/capture-modelica-slam-integrated-rgb.mjs'));
  copy(path.join(repo,'dev/rumoca-bounded-run.mjs'),path.join(source,'driver/rumoca-bounded-run.mjs'));
  fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'driver/node_modules'),'dir');
  const snapshots=JSON.parse(fs.readFileSync(path.join(capture,manifest.oracleSnapshots.path))).snapshots;
  assert(snapshots.length===37,'Complete original snapshots');
  json(path.join(source,'input.json'),{snapshots:Array.from({length:13},(_,i)=>snapshots[3*i])});
  fs.writeFileSync(path.join(source,'harness.ts'),harness());
  fs.writeFileSync(path.join(source,'entry.ts'),"import './harness';");
  const entries=walk(source).map(file=>proof(source,path.relative(source,file))),inputFiles=walk(output).map(file=>proof(output,path.relative(output,file)));
  const hardwareRequested=manifest.capture.graphics.acceleration==='hardware-reported';
  const plan={schema:'modelica-integrated-rgb-plan-v1',repo,status:'PREPARED_NOT_EXECUTED',entries,inputFiles,
    sourceFlight:{manifest:proof(output,'input-flight/manifest.json'),sourcesBefore:proof(output,'input-flight/sources-before.json'),sourcesAfter:proof(output,'input-flight/sources-after.json'),
      oracleSnapshots:proof(output,'input-flight/'+manifest.oracleSnapshots.path),oracle:proof(output,'input-flight/'+manifest.oracle.path),measurements:proof(output,'input-flight/'+manifest.measurements.path)},
    sourceReplay:{report:proof(output,'input-replay/report.json'),mat:proof(output,'input-replay/rendered-flight.mat')},
    publicInventory:inventory.filter(e=>e.path.startsWith('public/')),hardwareRequested,
    launchArgs:['--no-sandbox',...(hardwareRequested?['--enable-gpu','--use-gl=angle','--use-angle=gl']:['--use-angle=swiftshader','--enable-unsafe-swiftshader'])]};
  json(path.join(run,'plan.json'),plan);json(path.join(output,'source-before.json'),entries);
  console.log(JSON.stringify({preparedDirectory:run,status:plan.status,runCommand:[process.execPath,self,'--run',run]}));
}

function harness(){return `
import * as THREE from 'three';
import {World,D435 as c} from './src/world';
import {GpuRgbIntegrator} from './src/gpu-rgb-integrator';
import {GpuReadback} from './src/gpu-readback';
import {withCommittedScene} from './src/committed-scene';
import input from './input.json';
const world=new World({canvas:new OffscreenCanvas(640,400),width:640,height:400,pixelRatio:1,base:location.origin+'/'});
world.build('city','medium');world.configureActors(false,false);world.setDepthCloudEnabled(false);world.setLighting('day');await world.ready;
const renderer=world.renderer,gl=renderer.getContext() as WebGL2RenderingContext,readback=new GpuReadback(gl);
const integrated=[new GpuRgbIntegrator(c.width,c.height,2),new GpuRgbIntegrator(c.width,c.height,4)];
const encode=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i++)text+=String.fromCharCode(bytes[i]);return btoa(text);};
const packed=(frame:any)=>({rgb:encode(frame.rgb),depth:encode(new Uint8Array(frame.depth.buffer,frame.depth.byteOffset,frame.depth.byteLength)),depthEncoding:frame.depthEncoding});
// GPU checker controls independently distinguish linear integration (~188)
// from averaging sRGB bytes (128), as well as source/output coordinate order.
const controls:any[]=[];
for(const factor of [2,4] as const){
 const probe=new GpuRgbIntegrator(2,2,factor),scene=new THREE.Scene(),camera=new THREE.Camera();
 const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,
  vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader:'void main(){ivec2 p=ivec2(gl_FragCoord.xy);float v=float((p.x+p.y)%2);gl_FragColor=vec4(v,v,v,1.);}'});
 const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;scene.add(quad);
 probe.submit(renderer,scene,camera);const bytes=new Uint8Array(16);renderer.readRenderTargetPixels(probe.target,0,0,2,2,bytes);
 controls.push({factor,kind:'linear-black-white-checker',rgba:Array.from(bytes)});
 material.fragmentShader='void main(){ivec2 p=ivec2(gl_FragCoord.xy)/'+factor+';gl_FragColor=vec4(float(p.x),float(p.y),0.,1.);}';material.needsUpdate=true;
 probe.submit(renderer,scene,camera);renderer.readRenderTargetPixels(probe.target,0,0,2,2,bytes);
 controls.push({factor,kind:'block-coordinate-order',rgba:Array.from(bytes)});
 probe.dispose();quad.geometry.dispose();material.dispose();
}
world.lighting.invalidateShadows();
const frames:any[]=[];
for(let sequence=0;sequence<input.snapshots.length;sequence++){
 const pose=input.snapshots[sequence];world.update(pose);
 const baseline=world.capture(),variants:any={baselinePublic0:{...packed(baseline)}};
 for(const filter of integrated){
  const hidden=[world.robot,world.points,world.estimatorView,world.lidarView,world.depthCloudView],visibility=hidden.map(x=>x.visible);
  const before=performance.now();hidden.forEach(x=>x.visible=false);
  try{
   (world as any).optics(c.rgbFx,c.rgbFy,200);
   withCommittedScene(world.scene,()=>filter.submit(renderer,world.scene,(world as any).sensor));
   const bytes=new Uint8Array(c.width*c.height*4),publicBytes=new Uint8Array(bytes.length);
   renderer.readRenderTargetPixels(filter.target,0,0,c.width,c.height,publicBytes);
   // Public readback may restore a different target; bind the output explicitly.
   renderer.setRenderTarget(filter.target);readback.readBatchSync(read=>read(c.width,c.height,bytes));
   if(bytes.some((byte,i)=>byte!==publicBytes[i]))throw Error('PBO/public integrated RGB differ');
   const rgb=(world as any).flip(bytes) as Uint8Array;
   variants['integrated'+filter.factor]={...packed({...baseline,rgb}),elapsedMs:performance.now()-before,pboPublicEqual:true};
   if(sequence===0){
    withCommittedScene(world.scene,()=>filter.submit(renderer,world.scene,(world as any).sensor));
    renderer.readRenderTargetPixels(filter.target,0,0,c.width,c.height,bytes);
    const repeated=(world as any).flip(bytes) as Uint8Array;
    variants['repeat'+filter.factor]={...packed({...baseline,rgb:repeated})};
   }
  }finally{hidden.forEach((x,i)=>x.visible=visibility[i]);renderer.setRenderTarget(null);}
 }
 const after=world.capture();variants.baselineRepeat0={...packed(after)};
 const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL error: '+error);
 frames.push({sequence,time:pose.time,variants});
}
(window as any).result={frames,controls,graphics:world.graphics,calibration:c,userAgent:navigator.userAgent};
integrated.forEach(x=>x.dispose());readback.dispose();
`;}

async function execute(run){
  const plan=JSON.parse(fs.readFileSync(path.join(run,'plan.json'))),source=path.join(run,'source'),output=path.join(run,'output');
  assert(plan.schema==='modelica-integrated-rgb-plan-v1','Exact plan schema');
  const verify=()=>{for(const entry of plan.entries)assert(sha(fs.readFileSync(path.join(source,entry.path)))===entry.sha256,'Source changed: '+entry.path);
    for(const entry of plan.inputFiles)assert(sha(fs.readFileSync(path.join(output,entry.path)))===entry.sha256,'Input changed: '+entry.path);};verify();
  const bundle=await build({absWorkingDir:source,entryPoints:['entry.ts'],bundle:true,write:false,format:'esm',metafile:true,
    define:{'import.meta.env.BASE_URL':'"/"'},logLevel:'silent',target:'es2022'});
  const bytes=bundle.outputFiles[0].contents;fs.writeFileSync(path.join(output,'bundle.js'),bytes);
  const modules=Object.keys(bundle.metafile.inputs).map(name=>({path:name,sha256:sha(fs.readFileSync(path.resolve(source,name)))}));
  const served=[],errors=[];
  const server=http.createServer((request,response)=>{try{
    const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    if(name==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>GPU RGB integration</title><script type="module" src="/bundle.js"></script>');return;}
    if(name==='/favicon.ico'){response.writeHead(204);response.end();return;}
    if(name==='/bundle.js'){response.setHeader('Content-Type','text/javascript');response.end(bytes);return;}
    const publicRoot=path.join(plan.repo,'public'),file=path.resolve(publicRoot,'.'+name);assert(file.startsWith(publicRoot+path.sep),'Confined asset');
    const data=fs.readFileSync(file),entry=plan.publicInventory.find(e=>e.path===path.relative(plan.repo,file));
    assert(entry&&sha(data)===entry.sha256,'Original asset identity: '+name);served.push({path:entry.path,sha256:entry.sha256,bytes:data.length});
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'application/octet-stream');response.end(data);
  }catch(error){errors.push(String(error));response.writeHead(404);response.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{
    assert(process.env.CHROMIUM_PATH,'Set pinned CHROMIUM_PATH');
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:plan.launchArgs});
    const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.result,null,{timeout:90000});
    const result=await page.evaluate(()=>window.result),original=JSON.parse(fs.readFileSync(path.join(output,'input-flight/manifest.json')));
    assert(result.frames.length===13,'All original camera acquisitions');
    assert(!plan.hardwareRequested||(result.graphics.acceleration==='hardware-reported'&&result.graphics.renderer===original.capture.graphics.renderer),'Exact original hardware renderer');
    const variants={baselinePublic0:{rgbSamples:0,integrationFactor:1,api:'World.capture()',frames:[]},baselineRepeat0:{rgbSamples:0,integrationFactor:1,api:'World.capture()',frames:[]},
      integrated2:{rgbSamples:0,integrationFactor:2,api:'GpuRgbIntegrator.submit/public+PBO',frames:[]},integrated4:{rgbSamples:0,integrationFactor:4,api:'GpuRgbIntegrator.submit/public+PBO',frames:[]},
      repeat2:{rgbSamples:0,integrationFactor:2,api:'GpuRgbIntegrator.submit/public',frames:[]},repeat4:{rgbSamples:0,integrationFactor:4,api:'GpuRgbIntegrator.submit/public',frames:[]}};
    const comparisons=[];
    for(const frame of result.frames){
      assert(frame.sequence===comparisons.length&&frame.time===original.frames[frame.sequence].time,'Exact acquisition chronology');
      const old=original.frames[frame.sequence],oldRGB=fs.readFileSync(path.join(output,'input-flight',old.rgb.path)),oldDepth=fs.readFileSync(path.join(output,'input-flight',old.depth.path));
      for(const [id,raw]of Object.entries(frame.variants)){
        const rgb=Buffer.from(raw.rgb,'base64'),depth=Buffer.from(raw.depth,'base64');assert(rgb.length===57600&&depth.length===57600,'Exact output shapes');
        const prefix=`variants/${id}/frame-${frame.sequence}`;fs.mkdirSync(path.dirname(path.join(output,prefix)),{recursive:true});
        fs.writeFileSync(path.join(output,prefix+'.rgba8'),rgb);fs.writeFileSync(path.join(output,prefix+'.depth-f32-le'),depth);
        variants[id].frames.push({sequence:frame.sequence,time:frame.time,elapsedMs:raw.elapsedMs,pboPublicEqual:raw.pboPublicEqual,
          rgb:{...proof(output,prefix+'.rgba8'),type:'Uint8',shape:[90,160,4],order:'row-major top-down RGBA',colorSpace:'sRGB display encoded'},
          depth:{...proof(output,prefix+'.depth-f32-le'),type:'Float32',endianness:'little',shape:[90,160],order:'row-major top-down',meaning:'axial optical-Z metres',encoding:raw.depthEncoding}});
        assert(depth.equals(oldDepth),'Depth differs from original: '+id+'/'+frame.sequence);
        if(id.startsWith('baseline'))assert(rgb.equals(oldRGB),'Original RGB baseline differs: '+id+'/'+frame.sequence);
      }
      comparisons.push({sequence:frame.sequence,time:frame.time,baselineRGBEqualOriginal:true,allDepthBitEqualOriginal:true,
        pboPublicEqual:frame.variants.integrated2.pboPublicEqual&&frame.variants.integrated4.pboPublicEqual});
    }
    const repeated=Object.fromEntries([2,4].map(factor=>[factor,fs.readFileSync(path.join(output,variants['repeat'+factor].frames[0].rgb.path)).equals(fs.readFileSync(path.join(output,variants['integrated'+factor].frames[0].rgb.path)))]));
    const expectedOrder=[0,0,0,255,255,0,0,255,0,255,0,255,255,255,0,255];
    const controls=result.controls.map(control=>({...control,pass:control.kind==='linear-black-white-checker'
      ?control.rgba.every((value,i)=>i%4===3?value===255:Math.abs(value-188)<=1)
      :control.rgba.every((value,i)=>value===expectedOrder[i])}));
    assert(controls.length===4&&controls.every(c=>c.pass),'Independent GPU integration/color/order controls');
    assert(repeated[2]&&repeated[4]&&comparisons.every(c=>c.pboPublicEqual),'Repeat/readback equivalence');
    verify();assert(modules.every(entry=>sha(fs.readFileSync(path.resolve(source,entry.path)))===entry.sha256),'Module bookends');
    assert(served.every(entry=>sha(fs.readFileSync(path.join(plan.repo,entry.path)))===entry.sha256),'Asset bookends');
    assert(errors.length===0,'Browser/asset errors: '+errors.join(';'));
    const calibrated=['fx','fy','rgbFx','rgbFy','cx','cy','near','far','width','height','baseline','depthNoiseDisparityPx','depthNoiseReferenceFx','forward','up'];
    assert(calibrated.every(key=>result.calibration[key]===original.calibration[key]),'Exact original separate calibration');
    fs.cpSync(path.join(source,'src'),path.join(output,'source-preimages/src'),{recursive:true});
    for(const name of ['harness.ts','input.json','driver/capture-modelica-slam-integrated-rgb.mjs','driver/rumoca-bounded-run.mjs'])copy(path.join(source,name),path.join(output,'source-preimages',name));
    json(path.join(output,'source-after.json'),plan.entries.map(entry=>proof(source,entry.path)));
    const manifest={schema:'modelica-rendered-flight-rgb-integration-comparison-v1',status:'MATCHED_RGB_INTEGRATION_CAPTURE_PASS',physicsReacquired:false,
      frameCount:13,imuSampleCount:37,heldIntervalCount:36,calibration:original.calibration,sourceFlight:plan.sourceFlight,sourceReplay:plan.sourceReplay,
      sourceBookendsEqual:true,variants,comparisons,repeated,controls,sourceIdentity:{frozenEntriesManifestSha256:sha(Buffer.from(JSON.stringify(plan.entries))),modules,
        world:proof(output,'source-preimages/src/world.ts'),integrator:proof(output,'source-preimages/src/gpu-rgb-integrator.ts'),harness:proof(output,'source-preimages/harness.ts'),driver:proof(output,'source-preimages/driver/capture-modelica-slam-integrated-rgb.mjs')},
      capture:{graphics:result.graphics,hardwareRequested:plan.hardwareRequested,launchArgs:plan.launchArgs,browserVersion:browser.version(),userAgent:result.userAgent,performanceClaim:false},servedResources:served,
      limitations:['Actual frozen snapshots place the unchanged original World; no physics is reacquired.','Depth is acquired by unchanged baseline World.capture before and after GPU-only RGB integration, and must match original bytes.',
        'The only added project module is the staged GPU integrator; there is no production caller.','sRGB8 source texels are decoded, averaged linearly, then encoded into a single-sample sRGB8 output. Source clipping/quantization are retained.',
        'No estimator, browser SLAM or full-pipeline performance qualification.']};
    json(path.join(output,'manifest.json'),manifest);console.log(JSON.stringify({status:manifest.status,graphics:result.graphics,controls,repeated,comparisons}));
  }catch(error){json(path.join(output,'failure.json'),{error:String(error?.stack??error),errors});throw error;}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
