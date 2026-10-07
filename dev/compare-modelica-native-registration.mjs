// Alternating uninstrumented comparison of two compiler-issued modules for
// exactly the same full14400 source and measured input. No sensor/render timings.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
const [fixtureFile,baselineFile,candidateFile,reportFile]=process.argv.slice(2);
if(!reportFile)throw new Error('FIXTURE BASELINE_ARTIFACT CANDIDATE_ARTIFACT REPORT required');
const sha=value=>createHash('sha256').update(value).digest('hex');
const fixtureBytes=fs.readFileSync(fixtureFile),fixtures=JSON.parse(fixtureBytes.toString());
const source=fs.readFileSync(fixtures.artifacts.registration.sourcePath,'utf8');
const artifacts=[baselineFile,candidateFile].map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
if(artifacts.some(a=>a.source_sha256!==sha(source)))throw new Error('Comparison requires identical Modelica source');
fs.mkdirSync(path.dirname(reportFile),{recursive:true});
const bundleFile=path.resolve(path.dirname(reportFile),'compare-consumer.mjs');
await build({entryPoints:['src/modelica-native-program.ts'],bundle:true,format:'esm',platform:'node',outfile:bundleFile});
const {NativeProgram}=await import(pathToFileURL(bundleFile));
const programs=await Promise.all(artifacts.map(a=>NativeProgram.instantiate(a,source)));
const measured=fixtures.frames[0].registration;
for(const program of programs){
  if(program.input('pairEnabled').length!==14400)throw new Error('Reduced workload');
  for(const name of ['sourcePoint','targetPoint','pairEnabled'])program.input(name).set(measured[name]);
  program.input('activeCount')[0]=measured.activeCount;
}
const inputHash=i=>sha(new Uint8Array(programs[i].memory.buffer,artifacts[i].abi.p_offset,artifacts[i].abi.p_count*8));
const before=programs.map((_,i)=>inputHash(i));let tick=0;
for(let j=0;j<100;j++)for(const program of programs)program.evaluate(++tick/90);
const check=()=>{
  for(const name of Object.keys(artifacts[0].var_layout.bindings).filter(name=>artifacts[0].var_layout.bindings[name].Y)){
    const views=programs.map(p=>p.output(name));
    const bytes=views.map(v=>Buffer.from(v.buffer,v.byteOffset,v.byteLength));
    if(!bytes[0].equals(bytes[1]))throw new Error(`Changed output bits: ${name}`);
  }
  for(let i=0;i<2;i++)if(programs[i].output('accepted')[0]!==1||inputHash(i)!==before[i])throw new Error('Invalid output/input mutation');
};
check();const blocks=[];
for(let round=0;round<6;round++){
  for(const candidate of round%2?[1,0]:[0,1]){
    const start=performance.now();
    for(let j=0;j<100;j++)programs[candidate].evaluate(++tick/90);
    blocks.push({round,candidate,calls:100,meanExecutionMs:(performance.now()-start)/100});
  }
  check();
}
const means=[0,1].map(i=>blocks.filter(b=>b.candidate===i).reduce((sum,b)=>sum+b.meanExecutionMs,0)/6);
const report={status:'UNINSTRUMENTED_ALTERNATING_FULL14400_REGISTRATION_COMPARISON_PASS',recordedAt:new Date().toISOString(),
  engine:process.version,sourceSha256:sha(source),fixtureSha256:sha(fixtureBytes),moduleSha256:artifacts.map(a=>a.module_sha256),
  artifactSha256:[baselineFile,candidateFile].map(file=>sha(fs.readFileSync(file))),moduleBytes:artifacts.map(a=>a.module_bytes.length),
  warmCallsPerModule:100,blocks,baselineMeanExecutionMs:means[0],candidateMeanExecutionMs:means[1],speedup:means[0]/means[1],
  everyOutputBitsEqual:true,inputBytesImmutable:true,capacity:14400,
  probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerSha256:sha(fs.readFileSync('src/modelica-native-program.ts')),
  scope:'Uninstrumented alternating sixblocks per module,100calls/block, identical full14400 source/inputs. Excludes preparation, input copies, sensors, feature matching, filter and rendering.',
  productionPinChanged:false,runtimeIntegrated:false,fullSlam:false};
fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
