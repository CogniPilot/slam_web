// Execute the unchanged, compiler-issued nested-State Reset program.
// This is a numerical component gate, not cross-entrypoint State or full SLAM.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const [sourceFile,artifactFile,output] = process.argv.slice(2);
if (!output) throw Error('Expected SOURCE ARTIFACT NEW_OUTPUT_DIRECTORY');
if (fs.existsSync(output)) throw Error('Choose a fresh output directory');
fs.mkdirSync(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=fs.readFileSync(sourceFile,'utf8'),raw=fs.readFileSync(artifactFile),artifact=JSON.parse(raw);
if (artifact.model_name!=='NativeStateCarryReset' || artifact.source_sha256!==sha(source)
  || artifact.module_sha256!==sha(Buffer.from(artifact.module_bytes))) throw Error('Issued source/module identity differs');
const bundle=await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'browser',write:false});
const consumerFile=path.join(output,'consumer.mjs');fs.writeFileSync(consumerFile,bundle.outputFiles[0].contents);
const sources=['src/modelica-native-program.ts','src/modelica-native-artifact.ts','src/source-digest.ts','dev/probe-native-state-carry-reset.mjs']
  .map(file=>({path:file,sha256:sha(fs.readFileSync(file))}));
for(const file of sources){const target=path.join(output,'sources',file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file.path,target);}
async function verify(NativeProgram,artifact,source){
  const require=(condition,message)=>{if(!condition)throw Error(message);};
  const program=await NativeProgram.instantiate(artifact,source);
  const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  const real=[['next.position[1]',0],['next.position[2]',1.25],['next.position[3]',-2.5],
    ['next.matrix[1,1]',11],['next.matrix[1,2]',12],['next.matrix[1,3]',13],
    ['next.matrix[2,1]',21],['next.matrix[2,2]',22],['next.matrix[2,3]',23]];
  const integers=[['next.identity.sequence',9007199254740993n],['next.observations[1]',9007199254740993n],
    ['next.observations[2]',-9007199254740993n]];
  const booleans=[['next.identity.valid',1],['next.occupied[1]',1],['next.occupied[2]',0]];
  let numericalChecks=0;
  for(let round=0;round<3;round++){
    program.reset();program.evaluate(round/30);
    for(const [name,expected]of real){require(program.output(name)[0]===expected,'Real field '+name);numericalChecks++;}
    for(const [name,expected]of integers){require(program.integerOutput(name)[0]===expected,'Exact Integer field '+name);numericalChecks++;}
    for(const [name,expected]of booleans){require(program.booleanOutput(name)[0]===expected,'Boolean field '+name);numericalChecks++;}
  }
  const snapshot=await program.snapshotMemory(),reload=await NativeProgram.instantiate(artifact,source);
  await reload.restoreMemory(structuredClone(snapshot));
  require(same(snapshot.bytes,new Uint8Array(reload.memory.buffer)),'Exact checkpoint bytes');
  require(reload.integerOutput('next.identity.sequence')[0]===9007199254740993n,'Exact reloaded sequence');
  let stale=false;try{await NativeProgram.instantiate(artifact,source+'\n');}catch{stale=true;}
  require(stale,'Stale source admitted');
  return {numericalChecks,exactLargeIntegers:true,rectangularRealMatrix:true,booleanArrays:true,reset:true,
    exactCheckpointReload:true,staleSourceRejected:true,negativeZeroObserved:Object.is(program.output('next.position[1]')[0],-0)};
}
let browser,server,nodeResult,browserResult,failure=null,browserVersion;
try{
  const {NativeProgram}=await import(pathToFileURL(path.resolve(consumerFile)));
  nodeResult=await verify(NativeProgram,artifact,source);
  server=createServer((request,response)=>{if(request.url==='/consumer.mjs'){
    response.setHeader('Content-Type','text/javascript');response.end(bundle.outputFiles[0].contents);
  }else response.end('<!doctype html><title>Compiler-issued nested Modelica State</title>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
  browserVersion=browser.version();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  browserResult=await page.evaluate(async({body,artifact,source})=>{
    const script=`const verify=${body};onmessage=async({data})=>{try{const {NativeProgram}=await import(data.base+'/consumer.mjs');postMessage({result:await verify(NativeProgram,data.artifact,data.source)});}catch(error){postMessage({error:String(error.stack||error)});}}`;
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'})),worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Owned Reset execution timeout')),30000);
      worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data.result);};
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.postMessage({base:location.origin,artifact,source});});
    }finally{worker.terminate();URL.revokeObjectURL(url);}
  },{body:verify.toString(),artifact,source});
}catch(error){failure=String(error.stack||error);}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
const bookendsEqual=sources.every(file=>sha(fs.readFileSync(file.path))===file.sha256);
const report={status:!failure&&bookendsEqual?'COMPILER_ISSUED_NESTED_STATE_RESET_NODE_AND_BROWSER_PASS':'FAILED_OR_INCOMPLETE',
  recordedAt:new Date().toISOString(),sourceSha256:sha(source),artifactSha256:sha(raw),moduleSha256:artifact.module_sha256,
  compiler:artifact.compiler,consumerBundleSha256:sha(bundle.outputFiles[0].contents),sources,bookendsEqual,
  node:{version:process.version,result:nodeResult},browser:{version:browserVersion,result:browserResult},failure,
  scope:'Actual compiler-issued nested State Reset numerical execution in Node and a dedicated browser worker. No artifact rewriting or host math. No cross-entrypoint record interchange, raw camera ingress, complete SLAM or throughput claim.',
  crossEntrypointStateQualified:false,fullSlamAccepted:false,productionPinChanged:false,tenTimesRealtimeQualified:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));process.exitCode=failure||!bookendsEqual?1:0;
