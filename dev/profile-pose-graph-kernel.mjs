// Capture original PGRun machine code and cycles inside its checked eval phase.
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';

const [artifact,source,directory] = process.argv.slice(2);
if (!directory) throw Error('ARTIFACT SOURCE DIRECTORY required');
fs.mkdirSync(directory,{recursive:true});
const ready = path.join(directory,'performance.ready.json');
if (fs.existsSync(ready)) throw Error('Use a directory without a previous ready file');
const log = fs.openSync(path.join(directory,'machine-code-and-runtime.log'),'w');
const command = ['--perf-basic-prof',`--perf-basic-prof-path=${path.resolve(directory)}`,
  '--print-wasm-code-function-index=28',
  path.resolve('dev/probe-native-pose-graph-run-runtime.mjs'),'performance',artifact,source,directory];
const child = spawn(process.execPath,command,{stdio:['ignore',log,log]});
let exited = false, mapLink, mapLinked = false;
const completion = new Promise((resolve,reject) => {
  child.once('error',reject);
  child.once('exit',(code,signal) => {exited=true;resolve({code,signal});});
});
try {
  const deadline = performance.now()+90000;
  while (!fs.existsSync(ready)) {
    if (exited || performance.now()>deadline) throw Error('Evaluation phase did not start');
    await new Promise(resolve => setTimeout(resolve,100));
  }
  const phase = JSON.parse(fs.readFileSync(ready));
  if (phase.pid !== child.pid || phase.phase !== 'evaluate-only') throw Error('Wrong phase owner');
  process.kill(child.pid,0);
  // perf's JIT map lookup uses /tmp; the large owned file stays on scratch.
  mapLink = `/tmp/perf-${child.pid}.map`;
  fs.symlinkSync(path.resolve(directory,`perf-${child.pid}.map`),mapLink);
  mapLinked = true;
  const data = path.join(directory,'runtime.perf.data');
  const args = ['record','--clockid','mono','-F','99','-e','cycles:u','--call-graph','fp',
    '-p',String(child.pid),'-o',data,'--','sleep','10'];
  fs.writeFileSync(path.join(directory,'perf-command.json'),JSON.stringify({node:command,perf:args,phase},null,2)+'\n');
  const perf = spawnSync(process.env.PERF_BIN ?? 'perf',args,{encoding:'utf8',timeout:20000});
  fs.writeFileSync(path.join(directory,'perf-record.log'),perf.stderr ?? '');
  if (perf.status !== 0) throw Error(`perf record failed: ${perf.stderr}`);
  for (const [name,args] of [
    ['runtime.perf.txt',['script','-i',data,'-F','comm,pid,tid,time,period,event,ip,sym,dso']],
    ['runtime.perf.dump.txt',['report','-i',data,'-D']],
    ['runtime.perf.header.txt',['report','-i',data,'--header-only']],
  ]) {
    const result = spawnSync(process.env.PERF_BIN ?? 'perf',args,{encoding:'utf8',maxBuffer:64*1024*1024});
    if (result.status !== 0) throw Error(result.stderr);
    fs.writeFileSync(path.join(directory,name),result.stdout + (name === 'runtime.perf.dump.txt' ? result.stderr : ''));
  }
  const terminal = await completion;
  if (terminal.code !== 0 || terminal.signal) throw Error(`Original probe failed: ${JSON.stringify(terminal)}`);
  console.log(JSON.stringify({pid:child.pid,directory,terminal}));
} finally {
  if (!exited) child.kill('SIGTERM');
  if (mapLinked && fs.existsSync(mapLink) && fs.readlinkSync(mapLink) === path.resolve(directory,`perf-${child.pid}.map`))
    fs.unlinkSync(mapLink);
  fs.closeSync(log);
}
