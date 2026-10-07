// Diagnostic observation only: original memory.copy instructions still execute.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import wabtFactory from 'wabt';

const [artifactFile, fixtureFile, directory] = process.argv.slice(2);
if (!directory) throw new Error('ARTIFACT FIXTURES OUTPUT_DIRECTORY required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const artifactBytes = fs.readFileSync(artifactFile), artifact = JSON.parse(artifactBytes);
const original = Uint8Array.from(artifact.module_bytes), fixtures = JSON.parse(fs.readFileSync(fixtureFile));
const source = fs.readFileSync(fixtures.artifacts.registration.sourcePath);
if (sha(original) !== artifact.module_sha256 || sha(source) !== artifact.source_sha256)
  throw new Error('Source/module binding mismatch');
const wabt = await wabtFactory();
const parsed = wabt.readWasm(original, {readDebugNames:false, multi_memory:true});
parsed.generateNames();
parsed.applyNames();
const lines = parsed.toText({foldExprs:false, inlineExport:false}).split('\n');
parsed.destroy();
const sites = [], rewritten = [], frames = [];
let currentFunction, nextFunction = WebAssembly.Module.imports(await WebAssembly.compile(original))
  .filter(entry => entry.kind === 'function').length;
let inserted = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i], trimmed = line.trim();
  if (/^  \(func /.test(line)) {
    currentFunction = nextFunction++;
    frames.length = 0;
    if (!inserted) {
      rewritten.push('  (import "diag" "copy" (func $observe_copy (param i32 i32 i32 i32)))');
      inserted = true;
    }
    rewritten.push(line, '    (local $copy_destination i32) (local $copy_source i32) (local $copy_size i32)');
    continue;
  }
  const frame = trimmed.match(/^(block|loop|if)\b/);
  if (frame) frames.push(frame[1]);
  if (/^end\b/.test(trimmed)) frames.pop();
  if (/^memory\.copy\b/.test(trimmed)) {
    const id = sites.length, width = lines[i - 1].trim().match(/^i32\.const (-?\d+)$/);
    sites.push({id, originalFunctionIndex:currentFunction, originalWatLine:i + 1,
      surroundingLoopDepth:frames.filter(frame => frame === 'loop').length,
      immediateBytes:width ? Number(width[1]) >>> 0 : null});
    rewritten.push('    local.set $copy_size', '    local.set $copy_source',
      '    local.tee $copy_destination', '    local.get $copy_source', '    local.get $copy_size',
      `    i32.const ${id}`, '    call $observe_copy', '    local.get $copy_destination',
      '    local.get $copy_source', '    local.get $copy_size');
  }
  rewritten.push(line);
}
// Generated names must bind every original call/export before adding an import.
if (rewritten.some(line => /^\s*call \d+\b/.test(line))
  || rewritten.some(line => /^\s*\(export .*\(func \d+\)/.test(line)))
  throw new Error('Original function indices were not converted to named references');
const text = rewritten.join('\n'), instrumented = wabt.parseWat('observed-copy.wat', text, {multi_memory:true});
instrumented.validate({multi_memory:true});
const observed = new Uint8Array(instrumented.toBinary({write_debug_names:false}).buffer);
instrumented.destroy();
fs.mkdirSync(directory, {recursive:true});
fs.writeFileSync(path.join(directory, 'observed-copy.wat'), text);
fs.writeFileSync(path.join(directory, 'observed-copy.wasm'), observed);

const a = artifact.abi, fixture = fixtures.frames[0].registration, cases = [];
if (fixture.sourcePoint.length !== 43200 || fixture.pairEnabled.length !== 14400)
  throw new Error('Reduced-capacity fixture');
for (const activeCount of [14400, 350]) {
  const counts = new Float64Array(sites.length), copiedBytes = new Float64Array(sites.length);
  const execute = async (bytes, diagnostic) => {
    const memory = new WebAssembly.Memory({initial:a.memory_pages, maximum:a.memory_pages});
    const cells = new Float64Array(memory.buffer);
    cells.set(artifact.parameters, a.p_offset / 8);
    for (const name of ['sourcePoint', 'targetPoint', 'pairEnabled'])
      cells.set(fixture[name], a.p_offset / 8 + artifact.var_layout.bindings[name].P.index);
    cells[a.p_offset / 8 + artifact.var_layout.bindings.activeCount.P.index] = activeCount;
    const parameters = Buffer.from(memory.buffer, a.p_offset, a.p_count * 8), before = Buffer.from(parameters);
    const env = {memory};
    for (const name of artifact.math_imports) env[name] = Math[name];
    const diag = {copy:(_destination, _source, size, id) => {
      counts[id]++; copiedBytes[id] += size >>> 0;
    }};
    const {instance} = await WebAssembly.instantiate(bytes, diagnostic ? {env, diag} : {env});
    const status = instance.exports.eval_assignments(a.y_offset, a.p_offset, 0, a.scratch_offset, 0);
    if (!parameters.equals(before)) throw new Error('Diagnostic mutated P');
    return {status, output:Buffer.from(new Uint8Array(memory.buffer, a.y_offset, a.y_count * 8))};
  };
  const reference = await execute(original, false), actual = await execute(observed, true);
  if (reference.status !== actual.status || !reference.output.equals(actual.output))
    throw new Error('Copy observation changed original outputs/status');
  cases.push({activeCount, sourceCapacity:14400, status:actual.status, outputBitsEqual:true,
    parameterBytesImmutable:true, copyCalls:counts.reduce((sum, count) => sum + count, 0),
    logicalCopiedBytes:copiedBytes.reduce((sum, bytes) => sum + bytes, 0),
    sites:sites.map((site, id) => ({...site, calls:counts[id], logicalCopiedBytes:copiedBytes[id]}))});
}
const report = {status:'OBSERVED_COPY_COUNTS_WITH_ORIGINAL_STATUS_OUTPUT_PARITY', recordedAt:new Date().toISOString(),
  artifactSha256:sha(artifactBytes), sourceSha256:artifact.source_sha256,
  originalModuleSha256:sha(original), diagnosticModuleSha256:sha(observed),
  probeSha256:sha(fs.readFileSync(import.meta.filename)), engine:process.version, cases,
  scope:'Instrumented diagnostic module only. Original copies retained; counts and logical byte widths are observed, not DRAM traffic or execution-time attribution. The350 case keeps the full14400 source capacity. No production artifact or speedup claim.'};
fs.writeFileSync(path.join(directory, 'copy-counts.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({originalModuleSha256:report.originalModuleSha256,
  cases:cases.map(({activeCount, copyCalls, logicalCopiedBytes}) => ({activeCount, copyCalls, logicalCopiedBytes}))}));
