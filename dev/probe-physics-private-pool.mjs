// Review-only actual browser pool ownership and unchanged-plant controls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [compilerArgument,outputArgument]=process.argv.slice(2);
if(!compilerArgument||!outputArgument)throw Error('Usage: node dev/probe-physics-private-pool.mjs compiler-directory output-directory');
const directory=path.resolve(compilerArgument),output=path.resolve(outputArgument);
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('models/Vehicles/LabQuadrotor.mo');
const js=await fs.readFile(path.join(directory,'rumoca_bind_wasm.js'));
const wasm=await fs.readFile(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const glue=(await build({stdin:{contents:"export {SensorClock,QUALITY_SENSOR_RATES} from './src/sensor-clock.ts'; export {readPhysicsSnapshot} from './src/physics-snapshot.ts';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].contents;
const files=new Map([['/source.mo',source],['/compiler.js',js],['/compiler.wasm',wasm],['/glue.js',glue]]);
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url.endsWith('.js')?'text/javascript':request.url.endsWith('.wasm')?'application/wasm':'text/html');
  response.end(files.get(request.url)??'<!doctype html><title>Private pool ownership</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const workerBody=async base=>{
  const compiler=await import(base+'/compiler.js');
  const {SensorClock,QUALITY_SENSOR_RATES,readPhysicsSnapshot}=await import(base+'/glue.js');
  await compiler.default({module_or_path:base+'/compiler.wasm'});
  const Instance=WebAssembly.Instance,Memory=WebAssembly.Memory;
  const ids=new WeakMap(),pools=[],kernels=[],retainedFunctions=[];
  let phase='initial',comparisons=0,maxScaledDifference=0;
  const check=(value,message)=>{if(!value)throw Error(message);};
  const memoryId=memory=>{
    if(!ids.has(memory)){ids.set(memory,pools.length);pools.push({id:pools.length,phase,initialBytes:memory.buffer.byteLength});}
    return ids.get(memory);
  };
  WebAssembly.Memory=new Proxy(Memory,{construct(target,args){
    const memory=Reflect.construct(target,args);
    const id=memoryId(memory);pools[id].descriptor={...args[0]};return memory;
  }});
  WebAssembly.Instance=new Proxy(Instance,{construct(target,args){
    const env=args[1]?.env,privateMemory=env?.rumoca_private_arena;
    let record;
    if(privateMemory){
      check(privateMemory!==env.memory,'Private/public memories alias');
      const base=env.rumoca_private_arena_base.value>>>0;
      record={phase,poolId:memoryId(privateMemory),base,bytesAtConstruction:privateMemory.buffer.byteLength};
      check(base%65536===0,'Unaligned private base');
      check(base<record.bytesAtConstruction,'Private base outside memory');
      check(!kernels.some(other=>other.poolId===record.poolId&&other.base===base),'Live region base reused');
      kernels.push(record);
    }
    try{
      const instance=Reflect.construct(target,args);
      if(record){
        record.entries=Object.keys(instance.exports);
        const retained=instance.exports.eval_private??instance.exports.eval_assignments;
        if(retained)retainedFunctions.push(retained);
      }
      return instance;
    }catch(error){if(record)record.error=String(error);throw error;}
  }});
  const source=await(await fetch(base+'/source.mo')).text();
  const edited=source.replace('parameter Real mass = 2.0;','parameter Real mass = 2.4;');
  check(edited!==source,'Expected Modelica edit missing');
  const make=(text,policy)=>compiler.WasmSimulationSession.withInteractiveConfiguration(text,'LabQuadrotor',JSON.stringify({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:[['forward',0],['left',0],['up',0],['yaw',0]],execution_policy:policy}));
  const cursor=session=>({session,clock:new SensorClock(QUALITY_SENSOR_RATES.high),current:readPhysicsSnapshot(session,true),command:{forward:0,left:0,up:0,yaw:0},trace:[]});
  const frame=state=>{
    const commandTime=state.current.time;
    for(const event of state.clock.nextFrame(true)){
      state.session.set_inputs(JSON.stringify([...Object.entries(state.command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]]));
      state.session.advance_to(event.time);
      const value=JSON.parse(state.session.state_json());state.trace.push(value);
      state.current=readPhysicsSnapshot({state_json:()=>JSON.stringify(value)},true);
    }
    state.command=state.current.command;
  };
  const compare=(a,b)=>{
    check(a.length===b.length,'Endpoint count');
    for(let i=0;i<a.length;i++){
      check(a[i].time===b[i].time,'Endpoint time');
      const keys=Object.keys(a[i].values);check(JSON.stringify(keys)===JSON.stringify(Object.keys(b[i].values)),'Field ownership/order');
      for(const key of keys){
        const x=a[i].values[key],y=b[i].values[key];
        check(Number.isFinite(x)&&Number.isFinite(y),'Nonfinite '+key);
        if(x===0&&y===0)check(Object.is(x,y),'Signed zero '+key);
        const error=Math.abs(x-y)/Math.max(1,Math.abs(x),Math.abs(y));
        maxScaledDifference=Math.max(maxScaledDifference,error);comparisons++;
        check(error<=2e-9,'Numerical difference '+key);
      }
    }
  };
  const sessions=[];let error,checks;
  try{
    phase='live-original';const a=make(source,'auto');sessions.push(a);
    phase='live-edited';const b=make(edited,'auto');sessions.push(b);
    const ca=cursor(a),cb=cursor(b),ia=make(source,'interpreter'),ib=make(edited,'interpreter');sessions.push(ia,ib);
    const ra=cursor(ia),rb=cursor(ib),initialA=a.state_json(),initialB=b.state_json();
    phase='interleaved-advance';
    for(let i=0;i<30;i++){frame(ca);frame(cb);frame(ra);frame(rb);}
    compare(ca.trace,ra.trace);compare(cb.trace,rb.trace);
    check(ca.trace.some((value,i)=>value.values['omega_m[1]']!==cb.trace[i].values['omega_m[1]']),'Edited motor response unchanged');
    phase='reset';a.reset();check(a.state_json()===initialA,'Original reset state');
    const replay=cursor(a);for(let i=0;i<30;i++)frame(replay);compare(replay.trace,ra.trace);
    check(b.state_json()!==initialB,'Other live session unexpectedly reset');
    phase='free-all';for(const session of sessions.splice(0))session.free();
    const oldPoolIds=new Set(kernels.map(kernel=>kernel.poolId));
    const oldRetainedCount=retainedFunctions.length;
    phase='fresh-after-free';const fresh=make(source,'auto');sessions.push(fresh);
    const freshCursor=cursor(fresh);for(let i=0;i<30;i++)frame(freshCursor);compare(freshCursor.trace,ra.trace);
    const freshPools=[...new Set(kernels.filter(kernel=>kernel.phase==='fresh-after-free').map(kernel=>kernel.poolId))];
    check(freshPools.length>0,'Fresh session had no imported private arenas');
    check(freshPools.every(id=>!oldPoolIds.has(id)),'Weak pool survived all runtime leases');
    check(oldRetainedCount>0&&retainedFunctions.slice(0,oldRetainedCount).every(fn=>typeof fn==='function'),'External function retention control');
    const liveA=new Set(kernels.filter(kernel=>kernel.phase==='live-original').map(kernel=>kernel.poolId));
    const liveB=new Set(kernels.filter(kernel=>kernel.phase==='live-edited').map(kernel=>kernel.poolId));
    check([...liveA].some(id=>liveB.has(id)),'Concurrent kernels did not exercise a shared pool');
    check(pools.every(pool=>pool.descriptor?.shared===false),'Pool unexpectedly shared across threads');
    checks={concurrentOriginalAndEdited:true,privatePublicMemorySeparate:true,alignedDistinctObservedBases:true,sharedPoolExercised:true,resetPreservesOtherSession:true,freshPoolAfterFree:true,externallyRetainedFunctions:oldRetainedCount,originalAndEditedFrames:30,replayFrames:30,freshFrames:30};
  }catch(caught){error=String(caught.stack||caught);}
  finally{for(const session of sessions)session.free();WebAssembly.Instance=Instance;WebAssembly.Memory=Memory;}
  postMessage({result:{pools,kernels,comparisons,maxScaledDifference,tolerance:2e-9,checks,error:error??null}});
};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(body=>{
    window.reply=null;const worker=new Worker(URL.createObjectURL(new Blob([`(${body})(location.origin).catch(error=>postMessage({error:String(error.stack||error)}));`],{type:'text/javascript'})));
    worker.onmessage=event=>window.reply=event.data;worker.onerror=event=>window.reply={error:event.message};window.worker=worker;
  },workerBody.toString());
  await page.waitForFunction(()=>window.reply!==null,null,{timeout:60000});
  const reply=await page.evaluate(()=>window.reply);if(reply.error)throw Error(reply.error);
  const result=reply.result;
  const report={status:result.error?'PRIVATE_POOL_BROWSER_FAILURE':'PRIVATE_POOL_BROWSER_LIFETIME_PARITY_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(source),compilerWasmSha256:sha(wasm),compilerJsSha256:sha(js),probeSha256:sha(await fs.readFile(import.meta.filename)),...result,productionPinChanged:false,scope:'Unmodified module/import/call arguments and results. Actual imported memory identity and immutable bases observed. Concurrent original/edited complete plants, reset and session free/fresh controls. Distinct observed bases do not independently establish complete region extents; allocator/Wasmi extent and alias controls are recorded separately. No timing or GC/physical-memory-release claim. Retained old functions are never called after their owning session is freed.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,pools:result.pools.length,kernels:result.kernels.length,comparisons:result.comparisons,maxScaledDifference:result.maxScaledDifference,checks:result.checks,error:result.error}));
  if(result.error)process.exitCode=1;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
