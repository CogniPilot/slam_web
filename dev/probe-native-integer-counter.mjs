// Exact arithmetic acceptance of an actual compiler-issued Integer component.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [sourceFile,artifactFile,out]=process.argv.slice(2);
if(!out||fs.existsSync(out))throw Error('Expected SOURCE ARTIFACT NEW_OUTPUT_DIRECTORY');
fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(sourceFile,'utf8'),raw=fs.readFileSync(artifactFile),artifact=JSON.parse(raw);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(artifact.model_name!=='NativeIntegerCounter'||artifact.source_sha256!==sha(source)
  ||artifact.module_sha256!==sha(Buffer.from(artifact.module_bytes)))throw Error('Issued artifact identity differs');
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
fs.writeFileSync(path.join(out,'consumer.mjs'),bundle.outputFiles[0].contents);
const sources=['src/modelica-native-program.ts','src/modelica-native-artifact.ts','src/source-digest.ts',
  'dev/probe-native-integer-counter.mjs'].map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
for(const file of sources){const target=path.join(out,'sources',file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.path,target);}
async function verify(NativeProgram,artifact,source){
  const require=(ok,message)=>{if(!ok)throw Error(message);};
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const program=await NativeProgram.instantiate(artifact,source),sequence=program.integerInput('sequence'),
    increment=program.integerInput('increment'),received=program.integerOutput('received'),next=program.integerOutput('next');
  program.evaluate(0);require(received[0]===7n&&next[0]===8n,'Authored exact defaults');
  const inputs=()=>[new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice(),
    new Uint8Array(program.memory.buffer,artifact.abi.input_lanes_offset,artifact.abi.input_lanes_bytes).slice()];
  const observations=[];
  for(const [count,change,expected]of [[9007199254740993n,1n,9007199254740994n],
    [-9007199254740993n,-1n,-9007199254740994n],
    [0x7ffffffffffffffen,1n,0x7fffffffffffffffn],[-0x7fffffffffffffffn,-1n,-0x8000000000000000n],
    [9007199254740993n,0n,9007199254740993n],[0n,9007199254740993n,9007199254740993n]]){
    sequence[0]=count;increment[0]=change;const before=inputs();let errorText=null;
    try{program.evaluate(observations.length/30);}catch(error){errorText=String(error);}
    const after=inputs(),readonly=before.every((bytes,i)=>same(bytes,after[i]));
    observations.push({sequence:String(count),increment:String(change),expected:String(expected),
      received:String(received[0]),next:String(next[0]),errorText,readonlyInputs:readonly,
      passed:!errorText&&readonly&&received[0]===count&&next[0]===expected});
  }
  const overflows=[];
  for(const [count,change]of [[0x7fffffffffffffffn,1n],[-0x8000000000000000n,-1n]]){
    sequence[0]=count;increment[0]=change;const before=inputs(),oldReceived=received[0],oldNext=next[0];let errorText=null;
    try{program.evaluate(1);}catch(error){errorText=String(error);}
    const after=inputs(),readonly=before.every((bytes,i)=>same(bytes,after[i]));
    overflows.push({sequence:String(count),increment:String(change),errorText,readonlyInputs:readonly,
      outputsRetained:received[0]===oldReceived&&next[0]===oldNext,
      passed:Boolean(errorText?.includes('IntegerArithmetic')&&readonly)});
  }
  const checkpoint=await program.snapshotMemory(),reload=await NativeProgram.instantiate(artifact,source);
  await reload.restoreMemory(structuredClone(checkpoint));
  require(same(checkpoint.bytes,new Uint8Array(reload.memory.buffer)),'Exact full-width input/output checkpoint');
  program.reset();program.evaluate(0);require(received[0]===7n&&next[0]===8n,'Reset after boundary cases');
  return {passed:observations.every(item=>item.passed)&&overflows.every(item=>item.passed),
    observations,overflows,reset:true,exactCheckpointReload:true};
}
let browser,server,nodeResult,browserResult,browserVersion,failure=null;
try{
  const {NativeProgram}=await import(pathToFileURL(path.resolve(out,'consumer.mjs')));nodeResult=await verify(NativeProgram,artifact,source);
  server=createServer((request,response)=>{if(request.url==='/consumer.mjs'){
    response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);
  }else response.end('<!doctype html><title>Exact compiled Modelica Integers</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  browserVersion=browser.version();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  browserResult=await page.evaluate(async({body,artifact,source})=>{
    const script=`const verify=${body};onmessage=async({data})=>{try{const {NativeProgram}=await import(data.base+'/consumer.mjs');postMessage({result:await verify(NativeProgram,data.artifact,data.source)});}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned counter execution timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage({base:location.origin,artifact,source});});
    }finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),artifact,source});
}catch(error){failure=String(error.stack||error);}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
if(!failure&&(!nodeResult?.passed||!browserResult?.passed))failure='Actual compiled Integer arithmetic acceptance failed';
const bookendsEqual=sources.every(file=>sha(fs.readFileSync(file.path))===file.sha256);
const report={status:!failure&&bookendsEqual?'COMPILER_ISSUED_INTEGER_COUNTER_NODE_AND_BROWSER_PASS':'FAILED_OR_INCOMPLETE',
  recordedAt:new Date().toISOString(),compiler:artifact.compiler,sourceSha256:sha(source),artifactSha256:sha(raw),
  moduleSha256:artifact.module_sha256,consumerBundleSha256:sha(bundle.outputFiles[0].contents),sources,bookendsEqual,
  node:{version:process.version,result:nodeResult},browser:{version:browserVersion,result:browserResult},failure,
  scope:'Unchanged compiler-issued Integer-only input, addition, output and checkpoint checks, with no authored Real conversion and no host arithmetic fallback. Focused component, not full State interchange or SLAM.',
  fullSlamAccepted:false,productionPinChanged:false,tenTimesRealtimeQualified:false};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
process.exitCode=failure||!bookendsEqual?1:0;
