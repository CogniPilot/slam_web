import {chromiumLaunchOptions} from './browser-launch.mjs';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,readdir,rename,open} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';

const [inputsRoot,captureRoot,cacheRoot,scene,output]=process.argv.slice(2);
const paced=process.env.SLAM_COMPARISON_PACED!=='0';
if(!output||!['city','warehouse','hallway','office-loop'].includes(scene))throw Error('Usage: run-modelica-worker-comparison.mjs INPUTS CAPTURE CACHE SCENE NEW_OUTPUT');
await mkdir(output);
const poseFile=await open(join(output,'poses.json.tmp'),'wx');
await poseFile.write('[');
let interrupted=false;process.once('SIGINT',()=>{interrupted=true;});process.once('SIGTERM',()=>{interrupted=true;});
const sha=b=>createHash('sha256').update(b).digest('hex');
const runnerSha256=sha(await readFile(new URL(import.meta.url)));
const raw=await readFile(join(inputsRoot,'sensors.json'));
const seal=JSON.parse(await readFile(join(inputsRoot,'manifest.json'),'utf8'));
if(sha(raw)!==seal.sensorsSha256)throw Error('Sensor metadata integrity failure');
const frames=JSON.parse(raw).sensorFrames.filter(f=>f.scene===scene);
const cacheReceipt=JSON.parse(await readFile(join(cacheRoot,'receipt.json'),'utf8'));
const configuration=JSON.parse(await readFile(join(cacheRoot,'configuration.json'),'utf8'));
const allowed=new Map([['/','<html><body>Isolated published Modelica worker replay</body></html>'],
  ['/modelica-slam.worker.ts',await readFile(join(cacheRoot,'worker.js'))],
  ['/client.mjs',await readFile(join(cacheRoot,'client.mjs'))],
  ['/vendor/slam/manifest.json',await readFile(join(cacheRoot,'vendor/slam/manifest.json'))]]);
