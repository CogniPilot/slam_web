import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {phaseBComparison,requireCompletePhaseBComparison,PHASE_B_FRAMES} from './office-phase-b-compare.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const root=mkdtempSync(join(tmpdir(),'phase-b-compare-'));
const pinBase={schemaVersion:1,experiment:'phase-b-baseline-pass-2',repository:'CogniPilot/slam_web',runId:'40200000000',head:'a'.repeat(40),
 artifactId:12600000000,artifactName:'office-loop-software-40200000000-1',archiveBytes:400000000,archiveSha256:'b'.repeat(64),
 sealManifestSha256:'c'.repeat(64),originalFiles:3801,chromium:'154.0.8037.92',frames:1251,snapshotPlanSha256:null};
const write=(name,value)=>{const raw=Buffer.from(JSON.stringify(value));writeFileSync(join(root,name),raw);return {path:join(root,name),sha:sha(raw)};};
// Synthetic baseline capture: two distinct verified loop references first appear at frame 300 when withB.
function capture(name,withB){
 const dir=join(root,name);mkdirSync(join(dir,'frames'),{recursive:true});
 for(let epoch=0;epoch<PHASE_B_FRAMES;epoch++){
  const candidates=withB&&epoch>=300?[{verified:true,referenceId:3},{verified:true,referenceId:9}]:[{verified:true,referenceId:3},{verified:false,referenceId:9}];
  writeFileSync(join(dir,'frames',String(epoch).padStart(4,'0')+'.json'),JSON.stringify({sequence:epoch,native:{loopClosure:{candidates}}}));
 }
 return dir;
}
const withB=capture('with-b',true),withoutB=capture('without-b',false);
const env=(pin,extra={})=>({OFFICE_PHASE_B_PIN:pin.path,OFFICE_PHASE_B_PIN_SHA256:pin.sha,...extra});

test('without OFFICE_PHASE_B_PASS the Phase A comparison is unchanged',async()=>{
 assert.equal(await phaseBComparison(withB,{}),null);
});
test('pass 1 recomputes B from the capture and takes no snapshots',async()=>{
 const pin=write('pin1.json',pinBase);
 const mode=await phaseBComparison(withB,env(pin,{OFFICE_PHASE_B_PASS:'1'}));
 assert.equal(mode.B,300);assert.equal(mode.prefixEnd,300);assert.deepEqual([...mode.snapshots],[]);assert.equal(mode.expectedPrefixChecks,0);
 const none=await phaseBComparison(withoutB,env(pin,{OFFICE_PHASE_B_PASS:'1'}));
 assert.equal(none.B,null);assert.equal(none.prefixEnd,PHASE_B_FRAMES);
 const planned=write('pin1-plan.json',{...pinBase,snapshotPlanSha256:'d'.repeat(64)});
 await assert.rejects(phaseBComparison(withB,env(planned,{OFFICE_PHASE_B_PASS:'1'})),/before any snapshot plan/);
 await assert.rejects(phaseBComparison(withB,env(pin,{OFFICE_PHASE_B_PASS:'3'})),/must be 1 or 2/);
});
test('pass 2 takes the sealed plan only when its B matches the capture',async()=>{
 const plan=write('plan.json',{plan:'phase-b-snapshots',B:300,verdictEffect:'continue',snapshots:[
  {side:'baseline',epoch:299,state:'next'},{side:'baseline',epoch:300,state:'previous'},{side:'candidate',epoch:299,state:'next'},
  {side:'candidate',epoch:300,state:'previous'},{side:'candidate',epoch:640,state:'previous'},{side:'candidate',epoch:640,state:'next'}]});
 const pin=write('pin2.json',{...pinBase,snapshotPlanSha256:plan.sha});
 const mode=await phaseBComparison(withB,env(pin,{OFFICE_PHASE_B_PASS:'2',OFFICE_PHASE_B_PLAN:plan.path}));
 assert.deepEqual([...mode.snapshots],[299,300,640]);
 // Prefix states: both at 299, previous at 300; nothing at 640.
 assert.equal(mode.expectedPrefixChecks,3);
 const wrong=write('plan-wrong.json',{plan:'phase-b-snapshots',B:301,verdictEffect:'continue',snapshots:[{side:'candidate',epoch:301,state:'previous'}]});
 const wrongPin=write('pin2-wrong.json',{...pinBase,snapshotPlanSha256:wrong.sha});
 await assert.rejects(phaseBComparison(withB,env(wrongPin,{OFFICE_PHASE_B_PASS:'2',OFFICE_PHASE_B_PLAN:wrong.path})),/boundary differs/);
 await assert.rejects(phaseBComparison(withB,env(pin,{OFFICE_PHASE_B_PASS:'2'})),/requires the sealed snapshot plan/);
});
test('a pass 1 receipt completes only with every frame, the exact prefix and the granted file count',async()=>{
 const pin=write('pin-c.json',pinBase),mode=await phaseBComparison(withB,env(pin,{OFFICE_PHASE_B_PASS:'1'}));
 const complete={status:'complete',completedFrames:1251,prefixFrames:300,prefixSnapshotChecks:0,chromium:pinBase.chromium,originalReplayFilesVerified:3801,snapshots:[],
  firstObservedDivergence:{epoch:900},phaseB:{D:900}};
 assert.equal(requireCompletePhaseBComparison(complete,mode),true);
 // D, the first output divergence, may be at or after B, or never.
 assert.equal(requireCompletePhaseBComparison({...complete,firstObservedDivergence:{epoch:300},phaseB:{D:300}},mode),true);
 assert.equal(requireCompletePhaseBComparison({...complete,firstObservedDivergence:undefined,phaseB:{D:null}},mode),true);
 for(const change of [{firstObservedDivergence:{epoch:299},phaseB:{D:299}},{phaseB:{D:901}},{phaseB:{}}])
  assert.throws(()=>requireCompletePhaseBComparison({...complete,...change},mode),/Incomplete Phase B comparison/);
 const noB=await phaseBComparison(withoutB,env(pin,{OFFICE_PHASE_B_PASS:'1'}));
 assert.throws(()=>requireCompletePhaseBComparison({...complete,prefixFrames:1251,firstObservedDivergence:{epoch:1000},phaseB:{D:1000}},noB),/Incomplete Phase B comparison/);
 for(const change of [{prefixFrames:1206},{completedFrames:1250},{chromium:'other'},{originalReplayFilesVerified:3800},{prefixSnapshotChecks:15},
   {snapshots:[{epoch:299,side:'next'}]},{status:'failed'}])
  assert.throws(()=>requireCompletePhaseBComparison({...complete,...change},mode),/Incomplete Phase B comparison/);
});
