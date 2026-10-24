import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {loadPhaseBReplayPin,activeReplayPin,loadPhaseBCandidatePin} from './office-phase-b-replay-pin.mjs';
import {OFFICE_REPLAY,requireCompleteReplay} from './office-replay-contract.mjs';
const sha=raw=>createHash('sha256').update(raw).digest('hex');
const dir=mkdtempSync(join(tmpdir(),'phase-b-pin-'));
const valid={schemaVersion:1,experiment:'phase-b-baseline-pass-2',repository:'CogniPilot/slam_web',runId:'40200000000',head:'a'.repeat(40),
 artifactId:12600000000,artifactName:'office-loop-software-40200000000-1',archiveBytes:400000000,archiveSha256:'b'.repeat(64),
 sealManifestSha256:'c'.repeat(64),originalFiles:3801,chromium:'154.0.8037.92',frames:1251,snapshotPlanSha256:null};
const file=(name,value)=>{const raw=Buffer.from(JSON.stringify(value));writeFileSync(join(dir,name),raw);return {path:join(dir,name),sha:sha(raw)};};

test('a valid pin loads only with its granted hash',()=>{
 const {path,sha:digest}=file('pin.json',valid);
 assert.equal(loadPhaseBReplayPin(path,digest).runId,'40200000000');
 assert.throws(()=>loadPhaseBReplayPin(path,'d'.repeat(64)),/hash mismatch/);
 assert.throws(()=>loadPhaseBReplayPin(path,undefined),/granted sha256/);
});
test('wrong or extra fields are refused',()=>{
 for(const [name,change] of [['frames',{frames:1250}],['name',{artifactName:'office-loop-software-1-1'}],['head',{head:'short'}],
   ['files',{originalFiles:0}],['plan',{snapshotPlanSha256:'x'}],['extra',{extra:1}]]){
  const {path,sha:digest}=file(name+'.json',{...valid,...change});
  assert.throws(()=>loadPhaseBReplayPin(path,digest),/not valid|fields differ/,name);
 }
});
test('without a Phase B pin the Phase A experiment is unchanged',()=>{
 assert.equal(activeReplayPin({}),OFFICE_REPLAY);
});
test('snapshots are exactly the sealed plan epochs, sorted',()=>{
 const plan=file('plan.json',{plan:'phase-b-snapshots',B:120,verdictEffect:'continue',snapshots:[
  {side:'candidate',epoch:1210,state:'previous'},{side:'baseline',epoch:119,state:'next'},{side:'candidate',epoch:120,state:'previous'}]});
 const pin=file('pin-plan.json',{...valid,snapshotPlanSha256:plan.sha});
 const active=activeReplayPin({OFFICE_PHASE_B_PIN:pin.path,OFFICE_PHASE_B_PIN_SHA256:pin.sha,OFFICE_PHASE_B_PLAN:plan.path});
 assert.deepEqual([...active.snapshots],[119,120,1210]);assert.equal(active.phaseB,true);
 assert.throws(()=>activeReplayPin({OFFICE_PHASE_B_PIN:pin.path,OFFICE_PHASE_B_PIN_SHA256:pin.sha}),/OFFICE_PHASE_B_PLAN/);
});
test('a Phase B replay qualifies only against its own pin',()=>{
 const pin=file('pin-q.json',valid),active=activeReplayPin({OFFICE_PHASE_B_PIN:pin.path,OFFICE_PHASE_B_PIN_SHA256:pin.sha});
 const complete={status:'pass',verifiedFrames:1251,chromium:valid.chromium,originalFilesVerified:3801,sourceHead:valid.head,snapshotEpochs:[],snapshots:[]};
 assert.equal(requireCompleteReplay(complete,active),true);
 for(const change of [{originalFilesVerified:3800},{sourceHead:OFFICE_REPLAY.head},{chromium:'other'},{verifiedFrames:1250}])
  assert.throws(()=>requireCompleteReplay({...complete,...change},active),/incomplete/);
 // The Phase A default still demands its own pins.
 assert.throws(()=>requireCompleteReplay(complete),/incomplete/);
});
test('the job-2 candidate pin loads only with its granted hash and exact fields',()=>{
 const candidate={schemaVersion:1,experiment:'phase-b-candidate-pass-1',repository:'CogniPilot/slam_web',runId:'40300000000',head:'a'.repeat(40),
  artifactId:12700000000,artifactName:'office-loop-software-40300000000-1',archiveBytes:500000000,archiveSha256:'e'.repeat(64),
  sealManifestSha256:'f'.repeat(64),originalFiles:5000,candidateManifestSha256:'094b22e5ae1c10e976ee2c2e9b3ee98252894f0a46a46128e73eb1691ec94213'};
 const {path,sha:digest}=file('candidate.json',candidate);
 assert.equal(loadPhaseBCandidatePin(path,digest).runId,'40300000000');
 assert.throws(()=>loadPhaseBCandidatePin(path,'0'.repeat(64)),/hash mismatch/);
 for(const [name,change] of [['experiment',{experiment:'phase-b-baseline-pass-2'}],['manifest',{candidateManifestSha256:'short'}],['extra',{snapshotPlanSha256:null}]]){
  const bad=file('candidate-'+name+'.json',{...candidate,...change});
  assert.throws(()=>loadPhaseBCandidatePin(bad.path,bad.sha),/not valid|fields differ/,name);
 }
 // A capture pin is not a candidate pin.
 const capture=file('capture-as-candidate.json',valid);assert.throws(()=>loadPhaseBCandidatePin(capture.path,capture.sha),/fields differ/);
});
