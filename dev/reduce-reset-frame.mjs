// Preserve the authored constructor verbatim; omit only unreachable owners.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [directory, form] = process.argv.slice(2);
if (!directory) throw Error('NEW_OUTPUT_DIRECTORY [--equations] required');
assert.ok(form === undefined || form === '--equations','Unknown diagnostic form');
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
let source = prefix+'\nend RGBDKeyframes;\n\n'+model+'\n';
if (form === '--equations') {
  const body = prefix.split('  function EmptyFrame\n')[1].split('  algorithm\n')[1]
    .split('  end EmptyFrame;')[0];
  // This reduction accepts only the constructor's current straight assignments.
  // Keep matrix row semicolons inside their original source lines.
  const statements = body.trim().split('\n').map(line=>line.trim());
  assert.ok(statements.every(line=>/^frame\.[A-Za-z]+\s*:=.*;$/.test(line)));
  const fields = prefix.split('  record Frame\n')[1].split('  end Frame;')[0].trim().split('\n')
    .map(line=>line.trim().match(/^(?:Integer|Real|Boolean) (\w+)/)?.[1]);
  assert.ok(fields.every(Boolean));
  assert.deepEqual(statements.map(line=>line.match(/^frame\.(\w+)/)[1]).sort(),fields.sort());
  const constants = [...prefix.matchAll(/^  constant Integer (\w+) =/gm)].map(match=>match[1]);
  const names = new RegExp('\\b('+constants.join('|')+')\\b','g');
  const equations = statements.map(line=>'  '+line.replace(/^frame\./,'next.').replace(':=','=')
    .replace(names,name=>'RGBDKeyframes.'+name)).join('\n');
  source = prefix+'\nend RGBDKeyframes;\n\nmodel DirectFrameOwner\n'
    +'  output RGBDKeyframes.Frame next;\nequation\n'+equations+'\nend DirectFrameOwner;\n';
}
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(path.join(directory,'source.mo'),source);
fs.writeFileSync(path.join(directory,'translate.mos'),
  'loadFile("source.mo");\ngetErrorString();\ntranslateModel('
    +(form ? 'DirectFrameOwner' : 'ResetFrameOwner')+');\ngetErrorString();\n');
const report = {source:sourcePath,originalSha256:sha(original),prefixStart:start,prefixEnd:end,
  unchangedPrefixSha256:sha(prefix),fixtureSha256:sha(fixture),sourceSha256:sha(source),
  bytes:Buffer.byteLength(source),
  scope:(form ? 'Diagnostic equations retain each constructor RHS with qualified constant names. ' : '')
    +'Exact authored constants, Frame and EmptyFrame body; full output and capacities retained. '
    +'Only unreachable owners omitted in this diagnostic source, never in application sources.'};
fs.writeFileSync(path.join(directory,'binding.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
