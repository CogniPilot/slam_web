// Measure the already qualified full-size detector; this is not a SLAM benchmark.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {build} from 'esbuild';

const [artifactFile,fixtureFile,directory]=process.argv.slice(2);
if(!directory)throw Error('Expected ARTIFACT FIXTURES OUTPUT_DIRECTORY');
fs.mkdirSync(directory,{recursive:true});
const consumer=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',write:false});
const consumerFile=path.resolve(directory,'consumer.mjs');
fs.writeFileSync(consumerFile,consumer.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(consumerFile));
const source=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo','utf8');
const artifact=JSON.parse(fs.readFileSync(artifactFile));
const fixtures=JSON.parse(fs.readFileSync(fixtureFile));
if(artifact.model_name!=='FastNativeFrame'||fixtures.sourceSha256!==artifact.source_sha256
  ||fixtures.height!==90||fixtures.width!==160||fixtures.frames.length!==4)throw Error('Full original detector/fixture mismatch');
const frames=fixtures.frames.map(frame=>Float64Array.from(frame.rgb));
const start=performance.now();
const program=await NativeProgram.instantiate(artifact,source);
const instantiateMs=performance.now()-start;
const input=program.input('rgb');
if(input.length!==90*160*4)throw Error('Wrong input dimensions');
for(let i=0;i<20;i++){input.set(frames[i%4]);program.evaluate(i/90);}
const count=Number(process.env.RUMOCA_BENCH_ITERATIONS??200),compute=[],copyAndCompute=[];
if(!Number.isSafeInteger(count)||count<64||count>10000)throw Error('Benchmark iterations must be64..10000');
for(let i=0;i<count;i++){
  let time=performance.now();program.evaluate((i+20)/90);compute.push(performance.now()-time);
  time=performance.now();input.set(frames[i%4]);program.evaluate((i+count+20)/90);copyAndCompute.push(performance.now()-time);
}
const stats=times=>{
  const sorted=[...times].sort((a,b)=>a-b);
  return {count,meanMs:times.reduce((sum,value)=>sum+value,0)/count,
    medianMs:sorted[count/2],p95Ms:sorted[Math.floor(count*.95)],maximumMs:sorted[count-1]};
};
const report={status:'MEASURED',engine:`${process.version} / V8 ${process.versions.v8}`,
  sourceSha256:artifact.source_sha256,moduleSha256:artifact.module_sha256,
  instantiateMs,memoryBytes:program.memory.buffer.byteLength,
  compute:stats(compute),copyAndCompute:stats(copyAndCompute),
  scope:'Single full original160x90 FAST detector in native SolveIR WASM, twenty warmup evaluations and the reported sample count with four existing finite frames. Copy includes typed F64 input set; GPU readback, rendering, other sensors, selection, localization, map and loops are excluded. Node measurement does not establish browser or end-to-end throughput.'};
fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
