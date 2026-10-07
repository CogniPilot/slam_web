// Isolated persistent session review; numerical propagation/correction stays in issued WASM.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [reportPath]=process.argv.slice(2);if(!reportPath)throw Error('Expected REPORT');
const root='dev/artifacts/schmidt-reference-transaction/';
const source=fs.readFileSync(root+'source.mo','utf8'),artifactBytes=fs.readFileSync(root+'native.json'),fixtureBytes=fs.readFileSync(root+'fixtures.json');
const artifact=JSON.parse(artifactBytes),fixture=JSON.parse(fixtureBytes),cases=fixture.groups.ES15SchmidtReferenceStep;
const sha=b=>createHash('sha256').update(b).digest('hex');
if(cases.length!==20||fixture.augmentedDimension!==21||fixture.sourceSha256!==sha(source)||artifact.source_sha256!==sha(source)||sha(Buffer.from(artifact.module_bytes))!==artifact.module_sha256)throw Error('Source/artifact/fixture identity mismatch');
const bundle=await build({stdin:{contents:"export {ModelicaSchmidtSession} from './src/modelica-schmidt-session';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false});
const server=createServer((req,res)=>{if(req.url==='/session.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Persistent Schmidt session review</title>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const run=async data=>{
 const {ModelicaSchmidtSession}=await import(data.base+'/session.js');const require=(ok,message)=>{if(!ok)throw Error(message);};
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('persistent-schmidt-session-review',1);q.onupgradeneeded=()=>q.result.createObjectStore('sessions');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const get=()=>new Promise((resolve,reject)=>{const q=db.transaction('sessions').objectStore('sessions').get('review');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const put=value=>new Promise((resolve,reject)=>{const t=db.transaction('sessions','readwrite');t.objectStore('sessions').put(value,'review');t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});
 try{
  const saved=data.reload?await get():undefined;require(!data.reload||saved,'Missing IDB session');const issued=saved??data;
  const fields=['position','velocity','rotation','accelBias','gyroBias','covariance','crossCovariance','referenceCovariance','referencePosition','referenceRotation','referenceAvailable','referenceEpoch','referenceUsed','lastUsedEpoch'];
  const initial=()=>{const x=data.cases[2].inputs,c=data.cases[16].inputs;return {...Object.fromEntries(fields.map(k=>[k,x[k]])),time:0,gravity:x.gravity,density:x.density,opticalToBody:c.opticalToBody,cameraOriginBody:c.cameraOriginBody};};
  const frame=(index,time)=>{const x=data.cases[index].inputs;return {time,dt:x.h[0],imu:{accel:x.accel,gyro:x.gyro},currentEpoch:x.currentEpoch[0],captureRequested:x.captureRequested[0]===1,observation:x.measurementEnabled[0]===1?{rotation:x.measuredRotation??[1,0,0,0,1,0,0,0,1],translation:x.measuredTranslation??[0,0,0],covariance:x.relativeCovariance??Array.from({length:36},(_,i)=>i%7===0?1:0)}:undefined};};
  let checks=0,maximumError=0,readonlyCalls=0;
  const compare=(state,index)=>{for(const [name,expected]of Object.entries(data.cases[index].expected)){const key=name.startsWith('next')?name[4].toLowerCase()+name.slice(5):name;const values=name.startsWith('next')?state[key]:[state.flags[key]];require(values.length===expected.values.length,'Output shape');for(let cell=0;cell<values.length;cell++){const e=Math.abs(values[cell]-expected.values[cell]);checks++;maximumError=Math.max(maximumError,e);require(Number.isFinite(values[cell])&&e<=expected.tolerance,`${index}/${name}/${cell}: error ${e}`);}}};
  const create=async state=>{const s=await ModelicaSchmidtSession.create(issued.artifact,issued.source,state);const p=s.program,original=p.evaluate.bind(p);p.evaluate=time=>{const abi=issued.artifact.abi,before=new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).slice();original(time);require(new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).every((v,i)=>v===before[i]),'P mutated');readonlyCalls++;};return s;};
  let session=await create(saved?.baseline??initial());const baseline=session.snapshot();if(saved){session.restore(saved.state);require(JSON.stringify(session.snapshot())===JSON.stringify(saved.state),'IDB restore differs');}
  let checkpoint=saved?.checkpoint,corrected=saved?.corrected;const evaluated=[];
  if(!saved){const zero={...initial(),...Object.fromEntries(fields.map(k=>[k,data.cases[0].inputs[k]]))};const s=await create(zero),before=s.snapshot();let refused=false;try{s.advance(frame(0,0));}catch(e){refused=String(e).includes('Noncontiguous');}require(refused&&JSON.stringify(before)===JSON.stringify(s.snapshot()),'Zero dt transport refusal');const missing={...initial(),...Object.fromEntries(fields.map(k=>[k,data.cases[1].inputs[k]]))};const m=await create(missing);compare(m.advance(frame(1,1/90)),1);evaluated.push(1);}
  for(let index=data.start;index<data.end;index++){
   if(index>=15&&index<=18)session.restore(checkpoint);if(index===19)session.restore(corrected);
   const state=session.advance(frame(index,session.snapshot().time+1/90));compare(state,index);evaluated.push(index);
   if(index===14)checkpoint=session.snapshot();if(index===16)corrected=session.snapshot();
  }
  const state=session.snapshot();require(state.covariance.length===225&&state.crossCovariance.length===90&&state.referenceCovariance.length===36,'Reduced state');
  await put({source:issued.source,artifact:issued.artifact,baseline,state,checkpoint,corrected});
  session.restore(JSON.parse(JSON.stringify(state)));require(JSON.stringify(session.snapshot())===JSON.stringify(state),'JSON restore');
  const bad=structuredClone(state);bad.sourceSha256='0'.repeat(64);let stale=false;try{session.restore(bad);}catch(e){stale=String(e).includes('source/schema');}require(stale,'Stale snapshot accepted');
  const changed=structuredClone(state);changed.density[0]*=2;let config=false;try{session.restore(changed);}catch(e){config=String(e).includes('calibration/config');}require(config,'Changed config accepted');
  let sourceRefused=false;try{await ModelicaSchmidtSession.create(issued.artifact,issued.source+'\n// stale',state);}catch(e){sourceRefused=String(e).includes('does not match its source');}require(sourceRefused,'Stale source accepted');
  require(JSON.stringify(session.reset())===JSON.stringify(baseline),'Reset baseline differs');
  let batch=false,rollback=false,recovery=false,predictionRefusal=false;
  if(data.final){
   const single=await create(initial()),batched=await create(initial());const first=frame(2,1/90);first.captureRequested=false;first.observation=undefined;single.advance(first);const second=frame(2,2/90),wanted=single.advance(second);
   const full=frame(2,2/90);full.dt=2/90;full.imuIntervals=[{time:1/90,dt:1/90,imu:full.imu},{time:2/90,dt:1/90,imu:full.imu}];const got=batched.advance(full);require(JSON.stringify(got)===JSON.stringify(wanted),'Measured batch differs from same single intervals');batch=true;
   const failure=await create(initial()),p=failure.program,before=failure.snapshot(),bytes=new Uint8Array(p.memory.buffer).slice(),evaluate=p.evaluate.bind(p);let n=0;p.evaluate=t=>{if(++n===2)throw Error('injected later execution failure');evaluate(t);};let caught=false;try{failure.advance(full);}catch(e){caught=String(e).includes('injected');}require(caught&&JSON.stringify(failure.snapshot())===JSON.stringify(before)&&new Uint8Array(p.memory.buffer).every((v,i)=>v===bytes[i]),'Rollback failed');rollback=true;p.evaluate=evaluate;compare(failure.advance(frame(2,1/90)),2);recovery=true;
   const invalid=initial();invalid.covariance=[...invalid.covariance];invalid.covariance[0]=-1;const rejected=await create(invalid),prior=rejected.snapshot();let refused=false;try{rejected.advance(frame(2,1/90));}catch(e){refused=String(e).includes('rejected prediction');}require(refused&&JSON.stringify(rejected.snapshot())===JSON.stringify(prior),'Model prediction rejection rollback');rejected.restore(before);compare(rejected.advance(frame(2,1/90)),2);predictionRefusal=true;
  }
  return {evaluated,checks,maximumError,readonlyCalls,indexedDbReload:Boolean(saved),reset:true,staleSnapshot:stale,changedConfig:config,staleSource:sourceRefused,batch,rollback,recovery,predictionRefusal};
 }finally{db.close();}
};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const invoke=data=>page.evaluate(async ({body,data})=>{const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(e){postMessage({error:String(e.stack||e)})}}`],{type:'text/javascript'})),worker=new Worker(url);try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker timeout')),60000);worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage({...data,base:location.origin});});}finally{worker.terminate();URL.revokeObjectURL(url);}},{body:run.toString(),data});
 const first=await invoke({source,artifact,cases,start:2,end:9});await page.reload();const second=await invoke({cases,reload:true,start:9,end:20});await page.reload();const final=await invoke({cases,reload:true,start:20,end:20,final:true});
 const report={status:'PERSISTENT_SCHMIDT_SESSION_CHROMIUM_WORKER_PASS',sourceSha256:sha(source),artifactSha256:sha(artifactBytes),moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,fixtureSha256:sha(fixtureBytes),probeSha256:sha(fs.readFileSync(import.meta.filename)),sessionSha256:sha(fs.readFileSync('src/modelica-schmidt-session.ts')),consumerBundleSha256:sha(bundle.outputFiles[0].contents),browser:browser.version(),runs:[first,second,final],checks:first.checks+second.checks+final.checks,maximumError:Math.max(first.maximumError,second.maximumError,final.maximumError),positiveDurationFixtureCases:19,zeroDtTransportRefusal:true,indexedDbReloads:2,scope:'Actual NEW persistent session class in dedicated Chromium workers; unchanged precompiled full21 Modelica transaction, actual returned state carry/forks, measured intervals and final-only observation/capture, full351 covariance cells. Injected second-call exception and actual model prediction rejection rollback/recovery. Stale source digest/config refusal, not edited source compilation. No browser compiler, frontend, map, loops, production selection, throughput or fullSLAM claim.'};fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){fs.writeFileSync(reportPath,JSON.stringify({status:'FAIL',error:String(error.stack||error),sourceSha256:sha(source),artifactSha256:sha(artifactBytes),fixtureSha256:sha(fixtureBytes)},null,2)+'\n');throw error;}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
