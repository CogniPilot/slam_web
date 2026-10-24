// Phase B baseline replay (job 3, pass 2) of the sealed job-1 capture. Every pin comes from the
// grant: the caller supplies the sha256 it was given, never one read from the pin file. Without
// OFFICE_PHASE_B_PIN the fixed Phase A experiment is used unchanged.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import {OFFICE_REPLAY} from './office-replay-contract.mjs';
import {loadSnapshotPlan} from './office-snapshot-plan.mjs';
const HEX=/^[a-f0-9]{64}$/,COMMIT=/^[a-f0-9]{40}$/;
const FIELDS=['schemaVersion','experiment','repository','runId','head','artifactId','artifactName','archiveBytes','archiveSha256',
 'sealManifestSha256','originalFiles','chromium','frames','snapshotPlanSha256'].sort();
const sha=raw=>createHash('sha256').update(raw).digest('hex');
export function loadPhaseBReplayPin(path,expectedSha256){
 if(!HEX.test(expectedSha256??''))throw Error('Phase B replay pin requires the granted sha256');
 const raw=readFileSync(path);if(sha(raw)!==expectedSha256)throw Error('Phase B replay pin hash mismatch');
 const p=JSON.parse(raw);
 if(Object.keys(p).sort().join()!==FIELDS.join())throw Error('Phase B replay pin fields differ');
 if(p.schemaVersion!==1||p.experiment!=='phase-b-baseline-pass-2'||p.repository!=='CogniPilot/slam_web'||!/^[0-9]+$/.test(p.runId)
   ||!COMMIT.test(p.head)||!Number.isInteger(p.artifactId)||p.artifactName!==`office-loop-software-${p.runId}-1`
   ||!Number.isInteger(p.archiveBytes)||p.archiveBytes<1||!HEX.test(p.archiveSha256)||!HEX.test(p.sealManifestSha256)
   ||!Number.isInteger(p.originalFiles)||p.originalFiles<1||typeof p.chromium!=='string'||!p.chromium||p.frames!==1251
   ||!(p.snapshotPlanSha256===null||HEX.test(p.snapshotPlanSha256)))throw Error('Phase B replay pin is not valid');
 return p;
}
/** The replay experiment in force: Phase B when named, otherwise the frozen Phase A constant. */
export function activeReplayPin(env=process.env){
 if(!env.OFFICE_PHASE_B_PIN)return OFFICE_REPLAY;
 const pin=loadPhaseBReplayPin(env.OFFICE_PHASE_B_PIN,env.OFFICE_PHASE_B_PIN_SHA256);
 // Phase B snapshots are exactly the sealed plan's epochs; no plan means a replay with no snapshots.
 let snapshots=[];
 if(pin.snapshotPlanSha256){
  if(!env.OFFICE_PHASE_B_PLAN)throw Error('Phase B replay pin names a snapshot plan; set OFFICE_PHASE_B_PLAN');
  snapshots=[...loadSnapshotPlan(env.OFFICE_PHASE_B_PLAN,pin.snapshotPlanSha256).epochs].sort((a,b)=>a-b);
 }
 return Object.freeze({...pin,phaseB:true,snapshots:Object.freeze(snapshots)});
}
const CANDIDATE_FIELDS=['schemaVersion','experiment','repository','runId','head','artifactId','artifactName','archiveBytes','archiveSha256',
 'sealManifestSha256','originalFiles','candidateManifestSha256'].sort();
/** Job 3's second grant: the sealed job-2 artifact (pass-1 candidate frames, candidate assets and the plan). */
export function loadPhaseBCandidatePin(path,expectedSha256){
 if(!HEX.test(expectedSha256??''))throw Error('Phase B candidate pin requires the granted sha256');
 const raw=readFileSync(path);if(sha(raw)!==expectedSha256)throw Error('Phase B candidate pin hash mismatch');
 const p=JSON.parse(raw);
 if(Object.keys(p).sort().join()!==CANDIDATE_FIELDS.join())throw Error('Phase B candidate pin fields differ');
 if(p.schemaVersion!==1||p.experiment!=='phase-b-candidate-pass-1'||p.repository!=='CogniPilot/slam_web'||!/^[0-9]+$/.test(p.runId)
   ||!COMMIT.test(p.head)||!Number.isInteger(p.artifactId)||p.artifactName!==`office-loop-software-${p.runId}-1`
   ||!Number.isInteger(p.archiveBytes)||p.archiveBytes<1||!HEX.test(p.archiveSha256)||!HEX.test(p.sealManifestSha256)
   ||!Number.isInteger(p.originalFiles)||p.originalFiles<1||!HEX.test(p.candidateManifestSha256))throw Error('Phase B candidate pin is not valid');
 return p;
}
