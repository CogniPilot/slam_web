import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {researchNativeProgram} from './research-native-program.mjs';
const [stage,path,capacityText,output=path]=process.argv.slice(2),capacity=Number(capacityText);
if(!['matching','graph'].includes(stage)||!Number.isInteger(capacity)||capacity<2||(stage==='graph'?capacity>128:capacity!==350))
  throw Error('Usage: profile-slam-kernel.mjs matching|graph ARTIFACT_PREFIX GRAPH_CAPACITY_2_TO_128_OR_MATCHING_350');
const artifact=JSON.parse(await readFile(path+'.json')),source=await readFile(path+'.mo','utf8');
const program=await researchNativeProgram(artifact,source),input=name=>program.input(name),set=(name,x)=>input(name)[0]=x;
const identity=(array,dimension)=>{for(let i=0;i<array.length;i+=dimension*dimension)for(let j=0;j<dimension;j++)array[i+j*dimension+j]=1;};
const scenarios=stage==='graph'?['consistent-chain','drifted-chain-loop']:['full-350','active-100'];
const results=[];
for(const scenario of scenarios){
 if(stage==='graph'){
  if(input('nodeMask').length!==capacity||input('edgeMask').length!==2*capacity)throw Error('Graph layout differs from fixture');
  input('position').fill(0);input('rotation').fill(0);identity(input('rotation'),3);input('nodeMask').fill(1);
  input('edgeMask').fill(0);input('translation').fill(0);input('information').fill(0);input('measuredRotation').fill(0);
  identity(input('measuredRotation'),3);identity(input('information'),6);
  for(let i=0;i<capacity;i++)input('position')[i*3]=i*(scenario==='consistent-chain'?1:1.01);
  for(let edge=0;edge<capacity-1;edge++){
   input('edgeMask')[edge]=1;input('fromNode')[edge]=edge+1;input('toNode')[edge]=edge+2;input('translation')[edge*3]=1;
  }
  if(scenario==='drifted-chain-loop'){
   const edge=capacity-1;input('edgeMask')[edge]=1;input('fromNode')[edge]=1;input('toNode')[edge]=capacity;input('translation')[edge*3]=capacity-1;
  }
 }else{
  const active=scenario==='full-350'?350:100;
  let seed=7;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32;};
  for(let i=0;i<350;i++){
   let norm=0;const vector=Array.from({length:49},()=>random()-.5);for(const x of vector)norm+=x*x;
   for(let d=0;d<49;d++){const x=vector[d]/Math.sqrt(norm);input('referenceDescriptor')[i*49+d]=x;input('currentDescriptor')[i*49+d]=x;}
   input('referenceEnabled')[i]=i<active?1:0;input('currentEnabled')[i]=i<active?1:0;
   for(const name of ['referencePoint','currentPoint'])input(name).set([i*.001,0,2],i*3);
  }
  set('referenceCount',active);set('currentCount',active);set('usePrediction',0);
 }
 const warmup=30,samples=50;
 for(let i=0;i<warmup;i++)program.evaluate(0);
 const fields=stage==='graph'?['status','costBefore','costAfter','acceptedIterations','pcgIterations','activeNodes','activeEdges']:['configurationValid','invalidReference','invalidCurrent','count'];
 const checks=Object.fromEntries(fields.map(name=>[name,program.output(name)[0]]));
 if(stage==='graph'&&(!(checks.status>=1)||checks.activeNodes!==capacity||checks.costAfter>checks.costBefore+1e-9||
    (scenario==='drifted-chain-loop'&&(!(checks.acceptedIterations>0)||!(checks.costAfter<checks.costBefore)))))throw Error('Graph fixture failed: '+JSON.stringify(checks));
 if(stage==='matching'&&(checks.configurationValid!==1||checks.invalidReference!==0||checks.invalidCurrent!==0||checks.count!==(scenario==='full-350'?350:100)))throw Error('Matching fixture failed: '+JSON.stringify(checks));
 const times=[],rssStart=process.memoryUsage().rss,cpuStart=process.cpuUsage();
 for(let i=0;i<samples;i++){const t=performance.now();program.evaluate(0);times.push(performance.now()-t);}
 const cpu=process.cpuUsage(cpuStart),ordered=[...times].sort((a,b)=>a-b),quantile=p=>{const t=(ordered.length-1)*p,i=Math.floor(t);return ordered[i]+(ordered[Math.ceil(t)]-ordered[i])*(t-i);};
 results.push({scenario,checks,warmup,samples,p50Ms:quantile(.5),p95Ms:quantile(.95),timesMs:times,cpuMs:(cpu.user+cpu.system)/1000,rssStart,rssEnd:process.memoryUsage().rss});
}
const receipt={recordedAt:new Date().toISOString(),stage,capacity,compiler:artifact.compiler,sourceSha256:artifact.source_sha256,moduleSha256:artifact.module_sha256,linearMemoryBytes:program.memory.buffer.byteLength,node:process.version,
 cpuAffinity:execFileSync('taskset',['-pc',String(process.pid)],{encoding:'utf8'}).trim().split(': ').at(-1),loadAverage:(await readFile('/proc/loadavg','utf8')).trim(),results,
 scope:'CPU research, generated production Modelica functions lowered by pinned Rumoca. Synthetic inputs; same input restored implicitly because evaluation does not feed output back. Graph includes validation and optimizer, no covariance/commit/catalog. Matching is one descriptor pairing call, no RANSAC. No full SLAM bottleneck or mission-scale claim; production admission unchanged.'};
await writeFile(output+'-'+stage+'-timing.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
