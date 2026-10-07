// Execute one source-issued Modelica program repeatedly, with transport and
// preparation outside the timed window. Use Node's V8 perf flags externally.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const [fixtureFile,outputDirectory,secondsArgument='10']=process.argv.slice(2);
const seconds=Number(secondsArgument);
if(!outputDirectory||!(seconds>0&&seconds<=30))throw new Error('FIXTURE OUTPUT_DIRECTORY [SECONDS:1..30] required');
fs.mkdirSync(outputDirectory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const fixtures=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
const entry=fixtures.artifacts.registration;
const overrideArtifact=process.env.RUMOCA_RUNTIME_REGISTRATION_ARTIFACT;
const artifactBytes=fs.readFileSync(overrideArtifact??entry.artifactPath);
const artifact=JSON.parse(artifactBytes.toString());
const source=fs.readFileSync(entry.sourcePath,'utf8');
if(sha(source)!==entry.sourceSha256||artifact.source_sha256!==entry.sourceSha256
  ||(!overrideArtifact&&artifact.module_sha256!==entry.moduleSha256))throw new Error('Fixture/artifact binding mismatch');
const bundleFile=path.resolve(outputDirectory,'native-runtime-consumer.mjs');
await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'node',outfile:bundleFile});
const {NativeProgram}=await import(pathToFileURL(bundleFile));
const program=await NativeProgram.instantiate(artifact,source);
const measured=fixtures.frames[0].registration;
for(const name of ['sourcePoint','targetPoint','pairEnabled'])program.input(name).set(measured[name]);
program.input('activeCount')[0]=measured.activeCount;
if(program.input('pairEnabled').length!==14400)throw new Error('Reduced workload');
const inputBytes=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8);
const before=sha(inputBytes);
for(let i=0;i<100;i++)program.evaluate(i/90);
if(program.output('accepted')[0]!==1||program.output('validCount')[0]!==14400)throw new Error('Invalid registration fixture');
console.log(JSON.stringify({phase:'measured-window-start',pid:process.pid,seconds,model:artifact.model_name}));
const times=[],start=performance.now();let calls=0;
while(performance.now()-start<seconds*1000){
  const callStart=performance.now();program.evaluate(++calls/90);times.push(performance.now()-callStart);
}
const elapsedMs=performance.now()-start;
if(sha(inputBytes)!==before)throw new Error('WASM mutated input bytes');
if(program.output('accepted')[0]!==1)throw new Error('Registration stopped accepting');
const sorted=[...times].sort((a,b)=>a-b);
fs.writeFileSync(path.join(outputDirectory,'registration.wasm'),new Uint8Array(artifact.module_bytes));
const report={status:'ACTUAL_SOURCE_ISSUED_REGISTRATION_RUNTIME_PROFILE_COMPLETE',recordedAt:new Date().toISOString(),
  engine:process.version,pid:process.pid,calls,elapsedMs,meanExecutionMs:times.reduce((a,b)=>a+b,0)/times.length,
  p50ExecutionMs:sorted[Math.floor(sorted.length*.5)],p95ExecutionMs:sorted[Math.floor(sorted.length*.95)],
  inputBytesImmutable:true,capacity:14400,sourceSha256:sha(source),artifactSha256:sha(artifactBytes),
  moduleSha256:artifact.module_sha256,compiler:artifact.compiler,moduleBytes:artifact.module_bytes.length,
  consumerSha256:sha(fs.readFileSync('src/modelica-native-program.ts')),bundleSha256:sha(fs.readFileSync(bundleFile)),
  mathImports:artifact.math_imports,abi:artifact.abi,runtimeIntegrated:false,fullSlam:false,
  scope:'Complete unchanged full14400 registration module, fixed measured inputs,100warmcalls. Timed window excludes compilation, input copies, sensors, descriptors, filter and rendering. Node perf instrumentation can affect latency.'};
fs.writeFileSync(path.join(outputDirectory,'runtime.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
