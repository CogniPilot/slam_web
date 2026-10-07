// Actual source-issued modules and independent fixture expectations; no app fallback.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const [fixtureFile,baselineFile,candidateFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('FIXTURE BASELINE CANDIDATE REPORT required');
const sha=v=>createHash('sha256').update(v).digest('hex');
const fixtureBytes=fs.readFileSync(fixtureFile),fixture=JSON.parse(fixtureBytes);
const source=fs.readFileSync(fixture.artifacts.registration.sourcePath,'utf8');
const artifacts=[baselineFile,candidateFile].map(p=>JSON.parse(fs.readFileSync(p)));
if(artifacts.some(a=>a.source_sha256!==sha(source)))throw new Error('Full source mismatch');
fs.mkdirSync(path.dirname(reportFile),{recursive:true});
const bundle=path.resolve(path.dirname(reportFile),'parity-consumer.mjs');
await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'node',outfile:bundle});
const {NativeProgram}=await import(pathToFileURL(bundle));
const programs=await Promise.all(artifacts.map(a=>NativeProgram.instantiate(a,source)));
const bytes=(program,index,kind)=>{const a=artifacts[index].abi;return Buffer.from(program.memory.buffer,kind==='Y'?0:a.p_offset,(kind==='Y'?a.y_count:a.p_count)*8);};
const require=(ok,message)=>{if(!ok)throw new Error(message);};
const cases=[];
const check=(name,frame,expected)=>{
 const statuses=[],outputs=[];
 for(const [index,p] of programs.entries()){
  p.reset();require(p.input('pairEnabled').length===14400,'Reduced capacity');
  for(const field of ['sourcePoint','targetPoint','pairEnabled'])p.input(field).set(frame[field]);
  p.input('activeCount')[0]=frame.activeCount;
  const original=Buffer.from(bytes(p,index,'P'));bytes(p,index,'Y').fill(0xa5);
  new Uint8Array(p.memory.buffer,artifacts[index].abi.scratch_offset,artifacts[index].abi.scratch_bytes).fill(0x5a);
  let status='SUCCESS';try{p.evaluate(1/90);}catch(error){status=error.message;}
  require(original.equals(bytes(p,index,'P')),`${name}/input mutation`);
  statuses.push(status);outputs.push(Buffer.from(bytes(p,index,'Y')));
  if(expected){require(status==='SUCCESS',`${name}/unexpected fault`);require(p.output('accepted')[0]===expected[0]&&p.output('rejectionReason')[0]===expected[1],`${name}/independent acceptance`);}
 }
 require(statuses[0]===statuses[1]&&outputs[0].equals(outputs[1]),`${name}/changed status or full Y bits`);
 cases.push({name,status:statuses[0],completeYBitsEqual:true,inputBytesImmutable:true,independentAcceptance:Boolean(expected)});
};
for(const [i,f] of fixture.frames.entries())check(`fixture-${i}`,f.registration,[f.expected.registrationAccepted,f.expected.registrationRejectionReason]);
for(const [count,reason] of [[-1,1],[0,3],[1,3],[14400.5,1],[14401,1],[NaN,1]])check(`activeCount-${count}`,{...fixture.frames[0].registration,activeCount:count},[0,reason]);
const lastInvalid=structuredClone(fixture.frames[0].registration);lastInvalid.pairEnabled[14399]=.5;
check('late invalid mask',lastInvalid,[0,2]);
check('post-rejection recovery',fixture.frames[0].registration,[1,0]);
const reloaded=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifacts[1])),source);
for(const field of ['sourcePoint','targetPoint','pairEnabled'])reloaded.input(field).set(fixture.frames[0].registration[field]);
reloaded.input('activeCount')[0]=14400;reloaded.evaluate(0);require(reloaded.output('accepted')[0]===1,'JSON reload');
let stale=false;try{await NativeProgram.instantiate(artifacts[1],source+'\n// changed');}catch{stale=true;}
require(stale,'Stale source accepted');
const report={status:'ACTUAL_SOURCE_ISSUED_MODULE_PARITY_PASS',engine:process.version,capacity:14400,sourceSha256:sha(source),fixtureSha256:sha(fixtureBytes),moduleSha256:artifacts.map(a=>a.module_sha256),artifactSha256:[baselineFile,candidateFile].map(p=>sha(fs.readFileSync(p))),cases,jsonReload:true,staleSourceRefused:true,consumerSha256:sha(fs.readFileSync('src/modelica-native-program.ts')),probeSha256:sha(fs.readFileSync(import.meta.filename)),runtimeIntegrated:false,productionPinChanged:false,scope:'Actual complete source-issued modules; bit-exact all Y/status comparison plus independent fixture acceptance. No timing, frontend, filter, sensors or full SLAM claim.'};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
