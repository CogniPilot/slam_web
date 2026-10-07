// Numerical execution of an actual browser-compiler-issued input ABI probe.
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
if(artifact.model_name!=='NativeTypedInputsProbe'||artifact.source_sha256!==sha(source)
  ||artifact.module_sha256!==sha(Buffer.from(artifact.module_bytes)))throw Error('Issued artifact identity differs');
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
fs.writeFileSync(path.join(out,'consumer.mjs'),bundle.outputFiles[0].contents);
const sources=['src/modelica-native-program.ts','src/modelica-native-artifact.ts','src/source-digest.ts',
  'dev/probe-native-typed-input-execution.mjs'].map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
for(const file of sources){const target=path.join(out,'sources',file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.path,target);}
async function verify(NativeProgram,artifact,source){
  const require=(ok,message)=>{if(!ok)throw Error(message);};
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const program=await NativeProgram.instantiate(artifact,source),value=program.input('value'),
    sequence=program.integerInput('sequence'),enabled=program.booleanInput('enabled'),result=program.output('result');
  program.evaluate(0);require(result[0]===9.5,'Authored mixed defaults');
  const inputBytes=()=>[new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice(),
    new Uint8Array(program.memory.buffer,artifact.abi.input_lanes_offset,artifact.abi.input_lanes_bytes).slice()];
  let numericChecks=1;
  // All expected results are exact; the host performs no reference algorithm.
  for(const [x,count,on,expected]of [[0,0n,1,0],[1.25,7n,1,8.25],[-2.5,-7n,1,-9.5],
    [0,9007199254740992n,1,9007199254740992],[0,-9007199254740992n,1,-9007199254740992],[17,42n,0,0]]){
    value[0]=x;sequence[0]=count;enabled[0]=on;const before=inputBytes();program.evaluate(numericChecks/30);
    require(result[0]===expected,'Mixed input execution');const after=inputBytes();
    require(before.every((bytes,i)=>same(bytes,after[i])),'Readonly ordinary/typed input bytes');numericChecks++;
  }
  const refusals=[];
  for(const [count,on]of [[9007199254740993n,1],[-9007199254740993n,1],[0n,2]]){
    sequence[0]=count;enabled[0]=on;const before=inputBytes(),oldResult=result.slice();let errorText=null;
    try{program.evaluate(1);}catch(error){errorText=String(error);}
    const after=inputBytes(),refused=errorText?.includes('InvalidInput'),outputRetained=same(oldResult,result),
      inputsRetained=before.every((bytes,i)=>same(bytes,after[i]));
    refusals.push({count:String(count),enabled:on,errorText,refused:Boolean(refused),outputRetained,inputsRetained,
      expectedOutput:[...oldResult],actualOutput:[...result],passed:Boolean(refused&&outputRetained&&inputsRetained)});
  }
  program.reset();program.evaluate(0);require(result[0]===9.5&&sequence[0]===7n&&enabled[0]===1,'Reset after faults');
  sequence[0]=9007199254740993n;
  const snapshot=await program.snapshotMemory(),reload=await NativeProgram.instantiate(artifact,source);
  await reload.restoreMemory(structuredClone(snapshot));
  require(reload.integerInput('sequence')[0]===9007199254740993n&&same(snapshot.bytes,new Uint8Array(reload.memory.buffer)),
    'Checkpoint retains full-width input even when its Real view is refused');
  return {passed:refusals.every(item=>item.passed),numericChecks,readonlyInputs:true,
    checkedRealViewRefusals:refusals.slice(0,2).filter(item=>item.refused).length,
    invalidBooleanRefusals:Number(refusals[2].refused),refusalObservations:refusals,
    outputAtomicity:refusals.every(item=>item.outputRetained),resetRecovery:true,exactLargeIntegerCheckpoint:true};
}
let browser,server,nodeResult,browserResult,browserVersion,failure=null;
try{
  const {NativeProgram}=await import(pathToFileURL(path.resolve(out,'consumer.mjs')));nodeResult=await verify(NativeProgram,artifact,source);
  server=createServer((request,response)=>{if(request.url==='/consumer.mjs'){
    response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);
  }else response.end('<!doctype html><title>Compiler-issued typed inputs</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  browserVersion=browser.version();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  browserResult=await page.evaluate(async({body,artifact,source})=>{
    const script=`const verify=${body};onmessage=async({data})=>{try{const {NativeProgram}=await import(data.base+'/consumer.mjs');postMessage({result:await verify(NativeProgram,data.artifact,data.source)});}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned typed-input execution timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage({base:location.origin,artifact,source});});
    }finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),artifact,source});
}catch(error){failure=String(error.stack||error);}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
const bookendsEqual=sources.every(file=>sha(fs.readFileSync(file.path))===file.sha256);
if(!failure&&(!nodeResult?.passed||!browserResult?.passed))failure='Compiler failed checked-input numerical acceptance; see refusalObservations';
const report={status:!failure&&bookendsEqual?'COMPILER_ISSUED_TYPED_INPUT_NODE_AND_BROWSER_PASS':'FAILED_OR_INCOMPLETE',
  recordedAt:new Date().toISOString(),compiler:artifact.compiler,sourceSha256:sha(source),artifactSha256:sha(raw),
  moduleSha256:artifact.module_sha256,consumerBundleSha256:sha(bundle.outputFiles[0].contents),sources,bookendsEqual,
  node:{version:process.version,result:nodeResult},browser:{version:browserVersion,result:browserResult},failure,
  scope:'Actual compiler-issued mixed Real/Integer/Boolean input execution, readonly inputs, checked Real conversion, transactional published Y and exact input checkpoint. Scratch bytes are private work storage. No raw camera ingress, cross-entrypoint State interchange, full SLAM or throughput claim.',
  fullSlamAccepted:false,productionPinChanged:false,tenTimesRealtimeQualified:false};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
process.exitCode=failure||!bookendsEqual?1:0;
