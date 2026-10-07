// Diagnostic binary rewrite only. A positive result needs an actual emitter fix.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import wabtFactory from 'wabt';
import {rewriteSmallCopies} from './rewrite-small-copies.mjs';

const [artifactFile, directoryArgument] = process.argv.slice(2);
if (!artifactFile || !directoryArgument) throw new Error('ARTIFACT OUTPUT_DIRECTORY required');
const directory = path.resolve(directoryArgument);
fs.mkdirSync(directory, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const artifactBytes = fs.readFileSync(artifactFile);
const baseline = JSON.parse(artifactBytes);
const fixtures = JSON.parse(fs.readFileSync('dev/artifacts/registration-relative-pose-filter-chain/independent-fixtures.json'));
const source = fs.readFileSync(fixtures.artifacts.registration.sourcePath, 'utf8');
if (sha(source) !== baseline.source_sha256) throw new Error('Source mismatch');
const wabt = await wabtFactory();
const read = wabt.readWasm(new Uint8Array(baseline.module_bytes), { readDebugNames: true, multi_memory: true });
read.generateNames();
read.applyNames();
const wat = read.toText({ foldExprs: false, inlineExport: false });
read.destroy();
let replacements = 0;
const rewrite = process.env.RUMOCA_DIAGNOSTIC_REWRITE ?? 'f64-stores';
if (!['f64-stores', 'small-copies'].includes(rewrite)) throw new Error('Unknown diagnostic rewrite');
let changed;
if (rewrite === 'small-copies') ({wat:changed, replacements} = rewriteSmallCopies(wat));
else changed = wat.replace(/i64\.reinterpret_f64\s*\n(\s*)i64\.store\b([^\n]*)/g, (_, indent, suffix) => {
  replacements++;
  return `f64.store${suffix}`;
});
if (!replacements) throw new Error('No eligible diagnostic instructions');
const modules = [wat, changed].map((text, index) => {
  const module = wabt.parseWat(`diagnostic-${index}.wat`, text, { multi_memory: true });
  module.validate({ multi_memory: true });
  const bytes = new Uint8Array(module.toBinary({ write_debug_names: false }).buffer);
  module.destroy();
  fs.writeFileSync(path.join(directory, `diagnostic-${index}.wasm`), bytes);
  return { ...baseline, module_bytes: Array.from(bytes), module_sha256: sha(bytes) };
});
const bundle = path.join(directory, 'consumer.mjs');
await build({ entryPoints: ['src/modelica-native-program.ts'], bundle: true, format: 'esm', platform: 'node', outfile: bundle });
const { NativeProgram } = await import(pathToFileURL(bundle));
const artifacts = [baseline, ...modules];
const programs = await Promise.all(artifacts.map(artifact => NativeProgram.instantiate(artifact, source)));
const bytes = (program, offset, count) => Buffer.from(program.memory.buffer, offset, count);
const outputBytes = program => bytes(program, 0, baseline.abi.y_count * 8);
const parameterBytes = program => bytes(program, baseline.abi.p_offset, baseline.abi.p_count * 8);
const parity = [];
function check(name, frame) {
  const statuses = [];
  for (const program of programs) {
    program.reset();
    for (const input of ['sourcePoint', 'targetPoint', 'pairEnabled']) program.input(input).set(frame[input]);
    program.input('activeCount')[0] = frame.activeCount;
    outputBytes(program).fill(0xa5);
    bytes(program, baseline.abi.scratch_offset, baseline.abi.scratch_bytes).fill(0x5a);
    const before = Buffer.from(parameterBytes(program));
    let status = 'SUCCESS';
    try { program.evaluate(1 / 90); } catch (error) { status = error.message; }
    if (!before.equals(parameterBytes(program))) throw new Error('Changed input bytes');
    statuses.push(status);
  }
  if (statuses.some(status => status !== statuses[0])) throw new Error('Changed status');
  if (programs.some(program => !outputBytes(program).equals(outputBytes(programs[0])))) throw new Error(`Changed Y bytes: ${name}`);
  parity.push({ name, status: statuses[0], completeYBitsEqual: true, parameterBytesImmutable: true });
}
for (const [index, frame] of fixtures.frames.entries()) check(`fixture-${index}`, frame.registration);
for (const activeCount of [-1, 0, 1, 350, 14400, 14401, NaN]) {
  check(`activeCount-${String(activeCount)}`, { ...fixtures.frames[0].registration, activeCount });
}
const measured = fixtures.frames[0].registration;
for (const program of programs) {
  program.reset();
  for (const input of ['sourcePoint', 'targetPoint', 'pairEnabled']) program.input(input).set(measured[input]);
  program.input('activeCount')[0] = measured.activeCount;
}
// Compare two identically round-tripped binaries, isolating the instruction rewrite.
for (let i = 0; i < 100; i++) for (const program of programs.slice(1)) program.evaluate(i / 90);
const blocks = [];
for (let round = 0; round < 6; round++) {
  for (const candidate of round % 2 ? [1, 0] : [0, 1]) {
    const program = programs[candidate + 1];
    const before = sha(parameterBytes(program));
    const start = performance.now();
    for (let i = 0; i < 100; i++) program.evaluate(i / 90);
    blocks.push({ round, candidate, calls: 100, meanMs: (performance.now() - start) / 100 });
    if (sha(parameterBytes(program)) !== before) throw new Error('Timed input mutation');
  }
  if (!outputBytes(programs[1]).equals(outputBytes(programs[2]))) throw new Error('Timed output mismatch');
}
const means = [0, 1].map(candidate => blocks.filter(block => block.candidate === candidate).reduce((sum, block) => sum + block.meanMs, 0) / 6);
const report = {
  status: 'DIAGNOSTIC_BINARY_REWRITE_COMPLETE', recordedAt: new Date().toISOString(), engine: process.version,
  sourceSha256: sha(source), originalArtifactSha256: sha(artifactBytes), originalModuleSha256: baseline.module_sha256,
  diagnosticModuleSha256: modules.map(module => module.module_sha256), rewrite, replacements, capacity: 14400,
  parity, blocks, roundtripBaselineMeanMs: means[0], diagnosticMeanMs: means[1],
  ...(rewrite === 'f64-stores' ? {directF64StoreMeanMs:means[1]} : {smallCopyMeanMs:means[1]}),
  speedup: means[0] / means[1],
  compilerIssuedCandidate: false, compilerSourceChanged: false, runtimeIntegrated: false, productionPinChanged: false,
  scope: `Diagnostic post-emission ${rewrite} rewrite; original and two roundtrips agree on complete Y bytes/statuses for listed fixtures. Full14400 matched inputs,100 warm calls,6 alternating blocks per binary. No emitter-quality, full-SLAM or whole-pipeline claim.`,
};
fs.writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
