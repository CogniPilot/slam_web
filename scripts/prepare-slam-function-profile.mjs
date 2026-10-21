// Research-only function clocks, tied to the exact issued WASM and owner map.
import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import {instrumentNativeFunctions,installNativeFunctionTiming} from './native-function-instrumentation.mjs';
const [base,named,output]=process.argv.slice(2);
if(!output)throw Error('Usage: prepare-slam-function-profile.mjs VERIFIED_CACHE EXACT_NAMED_STEP_EXPORT NEW_RESEARCH_CACHE');
const sha=x=>createHash('sha256').update(x).digest('hex');
const receipt=JSON.parse(await readFile(join(base,'receipt.json'))),manifest=JSON.parse(await readFile(join(base,'vendor/slam/manifest.json')));
const entry=manifest.models.step.files.module,encoded=await readFile(join(base,'vendor/slam',entry.file));
const bytes=entry.encoding==='gzip'?gunzipSync(encoded):encoded;
if(sha(bytes)!==entry.sha256||sha(await readFile(join(named,'module.wasm')))!==entry.sha256)throw Error('Named export does not match issued step module');
const mapBytes=await readFile(join(named,'function_owners.json')),owners=JSON.parse(mapBytes);
const exact=new Set(['OptimizeModelicaPoseGraph','RGBDVisualVocabulary.Learn','Consensus','MatchRGBDDescriptors','RetrieveVisualWords','DescribeRGBDFrame','RGBDRegistrationSandwich','AdvanceFastRGBDLocalization']);
const prefixes=['RGBDCatalogGraphCapture.Capture(','RGBDGraphProcessing.Correct(','AdvanceFastSLAM(','RGBDLocalizationFrame.Build',
 'RGBDLocalizationProcessing.Publish(','RGBDGraphProcessing.Valid(','FastFrameScores(','SelectRasterFeatures'];
const selected=owners.filter(row=>exact.has(row.name)||prefixes.some(prefix=>row.name.startsWith(prefix)));
for(const name of exact)if(!selected.some(row=>row.name===name))throw Error('Missing mapped function '+name);
const ids=selected.map(row=>row.function),instrumented=await instrumentNativeFunctions(bytes,ids);
// The clock shim replaces an otherwise unused math symbol in this worker.
for(const model of Object.values(manifest.models)){
 const f=model.files.module,b=await readFile(join(base,'vendor/slam',f.file));
 const decoded=f.encoding==='gzip'?gunzipSync(b):b;
 if(WebAssembly.Module.imports(await WebAssembly.compile(decoded)).some(x=>x.name==='log10'))throw Error('Original module uses the reserved diagnostic math symbol');
}
const originalWorker=await readFile(join(base,'worker.js'),'utf8');
if(sha(originalWorker)!==receipt.workerSha256)throw Error('Base worker hash mismatch');
const worker=`(${installNativeFunctionTiming.toString()})();\n`+originalWorker+`\n{
 const researchOnMessage=self.onmessage,researchPost=self.postMessage;
 self.onmessage=function(event){
  const trace=globalThis.__nativeFunctionTiming;
  for(const key of Object.keys(trace.rows))delete trace.rows[key];
  trace.active=true;return researchOnMessage.call(this,event);
 };
 self.postMessage=function(data,...args){
  if(data.timings){const result=globalThis.__nativeFunctionTiming.finish();
   data.timings.nativeFunctions=structuredClone(result.rows);
  }
  return researchPost.call(this,data,...args);
 };
}\n`;
await mkdir(output);
for(const file of await readdir(base))if(file!=='receipt.json'&&file!=='worker.js')await cp(join(base,file),join(output,file),{recursive:true,errorOnExist:true});
const stored=entry.encoding==='gzip'?gzipSync(instrumented):instrumented;
await writeFile(join(output,'vendor/slam',entry.file),stored);
const originalModuleSha256=entry.sha256;entry.sha256=sha(instrumented);entry.bytes=instrumented.length;
await writeFile(join(output,'vendor/slam/manifest.json'),JSON.stringify(manifest));
for(const file of receipt.files)if(file.file===entry.file)Object.assign(file,{storedSha256:sha(stored),decodedSha256:sha(instrumented),decodedBytes:instrumented.length});
await writeFile(join(output,'worker.js'),worker);
receipt.researchInstrumentation={kind:'native-function-clocks',originalModuleSha256,instrumentedModuleSha256:entry.sha256,
 originalWorkerSha256:receipt.workerSha256,ownerMapSha256:sha(mapBytes),functions:selected,
 scope:'Diagnostic WASM call wrappers; Modelica arithmetic and calls retained. Per-request inclusive/self times. Self excludes instrumented descendants only. Nested inclusive times must not be added; instrumentation overhead included. Not a production delivery.'};
receipt.workerSha256=sha(worker);
await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({output,...receipt.researchInstrumentation}));
