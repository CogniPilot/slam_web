// Preserve the authored constructor verbatim; omit only unreachable owners.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [directory] = process.argv.slice(2);
if (!directory) throw Error('NEW_OUTPUT_DIRECTORY required');
assert.ok(!fs.existsSync(directory),'Choose a fresh output directory');
const sourcePath = 'models/LoopClosure/RGBDKeyframes.mo';
const fixturePath = 'tests/compiler-probes/fixtures/ResetConstructorOwners.mo';
const original = fs.readFileSync(sourcePath,'utf8'), fixture = fs.readFileSync(fixturePath,'utf8');
const start = original.indexOf('package RGBDKeyframes\n');
const closing = '  end EmptyFrame;', closingIndex = original.indexOf(closing);
assert.ok(start >= 0 && closingIndex > start);
const end = closingIndex+closing.length, prefix = original.slice(start,end);
assert.ok(prefix.includes('  record Frame\n') && !prefix.includes('record Catalog'));
const modelStart = fixture.indexOf('model ResetFrameOwner\n');
const modelEnd = fixture.indexOf('end ResetFrameOwner;');
assert.ok(modelStart >= 0 && modelEnd > modelStart);
const model = fixture.slice(modelStart,modelEnd+'end ResetFrameOwner;'.length);
const source = prefix+'\nend RGBDKeyframes;\n\n'+model+'\n';
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'source.mo'),source);
fs.writeFileSync(path.join(directory,'translate.mos'),
  'loadFile("source.mo");\ngetErrorString();\ntranslateModel(ResetFrameOwner);\ngetErrorString();\n');
const report = {source:sourcePath,originalSha256:sha(original),prefixStart:start,prefixEnd:end,
  unchangedPrefixSha256:sha(prefix),fixtureSha256:sha(fixture),sourceSha256:sha(source),
  bytes:Buffer.byteLength(source),
  scope:'Exact authored constants, Frame and EmptyFrame body; full output and capacities retained. '
    +'Only unreachable owners omitted in this diagnostic source, never in application sources.'};
fs.writeFileSync(path.join(directory,'binding.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