if(sha(allowed.get('/modelica-slam.worker.ts'))!==cacheReceipt.workerSha256)throw Error('Worker integrity failure');
for(const entry of cacheReceipt.files){
  const bytes=await readFile(join(cacheRoot,'vendor/slam',entry.file));
  if(sha(bytes)!==entry.storedSha256)throw Error('Cached asset integrity failure');
  allowed.set('/vendor/slam/'+entry.file,bytes);
}
const server=createServer((req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1').pathname,bytes=allowed.get(path);
  if(bytes===undefined){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',path.endsWith('.ts')||path.endsWith('.mjs')?'text/javascript':path==='/'?'text/html':'application/octet-stream');
  res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+'/';
let browserServer,browser,page,failure;const rows=[],resource=[];const cpuTicks=new Map();let peakRss=0,peakThreads=0;
const startedAt=new Date().toISOString(),wallStart=performance.now();
async function sample(root){
  const processes=[];
  for(const name of await readdir('/proc'))if(/^\d+$/.test(name))try{
    const stat=(await readFile('/proc/'+name+'/stat','utf8')).split(') ').slice(1).join(') ').trim().split(/\s+/);
    processes.push({pid:Number(name),ppid:Number(stat[1]),ticks:Number(stat[11])+Number(stat[12]),start:stat[19]});
  }catch{}
  const selected=new Set([root]);let changed=true;
  while(changed){changed=false;for(const p of processes)if(selected.has(p.ppid)&&!selected.has(p.pid)){selected.add(p.pid);changed=true;}}
  let rss=0,threads=0;
  for(const p of processes)if(selected.has(p.pid))try{
    const status=await readFile('/proc/'+p.pid+'/status','utf8');
    rss+=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1]??0);threads+=Number(status.match(/^Threads:\s+(\d+)/m)?.[1]??0);
    cpuTicks.set(p.pid+':'+p.start,p.ticks);
  }catch{}
  peakRss=Math.max(peakRss,rss);peakThreads=Math.max(peakThreads,threads);
  resource.push({elapsedMs:performance.now()-wallStart,rssKiB:rss,threads,loadAverage:(await readFile('/proc/loadavg','utf8')).trim().split(' ').slice(0,3).map(Number)});
}
try{
  browserServer=await chromium.launchServer({headless:true,handleSIGINT:false,handleSIGTERM:false,...chromiumLaunchOptions(),
    args:['--disable-gpu','--renderer-process-limit=1']});
  browser=await chromium.connect(browserServer.wsEndpoint());page=await browser.newPage();
  page.on('console',message=>console.log('browser:',message.text()));
  await page.goto(base);
  await page.evaluate(async()=>{const m=await import('/client.mjs');window.client=new m.ModelicaSlamClient(message=>console.log(message));});
  let previous=0;
  for(const [index,frame]of frames.entries()){
    if(interrupted)throw Error('Replay interrupted; partial poses retained');
    const frameStarted=performance.now();
    const images={};
    for(const kind of ['rgb','depth']){
      const entry=frame.images[kind],path=resolve(captureRoot,entry.path);
      if(!path.startsWith(resolve(captureRoot)+'/'))throw Error('Image path escape');
      const bytes=await readFile(path);if(bytes.length!==entry.bytes||sha(bytes)!==entry.sha256)throw Error('Image integrity failure');
      images[kind]=bytes.toString('base64');
    }
    const result=await page.evaluate(async({frame,images,base,configuration,index,dt})=>{
      const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
      const rgb=bytes(images.rgb),depthBytes=bytes(images.depth);
      const observation={...frame,rgb,depth:new Uint16Array(depthBytes.buffer),dt};
      const admission=performance.now();
      const result=index===0?await window.client.initialize(base,observation,undefined,configuration):await window.client.step(observation);
      return {index,time:frame.time,pageAdmissionMs:admission,admissionToPoseMs:performance.now()-admission,
        timings:window.client.lastTimings,result};
    },{frame,images,base,configuration,index,dt:index===0?0:frame.time-previous});
    if(index===0&&result.result.sourceSha256!==cacheReceipt.sourceSha256)throw Error('Worker loaded different Modelica source');
    await poseFile.write((index?',':'')+JSON.stringify(result));
    // Keep only timing metadata in the runner heap; map/feature histories are
    // already durable on disk and must not grow the replay coordinator's heap.
    previous=frame.time;rows.push({index,time:frame.time,timings:result.timings});
    if(index%25===0)console.log(JSON.stringify({scene,index,latencyMs:result.timings.roundTripMs}));
    await sample(browserServer.process().pid);
    if(index>0&&paced)await new Promise(r=>setTimeout(r,Math.max(0,200-(performance.now()-frameStarted))));
  }
}catch(error){failure=String(error);}finally{
  if(page)await page.evaluate(()=>window.client?.close()).catch(()=>{});
  if(browserServer)await sample(browserServer.process().pid).catch(()=>{});
  await browser?.close().catch(()=>{});await browserServer?.close().catch(()=>{});await new Promise(r=>server.close(r));
}
const latency=rows.slice(1).map(r=>r.timings.roundTripMs).sort((a,b)=>a-b);
const percentile=p=>latency[Math.ceil(p*latency.length)-1]??null;
const receipt={schema:1,startedAt,runnerSha256,scene,framesExpected:frames.length,framesCompleted:rows.length,
  mode:(paced?'paced5Hz':'unpaced')+' sequential sensor replay; source timestamps and captured IMU intervals preserved',
  workerSha256:cacheReceipt.workerSha256,sourceSha256:cacheReceipt.sourceSha256,
  clientBundleSha256:sha(allowed.get('/client.mjs')),configurationSha256:sha(await readFile(join(cacheRoot,'configuration.json'))),
  sensorMetadataSha256:sha(raw),runtime:cacheReceipt.researchInstrumentation?'research-instrumented Chromium Web Worker, production ModelicaSlamClient':'published Chromium Web Worker, production ModelicaSlamClient',
  ...(cacheReceipt.researchInstrumentation?{researchInstrumentation:cacheReceipt.researchInstrumentation}:{}),
  ...(cacheReceipt.researchConfiguration?{researchConfiguration:cacheReceipt.researchConfiguration}:{}),
  chromiumVersion:browser?.version(),wallSeconds:(performance.now()-wallStart)/1000,
  steadyStateRoundTripMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)},
  initializationMs:rows[0]?.timings.roundTripMs??null,sampledPeakRssKiB:peakRss,sampledPeakThreads:peakThreads,
  sampledCpuSeconds:[...cpuTicks.values()].reduce((a,b)=>a+b,0)/Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim()),
  cpuAffinity:execFileSync('taskset',['-pc',String(process.pid)],{encoding:'utf8'}).trim().split(': ').at(-1),
  resourceScope:'Chromium browser and all descendants including renderer/worker; replay Node/server excluded; no scene rendering or physics',failure:failure??null};
receipt.replayScope='Closed-loop sequential: Node image reads, IPC and per-frame resource sampling occur between requests. Unpaced wall includes harness overhead. Paced mode slows input when late; no open-loop queue/drop/throughput qualification.';
await poseFile.write(']\n');await poseFile.close();
await rename(join(output,'poses.json.tmp'),join(output,'poses.json'));
await writeFile(join(output,'resources.json'),JSON.stringify(resource)+'\n');
await writeFile(join(output,'receipt.json.tmp'),JSON.stringify(receipt,null,2)+'\n');
await rename(join(output,'receipt.json.tmp'),join(output,'receipt.json'));
console.log(JSON.stringify(receipt,null,2));if(failure)process.exitCode=1;
