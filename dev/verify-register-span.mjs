// Bind a diagnostic register span to the unchanged authored Modelica files.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {rgbdSlamNativeSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';

const [observationFile, sourceFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw Error('OBSERVATION SOURCE REPORT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const observation = fs.readFileSync(observationFile);
const report = JSON.parse(observation);
assert.equal(report.status, 'COMPILER_TRAP_REGISTER_METADATA_OBSERVED');
assert.ok(report.importsUnchanged && report.originalExportsUnchanged
  && report.controlModuleBitsEqual && report.controlAbiEqual);
const source = fs.readFileSync(sourceFile);
assert.equal(sha(source), report.sourceSha256);
const parts = manifest.paths.map(file => fs.readFileSync(file));
const separator = Buffer.from(manifest.separator);
const joined = Buffer.concat(parts.flatMap((bytes, index) => index ? [separator, bytes] : [bytes]));
assert.ok(joined.equals(source), 'Current authored source differs from observed source');

// Exact compiler revision's SourceId::from_source_name uses 64-bit FNV-1a.
let sourceId = 0xcbf29ce484222325n;
for (const byte of Buffer.from('input.mo'))
  sourceId = BigInt.asUintN(64, (sourceId ^ BigInt(byte)) * 0x100000001b3n);
const sourceIdWords = [Number(sourceId & 0xffffffffn), Number(sourceId >> 32n)];
for (const words of [report.controlSpanWords, report.lastRegisterSpanWords]) {
  assert.ok(Array.isArray(words) && words.length === 4
    && words.every(word => Number.isInteger(word) && word >= 0 && word <= 0xffffffff));
  assert.deepEqual(words.slice(0, 2), sourceIdWords, 'Span source identity differs');
}
const control = Buffer.from(report.controlSource);
const [controlStart, controlEnd] = report.controlSpanWords.slice(2);
assert.ok(controlStart < controlEnd && controlEnd <= control.length);
assert.equal(control.subarray(controlStart, controlEnd).toString(), 'y');
const [start, end] = report.lastRegisterSpanWords.slice(2);
assert.ok(end > start && end <= source.length, 'Span is outside observed source');
let cursor = 0, owner;
for (let index = 0; index < parts.length; index++) {
  const next = cursor + parts[index].length;
  if (start >= cursor && end <= next) {
    owner = {file: manifest.paths[index], fileSha256: sha(parts[index]),
      globalStart: start, globalEnd: end, localStart: start - cursor, localEnd: end - cursor,
      line: parts[index].subarray(0, start - cursor).toString().split('\n').length};
    break;
  }
  cursor = next + separator.length;
}
assert.ok(owner, 'Span crosses authored-file boundaries');
const fragment = source.subarray(start, end).toString();
assert.equal(fragment, report.lastRegisterSpanFragment);
const result = {status: 'REGISTER_TRAP_SOURCE_OWNER_AND_IDENTITY_VERIFIED',
  sourceSha256: report.sourceSha256, sourceIdName: 'input.mo', sourceId: sourceId.toString(),
  sourceIdWords, owner, fragment, observationSha256: sha(observation),
  verifierSha256: sha(fs.readFileSync(import.meta.filename)),
  scope: 'Last attempted register span, checked against the exact merge Span layout, control token '
    + 'and source-name hash. Not a count of all registers by owner or identification of the '
    + 'callee operation causing repeated expansion.'};
fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
