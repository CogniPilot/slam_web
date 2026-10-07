// Isolated dedicated-worker physics profile; no scene, sensor or GPU workload.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {analyzePhysicsCpuProfile} from './analyze-physics-cpu-profile.mjs';

const output=path.resolve(process.argv[2]??path.join(process.env.HOME,'scratch/slam_web/tmp/physics-browser-cpu'));
const compilerDirectory=path.resolve(process.argv[3]??'public/vendor/rumoca');
const executionPolicy=process.argv[4]??'legacy';
if(!['legacy','auto','interpreter'].includes(executionPolicy))throw new Error('Policy must be legacy, auto or interpreter');
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('models/LabQuadrotor.mo');
const compiler=await fs.readFile(path.join(compilerDirectory,'rumoca_bind_wasm.js'));
const wasm=await fs.readFile(path.join(compilerDirectory,'rumoca_bind_wasm_bg.wasm'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const glue=(await build({stdin:{contents:"export {SensorClock,QUALITY_SENSOR_RATES} from './src/sensor-clock.ts'; export {readPhysicsSnapshot} from './src/physics-snapshot.ts';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].contents;
const files=new Map([['/source.mo',source],['/compiler.js',compiler],['/compiler.wasm',wasm],['/glue.js',glue]]);
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url.endsWith('.js')?'text/javascript':request.url.endsWith('.wasm')?'application/wasm':'text/html');
  response.end(files.get(request.url)??'<!doctype html><title>Modelica physics CPU review</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
const workerBody=async(base,executionPolicy)=>{
  const compiler=await import(base+'/compiler.js');
  const {SensorClock,QUALITY_SENSOR_RATES,readPhysicsSnapshot}=await import(base+'/glue.js');
  await compiler.default({module_or_path:base+'/compiler.wasm'});
  const source=await(await fetch(base+'/source.mo')).text(),start=performance.now();
  const initialInputs=[['forward',0],['left',0],['up',0],['yaw',0]];
  const session=executionPolicy==='legacy'
    ?compiler.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.005,'rk-like',1e-8,1e-6,JSON.stringify(initialInputs))
    :compiler.WasmSimulationSession.withInteractiveConfiguration(source,'LabQuadrotor',JSON.stringify({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:initialInputs,execution_policy:executionPolicy}));
  const preparationMs=performance.now()-start,clock=new SensorClock(QUALITY_SENSOR_RATES.high);
  let current=readPhysicsSnapshot(session,true),command={forward:0,left:0,up:0,yaw:0};
  const phases={inputEncoding:[],setInputs:[],advance:[],stateJson:[],snapshotParseAndExtract:[],total:[]};
  let jsonBytes=0,visibleValues=0;
  const frame=measured=>{
    const commandTime=current.time;
    for(const event of clock.nextFrame(true)){
      const a=performance.now(),encoded=JSON.stringify([...Object.entries(command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]]),b=performance.now();
      session.set_inputs(encoded);const c=performance.now();session.advance_to(event.time);const d=performance.now();
      const json=session.state_json(),e=performance.now();current=readPhysicsSnapshot({state_json:()=>json},true);const f=performance.now();
      if(measured){phases.inputEncoding.push(b-a);phases.setInputs.push(c-b);phases.advance.push(d-c);phases.stateJson.push(e-d);phases.snapshotParseAndExtract.push(f-e);phases.total.push(f-a);jsonBytes+=new TextEncoder().encode(json).byteLength;visibleValues=Object.keys(JSON.parse(json).values).length;}
    }
    command=current.command;
  };
  for(let i=0;i<30;i++)frame(false);
  postMessage({ready:true,preparationMs});
  await new Promise(resolve=>{onmessage=resolve;});
  try{
    for(let i=0;i<900;i++)frame(true);
    const summary=values=>({count:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,p95Ms:values.toSorted((a,b)=>a-b)[Math.ceil(values.length*.95)-1]});
    postMessage({result:{preparationMs,frames:900,events:phases.total.length,rates:QUALITY_SENSOR_RATES.high,perEvent:Object.fromEntries(Object.entries(phases).map(([key,values])=>[key,summary(values)])),perCameraFrameMs:phases.total.reduce((a,b)=>a+b,0)/900,meanJsonBytes:jsonBytes/phases.total.length,visibleValues,last:current,compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()}}});
  }finally{session.free();}
};
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(({body,executionPolicy})=>{
    window.physicsMessages=[];
    const worker=new Worker(URL.createObjectURL(new Blob([`(${body})(location.origin,${JSON.stringify(executionPolicy)}).catch(error=>postMessage({error:String(error.stack||error)}));`],{type:'text/javascript'})));
    window.physicsWorker=worker;worker.onmessage=e=>window.physicsMessages.push(e.data);worker.onerror=e=>window.physicsMessages.push({error:e.message});
  },{body:workerBody.toString(),executionPolicy});
  await page.waitForFunction(()=>window.physicsMessages.length>0,{},{timeout:60000});
  const initial=await page.evaluate(()=>window.physicsMessages[0]);if(initial.error)throw new Error(initial.error);
  const cdp=await browser.newBrowserCDPSession(),targets=await cdp.send('Target.getTargets');
  const target=targets.targetInfos.find(target=>target.type==='worker');if(!target)throw new Error('Physics worker CDP target missing');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
  let requestId=0;const pending=new Map();
  cdp.on('Target.receivedMessageFromTarget',event=>{if(event.sessionId!==sessionId)return;const reply=JSON.parse(event.message),request=pending.get(reply.id);if(!request)return;pending.delete(reply.id);reply.error?request.reject(new Error(JSON.stringify(reply.error))):request.resolve(reply.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++requestId;pending.set(id,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000});await send('Profiler.start');
  await page.evaluate(()=>window.physicsWorker.postMessage({run:true}));
  await page.waitForFunction(()=>window.physicsMessages.length>1,{},{timeout:90000});
  const result=await page.evaluate(()=>window.physicsMessages[1]);
  const {profile}=await send('Profiler.stop');await fs.writeFile(path.join(output,'worker.cpuprofile'),JSON.stringify(profile));
  if(result.error)throw new Error(result.error);
  const analysis=analyzePhysicsCpuProfile(profile);
  const report={status:executionPolicy==='legacy'?'ACTUAL_PINNED_CHROMIUM_WORKER_PHYSICS_PROFILE_PASS':'ACTUAL_REVIEW_CHROMIUM_WORKER_PHYSICS_PROFILE_PASS',executionPolicy,recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(source),compilerWasmSha256:sha(wasm),probeSha256:sha(await fs.readFile(import.meta.filename)),analyzerSha256:sha(await fs.readFile(new URL('./analyze-physics-cpu-profile.mjs',import.meta.url))),...result.result,scope:'Unmodified full Modelica plant in an isolated dedicated worker. Same high sensor-clock endpoints, solver tolerances and held commands; no GPU, rendering, RPC or whole-pipeline throughput.',productionPinChanged:false,physicsStepsSkipped:0,hostMathFallback:false,profileSamples:profile.samples.length,...analysis};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
