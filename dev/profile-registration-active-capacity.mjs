// Diagnostic workload scaling within one unchanged full-capacity module.
// Changing activeCount is not an optimization or a whole-pipeline speed claim.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const [artifactFile,outputDirectory]=process.argv.slice(2);
if(!artifactFile||!outputDirectory)throw new Error('ARTIFACT OUTPUT_DIRECTORY required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const artifactBytes=await readFile(artifactFile),artifact=JSON.parse(artifactBytes);
const fixtures=JSON.parse(await readFile('dev/artifacts/registration-relative-pose-filter-chain/independent-fixtures.json','utf8'));
const source=await readFile(fixtures.artifacts.registration.sourcePath,'utf8');
if(sha(source)!==artifact.source_sha256)throw new Error('Source/artifact mismatch');
await mkdir(outputDirectory,{recursive:true});
const bundle=path.resolve(outputDirectory,'consumer.mjs');
await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'node',outfile:bundle});
const {NativeProgram}=await import(pathToFileURL(bundle));
const program=await NativeProgram.instantiate(artifact,source),fixture=fixtures.frames[0].registration;
for(const name of ['sourcePoint','targetPoint','pairEnabled'])program.input(name).set(fixture[name]);
if(program.input('pairEnabled').length!==14400)throw new Error('Full14400 capacity required');
const runs=[];
for(const activeCount of [350,14400,14400,350]){
  program.input('activeCount')[0]=activeCount;
  const parameters=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8),before=sha(parameters);
  for(let i=0;i<30;i++)program.evaluate(i/90);
  if(program.output('accepted')[0]!==1||program.output('validCount')[0]!==activeCount)throw new Error('Diagnostic fixture must be accepted at both active counts');
  const times=[];
  for(let i=0;i<100;i++){
    const start=performance.now();program.evaluate(i/90);times.push(performance.now()-start);
  }
  if(sha(parameters)!==before)throw new Error('Read-only parameters mutated');
  times.sort((a,b)=>a-b);
  runs.push({activeCount,calls:100,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p50Ms:times[50],p95Ms:times[95],accepted:true,parameterBytesImmutable:true});
}
const report={status:'FULL_CAPACITY_MODULE_ACTIVE_COUNT_SCALING_DIAGNOSTIC_PASS',recordedAt:new Date().toISOString(),engine:process.version,sourceSha256:sha(source),artifactSha256:sha(artifactBytes),moduleSha256:artifact.module_sha256,capacity:14400,sourceUnchanged:true,runs,scope:'Different active counts in the same unchanged full14400 module. Input setup/warmup excluded. Both fixtures accepted; ABBA order, shared machine. Not an optimization, capacity reduction, whole-pipeline benchmark or 10x claim.'};
await writeFile(path.join(outputDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
