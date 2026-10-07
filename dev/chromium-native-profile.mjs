import {readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

async function threads(processes){
  const values=[];
  for(const process of processes){
    let tasks;try{tasks=await readdir(`/proc/${process.id}/task`);}catch{continue;}
    for(const tid of tasks){
      const base=`/proc/${process.id}/task/${tid}`;
      try{
        const stat=await readFile(base+'/stat','utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);
        const sched=(await readFile(base+'/schedstat','utf8')).trim().split(/\s+/).map(Number);
        values.push({pid:process.id,tid:Number(tid),processType:process.type,name:(await readFile(base+'/comm','utf8')).trim(),
          birth:fields[19],userTicks:Number(fields[11]),systemTicks:Number(fields[12]),runNs:sched[0],runnableWaitNs:sched[1]});
      }catch{/* A owned thread can exit between reads. */}
    }
  }
  return values;
}

/** Metadata and scheduler accounting for this browser only; no system sampling. */
export async function nativeProfileMetadata(root,output,processes){
  const clockTicks=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim());
  const before=await threads(processes);
  await writeFile(path.join(output,'owned-browser-processes.json'),JSON.stringify(processes,null,2));
  await root.send('Tracing.start',{transferMode:'ReturnAsStream',traceConfig:{recordMode:'recordContinuously',
    includedCategories:['__metadata','devtools.timeline','disabled-by-default-devtools.timeline','blink.worker','gpu']}});
  return async()=>{
    const after=await threads(processes),previous=new Map(before.map(t=>[`${t.pid}/${t.tid}/${t.birth}`,t]));
    const deltas=after.flatMap(t=>{
      const b=previous.get(`${t.pid}/${t.tid}/${t.birth}`);if(!b)return [];
      return [{...t,activeCpuMs:((t.userTicks+t.systemTicks)-(b.userTicks+b.systemTicks))/clockTicks*1000,
        scheduledRunMs:(t.runNs-b.runNs)/1e6,runnableWaitMs:(t.runnableWaitNs-b.runnableWaitNs)/1e6}];
    });
    await writeFile(path.join(output,'thread-accounting.json'),JSON.stringify({clockTicks,scope:'Per-thread CPU and runnable-queue wait; these do not attribute idle or GPU-blocked time',before,after,deltas},null,2));
    const complete=new Promise(resolve=>root.once('Tracing.tracingComplete',resolve));
    await root.send('Tracing.end');const {stream}=await complete;
    let trace='';
    try{while(true){const chunk=await root.send('IO.read',{handle:stream});trace+=chunk.base64Encoded?Buffer.from(chunk.data,'base64').toString():chunk.data;if(chunk.eof)break;}}
    finally{await root.send('IO.close',{handle:stream});}
    await writeFile(path.join(output,'chromium-trace.json'),trace);
    const events=JSON.parse(trace).traceEvents;
    const metadata=events.filter(event=>event.ph==='M'||/Tracing.*Worker|TracingStarted/.test(event.name));
    const sensorEvents=events.filter(event=>JSON.stringify(event.args??{}).includes('sensor-render.worker'));
    await writeFile(path.join(output,'thread-metadata.json'),JSON.stringify({metadata,sensorEvents},null,2));
    const maps=[];
    for(const process of processes){
      const source=`/tmp/perf-${process.id}.map`;
      try{await copyFile(source,path.join(output,`perf-${process.id}.map`));maps.push({pid:process.id,file:`perf-${process.id}.map`});}catch{/* V8 may not issue a map for a native-only process. */}
    }
    await writeFile(path.join(output,'v8-perf-maps.json'),JSON.stringify(maps,null,2));
  };
}
