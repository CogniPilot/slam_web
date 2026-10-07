// Run compiler-issued original FAST function in Node and real browser workers.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [baselineSourceFile,baselineArtifactFile,editedSourceFile,editedArtifactFile,directory]=process.argv.slice(2);
if(!directory)throw Error('Expected BASE_SOURCE BASE_ARTIFACT EDITED_SOURCE EDITED_ARTIFACT OUTPUT_DIRECTORY');
fs.mkdirSync(directory,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixtureBytes=fs.readFileSync('dev/artifacts/fast-native-frame/independent-fixtures.json'),fixtures=JSON.parse(fixtureBytes);
const original=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo','utf8');
if(fixtures.sourceSha256!==sha(original)||fixtures.patches.length!==23)throw Error('Independent original fixture mismatch');
const sources=[baselineSourceFile,editedSourceFile].map(file=>fs.readFileSync(file,'utf8'));
if(!sources[0].startsWith(original)||sources[1]!==sources[0].replace('responses[1] := 0.0;','responses[1] := 1.0;'))throw Error('Unexpected function/source edit');
const bytes=[baselineArtifactFile,editedArtifactFile].map(file=>fs.readFileSync(file)),artifacts=bytes.map(b=>JSON.parse(b));
for(let i=0;i<2;i++)if(artifacts[i].model_name!=='FastPatchNativeProbe'||artifacts[i].source_sha256!==sha(sources[i])
  ||artifacts[i].profile!=='native-direct-program-f64-v3'||sha(Buffer.from(artifacts[i].module_bytes))!==artifacts[i].module_sha256)throw Error('Source-issued native module identity mismatch');
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',write:false});
const consumerFile=path.join(directory,'consumer.mjs');fs.writeFileSync(consumerFile,bundle.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(path.resolve(consumerFile)));
// Shared numerical verifier executes the same compiler-issued consumer in both engines.
const verify=async (NativeProgram,data)=>{
 const require=(ok,message)=>{if(!ok)throw Error(message);};
 const fromHex=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
 const toHex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
 const results=[];
 for(let variant=0;variant<2;variant++){
  const artifact=data.artifacts[variant],source=data.sources[variant],p=await NativeProgram.instantiate(artifact,source);
  const input=p.input('gray'),output=p.output('score'),abi=artifact.abi;
  require(input.length===49&&output.length===1,'Patch ABI shape');
  const inputBytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength),outputBytes=new Uint8Array(output.buffer,output.byteOffset,output.byteLength);
  const evaluated=[];let readonlyCalls=0;
  const evaluate=time=>{const before=new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).slice();p.evaluate(time);require(new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).every((v,i)=>v===before[i]),'P mutated');readonlyCalls++;};
  for(let round=0;round<2;round++){
   if(round===1)p.reset();
   for(const patch of data.patches){
    require(patch.patchBits.length===49&&patch.patchBits.every(v=>/^[a-f0-9]{16}$/.test(v)),'Fixture bits');
    inputBytes.set(fromHex(patch.patchBits.join('')));evaluate((round*23+evaluated.length)/90);
    const expected=variant===1&&patch.expectedScore<1?'000000000000f03f':patch.expectedScoreBits;
    require(toHex(outputBytes)===expected,`${variant}/${round}/${patch.name}: ${toHex(outputBytes)} != ${expected}`);
    evaluated.push({round,name:patch.name,bits:toHex(outputBytes)});
   }
  }
  const beforeY=new Uint8Array(p.memory.buffer,abi.y_offset,abi.y_count*8).slice();
  const beforeP=new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).slice();
  // Diagnostic direct ABI invocation: alias scratch with readonly input storage.
  // Real inputs permit IEEE NaN; do not invent a finite-input restriction.
  const status=p.execute(abi.y_offset,abi.p_offset,2,abi.p_offset,0);
  require(status===1&&new Uint8Array(p.memory.buffer,abi.y_offset,abi.y_count*8).every((v,i)=>v===beforeY[i])
    &&new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).every((v,i)=>v===beforeP[i]),'Invalid buffer fault/atomic publication');
  const black=data.patches.find(v=>v.name==='black');inputBytes.set(fromHex(black.patchBits.join('')));evaluate(3);
  require(toHex(outputBytes)===(variant===1?'000000000000f03f':black.expectedScoreBits),'Recovery');
  let stale=false;try{await NativeProgram.instantiate(artifact,source+'\n// stale');}catch(e){stale=String(e).includes('does not match its source');}
  require(stale,'Stale source accepted');
  results.push({variant:variant===0?'original':'edited-floor-one',evaluated,readonlyCalls,invalidBufferAtomic:true,recovery:true,reset:true,staleSource:true});
 }
 return results;
};
const data={sources,artifacts,patches:fixtures.patches};
let browser,server;
try{
 const node=await verify(NativeProgram,data);
 server=createServer((req,res)=>{if(req.url==='/consumer.mjs'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Original FAST patch WASM review</title>');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const invoke=(reload)=>page.evaluate(async ({body,data,reload})=>{
  const code=`const verify=${body};onmessage=async e=>{try{const {NativeProgram}=await import(e.data.base+'/consumer.mjs');const db=await new Promise((r,j)=>{const q=indexedDB.open('fast-patch-native-review',1);q.onupgradeneeded=()=>q.result.createObjectStore('projects');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});let data=e.data.data;try{if(e.data.reload)data=await new Promise((r,j)=>{const q=db.transaction('projects').objectStore('projects').get('source-and-artifact');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});if(!data)throw Error('Missing saved project');const result=await verify(NativeProgram,data);if(!e.data.reload)await new Promise((r,j)=>{const t=db.transaction('projects','readwrite');t.objectStore('projects').put(data,'source-and-artifact');t.oncomplete=r;t.onerror=()=>j(t.error);t.onabort=()=>j(t.error);});postMessage({result,reload:e.data.reload});}finally{db.close();}}catch(e){postMessage({error:String(e.stack||e)})}}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
  try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker timeout')),60000);worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage({base:location.origin,data:reload?undefined:data,reload});});}finally{worker.terminate();URL.revokeObjectURL(url);}
 },{body:verify.toString(),data,reload});
 const first=await invoke(false);await page.reload();const restored=await invoke(true);
 const report={schemaVersion:1,status:'ORIGINAL_FAST_PATCH_NODE_CHROMIUM_RAW_BITS_SOURCE_EDIT_PERSISTENCE_PASS',
  originalSourceSha256:sha(original),fixtureSha256:sha(fixtureBytes),probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerBundleSha256:sha(bundle.outputFiles[0].contents),
  modules:artifacts.map((a,i)=>({sourceSha256:sha(sources[i]),artifactSha256:sha(bytes[i]),moduleSha256:a.module_sha256,moduleBytes:a.module_bytes.length})),
  node:{engine:`${process.version} / V8 ${process.versions.v8}`,results:node},browser:{version:browser.version(),first,restored},
  rawBitScoreChecks:node.reduce((n,r)=>n+r.evaluated.length,0)+first.result.reduce((n,r)=>n+r.evaluated.length,0)+restored.result.reduce((n,r)=>n+r.evaluated.length,0),
  scope:'Actual unchanged original FastPatchScore7x7 function and a compiled Modelica score-floor edit.23 independent patches, signed-zero bits, repeated/reset execution, readonly input and InvalidBuffer scratch/input alias Y/P atomicity/recovery, dedicated Chromium workers and IDB reload. Complementary original-function proof only; full160x90 source compilation/numerics, sensor frontend, performance and SLAM remain separate requirements.'};
 fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rawBitScoreChecks:report.rawBitScoreChecks,modules:report.modules,browser:report.browser.version}));
}catch(error){fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({status:'FAIL',error:String(error.stack||error)},null,2)+'\n');throw error;}
finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
