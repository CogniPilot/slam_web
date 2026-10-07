// Review-only interleaved compiler comparison. All physics stays in issued WASM.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [baselineArgument,candidateArgument,outputArgument]=process.argv.slice(2);
if(!baselineArgument||!candidateArgument||!outputArgument)
  throw new Error('Usage: node dev/probe-physics-compiler-comparison.mjs baseline-directory candidate-directory output-directory');
const candidatePolicy=process.env.RUMOCA_COMPARISON_EXECUTION_POLICY??'auto';
if(!['auto','interpreter'].includes(candidatePolicy))throw Error('Candidate execution policy must be auto or interpreter');
const output=path.resolve(outputArgument),source=await fs.readFile('models/Vehicles/LabQuadrotor.mo');
await fs.mkdir(output,{recursive:true});
const sha=data=>createHash('sha256').update(data).digest('hex');
const files=new Map([['/source.mo',source]]),artifacts={};
for(const [name,directory] of [['baseline',baselineArgument],['candidate',candidateArgument]]){
  const js=await fs.readFile(path.join(directory,'rumoca_bind_wasm.js'));
  const wasm=await fs.readFile(path.join(directory,'rumoca_bind_wasm_bg.wasm'));
  files.set(`/${name}.js`,js);files.set(`/${name}.wasm`,wasm);
  artifacts[name]={jsSha256:sha(js),wasmSha256:sha(wasm),wasmBytes:wasm.length};
}
if(artifacts.baseline.wasmSha256===artifacts.candidate.wasmSha256)
  throw new Error('Compiler comparison requires distinct WASM artifacts');
