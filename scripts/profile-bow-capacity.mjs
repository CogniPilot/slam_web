import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const path=process.argv[2],capacity=Number(process.argv[3]),output=process.argv[4]??path;
const artifact=JSON.parse(await readFile(path+'.json')),source=await readFile(path+'.mo','utf8');
import {researchNativeProgram} from './research-native-program.mjs';
const program=await researchNativeProgram(artifact,source);
const input=(name)=>program.input(name);
const value=(name,n)=>input(name)[0]=n;
const vocabulary=input('vocabulary');
let seed=7;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32;};
for(let i=0;i<vocabulary.length;i++)vocabulary[i]=random();
input('vocabularyEnabled').fill(1);input('descriptorEnabled').fill(1);value('descriptorCount',350);
input('previousEnabled').fill(1);value('previousVersion',1);value('previousTime',2*capacity);value('timeNow',2*capacity+10);value('queryKeyframeId',capacity+1);
for(let i=0;i<capacity;i++){
 input('previousKeyframeId')[i]=i+1;input('previousKeyframeTime')[i]=i*2;
 for(let j=0;j<8;j++)input('previousHistogram')[i*256+(i*7+j)%256]=1/8;
}
const quantile=(a,p)=>{const t=(a.length-1)*p,i=Math.floor(t);return a[i]+(a[Math.ceil(t)]-a[i])*(t-i);};
const results=[];
for(const queryWords of [8,256]){
 for(let i=0;i<350;i++)input('descriptor').set(vocabulary.subarray((i%queryWords)*49,(i%queryWords+1)*49),i*49);
 for(let i=0;i<30;i++)program.evaluate(0);
 const checks=Object.fromEntries(['configurationValid','retrievalValid','assignmentCount','candidateCount','invalidHistoryCount'].map(name=>[name,program.output(name)[0]]));
 if(checks.configurationValid!==1||checks.retrievalValid!==1||checks.assignmentCount!==350||checks.invalidHistoryCount!==0)throw Error('Invalid kernel fixture: '+JSON.stringify(checks));
 const words=Array.from(program.output('wordIndex'));
 if(words.some((word,i)=>word!==i%queryWords+1))throw Error('Word assignment differs from seeded fixture');
 const samples=[],cpuStart=process.cpuUsage(),rssStart=process.memoryUsage().rss;
 for(let i=0;i<100;i++){const start=performance.now();program.evaluate(0);samples.push(performance.now()-start);}
 const cpu=process.cpuUsage(cpuStart);const timesMs=[...samples];samples.sort((a,b)=>a-b);
 results.push({queryWords,wordAssignmentsExact:true,timesMs,samples:100,warmup:30,p50Ms:quantile(samples,.5),p95Ms:quantile(samples,.95),cpuMs:(cpu.user+cpu.system)/1000,rssStart,rssEnd:process.memoryUsage().rss,checks,candidateIds:Array.from(program.output('candidateId')),candidateScores:Array.from(program.output('candidateScore'))});
}
const receipt={recordedAt:new Date().toISOString(),capacity,features:350,vocabulary:256,descriptorDimensions:49,compiler:artifact.compiler,sourceSha256:artifact.source_sha256,moduleSha256:artifact.module_sha256,linearMemoryBytes:program.memory.buffer.byteLength,reportedRusageMaxRssKiB:process.resourceUsage().maxRSS,rusageCaveat:'Inherited launcher high-water marks may inflate this field; use observed start/end RSS, not this number for steady memory comparisons.',node:process.version,results,scope:'Research-only schema89 ABI consumer; production loader unchanged. Actual production RetrieveVisualWords source lowered by pinned Rumoca to WASM, only keyframeCapacity changed. Synthetic sparse histories and query fixtures. Node runtime process/metadata included; compiler process excluded. NOT full SLAM, graph, descriptor matching or browser benchmark.'};
await writeFile(output+'-timing.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
