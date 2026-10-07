// Finalize safe compiled-layout manifests, without parsing any owner/table wire.
// DIRECTORY contains Rust-exported *.wasm and *.wasm.json files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory = process.argv[2];
if (!directory) throw new Error('WASM output directory required');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
for (const filename of fs.readdirSync(directory).filter(name => name.endsWith('.wasm.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
  const module = fs.readFileSync(path.join(directory, raw.moduleFile));
  const mathImports = raw.mathImports ?? [];
  if (!mathImports.every(name => name === 'pow')) throw new Error('Unknown target math intrinsic');
  const manifest = {
    module_file: raw.moduleFile, module_sha256: sha(module),
    source: raw.source, source_sha256: sha(raw.source),
    producer_source_sha256: raw.producerSourceSha256,
    producer_revision: raw.producerRevision,
    layout: {input_bytes: raw.inputBytes, output_bytes: raw.outputBytes, scratch_bytes: raw.scratchBytes},
    variant: raw.variantDescription ?? {gain: raw.gain, subtract: raw.subtract},
    cell_format: raw.cellFormat,
    abi: {export: 'eval_typed_call', memory_import: 'env.memory',
      arguments: ['inputPtr:i32', 'outputPtr:i32', 'scratchPtr:i32'], result: 'status:i32'},
    scope: 'standalone source-issued owner; does not execute model schedule or alter app compiler pin',
    ...(mathImports.length === 0 ? {} : {math_imports: mathImports.map(name => ({
      module: 'env', name, parameters: ['f64', 'f64'], results: ['f64'],
      qualification: 'target exponentiation intrinsic; browser Math.pow has no portable host powf bit-parity guarantee',
    }))}),
    ...(raw.lateFailureStatus == null ? {} : {
      late_failure_status: raw.lateFailureStatus,
      late_failure_kind: raw.lateFailureKind,
      late_failure_source_span: raw.lateFailureSourceSpan,
    }),
  };
  const output = path.join(directory, raw.moduleFile.replace(/\.wasm$/, '.json'));
  fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({output, module_sha256: manifest.module_sha256,
    source_sha256: manifest.source_sha256, layout: manifest.layout}));
}
