// Full original detector gate: compiler artifact required; no host FAST implementation.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
const [artifactFile,directory,thresholdArtifactFile,dimensionArtifactFile,scoreArtifactFile]=process.argv.slice(2);
if(!directory)throw Error('Expected BASE_ARTIFACT OUTPUT_DIRECTORY [THRESHOLD_ARTIFACT DIMENSION_ARTIFACT SCORE_FLOOR_ARTIFACT]');
const dimensionDiagnostic=process.env.RUMOCA_FAST_FRAME_DIMENSION_DIAGNOSTIC==='1';
if(dimensionDiagnostic&&(thresholdArtifactFile||dimensionArtifactFile||scoreArtifactFile))throw Error('Dimension diagnostic accepts only its separately compiled artifact');
fs.mkdirSync(directory,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync('models/Vision/Features/FastNativeFrame.mo','utf8');
const fixtureFile=process.env.RUMOCA_FAST_FRAME_FIXTURES??'dev/artifacts/fast-native-frame/independent-fixtures.json';
const fixtureBytes=fs.readFileSync(fixtureFile),fixture=JSON.parse(fixtureBytes);
if(sha(source)!==fixture.sourceSha256||fixture.height!==90||fixture.width!==160||fixture.frames.length!==4||fixture.byteRgbaFrames?.length!==1||fixture.nonfiniteRgbFrames?.length!==2||!fixture.scoreEdit)throw Error('Original fullframe fixture mismatch');
const files=[artifactFile,...(thresholdArtifactFile?[thresholdArtifactFile]:[]),...(dimensionArtifactFile?[dimensionArtifactFile]:[]),...(scoreArtifactFile?[scoreArtifactFile]:[])];
const variants=[dimensionDiagnostic?{name:'dimension-edit12x17',dimension:true}:{name:'original160x90'},...(thresholdArtifactFile?[{name:'threshold19-full160x90',threshold:true}]:[]),...(dimensionArtifactFile?[{name:'dimension-edit12x17',dimension:true}]:[]),...(scoreArtifactFile?[{name:'score-floor-one-full160x90',floorOne:true}]:[])];
if(dimensionArtifactFile&&!thresholdArtifactFile)throw Error('Dimension source edit requires threshold argument');
let dimensionSource=source;for(const edit of fixture.sourceEdits)dimensionSource=dimensionSource.replace(edit.replace,edit.with);
const sources=[dimensionDiagnostic?dimensionSource:source];if(thresholdArtifactFile)sources.push(source.replace(fixture.thresholdEdit.replace,fixture.thresholdEdit.with));
if(dimensionArtifactFile){let edited=source;for(const e of fixture.sourceEdits)edited=edited.replace(e.replace,e.with);sources.push(edited);}
if(scoreArtifactFile)sources.push(source.replace(fixture.scoreEdit.replace,fixture.scoreEdit.with));
const artifactBytes=files.map(f=>fs.readFileSync(f)),artifacts=artifactBytes.map(b=>JSON.parse(b));
for(let i=0;i<artifacts.length;i++)if(artifacts[i].model_name!=='FastNativeFrame'||artifacts[i].source_sha256!==sha(sources[i])
 ||artifacts[i].profile!=='native-direct-program-f64-v3'||sha(Buffer.from(artifacts[i].module_bytes))!==artifacts[i].module_sha256)throw Error('Original source-issued artifact mismatch');
const bundle=await build({stdin:{contents:"export {NativeProgram} from './src/modelica-native-program';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',write:false});
const consumerFile=path.join(directory,'consumer.mjs');fs.writeFileSync(consumerFile,bundle.outputFiles[0].contents);
const {NativeProgram}=await import(pathToFileURL(path.resolve(consumerFile)));
const verify=async (NativeProgram,data,pins)=>{
 const require=(ok,message)=>{if(!ok)throw Error(message);},results=[];
 const fromHex=s=>Uint8Array.from(s.match(/../g),v=>parseInt(v,16));
 const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
 for(let variant=0;variant<data.artifacts.length;variant++){
  const artifact=data.artifacts[variant],source=data.sources[variant],meta=data.variants[variant];
  require(artifact.source_sha256===pins[variant].sourceSha256&&artifact.module_sha256===pins[variant].moduleSha256&&await hash(source)===pins[variant].sourceSha256&&await hash(JSON.stringify(artifact))===pins[variant].artifactPayloadSha256,'Persisted issued artifact/source identity');
  const p=await NativeProgram.instantiate(artifact,source),abi=artifact.abi;
  const frames=meta.dimension?[data.fixture.dimensionEdit]:[...data.fixture.frames,...data.fixture.byteRgbaFrames,...data.fixture.nonfiniteRgbFrames];
  const input=p.input('rgb'),scores=p.output('scores'),selection=p.output('selection');
  const expectedSelection=meta.threshold?data.fixture.thresholdEdit.expectedSelection:[18,0,1e8,3,240,1,3,3];
  let scoreChecks=0,signChecks=0,nanChecks=0,infinityChecks=0,readonlyCalls=0;const evaluated=[],expectedViews=new Map();
  const fill=frame=>{if(frame.rgbaBits){require(frame.rgbaBits.length===input.length,'RGBA raw-bit dimensions');new Uint8Array(input.buffer,input.byteOffset,input.byteLength).set(fromHex(frame.rgbaBits.join('')));}else input.set(frame.inputEncoding==='rgba8-row-major-channel-contiguous'?Uint8Array.from(frame.rgb):frame.rgb);};
  const evaluate=time=>{const before=new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).slice();p.evaluate(time);require(new Uint8Array(p.memory.buffer,abi.p_offset,abi.p_count*8).every((v,i)=>v===before[i]),'P mutated');readonlyCalls++;};
  const compare=frame=>{
   require(scores.length===frame.height*frame.width&&input.length===scores.length*4,'Fullframe dimensions');
   const expectedBits=meta.floorOne?frame.floorOneScoreBits:frame.expectedScoreBits;
   require(expectedBits?.length===scores.length,'Every source-equivalent score has binary64 expected bits');
   let expected=expectedViews.get(frame);
   if(!expected){const bytes=fromHex(expectedBits.join(''));expected=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);expectedViews.set(frame,expected);}
   const actual=new DataView(scores.buffer,scores.byteOffset,scores.byteLength);
   for(let cell=0;cell<scores.length;cell++){
    const value=expected.getFloat64(cell*8,true);
    if(Number.isNaN(value)){require(Number.isNaN(scores[cell]),`${meta.name}/${frame.name}/${cell}: expected NaN`);nanChecks++;}
    else{require(actual.getBigUint64(cell*8,true)===expected.getBigUint64(cell*8,true),`${meta.name}/${frame.name}/${cell}: ${scores[cell]} != ${value}`);if(value===0)signChecks++;if(!Number.isFinite(value))infinityChecks++;}
    const row=Math.floor(cell/frame.width),column=cell%frame.width;
    if(row<3||row>=frame.height-3||column<3||column>=frame.width-3)require(actual.getBigUint64(cell*8,true)===0n,'Every guarded border stays +0, including nonfinite neighbors and scoring edit');
    scoreChecks++;
   }
   require(selection.length===8&&selection.every((v,i)=>v===expectedSelection[i]),'Source selection edit');
  };
  for(let round=0;round<2;round++){
   if(round===1)p.reset();
   for(const frame of frames){fill(frame);evaluate((round*frames.length+evaluated.length)/90);compare(frame);evaluated.push({round,name:frame.name,cells:scores.length,byteRgba:frame.inputEncoding==='rgba8-row-major-channel-contiguous',nonfiniteRgb:Boolean(frame.nonfiniteRgb)});}
  }
  let ignoredAlpha=false;
  if(!meta.dimension){const frame=data.fixture.ignoredNaNAlpha;
   require(frame.rgbaBits.length===input.length,'Alpha fixture dimensions');new Uint8Array(input.buffer,input.byteOffset,input.byteLength).set(fromHex(frame.rgbaBits.join('')));
   evaluate(2);compare(frame);ignoredAlpha=true;
  }
  const beforeMemory=new Uint8Array(p.memory.buffer).slice();
  for(const args of [[abi.y_offset,abi.p_offset,3,abi.p_offset,0],[1,abi.p_offset,3,abi.scratch_offset,0]]){
   require(p.execute(...args)===1,'Invalid buffer refusal');
   require(new Uint8Array(p.memory.buffer).every((v,i)=>v===beforeMemory[i]),'InvalidBuffer complete memory atomicity');
  }
  let invalidTime=false;try{p.evaluate(NaN);}catch(e){invalidTime=String(e).includes('finite simulation timestamp');}
  require(invalidTime&&new Uint8Array(p.memory.buffer).every((v,i)=>v===beforeMemory[i]),'Nonfinite timestamp host rejection is atomic');
  fill(frames[0]);evaluate(4);compare(frames[0]);

  let stale=false;try{await NativeProgram.instantiate(artifact,source+'\n// stale');}catch(e){stale=String(e).includes('does not match its source');}require(stale,'Stale source accepted');
  results.push({variant:meta.name,evaluated,scoreChecks,signChecks,nanChecks,infinityChecks,readonlyCalls,ignoredAlpha,reset:true,invalidBufferAtomic:true,invalidTimeAtomic:true,recovery:true,staleSource:true,persistedIdentity:true});
 }
 return results;
};
const pins=artifacts.map((a,i)=>({sourceSha256:sha(sources[i]),moduleSha256:a.module_sha256,artifactPayloadSha256:sha(JSON.stringify(a))}));
const data={sources,artifacts,fixture,variants};let browser,server;
try{
 const node=await verify(NativeProgram,data,pins);
 // Large compiler artifacts go through HTTP, rather than Playwright's CDP
 // argument serializer. The worker still checks every externally pinned digest.
 const fixturePayload=JSON.stringify(data);
 server=createServer((req,res)=>{if(req.url==='/consumer.mjs'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);}else if(req.url==='/fixture-data.json'){res.setHeader('Content-Type','application/json');res.end(fixturePayload);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Full original FAST detector gate</title>');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-gpu']});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 const invoke=reload=>page.evaluate(async({body,reload,pins})=>{
  const code=`const verify=${body};onmessage=async e=>{try{const {NativeProgram}=await import(e.data.base+'/consumer.mjs');const db=await new Promise((r,j)=>{const q=indexedDB.open('original-fast-frame-review',1);q.onupgradeneeded=()=>q.result.createObjectStore('projects');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});let data;if(!e.data.reload){const response=await fetch(e.data.base+'/fixture-data.json');if(!response.ok)throw Error('Fixture download failed');data=await response.json();}try{if(e.data.reload)data=await new Promise((r,j)=>{const q=db.transaction('projects').objectStore('projects').get('source-and-artifact');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});if(!data)throw Error('Missing saved project');let tamperedReplayRejected=false;if(e.data.reload){const before=data.artifacts[0].compiler.version;data.artifacts[0].compiler.version=before+'-tampered-persistence';try{await verify(NativeProgram,data,e.data.pins);}catch(error){if(!String(error).includes('Persisted issued artifact/source identity'))throw error;tamperedReplayRejected=true;}finally{data.artifacts[0].compiler.version=before;}if(!tamperedReplayRejected)throw Error('Tampered persisted artifact accepted');}const result=await verify(NativeProgram,data,e.data.pins);if(!e.data.reload)await new Promise((r,j)=>{const t=db.transaction('projects','readwrite');t.objectStore('projects').put(data,'source-and-artifact');t.oncomplete=r;t.onerror=()=>j(t.error);t.onabort=()=>j(t.error);});postMessage({result,reload:e.data.reload,tamperedReplayRejected});}finally{db.close();}}catch(e){postMessage({error:String(e.stack||e)})}}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
  try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Fullframe worker timeout')),60000);worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data);};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage({base:location.origin,reload,pins});});}finally{worker.terminate();URL.revokeObjectURL(url);}
 },{body:verify.toString(),reload,pins});
 const first=await invoke(false);await page.reload();const restored=await invoke(true);
 const report={schemaVersion:1,status:dimensionDiagnostic?'EDITED_DIMENSION_FAST_FRAME_NODE_CHROMIUM_NUMERICAL_PASS':'FULL_ORIGINAL_FAST_FRAME_NODE_CHROMIUM_NUMERICAL_PASS',fullOriginalExecuted:!dimensionDiagnostic,dimensionSourceEditExecuted:dimensionDiagnostic||Boolean(dimensionArtifactFile),originalSourceSha256:sha(source),fixtureSha256:sha(fixtureBytes),probeSha256:sha(fs.readFileSync(import.meta.filename)),consumerBundleSha256:sha(bundle.outputFiles[0].contents),
  variants:artifacts.map((a,i)=>({sourceSha256:sha(sources[i]),artifactSha256:sha(artifactBytes[i]),moduleSha256:a.module_sha256,moduleBytes:a.module_bytes.length})),
  node:{engine:`${process.version} / V8 ${process.versions.v8}`,results:node},browser:{version:browser.version(),first,restored},
  sourceEditsVerified:Boolean(thresholdArtifactFile&&dimensionArtifactFile),sourceScoringEditVerified:Boolean(scoreArtifactFile),pinnedIssuedIdentities:pins,indexedDbReloads:1,tamperedPersistedArtifactRejected:restored.tamperedReplayRejected,
  scope:dimensionDiagnostic?'Only the separately compiled12x17 dimension source edit: every204score compared to independent raw-bit expectations, borders, reset/recovery, readonly P, complete-memory faults and pinned Chromium/IndexedDB reload. Original160x90 detector remains unexecuted; this diagnostic cannot satisfy full-frame acceptance.':
   'Actual unchanged full160x90 source, four existing finite14400-score frames, one byteRGBA axis-asymmetric frame and two nonfiniteRGB frames. All finite outputs including signed zeros compare raw bits; NaN outputs compare classification because payloads are not portable. A separate balanced reduction matches the source ordered2/4/8/9 tree; existing sequential9arc oracle remains finite-only. Optional separately compiled threshold,12x17 dimension and fullframe score-floor edits. Every guarded border remains +0, repeated/reset state, ignored NaN alpha, readonly P, complete-memory InvalidBuffer atomicity/recovery, atomic host timestamp rejection, Chromium workers, IndexedDB reload pinned to external issued source/module/artifact digests. No host FAST implementation. Browser compilation/editor, sensors, detector selection, matching/map/loops, performance and fullSLAM remain independent requirements.'};
 fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,sourceEditsVerified:report.sourceEditsVerified,variants:report.variants,browser:report.browser.version}));
}catch(error){fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({status:'FAIL',error:String(error.stack||error)},null,2)+'\n');throw error;}
finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
