// Plan-driven snapshot selection for the Phase B replay harnesses (baseline saved replay and candidate comparison).
// Replaces the fixed OFFICE_REPLAY.snapshots list and the hard-coded FIRST_POTENTIAL_ANCHOR=1206 for Phase B only.
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
/** Load the sealed pass-1 plan; the caller supplies its expected sha256 from the pinned grant, never from the file. */
export function loadSnapshotPlan(path,expectedSha256){
  const raw=readFileSync(path);if(createHash('sha256').update(raw).digest('hex')!==expectedSha256)throw Error('Snapshot plan hash mismatch');
  const plan=JSON.parse(raw);
  if(plan.plan!=='phase-b-snapshots'||!Number.isInteger(plan.B)||plan.B<1||plan.verdictEffect!=='continue')throw Error('Plan is not runnable: '+plan.verdictEffect);
  const epochs=new Set();
  for(const s of plan.snapshots){
    if(!['baseline','candidate'].includes(s.side)||!['previous','next'].includes(s.state)||!Number.isInteger(s.epoch)||s.epoch<0||s.epoch>1250)throw Error('Invalid snapshot entry');
    epochs.add(s.epoch);
  }
  if(epochs.size>2+16)throw Error('Snapshot plan exceeds the bounded count');
  return{B:plan.B,epochs,
    // Exact baseline/candidate equality is required for every state strictly before B, and for B's previous state.
    prefixSnapshot:(epoch,side)=>epoch<plan.B||(epoch===plan.B&&side==='previous')};
}
/* Harness wiring (applied when the Phase B job source is assembled from the replay and comparison branches):
   office-compare.browser.ts   context.wanted = new Set(OFFICE_REPLAY.snapshots)   ->   new Set(plan.epochs)  (plan injected via page.evaluate)
   compare-office-browser.mjs   OFFICE_REPLAY.snapshots.includes(meta.epoch)         ->   plan.epochs.has(meta.epoch)
   compare-office-browser.mjs   prefixSnapshot from office-compare-contract.mjs      ->   plan.prefixSnapshot
   baseline saved-replay harness: same epochs, so baseline 'old' snapshots exist for every candidate snapshot. */
