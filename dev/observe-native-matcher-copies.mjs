// Observe original calls/copies without removing, reordering or replacing them.
// This instrumented module is diagnostic evidence, never a production artifact.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import wabtFactory from 'wabt';

const [artifactPath, sourcePath, directory] = process.argv.slice(2);
if (!directory) throw Error('ARTIFACT SOURCE DIRECTORY required');
const sha = value => createHash('sha256').update(value).digest('hex');
async function bundled(entry) {
  const result = await build({entryPoints:[entry], bundle:true, platform:'node', format:'esm', write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}
const {NativeProgram} = await bundled('src/modelica-native-program.ts');
const {fullMatchingFixture} = await bundled('tests/compiler-probes/rgbd-feature-matching-fixtures.ts');
const artifactBytes = fs.readFileSync(artifactPath), artifact = JSON.parse(artifactBytes);
const source = fs.readFileSync(sourcePath, 'utf8');
const original = Uint8Array.from(artifact.module_bytes);
const program = await NativeProgram.instantiate(artifact, source);
if (program.input('referenceDescriptor').length !== 350 * 49
    || program.input('currentDescriptor').length !== 350 * 49) throw Error('Full matcher required');
const wabt = await wabtFactory();
const parsed = wabt.readWasm(original, {multi_memory:true});
parsed.generateNames(); parsed.applyNames();
const lines = parsed.toText({foldExprs:false, inlineExport:false}).split('\n'); parsed.destroy();
const rewritten = [], sites = [], functions = [];
let nextFunction = WebAssembly.Module.imports(await WebAssembly.compile(original)).filter(i => i.kind === 'function').length;
let currentFunction, entryPending = false, inserted = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i], trimmed = line.trim();
  if (/^  \(func /.test(line)) {
    if (!inserted) {
      rewritten.push('  (import "diag" "copy" (func $observe_copy (param i32 i32)))',
        '  (import "diag" "enter" (func $observe_enter (param i32)))');
      inserted = true;
    }
    currentFunction = nextFunction++;
    functions.push({originalFunctionIndex:currentFunction, declaration:trimmed});
    rewritten.push(line, '    (local $observed_copy_size i32)'); entryPending = true;
    continue;
  }
  if (entryPending && !trimmed.startsWith('(local ')) {
    rewritten.push(`    i32.const ${currentFunction}`, '    call $observe_enter'); entryPending = false;
  }
  if (/^memory\.copy\b/.test(trimmed)) {
    const id = sites.length, width = lines[i - 1].trim().match(/^i32\.const (-?\d+)$/);
    sites.push({id, originalFunctionIndex:currentFunction, originalWatLine:i + 1,
      immediateBytes:width ? Number(width[1]) >>> 0 : null});
    // Retain all three original operands and the memory.copy instruction.
    rewritten.push('    local.tee $observed_copy_size', `    i32.const ${id}`,
      '    local.get $observed_copy_size', '    call $observe_copy');
  }
  rewritten.push(line);
}
if (rewritten.some(l => /^\s*call \d+\b/.test(l) || /^\s*\(export .*\(func \d+\)/.test(l)))
  throw Error('Original function indices must have named bindings');
const observedWat = rewritten.join('\n');
const instrumented = wabt.parseWat('observed-matcher.wat', observedWat, {multi_memory:true});
instrumented.validate({multi_memory:true});
const observed = new Uint8Array(instrumented.toBinary({write_debug_names:false}).buffer); instrumented.destroy();
fs.mkdirSync(directory, {recursive:true});
fs.writeFileSync(path.join(directory, 'observed-matcher.wat'), observedWat);
fs.writeFileSync(path.join(directory, 'observed-matcher.wasm'), observed);
const cases = [], a = artifact.abi;
for (const kind of ['dense', 'empty', 'invalid']) {
  const fixture = fullMatchingFixture();
  if (kind === 'empty') fixture.currentCount = 0;
  if (kind === 'invalid') fixture.referenceCount = -1;
  program.reset();
  for (const name of ['referenceDescriptor', 'currentDescriptor', 'referencePoint', 'currentPoint', 'predictedRotation'])
    program.input(name).set(fixture[name].flat());
  for (const name of ['referenceEnabled', 'currentEnabled', 'predictedTranslation']) program.input(name).set(fixture[name]);
  for (const name of ['referenceCount', 'currentCount', 'usePrediction']) program.input(name)[0] = fixture[name];
  const memory = new WebAssembly.Memory({initial:a.memory_pages, maximum:a.memory_pages});
  new Uint8Array(memory.buffer).set(new Uint8Array(program.memory.buffer));
  const inputCopy = Buffer.from(new Uint8Array(memory.buffer, a.p_offset, a.p_count * 8));
  const calls = Array(sites.length).fill(0), copied = Array(sites.length).fill(0), entries = {};
  const env = {memory}; for (const name of artifact.math_imports) env[name] = Math[name];
  const {instance} = await WebAssembly.instantiate(observed, {env, diag:{
    copy:(id, size) => { calls[id]++; copied[id] += size >>> 0; },
    enter:id => { entries[id] = (entries[id] ?? 0) + 1; },
  }});
  program.evaluate(0);
  const status = instance.exports.eval_assignments(a.y_offset, a.p_offset, 0, a.scratch_offset, 0);
  const expectedOutput = Buffer.from(program.memory.buffer, a.y_offset, a.y_count * 8);
  const actualOutput = Buffer.from(memory.buffer, a.y_offset, a.y_count * 8);
  if (status !== 0 || !actualOutput.equals(expectedOutput)
      || !Buffer.from(memory.buffer, a.p_offset, a.p_count * 8).equals(inputCopy)
      || !Buffer.from(program.memory.buffer, a.p_offset, a.p_count * 8).equals(inputCopy))
    throw Error('Observation changed output/status/input bits');
  const result = {kind, status, outputBitsEqual:true, readonlyInputs:true, functionEntries:entries,
    copyCalls:calls.reduce((sum, n) => sum + n, 0), logicalCopiedBytes:copied.reduce((sum, n) => sum + n, 0),
    sites:sites.map((site, id) => ({...site, calls:calls[id], logicalCopiedBytes:copied[id]}))};
  cases.push(result);
  console.log(JSON.stringify({kind, functionEntries:entries, copyCalls:result.copyCalls, logicalCopiedBytes:result.logicalCopiedBytes}));
}
if (fs.readFileSync(sourcePath, 'utf8') !== source) throw Error('Source changed');
const report = {status:'OBSERVED_MATCHER_CALL_COPY_COUNTS_WITH_ORIGINAL_BIT_PARITY',
  sourceSha256:sha(source), artifactSha256:sha(artifactBytes), originalModuleSha256:sha(original),
  diagnosticModuleSha256:sha(observed), harnessSha256:sha(fs.readFileSync(import.meta.filename)), functions, cases,
  scope:'Instrumented diagnostic only; original calls and memory.copy remain. Logical bytes are not DRAM traffic or timing. Original-module numerical gate is separate.',
  fullSlamAccepted:false, productionPinChanged:false};
fs.writeFileSync(path.join(directory, 'copy-counts.json'), JSON.stringify(report, null, 2) + '\n');
