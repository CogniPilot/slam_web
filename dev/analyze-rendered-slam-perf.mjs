// Keep samples inside verified Modelica processing calls, excluding test IO.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [directory, verifiedReport, outputFile] = process.argv.slice(2);
if (!outputFile) throw Error('PROFILE_DIRECTORY VERIFIED_RUNTIME_REPORT REPORT required');
const read = name => fs.readFileSync(path.join(directory,name));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimeBytes = fs.readFileSync(verifiedReport), runtime = JSON.parse(runtimeBytes);
assert.equal(runtime.status,'GENERATED_MODELICA_KERNEL_METRICS_MATCH_REFERENCE');
assert.equal(sha(read('profile.csv')),runtime.csvSha256);
const csv = read('profile.csv').toString().trim().split('\n').slice(1).map(line=>line.split(',').map(Number));
assert.equal(csv.length,runtime.frameCount);
assert.equal(runtime.intervals.length,csv.length);
for (const [index, row] of csv.entries()) {
  assert.equal(row.length,30); assert.ok(row.every(Number.isFinite));
  assert.equal(row[5],1);
  assert.deepEqual(runtime.intervals[index],
    {frame:row[0],time:row[1],start:row[2],end:row[3],kernelMs:row[4]},'CSV interval differs');
}
assert.equal(sha(read('input.bin.json')),runtime.inputReportSha256);
assert.equal(JSON.parse(read('input.bin.json')).input.sha256,runtime.inputSha256);
assert.match(read('native.perf.header.txt').toString(),/# clockid: monotonic \(1\)/);
const windows = runtime.intervals.slice(1);
assert.equal(windows.length, runtime.frameCount-1);
assert.ok(windows.length > 0);
for (const [index, window] of windows.entries()) {
  assert.ok(Number.isFinite(window.start) && Number.isFinite(window.end)
    && window.start > 0 && window.end > window.start);
  assert.equal(window.frame,index+1);
  assert.ok(index === 0 || window.start >= windows[index-1].end,'Overlapping processing windows');
}
const groups = new Map(), threads = new Map(), owners = new Map(), copyOwners = new Map();
const examples = {};
let fastPeriod = 0;
function add(map, key, weight) {
  const entry = map.get(key) ?? {owner:key,samples:0,period:0};
  entry.samples++; entry.period += weight; map.set(key,entry);
}
let count = 0, included = 0, period = 0, outsidePeriod = 0, outsideCount = 0, unknown = 0, pid;
for (const block of read('native.perf.txt').toString().trim().split(/\n\s*\n/)) {
  const lines = block.split('\n');
  const header = lines[0].match(/^\s*driver\s+(\d+)\/(\d+)\s+(\d+\.\d+):\s+(\d+)\s+cycles:u:/);
  assert.ok(header,'Unexpected sampled process/event');
  pid ??= Number(header[1]); assert.equal(Number(header[1]),pid,'Mixed process owners');
  const tid = Number(header[2]), time = Number(header[3]), weight = Number(header[4]);
  assert.ok(Number.isFinite(weight) && weight > 0); count++;
  if (!windows.some(window => time >= window.start && time <= window.end)) {
    outsidePeriod += weight; outsideCount++; continue;
  }
  period += weight; included++;
  const stack = lines.slice(1).map(line=>line.trim().replace(/^[a-f0-9]+\s+/,''));
  const leaf = stack[0] ?? '<no stack>';
  if (leaf.includes('[unknown]') || leaf === '<no stack>') unknown++;
  const group = groups.get(leaf) ?? {leaf,samples:0,period:0};
  group.samples++; group.period += weight; groups.set(leaf,group);
  const thread = threads.get(tid) ?? {tid,samples:0,period:0};
  thread.samples++; thread.period += weight; threads.set(tid,thread);
  const name = symbol => symbol.split(' (')[0];
  const owner = stack.find(symbol=>symbol.startsWith('omc_') || /^\w+_copy_p /.test(symbol));
  add(owners,owner ? name(owner) : '<unmapped>',weight);
  if (stack.some(symbol=>name(symbol) === 'omc_FastFrameScores')) fastPeriod += weight;
  if (/^__memmove[^ ]* /.test(leaf) || /^memmove /.test(leaf)) {
    const copyOwner = stack.find(symbol=>/^\w+_copy_p /.test(symbol));
    add(copyOwners,copyOwner ? name(copyOwner) : '<unmapped>',weight);
    if (copyOwner?.startsWith('RGBDKeyframes_Catalog_copy_p ') && !examples.catalogCopy)
      examples.catalogCopy = {time,tid,stack};
  }
  if (/^calc_base_index_va /.test(leaf) && !examples.genericIndexing)
    examples.genericIndexing = {time,tid,stack};
}
const dump = read('native.perf.dump.txt').toString();
assert.equal(Number(dump.match(/SAMPLE events:\s+(\d+)/)?.[1]),count,'Sample inventory differs');
const lost = [...dump.matchAll(/PERF_RECORD_LOST(?:_SAMPLES)?\b/g)].length;
const throttle = [...dump.matchAll(/PERF_RECORD_THROTTLE\b/g)].length;
const unthrottle = [...dump.matchAll(/PERF_RECORD_UNTHROTTLE\b/g)].length;
assert.equal(lost,0,'Lost perf records'); assert.ok(included > 500 && period > 0);
const percent = row => ({...row,percent:100*row.period/period});
const leaves = [...groups.values()].sort((a,b)=>b.period-a.period).map(percent);
const share = pattern => leaves.filter(row=>pattern.test(row.leaf)).reduce((sum,row)=>sum+row.percent,0);
// Leaf groups are exclusive. Inclusive stacks and nearest owners are separate views.
const categories = new Map();
for (const row of leaves) {
  const symbol = row.leaf.split(' (')[0];
  const category = /^(?:__)?mem(?:move|cpy)/.test(symbol) ? 'memoryCopy'
    : /^(?:calc_base_index|generic_array_get|integer_get|getIndex|real_get|boolean_get|string_get)/.test(symbol)
      ? 'indexing'
    : /^(?:GC_|omc_alloc|alloc_|.*_alloc_|array_alloc_scalar)/.test(symbol) ? 'allocationAndGC'
    : row.leaf.includes('[unknown]') || symbol === '<no stack>' ? 'unresolved' : 'other';
  const value = categories.get(category) ?? {category,samples:0,period:0};
  value.samples += row.samples; value.period += row.period; categories.set(category,value);
}
assert.equal([...categories.values()].reduce((sum,row)=>sum+row.period,0),period);
const sorted = map => [...map.values()].sort((a,b)=>b.period-a.period).map(percent);
const report = {status:'NATIVE_MODELICA_PROCESSING_PERF_WINDOWS_VERIFIED',pid,
  samples:count,includedSamples:included,outsideCount,outsidePeriod,period,lost,unknown,throttle,unthrottle,
  threads:[...threads.values()].map(percent),leaves,
  categories:[...categories.values()].map(percent),
  nearestSourceOwners:sorted(owners),memmoveRecordOwners:sorted(copyOwners),examples,
  shares:{threeLargestLeaves:leaves.slice(0,3).reduce((sum,row)=>sum+row.percent,0),
    selectedIndexSymbols:share(/^(?:calc_base_index|generic_array_get|integer_get|getIndex)/),
    inclusiveFastFrameScores:100*fastPeriod/period},
  sourceRuntimeSha256:sha(runtimeBytes),sourceInputSha256:runtime.inputSha256,
  inputs:Object.fromEntries(['profile.csv','input.bin.json','native.perf.data','native.perf.txt','native.perf.dump.txt',
    'native.perf.header.txt'].map(name=>{const bytes=read(name);return[name,{sha256:sha(bytes),bytes:bytes.length}];})),
  analyzerSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'Leaf cycles during the 96 actual native OMC processing calls, including all threads and '
    + 'unknown leaves in those windows. Excludes reset, first-image initialization and test transport. '
    + 'Leaf categories partition the denominator; nearest-source stack owners are another partition. '
    + 'Inclusive FAST stacks overlap the leaf categories and must not be added to them. '
    + 'Memmove owners use percentages of all processing cycles, not only memmove. '
    + 'Symbol and stack attribution is not causal proof or Rumoca cost.'};
fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,inputs:undefined,examples:undefined,
  nearestSourceOwners:report.nearestSourceOwners.slice(0,12),leaves:leaves.slice(0,15)}));
