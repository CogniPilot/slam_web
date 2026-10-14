import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

/** Aggregate leaf (self) samples across threads; idle time is excluded.
 * JavaScript includes app TypeScript, Three.js and compiler-generated glue.
 * These are sampled CPU proportions, not wall time or predicted speedups. */
export async function summarizeCpuProfiles(directory){
  const profiles=JSON.parse(await readFile(join(directory,'profiles.json'),'utf8'));
  const threads=[],aggregateMs={wasm:0,javascript:0,gc:0,native_or_unattributed:0};
  for(const {role,file} of profiles){
    const profile=JSON.parse(await readFile(join(directory,file),'utf8'));
    const nodes=new Map(profile.nodes.map(node=>[node.id,node.callFrame]));
    const groupsMs={idle:0,wasm:0,javascript:0,gc:0,native_or_unattributed:0};
    const functions=new Map();
    for(let i=0;i<(profile.samples?.length??0);i++){
      const frame=nodes.get(profile.samples[i]);if(!frame)continue;
      const ms=(profile.timeDeltas?.[i]??0)/1000;
      const category=frame.functionName==='(idle)'?'idle':frame.functionName==='(garbage collector)'?'gc':
        frame.url.startsWith('wasm:')||/\.wasm(?:$|[?#])/.test(frame.url)||frame.functionName.startsWith('wasm-function[')?'wasm':
        frame.url&&!frame.functionName.startsWith('(')?'javascript':'native_or_unattributed';
      groupsMs[category]+=ms;
      if(category!=='idle'){
        const key=`${frame.url}:${frame.functionName}:${frame.lineNumber}:${frame.columnNumber}`;
        const entry=functions.get(key)??{...frame,category,selfMs:0};entry.selfMs+=ms;functions.set(key,entry);
      }
    }
    const activeMs=Object.entries(groupsMs).filter(([key])=>key!=='idle').reduce((sum,[,ms])=>sum+ms,0);
    threads.push({role,groupsMs,activeMs,jsPercentOfActive:activeMs?100*groupsMs.javascript/activeMs:0,
      hottest:Array.from(functions.values()).sort((a,b)=>b.selfMs-a.selfMs).slice(0,15)});
    for(const key of Object.keys(aggregateMs))aggregateMs[key]+=groupsMs[key];
  }
  const activeMs=Object.values(aggregateMs).reduce((sum,ms)=>sum+ms,0);
  const result={threads,aggregateMs,activeMs,aggregatePercent:Object.fromEntries(Object.entries(aggregateMs).map(([key,ms])=>[key,activeMs?100*ms/activeMs:0])),
    scope:'Leaf CPU samples weighted by timeDelta, across all recorded threads. Idle excluded. JavaScript includes TypeScript, dependencies and generated glue. Native/unattributed includes browser bindings; this does not measure GPU utilization.'};
  await writeFile(join(directory,'attribution.json'),JSON.stringify(result,null,2)+'\n');return result;
}
