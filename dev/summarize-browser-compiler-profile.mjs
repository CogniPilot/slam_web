// Weighted worker CPU samples, grouped across repeated/recursive stack nodes.
// This profiles compilation, not the executable's SLAM runtime throughput.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const [input,output]=process.argv.slice(2);
if(!output)throw Error('Expected WORKER_PROFILE SUMMARY');
const raw=fs.readFileSync(input),record=JSON.parse(raw),profile=record.profile;
if(record.status!=='ACTUAL_WORKER_CPU_PROFILE_CAPTURED'||!profile
  ||profile.samples.length!==profile.timeDeltas.length)throw Error('Incomplete worker CPU profile');
const nodes=new Map(profile.nodes.map(node=>[node.id,node])),parents=new Map();
for(const node of nodes.values())for(const child of node.children??[])parents.set(child,node.id);
const key=node=>JSON.stringify([node.callFrame.functionName,
  node.callFrame.url.endsWith('/compiler.wasm')?'compiler.wasm':node.callFrame.url]);
const self=new Map(),inclusive=new Map();let total=0;
for(let index=0;index<profile.samples.length;index++){
  const duration=profile.timeDeltas[index];
  if(!Number.isFinite(duration)||duration<0)throw Error('Invalid sample duration');
  total+=duration;let id=profile.samples[index];
  if(!nodes.has(id))throw Error('Sample has no stack node');
  const leaf=key(nodes.get(id));self.set(leaf,(self.get(leaf)??0)+duration);
  const visitedIds=new Set(),visitedGroups=new Set();
  while(id!==undefined){
    if(visitedIds.has(id)||!nodes.has(id))throw Error('Invalid profile stack');
    visitedIds.add(id);visitedGroups.add(key(nodes.get(id)));id=parents.get(id);
  }
  for(const group of visitedGroups)inclusive.set(group,(inclusive.get(group)??0)+duration);
}
if(total<=0)throw Error('Empty profile');
const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([group,duration])=>{
  const [name,url]=JSON.parse(group);return {name,url,milliseconds:duration/1000,percent:100*duration/total};
});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const summary={status:record.status,sourceSha256:record.sourceSha256,compilerModuleSha256:record.compilerModuleSha256,
  compiler:record.compiler,profileSha256:sha(raw),analysisSha256:sha(fs.readFileSync(import.meta.filename)),
  samples:profile.samples.length,durationMs:(profile.endTime-profile.startTime)/1000,sampledMs:total/1000,
  self:top(self),inclusive:top(inclusive),
  worker:record.worker,
  scope:'Diagnostic actual dedicated-worker CPU samples. Worker identity and sampled window come from the original capture. Repeated function stack nodes are grouped; recursive inclusive samples count once per group. Unnamed WASM indices remain explicit. No whole-pipeline throughput or source-symbol attribution is inferred.'};
fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({samples:summary.samples,sampledMs:summary.sampledMs,self:summary.self.slice(0,5)}));
