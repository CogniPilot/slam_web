// Profile the unchanged compiler executable after independent numerical checks.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const [artifactPath, sourcePath, reportPath] = process.argv.slice(2);
if (!reportPath) throw Error('ARTIFACT SOURCE REPORT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function bundled(entry) {
  const result = await build({entryPoints:[entry], bundle:true, platform:'node', format:'esm', write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled('src/modelica-native-program.ts');
const {realFields, robustCases, certifyRobustResult} = await bundled('tests/compiler-probes/rgbd-robust-registration-fixtures.ts');
const source = fs.readFileSync(sourcePath,'utf8'), bytes = fs.readFileSync(artifactPath), artifact = JSON.parse(bytes);
const proofSources = ['src/modelica-native-program.ts','tests/compiler-probes/rgbd-robust-registration-fixtures.ts',
  'tests/compiler-probes/rgbd-registration-uncertainty-fixtures.ts',import.meta.filename];
const sourceDigests = Object.fromEntries(proofSources.map(file => [file,sha(fs.readFileSync(file))]));
const program = await NativeProgram.instantiate(artifact,source);
if (artifact.abi.y_count !== 377 || program.input('sourcePoint').length !== 350*3) throw Error('Full350 required');
const inputs = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count*8);
const typed = new Uint8Array(program.memory.buffer, artifact.abi.input_lanes_offset, artifact.abi.input_lanes_bytes);
const outputs = new Uint8Array(program.memory.buffer, artifact.abi.y_offset, artifact.abi.y_count*8);
const cases = robustCases(), measurements = []; let tick = 0;
const load = fixture => {
  for (const field of realFields) program.input(field).set([fixture[field]].flat(3));
  program.integerInput('maximumHypotheses')[0] = BigInt(fixture.maximumHypotheses);
  program.booleanInput('useCovariance')[0] = +fixture.useCovariance;
};
for (const test of [cases[1], cases[3], cases.find(c => c.name === 'empty input domain'),
  cases.find(c => c.name === 'typed zero hypothesis budget')]) {
  load(test.fixture); program.evaluate(tick++/90); certifyRobustResult(test.fixture, field => program.output(field));
  const before = [Buffer.from(inputs), Buffer.from(typed), Buffer.from(outputs)], times = [];
  for (let i = 0; i < 3; i++) program.evaluate(tick++/90);
  for (let i = 0; i < 20; i++) {const start = performance.now(); program.evaluate(tick++/90); times.push(performance.now()-start);}
  if (![inputs,typed,outputs].every((view,i) => Buffer.from(view).equals(before[i]))) throw Error('Input/output bits changed');
  measurements.push({name:test.name, timesMs:times, medianMs:[...times].sort((a,b) => a-b)[10]});
  console.log(JSON.stringify({name:test.name, medianMs:measurements.at(-1).medianMs}));
}
load(cases[3].fixture); program.evaluate(tick++/90); certifyRobustResult(cases[3].fixture, field => program.output(field));
const before = [Buffer.from(inputs),Buffer.from(typed),Buffer.from(outputs)];
const ready = reportPath+'.ready.json'; fs.mkdirSync(path.dirname(reportPath),{recursive:true});
const monotonicStartSeconds = Number(process.hrtime.bigint())/1e9;
fs.writeFileSync(ready,JSON.stringify({pid:process.pid,phase:'evaluate-only',minimumSeconds:30,monotonicStartSeconds})+'\n');
console.log(JSON.stringify({phase:'evaluate-only',pid:process.pid}));
const start = performance.now(); let evaluations = 0;
try {while (performance.now()-start < 30000) {program.evaluate(tick++/90); evaluations++;}}
finally {fs.rmSync(ready);}
const elapsedMs = performance.now()-start, monotonicEndSeconds = Number(process.hrtime.bigint())/1e9;
if (![inputs,typed,outputs].every((view,i) => Buffer.from(view).equals(before[i]))) throw Error('Profile bits changed');
if (fs.readFileSync(sourcePath,'utf8') !== source) throw Error('Source changed');
for (const file of proofSources) if (sha(fs.readFileSync(file)) !== sourceDigests[file]) throw Error('Probe source changed');
const report = {status:'ACTUAL_FULL350_ROBUST_PERFORMANCE_CHECKED', recordedAt:new Date().toISOString(),
  pid:process.pid,sourceDigests,
  sourceSha256:sha(source), artifactSha256:sha(bytes), moduleSha256:artifact.module_sha256,
  compiler:artifact.compiler, measurements, profile:{evaluations,elapsedMs,millisecondsPerEvaluation:elapsedMs/evaluations,
    monotonicStartSeconds,monotonicEndSeconds},
  readonlyRealAndTypedInputs:true,repeatedOutputBitsEqual:true,
  harnessSha256:sha(fs.readFileSync(import.meta.filename)),productionPinChanged:false,fullSlamAccepted:false,
  scope:'Actual robust registration WASM only; excludes compilation, input transfer, oracle, sensors and full SLAM.'};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report.profile));
