// Full-resolution, static Three.js harness. Timings exclude rendering and SLAM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import {chromium} from '@playwright/test';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [destination]=process.argv.slice(2);
if(!destination)throw Error('A fresh evidence directory is required');
const output=path.resolve(destination);
if(fs.existsSync(output))throw Error('Evidence directory already exists');
fs.mkdirSync(output,{recursive:true});
const captures=Number(process.env.SLAM_TRANSPORT_CAPTURES??200),warmup=20;
if(!Number.isInteger(captures)||captures<10||captures>1000)throw Error('SLAM_TRANSPORT_CAPTURES must be10..1000');
const scratchRoot=path.join(os.homedir(),'scratch/slam_web/build');fs.mkdirSync(scratchRoot,{recursive:true});
const scratch=fs.realpathSync(fs.mkdtempSync(path.join(scratchRoot,'native-gpu-transport-'))),source=path.join(scratch,'source'),dist=path.join(scratch,'static');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n');
const files=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(root,entry.name)):[path.join(root,entry.name)]).sort();
const sourceFiles=[...files(path.join(repo,'src')),path.join(repo,'dev/native-gpu-transport-harness.ts'),fileURLToPath(import.meta.url),path.join(repo,'dev/rumoca-bounded-run.mjs'),path.join(repo,'package.json'),path.join(repo,'package-lock.json')];
const inventory=()=>sourceFiles.map(file=>({path:path.relative(repo,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
const before=inventory();json('sources-before.json',before);
for(const entry of before){
  const target=path.join(source,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(repo,entry.path),target);
  if(sha(fs.readFileSync(target))!==entry.sha256)throw Error(`Source freeze raced: ${entry.path}`);
}
fs.symlinkSync(path.join(repo,'node_modules'),path.join(source,'node_modules'),'dir');
fs.writeFileSync(path.join(source,'index.html'),'<!doctype html><title>Native GPU transport probe</title><script type="module" src="/harness.ts"></script>');
fs.writeFileSync(path.join(source,'harness.ts'),`import {prepareNativeGpuTransport} from './dev/native-gpu-transport-harness';\ntry{window.runTransport=await prepareNativeGpuTransport(${captures},${warmup});window.transportReady=true;}catch(error){window.transportFailure=String(error.stack||error);}\n`);
let server,browser;const errors=[],served=new Map();
function cpuSample(){
  const values=fs.readFileSync('/proc/stat','utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  return {time:new Date().toISOString(),total:values.slice(0,8).reduce((sum,value)=>sum+value,0),idle:values[3]+values[4],loadAverage:os.loadavg(),logicalCpus:os.cpus().length};
}
try{
  await build({root:source,configFile:false,base:'/',publicDir:false,worker:{format:'es'},logLevel:'error',build:{outDir:dist,target:'es2022',minify:false,sourcemap:true}});
  const built=files(dist).map(file=>({path:path.relative(dist,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}));
  fs.cpSync(dist,path.join(output,'built-harness'),{recursive:true});
  fs.cpSync(path.join(source,'src'),path.join(output,'sources/src'),{recursive:true});
  fs.cpSync(path.join(source,'dev'),path.join(output,'sources/dev'),{recursive:true});
  for(const name of ['package.json','package-lock.json'])fs.copyFileSync(path.join(source,name),path.join(output,'sources',name));
  const publicRoot=path.join(repo,'public');
  server=http.createServer((request,response)=>{
    if(request.url==='/favicon.ico'){response.writeHead(204).end();return;}
    try{
      const url=new URL(request.url,'http://localhost'),name=decodeURIComponent(url.pathname),builtFile=path.resolve(dist,'.'+name),asset=path.resolve(publicRoot,'.'+name);
      if((builtFile!==dist&&!builtFile.startsWith(dist+path.sep))||(asset!==publicRoot&&!asset.startsWith(publicRoot+path.sep)))throw Error('Unsafe path');
      const file=name==='/'?path.join(dist,'index.html'):fs.existsSync(builtFile)?builtFile:asset,bytes=fs.readFileSync(file);
      served.set(file,{path:path.relative(repo,file),sha256:sha(bytes),bytes:bytes.length});
      const mime={'.html':'text/html','.js':'text/javascript','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.hdr':'application/octet-stream','.glb':'model/gltf-binary'}[path.extname(file)]??'application/octet-stream';
      response.writeHead(200,{'Content-Type':mime});response.end(bytes);
    }catch(error){errors.push(String(error));response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--enable-gpu','--use-gl=angle','--use-angle=gl']});
  const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>window.transportReady||window.transportFailure,{},{timeout:60000});
  const failure=await page.evaluate(()=>window.transportFailure);if(failure)throw Error(failure);
  const hostBefore=cpuSample();
  const result=await page.evaluate(()=>window.runTransport());
  const hostAfter=cpuSample();
  // A fresh page owns its own completed capture and PBO pool. Keep sampling
  // overhead out of the first timing comparison and profile the same workload.
  await page.reload();
  await page.waitForFunction(()=>window.transportReady||window.transportFailure,{},{timeout:60000});
  const profileFailure=await page.evaluate(()=>window.transportFailure);if(profileFailure)throw Error(profileFailure);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});
  const profileHostBefore=cpuSample();await cdp.send('Profiler.start');
  const profiledResult=await page.evaluate(()=>window.runTransport());
  const {profile}=await cdp.send('Profiler.stop'),profileHostAfter=cpuSample();await cdp.detach();
  const rawProfile=JSON.stringify(profile),profileFile=path.join(scratch,'transport.cpuprofile');fs.writeFileSync(profileFile,rawProfile);
  const byId=new Map(profile.nodes.map(node=>[node.id,node.callFrame])),self=new Map();let totalUs=0;
  if(!profile.samples?.length||profile.samples.length!==profile.timeDeltas.length)throw Error('CPU profile is empty or malformed');
  for(let index=0;index<profile.samples.length;index++){
    const frame=byId.get(profile.samples[index]),delta=profile.timeDeltas[index];if(!frame||!(delta>=0))throw Error('Invalid CPU sample');
    const key=JSON.stringify(frame),entry=self.get(key)??{frame,sampledUs:0,samples:0};
    entry.sampledUs+=delta;entry.samples++;self.set(key,entry);totalUs+=delta;
  }
  const profileSummary={rawHomeRelative:path.relative(os.homedir(),profileFile),sha256:sha(rawProfile),samples:profile.samples.length,
    durationMs:(profile.endTime-profile.startTime)/1000,sampledMs:totalUs/1000,hostBefore:profileHostBefore,hostAfter:profileHostAfter,
    topSelfFrames:[...self.values()].sort((a,b)=>b.sampledUs-a.sampledUs).slice(0,30).map(entry=>({...entry,percent:100*entry.sampledUs/totalUs})),
    scope:'Separate full-workload CDP renderer CPU sampling pass after fresh page preparation. Weighted self samples include native browser stalls and competing host scheduling, not exact CPU execution time. No physics or Rumoca algorithm runs.'};
  json('cpu-profile-summary.json',profileSummary);
  const after=inventory();json('sources-after.json',after);
  const sourceBookendsEqual=JSON.stringify(before)===JSON.stringify(after);
  const assetsBookendsEqual=[...served].every(([file,entry])=>sha(fs.readFileSync(file))===entry.sha256);
  if(!sourceBookendsEqual||!assetsBookendsEqual||errors.length)throw Error('Source/asset bookends or browser errors failed');
  for(const row of result.rows){
    row.aggregates=['buffered-bottom-up','direct-bottom-up','buffered-top-down','direct-gpu-top-down','buffered-gpu-top-down'].map(mode=>{
      const windows=row.windows.filter(window=>window.mode===mode),count=windows.reduce((sum,window)=>sum+window.captures,0);
      const per=key=>windows.reduce((sum,window)=>sum+window[key],0)/count;
      return {mode,captures:count,meanWallMs:per('wallMs'),meanReadbackMs:per('readbackMs'),meanHandoffMs:per('handoffMs')};
    });
  }
  const report={schemaVersion:1,status:'NATIVE_GPU_TRANSPORT_PARITY_AND_PROFILE_PASS',recordedAt:new Date().toISOString(),browser:browser.version(),
    ...result,capturesPerWindow:captures,warmupPerWindow:warmup,sourceBookendsEqual,assetsBookendsEqual,sources:before,built,served:[...served.values()],errors,
    cpuProfile:profileSummary,profiledPass:{observedDirectCopies:profiledResult.observedDirectCopies,rows:profiledResult.rows},
    host:{before:hostBefore,after:hostAfter,busyPercent:100*(1-(hostAfter.idle-hostBefore.idle)/(hostAfter.total-hostBefore.total)),processAffinity:fs.readFileSync('/proc/self/status','utf8').match(/^Cpus_allowed_list:\s+(.+)$/m)?.[1]},
    scratchHomeRelative:path.relative(os.homedir(),scratch),rumocaInputAbiCompatible:false,fullSlam:false,probeChangesProduction:false,
    scope:'Native calibrated RGB RGBA8 and axial depth F32-in-RGBA8 plus optional dense64-beam GPU LiDAR. One fixed scene pose, already rendered targets; no scene render, physics, CV, compiler or worker-RPC cost in timed windows. GPU-top-down modes include framebuffer blits on each capture. Direct destination is unshared WebAssembly.Memory, not a Rumoca-issued typed input. Bottom-up and top-down layouts are deliberately distinct. Byte equality, production top-down parity and guard checks; mirrored five-mode ordering reversed in repetition2. Host busy includes competing jobs. No full-pipeline or10x claim.'};
  json('report.json',report);console.log(JSON.stringify({directory:output,status:report.status,graphics:report.graphics,host:report.host,rows:report.rows.map(({windows,...row})=>row)}));
}catch(error){json('failure.json',{error:String(error.stack||error),errors,sources:before,scratchHomeRelative:path.relative(os.homedir(),scratch)});throw error;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
