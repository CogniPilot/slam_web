// Exercise profile ownership and observation bounds without running a compiler.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const [trapDirectory, stoppedDirectory, output] = process.argv.slice(2);
if (!output) throw Error('TRAP_PROFILE STOPPED_PROFILE REPORT required');
const temporaryRoot = process.env.TMPDIR ?? path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(temporaryRoot,{recursive:true});
const temporary = fs.mkdtempSync(path.join(temporaryRoot,'compiler-perf-gates-'));
const results = [];
function check(name, directory, accepted, diagnostic) {
  const result = spawnSync(process.execPath,['dev/analyze-compiler-perf.mjs',directory,
    path.join(temporary,name+'.json')],{encoding:'utf8',timeout:10000});
  assert.ifError(result.error);
  assert.equal(result.signal,null);
  assert.equal(result.status === 0,accepted,`${name}: ${result.stderr}`);
  if (diagnostic) assert.match(result.stderr,diagnostic);
  results.push({name,accepted,exitCode:result.status});
}
function fault(name, filename, change, diagnostic) {
  const directory = path.join(temporary,name);
  fs.mkdirSync(directory);
  for (const file of fs.readdirSync(stoppedDirectory))
    if (fs.statSync(path.join(stoppedDirectory,file)).isFile())
      fs.symlinkSync(path.resolve(stoppedDirectory,file),path.join(directory,file));
  const original = fs.readFileSync(path.join(directory,filename),'utf8');
  fs.unlinkSync(path.join(directory,filename));
  fs.writeFileSync(path.join(directory,filename),change(original));
  check(name,directory,false,diagnostic);
}
const jsonChange = change => text => {
  const value = JSON.parse(text); change(value); return JSON.stringify(value);
};
try {
  check('original-trap',trapDirectory,true);
  check('stopped-preparation',stoppedDirectory,true);
  fault('wrong-process','compiler.perf.txt',text=>text.replace(/\d+\/\d+(?=\s+\d+\.\d+:)/,
    '1/1'),/Wrong process owner/);
  fault('early-stop','command.json',jsonChange(value=>value.stopRequested=value.phase.monotonicSeconds),
    /AssertionError/);
  fault('end-before-stop','command.json',jsonChange(value=>value.end=value.stopRequested-1),
    /AssertionError/);
  fault('successful-terminal','command.json',jsonChange(value=>value.terminal={code:0,signal:null}),
    /AssertionError/);
  fault('wrong-phase-owner','phase.log',jsonChange(value=>value.sourceSha256='0'.repeat(64)),
    /AssertionError/);
  fault('phase-already-ended','phase.log',text=>text.trimEnd()+'\n'+JSON.stringify({event:'success'})+'\n',
    /Preparation ended before the observation stop/);
  fault('wrong-clock','compiler.perf.header.txt',text=>text.replace('monotonic (1)','realtime (0)'),
    /AssertionError/);
  fault('wrong-inventory','compiler.perf.dump.txt',text=>text.replace(/SAMPLE events:\s+\d+/,
    'SAMPLE events: 1'),/AssertionError/);
  for (const kind of ['PERF_RECORD_LOST','PERF_RECORD_LOST_SAMPLES'])
    fault(kind.toLowerCase(),'compiler.perf.dump.txt',text=>text+'\n'+kind+'\n',/Lost perf records/);
  const report = {status:'COMPILER_PERF_NEGATIVE_CONTROLS_PASS',results,
    scope:'Both original receipts pass; corrupted ownership, timing and sample receipts are rejected.'};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  fs.rmSync(temporary,{recursive:true});
}
