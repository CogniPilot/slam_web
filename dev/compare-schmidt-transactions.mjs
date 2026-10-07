// Interleaved comparison of two source-issued complete21 transactions.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const [baseSourceFile,baseArtifactFile,candidateSourceFile,candidateArtifactFile,fixtureFile,directory]=process.argv.slice(2);
if(!directory)throw Error('Expected BASE_SOURCE BASE_ARTIFACT CANDIDATE_SOURCE CANDIDATE_ARTIFACT FIXTURES OUTPUT_DIRECTORY');
fs.mkdirSync(directory,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceBytes=[baseSourceFile,candidateSourceFile].map(file=>fs.readFileSync(file));
const artifactBytes=[baseArtifactFile,candidateArtifactFile].map(file=>fs.readFileSync(file));
const sources=sourceBytes.map(b=>b.toString()),artifacts=artifactBytes.map(b=>JSON.parse(b));
const fixtureBytes=fs.readFileSync(fixtureFile),fixture=JSON.parse(fixtureBytes),cases=fixture.groups.ES15SchmidtReferenceStep;
if(fixture.sourceSha256!==sha(sourceBytes[0])||fixture.augmentedDimension!==21||cases.length!==20)throw Error('Independent full21 baseline mismatch');
for(let i=0;i<2;i++)if(artifacts[i].model_name!=='ES15SchmidtReferenceStep'||artifacts[i].source_sha256!==sha(sourceBytes[i])
 ||sha(Buffer.from(artifacts[i].module_bytes))!==artifacts[i].module_sha256)throw Error('Source/module identity mismatch');
const consumerFile=path.join(directory,'consumer.mjs');
await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'node',outfile:consumerFile});
const {NativeProgram}=await import(pathToFileURL(path.resolve(consumerFile)));
const names=['position','velocity','rotation','accelBias','gyroBias','covariance','crossCovariance','referenceCovariance','referencePosition','referenceRotation','referenceAvailable','referenceEpoch','referenceUsed','lastUsedEpoch'];
const sessions=[];
for(let variant=0;variant<2;variant++){
 const p=await NativeProgram.instantiate(artifacts[variant],sources[variant]);let checks=0,maximumError=0;
 const put=x=>{p.reset();for(const [name,values]of Object.entries(x))p.input(name).set(values);};
 for(const c of cases){put(c.inputs);p.evaluate(0);for(const [name,e]of Object.entries(c.expected)){
  const a=p.output(name);if(a.length!==e.values.length)throw Error('Output shape mismatch');
  for(let j=0;j<a.length;j++){const error=Math.abs(a[j]-e.values[j]);if(!Number.isFinite(error)||error>e.tolerance)throw Error(`${variant}/${c.label}/${name}/${j}`);checks++;maximumError=Math.max(maximumError,error);}
 }}
 const carry=names.map(name=>[p.input(name),p.output('next'+name[0].toUpperCase()+name.slice(1))]);
 const accepted=p.output('predictionAccepted'),available=p.output('nextReferenceAvailable'),epoch=p.input('currentEpoch');let time=0,sequence=0;
 const step=()=>{time+=p.input('h')[0];epoch[0]=++sequence;p.evaluate(time);if(accepted[0]!==1||available[0]!==1)throw Error('Persistent prediction refused');for(const [a,b]of carry)a.set(b);};
 const start=()=>{put(cases[2].inputs);time=cases[2].inputs.h[0];sequence=0;p.evaluate(time);if(accepted[0]!==1||available[0]!==1)throw Error('Reference capture refused');for(const [a,b]of carry)a.set(b);p.input('measurementEnabled')[0]=0;p.input('captureRequested')[0]=0;};
 sessions.push({start,step,correctness:{cases:cases.length,checks,maximumError,carriedCells:carry.reduce((n,[a])=>n+a.length,0)}});
}
// Both modules receive the same real-state warmup before interleaving.
for(const s of sessions){s.start();for(let j=0;j<1000;j++)s.step();}
const blocks=[];
for(let cycle=0;cycle<6;cycle++)for(const variant of [0,1,1,0]){
 const s=sessions[variant];s.start();const begin=performance.now();for(let j=0;j<600;j++)s.step();
 blocks.push({cycle,variant,steps:600,elapsedMs:performance.now()-begin});
}
const median=a=>{const sorted=[...a].sort((x,y)=>x-y);return (sorted[(sorted.length-1)>>1]+sorted[sorted.length>>1])/2;};
const medians=[0,1].map(v=>median(blocks.filter(b=>b.variant===v).map(b=>b.elapsedMs/b.steps)));
const cycles=Array.from({length:6},(_,cycle)=>{const ms=[0,1].map(v=>blocks.filter(b=>b.cycle===cycle&&b.variant===v).reduce((n,b)=>n+b.elapsedMs,0)/1200);return {cycle,baselineStepMs:ms[0],candidateStepMs:ms[1],ratio:ms[0]/ms[1]};});
const report={schemaVersion:1,status:'FULL21_MATCHED_ABBA_SOURCE_ISSUED_COMPARISON_PASS',engine:`${process.version} / V8 ${process.versions.v8}`,
 variants:artifacts.map((a,i)=>({sourceSha256:sha(sourceBytes[i]),artifactSha256:sha(artifactBytes[i]),moduleSha256:a.module_sha256,moduleBytes:a.module_bytes.length,correctness:sessions[i].correctness})),
 fixtureSha256:sha(fixtureBytes),probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerSha256:sha(fs.readFileSync(consumerFile)),
 warmupStepsPerVariant:1000,order:'ABBA',blocks,cycles,medianStepMs:medians,ratioOfMedians:medians[0]/medians[1],medianCycleRatio:median(cycles.map(c=>c.ratio)),
 scope:'Two complete Modelica21-state transactions in one Node/V8 process on one CPU, identical independently checked inputs, continuous actual returned388-cell state, six interleaved ABBA cycles. Excludes sensors, visual frontend, selection, mapping, viewer and browser. No whole-simulation10x claim; no automatic production promotion.'};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,medianStepMs:medians,medianCycleRatio:report.medianCycleRatio,cycles}));
