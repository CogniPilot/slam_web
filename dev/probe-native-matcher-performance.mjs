// Diagnostic only: run the issued matcher without changing its source or module.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const [artifactPath, sourcePath, reportPath] = process.argv.slice(2);
if (!reportPath) throw Error('ARTIFACT SOURCE REPORT required');
const profileOnly = process.argv[5] === '--profile-only';
if (process.argv.length > 5 && !profileOnly) throw Error('Unknown option');
const sha = value => createHash('sha256').update(value).digest('hex');
async function bundled(entry) {
  const result = await build({entryPoints:[entry], bundle:true, platform:'node', format:'esm', write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled('src/modelica-native-program.ts');
const {fullMatchingFixture, matchingOracle} = await bundled('tests/compiler-probes/rgbd-feature-matching-fixtures.ts');
const source = fs.readFileSync(sourcePath, 'utf8'), bytes = fs.readFileSync(artifactPath);
const artifact = JSON.parse(bytes);
const program = await NativeProgram.instantiate(artifact, source);
for (const name of ['referenceDescriptor', 'currentDescriptor']) {
  if (artifact.var_layout.shapes[name].join(',') !== '350,49') throw Error('Full matcher required');
}
const inputs = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count * 8);
const outputs = new Uint8Array(program.memory.buffer, artifact.abi.y_offset, artifact.abi.y_count * 8);
const cases = [], baseline = fullMatchingFixture();
let tick = 0;
for (const kind of profileOnly ? ['dense'] : ['dense', 'sparse', 'empty', 'invalid']) {
  const fixture = structuredClone(baseline);
  if (kind === 'sparse') fixture.referenceEnabled = fixture.referenceEnabled.map((_, i) => +(i % 3 === 2));
  if (kind === 'empty') fixture.currentCount = 0;
  if (kind === 'invalid') fixture.referenceCount = -1;
  for (const name of ['referenceDescriptor', 'currentDescriptor', 'referencePoint', 'currentPoint', 'predictedRotation'])
    program.input(name).set(fixture[name].flat());
  for (const name of ['referenceEnabled', 'currentEnabled', 'predictedTranslation']) program.input(name).set(fixture[name]);
  for (const name of ['referenceCount', 'currentCount', 'usePrediction']) program.input(name)[0] = fixture[name];
  const expected = matchingOracle(fixture), before = Buffer.from(inputs);
  function verify() {
    let checked = 0;
    for (const name of ['currentIndex', 'pairEnabled', 'sourcePoint', 'targetPoint', 'count',
      'configurationValid', 'invalidReference', 'invalidCurrent', 'nearestDistance', 'secondDistance']) {
      const wanted = [expected[name]].flat(2), actual = program.output(name);
      if (actual.length !== wanted.length) throw Error(`${kind}/${name} shape`);
      for (let i = 0; i < wanted.length; i++) {
        if (!Number.isFinite(actual[i]) || Math.abs(actual[i] - wanted[i]) > 2e-10) throw Error(`${kind}/${name}/${i}`);
        checked++;
      }
    }
    if (checked !== 3504 || !Buffer.from(inputs).equals(before)) throw Error('Output/input contract');
  }
  program.evaluate(tick++ / 90); verify();
  const outputBefore = Buffer.from(outputs), times = [];
  for (let warmup = 0; warmup < 2; warmup++) program.evaluate(tick++ / 90);
  for (let repetition = 0; repetition < 5; repetition++) {
    const start = performance.now(); program.evaluate(tick++ / 90); times.push(performance.now() - start);
  }
  if (!Buffer.from(outputs).equals(outputBefore)) throw Error('Repeated output bits');
  verify();
  const sorted = [...times].sort((a, b) => a - b);
  cases.push({kind, count:expected.count, checked:3504, timesMs:times, medianMs:sorted[2]});
  console.log(JSON.stringify(cases.at(-1)));
}
// Profile the dense kernel only; loading, oracle and input filling are outside.
for (const name of ['referenceDescriptor', 'currentDescriptor', 'referencePoint', 'currentPoint', 'predictedRotation'])
  program.input(name).set(baseline[name].flat());
for (const name of ['referenceEnabled', 'currentEnabled', 'predictedTranslation']) program.input(name).set(baseline[name]);
for (const name of ['referenceCount', 'currentCount', 'usePrediction']) program.input(name)[0] = baseline[name];
program.evaluate(tick++ / 90);
const inputBefore = Buffer.from(inputs), outputBefore = Buffer.from(outputs);
const ready = reportPath + '.ready.json';
fs.mkdirSync(path.dirname(reportPath), {recursive:true});
fs.writeFileSync(ready, JSON.stringify({pid:process.pid, phase:'evaluate-only', minimumSeconds:30}) + '\n');
console.log(JSON.stringify({phase:'evaluate-only', pid:process.pid}));
const start = performance.now(); let evaluations = 0;
try {
  while (performance.now() - start < 30000) { program.evaluate(tick++ / 90); evaluations++; }
} finally { fs.rmSync(ready); }
const elapsedMs = performance.now() - start;
if (!Buffer.from(inputs).equals(inputBefore) || !Buffer.from(outputs).equals(outputBefore)) throw Error('Profile bits changed');
if (fs.readFileSync(sourcePath, 'utf8') !== source) throw Error('Source changed');
const report = {status:'ACTUAL_FULL350_MATCHER_PERFORMANCE_CHECKED', sourceSha256:sha(source),
  artifactSha256:sha(bytes), moduleSha256:artifact.module_sha256, compiler:artifact.compiler,
  cases, profile:{evaluations, elapsedMs, millisecondsPerEvaluation:elapsedMs / evaluations},
  readonlyInputs:true, repeatedOutputBitsEqual:true,
  consumerSha256:sha(fs.readFileSync('src/modelica-native-program.ts')),
  harnessSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'Actual Node WASM matcher only. No compiler preparation, input transfer, descriptor, registration, graphics, sensors or full-SLAM throughput.',
  fullSlamAccepted:false, productionPinChanged:false};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status:report.status, profile:report.profile}));
