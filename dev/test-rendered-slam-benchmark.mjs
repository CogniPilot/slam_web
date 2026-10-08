// Fault injection for the timing/provenance gates; never runs SLAM or the compiler.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const [runDirectory, referenceFile, captureDirectory, generatedDirectory] = process.argv.slice(2);
if (!generatedDirectory) throw Error('RUN_DIRECTORY REFERENCE CAPTURE GENERATED_DIRECTORY required');
const root = path.resolve(runDirectory), reference = path.resolve(referenceFile);
const temporaryRoot = process.env.TMPDIR ?? path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(temporaryRoot,{recursive:true});
const temporary = fs.mkdtempSync(path.join(temporaryRoot,'rendered-benchmark-gates-'));
const results = [];
function check(name, script, args, accepted) {
  const result = spawnSync(process.execPath,[script,...args],{encoding:'utf8',timeout:10000});
  assert.ifError(result.error);
  assert.equal(result.signal,null);
  assert.equal(result.status === 0,accepted,`${name}: ${result.stderr}`);
  results.push({name,accepted,exitCode:result.status});
}
const verifier = 'dev/verify-rendered-slam-benchmark.mjs';
const inputReport = path.join(root,'input.bin.json');
const validCsv = fs.readFileSync(path.join(root,'runtime.csv'),'utf8');
check('qualified runtime',verifier,[path.join(root,'runtime.csv'),reference,inputReport,
  path.join(temporary,'valid.json')],true);
function csvFault(name, change) {
  const rows = validCsv.trimEnd().split('\n').map(row=>row.split(','));
  change(rows);
  const file = path.join(temporary,`${name}.csv`);
  fs.writeFileSync(file,rows.map(row=>row.join(',')).join('\n')+'\n');
  check(name,verifier,[file,reference,inputReport,path.join(temporary,`${name}.json`)],false);
}
csvFault('missing-frame',rows=>rows.pop());
csvFault('changed-metric',rows=>rows[2][6]=String(Number(rows[2][6])+1));
csvFault('writable-input',rows=>rows[2][5]='0');
csvFault('overlapping-intervals',rows=>rows[2][2]=rows[1][2]);
csvFault('wrong-duration',rows=>rows[2][4]='1');
const packer = 'dev/pack-rendered-slam-benchmark.mjs';
for (const name of ['missing-reference-check','unqualified-reference']) {
  const mutated = JSON.parse(fs.readFileSync(reference));
  if (name === 'missing-reference-check') mutated.result.checks.pop();
  else mutated.renderedFlightReferenceQualified = false;
  const file = path.join(temporary,`${name}.json`);
  fs.writeFileSync(file,JSON.stringify(mutated));
  check(name,packer,[path.resolve(captureDirectory),file,path.resolve(generatedDirectory),
    path.join(temporary,`${name}.bin`)],false);
}
const profileReport = path.join(root,'profile-report.json');
const analyzer = 'dev/analyze-rendered-slam-perf.mjs';
check('qualified profile',analyzer,[root,profileReport,path.join(temporary,'perf-valid.json')],true);
const badProfile = path.join(temporary,'bad-profile'); fs.mkdirSync(badProfile);
for (const name of ['profile.csv','input.bin.json','native.perf.data','native.perf.txt','native.perf.header.txt'])
  fs.symlinkSync(path.join(root,name),path.join(badProfile,name));
fs.writeFileSync(path.join(badProfile,'native.perf.dump.txt'),
  fs.readFileSync(path.join(root,'native.perf.dump.txt'),'utf8')+'\nPERF_RECORD_LOST\n');
check('lost-sample',analyzer,[badProfile,profileReport,path.join(temporary,'lost.json')],false);
const overlapping = JSON.parse(fs.readFileSync(profileReport));
overlapping.intervals[2].start = overlapping.intervals[1].start;
const overlappingFile = path.join(temporary,'overlapping.json');
fs.writeFileSync(overlappingFile,JSON.stringify(overlapping));
check('overlapping-profile-windows',analyzer,[root,overlappingFile,path.join(temporary,'overlap.json')],false);
const report = {status:'BENCHMARK_NEGATIVE_CONTROLS_PASS',results,
  scope:'Two valid receipts pass; nine corrupted receipts are rejected before any expensive execution.'};
fs.writeFileSync(path.join(root,'gate-tests.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
fs.rmSync(temporary,{recursive:true});
