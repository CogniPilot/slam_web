// Freeze application sources and serve a separate build; never replace the preview.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'vite';

const repo=process.cwd(),output=path.resolve(process.argv[2]??'');
if(!process.argv[2]||fs.existsSync(output))throw Error('A fresh output directory is required');
fs.mkdirSync(output,{recursive:true});
const scratchRoot=path.join(os.homedir(),'scratch/slam_web/build');fs.mkdirSync(scratchRoot,{recursive:true});
const scratch=fs.realpathSync(fs.mkdtempSync(path.join(scratchRoot,'pipeline-')));
const measuredFrames=Number(process.env.SLAM_PIPELINE_FRAMES??30);
if(!Number.isInteger(measuredFrames)||measuredFrames<10||measuredFrames>1800)throw Error('SLAM_PIPELINE_FRAMES must be10..1800');
const source=path.join(scratch,'source'),dist=path.join(scratch,'static');
const files=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)):[path.join(root,e.name)]).sort();
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceFiles=[...files(path.join(repo,'src')),...files(path.join(repo,'models')),
  ...['index.html','package.json','package-lock.json','scripts/profile-browser.mjs','dev/chromium-native-profile.mjs','dev/profile-session-instrumentation.mjs','dev/profile-frozen-pipeline.mjs'].map(f=>path.join(repo,f))];
