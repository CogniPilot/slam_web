import {beforeAll, afterAll, it, expect} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NativeProgram, type NativeProgramArtifact} from '../../src/modelica-native-program';
import {fastNineArc, fastFrameOracle, fillFastImage} from './fast-full-frame-oracle';

const height = 480, width = 848;
const artifactPath = process.env.RUMOCA_NATIVE_FAST_ARTIFACT;
const compilerDirectory = process.env.RUMOCA_BRANCH_PKG;
const sourcePath = process.env.RUMOCA_NATIVE_FAST_SOURCE;
const reportPath = process.env.RUMOCA_NATIVE_FAST_REPORT;
const paths = ['models/Sensors/D435ImageProfile.mo', 'models/Vision/Features/FastNativeFrame.mo',
  'models/Vision/Features/D435FastFeatures.mo'];
const source = sourcePath ? readFileSync(sourcePath, 'utf8') : paths.map(path => readFileSync(path, 'utf8')).join('\n');
const sha = (value:string|Uint8Array) => createHash('sha256').update(value).digest('hex');
const report:Record<string,unknown> = {status: artifactPath ? 'RUNNING' : 'ARTIFACT_NOT_PROVIDED',
  sourceSha256: sha(source), dimensions: {height,width,channels:3}, cases: [],
  fullSlamAccepted: false, productionPinChanged: false, runtimeIntegrated: false};
let artifact:NativeProgramArtifact, program:NativeProgram, completed = 0;
const save = () => { if (reportPath) writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); };
save();
beforeAll(async () => {
  if (!artifactPath) return;
  const raw = readFileSync(artifactPath, 'utf8');
  artifact = JSON.parse(raw);
  expect(artifact.model_name).toBe('D435FastFeatures');
  expect(artifact.var_layout.shapes.rgb).toEqual([height,width,3]);
  expect(artifact.var_layout.shapes.scores).toEqual([height*width]);
  program = await NativeProgram.instantiate(artifact, source);
  report.artifactSha256 = sha(raw);
  report.moduleSha256 = artifact.module_sha256;
  report.moduleBytes = artifact.module_bytes.length;
  report.compiler = artifact.compiler;
  save();
});
afterAll(() => {
  if (artifactPath) report.status = completed === 3 ? 'ACTUAL_D435_FAST_NATIVE_PASS' : 'FAILED_OR_INCOMPLETE';
  save();
});
function identical(actual:Uint8Array, expected:Uint8Array, label:string) {
  expect(actual.length, label).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) throw Error(`${label} byte ${i} changed`);
}
function execute(name:string, acquired=true) {
  program.booleanInput('enabled')[0] = Number(acquired);
  const expected = acquired ? fastFrameOracle(program.input('rgb'), height, width) : new Float64Array(height*width);
  const p = new Uint8Array(program.memory.buffer, artifact.abi.p_offset, artifact.abi.p_count*8), before = p.slice();
  const start = performance.now();
  program.evaluate(0);
  const executeMs = performance.now() - start;
  const actual = program.output('scores');
  identical(new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength), new Uint8Array(expected.buffer), 'Complete score raster');
  identical(p, before, 'Readonly P');
  expect(program.booleanInput('enabled')[0]).toBe(Number(acquired));
  expect(Array.from(program.output('selection'))).toEqual([18,0,1e8,3,240,1,3,3]);
  (report.cases as unknown[]).push({name, scoresChecked: actual.length, executeMs});
  save();
  return actual.slice();
}
it('independent FAST oracle distinguishes nine-sample arcs, cyclic wraparound and strict score thresholds', () => {
  const differences = new Float64Array(16);
  for (let start = 0; start < 16; start++) {
    differences.fill(0);
    for (let k = 0; k < 9; k++) differences[(start+k)%16] = 18;
    expect(fastNineArc(differences)).toBe(18);
    differences[(start+8)%16] = 0;
    expect(fastNineArc(differences)).toBe(0);
    differences.fill(0);
    for (let k = 0; k < 9; k++) differences[(start+k)%16] = -18;
    expect(fastNineArc(differences)).toBe(18);
  }
});
it.skipIf(!compilerDirectory)('actual compiler resolves the native D435 preset to RGB3 with a complete score raster', async () => {
  const compiler:typeof import('@cognipilot/rumoca') = await import(/* @vite-ignore */
    pathToFileURL(resolve(compilerDirectory!, 'rumoca_bind_wasm.js')).href);
  const wasm = readFileSync(resolve(compilerDirectory!, 'rumoca_bind_wasm_bg.wasm'));
  await compiler.default({module_or_path:wasm});
  const start = performance.now(), raw = compiler.compile(source, 'D435FastFeatures'), result = JSON.parse(raw);
  expect(result.balance).toMatchObject({is_balanced:true,num_equations:height*width+8,num_unknowns:height*width+8});
  const storage = result.dae_native.storage;
  for (const [name, dimensions, role] of [['rgb',[height,width,3],'input'],
    ['scores',[height*width],'output'],['selection',[8],'output']] as const) {
    const variable = storage.variables.find((value:{name:string}) => value.name === name);
    expect(variable.role).toBe(role);
    expect(storage.value_types[variable.value_type]).toMatchObject({scalar:'real',dimensions});
  }
  report.sourceLayoutVerified = true;
  report.sourceCompileMs = performance.now() - start;
  report.daeJsonSha256 = sha(raw);
  report.compilerWasmSha256 = sha(wasm);
  save();
});
it.skipIf(!artifactPath)('actual native RGB3 detector preserves every raster score and zero border on moving images', () => {
  for (let frame = 0; frame < 3; frame++) {
    fillFastImage(program.input('rgb'), height, width, frame);
    const values = execute(`asymmetric RGB3 frame ${frame}`);
    expect(values.some(value => value > 18)).toBe(true);
    // This fixture must detect both possible readback axis reversals.
    expect(values.some((value,i) => value !== values[(height-1-Math.floor(i/width))*width+i%width])).toBe(true);
    expect(values.some((value,i) => value !== values[Math.floor(i/width)*width+width-1-i%width])).toBe(true);
  }
  completed++;
});
it.skipIf(!artifactPath)('actual held images skip poisoned RGB, clear every score and recover after reset', () => {
  program.input('rgb').fill(NaN);
  execute('held poisoned RGB', false);
  program.input('rgb').fill(0);
  execute('acquired black image');
  fillFastImage(program.input('rgb'), height, width, 0);
  const baseline = execute('recovery asymmetric image');
  program.reset();
  fillFastImage(program.input('rgb'), height, width, 0);
  const replay = execute('reset replay');
  identical(new Uint8Array(replay.buffer), new Uint8Array(baseline.buffer), 'Reset raster');
  completed++;
});
it.skipIf(!artifactPath)('actual native detector refuses stale source and corrupted module, and reloads its issued JSON', async () => {
  await expect(NativeProgram.instantiate(artifact, source+'\n')).rejects.toThrow('does not match its source');
  const corrupted = structuredClone(artifact);
  corrupted.module_bytes[0] ^= 1;
  await expect(NativeProgram.instantiate(corrupted, source)).rejects.toThrow('digest mismatch');
  program = await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)), source);
  fillFastImage(program.input('rgb'), height, width, 2);
  execute('JSON reload asymmetric image');
  completed++;
});
