// Instrumented counts only. Timings must come from the original executable.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {observeWasmCopies} from './wasm-copy-observer.mjs';

const [artifactPath,sourcePath,directory] = process.argv.slice(2);
if (!directory) throw Error('ARTIFACT SOURCE DIRECTORY required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function bundled(entry) {
  const result = await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled('src/modelica-native-program.ts');
const {realFields,robustCases,certifyRobustResult} = await bundled('tests/compiler-probes/rgbd-robust-registration-fixtures.ts');
const bytes = fs.readFileSync(artifactPath), artifact = JSON.parse(bytes), source = fs.readFileSync(sourcePath,'utf8');
const original = Uint8Array.from(artifact.module_bytes), program = await NativeProgram.instantiate(artifact,source);
if (artifact.abi.y_count !== 377 || program.input('sourceCovariance').length !== 350*9) throw Error('Full350 covariance required');
const {originalWat,observedWat,observed,sites,functions} = await observeWasmCopies(original);
fs.mkdirSync(directory,{recursive:true});
for (const [name,data] of [['module.wat',originalWat],['observed.wat',observedWat],['observed.wasm',observed]])
  fs.writeFileSync(path.join(directory,name),data);
const cases = robustCases(), results = [], a = artifact.abi;
for (const test of [cases[1],cases[3],cases.find(c => c.name === 'empty input domain'),
  cases.find(c => c.name === 'typed zero hypothesis budget')]) {
  program.reset();
  for (const field of realFields) program.input(field).set([test.fixture[field]].flat(3));
  program.integerInput('maximumHypotheses')[0] = BigInt(test.fixture.maximumHypotheses);
  program.booleanInput('useCovariance')[0] = +test.fixture.useCovariance;
  const memory = new WebAssembly.Memory({initial:a.memory_pages,maximum:a.memory_pages});
  new Uint8Array(memory.buffer).set(new Uint8Array(program.memory.buffer));
  const before = [Buffer.from(new Uint8Array(memory.buffer,a.p_offset,a.p_count*8)),
    Buffer.from(new Uint8Array(memory.buffer,a.input_lanes_offset,a.input_lanes_bytes))];
  const calls = Array(sites.length).fill(0),copied = Array(sites.length).fill(0),entries = {};
  const env = {memory}; for (const name of artifact.math_imports) env[name] = Math[name];
  const {instance} = await WebAssembly.instantiate(observed,{env,diag:{
    copy:(id,size) => {calls[id]++;copied[id] += size >>> 0;},
    enter:id => {entries[id] = (entries[id] ?? 0)+1;},
  }});
  program.evaluate(0); certifyRobustResult(test.fixture,field => program.output(field));
  const status = instance.exports.eval_assignments(a.y_offset,a.p_offset,0,a.scratch_offset,a.typed_lanes_offset);
  if (status !== 0 || !Buffer.from(memory.buffer,a.y_offset,a.y_count*8)
    .equals(Buffer.from(program.memory.buffer,a.y_offset,a.y_count*8))) throw Error('Output/status bits changed');
  for (const buffer of [memory.buffer,program.memory.buffer])
    if (!Buffer.from(buffer,a.p_offset,a.p_count*8).equals(before[0])
      || !Buffer.from(buffer,a.input_lanes_offset,a.input_lanes_bytes).equals(before[1])) throw Error('Input mutation');
  const result = {name:test.name,status,outputBitsEqual:true,readonlyRealAndTypedInputs:true,functionEntries:entries,
    copyCalls:calls.reduce((a,b) => a+b,0),logicalCopiedBytes:copied.reduce((a,b) => a+b,0),
    sites:sites.map((site,i) => ({...site,calls:calls[i],logicalCopiedBytes:copied[i]}))};
  results.push(result);console.log(JSON.stringify({name:test.name,copyCalls:result.copyCalls,logicalCopiedBytes:result.logicalCopiedBytes}));
}
if (fs.readFileSync(sourcePath,'utf8') !== source) throw Error('Source changed');
const report = {status:'OBSERVED_ROBUST_COPY_COUNTS_WITH_ORIGINAL_BIT_PARITY',recordedAt:new Date().toISOString(),
  sourceSha256:sha(source),artifactSha256:sha(bytes),originalModuleSha256:sha(original),diagnosticModuleSha256:sha(observed),
  harnessSha256:sha(fs.readFileSync(import.meta.filename)),observerSha256:sha(fs.readFileSync('dev/wasm-copy-observer.mjs')),
  functions,results,fullSlamAccepted:false,productionPinChanged:false,
  scope:'Original calls/copies retained, all output bits and real/typed input bytes compared. Logical bytes are not DRAM traffic or timing.'};
fs.writeFileSync(path.join(directory,'copy-counts.json'),JSON.stringify(report,null,2)+'\n');