const inventory=()=>sourceFiles.map(file=>({path:path.relative(repo,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
const before=inventory();fs.writeFileSync(path.join(output,'sources-before.json'),JSON.stringify(before,null,2));
for(const entry of before){const target=path.join(source,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(repo,entry.path),target);if(sha(fs.readFileSync(target))!==entry.sha256)throw Error(`Freeze raced: ${entry.path}`);}
fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'node_modules'),'dir');
let server;const served=new Map();
const sampleHost=()=>({time:new Date().toISOString(),loadAverage:os.loadavg(),stat:fs.readFileSync('/proc/stat','utf8').split('\n')[0],affinity:fs.readFileSync('/proc/self/status','utf8').match(/^Cpus_allowed_list:\s+(.+)$/m)?.[1]});
try{
  await build({root:source,configFile:false,base:'/',publicDir:false,worker:{format:'es'},logLevel:'error',build:{outDir:dist,target:'es2022',sourcemap:true}});
  server=http.createServer((req,res)=>{
    if(req.url==='/favicon.ico'){res.writeHead(204).end();return;}
    try{
      const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const built=path.resolve(dist,'.'+name),publicRoot=path.join(repo,'public'),asset=path.resolve(publicRoot,'.'+name);
      if(!built.startsWith(dist+path.sep)&&built!==dist)throw Error('Unsafe path');
      if(!asset.startsWith(publicRoot+path.sep)&&asset!==publicRoot)throw Error('Unsafe path');
      const file=name==='/'?path.join(dist,'index.html'):fs.existsSync(built)?built:asset,bytes=fs.readFileSync(file);
      served.set(file,{path:path.relative(repo,file),bytes:bytes.length,sha256:sha(bytes)});
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.glb':'model/gltf-binary'}[path.extname(file)]??'application/octet-stream';
      res.writeHead(200,{'Content-Type':mime});res.end(bytes);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const rows=[],hostBefore=sampleHost();
  const readbackMatrix=process.env.SLAM_PIPELINE_READBACK_MATRIX==='1';
  const sensorDiagnostic=process.env.SLAM_PIPELINE_SENSOR_DIAGNOSTIC;
  if(sensorDiagnostic&&!['sync','async'].includes(sensorDiagnostic))throw Error('SLAM_PIPELINE_SENSOR_DIAGNOSTIC must be sync or async');
  if(sensorDiagnostic&&readbackMatrix)throw Error('Select a timing matrix or a sensor diagnostic');
  const modes=[{detail:'low'},{detail:'medium'},{detail:'high'},{detail:'medium',profile:true}];
  if(process.env.SLAM_PIPELINE_GPU_DIAGNOSTIC==='1')modes.push({detail:'medium',profile:'gpu'});
  if(readbackMatrix){
    const cases=[false,true].flatMap(allSensors=>[
      {detail:'medium',allSensors,readback:'sync',packed:true},
      {detail:'medium',allSensors,readback:'async',packed:true},
      {detail:'medium',allSensors,readback:'async',packed:false},
    ]);
    // Reverse the second sweep to expose warmup/order/shared-host effects.
    modes.splice(0,modes.length,...cases.map(c=>({...c,repeat:1})),...cases.toReversed().map(c=>({...c,repeat:2})));
  }
  if(sensorDiagnostic)modes.splice(0,modes.length,...[false,true,'gpu'].map(profile=>({detail:'medium',allSensors:true,readback:sensorDiagnostic,packed:true,profile})));
  const throughputOnly=process.env.SLAM_PIPELINE_THROUGHPUT_ONLY==='1';
  if(throughputOnly){if(!sensorDiagnostic)throw Error('Throughput-only requires a sensor diagnostic configuration');modes.splice(1);}
  const sessionDiagnostic=process.env.SLAM_PIPELINE_SESSION_DIAGNOSTIC==='1';
  if(sessionDiagnostic){if(!sensorDiagnostic||throughputOnly||readbackMatrix)throw Error('Session diagnostic requires the sensor diagnostic configuration alone');modes.splice(1);}
  for(const {detail,profile,allSensors,readback,packed,repeat} of modes){
    const gpu=profile==='gpu',cpu=profile===true;
    const name=sessionDiagnostic?'camera-cloud-lidar-session-profile':readbackMatrix?`${allSensors?'camera-cloud-lidar':'camera'}-${readback}-${packed?'packed':'separate'}-${repeat}`:sensorDiagnostic?`camera-cloud-lidar-${readback}-packed${gpu?'-gpu-profile':cpu?'-profile':''}`:detail+(gpu?'-gpu-profile':cpu?'-profile':''),run=path.join(scratch,name);fs.mkdirSync(run);
    const env={...process.env,SLAM_PROFILE_URL:`http://127.0.0.1:${server.address().port}/`,SLAM_PROFILE_BUNDLE_DIR:dist,
      SLAM_PROFILE_OUT:run,SLAM_PROFILE_FRAMES:String(gpu?10:cpu?Math.max(60,measuredFrames):measuredFrames),SLAM_PROFILE_DETAIL:detail,SLAM_PROFILE_DEPTH_CLOUD:allSensors?'1':'0',
      SLAM_PROFILE_LIDAR:allSensors?'1':'0',SLAM_PROFILE_CPU_PROFILING:cpu?'1':'0',SLAM_PROFILE_GPU_TIMERS:gpu?'1':'0'};
    if(readbackMatrix||sensorDiagnostic){env.SLAM_PROFILE_READBACK=readback;env.SLAM_PROFILE_PACKED_READBACK=packed?'1':'0';}
    if(sessionDiagnostic)env.SLAM_PROFILE_SESSION_TIMING='1';
    if(!cpu)delete env.SLAM_PROFILE_PERF;
    const fd=fs.openSync(path.join(run,'driver.log'),'w');
    const child=spawn(process.execPath,[path.join(source,'scripts/profile-browser.mjs')],{cwd:source,env,stdio:['ignore',fd,fd]});fs.closeSync(fd);
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    if(code!==0)throw Error(`Profile ${name} failed (${code}); see ${run}/driver.log`);
    const timings=JSON.parse(fs.readFileSync(path.join(run,'timings.json')));
    const profiles=[];
    for(const filename of fs.readdirSync(run).filter(f=>f.endsWith('.cpuprofile'))){
      const data=JSON.parse(fs.readFileSync(path.join(run,filename))),nodes=new Map(data.nodes.map(n=>[n.id,n.callFrame])),weighted=new Map();let total=0;
      for(let i=0;i<data.samples.length;i++){const frame=nodes.get(data.samples[i]),us=data.timeDeltas[i];total+=us;const key=JSON.stringify(frame);const row=weighted.get(key)??{frame,us:0};row.us+=us;weighted.set(key,row);}
      profiles.push({file:filename,sha256:sha(fs.readFileSync(path.join(run,filename))),topSelf:[...weighted.values()].sort((a,b)=>b.us-a.us).slice(0,25).map(r=>({...r,percent:100*r.us/total}))});
    }
    rows.push({name,summary:timings.summary,profiles,rawHomeRelative:path.relative(os.homedir(),run)});
    fs.copyFileSync(path.join(run,'timings.json'),path.join(output,`${name}-timings.json`));
    console.log(JSON.stringify({name,simulationRate:timings.summary.simulationRate,meanNodeMs:timings.summary.meanNodeMs,profiles}));
  }
  const after=inventory(),sourceBookendsEqual=JSON.stringify(before)===JSON.stringify(after),assetsBookendsEqual=[...served].every(([file,e])=>sha(fs.readFileSync(file))===e.sha256);
  fs.writeFileSync(path.join(output,'sources-after.json'),JSON.stringify(after,null,2));
  if(!sourceBookendsEqual||!assetsBookendsEqual)throw Error('Sources/assets changed during profiling');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({recordedAt:new Date().toISOString(),rows,hostBefore,hostAfter:sampleHost(),sourceBookendsEqual,assetsBookendsEqual,served:[...served.values()],scratchHomeRelative:path.relative(os.homedir(),scratch),scope:sessionDiagnostic?
    'Frozen native camera + Modelica inertial baseline, depth cloud and64-beam LiDAR. Opt-in instrumentation of actual Rumoca session APIs, worker receive-to-send and main RPC wall intervals. Timings are nested and include diagnostic overhead; not an uninstrumented throughput claim or full SLAM measurement. Owned resources externally bounded.':throughputOnly?
    'Frozen camera + Modelica inertial baseline at balanced fidelity with native RGB8/Z16, GPU noise, depth cloud and64-beam LiDAR. Uninstrumented throughput only. Explicit sensor clocks and capture settings retained in report. Full native vision/SLAM and direct compiler-owned input windows are not measured. Shared host; externally bounded owned resources.':sensorDiagnostic?
    'Frozen camera + Modelica inertial baseline at balanced fidelity with native RGB8/Z16, GPU noise, depth cloud and64-beam LiDAR. Three separate captures: uninstrumented throughput, CDP/perf CPU diagnostic, GPU timer diagnostic. Diagnostic timings include instrumentation overhead and are not throughput comparisons. Full native vision/SLAM and direct compiler-owned input windows are not measured. Shared host; externally bounded owned resources.':readbackMatrix?
    'Frozen camera + Modelica inertial baseline at balanced fidelity, native848x480 RGB8/Z16 with GPU noise, actors on. Matched sync-packed / async-packed / async-separate capture paths, camera-only and camera+depth-cloud+64-beam-LiDAR workloads, two sweeps with reversed order. All measurements disable CPU/GPU sampling. Sensor rates and enabled streams are recorded per run. No native detector/full SLAM or direct compiler-owned input window is measured. Shared host, bounded owned resources; short transport comparison, not full-SLAM acceptance.':
    'Frozen current camera + Modelica inertial baseline, native848x480 RGB-D with GPU noise, production fidelity-dependent sensor clocks, actors on, depth cloud and LiDAR off. Native vision and full SLAM pending; retired detector absent. Three uninstrumented throughput runs and separate medium CDP/perf diagnostic. Raw profiles/builds in scratch. Host shared; owned jobs limited by external guard. This is a different workload from historical Harris campaigns and is not a SLAM speedup measurement.'},null,2));
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:String(error.stack||error),scratchHomeRelative:path.relative(os.homedir(),scratch)},null,2));throw error;}
finally{if(server)await new Promise(resolve=>server.close(resolve));}
