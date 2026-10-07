// Review diagnostic: observe construction faults without changing the compiler.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [directoryArgument,outputArgument]=process.argv.slice(2);
if(!directoryArgument||!outputArgument)throw Error('Usage: node dev/probe-physics-instantiation.mjs compiler-directory output-directory');
const directory=path.resolve(directoryArgument),output=path.resolve(outputArgument);
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('models/Vehicles/LabQuadrotor.mo');
const js=await fs.readFile(path.join(directory,'rumoca_bind_wasm.js'));
const wasm=await fs.readFile(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const glue=(await build({stdin:{contents:"export {SensorClock,QUALITY_SENSOR_RATES} from './src/sensor-clock.ts'; export {readPhysicsSnapshot} from './src/physics-snapshot.ts';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].contents;
const files=new Map([['/source.mo',source],['/compiler.js',js],['/compiler.wasm',wasm],['/glue.js',glue]]);
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url.endsWith('.js')?'text/javascript':request.url.endsWith('.wasm')?'application/wasm':'text/html');
  response.end(files.get(request.url)??'<!doctype html><title>Instantiation diagnostic</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const workerBody=async base=>{
  const compiler=await import(base+'/compiler.js');
  const {SensorClock,QUALITY_SENSOR_RATES,readPhysicsSnapshot}=await import(base+'/glue.js');
  await compiler.default({module_or_path:base+'/compiler.wasm'});
  const Module=WebAssembly.Module,Instance=WebAssembly.Instance;
  const modules=[],instances=[],moduleIds=new WeakMap();
  let phase='preparation';
  WebAssembly.Module=new Proxy(Module,{construct(target,args){
    const input=args[0];
    const bytes=(ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input)).slice();
    const record={id:modules.length,phase,bytes};modules.push(record);
    try{
      const module=Reflect.construct(target,args);moduleIds.set(module,record.id);
      record.exports=Module.exports(module);record.imports=Module.imports(module);return module;
    }catch(error){record.error={name:error.name,message:error.message};throw error;}
  }});
  WebAssembly.Instance=new Proxy(Instance,{construct(target,args){
    const record={moduleId:moduleIds.get(args[0])??null,phase,calls:{},nonzeroStatuses:{}};instances.push(record);
    try{
      const instance=Reflect.construct(target,args),exports=instance.exports;
      const entries=['eval_residual','eval_assignments','eval_private'].filter(entry=>typeof exports[entry]==='function');
      if(!entries.length)return instance;
      const wrapped={...exports};
      for(const entry of entries){
        record.calls[entry]=0;record.nonzeroStatuses[entry]=0;
        wrapped[entry]=(...inputs)=>{
          record.calls[entry]++;
          const result=exports[entry](...inputs);
          if(entry!=='eval_residual'&&result!==0)record.nonzeroStatuses[entry]++;
          return result;
        };
      }
      return new Proxy(instance,{get(target,key){return key==='exports'?wrapped:Reflect.get(target,key,target);}});
    }catch(error){record.error={name:error.name,message:error.message};throw error;}
  }});
  const source=await(await fetch(base+'/source.mo')).text();
  const options=policy=>({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:[['forward',0],['left',0],['up',0],['yaw',0]],execution_policy:policy});
  const run=policy=>{
    phase=policy+':preparation';
    const session=compiler.WasmSimulationSession.withInteractiveConfiguration(source,'LabQuadrotor',JSON.stringify(options(policy)));
    try{
      const clock=new SensorClock(QUALITY_SENSOR_RATES.high),trace=[];
      let current=readPhysicsSnapshot(session,true),command={forward:0,left:0,up:0,yaw:0};
      phase=policy+':advance';
      for(let frame=0;frame<30;frame++){
        const commandTime=current.time;
        for(const event of clock.nextFrame(true)){
          session.set_inputs(JSON.stringify([...Object.entries(command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]]));
          session.advance_to(event.time);
          const state=JSON.parse(session.state_json());trace.push(state);
          current=readPhysicsSnapshot({state_json:()=>JSON.stringify(state)},true);
        }
        command=current.command;
      }
      return trace;
    }finally{session.free();}
  };
  let runtimeError,comparisons=0,maxScaledDifference=0,events=0;
  try{
    const auto=run('auto'),reference=run('interpreter');events=auto.length;
    if(auto.length!==reference.length)throw Error('Different endpoint count');
    for(let i=0;i<auto.length;i++){
      if(auto[i].time!==reference[i].time)throw Error('Different endpoint time');
      const keys=Object.keys(auto[i].values),other=Object.keys(reference[i].values);
      if(JSON.stringify(keys)!==JSON.stringify(other))throw Error('Different visible field ownership/order');
      for(const key of keys){
        const a=auto[i].values[key],b=reference[i].values[key];
        if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Nonfinite '+key);
        if(a===0&&b===0&&!Object.is(a,b))throw Error('Signed zero '+key);
        const difference=Math.abs(a-b)/Math.max(1,Math.abs(a),Math.abs(b));
        maxScaledDifference=Math.max(maxScaledDifference,difference);comparisons++;
        if(difference>2e-9)throw Error('Numerical difference '+key);
      }
    }
  }catch(error){runtimeError=String(error.stack||error);}
  finally{WebAssembly.Module=Module;WebAssembly.Instance=Instance;}
  const observed=await Promise.all(modules.map(async record=>{
    const hash=await crypto.subtle.digest('SHA-256',record.bytes);
    const {bytes,...rest}=record;
    return {...rest,bytes:bytes.length,sha256:[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),inspectionBytes:Array.from(bytes)};
  }));
  postMessage({result:{modules:observed,instances,runtimeError:runtimeError??null,comparisons,maxScaledDifference,tolerance:2e-9,frames:30,events,rates:QUALITY_SENSOR_RATES.high}});
};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(body=>{
    window.result=null;
    const worker=new Worker(URL.createObjectURL(new Blob([`(${body})(location.origin).catch(error=>postMessage({error:String(error.stack||error)}));`],{type:'text/javascript'})));
    window.worker=worker;worker.onmessage=event=>window.result=event.data;worker.onerror=event=>window.result={error:event.message};
  },workerBody.toString());
  await page.waitForFunction(()=>window.result!==null,null,{timeout:45000});
  const reply=await page.evaluate(()=>window.result);
  if(reply.error)throw Error(reply.error);
  const result=reply.result;
  await fs.mkdir(path.join(output,'modules'),{recursive:true});
  for(const module of result.modules){
    const {inspectionBytes,...metadata}=module;
    const bytes=Uint8Array.from(inspectionBytes);
    const relative=path.join('modules',metadata.sha256+'.wasm');
    await fs.writeFile(path.join(output,relative),bytes);
    delete module.inspectionBytes;module.artifact=relative;
  }
  const report={status:result.runtimeError?'INSTANTIATION_DIAGNOSTIC_RUNTIME_FAILURE':'INSTANTIATION_DIAGNOSTIC_PARITY_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),sourceSha256:sha(source),compilerWasmSha256:sha(wasm),compilerJsSha256:sha(js),probeSha256:sha(await fs.readFile(import.meta.filename)),...result,productionPinChanged:false,scope:'Thirty unchanged full-plant intervals using original high-rate lockstep events. Constructor observers preserve original bytes, imports, call arguments/results, and rethrow original exceptions. Digests computed after execution. No profiler or throughput claim. A successful construction observation does not prove every runtime sequence has an issued schedule or backend.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,modules:result.modules.length,moduleErrors:result.modules.filter(m=>m.error).length,instanceErrors:result.instances.filter(i=>i.error).length,events:result.events,comparisons:result.comparisons,runtimeError:result.runtimeError}));
  if(result.runtimeError)process.exitCode=1;
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
