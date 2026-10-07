// Full350 independent fixtures through the actual browser NativeProgram consumer.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactFile,fixtureFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw Error('Expected ARTIFACT FIXTURES REPORT');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const artifactBytes=fs.readFileSync(artifactFile),fixtureBytes=fs.readFileSync(fixtureFile);
const artifact=JSON.parse(artifactBytes),fixtures=JSON.parse(fixtureBytes);
const source=fs.readFileSync(fixtures.sourcePath,'utf8');
if(fixtures.capacity!==350||![3,25].includes(fixtures.cases.length)||fixtures.sourceSha256!==sha(source)
  ||artifact.source_sha256!==sha(source)||artifact.module_sha256!==fixtures.moduleSha256
  ||sha(new Uint8Array(artifact.module_bytes))!==artifact.module_sha256)throw Error('Original source/module/full350 fixture mismatch');
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false});
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/consumer.js'?'text/javascript':'text/html');
  response.end(request.url==='/consumer.js'?bundle.outputFiles[0].contents:'<!doctype html><title>Modelica full350 registration uncertainty review</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run=async data=>{
    const {NativeProgram}=await import(data.base+'/consumer.js');
    const check=(ok,message)=>{if(!ok)throw Error(message);};
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('modelica-full350-uncertainty-review',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const load=()=>new Promise((resolve,reject)=>{
      const request=db.transaction('projects').objectStore('projects').get('uncertainty');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const save=value=>new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(value,'uncertainty');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    try{
      const saved=data.reload?await load():undefined;if(data.reload)check(saved,'Missing saved source/state');
      const issued=saved??data,program=await NativeProgram.instantiate(issued.artifact,issued.source),abi=issued.artifact.abi;
      for(const field of ['referencePoint','currentPoint'])check(program.input(field).length===350*3,'Reduced point capacity');
      check(program.input('pairEnabled').length===350,'Reduced enabled mask');
      let checks=0,maximumError=0,lastBytes;
      const put=bytes=>{
        check(bytes.length===abi.p_count*8&&bytes.every(b=>Number.isInteger(b)&&b>=0&&b<=255),'Malformed parameter fixture');
        new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).set(bytes);lastBytes=bytes;
      };
      const yBytes=()=>new Uint8Array(program.memory.buffer,abi.y_offset,abi.y_count*8).slice();
      const exact=(wanted,message)=>check(yBytes().every((v,i)=>v===wanted[i]),message);
      if(saved){put(saved.pBytes);program.evaluate(0);exact(saved.yBytes,'Reload output differs');}
      const cases=[];
      for(let i=data.start;i<data.end;i++){
        const item=data.fixtures.cases[i];put(item.pBytes);program.evaluate(0);
        check(new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).every((b,k)=>b===item.pBytes[k]),item.name+': input mutation');
        let matrixCells=0;
        for(const [name,wanted] of Object.entries(item.expected)){
          const expected=Array.isArray(wanted)?wanted.flat():[wanted],actual=program.output(name);
          check(actual.length===expected.length,item.name+'/'+name+': output shape');
          for(let j=0;j<expected.length;j++){
            const error=Math.abs(actual[j]-expected[j]);maximumError=Math.max(maximumError,error);checks++;
            const exactField=['valid','rejectionReason','validCount','invalidCount'].includes(name);
            check(Number.isFinite(actual[j])&&(exactField?actual[j]===expected[j]:error<=3e-8*Math.max(1,Math.abs(expected[j]))),item.name+'/'+name+'/'+j+': numerical mismatch');
          }
          if(expected.length===36)matrixCells+=expected.length;
        }
        check(matrixCells===180,'Missing full five matrices');
        cases.push({name:item.name,valid:program.output('valid')[0],rejectionReason:program.output('rejectionReason')[0],matrixCells});
      }
      const held=yBytes();
      const env={memory:program.memory};
      for(const name of issued.artifact.math_imports)env[name]=Math[name];
      const raw=await WebAssembly.instantiate(new Uint8Array(issued.artifact.module_bytes),{env});
      const execute=raw.instance.exports.eval_assignments;
      const faults=[
        [abi.y_offset,abi.p_offset+1,0,abi.scratch_offset,0,1],
        [abi.y_offset,abi.p_offset,0,abi.scratch_offset+1,0,1],
        [abi.y_offset,abi.p_offset,0,abi.scratch_offset,8,1],
        [abi.y_offset,abi.p_offset,0,abi.p_offset,0,1],
      ];
      for(const [y,p,time,scratch,reserved,status] of faults){
        const observed=execute(y,p,time,scratch,reserved);
        check(observed===status,`Wrong raw ABI refusal: y=${y},p=${p},time=${time},scratch=${scratch},reserved=${reserved},expected=${status},observed=${observed}`);
        exact(held,'Raw ABI fault published output');
        check(new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).every((b,i)=>b===lastBytes[i]),'Raw fault changed inputs');
        program.evaluate(0);exact(held,'Raw fault recovery differs');
      }
      // The stateless raw module does not consume time. The consumer's finite
      // timestamp contract is separate from the module's buffer guards.
      let invalidTimeRefused=false;
      try{program.evaluate(NaN);}catch(error){invalidTimeRefused=String(error).includes('finite simulation timestamp');}
      check(invalidTimeRefused,'Consumer accepted invalid timestamp');exact(held,'Timestamp refusal changed outputs');
      await save({source:issued.source,artifact:issued.artifact,pBytes:lastBytes,yBytes:held});
      program.reset();put(lastBytes);program.evaluate(0);exact(held,'Reset replay differs');
      let staleSourceRefused=false;
      try{await NativeProgram.instantiate(issued.artifact,issued.source+'\n// source edit');}
      catch(error){staleSourceRefused=String(error).includes('does not match its source');}
      check(staleSourceRefused,'Stale source accepted');
      return {cases,checks,maximumError,indexedDbReload:Boolean(saved),resetReplay:true,inputsReadonly:true,staleSourceRefused,atomicAbiFaults:faults.length,invalidTimeRefused};
    }finally{db.close();}
  };
  const invoke=payload=>page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Full350 worker timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(Error(error.message));};worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload});
  const split=Math.ceil(fixtures.cases.length/2);
  const first=await invoke({artifact,source,fixtures,start:0,end:split});await page.reload();
  const second=await invoke({fixtures,reload:true,start:split,end:fixtures.cases.length});
  const report={
    status:'FULL350_REGISTRATION_UNCERTAINTY_CHROMIUM_WORKER_PASS',recordedAt:new Date().toISOString(),
    browser:browser.version(),sourceSha256:sha(source),artifactSha256:sha(artifactBytes),
    moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,
    fixtureSha256:sha(fixtureBytes),probeSha256:sha(fs.readFileSync(import.meta.filename)),
    consumerBundleSha256:sha(bundle.outputFiles[0].contents),capacity:350,cases:[...first.cases,...second.cases],
    checks:first.checks+second.checks,matrixCells:fixtures.cases.length*180,
    maximumError:Math.max(first.maximumError,second.maximumError),indexedDbReload:second.indexedDbReload,
    inputsReadonly:first.inputsReadonly&&second.inputsReadonly,resetReplay:first.resetReplay&&second.resetReplay,
    staleSourceRefused:first.staleSourceRefused&&second.staleSourceRefused,
    atomicAbiFaults:first.atomicAbiFaults+second.atomicAbiFaults,
    invalidTimeRefused:first.invalidTimeRefused&&second.invalidTimeRefused,
    runtimeIntegrated:false,productionPinChanged:false,fullSlam:false,
    scope:'Complete source-issued350 conditional unweighted registration covariance with independent five6x6 matrices, flags and pivot for every listed case; original ABI NaN input bytes transported unchanged. Raw ABI fault atomicity/recovery, consumer timestamp refusal and IndexedDB/page/worker replay in actual Chromium workers. No live images, matching, temporally correlated filter, map, loop closure, browser source compilation or throughput claim.',
  };
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,cases:report.cases.length,checks:report.checks,maximumError:report.maximumError,indexedDbReload:report.indexedDbReload}));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
