// Review-only same-build full-plant parity and timing. Does not change the app pin.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [compilerArgument,outputArgument]=process.argv.slice(2);
if(!compilerArgument||!outputArgument)throw new Error('Usage: node dev/probe-physics-portable-me.mjs compiler-directory output-directory');
const counterSetting=process.env.RUMOCA_PHYSICS_COUNTERS??'1';
if(!['0','1'].includes(counterSetting))throw new Error('RUMOCA_PHYSICS_COUNTERS must be 0 or 1');
const observeCounters=counterSetting==='1';
const privateSetting=process.env.RUMOCA_PHYSICS_REQUIRE_PRIVATE??'0';
if(!['0','1'].includes(privateSetting))throw new Error('RUMOCA_PHYSICS_REQUIRE_PRIVATE must be 0 or 1');
const requirePrivate=privateSetting==='1';
if(requirePrivate&&!observeCounters)throw new Error('Private execution coverage requires counters');
const output=path.resolve(outputArgument),compilerDirectory=path.resolve(compilerArgument);
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('models/Vehicles/LabQuadrotor.mo');
const edited=Buffer.from(source.toString().replace('parameter Real mass = 2.0;','parameter Real mass = 2.4;'));
if(source.equals(edited))throw new Error('Expected exact wrapper mass parameter missing');
const compiler=await fs.readFile(path.join(compilerDirectory,'rumoca_bind_wasm.js'));
const wasm=await fs.readFile(path.join(compilerDirectory,'rumoca_bind_wasm_bg.wasm'));
const sha=data=>createHash('sha256').update(data).digest('hex');
const glue=(await build({stdin:{contents:"export {SensorClock,QUALITY_SENSOR_RATES} from './src/sensor-clock.ts'; export {readPhysicsSnapshot} from './src/physics-snapshot.ts';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].contents;
const files=new Map([['/source.mo',source],['/edited.mo',edited],['/compiler.js',compiler],['/compiler.wasm',wasm],['/glue.js',glue]]);
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url.endsWith('.js')?'text/javascript':request.url.endsWith('.wasm')?'application/wasm':'text/html');
  response.end(files.get(request.url)??'<!doctype html><title>Portable Modelica ME review</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
const workerBody=async (base,observeCounters,requirePrivate)=>{
  const compiler=await import(base+'/compiler.js');
  const {SensorClock,QUALITY_SENSOR_RATES,readPhysicsSnapshot}=await import(base+'/glue.js');
  await compiler.default({module_or_path:base+'/compiler.wasm'});
  // Observe generated expression, exact assignment and private target-value kernels. Do not intercept compiler math,
  // alter operands/results, or change the imported shared memory.
  const originalInstance=WebAssembly.Instance,originalModule=WebAssembly.Module,kernelCounters=[],moduleBytes=new WeakMap();
  if(observeCounters)WebAssembly.Module=new Proxy(originalModule,{construct(target,args){
    const module=Reflect.construct(target,args),input=args[0];
    const bytes=ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input);
    moduleBytes.set(module,bytes.slice());
    return module;
  }});
  if(observeCounters)WebAssembly.Instance=new Proxy(originalInstance,{construct(target,args){
    const instance=Reflect.construct(target,args),exports=instance.exports;
    const entries=['eval_residual','eval_assignments','eval_private'].filter(name=>typeof exports[name]==='function');
    if(entries.length===0)return instance;
    const wrapped={...exports};
    for(const entry of entries){
      const counter={entry,calls:0,nonzeroStatuses:0,moduleBytes:moduleBytes.get(args[0])};
      wrapped[entry]=(...inputs)=>{
        counter.calls++;
        const result=exports[entry](...inputs);
        if(entry!=='eval_residual'&&result!==0)counter.nonzeroStatuses++;
        return result;
      };
      kernelCounters.push(counter);
    }
    return new Proxy(instance,{get(target,key){return key==='exports'?wrapped:Reflect.get(target,key,target);}});
  }});
  const counters=()=>Object.fromEntries(['eval_residual','eval_assignments','eval_private'].map(entry=>{
    const matching=kernelCounters.filter(counter=>counter.entry===entry);
    return [entry,{modules:matching.length,calls:matching.reduce((sum,counter)=>sum+counter.calls,0),nonzeroStatuses:matching.reduce((sum,counter)=>sum+counter.nonzeroStatuses,0)}];
  }));
  const delta=(before,after)=>Object.fromEntries(Object.keys(before).map(entry=>[entry,Object.fromEntries(Object.keys(before[entry]).map(key=>[key,after[entry][key]-before[entry][key]]))]));
  if(typeof compiler.WasmSimulationSession.withInteractiveConfiguration!=='function')throw new Error('Review compiler lacks structured execution policy');
  const source=await(await fetch(base+'/source.mo')).text(),edited=await(await fetch(base+'/edited.mo')).text();
  const options=policy=>({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:[['forward',0],['left',0],['up',0],['yaw',0]],execution_policy:policy});
  const make=(source,policy)=>compiler.WasmSimulationSession.withInteractiveConfiguration(source,'LabQuadrotor',JSON.stringify(options(policy)));
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  let comparisons=0,maxAbsoluteDifference=0,maxScaledDifference=0;
  const compare=(a,b,where)=>{
    check(a.time===b.time,where+': time');
    const ak=Object.keys(a.values),bk=Object.keys(b.values);
    check(ak.length===bk.length&&ak.every((key,i)=>key===bk[i]),where+': visible field ownership/order');
    for(const key of ak){
      const av=a.values[key],bv=b.values[key];
      check(typeof av==='number'&&typeof bv==='number'&&Number.isFinite(av)&&Number.isFinite(bv),where+': nonfinite '+key);
      if(av===0&&bv===0)check(Object.is(av,bv),where+': signed zero '+key);
      const difference=Math.abs(av-bv),scaled=difference/Math.max(1,Math.abs(av),Math.abs(bv));
      maxAbsoluteDifference=Math.max(maxAbsoluteDifference,difference);maxScaledDifference=Math.max(maxScaledDifference,scaled);comparisons++;
      check(scaled<=2e-9,where+': '+key+' differs '+av+' / '+bv);
    }
  };
  const run=(session,frames,retain)=>{
    const clock=new SensorClock(QUALITY_SENSOR_RATES.high),trace=[],timings=[];
    let current=readPhysicsSnapshot(session,true),command={forward:0,left:0,up:0,yaw:0},events=0;
    for(let frame=0;frame<frames;frame++){
      const commandTime=current.time;
      for(const event of clock.nextFrame(true)){
        session.set_inputs(JSON.stringify([...Object.entries(command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]]));
        const start=performance.now();session.advance_to(event.time);timings.push(performance.now()-start);
        const json=session.state_json();current=readPhysicsSnapshot({state_json:()=>json},true);
        if(retain)trace.push(JSON.parse(json));events++;
      }
      command=current.command;
    }
    return {trace,events,advanceMs:timings.reduce((a,b)=>a+b,0),last:current};
  };
  const runs=[],controls=[];let reference;
  for(const [index,policy] of ['interpreter','auto','auto','interpreter'].entries()){
    const before=counters();
    const preparationStart=performance.now(),session=make(source,policy),preparationMs=performance.now()-preparationStart;
    const prepared=counters();
    try{
      const initial=session.state_json(),result=run(session,930,index<2);
      const advanced=counters();
      if(index===0)reference=result.trace;
      if(index===1){check(result.trace.length===reference.length,'endpoint count');for(let i=0;i<reference.length;i++)compare(reference[i],result.trace[i],'endpoint '+i);}
      // Unknown input and backwards advance must preserve the complete retained state.
      const held=session.state_json();
      for(const operation of [()=>session.set_inputs('[["missingPhysicsInput",1]]'),()=>session.advance_to(-1)]){
        let refused=false;try{operation();}catch{refused=true;}check(refused,'invalid operation accepted');check(session.state_json()===held,'invalid operation mutated state');
      }
      session.advance_to(result.last.time);check(session.state_json()===held,'repeated time mutated state');
      session.reset();check(session.state_json()===initial,'reset changed initial state');
      const replay=run(session,30,true);for(let i=0;i<replay.trace.length;i++)compare(reference[i],replay.trace[i],'reset '+policy+' '+i);
      controls.push({policy,rollback:true,repeatedTime:true,resetReplayEndpoints:replay.events});
      const completed=counters(),total=delta(before,completed);
      if(observeCounters){
        if(policy==='interpreter')check(Object.values(total).every(value=>value.modules===0&&value.calls===0),'Interpreter unexpectedly used generated kernels');
        if(policy==='auto'){
          check(delta(prepared,advanced).eval_assignments.calls>0,'Auto did not use exact assignment kernels during advance');
          check(total.eval_assignments.nonzeroStatuses===0,'An admitted assignment kernel reported failure');
          check(total.eval_private.nonzeroStatuses===0,'An admitted private target-value kernel reported failure');
          if(requirePrivate)check(delta(prepared,advanced).eval_private.calls>0,'Auto did not execute private target-value kernels during advance');
        }
      }
      runs.push({index,policy,preparationMs,frames:930,events:result.events,advanceMs:result.advanceMs,advancePerCameraFrameMs:result.advanceMs/930,last:result.last,kernelsInstantiated:Object.values(total).reduce((sum,value)=>sum+value.modules,0),kernelCallsIncludingPreparationAndControls:Object.values(total).reduce((sum,value)=>sum+value.calls,0),kernelCoverage:{preparation:delta(before,prepared),advance:delta(prepared,advanced),controls:delta(advanced,completed),total}});
    }finally{session.free();}
  }
  const changed=make(edited,'auto'),changedReference=make(edited,'interpreter');
  try{
    const a=run(changed,120,true),b=run(changedReference,120,true);
    for(let i=0;i<a.trace.length;i++)compare(a.trace[i],b.trace[i],'edited '+i);
    check(a.trace.some((value,i)=>value.values['omega_m[1]']!==reference[i].values['omega_m[1]']),'mass source edit did not affect actual motors');
    controls.push({sourceEdit:true,frames:120,events:a.events,allVisibleFieldsCompared:true});
  }finally{changed.free();changedReference.free();}
  WebAssembly.Instance=originalInstance;WebAssembly.Module=originalModule;
  const observedAssignmentKernels=await Promise.all(kernelCounters.filter(counter=>counter.entry==='eval_assignments').map(async counter=>{
    check(counter.moduleBytes!==undefined,'Assignment module provenance was not observed');
    const hash=await crypto.subtle.digest('SHA-256',counter.moduleBytes);
    return {moduleSha256:[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),bytes:counter.moduleBytes.length,calls:counter.calls,nonzeroStatuses:counter.nonzeroStatuses};
  }));
  const observedPrivateKernels=await Promise.all(kernelCounters.filter(counter=>counter.entry==='eval_private').map(async counter=>{
    check(counter.moduleBytes!==undefined,'Private target-value module provenance was not observed');
    const hash=await crypto.subtle.digest('SHA-256',counter.moduleBytes);
    return {moduleSha256:[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),bytes:counter.moduleBytes.length,calls:counter.calls,nonzeroStatuses:counter.nonzeroStatuses};
  }));
  postMessage({result:{runs,controls,comparisons,maxAbsoluteDifference,maxScaledDifference,tolerance:2e-9,rates:QUALITY_SENSOR_RATES.high,counterObservationEnabled:observeCounters,privateCoverageRequired:requirePrivate,observedAssignmentKernels,observedPrivateKernels,compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()}}});
};
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(({body,observeCounters,requirePrivate})=>{
    window.physicsResult=null;
    const worker=new Worker(URL.createObjectURL(new Blob([`(${body})(location.origin,${JSON.stringify(observeCounters)},${JSON.stringify(requirePrivate)}).catch(error=>postMessage({error:String(error.stack||error)}));`],{type:'text/javascript'})));
    window.physicsWorker=worker;worker.onmessage=e=>window.physicsResult=e.data;worker.onerror=e=>window.physicsResult={error:e.message};
  },{body:workerBody.toString(),observeCounters,requirePrivate});
  await page.waitForFunction(()=>window.physicsResult!==null,{},{timeout:170000});
  const reply=await page.evaluate(()=>window.physicsResult);if(reply.error)throw new Error(reply.error);
  const report={status:'ACTUAL_REVIEW_CHROMIUM_FULL_PLANT_POLICY_PARITY_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(source),editedSourceSha256:sha(edited),compilerWasmSha256:sha(wasm),compilerJsSha256:sha(compiler),probeSha256:sha(await fs.readFile(import.meta.filename)),...reply.result,productionPinChanged:false,physicsStepsSkipped:0,hostMathFallback:false,scope:'Same-build Auto/Interpreter full Modelica quadrotor with unchanged adaptive integrator, tolerances and high-rate endpoint schedule. When enabled, diagnostic wrappers count generated eval_residual, eval_assignments and eval_private calls without changing arguments/results; Interpreter must use none and Auto must use assignments during advance. If private coverage is required, Auto must additionally use private target-value kernels during advance, with zero failure statuses. Observed private module hashes identify browser-instantiated bytes; they have not been matched to native inventory module hashes. ABBA advance timing includes cold first30frames and parity/JSON controls between runs, and counters when enabled; no causal whole-pipeline or CPU-hit-share claim. Projections remain canonical, so kernel hits do not establish a complete native RHS.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
