// Compare the host buffer handoff for one actual full14400 compiled model.
// Numerical execution remains in the identical compiler-issued WASM module.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const [fixtureFile, artifactFile, baselineFile, candidateFile, reportFile] = process.argv.slice(2);
if (!reportFile) throw new Error('FIXTURES ARTIFACT BASELINE_MODULE CANDIDATE_MODULE REPORT required');
const sha = value => createHash('sha256').update(value).digest('hex');
const fixtureBytes = fs.readFileSync(fixtureFile);
const fixtures = JSON.parse(fixtureBytes.toString());
const source = fs.readFileSync(fixtures.artifacts.registration.sourcePath, 'utf8');
const artifactBytes = fs.readFileSync(artifactFile);
const artifact = JSON.parse(artifactBytes.toString());
if (artifact.source_sha256 !== sha(source)) throw new Error('Source mismatch');
const implementations = await Promise.all([baselineFile, candidateFile].map(file => import(pathToFileURL(path.resolve(file)))));
const programs = await Promise.all(implementations.map(({NativeProgram}) => NativeProgram.instantiate(artifact, source)));
const fixture = fixtures.frames[0].registration;
const fields = ['sourcePoint', 'targetPoint', 'pairEnabled'];
const inputs = fields.map(name => Float64Array.from(fixture[name]));
const outputs = Object.entries(artifact.var_layout.bindings).filter(([, binding]) => binding.Y).map(([name]) => name);
if (inputs[0].length !== 43200 || inputs[1].length !== 43200 || inputs[2].length !== 14400) throw new Error('Reduced workload');
const handoff = (program, sequence) => {
  for (let i = 0; i < fields.length; i++) program.input(fields[i]).set(inputs[i]);
  program.input('activeCount')[0] = fixture.activeCount;
  // Reading the views mirrors collecting public output fields; no host math.
  for (const name of outputs) program.output(name);
  return sequence;
};
const pBytes = program => Buffer.from(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count * 8);
const yBytes = program => Buffer.from(program.memory.buffer, artifact.abi.y_offset, artifact.abi.y_count * 8);
const originalBuffers = programs.map(program => program.memory.buffer);
for (const program of programs) {
  handoff(program, 0);
  program.evaluate(0);
  if (program.output('accepted')[0] !== 1) throw new Error('Registration rejected');
}
if (!pBytes(programs[0]).equals(pBytes(programs[1])) || !yBytes(programs[0]).equals(yBytes(programs[1]))) throw new Error('Changed published bytes');
for (let sequence = 0; sequence < 50; sequence++) for (const program of programs) handoff(program, sequence);
const blocks = [];
for (let round = 0; round < 6; round++) {
  for (const candidate of round % 2 ? [1, 0] : [0, 1]) {
    const start = performance.now();
    for (let sequence = 0; sequence < 200; sequence++) handoff(programs[candidate], sequence);
    blocks.push({round, candidate, calls:200, meanHandoffMs:(performance.now() - start) / 200});
  }
  if (!pBytes(programs[0]).equals(pBytes(programs[1]))) throw new Error('Changed input bytes');
}
const resetControls = [];
for (const [index, program] of programs.entries()) {
  const previous = program.input('sourcePoint');
  const output = program.output('translation');
  program.reset();
  // Retained views must remain live after reset and new input publication.
  previous.set(inputs[0]);
  program.input('targetPoint').set(inputs[1]);
  program.input('pairEnabled').set(inputs[2]);
  program.input('activeCount')[0] = fixture.activeCount;
  program.evaluate(1 / 90);
  if (program.memory.buffer !== originalBuffers[index] || program.output('accepted')[0] !== 1
      || !Buffer.from(previous.buffer, previous.byteOffset, previous.byteLength).equals(Buffer.from(inputs[0].buffer))
      || !Buffer.from(output.buffer, output.byteOffset, output.byteLength).equals(Buffer.from(program.output('translation').buffer, program.output('translation').byteOffset, output.byteLength))) {
    throw new Error('Retained views stale after reset');
  }
  const refusals = [];
  for (const [method, name] of [['input', 'translation'], ['output', 'sourcePoint'], ['input', '__proto__']]) {
    let refused = false;
    try { program[method](name); } catch { refused = true; }
    if (!refused) throw new Error('Undeclared field accepted');
    refusals.push(`${method}/${name}`);
  }
  resetControls.push({candidate:index, retainedViewsLive:true, undeclaredFieldsRefused:refusals});
}
if (!yBytes(programs[0]).equals(yBytes(programs[1]))) throw new Error('Reset execution changed output bits');
const means = [0, 1].map(index => blocks.filter(block => block.candidate === index).reduce((sum, block) => sum + block.meanHandoffMs, 0) / 6);
const report = {
  status:'ACTUAL_FULL14400_HOST_HANDOFF_COMPARISON_AND_RESET_PARITY_PASS', recordedAt:new Date().toISOString(), engine:process.version,
  sourceSha256:sha(source), artifactSha256:sha(artifactBytes), moduleSha256:artifact.module_sha256, fixtureSha256:sha(fixtureBytes),
  consumerBundleSha256:[baselineFile, candidateFile].map(file => sha(fs.readFileSync(file))), probeSha256:sha(fs.readFileSync(import.meta.filename)),
  capacity:14400, copiedScalarsPerCall:100801, blocks, baselineMeanHandoffMs:means[0], candidateMeanHandoffMs:means[1], speedup:means[0] / means[1],
  resetControls, everyOutputBitsEqual:true, inputBytesEqual:true,
  scope:'Uninstrumented alternating host field lookup, full input copies and output view retrieval only. Identical original WASM artifact,50warmups and six200callblocks/consumer. Excludes compiler preparation, kernel execution, sensor/GPU transfer, matching, filter and rendering; not a whole-pipeline gain.',
  productionPinChanged:false, fullSlam:false,
};
fs.mkdirSync(path.dirname(reportFile), {recursive:true});
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
