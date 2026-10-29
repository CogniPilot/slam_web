import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {join,resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {chromiumLaunchOptions} from './browser-launch.mjs';
import {validateRecordedFixture,compareRecordedFrame} from './recorded-slam-contract.mjs';

const project=resolve(dirname(new URL(import.meta.url).pathname),'..');
const [fixtureArg,outputArg,cacheArg,mode]=process.argv.slice(2);
if(!fixtureArg||!outputArg||!cacheArg||(mode!==undefined&&mode!=='--prepare-only')||process.argv.length!==(mode?6:5))throw Error('Usage: replay-recorded-slam-browser.mjs FIXTURE NEW_OUTPUT NEW_CACHE [--prepare-only]');
const fixture=resolve(fixtureArg),output=resolve(outputArg),cache=resolve(cacheArg);
const require=createRequire(join(project,'package.json'));
const {chromium}=require('playwright'),{build}=require('esbuild');
const sha=b=>createHash('sha256').update(b).digest('hex');
const pin=JSON.parse(await readFile(join(project,'recorded-slam-parity.json')));
const inventory=execFileSync('git',['ls-tree','-r','HEAD'],{cwd:project,encoding:'utf8'}).trimEnd().split('\n')
  .filter(line=>!pin.sourceExcludedPaths.includes(line.split('\t')[1])).join('\n')+'\n';
assert.equal(sha(inventory),pin.productionInventorySha256,'Production source differs from the evaluated app');
const dirty=execFileSync('git',['diff','--name-only','HEAD'],{cwd:project,encoding:'utf8'}).trim().split('\n').filter(Boolean);
assert.ok(dirty.every(path=>pin.sourceExcludedPaths.includes(path)),'Production worktree differs from its qualified source');
const binding=JSON.parse(await readFile(join(fixture,'FIXTURE.json')));
const sensorBytes=await readFile(join(fixture,'sensors.json')),goldenBytes=await readFile(join(fixture,'golden-node.json'));
assert.equal(sha(sensorBytes),pin.sensorMetadataSha256);assert.equal(sha(goldenBytes),binding.goldenSha256);
assert.equal(binding.publishedProfileSha256,pin.publishedProfileSha256);assert.equal(binding.nativeArchiveSha256,pin.nativeArchiveSha256);
const sensors=JSON.parse(sensorBytes),golden=JSON.parse(goldenBytes);
validateRecordedFixture(binding,sensors,golden);
const finalGraphBytes=await readFile(join(fixture,'golden-final-graph.json'));
assert.equal(sha(finalGraphBytes),binding.finalGraphSha256);
const expectedGraph=JSON.parse(finalGraphBytes);
await mkdir(output);await mkdir(cache);
const rawPlugin={name:'recorded-raw-source',setup(b){
  b.onResolve({filter:/\?raw$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-4)),namespace:'raw'}));
  b.onLoad({filter:/.*/,namespace:'raw'},async args=>({contents:await readFile(args.path,'utf8'),loader:'text'}));
}};
for(const [source,file]of [['modelica-slam.worker.ts','worker.js'],['modelica-slam-client.ts','client.mjs']])
  await build({entryPoints:[join(project,'src',source)],outfile:join(cache,file),bundle:true,platform:'browser',format:'esm',target:'es2022',plugins:[rawPlugin],define:{'import.meta.env.BASE_URL':JSON.stringify('/')}});
const manifestBytes=await readFile(join(project,'public/vendor/slam/manifest.json'));
assert.equal(sha(manifestBytes),pin.nativeManifestSha256);
const manifest=JSON.parse(manifestBytes);assert.equal(manifest.profiles['640x360'].sourceSha256,pin.publishedProfileSha256);
const allowed=new Map([['/',Buffer.from('<!doctype html><title>Recorded worker parity</title>')],['/client.mjs',await readFile(join(cache,'client.mjs'))],['/modelica-slam.worker.ts',await readFile(join(cache,'worker.js'))],['/vendor/slam/manifest.json',manifestBytes]]);
for(const profile of Object.values(manifest.profiles))for(const model of Object.values(profile.models))for(const entry of Object.values(model.files))
  if(!allowed.has('/vendor/slam/'+entry.file))allowed.set('/vendor/slam/'+entry.file,await readFile(join(project,'public/vendor/slam',entry.file)));
const images=new Map(sensors.sensorFrames.flatMap(frame=>Object.values(frame.images).map(entry=>['/images/'+entry.path,entry])));
const prepared={at:new Date().toISOString(),status:'SOURCE_INPUT_AND_HOST_BUNDLE_BOUND_NO_EXECUTION',head:execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim(),productionInventorySha256:sha(inventory),workerSha256:sha(allowed.get('/modelica-slam.worker.ts')),clientSha256:sha(allowed.get('/client.mjs')),nativeManifestSha256:sha(manifestBytes),fixtureSha256:pin.fixtureSha256,frames:golden.length};
await writeFile(join(output,'PREPARED.json'),JSON.stringify(prepared,null,2)+'\n');
if(mode==='--prepare-only'){console.log(JSON.stringify(prepared));process.exit(0);}
let serverFailure;
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    let bytes=allowed.get(path);
    if(bytes===undefined&&images.has(path)){
      const entry=images.get(path);bytes=await readFile(join(fixture,entry.path));
      assert.equal(bytes.length,entry.bytes);assert.equal(sha(bytes),entry.sha256);
    }
    if(bytes===undefined){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',path.endsWith('.mjs')||path.endsWith('.ts')?'text/javascript':path==='/'?'text/html':'application/octet-stream');res.end(bytes);
  }catch(error){serverFailure=String(error);res.writeHead(500);res.end('Input verification failed');}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base=`http://127.0.0.1:${server.address().port}/`;
