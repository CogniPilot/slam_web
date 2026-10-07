// Review gate: three source-issued Modelica modules connected in a browser worker.
// Fixture oracles are produced independently; host code only copies measurements
// and retained state. This does not prepare a single compiled processing graph.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [fixtureFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('INDEPENDENT_FIXTURES REPORT required');
const sha=data=>createHash('sha256').update(data).digest('hex');
const fixtureBytes=fs.readFileSync(fixtureFile);
const fixtures=JSON.parse(fixtureBytes.toString());
if(fixtures.schemaVersion!==1||!fixtures.frames?.length)throw new Error('Invalid chain fixtures');
const artifacts={};
for(const name of ['registration','relativePose','filter']){
  const entry=fixtures.artifacts[name];
  const source=fs.readFileSync(entry.sourcePath,'utf8');
  const bytes=fs.readFileSync(entry.artifactPath);
  const artifact=JSON.parse(bytes.toString());
  if(sha(source)!==entry.sourceSha256||artifact.source_sha256!==entry.sourceSha256||artifact.module_sha256!==entry.moduleSha256)
    throw new Error(`${name}: fixture source/module binding mismatch`);
  artifacts[name]={source,artifact,artifactSha256:sha(bytes)};
}
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program'; export {ModelicaFilterSession} from './src/modelica-filter-session';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',write:false});
const server=createServer((request,response)=>{
  response.setHeader('Content-Type',request.url==='/chain.js'?'text/javascript':'text/html');
  response.end(request.url==='/chain.js'?bundle.outputFiles[0].contents:'<!doctype html><title>Modelica visual filter chain review</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const run=async(data)=>{
    const {NativeProgram,ModelicaFilterSession}=await import(`${data.base}/chain.js`);
    const require=(ok,message)=>{if(!ok)throw new Error(message);};
    let maximumError=0;
    const close=(actual,expected,label,tolerance)=>{
      if(Array.isArray(expected)){
        require(actual?.length===expected.length,`${label}: shape`);
        expected.forEach((value,i)=>close(actual[i],value,`${label}/${i}`,tolerance));
      }else if(typeof expected==='number'){
        const error=Math.abs(actual-expected);
        require(Number.isFinite(actual)&&error<=tolerance,`${label}: ${actual} != ${expected}`);
        maximumError=Math.max(maximumError,error);
      }else require(actual===expected,`${label}: metadata`);
    };
    const compareState=(actual,expected,tolerance)=>{
      for(const key of Object.keys(expected))close(actual[key],expected[key],key,tolerance);
    };
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('modelica-visual-filter-chain-review',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const save=value=>new Promise((resolve,reject)=>{
      const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(value,'chain');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const load=()=>new Promise((resolve,reject)=>{
      const request=db.transaction('projects').objectStore('projects').get('chain');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    try{
      const saved=data.reload?await load():undefined;
      const issued=saved?.artifacts??data.artifacts;
      const initial=saved?.state??data.fixtures.initial;
      const registration=await NativeProgram.instantiate(issued.registration.artifact,issued.registration.source);
      const relative=await NativeProgram.instantiate(issued.relativePose.artifact,issued.relativePose.source);
      const filter=await ModelicaFilterSession.create(issued.filter.artifact,issued.filter.source,initial);
      if(saved)compareState(filter.snapshot(),data.expectedSavedState,0);
      require(registration.input('pairEnabled').length===14400,'Reduced registration capacity');
      const results=[];
      const process=frame=>{
        const tolerance=frame.tolerance??2e-9;
        for(const name of ['sourcePoint','targetPoint','pairEnabled'])registration.input(name).set(frame.registration[name]);
        registration.input('activeCount')[0]=frame.registration.activeCount;
        const start=performance.now();registration.evaluate(frame.time);
        const registrationMs=performance.now()-start;
        const expected=frame.expected;
        close(registration.output('accepted')[0],expected.registrationAccepted,'registrationAccepted',0);
        close(registration.output('rejectionReason')[0],expected.registrationRejectionReason,'registrationRejectionReason',0);
        const prior=filter.snapshot();
        relative.input('referenceBodyRotation').set(prior.rotation);
        relative.input('referenceBodyPosition').set(prior.position);
        relative.input('currentFromReference').set(registration.output('rotation'));
        relative.input('currentFromReferenceTranslation').set(registration.output('translation'));
        relative.input('registrationAccepted')[0]=registration.output('accepted')[0];
        relative.input('opticalToBody').set(frame.opticalToBody);
        relative.input('cameraOriginBody').set(frame.cameraOriginBody);
        relative.evaluate(frame.time);
        close(relative.output('valid')[0],expected.relativeValid,'relativeValid',0);
        close(relative.output('observedBodyRotation'),expected.observedRotation,'observedRotation',tolerance);
        close(relative.output('observedBodyPosition'),expected.observedPosition,'observedPosition',tolerance);
        const observation=relative.output('valid')[0]===1?{
          rotation:relative.output('observedBodyRotation'),position:relative.output('observedBodyPosition'),
          covariance:frame.observationCovariance}:undefined;
        const result=filter.advance({time:frame.time,dt:frame.dt,imu:frame.imu,observation});
        compareState(result,expected.filter,tolerance);
        return {time:frame.time,accepted:result.acceptedCount,rejected:result.rejectedCount,registrationMs};
      };
      for(let i=data.start;i<data.end;i++)results.push(process(data.fixtures.frames[i]));
      const state=filter.snapshot();
      await save({artifacts:issued,state});
      let resetReplay=false,staleSourceRefused=false;
      if(data.reload){
        registration.reset();relative.reset();filter.restore(data.fixtures.initial);
        for(const frame of data.fixtures.frames)process(frame);
        compareState(filter.snapshot(),state,2e-9);resetReplay=true;
        try{await ModelicaFilterSession.create(issued.filter.artifact,issued.filter.source+'\n// source edit',state);}
        catch{staleSourceRefused=true;}
        require(staleSourceRefused,'Stale filter source accepted');
      }
      return {state,cases:results,maximumError,resetReplay,staleSourceRefused,indexedDbReload:!!saved};
    }finally{db.close();}
  };
  const invoke=payload=>page.evaluate(async({body,payload})=>{
    const url=URL.createObjectURL(new Blob([`const run=${body};onmessage=async e=>{try{postMessage({result:await run(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`],{type:'text/javascript'}));
    const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Visual filter chain worker timed out')),45000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
      worker.onerror=error=>{clearTimeout(timer);reject(new Error(error.message));};
      worker.postMessage({...payload,base:location.origin});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:run.toString(),payload});
  const split=Math.ceil(fixtures.frames.length/2);
  const first=await invoke({artifacts,fixtures,start:0,end:split});
  await page.reload();
  const second=await invoke({reload:true,fixtures,start:split,end:fixtures.frames.length,expectedSavedState:first.state});
  const report={status:'SOURCE_ISSUED_VISUAL_FILTER_CHAIN_CHROMIUM_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),
    fixtureSha256:sha(fixtureBytes),probeSha256:sha(fs.readFileSync(import.meta.filename)),bundleSha256:sha(bundle.outputFiles[0].contents),
    artifacts:Object.fromEntries(Object.entries(artifacts).map(([name,value])=>[name,{sourceSha256:sha(value.source),moduleSha256:value.artifact.module_sha256,artifactSha256:value.artifactSha256,compiler:value.artifact.compiler}])),
    cases:[...first.cases,...second.cases],maximumError:Math.max(first.maximumError,second.maximumError),
    indexedDbReload:second.indexedDbReload,resetReplay:second.resetReplay,staleSourceRefused:second.staleSourceRefused,
    retainedCovarianceCells:second.state.covariance.length,runtimeIntegrated:false,productionPinChanged:false,fullSlam:false,
    scope:'Three precompiled source-issued modules, full14400 measured pairs, relative body observations, retained Modelica filter state and225covariance cells in Chromium worker. Page/worker reload through IndexedDB. Correspondences and measurement covariance are fixtures; excludes feature matching, a single compiled graph, mapping and loop closure.'};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