const glue=(await build({stdin:{contents:"export {SensorClock,QUALITY_SENSOR_RATES} from './src/sensor-clock.ts'; export {readPhysicsSnapshot} from './src/physics-snapshot.ts';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].contents;
files.set('/glue.js',glue);
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url.endsWith('.js')?'text/javascript':request.url.endsWith('.wasm')?'application/wasm':'text/html');
  response.end(files.get(request.url)??'<!doctype html><title>Modelica compiler comparison</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const workerBody=async(base,candidatePolicy)=>{
  const {SensorClock,QUALITY_SENSOR_RATES,readPhysicsSnapshot}=await import(base+'/glue.js');
  const compilers={};
  for(const name of ['baseline','candidate']){
    compilers[name]=await import(`${base}/${name}.js`);
    await compilers[name].default({module_or_path:`${base}/${name}.wasm`});
  }
  const source=await(await fetch(base+'/source.mo')).text();
  const check=(condition,message)=>{if(!condition)throw new Error(message);};
  let reference,comparisons=0,maxScaledDifference=0,visibleFields;
  const mismatchCounts={signedZero:0,numerical:0},firstMismatches=[];
  const mismatch=(kind,endpoint,key,a,b)=>{
    mismatchCounts[kind]++;
    if(firstMismatches.length<20)firstMismatches.push({kind,endpoint,key,actual:Object.is(a,-0)?'-0':String(a),expected:Object.is(b,-0)?'-0':String(b)});
  };
  const runs=[];
  for(const [index,name] of ['baseline','candidate','candidate','baseline'].entries()){
    const compiler=compilers[name],preparationStart=performance.now();
    const hasConfiguration=typeof compiler.WasmSimulationSession.withInteractiveConfiguration==='function';
    const policy=name==='candidate'?candidatePolicy:'auto';
    const initialInputs=[['forward',0],['left',0],['up',0],['yaw',0]];
    const session=hasConfiguration
      ?compiler.WasmSimulationSession.withInteractiveConfiguration(source,'LabQuadrotor',JSON.stringify({dt:.005,solver:'rk-like',atol:1e-8,rtol:1e-6,initial_inputs:initialInputs,execution_policy:policy}))
      :compiler.WasmSimulationSession.withInteractiveOptions(source,'LabQuadrotor',.005,'rk-like',1e-8,1e-6,JSON.stringify(initialInputs));
    const preparationMs=performance.now()-preparationStart;
    try{
      const clock=new SensorClock(QUALITY_SENSOR_RATES.high),trace=[];
      let current=readPhysicsSnapshot(session,true),command={forward:0,left:0,up:0,yaw:0};
      let events=0,advanceMs=0;
      const phaseStart=performance.now();
      for(let frame=0;frame<930;frame++){
        const commandTime=current.time;
        for(const event of clock.nextFrame(true)){
          session.set_inputs(JSON.stringify([...Object.entries(command),['autopilot',1],['indoorTour',0],['commandTime',commandTime]]));
          const start=performance.now();session.advance_to(event.time);advanceMs+=performance.now()-start;
          const snapshot=session.state_json();current=readPhysicsSnapshot({state_json:()=>snapshot},true);
          if(index<2)trace.push(JSON.parse(snapshot));events++;
        }
        command=current.command;
      }
      const completeLoopMs=performance.now()-phaseStart;
      if(index===0)reference=trace;
      if(index===1){
        check(trace.length===reference.length,'Compiler endpoint count differs');
        for(let endpoint=0;endpoint<trace.length;endpoint++){
          const actual=trace[endpoint],expected=reference[endpoint];
          check(actual.time===expected.time,'Compiler simulation timestamps differ');
          const keys=Object.keys(expected.values),actualKeys=Object.keys(actual.values);
          check(keys.length===actualKeys.length&&keys.every((key,i)=>key===actualKeys[i]),'Compiler visible ownership/order differs');
          visibleFields=keys.length;
          for(const key of keys){
            const a=actual.values[key],b=expected.values[key];
            check(typeof a==='number'&&typeof b==='number'&&Number.isFinite(a)&&Number.isFinite(b),`Nonfinite field ${key}`);
            if(a===0&&b===0&&!Object.is(a,b))mismatch('signedZero',endpoint,key,a,b);
            const scaled=Math.abs(a-b)/Math.max(1,Math.abs(a),Math.abs(b));
            maxScaledDifference=Math.max(maxScaledDifference,scaled);comparisons++;
            if(scaled>2e-9)mismatch('numerical',endpoint,key,a,b);
          }
        }
      }
      runs.push({index,compiler:name,constructor:hasConfiguration?`withInteractiveConfiguration(${policy})`:'withInteractiveOptions(default)',preparationMs,frames:930,events,advanceMs,advancePerCameraFrameMs:advanceMs/930,completeLoopMs,last:current,version:compiler.get_version(),revision:compiler.get_git_commit()});
    }finally{session.free();}
  }
  const mean=name=>runs.filter(run=>run.compiler===name).reduce((sum,run)=>sum+run.advancePerCameraFrameMs,0)/2;
  postMessage({result:{runs,comparisons,visibleFields,maxScaledDifference,tolerance:2e-9,mismatchCounts,firstMismatches,parityPassed:Object.values(mismatchCounts).every(count=>count===0),rates:QUALITY_SENSOR_RATES.high,baselineMeanAdvanceMs:mean('baseline'),candidateMeanAdvanceMs:mean('candidate'),candidateSpeedup:mean('baseline')/mean('candidate')}});
};
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(({body,candidatePolicy})=>{
    window.comparisonReply=null;
    const worker=new Worker(URL.createObjectURL(new Blob([`(${body})(location.origin,${JSON.stringify(candidatePolicy)}).catch(error=>postMessage({error:String(error.stack||error)}));`],{type:'text/javascript'})));
    window.comparisonWorker=worker;worker.onmessage=event=>window.comparisonReply=event.data;
    worker.onerror=event=>window.comparisonReply={error:event.message};
  },{body:workerBody.toString(),candidatePolicy});
  await page.waitForFunction(()=>window.comparisonReply!==null,{},{timeout:170000});
  const reply=await page.evaluate(()=>window.comparisonReply);if(reply.error)throw new Error(reply.error);
  const report={status:reply.result.parityPassed?'ACTUAL_CHROMIUM_INTERLEAVED_COMPILER_PARITY_PASS':'ACTUAL_CHROMIUM_INTERLEAVED_COMPILER_PARITY_FAILED',recordedAt:new Date().toISOString(),browser:browser.version(),artifacts,sourceSha256:sha(source),probeSha256:sha(await fs.readFile(import.meta.filename)),...reply.result,counterObservationEnabled:false,productionPinChanged:false,physicsStepsSkipped:0,hostPhysicsFallback:false,scope:'Public default execution for the baseline and the recorded explicit policy for the candidate, with constructors recorded per run. Same worker and baseline/candidate/candidate/baseline order. Same unchanged full plant, recorded high-quality sensor rates, adaptive solver and tolerances. Advance timings include cold first30 frames and exclude preparation, snapshot extraction, sensors, rendering and all SLAM algorithms. Compiler artifacts contain multiple changes, so differences cannot be attributed to one patch. Shared-host load is not controlled by this probe. Failed parity precludes performance acceptance.'};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(!reply.result.parityPassed)process.exitCode=1;
}catch(error){
  // Keep constructor/worker failures as evidence as well as parity failures.
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({status:'ACTUAL_CHROMIUM_COMPILER_COMPARISON_EXECUTION_FAILED',
    recordedAt:new Date().toISOString(),artifacts,candidatePolicy,sourceSha256:sha(source),
    probeSha256:sha(await fs.readFile(import.meta.filename)),error:String(error.stack||error),
    parityPassed:false,productionPinChanged:false,hostPhysicsFallback:false},null,2)+'\n');
  throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
