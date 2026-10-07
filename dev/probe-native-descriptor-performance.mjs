// Run the compiler-issued descriptor through the production consumer. Diagnostic
// fixtures and independent mathematics stay outside the application runtime.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';

const [artifactPath, sourcePath, reportPath] = process.argv.slice(2);
if (!artifactPath || !sourcePath || !reportPath) {
  throw Error('Usage: node dev/probe-native-descriptor-performance.mjs artifact.json source.mo report.json');
}
fs.mkdirSync(path.dirname(reportPath), {recursive: true});
const sha = value => createHash('sha256').update(value).digest('hex');
async function bundled(entry) {
  const result = await build({entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled('src/modelica-native-program.ts');
const {rawDescriptorFixture, rawDescriptorOracle} = await bundled('tests/compiler-probes/rgbd-descriptor-frame-fixtures.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const raw = fs.readFileSync(artifactPath, 'utf8');
const artifact = JSON.parse(raw);
const started = performance.now();
const program = await NativeProgram.instantiate(artifact, source);
const loadMs = performance.now() - started;
const [height, width, channels] = artifact.var_layout.shapes.rgb;
if (height !== 480 || width !== 848 || channels !== 3
    || artifact.var_layout.shapes.descriptor.join(',') !== '350,49') {
  throw Error('Expected complete D435 RGB3/350 descriptor artifact');
}
const fixture = rawDescriptorFixture(height, width, channels);
fixture.depthUnits = .001;
fixture.depth.forEach(row => row.forEach((value, column) => { row[column] = Math.round(value * 1000); }));
for (const [name, values] of [
  ['rgb', fixture.rgb.flat(2)], ['depth', fixture.depth.flat()], ['pixels', fixture.pixels.flat()],
  ['rgbCalibration', fixture.rgbCalibration], ['depthCalibration', fixture.depthCalibration],
  ['depthUnits', [fixture.depthUnits]], ['disparityNoise', [fixture.disparityNoise]],
  ['noiseReferenceFx', [fixture.noiseReferenceFx]], ['baseline', [fixture.baseline]],
]) program.input(name).set(values);
const activeCount = program.input('activeCount');
const imageEnabled = program.booleanInput('imageEnabled');
const parameterBytes = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count * 8);
const outputBytes = new Uint8Array(program.memory.buffer, artifact.abi.y_offset, artifact.abi.y_count * 8);
function configure(count, acquired) {
  fixture.activeCount = count;
  fixture.imageEnabled = acquired;
  activeCount[0] = count;
  imageEnabled[0] = Number(acquired);
}
function checkNumerics() {
  const expected = rawDescriptorOracle(fixture);
  for (const [name, values] of [
    ['descriptor', expected.descriptor.flat()], ['point', expected.point.flat()],
    ['enabled', expected.enabled], ['invalidCount', [expected.invalidCount]],
  ]) {
    const actual = program.output(name);
    if (actual.length !== values.length) throw Error(`${name} shape changed`);
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(actual[i]) || Math.abs(actual[i] - values[i]) > 2e-11) {
        throw Error(`${name}[${i}]: ${actual[i]} != ${values[i]}`);
      }
    }
  }
}
function unchanged(actual, before, label) {
  if (actual.length !== before.length || actual.some((value, i) => value !== before[i])) throw Error(`${label} changed`);
}
const cases = [];
let frame = 0;
for (const [count, acquired] of [[350, true], [1, true], [0, true], [350, false]]) {
  configure(count, acquired);
  const before = parameterBytes.slice();
  program.evaluate(frame++ / 90);
  checkNumerics();
  for (let warmup = 0; warmup < 5; warmup++) program.evaluate(frame++ / 90);
  const outputs = outputBytes.slice();
  const times = [];
  for (let repetition = 0; repetition < 30; repetition++) {
    const start = performance.now();
    program.evaluate(frame++ / 90);
    times.push(performance.now() - start);
  }
  unchanged(parameterBytes, before, 'Public P');
  unchanged(outputBytes, outputs, 'Repeated numerical output');
  checkNumerics();
  const sorted = [...times].sort((a, b) => a - b);
  const result = {activeCount: count, imageEnabled: acquired, evaluations: times.length,
    medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],
    minMs: sorted[0], maxMs: sorted.at(-1), timesMs: times};
  cases.push(result);
  console.log(JSON.stringify({phase: 'measured', activeCount: count, imageEnabled: acquired, medianMs: result.medianMs}));
}
// Attach perf only after loading, validation, fixture creation and oracles have
// finished. This interval contains repeated evaluate() calls on unchanged inputs.
configure(350, true);
program.evaluate(frame++ / 90);
const before = parameterBytes.slice(), outputs = outputBytes.slice();
const readyPath = reportPath + '.ready.json';
fs.writeFileSync(readyPath, JSON.stringify({pid: process.pid, phase: 'evaluate-only', minimumSeconds: 30}) + '\n');
console.log(JSON.stringify({phase: 'evaluate-only', pid: process.pid}));
const profileStart = performance.now();
let profileEvaluations = 0;
while (performance.now() - profileStart < 30000) {
  program.evaluate(frame++ / 90);
  profileEvaluations++;
}
const profileMs = performance.now() - profileStart;
fs.rmSync(readyPath);
unchanged(parameterBytes, before, 'Profile P');
unchanged(outputBytes, outputs, 'Profile numerical output');
checkNumerics();
if (fs.readFileSync(sourcePath, 'utf8') !== source) throw Error('Source changed during benchmark');
const report = {status: 'ACTUAL_D435_DESCRIPTOR_PERFORMANCE_CHECKED', sourceSha256: sha(source),
  artifactSha256: sha(raw), artifactBytes: Buffer.byteLength(raw), moduleSha256: artifact.module_sha256,
  moduleBytes: artifact.module_bytes.length, compiler: artifact.compiler, loadMs, cases,
  profile: {evaluations: profileEvaluations, elapsedMs: profileMs, millisecondsPerEvaluation: profileMs / profileEvaluations},
  numericalOutputsCheckedPerCase: 18551, readonlyInputs: true, staticInputsDuringMeasurement: true,
  scope: 'Node WASM descriptor evaluation only; excludes cold admission, input transfer, detector, SLAM, graphics and sensors.',
  fullSlamAccepted: false, productionPinChanged: false,
  harnessSha256: sha(fs.readFileSync(import.meta.filename)),
  consumerSha256: sha(fs.readFileSync('src/modelica-native-program.ts'))};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, profile: report.profile}));
