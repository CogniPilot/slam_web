// Keep every period in the denominator and bind samples to the checked phase.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [directory,reportPath] = process.argv.slice(2);
if (!reportPath) throw Error('PROFILE_DIRECTORY REPORT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = name => fs.readFileSync(path.join(directory,name));
const receipt = JSON.parse(read('performance.json')), text = read('runtime.perf.txt').toString();
const dump = read('runtime.perf.dump.txt').toString();
const metadata = read('runtime.perf.header.txt').toString();
assert.match(metadata,/# clockid: monotonic \(1\)/,'Perf clock differs from phase receipt');
const groups = new Map();
let samples = 0, period = 0, first = Infinity, last = -Infinity, unknownLeaves = 0;
for (const block of text.trim().split(/\n\s*\n/)) {
  const lines = block.split('\n');
  const header = lines[0].match(/\s(\d+)\/(\d+)\s+(\d+\.\d+):\s+(\d+)\s+cycles:u:/);
  assert.ok(header, 'Unexpected perf event');
  assert.equal(Number(header[1]),receipt.pid,'Wrong process owner');
  assert.equal(Number(header[2]),receipt.pid,'Unexpected worker thread');
  const time = Number(header[3]), weight = Number(header[4]);
  first = Math.min(first,time); last = Math.max(last,time); period += weight; samples++;
  const leaf = lines[1]?.trim().replace(/^[a-f0-9]+\s+/,'')
    .replace(/data:text\/javascript;base64,[^ ]+/g,'<bundled module>') ?? '<no stack>';
  if (leaf.includes('[unknown]') || leaf === '<no stack>') unknownLeaves++;
  const row = groups.get(leaf) ?? {leaf,samples:0,period:0};
  row.samples++; row.period += weight; groups.set(leaf,row);
}
assert.ok(samples > 100 && period > 0,'Insufficient samples');
assert.ok(first >= receipt.profile.monotonicStartSeconds && last <= receipt.profile.monotonicEndSeconds,
  'Samples extend outside the checked evaluation-only interval');
const counted = dump.match(/SAMPLE events:\s+(\d+)/);
assert.ok(counted,'Missing perf event inventory');
assert.equal(Number(counted[1]),samples,'Perf inventory differs from parsed events');
const lostRecords = [...dump.matchAll(/PERF_RECORD_LOST(?:_SAMPLES)?\b/g)].length;
assert.equal(lostRecords,0,'Lost event records in capture');
const eventCount = name => Number(dump.match(new RegExp(`^\\s*${name} events:\\s+(\\d+)`,'m'))?.[1] ?? 0);
const leaves = [...groups.values()].sort((a,b) => b.period-a.period)
  .map(row => ({...row,percent:100*row.period/period}));
const percentage = pattern => 100*leaves.filter(row => pattern.test(row.leaf)).reduce((sum,row) => sum+row.period,0)/period;
const report = {status:'PERF_EVALUATION_WINDOW_AND_ALL_PERIODS_VERIFIED',recordedAt:new Date().toISOString(),
  pid:receipt.pid,samples,totalPeriod:period,unknownLeaves,lostRecords,
  throttleEvents:eventCount('THROTTLE'),unthrottleEvents:eventCount('UNTHROTTLE'),
  firstSampleSeconds:first,lastSampleSeconds:last,
  evaluation:receipt.profile,leaves,memmoveLeafPercent:percentage(/memmove/),
  copyWrapperLeafPercent:percentage(/memory_copy_wrapper/),
  inputs:Object.fromEntries(['performance.json','runtime.perf.data','runtime.perf.txt','runtime.perf.dump.txt','runtime.perf.header.txt']
    .map(name => [name,{sha256:sha(read(name)),bytes:read(name).length}])),
  sourceSha256:receipt.sourceSha256,moduleSha256:receipt.moduleSha256,
  summarizerSha256:sha(fs.readFileSync(import.meta.filename)),
  fullSlamAccepted:false,scope:'Sampled cycles:u leaf periods during checked original-module evaluation. Includes unknown leaves and reports throttling; no GPU, CPU-utilization or complete-pipeline throughput claim.'};
fs.mkdirSync(path.dirname(reportPath),{recursive:true}); fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({samples,lostRecords,unknownLeaves,memmoveLeafPercent:report.memmoveLeafPercent,
  copyWrapperLeafPercent:report.copyWrapperLeafPercent,firstSampleSeconds:first,lastSampleSeconds:last}));
