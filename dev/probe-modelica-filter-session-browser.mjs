// Actual worker/state persistence gate using reviewed source-issued artifacts.
// Compilation and independent numerical oracles have separate verification.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [directory,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('ISSUED_ARTIFACT_DIRECTORY REPORT required');
const sha=data=>createHash('sha256').update(data).digest('hex');
const source=fs.readFileSync(path.join(directory,'source.mo'),'utf8');
const editedSource=fs.readFileSync(path.join(directory,'edited.mo'),'utf8');
const artifact=JSON.parse(fs.readFileSync(path.join(directory,'baseline.json'),'utf8'));
const editedArtifact=JSON.parse(fs.readFileSync(path.join(directory,'edited.json'),'utf8'));
if(sha(source)!==artifact.source_sha256||sha(editedSource)!==editedArtifact.source_sha256)
  throw new Error('Source/artifact mismatch');
const bundle=await build({entryPoints:['src/modelica-filter-session.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/session.js'?'text/javascript':'text/html');
  response.end(request.url==='/session.js'?bundle.outputFiles[0].contents:'<!doctype html><title>Persistent Modelica filter review</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run=async(data)=>{
    const {ModelicaFilterSession}=await import(`${data.base}/session.js`);
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    const equal=(a,b,message)=>require(JSON.stringify(a)===JSON.stringify(b),message);
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('modelica-filter-session-review',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const save=project=>new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'filter');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const load=()=>new Promise((resolve,reject)=>{
      const request=db.transaction('projects').objectStore('projects').get('filter');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const h=1/180,imu={accel:[0,0,9.81],gyro:[0,0,0]};
    const frame=(start,count=4)=>({time:start+count*h,dt:count*h,imu,
      imuIntervals:Array.from({length:count},(_,i)=>({time:start+(i+1)*h,dt:h,imu:structuredClone(imu)}))});
    try{
      if(data.reload){
        const saved=await load();require(saved.source===data.editedSource,'Saved source lost');
        const restored=await ModelicaFilterSession.create(saved.artifact,saved.source,saved.state);
        equal(restored.snapshot(),data.savedState,'Saved state lost across page/worker reload');
        const result=restored.advance(frame(saved.state.time,1));
        require(result.acceptedCount===saved.state.acceptedCount+1,'Edited Modelica lost after reload');
        restored.reset();equal(restored.snapshot(),saved.state,'Reload reset lost initial retained state');
        return {indexedDbReload:true,reloadSteps:result.steps,reloadAcceptedCount:result.acceptedCount};
      }
      const covariance=Array.from({length:225},(_,i)=>Math.floor(i/15)===i%15?.1:0);
      const create=()=>ModelicaFilterSession.create(data.artifact,data.source,{time:0,covariance});
      const batch=await create(),split=await create(),first=frame(0);
      const result=batch.advance(first);
      for(const interval of first.imuIntervals)split.advance({time:interval.time,dt:interval.dt,imu:interval.imu});
      equal(result,split.snapshot(),'Batched and individual state differ');
      require(result.steps===4&&result.covariance.length===225&&result.covariance.every(Number.isFinite),'Incomplete retained covariance');
      const continued=batch.advance(frame(result.time));require(continued.steps===8,'State not retained');
      const bad=frame(continued.time);bad.imuIntervals[2].imu.gyro=[2000,0,0];
      let refused=false;try{batch.advance(bad);}catch{refused=true;}
      require(refused,'Invalid Modelica substep accepted');equal(batch.snapshot(),continued,'Failed batch partially committed');
      batch.reset();equal(batch.advance(first),result,'Reset was not deterministic');
      const observed=frame(result.time);observed.observation={rotation:[1,0,0,0,1,0,0,0,1],position:[0,0,.02],
        covariance:Array.from({length:36},(_,i)=>Math.floor(i/6)===i%6?.04:0)};
      const corrected=batch.advance(observed);require(corrected.acceptedCount===1&&corrected.position[2]>0,'Modelica correction not committed');
      let stale=false;try{await ModelicaFilterSession.create(data.artifact,data.editedSource,{time:0,covariance});}catch{stale=true;}
      require(stale,'Stale source/module accepted');
      const edited=await ModelicaFilterSession.create(data.editedArtifact,data.editedSource,{time:0,covariance});
      const savedState=edited.advance(frame(0,2));require(savedState.acceptedCount===2,'Edited Modelica did not change retained output');
      await save({artifact:data.editedArtifact,source:data.editedSource,state:savedState});
      return {batchedContinuity:true,fullCovarianceRetained:true,rollback:true,reset:true,
        acceptedCorrection:true,staleSourceRefused:true,sourceEditExecuted:true,savedState};
    }finally{db.close();}
  };
  const invoke=payload=>page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Filter session worker timed out')),45000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};
      worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload});
  const first=await invoke({source,artifact,editedSource,editedArtifact});
  const savedState=first.savedState;delete first.savedState;
  await page.reload();const reload=await invoke({reload:true,editedSource,savedState});
  const report={status:'PERSISTENT_MODELICA_FILTER_CHROMIUM_WORKER_RELOAD_PASS',recordedAt:new Date().toISOString(),
    browser:browser.version(),sourceSha256:sha(source),editedSourceSha256:sha(editedSource),
    moduleSha256:artifact.module_sha256,editedModuleSha256:editedArtifact.module_sha256,
    compiler:artifact.compiler,adapterSha256:sha(fs.readFileSync('src/modelica-filter-session.ts')),
    bundleSha256:sha(bundle.outputFiles[0].contents),...first,...reload,
    runtimeIntegrated:false,productionPinChanged:false,fullSlam:false,
    scope:'Actual Chromium dedicated worker, precompiled source-issued baseline/edit modules, retained filter state, IndexedDB page/worker reload. Compiler source preparation and independent numerical oracles are separate gates.'};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
