// Verify every sampled period belongs to the recorded compiler preparation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [directory, output] = process.argv.slice(2);
if (!output) throw Error('PROFILE_DIRECTORY REPORT required');
const read = name => fs.readFileSync(path.join(directory, name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const command = JSON.parse(read('command.json'));
const stoppedLowering = command.phase?.event === 'start' && command.phase?.phase === 'lower';
let receipt;
if (stoppedLowering) {
  const events = read('phase.log').toString().trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(events.length,1,'Lowering ended before the observation stop');
  assert.deepEqual(events[0],command.phase);
  assert.equal(command.phase.pid,command.pid);
  assert.deepEqual(command.terminal,{code:null,signal:'SIGTERM'});
  assert.ok(Number.isFinite(command.stopRequested) && command.stopRequested > command.phase.monotonicSeconds);
  assert.ok(Number.isFinite(command.end) && command.end >= command.stopRequested);
  receipt = {sourceSha256:command.phase.sourceSha256,compilerWasmSha256:command.phase.compilerSha256,
    compiler:{revision:command.phase.compilerRevision},
    prepareMonotonicStartSeconds:command.phase.monotonicSeconds,
    prepareMonotonicEndSeconds:command.stopRequested};
} else {
  receipt = JSON.parse(read('admission.json'));
  assert.equal(receipt.status, 'REFUSED');
  assert.match(receipt.refusal, /unreachable/);
  assert.equal(command.phase.sourceSha256, receipt.sourceSha256);
  assert.equal(command.phase.compilerWasmSha256, receipt.compilerWasmSha256);
  assert.deepEqual(command.phase.compiler, receipt.compiler);
  assert.equal(command.phase.prepareMonotonicStartSeconds, receipt.prepareMonotonicStartSeconds);
}
assert.match(read('compiler.perf.header.txt').toString(), /# clockid: monotonic \(1\)/);

const groups = new Map(), threads = new Map();
let samples = 0, period = 0, first = Infinity, last = -Infinity, unknown = 0;
for (const block of read('compiler.perf.txt').toString().trim().split(/\n\s*\n/)) {
  const lines = block.split('\n');
  const header = lines[0].match(/\s(\d+)\/(\d+)\s+(\d+\.\d+):\s+(\d+)\s+cycles:u:/);
  assert.ok(header, 'Unexpected perf event');
  assert.equal(Number(header[1]), command.pid, 'Wrong process owner');
  const time = Number(header[3]), weight = Number(header[4]), tid = Number(header[2]);
  assert.ok(time >= receipt.prepareMonotonicStartSeconds && time <= receipt.prepareMonotonicEndSeconds,
    'Sample outside compiler preparation');
  assert.ok(weight > 0);
  first = Math.min(first, time); last = Math.max(last, time); period += weight; samples++;
  const leaf = lines[1]?.trim().replace(/^[a-f0-9]+\s+/, '') ?? '<no stack>';
  if (leaf.includes('[unknown]') || leaf === '<no stack>') unknown++;
  const row = groups.get(leaf) ?? {leaf, samples: 0, period: 0};
  row.samples++; row.period += weight; groups.set(leaf, row);
  const thread = threads.get(tid) ?? {tid, samples: 0, period: 0};
  thread.samples++; thread.period += weight; threads.set(tid, thread);
}
const dump = read('compiler.perf.dump.txt').toString();
assert.equal(Number(dump.match(/SAMPLE events:\s+(\d+)/)?.[1]), samples);
const lost = [...dump.matchAll(/PERF_RECORD_LOST(?:_SAMPLES)?\b/g)].length;
assert.equal(lost, 0, 'Lost perf records');
assert.ok(samples > 100 && period > 0, 'Insufficient samples');
const percent = row => ({...row, percent: row.period / period * 100});
const report = {status: stoppedLowering ? 'ORIGINAL_COMPILER_LOWERING_WINDOW_VERIFIED'
    : 'ORIGINAL_COMPILER_PREPARATION_WINDOW_VERIFIED', pid: command.pid,
  samples, period, lost, unknown, first, last,
  prepareStart: receipt.prepareMonotonicStartSeconds, prepareEnd: receipt.prepareMonotonicEndSeconds,
  compiler: receipt.compiler, compilerWasmSha256: receipt.compilerWasmSha256,
  sourceSha256: receipt.sourceSha256, threads: [...threads.values()].map(percent),
  leaves: [...groups.values()].sort((a, b) => b.period - a.period).map(percent),
  inputs: Object.fromEntries([...(stoppedLowering ? ['phase.log'] : ['admission.json']), 'command.json', 'compiler.perf.data',
    'compiler.perf.txt', 'compiler.perf.dump.txt', 'compiler.perf.header.txt',
    stoppedLowering ? 'rumoca-phase-probe.mjs' : 'probe-native-program.mjs', 'capture.mjs'].map(name => {
      const bytes = read(name); return [name, {bytes: bytes.length, sha256: sha(bytes)}];
    })),
  analyzerSha256: sha(fs.readFileSync(import.meta.filename)),
  scope: 'Sampled cycles during one preparation window, including V8 workers and unknown leaves. '
    + (stoppedLowering ? 'The owned process was deliberately stopped after observation, not a compiler trap. ' : '')
    + 'Not whole-compilation cost, CPU utilization or SLAM execution throughput.'};
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({samples, lost, unknown, first, last, threads: report.threads,
  topLeaves: report.leaves.slice(0, 8)}));
