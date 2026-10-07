// Profile the original executable, or count retained copies with bit parity.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {observeWasmCopies} from './wasm-copy-observer.mjs';

const [mode,artifactPath,sourcePath,directory] = process.argv.slice(2);
if (!directory || !['copies','performance'].includes(mode)) throw Error('copies|performance ARTIFACT SOURCE DIRECTORY required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const proofSources = ['src/modelica-native-program.ts','tests/compiler-probes/pose-graph-run-fixtures.ts',
  'tests/compiler-probes/pose-graph-fixtures.ts','dev/wasm-copy-observer.mjs',import.meta.filename];
const sourceDigests = Object.fromEntries(proofSources.map(file => [file,sha(fs.readFileSync(file))]));
async function bundled(entry) {
  const result = await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled(proofSources[0]);
const {runCases,loadRun,certifyRun} = await bundled(proofSources[1]);
const bytes = fs.readFileSync(artifactPath), artifact = JSON.parse(bytes), source = fs.readFileSync(sourcePath,'utf8');
if (artifact.model_name !== 'PoseGraphRunStorage') throw Error('Wrong Modelica root');
const original = Uint8Array.from(artifact.module_bytes), program = await NativeProgram.instantiate(artifact,source);
const a = artifact.abi, cases = runCases(), selected = [cases[0],cases[2],cases[4]], results = [];
const real = new Uint8Array(program.memory.buffer,a.p_offset,a.p_count*8);
const typed = new Uint8Array(program.memory.buffer,a.input_lanes_offset,a.input_lanes_bytes);
const output = new Uint8Array(program.memory.buffer,a.y_offset,a.y_count*8);
fs.mkdirSync(directory,{recursive:true});
let details;
if (mode === 'copies') {
  const {originalWat,observedWat,observed,sites,functions} = await observeWasmCopies(original);
  for (const [name,data] of [['module.wat',originalWat],['observed.wat',observedWat],['observed.wasm',observed]])
    fs.writeFileSync(path.join(directory,name),data);
  for (const test of selected) {
    program.reset(); loadRun(program,test);
    const memory = new WebAssembly.Memory({initial:a.memory_pages,maximum:a.memory_pages});
    new Uint8Array(memory.buffer).set(new Uint8Array(program.memory.buffer));
    const before = [Buffer.from(real),Buffer.from(typed)];
    const calls = Array(sites.length).fill(0), copied = Array(sites.length).fill(0), entries = {};
    const env = {memory}; for (const name of artifact.math_imports) env[name] = Math[name];
    const {instance} = await WebAssembly.instantiate(observed,{env,diag:{
      copy:(id,size) => {calls[id]++; copied[id] += size >>> 0;},
      enter:id => {entries[id] = (entries[id] ?? 0)+1;},
    }});
    program.evaluate(0); certifyRun(test,name => program.output(name));
    const status = instance.exports.eval_assignments(a.y_offset,a.p_offset,0,a.scratch_offset,a.typed_lanes_offset);
    if (status !== 0 || !Buffer.from(memory.buffer,a.y_offset,a.y_count*8).equals(Buffer.from(output)))
      throw Error('Output/status bits changed');
    for (const buffer of [program.memory.buffer,memory.buffer])
      if (!Buffer.from(buffer,a.p_offset,a.p_count*8).equals(before[0])
        || !Buffer.from(buffer,a.input_lanes_offset,a.input_lanes_bytes).equals(before[1])) throw Error('Input mutation');
    const result = {name:test.name,status,outputBitsEqual:true,readonlyRealAndTypedInputs:true,functionEntries:entries,
      copyCalls:calls.reduce((a,b) => a+b,0),logicalCopiedBytes:copied.reduce((a,b) => a+b,0),
      sites:sites.map((site,i) => ({...site,calls:calls[i],logicalCopiedBytes:copied[i]}))};
    results.push(result); console.log(JSON.stringify({name:test.name,copyCalls:result.copyCalls,logicalCopiedBytes:result.logicalCopiedBytes}));
  }
  details = {functions,diagnosticModuleSha256:sha(observed),
    scope:'Retained original calls/copies; all output bits and real/typed input bytes compared. Logical bytes are not DRAM traffic or timings.'};
} else {
  for (const test of selected) {
    loadRun(program,test); program.evaluate(0); certifyRun(test,name => program.output(name));
    const before = [Buffer.from(real),Buffer.from(typed),Buffer.from(output)], times = [];
    for (let i=0; i<2; i++) program.evaluate(0);
    for (let i=0; i<5; i++) {const start = performance.now(); program.evaluate(0); times.push(performance.now()-start);}
    if (![real,typed,output].every((view,i) => Buffer.from(view).equals(before[i]))) throw Error('Repeated input/output bits changed');
    results.push({name:test.name,timesMs:times,medianMs:[...times].sort((a,b) => a-b)[2]});
    console.log(JSON.stringify(results.at(-1)));
  }
  loadRun(program,cases[2]); program.evaluate(0); certifyRun(cases[2],name => program.output(name));
  const before = [Buffer.from(real),Buffer.from(typed),Buffer.from(output)], ready = path.join(directory,'performance.ready.json');
  const monotonicStartSeconds = Number(process.hrtime.bigint())/1e9;
  fs.writeFileSync(ready,JSON.stringify({pid:process.pid,phase:'evaluate-only',minimumSeconds:30,monotonicStartSeconds})+'\n');
  const start = performance.now(); let evaluations = 0;
  try {while (performance.now()-start < 30000) {program.evaluate(0); evaluations++;}}
  finally {fs.rmSync(ready);}
  const elapsedMs = performance.now()-start, monotonicEndSeconds = Number(process.hrtime.bigint())/1e9;
  if (![real,typed,output].every((view,i) => Buffer.from(view).equals(before[i]))) throw Error('Profile input/output bits changed');
  details = {pid:process.pid,profile:{evaluations,elapsedMs,millisecondsPerEvaluation:elapsedMs/evaluations,
    monotonicStartSeconds,monotonicEndSeconds},readonlyRealAndTypedInputs:true,repeatedOutputBitsEqual:true,
    scope:'Original production PGRun executable; evaluation only. Excludes loading, oracle, sensors and complete optimizer validation/publication.'};
}
if (fs.readFileSync(sourcePath,'utf8') !== source) throw Error('Source changed');
for (const file of proofSources) if (sha(fs.readFileSync(file)) !== sourceDigests[file]) throw Error('Probe source changed');
const report = {mode,recordedAt:new Date().toISOString(),sourceSha256:sha(source),artifactSha256:sha(bytes),
  moduleSha256:sha(original),compiler:artifact.compiler,sourceDigests,results,...details,
  fullSlamAccepted:false,productionPinChanged:false};
fs.writeFileSync(path.join(directory,mode+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({mode,profile:details.profile}));
