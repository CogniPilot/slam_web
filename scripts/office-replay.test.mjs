import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {OFFICE_REPLAY,exact,exactCaptured,capturedEncoding,firstExactDifference,presented,requireCompleteReplay} from './office-replay-contract.mjs';
import {copyDeclaredState,requireImageInputs,wrapReplayEntry} from './office-replay-observer.mjs';
import {copyInputs} from './office-native-observation.mjs';
import {mkdtemp,mkdir,writeFile,rm,access} from 'node:fs/promises';import{homedir}from'node:os';import{join}from'node:path';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
test('one-ULP native difference is refused with exact field/IEEE evidence',()=>{
 const actual={quaternion:[1,0,.125+Number.EPSILON/8,0]},expected={quaternion:[1,0,.125,0]};
 const d=firstExactDifference(actual,expected);assert.equal(d.path,'$.quaternion.2');assert.notEqual(d.actualHex,d.expectedHex);
 assert.throws(()=>exact(actual,expected,'native'),/quaternion.2/);assert.notEqual(firstExactDifference(-0,0),null);
 assert.notEqual(firstExactDifference(new Array(1),[]),null);
});
test('observed comparison reproduces only the original JSON encoding and still refuses finite ULP differences',()=>{
 const actual={zero:-0,unused:[NaN,Infinity,-Infinity],omitted:undefined,finite:.125};
 assert.deepEqual(capturedEncoding(actual),{zero:0,unused:[null,null,null],finite:.125});
 exactCaptured(actual,JSON.parse(JSON.stringify(actual)),'recorded');
 assert.throws(()=>exactCaptured({...actual,finite:.125+Number.EPSILON/8},JSON.parse(JSON.stringify(actual)),'recorded'),/finite/);
 assert.throws(()=>exactCaptured({quaternion:[1,0,.125+Number.EPSILON/4,0]},{quaternion:[1,0,.125,0]},'two-ULP native quaternion'),/quaternion.2/);
});
test('presentation excludes timing only; reasons, masks, counts and poses remain exact',()=>{
 const value={x:0,quaternion:[1,0,0,0],diagnostics:{stepMsMax:3,stepMsTotal:4,stepCalls:2,graphReason:7},poseGraph:{edges:[]},loopClosure:{candidateCount:1}};
 const p=presented(value);assert.deepEqual(p.diagnostics,{stepCalls:2,graphReason:7});assert.deepEqual(value.diagnostics,{stepMsMax:3,stepMsTotal:4,stepCalls:2,graphReason:7});
 for(const modified of [{...p,x:1},{...p,loopClosure:{candidateCount:2}},{...p,diagnostics:{...p.diagnostics,graphReason:0}}])assert.throws(()=>exact(modified,p,'native'));
});
function fixture(inPlace=false){
 const memory={buffer:new ArrayBuffer(256)},state_runs=[{name:'owner.position',lane:'f64',count:3,previous:0,next:inPlace?0:24}];
 const inputs={imageRequested:{lane:'f64',count:1,offset:48},imageEpoch:{lane:'f64',count:1,offset:56},rgb:{lane:'f64',count:6,offset:64},depth:{lane:'f64',count:2,offset:112}};
 const p={memory,layout:{state_runs,inputs},real(name){const s=inputs[name];return new Float64Array(memory.buffer,s.offset,s.count);},hasInput(name){return name in inputs;},boolean(name){return this.real(name);}};
 new Float64Array(memory.buffer,0,3).set([1,2,3]);p.real('imageRequested')[0]=1;p.real('imageEpoch')[0]=80;p.real('rgb').set([1,2,3,4,5,6]);p.real('depth').set([10,20]);
 let calls=0;p.entry=()=>{calls++;new Float64Array(memory.buffer,state_runs[0].next,3).set([9,8,7]);return 0;};
 const frame={rgb:new Uint8Array([1,2,3,4,5,6,250,251]),depth:new Uint16Array([10,20]),imageLayout:{color:{width:2,height:1,strideBytes:8},depth:{width:2,height:1,strideBytes:4}}};
 return{p,frame,calls:()=>calls};
}
for(const inPlace of [false,true])test('entry snapshots own declared previous/next bytes without extra evaluation '+(inPlace?'in-place':'disjoint'),()=>{
 const {p,frame,calls}=fixture(inPlace),clean=fixture(inPlace),context={epoch:80,wanted:new Set([80]),frame,expected:{nativeTrace:{inputs:copyInputs(p)}},pending:[]};
 wrapReplayEntry(p,context);assert.equal(p.entry(),clean.p.entry());assert.equal(calls(),1);
 assert.deepEqual(new Uint8Array(p.memory.buffer),new Uint8Array(clean.p.memory.buffer));assert.equal(context.pending.length,2);
 assert.deepEqual(Array.from(new Float64Array(context.pending[0].bytes.buffer)),[1,2,3]);assert.deepEqual(Array.from(new Float64Array(context.pending[1].bytes.buffer)),[9,8,7]);
 p.real('rgb')[0]=99;assert.deepEqual(Array.from(new Float64Array(context.pending[0].bytes.buffer)),[1,2,3]);
});
test('IMU-only boundary does not inspect image/catalog state or create snapshots',()=>{
 const p={hasInput:()=>true,boolean:()=>[0],entry:()=>17};wrapReplayEntry(p,{});assert.equal(p.entry(),17);
});
test('raw raster stride is checked without reselection and corruption stops entry',()=>{
 const {p,frame,calls}=fixture();requireImageInputs(p,frame);frame.rgb[0]=2;assert.throws(()=>requireImageInputs(p,frame),/Raw rgb input/);
 const context={epoch:80,wanted:new Set([80]),frame,expected:{nativeTrace:{inputs:copyInputs(p)}},pending:[]};wrapReplayEntry(p,context);assert.throws(()=>p.entry(),/Raw rgb input/);assert.equal(calls(),0);
});
test('snapshot copies reject unknown side and invalid declared offsets',()=>{
 const {p}=fixture();assert.throws(()=>copyDeclaredState(p,'scratch'),/side/);p.layout.state_runs[0].previous=1;assert.throws(()=>copyDeclaredState(p,'previous'),/ABI/);
});
test('declared snapshot bytes preserve signed zero, NaN payload, infinity and full Integer lanes',()=>{
 const memory={buffer:new ArrayBuffer(64)},v=new DataView(memory.buffer);
 v.setBigUint64(0,0x8000000000000000n,true);v.setBigUint64(8,0x7ff8000000000042n,true);v.setBigUint64(16,0x7ff0000000000000n,true);v.setBigInt64(24,-1234567890123456789n,true);v.setUint8(32,255);
 const state_runs=[{name:'real',lane:'f64',count:3,previous:0,next:0},{name:'integer',lane:'i64',count:1,previous:24,next:24},{name:'boolean',lane:'u8',count:1,previous:32,next:32}];
 const snapshot=copyDeclaredState({memory,layout:{state_runs}},'previous');assert.deepEqual(snapshot.bytes,new Uint8Array(memory.buffer,0,33));
 const copied=new DataView(snapshot.bytes.buffer);assert.equal(copied.getBigUint64(0,true),0x8000000000000000n);assert.equal(copied.getBigUint64(8,true),0x7ff8000000000042n);assert.equal(copied.getBigInt64(24,true),-1234567890123456789n);assert.equal(copied.getUint8(32),255);
});
test('partial prefix, wrong browser, missing snapshot or source cannot qualify snapshots',()=>{
 const complete={status:'pass',verifiedFrames:1251,chromium:OFFICE_REPLAY.chromium,originalFilesVerified:3800,sourceHead:OFFICE_REPLAY.head,snapshotEpochs:[...OFFICE_REPLAY.snapshots],snapshots:OFFICE_REPLAY.snapshots.flatMap(epoch=>['previous','next'].map(side=>({epoch,side})))};
 assert.equal(requireCompleteReplay(complete),true);
 for(const changed of [{verifiedFrames:1250},{chromium:'other'},{sourceHead:'other'},{snapshots:complete.snapshots.slice(1)},{status:'failed'}])assert.throws(()=>requireCompleteReplay({...complete,...changed}),/unqualified/);
});
test('actual emitted browser IIFE boots with raw-text import contract and no World entry',async()=>{
 const rawText={name:'raw-text',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw'}));b.onLoad({filter:/.*/,namespace:'raw'},async a=>({contents:await readFile(a.path,'utf8'),loader:'text'}));}};
 const result=await build({entryPoints:['scripts/office-replay.browser.ts'],bundle:true,format:'iife',platform:'browser',write:false,metafile:true,plugins:[rawText]});
 assert.equal(Object.keys(result.metafile.inputs).some(name=>/world(?:\.|-)|runtime\.ts$|modelica-slam\.worker/.test(name)),false);
 const context=vm.createContext({TextDecoder,TextEncoder,Uint8Array,Map,Set,ArrayBuffer,DataView,structuredClone,performance,crypto,fetch,URL,Response,Blob,DecompressionStream});
 vm.runInContext(result.outputFiles[0].text,context);assert.equal(typeof context.OfficeReplay.initialize,'function');assert.equal(typeof context.OfficeReplay.epoch,'function');
});
test('only complete replay evidence seals; root active log excluded and nested original logs retained',async()=>{
 const parent=join(homedir(),'scratch/slam_web/tmp');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'replay-seal-control-'));
 try{
  await mkdir(join(root,'replay/snapshots'),{recursive:true});await mkdir(join(root,'input/original'),{recursive:true});
  const file=join(root,'replay/receipt.json');await writeFile(file,JSON.stringify({status:'running',verifiedFrames:0}));
  let run=spawnSync(process.execPath,['scripts/seal-office-replay.mjs',root],{encoding:'utf8'});assert.notEqual(run.status,0);await assert.rejects(()=>access(join(root,'SHA256SUMS')));
  const snapshots=[];
  for(const epoch of OFFICE_REPLAY.snapshots)for(const side of ['previous','next']){
   const name=`epoch-${String(epoch).padStart(4,'0')}-${side}.bin.gz`,bytes=Buffer.from('synthetic transport control');
   await writeFile(join(root,'replay/snapshots',name),bytes);snapshots.push({epoch,side,file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  await writeFile(file,JSON.stringify({status:'pass',qualified:true,verifiedFrames:1251,chromium:OFFICE_REPLAY.chromium,sourceHead:OFFICE_REPLAY.head,originalFilesVerified:3800,snapshotEpochs:OFFICE_REPLAY.snapshots,snapshots}));
  await writeFile(join(root,'seal.log'),'active');await writeFile(join(root,'pipeline-status.json'),'pending');
  await writeFile(join(root,'input/original/seal.log'),'original');await writeFile(join(root,'input/original/SHA256SUMS'),'original');
  run=spawnSync(process.execPath,['scripts/seal-office-replay.mjs',root],{encoding:'utf8'});assert.equal(run.status,0,run.stderr);
  const sealed=await readFile(join(root,'SHA256SUMS'),'utf8');assert.match(sealed,/  input\/original\/seal.log\n/);assert.match(sealed,/  input\/original\/SHA256SUMS\n/);assert.doesNotMatch(sealed,/  seal.log\n|  pipeline-status.json\n/);
  await writeFile(join(root,'replay/snapshots',snapshots[0].file),'changed');run=spawnSync(process.execPath,['scripts/seal-office-replay.mjs',root],{encoding:'utf8'});assert.notEqual(run.status,0);assert.match(run.stderr,/Snapshot compressed hash/);
 }finally{await rm(root,{recursive:true,force:true});}
});
