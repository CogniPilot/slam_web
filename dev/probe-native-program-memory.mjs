// Actual retained Rumoca module; tests binary memory transport, not SLAM math.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixture='dev/artifacts/pr382-4b42587c-typed-program-admission';
const source=fs.readFileSync(`${fixture}/Edge.mo`,'utf8');
const raw=fs.readFileSync(`${fixture}/final-artifact.json`),artifact=JSON.parse(raw);
const parent='dev/artifacts/native-program-memory-checkpoint';
fs.mkdirSync(parent,{recursive:true});
const output=fs.mkdtempSync(path.join(parent,'browser-'));
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,write:false,
  platform:'browser',format:'esm',target:'es2022'});
fs.writeFileSync(path.join(output,'consumer.mjs'),bundle.outputFiles[0].contents);
const identity={sourceSha256:sha(source),artifactSha256:sha(raw),moduleSha256:artifact.module_sha256,
  fixture,compiler:artifact.compiler,schema:artifact.solve_schema_version,profile:artifact.profile,
  consumerBundleSha256:sha(bundle.outputFiles[0].contents),probeSha256:sha(fs.readFileSync(import.meta.filename)),
  consumerSourceSha256:sha(fs.readFileSync('src/modelica-native-program.ts'))};

// This function executes inside a new browser worker on each side of reload.
async function operation({base,source,artifact,database,mode}){
  const {NativeProgram}=await import(`${base}/consumer.mjs`);
  const require=(condition,message)=>{if(!condition)throw new Error(message);};
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  const program=await NativeProgram.instantiate(artifact,source);
  try{
    if(mode==='save'){
      program.input('x')[0]=20;program.evaluate(7);
      require(program.integerOutput('reason')[0]===9007199254740993n,'Exact compiler Integer output');
      const occupied=Math.max(artifact.abi.p_offset+artifact.abi.p_count*8,
        artifact.abi.scratch_offset+artifact.abi.scratch_bytes,
        artifact.abi.output_lanes_offset+artifact.abi.output_lanes_bytes);
      const tail=new BigUint64Array(program.memory.buffer,program.memory.buffer.byteLength-16,2);
      require(tail.byteOffset>=occupied,'Unused raw-bit test padding');
      tail[0]=0x8000000000000000n;tail[1]=0x7ff8000000000123n;
      const snapshot=await program.snapshotMemory();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readwrite');tx.objectStore('state').put(snapshot,'checkpoint');
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
      });
      return {saved:true,bytes:snapshot.bytes.byteLength,bytesSha256:snapshot.bytesSha256,
        layoutSha256:snapshot.layoutSha256,reason:String(program.integerOutput('reason')[0])};
    }
    const snapshot=await new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly'),request=tx.objectStore('state').get('checkpoint');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    require(snapshot.bytes instanceof Uint8Array,'IndexedDB retained typed binary');
    await program.restoreMemory(snapshot);
    require(program.integerOutput('reason')[0]===9007199254740993n,'Reload retained Integer above2^53');
    require(program.booleanOutput('valid')[0]===0,'Reload retained Boolean lane');
    require(program.input('x')[0]===20&&program.output('y')[0]===40,'Reload retained P and Y');
    const tail=new BigUint64Array(program.memory.buffer,program.memory.buffer.byteLength-16,2);
    require(tail[0]===0x8000000000000000n&&tail[1]===0x7ff8000000000123n,'Reload retained raw padding bits');
    const restored=await program.snapshotMemory();
    require(restored.bytesSha256===snapshot.bytesSha256,'Complete memory reload equality');
    program.input('x')[0]=4;program.evaluate(8);
    require(program.integerOutput('reason')[0]===0n&&program.booleanOutput('valid')[0]===1
      &&program.output('y')[0]===8&&program.output('gated')[0]===8,'Fresh worker executes after reload');
    return {loaded:true,binary:true,exactInteger:true,exactBoolean:true,rawPadding:true,
      completeMemory:true,continued:true,bytesSha256:restored.bytesSha256};
  }finally{db.close();}
}

let server,browser;
try{
  server=createServer((request,response)=>{
    response.setHeader('Content-Type',request.url==='/consumer.mjs'?'text/javascript':'text/html');
    response.end(request.url==='/consumer.mjs'?bundle.outputFiles[0].contents:
      '<!doctype html><title>Native program memory checkpoint probe</title>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,
    args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const database=`native-memory-checkpoint-${path.basename(output)}`;
  const run=mode=>page.evaluate(async payload=>{
    const script=`const operation=${payload.operation};onmessage=async e=>{try{postMessage({result:await operation(e.data)})}catch(error){postMessage({error:String(error.stack||error)})}}`;
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
    const worker=new Worker(url,{type:'module'});
    try{
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Memory checkpoint worker timeout')),15000);
        worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data.result);};
        worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message));};
        worker.postMessage({...payload,base:location.origin});
      });
    }finally{worker.terminate();URL.revokeObjectURL(url);}
  },{operation:operation.toString(),source,artifact,database,mode});
  const saved=await run('save');
  await page.reload();
  const loaded=await run('load');
  if(saved.bytesSha256!==loaded.bytesSha256)throw new Error('Cross-reload memory digest mismatch');
  const report={status:'PASS',...identity,browser:browser.version(),saved,loaded,
    scope:'Actual retained compiler-issued Edge executable, new workers separated by page reload and IndexedDB binary persistence. Same-artifact memory only; no next-to-previous record transfer, complete SLAM session, compiler fix, GPU or throughput claim.',
    productionPinChanged:false};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({output,...report}));
}catch(error){
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({status:'FAIL',...identity,error:String(error.stack||error)},null,2)+'\n');
  throw error;
}finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
}
