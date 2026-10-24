// Phase B candidate comparison. Pass 1 (job 2) runs the candidate on the sealed job-1 capture with no snapshots;
// pass 2 (job 3) runs it on job 3's qualified baseline replay with the sealed plan's snapshots. B is always recomputed
// here from the granted capture's baseline outputs, never taken from a file. Without OFFICE_PHASE_B_PASS the fixed
// Phase A comparison applies unchanged.
import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {loadPhaseBReplayPin} from './office-phase-b-replay-pin.mjs';
import {loadSnapshotPlan} from './office-snapshot-plan.mjs';
import {boundaryB} from './office-phase-b-checks.mjs';
export const PHASE_B_FRAMES=1251;
export async function phaseBComparison(capture,env=process.env){
 const pass=env.OFFICE_PHASE_B_PASS;if(pass===undefined)return null;
 if(pass!=='1'&&pass!=='2')throw Error('OFFICE_PHASE_B_PASS must be 1 or 2');
 const pin=loadPhaseBReplayPin(env.OFFICE_PHASE_B_PIN,env.OFFICE_PHASE_B_PIN_SHA256);
 const baseline=[];for(let epoch=0;epoch<PHASE_B_FRAMES;epoch++)baseline.push(JSON.parse(await readFile(join(capture,'frames',String(epoch).padStart(4,'0')+'.json'),'utf8')));
 const B=boundaryB(baseline);
 // Before B the anchored branch cannot run, so candidate and baseline outputs must be identical; with no B, everywhere.
 const prefixEnd=B??PHASE_B_FRAMES;
 if(pass==='1'){
  if(pin.snapshotPlanSha256!==null)throw Error('Pass 1 runs before any snapshot plan exists');
  return Object.freeze({pass:1,pin,B,prefixEnd,snapshots:Object.freeze([]),prefixSnapshot:()=>false,expectedPrefixChecks:0});
 }
 if(!pin.snapshotPlanSha256||!env.OFFICE_PHASE_B_PLAN)throw Error('Pass 2 requires the sealed snapshot plan');
 const plan=loadSnapshotPlan(env.OFFICE_PHASE_B_PLAN,pin.snapshotPlanSha256);
 if(plan.B!==B)throw Error('Sealed plan boundary differs from the capture baseline');
 const snapshots=[...plan.epochs].sort((a,b)=>a-b);
 const expectedPrefixChecks=snapshots.flatMap(epoch=>['previous','next'].map(side=>plan.prefixSnapshot(epoch,side))).filter(Boolean).length;
 return Object.freeze({pass:2,pin,B,prefixEnd,snapshots:Object.freeze(snapshots),prefixSnapshot:plan.prefixSnapshot,expectedPrefixChecks});
}
/** Completion for a Phase B comparison receipt: every frame, the exact prefix up to B, the plan's snapshots only.
 * Pass 1 input files must equal the granted job-1 seal count; pass 2 input is job 3's own qualified replay root, whose
 * count comes from that root's seal, checked by the driver against a replay qualified under the granted pin. */
export function requireCompletePhaseBComparison(receipt,mode){
 if(receipt.status!=='complete'||receipt.completedFrames!==PHASE_B_FRAMES||receipt.prefixFrames!==mode.prefixEnd
  ||receipt.prefixSnapshotChecks!==mode.expectedPrefixChecks||receipt.chromium!==mode.pin.chromium
  ||receipt.originalReplayFilesVerified!==(mode.pass===1?mode.pin.originalFiles:receipt.expectedInputFiles)||receipt.snapshots.length!==mode.snapshots.length*2
  ||mode.snapshots.some(epoch=>['previous','next'].some(side=>receipt.snapshots.filter(s=>s.epoch===epoch&&s.side===side).length!==1)))
  throw Error('Incomplete Phase B comparison; no qualified prefix or full candidate capture');
 return true;
}
