// Aggregate self samples by function rather than by call-tree node. The same
// function can occur at many nodes (especially in recursive compiler walks).
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('PROFILE_JSON SUMMARY_JSON required');
if (fs.existsSync(output)) throw new Error('Choose a fresh summary path');
const raw = fs.readFileSync(input);
const capture = JSON.parse(raw);
if (capture.status !== 'ACTUAL_WORKER_CPU_PROFILE_CAPTURED') throw new Error('No actual worker profile to summarize');
const {nodes, samples, timeDeltas, startTime, endTime} = capture.profile;
if (samples.length !== timeDeltas.length) throw new Error('Profile sample/delta counts differ');
const byId = new Map(nodes.map(node => [node.id, node.callFrame]));
const functions = new Map();
let total = 0;
for (let index = 0; index < samples.length; index++) {
  const frame = byId.get(samples[index]);
  if (!frame) throw new Error('Sample references an unknown call-tree node');
  const key = JSON.stringify(frame);
  const entry = functions.get(key) ?? {frame, sampledUs:0, samples:0};
  entry.sampledUs += timeDeltas[index]; entry.samples++;
  functions.set(key, entry); total += timeDeltas[index];
}
const summary = {
  status:'ACTUAL_WORKER_CPU_PROFILE_SUMMARY',
  profileSha256:createHash('sha256').update(raw).digest('hex'),
  sourceSha256:capture.sourceSha256, compilerModuleSha256:capture.compilerModuleSha256,
  compiler:capture.compiler, scope:capture.scope,
  samples:samples.length, durationMs:(endTime-startTime)/1000, sampledMs:total/1000,
  attribution:'Self samples aggregated across call-tree nodes. WASM indices are not Rust function names.',
  functions:[...functions.values()].sort((a,b)=>b.sampledUs-a.sampledUs).map(({frame,sampledUs,samples})=>({
    ...frame,samples,sampledMs:sampledUs/1000,percent:total?100*sampledUs/total:0,
  })),
};
fs.writeFileSync(output, `${JSON.stringify(summary,null,2)}\n`);
console.log(JSON.stringify({...summary,functions:summary.functions.slice(0,12)},null,2));
