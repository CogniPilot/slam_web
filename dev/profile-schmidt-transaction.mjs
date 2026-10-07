import {modelicaSourcePath} from '../src/modelica-source-locations.mjs';
// Profile the actual source-issued complete 15+6 transaction, without sensors.
// Usage: node dev/profile-schmidt-transaction.mjs ARTIFACT FIXTURES OUTPUT_DIRECTORY [profile]
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const [artifactFile,fixtureFile,outputDirectory,mode='timing']=process.argv.slice(2);
if(!outputDirectory||!['timing','profile'].includes(mode))throw Error('Expected ARTIFACT FIXTURES OUTPUT_DIRECTORY [profile]');
fs.mkdirSync(outputDirectory,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceNames=['RGBDRelativePose','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection',
  'ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SchmidtReferenceState'];
const baselineSource=sourceNames.map(name=>fs.readFileSync(modelicaSourcePath(name),'utf8')).join('');
const source=process.env.RUMOCA_TRANSACTION_PROFILE_SOURCE
  ?fs.readFileSync(process.env.RUMOCA_TRANSACTION_PROFILE_SOURCE,'utf8'):baselineSource;
const artifactBytes=fs.readFileSync(artifactFile),fixtureBytes=fs.readFileSync(fixtureFile);
const artifact=JSON.parse(artifactBytes),fixtures=JSON.parse(fixtureBytes);
if(artifact.model_name!=='ES15SchmidtReferenceStep'||artifact.source_sha256!==sha(source)
  ||fixtures.sourceSha256!==sha(baselineSource)||fixtures.augmentedDimension!==21
  ||sha(new Uint8Array(artifact.module_bytes))!==artifact.module_sha256)
  throw Error('Source/artifact/full21 fixtures mismatch');
const consumerFile=path.join(outputDirectory,'consumer.mjs');
await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},
  bundle:true,format:'esm',platform:'node',outfile:consumerFile});
const {NativeProgram}=await import(pathToFileURL(path.resolve(consumerFile)));
const program=await NativeProgram.instantiate(artifact,source);
const decode=value=>typeof value==='number'?value:Number(value);
const flatten=value=>(Array.isArray(value)?value.flat(Infinity):[value]).map(decode);
const cases=fixtures.groups.ES15SchmidtReferenceStep.map(fixture=>({...fixture,
  inputs:Object.fromEntries(Object.entries(fixture.inputs).map(([name,value])=>[name,flatten(value)])),
  expected:Object.fromEntries(Object.entries(fixture.expected).map(([name,value])=>[name,
    {values:flatten(value.values),tolerance:value.tolerance}]))}));
const fields=['position','velocity','rotation','accelBias','gyroBias','covariance','crossCovariance',
  'referenceCovariance','referencePosition','referenceRotation','referenceAvailable','referenceEpoch','referenceUsed','lastUsedEpoch'];
const carry=fields.map(name=>[program.input(name),program.output(`next${name[0].toUpperCase()}${name.slice(1)}`)]);
const put=inputs=>{program.reset();for(const [name,values] of Object.entries(inputs))program.input(name).set(values.map(decode));};
let checks=0,maximumError=0;
for(const fixture of cases){
  put(fixture.inputs);program.evaluate(0);
  for(const [name,expected] of Object.entries(fixture.expected)){
    const actual=program.output(name);if(actual.length!==expected.values.length)throw Error(`${fixture.label}: ${name} shape`);
    for(let cell=0;cell<actual.length;cell++){
      const error=Math.abs(actual[cell]-expected.values[cell]);
      if(!Number.isFinite(error)||error>expected.tolerance)throw Error(`${fixture.label}: ${name}[${cell}] differs`);
      maximumError=Math.max(maximumError,error);checks++;
    }
  }
}
const accepted=program.output('predictionAccepted'),available=program.output('nextReferenceAvailable');
const currentEpoch=program.input('currentEpoch');
let time=0,epoch=1;
function startTrajectory(){
  put(cases[2].inputs);time=cases[2].inputs.h[0];program.evaluate(time);
  if(accepted[0]!==1||available[0]!==1)throw Error('Reference capture failed');
  for(const [input,output] of carry)input.set(output);
  program.input('measurementEnabled')[0]=0;program.input('captureRequested')[0]=0;epoch=1;
}
function step(){
  time+=program.input('h')[0];currentEpoch[0]=epoch++;
  program.evaluate(time);
  if(accepted[0]!==1||available[0]!==1)throw Error('Persistent prediction rejected');
  for(const [input,output] of carry)input.set(output);
}
startTrajectory();for(let i=0;i<300;i++)step();
const blocks=[];
if(mode==='profile'){
  // Continuous real state, bounded to 1200 predictions per fresh reference.
  // The mode deliberately excludes JSON loading/module construction from its
  // declared hot window. Perf still records the whole process for audit.
  const start=performance.now();let steps=0;
  console.log(JSON.stringify({phase:'hot-start',timeMs:start,monotonicNs:process.hrtime.bigint().toString(),pid:process.pid}));
  do{startTrajectory();for(let i=0;i<1200;i++){step();steps++;}}
  while(performance.now()-start<10000);
  blocks.push({steps,elapsedMs:performance.now()-start});
  console.log(JSON.stringify({phase:'hot-end',timeMs:performance.now(),monotonicNs:process.hrtime.bigint().toString(),steps}));
}else{
  for(let block=0;block<12;block++){
    startTrajectory();const start=performance.now();for(let i=0;i<600;i++)step();
    blocks.push({steps:600,elapsedMs:performance.now()-start});
  }
}
const perStep=blocks.map(block=>block.elapsedMs/block.steps).sort((a,b)=>a-b);
const report={schemaVersion:1,status:'FULL21_ACTUAL_CONTINUOUS_TRANSACTION_PROFILE_INPUT_PASS',mode,
  engine:`Node ${process.version} / V8 ${process.versions.v8}`,sourceSha256:sha(source),
  artifactSha256:sha(artifactBytes),moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,
  fixtureSha256:sha(fixtureBytes),fixtureSourceSha256:fixtures.sourceSha256,
  sourceEdited:source!==baselineSource,consumerSha256:sha(fs.readFileSync(consumerFile)),
  correctness:{fixtureCases:cases.length,checks,maximumError,carriedCellsPerStep:carry.reduce((sum,[a])=>sum+a.length,0)},
  blocks,medianStepMs:perStep[Math.floor(perStep.length/2)],
  scope:'Isolated actual complete Modelica transaction plus output-to-next-input copies on one Node/V8 CPU. Continuous prediction with a frozen correlated reference. No image generation, visual frontend, selection, mapping, viewer, browser or whole-simulation throughput claim.'};
fs.writeFileSync(path.join(outputDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