const file=await open(join(output,'OBSERVATIONS.jsonl'),'wx');
let browserServer,browser,page,failure,completed=0,corrections=0,retired=0,finalGraph,browserVersion;
const started=Date.now();
try{
  const launch={...chromiumLaunchOptions(),headless:true,handleSIGINT:false,handleSIGTERM:false,args:['--disable-gpu','--renderer-process-limit=1']};
  assert.equal(launch.chromiumSandbox,true);
  await writeFile(join(output,'SOURCE-INPUT-BINDING.json'),JSON.stringify({pin,binding,head:execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim(),workerSha256:sha(allowed.get('/modelica-slam.worker.ts')),clientSha256:sha(allowed.get('/client.mjs')),launch},null,2)+'\n');
  browserServer=await chromium.launchServer(launch);browser=await chromium.connect(browserServer.wsEndpoint());browserVersion=browser.version();page=await browser.newPage();
  await page.goto(base);await page.evaluate(async()=>{const m=await import('/client.mjs');window.recordedClient=new m.ModelicaSlamClient();});
  let previous=0;
  for(const [index,frame]of sensors.sensorFrames.entries()){
    const actual=await page.evaluate(async({index,frame,dt,base,source})=>{
      const bytes=await Promise.all(['rgb','depth'].map(async kind=>{const r=await fetch('/images/'+frame.images[kind].path);if(!r.ok)throw Error('Recorded image HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());}));
      const observation={...frame,rgb:bytes[0],depth:new Uint16Array(bytes[1].buffer),dt};
      const result=index===0?await window.recordedClient.initialize(base,observation,undefined,{}):await window.recordedClient.step(observation);
      if(index===0&&result.sourceSha256!==source)throw Error('Different native profile loaded');
      const e=result.estimate;
      if(![e.x,e.y,e.z,...e.quaternion].every(Number.isFinite))throw Error('Nonfinite browser trajectory');
      if(Object.values(e.diagnostics).some(value=>typeof value==='number'&&!Number.isFinite(value)))throw Error('Nonfinite browser diagnostic');
      const row={index,time:frame.time,position:[e.x,e.y,e.z],quaternion:Array.from(e.quaternion),diagnostics:Object.fromEntries(Object.entries(e.diagnostics).filter(([k])=>!['stepMsMax','stepMsTotal'].includes(k))),graphSize:e.poseGraph.keyframes.length,loopClosure:e.loopClosure};
      return {row:JSON.parse(JSON.stringify(row)),...(index===2500?{graph:JSON.parse(JSON.stringify(e.poseGraph))}:{})};
    },{index,frame,dt:index===0?0:frame.time-previous,base,source:pin.publishedProfileSha256});
    await file.write(JSON.stringify(actual.row)+'\n');
    compareRecordedFrame(actual.row,golden[index]);if(serverFailure)throw Error(serverFailure);
    corrections+=actual.row.diagnostics.graphCorrectionAccepted===1?1:0;retired+=actual.row.diagnostics.retiredLoopFactors??0;
    completed++;previous=frame.time;if(actual.graph)finalGraph=actual.graph;
    if(index%100===0)console.log(JSON.stringify({completed,time:frame.time,wallSeconds:(Date.now()-started)/1000}));
  }
  assert.equal(completed,2501);assert.equal(corrections,49);assert.equal(retired,19);assert.deepStrictEqual(finalGraph,expectedGraph);
}catch(error){failure=String(error);}finally{
  await file.close();if(page)await page.evaluate(()=>window.recordedClient?.close()).catch(()=>{});
  await browser?.close().catch(()=>{});await browserServer?.close().catch(()=>{});server.closeAllConnections();await new Promise(done=>server.close(done));
}
const result={at:new Date().toISOString(),status:failure?'FAIL':'PASS',completed,expected:2501,firstTime:0,lastTime:completed?golden[completed-1].time:null,corrections,retiredFactors:retired,browserVersion,wallSeconds:(Date.now()-started)/1000,failure:failure??null,scope:'Exact full recorded-input scientific output/final-graph parity through the production Chromium Web Worker and ModelicaSlamClient. CPU only; no scene rendering, physics, new sensor capture, GPU/stress or throughput acceptance.'};
if(finalGraph)await writeFile(join(output,'FINAL-GRAPH.json'),JSON.stringify(finalGraph)+'\n');
await writeFile(join(output,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(failure)process.exitCode=1;
