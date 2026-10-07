// Actual exported camera-slice regression artifacts; never substitutes for full FAST.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [artifactDirectory,directory]=process.argv.slice(2);
if(!directory)throw Error('ARTIFACT_DIRECTORY OUTPUT_DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const variants=['baseline','edited'].map(name=>{
  const source=fs.readFileSync(path.join(artifactDirectory,`${name}.mo`),'utf8');
  const bytes=fs.readFileSync(path.join(artifactDirectory,`${name}.json`));
  const artifact=JSON.parse(bytes),frames=fs.readFileSync(path.join(artifactDirectory,`${name}-frames.json`));
  if(artifact.model_name!=='PackedCalls'||artifact.source_sha256!==sha(source)||artifact.module_sha256!==sha(Buffer.from(artifact.module_bytes)))
    throw Error('Original guarded source/artifact binding mismatch');
  return {name,source,artifact,frames:JSON.parse(frames),artifactSha256:sha(bytes),framesSha256:sha(frames)};
});
if(variants[1].source!==variants[0].source.replace('patch[1]-patch[2]','patch[1]+patch[2]'))throw Error('Unexpected source edit');
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},
  bundle:true,format:'esm',platform:'neutral',write:false});
const consumer=path.join(directory,'consumer.mjs');fs.writeFileSync(consumer,bundle.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(path.resolve(consumer)));
async function verify(NativeProgram,variants){
  const require=(condition,message)=>{if(!condition)throw Error(message);},result=[];
  const bits=(array,index)=>new DataView(array.buffer,array.byteOffset,array.byteLength).getBigUint64(index*8,true).toString(16).padStart(16,'0');
  for(const variant of variants){
    const program=await NativeProgram.instantiate(variant.artifact,variant.source),abi=variant.artifact.abi;
    const input=program.input('x'),output=program.output('y');let outputBitChecks=0,readonlyCalls=0;
    require(input.length===5&&output.length===4&&variant.frames.length===3,'Original fixture dimensions');
    const execute=frame=>{
      require(frame.input_bits.length===5&&frame.expected_bits.length===4,'Original frame dimensions');
      const view=new DataView(input.buffer,input.byteOffset,input.byteLength);
      frame.input_bits.forEach((value,index)=>view.setBigUint64(index*8,BigInt(`0x${value}`),true));
      const pBefore=new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).slice();
      program.evaluate(0);
      require(new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).every((value,index)=>value===pBefore[index]),'P mutation');readonlyCalls++;
      frame.expected_bits.forEach((expected,index)=>{require(bits(output,index)===expected,`${variant.name}/${index} raw-bit mismatch`);outputBitChecks++;});
    };
    for(let round=0;round<2;round++){if(round)program.reset();for(const frame of variant.frames)execute(frame);}
    const yBefore=new Uint8Array(program.memory.buffer,abi.y_offset,abi.y_count*8).slice();
    const pBefore=new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).slice();
    require(program.execute(abi.y_offset,abi.p_offset,0,abi.p_offset,0)===1,'Invalid buffer status');
    require(new Uint8Array(program.memory.buffer,abi.y_offset,abi.y_count*8).every((value,index)=>value===yBefore[index]),'Invalid-buffer Y mutation');
    require(new Uint8Array(program.memory.buffer,abi.p_offset,abi.p_count*8).every((value,index)=>value===pBefore[index]),'Invalid-buffer P mutation');
    execute(variant.frames[0]);
    let stale=false;try{await NativeProgram.instantiate(variant.artifact,variant.source+'\n// stale');}catch(error){stale=String(error).includes('does not match its source');}
    require(stale,'Stale source accepted');
    result.push({name:variant.name,outputBitChecks,readonlyCalls,reset:true,invalidBufferAtomic:true,recovery:true,staleSourceRejected:true});
  }
  return result;
}
let browser,server;
try{
  const node=await verify(NativeProgram,variants);
  server=createServer((request,response)=>{
    response.setHeader('Content-Type',request.url==='/consumer.mjs'?'text/javascript':'text/html');
    response.end(request.url==='/consumer.mjs'?bundle.outputFiles[0].contents:'<!doctype html><title>Affine camera call regression</title>');
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  const invoke=reload=>page.evaluate(async({body,variants,reload})=>{
    const code=`const verify=${body};onmessage=async event=>{try{const {NativeProgram}=await import(event.data.base+'/consumer.mjs');const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('affine-camera-call-review',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});try{let variants=event.data.variants;if(event.data.reload)variants=await new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').get('source-and-artifact');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});if(!variants)throw Error('Missing project');const result=await verify(NativeProgram,variants);if(!event.data.reload)await new Promise((resolve,reject)=>{const transaction=db.transaction('projects','readwrite');transaction.objectStore('projects').put(variants,'source-and-artifact');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});postMessage({result,reload:event.data.reload})}finally{db.close()}}catch(error){postMessage({error:String(error.stack||error)})}}`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Affine camera worker timeout')),30000);
      worker.onmessage=event=>{clearTimeout(timer);event.data.error?reject(Error(event.data.error)):resolve(event.data);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
      worker.postMessage({base:location.origin,variants:reload?undefined:variants,reload});
    });}finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),variants,reload});
  const first=await invoke(false);await page.reload();const restored=await invoke(true);
  const report={schemaVersion:1,status:'AFFINE_CAMERA_CALL_SOURCE_EDIT_NODE_CHROMIUM_PASS',recordedAt:new Date().toISOString(),
    probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerSha256:sha(bundle.outputFiles[0].contents),
    variants:variants.map(variant=>({name:variant.name,sourceSha256:variant.artifact.source_sha256,artifactSha256:variant.artifactSha256,
      moduleSha256:variant.artifact.module_sha256,framesSha256:variant.framesSha256})),
    node:{engine:process.version,result:node},browser:{version:browser.version(),first,restored},
    scope:'Actual compiler-issued original guarded two-element slices and source edit, raw-bit outputs including signed zero/Infinity, readonly P, reset, InvalidBuffer atomicity/recovery, dedicated Chromium workers and IndexedDB source/artifact reload. No full7x7 or full160x90 detector, browser compilation/editor, sensor, performance or full-SLAM claim.'};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,browser:report.browser.version,nodeOutputBitChecks:node.reduce((sum,item)=>sum+item.outputBitChecks,0)}));
}catch(error){fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({status:'FAIL',error:String(error.stack||error)},null,2)+'\n');throw error;}
finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
