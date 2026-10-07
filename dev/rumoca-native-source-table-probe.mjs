// Review-only producer proof. Preserve all IR integer/IEEE-bit JSON lexemes.
// PACKAGE SOURCE MODEL OUTPUT_DIRECTORY; run under rumoca-bounded-run.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const [pkg, filename, model, outputDirectory] = process.argv.slice(2);
if (!outputDirectory) throw new Error('PACKAGE SOURCE MODEL OUTPUT_DIRECTORY required');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(path.join(pkg, 'rumoca_bind_wasm_bg.wasm'));
const compiler = await import(pathToFileURL(path.resolve(pkg, 'rumoca_bind_wasm.js')));
await compiler.default({module_or_path: bytes});
const original = fs.readFileSync(filename, 'utf8');
const variants = [
  ['baseline', original],
  ['gain-two', original.replace('gain = 1.0', 'gain = 2.0')],
  ['subtract', original.replace('total + gain*values', 'total - gain*values')],
].filter(([variant, source]) => variant === 'baseline' || source !== original);

// Stringify(parse(IR)) would silently round u64 bit patterns and source IDs.
function tableJson(wire) {
  const marker = '"pure_calls":';
  const markerPosition = wire.indexOf(marker);
  if (markerPosition < 0 || wire.indexOf(marker, markerPosition + 1) !== -1) {
    throw new Error('Expected exactly one Solve pure-call table in facade wire');
  }
  const start = wire.indexOf('{', markerPosition + marker.length);
  let depth = 0, quoted = false, escaped = false;
  for (let end = start; end < wire.length; end++) {
    const c = wire[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return wire.slice(start, end + 1);
  }
  throw new Error('Unterminated pure-call table');
}

fs.mkdirSync(outputDirectory, {recursive: true});
for (const [variant, source] of variants) {
  const start = performance.now();
  const wire = compiler.lower_model_to_solve_json(source, model, .1, .1, '{}');
  const table = tableJson(wire);
  const provenance = {variant, model, source, sourceSha256: hash(source),
    compilerRevision: compiler.get_git_commit(), compilerWasmSha256: hash(bytes),
    tableSha256: hash(table), elapsedMs: performance.now() - start};
  const artifact = `${JSON.stringify(provenance).slice(0, -1)},"table":${table}}\n`;
  const output = path.join(outputDirectory, `${variant}.json`);
  fs.writeFileSync(output, artifact);
  console.log(JSON.stringify({...provenance, source: undefined, tableBytes: Buffer.byteLength(table),
    artifactSha256: hash(artifact), output, rssBytes: process.memoryUsage().rss}));
}
