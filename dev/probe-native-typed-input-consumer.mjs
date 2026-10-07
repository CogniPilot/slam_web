// Handcrafted byte-transport qualification. No Modelica compiler or algorithm
// is exercised here; actual compiler-issued State carry is a separate gate.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';import {build} from 'esbuild';import {chromium} from '@playwright/test';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scratch=path.join(os.homedir(),'scratch/slam_web/profiles');fs.mkdirSync(scratch,{recursive:true});
const out=fs.mkdtempSync(path.join(scratch,'typed-input-consumer-'));
const durable=path.resolve('dev/artifacts/native-typed-input-consumer',path.basename(out));fs.mkdirSync(durable,{recursive:true});
const names=['src/modelica-native-program.ts','src/modelica-native-artifact.ts','src/source-digest.ts',
  'tests/helpers/native-typed-input-transport.ts','tests/native-program-typed-inputs.test.ts','dev/probe-native-typed-input-consumer.mjs'];
const sources=names.map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
for(const {path:file}of sources){const target=path.join(durable,'sources',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
const helper=await build({entryPoints:['tests/helpers/native-typed-input-transport.ts'],bundle:true,packages:'external',format:'esm',platform:'node',write:false});
const helperFile=path.join(durable,'transport-fixture.mjs');fs.writeFileSync(helperFile,helper.outputFiles[0].contents);
const {typedInputTransport,typedInputOnlyTransport}=await import(pathToFileURL(helperFile));
const fixture={...await typedInputTransport(),inputOnly:await typedInputOnlyTransport()};
fs.writeFileSync(path.join(durable,'transport-fixture.json'),JSON.stringify(fixture,null,2)+'\n');
const consumer=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
fs.writeFileSync(path.join(durable,'consumer.mjs'),consumer.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(path.join(durable,'consumer.mjs')));
async function verify(NativeProgram,{artifact,source,inputOnly}){
  const require=(ok,message)=>{if(!ok)throw Error(message);};
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const p=await NativeProgram.instantiate(artifact,source),count=p.integerInput('state.count'),sample=p.integerInput('state.samples[1]'),flag=p.booleanInput('enabled');
  require(count.byteOffset===64&&sample.byteOffset===72&&flag.byteOffset===80&&p.integerOutput('echo').byteOffset===88,'Declared typed offsets');
  let checks=0;
  for(let round=0;round<2;round++){
    p.reset();require(count[0]===7n&&sample[0]===-2n&&flag[0]===1,'Exact defaults');
    for(const value of [9007199254740993n,-9007199254740993n,0x7fffffffffffffffn,-0x8000000000000000n]){
      count[0]=value;sample[0]=value;flag[0]=Number(value>0n);
      const ordinary=new Uint8Array(p.memory.buffer,8,32).slice(),typed=new Uint8Array(p.memory.buffer,64,24).slice();
      p.evaluate(0.25);
      require(p.integerOutput('echo')[0]===value&&p.integerOutput('sampleEcho')[0]===value&&p.booleanOutput('flag')[0]===flag[0]
        &&p.output('result')[0]===2.75,'Exact mixed transport');
      require(same(ordinary,new Uint8Array(p.memory.buffer,8,32))&&same(typed,new Uint8Array(p.memory.buffer,64,24)),'Readonly inputs');checks++;
    }
  }
  let stale=false;try{await NativeProgram.instantiate(artifact,source+'\n');}catch{stale=true;}
  require(stale,'Stale source accepted');
  const snapshot=await p.snapshotMemory(),saved={source,artifact,snapshot};let retrieved=structuredClone(saved),indexedDBRoundtrip=false;
  if(typeof indexedDB!=='undefined'){
    const database='typed-transport-'+crypto.randomUUID();
    const opened=await new Promise((resolve,reject)=>{const request=indexedDB.open(database,1);request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    try{
      await new Promise((resolve,reject)=>{const transaction=opened.transaction('state','readwrite');transaction.objectStore('state').put(saved,'checkpoint');
        transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);});
      retrieved=await new Promise((resolve,reject)=>{const request=opened.transaction('state').objectStore('state').get('checkpoint');
        request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
      indexedDBRoundtrip=true;
    }finally{
      opened.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(database);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error);});
    }
  }
  const reload=await NativeProgram.instantiate(retrieved.artifact,retrieved.source);await reload.restoreMemory(retrieved.snapshot);
  require(same(new Uint8Array(reload.memory.buffer),snapshot.bytes),'Exact reloaded memory');
  require(reload.integerInput('state.count')[0]===-0x8000000000000000n&&reload.integerOutput('echo')[0]===-0x8000000000000000n,'Exact reloaded i64 lanes');
  reload.booleanInput('enabled')[0]=2;const before=new Uint8Array(reload.memory.buffer).slice();let rejected=false;
  try{reload.evaluate(1);}catch(error){rejected=String(error).includes('InvalidInput');}
  require(rejected&&same(before,new Uint8Array(reload.memory.buffer)),'Invalid Boolean refusal changed memory');
  const realView=await NativeProgram.instantiate(inputOnly.artifact,inputOnly.source);realView.evaluate(0);
  require(realView.output('result')[0]===9.5,'Input-only typed region');
  realView.integerInput('state.count')[0]=9007199254740993n;
  const checkedBytes=new Uint8Array(realView.memory.buffer).slice();let checkedRefusal=false;
  try{realView.evaluate(0);}catch(error){checkedRefusal=String(error).includes('InvalidInput');}
  require(checkedRefusal&&same(checkedBytes,new Uint8Array(realView.memory.buffer)),'Checked Real-view refusal');
  return {checks,offsets:true,reset:true,readonlyInputs:true,staleSourceRejected:stale,exactCheckpointReload:true,indexedDBRoundtrip,
    invalidBooleanAtomic:true,inputOnlyTypedRegion:true,checkedRealViewAtomic:true};
}
let browser,server;let failure=null,nodeResult,browserResult,browserVersion;
try{
  nodeResult=await verify(NativeProgram,fixture);
  server=createServer((request,response)=>{if(request.url==='/consumer.mjs'){response.setHeader('Content-Type','text/javascript');response.end(consumer.outputFiles[0].contents);}
    else response.end('<!doctype html><title>Typed WASM byte transport</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});browserVersion=browser.version();
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  browserResult=await page.evaluate(async({body,fixture})=>{
    const script=`const verify=${body};onmessage=async({data})=>{try{const {NativeProgram}=await import(data.base+'/consumer.mjs');postMessage({result:await verify(NativeProgram,data.fixture)});}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned typed transport worker timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage({base:location.origin,fixture});});}
    finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),fixture});
  if(!browserResult.indexedDBRoundtrip)throw Error('Worker persistence was not exercised');
}catch(error){failure=String(error.stack??error);}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
const bookendsEqual=sources.every(x=>sha(fs.readFileSync(x.path))===x.sha256);
const report={status:!failure&&bookendsEqual?'HANDCRAFTED_TYPED_INPUT_TRANSPORT_NODE_AND_BROWSER_PASS':'FAILED_OR_INCOMPLETE',recordedAt:new Date().toISOString(),
  sources,bookendsEqual,node:{version:process.version,result:nodeResult},browser:{version:browserVersion,result:browserResult},failure,
  consumerBundleSha256:sha(consumer.outputFiles[0].contents),fixtureSha256:sha(fs.readFileSync(path.join(durable,'transport-fixture.json'))),
  helperBundleSha256:sha(helper.outputFiles[0].contents),memoryBytes:65536,
  scope:'Handcrafted WASM byte-transport fixture only: mixed typed input base/output offsets, full-width i64, Boolean bytes, readonly ordinary/typed inputs, reset, source binding, exact checkpoint reload and Chromium worker IndexedDB. This is not Modelica compilation, compiler-issued State carry, raw-camera ingestion, SLAM mathematics or a performance benchmark.',
  compilerArtifactQualified:false,fullSlamAccepted:false,tenTimesRealtimeQualified:false};
fs.writeFileSync(path.join(durable,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:durable,status:report.status,node:nodeResult,browser:browserResult,failure}));process.exitCode=failure||!bookendsEqual?1:0;
