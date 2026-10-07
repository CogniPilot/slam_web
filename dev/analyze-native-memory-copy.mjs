// Inspect actual compiler-issued bytes; static copy sites are not runtime counts.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import wabtFactory from 'wabt';

const [artifactFile, directory] = process.argv.slice(2);
if (!artifactFile || !directory) throw new Error('ARTIFACT OUTPUT_DIRECTORY required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const artifactBytes = fs.readFileSync(artifactFile);
const artifact = JSON.parse(artifactBytes);
const bytes = Uint8Array.from(artifact.module_bytes);
if (sha(bytes) !== artifact.module_sha256) throw new Error('Artifact module digest mismatch');
const wabt = await wabtFactory();
const module = wabt.readWasm(bytes, {readDebugNames:false, multi_memory:true});
module.validate({multi_memory:true});
const wat = module.toText({foldExprs:false, inlineExport:false});
module.destroy();
fs.mkdirSync(directory, {recursive:true});
fs.writeFileSync(path.join(directory, 'module.wat'), wat);
const lines = wat.split('\n'), copies = [];
let functionIndex;
for (let i = 0; i < lines.length; i++) {
  const declaration = lines[i].match(/^  \(func \(;([0-9]+);\)/);
  if (declaration) functionIndex = Number(declaration[1]);
  if (!/^\s+memory\.copy\b/.test(lines[i])) continue;
  const width = lines[i - 1]?.trim().match(/^i32\.const (-?[0-9]+)$/);
  copies.push({functionIndex, watLine:i + 1,
    immediateBytes:width ? Number(width[1]) >>> 0 : null,
    instructionWindow:lines.slice(Math.max(0, i - 6), i + 2)});
}
const summary = new Map();
for (const copy of copies) {
  const key = `${copy.functionIndex}/${copy.immediateBytes ?? 'dynamic'}`;
  summary.set(key, (summary.get(key) ?? 0) + 1);
}
const report = {
  status:'ORIGINAL_COMPILER_MODULE_STATIC_COPY_INVENTORY', recordedAt:new Date().toISOString(),
  artifactSha256:sha(artifactBytes), sourceSha256:artifact.source_sha256,
  moduleSha256:sha(bytes), moduleBytes:bytes.length,
  inspectorSha256:sha(fs.readFileSync(import.meta.filename)),
  watSha256:sha(wat), copies,
  sitesByFunctionAndImmediateBytes:Object.fromEntries(summary),
  scope:'Static memory.copy sites in unchanged compiler-issued module. Does not establish execution counts, copied bytes per call, wall-time attribution or a performance gain.',
};
fs.writeFileSync(path.join(directory, 'copy-inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({moduleSha256:report.moduleSha256, moduleBytes:bytes.length,
  copySites:copies.length, sitesByFunctionAndImmediateBytes:report.sitesByFunctionAndImmediateBytes}));
