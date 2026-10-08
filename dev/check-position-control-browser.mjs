// Exercise the production physics worker against the shipped local library.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {readModelicaModelsLibrary} from '../scripts/modelica-models-library.mjs';

const [output,compilerDirectory='public/vendor/rumoca',...flags]=process.argv.slice(2);
if(!output)throw Error('NEW_REPORT [COMPILER_DIRECTORY] [--execution-receipts|--require-wasm-receipt] required');
if(flags.some(flag=>!['--execution-receipts','--require-wasm-receipt'].includes(flag)))throw Error('Unknown flight probe option');
const requireWasmReceipt=flags.includes('--require-wasm-receipt');
const executionReceiptsRequested=requireWasmReceipt||flags.includes('--execution-receipts');
assert.ok(!fs.existsSync(output),'Choose a fresh report path');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync('models/Vehicles/LabQuadrotor.mo','utf8');
const workspaceSources=readModelicaModelsLibrary();
const provenance=JSON.parse(fs.readFileSync('models/Libraries/CogniPilot/provenance.json','utf8'));
for(const [file,text]of Object.entries(workspaceSources)){
  assert.equal(sha(text),provenance.sources[file.slice('models/Libraries/CogniPilot/'.length)]);
}
const worker=await build({entryPoints:['src/physics.worker.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const compilerJs=fs.readFileSync(path.join(compilerDirectory,'rumoca_bind_wasm.js'));
const compilerWasm=fs.readFileSync(path.join(compilerDirectory,'rumoca_bind_wasm_bg.wasm'));
const files=new Map([
  ['/physics.js',['text/javascript',worker.outputFiles[0].contents]],
  ['/vendor/rumoca/rumoca_bind_wasm.js',['text/javascript',compilerJs]],
  ['/vendor/rumoca/rumoca_bind_wasm_bg.wasm',['application/wasm',compilerWasm]],
]);
const server=createServer((request,response)=>{
  const file=files.get(request.url);
  if(file){response.setHeader('Content-Type',file[0]);response.end(file[1]);}
  else if(request.url==='/')response.end('<!doctype html><title>Quadrotor position tracking</title>');
  else{response.statusCode=404;response.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const execution=await page.evaluate(async({source,workspaceSources,requireWasmReceipt,executionReceiptsRequested})=>{
    const worker=new Worker('/physics.js',{type:'module'});
    let id=0;
    const call=message=>new Promise((resolve,reject)=>{
      const request=++id,timer=setTimeout(()=>{worker.terminate();reject(Error('Physics worker deadline'));},30000);
      worker.onmessage=({data})=>{if(data.id===request){clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);}};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
      worker.postMessage({id:request,...message});
    });
    const near=(actual,expected,tolerance,label)=>{if(Math.abs(actual-expected)>tolerance)throw Error(label+': '+actual);};
    try{
      const start=performance.now(),initial=await call({type:'init',source,workspaceSources,base:location.origin+'/'});
      const preparationMs=performance.now()-start;
      near(initial.time,0,0,'initial time');near(initial.z,1.5,1e-10,'initial altitude');
      const receipts=[];
      const receipt=async phase=>{
        if(!executionReceiptsRequested)return;
        const result=await call({type:'executionReceipt'});
        if(!['interpreter','cranelift','wasm_program'].includes(result.execution?.engine))
          throw Error('Invalid Rumoca execution receipt');
        if(requireWasmReceipt&&result.execution.engine!=='wasm_program')
          throw Error('Rumoca WASM selection receipt required: '+JSON.stringify(result));
        receipts.push({phase,...result});
      };
      await receipt('initial');
      const targets=[[2,-1,2.5],[-1,1,1.5]],legs=[];
      let totalTime=0,firstMotion;
      for(const target of targets){
        const samples=[],started=performance.now();
        const command={forward:0,left:0,up:0,yaw:0,positionMode:1,
          'targetPosition[1]':target[0],'targetPosition[2]':target[1],'targetPosition[3]':target[2]};
        for(let frame=1;frame<=120;frame++){
          const time=totalTime+frame/10;
          const truth=await call({type:'step',time,command,autopilot:false,indoorTour:false,commandTime:time-.1});
          near(truth.time,time,0,'lockstep time');
          if(![truth.x,truth.y,truth.z,...truth.velocity,...truth.gyro,...truth.quaternion,...truth.propellerAngles].every(Number.isFinite))
            throw Error('Nonfinite plant observation');
          near(truth.quaternion.reduce((sum,value)=>sum+value*value,0),1,2e-6,'unit attitude');
          truth.propellerAngles.forEach((angle,motor)=>{if((motor<2?1:-1)*angle<0)throw Error('Rotor direction');});
          if(!firstMotion){
            firstMotion=truth;
            if(Math.hypot(truth.x,truth.y,truth.z-initial.z)>.15)throw Error('Position was directly moved');
            if(!truth.propellerAngles.every(angle=>angle!==0))throw Error('Motors did not drive the plant');
          }
          if(frame%10===0)samples.push(truth);
        }
        const last=samples.at(-1),error=Math.hypot(last.x-target[0],last.y-target[1],last.z-target[2]);
        if(error>.15)throw Error('Position did not converge: '+error);
        if(Math.hypot(...last.velocity)>.03)throw Error('Position did not settle');
        legs.push({target,samples,positionErrorMeters:error,executionMs:performance.now()-started});
        totalTime+=12;
        await receipt('target '+legs.length);
      }
      const reset=await call({type:'reset'});
      for(const key of ['time','x','y','z'])near(reset[key],initial[key],1e-10,'reset '+key);
      await receipt('reset');
      return {preparationMs,initial,firstMotion,legs,reset,receipts,executionReceiptsRequested,requireWasmReceipt,compiledHotPathVerified:false,simulatedSeconds:totalTime,
        allCommandsPassedThroughProductionWorker:true,truthFeedback:true,
        estimatorFeedback:false,periodicIntegralQualified:false};
    }finally{worker.terminate();}
  },{source,workspaceSources,requireWasmReceipt,executionReceiptsRequested});
  const report={status:'ACTUAL_BROWSER_POSITION_TRACKING_PASS',browser:browser.version(),
    sourceSha256:sha(source),libraryRevision:provenance.revision,
    librarySourcesSha256:sha(JSON.stringify(workspaceSources)),libraryFiles:Object.keys(workspaceSources).length,
    compilerJsSha256:sha(compilerJs),compilerWasmSha256:sha(compilerWasm),
    workerBundleSha256:sha(worker.outputFiles[0].contents),probeSha256:sha(fs.readFileSync(import.meta.filename)),
    ...execution,scope:'Actual production physics worker and Modelica position/attitude/rate/allocation stack. '
      +'Truth feedback and physical motors; no pose overrides. Receipts describe compiler-reported backend selection, not hot-path coverage. Sample-clock correctness, full SLAM and 10x throughput remain separate gates.'};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,legs:report.legs.map(({samples,...leg})=>leg)}));
}finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
