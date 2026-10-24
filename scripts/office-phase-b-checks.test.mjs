// UNEXECUTED until a separate GO. Synthetic fixtures only; no capture data.
import test from 'node:test';import assert from 'node:assert/strict';
import {reference,envelopeCheck,returnCheck,wallDistance,boundaryB,recoveryEvents,snapshotPlan,anchoredAdmissionProof,GEOMETRY} from './office-phase-b-checks.mjs';

const quat=h=>[Math.cos(h/2),0,0,Math.sin(h/2)];
function flight(route,offset=[0,0,0]){
  return Array.from({length:1251},(_,i)=>{const t=i*0.2,r=reference(t,route);
    return{sequence:i,time:t,truth:{x:r.x+offset[0],y:r.y+offset[1],z:r.z+offset[2],quaternion:quat(r.heading),velocity:[0,0,0]}};});
}
test('reference: single circuit corners match the reviewed physics check',()=>{
  for(const[t,x,y]of[[65,24,0],[115,24,16],[185,0,16],[235,0,0]]){const r=reference(t,'single');assert.ok(Math.hypot(r.x-x,r.y-y)<1e-9);}
});
test('reference: two-circuit seam at 125 s is the start corner with heading 2*pi; end heading 4*pi',()=>{
  const a=reference(125,'two-circuit'),b=reference(250,'two-circuit');
  assert.ok(Math.hypot(a.x,a.y)<1e-9&&Math.abs(a.heading-2*Math.PI)<1e-9);assert.ok(Math.hypot(b.x,b.y)<1e-9&&Math.abs(b.heading-4*Math.PI)<1e-9);
});
test('wallDistance: centreline 1.645 m from faces; corner junction; inside block negative',()=>{
  assert.ok(Math.abs(wallDistance(12,0)-GEOMETRY.freeHalfWidth)<1e-12);assert.ok(wallDistance(0,0)>=GEOMETRY.freeHalfWidth-1e-12);assert.ok(wallDistance(12,8)<0);
});
test('envelope: ideal flight passes; 0.8 m lateral offset refuses tracking; wall-hugging refuses clearance',()=>{
  assert.equal(envelopeCheck(flight('two-circuit'),'two-circuit').status,'pass');
  assert.ok(envelopeCheck(flight('two-circuit',[0,0.8,0]),'two-circuit').violations.some(v=>v.reasons.includes('tracking')));
  const hug=flight('two-circuit');hug[300].truth.y+=1.3;assert.ok(envelopeCheck(hug,'two-circuit').violations.some(v=>v.reasons.includes('wall-clearance')));
});
test('envelope: frame gap and bad truth refuse loudly',()=>{
  const f=flight('two-circuit');f[10].sequence=11;assert.throws(()=>envelopeCheck(f,'two-circuit'),/gap/);
  const g=flight('two-circuit');g[5].truth.z=NaN;assert.throws(()=>envelopeCheck(g,'two-circuit'),/invalid truth/);
});
test('return: ideal passes at 625 and 1250; 0.2 m endpoint miss and 0.05 rad heading miss refuse',()=>{
  assert.equal(returnCheck(flight('two-circuit'),'two-circuit').status,'pass');
  const p=flight('two-circuit');p[625].truth.x+=0.2;assert.equal(returnCheck(p,'two-circuit').status,'refused');
  const h=flight('two-circuit');h[1250].truth.quaternion=quat(4*Math.PI+0.05);assert.equal(returnCheck(h,'two-circuit').status,'refused');
});
// Native-output fixtures shaped like comparison-run frames, with keyframe and edge IDs.
function nativeRun(events){
  let kf=[1,2,3,4],loops=[],nextEdge=100,nextKf=5;
  return Array.from({length:1251},(_,i)=>{
    const e=events[i]??{};
    if(e.evict)kf=kf.slice(1);
    if(e.capture){kf=[...kf,nextKf++];for(let k=0;k<(e.edges??1);k++)loops=[...loops,{kind:'loop',id:nextEdge++,from:0,to:kf.length-1}];}
    return{sequence:i,time:i*0.2,native:{loopClosure:{candidates:e.candidates??[]},
      poseGraph:{keyframes:kf.map(id=>({id})),edges:loops}},
      nativeTrace:{derived:{sequentialRejectionReason:e.seq??0,graphCorrectionAccepted:!!e.correct,graphReason:e.correct?0:1,graphCommitReason:0}}};});
}
const two=[{referenceId:1,verified:true},{referenceId:2,verified:true}];
test('B: first frame with two distinct verified references; ignores unverified and duplicate ids',()=>{
  const run=nativeRun({100:{candidates:[{referenceId:1,verified:true},{referenceId:1,verified:true}]},200:{candidates:[{referenceId:1,verified:true},{referenceId:2,verified:false}]},300:{candidates:[{referenceId:1,verified:true},{referenceId:3,verified:true}]}});
  assert.equal(boundaryB(run),300);
});
test('recovery events: any sequential reason counts (6, 7, 11 and 0), all events reported with times, IDs not counts',()=>{
  const base=nativeRun({590:{candidates:two}});
  const cand=nativeRun({590:{candidates:two},600:{seq:6,capture:true,edges:2,correct:true},605:{seq:0,capture:true,edges:1,correct:true},
    608:{seq:7,capture:true,edges:3,correct:false},612:{seq:11,capture:true,edges:1,correct:true},700:{evict:true,capture:true,edges:1,correct:true}});
  const ev=recoveryEvents(cand,boundaryB(base));
  assert.deepEqual(ev.map(e=>e.epoch),[600,605,612,700]);
  assert.deepEqual(ev.map(e=>e.sequentialInvalidObserved),[true,false,true,false]);
  assert.equal(ev[3].newKeyframeIds.length,1);        // eviction plus capture keeps the count flat; IDs still detect it
});
test('plan: snapshots for B and every event; no early event => INCONCLUSIVE',()=>{
  const base=nativeRun({590:{candidates:two}});
  const cand=nativeRun({590:{candidates:two},600:{seq:6,capture:true,correct:true}});
  const plan=snapshotPlan(base,cand);assert.equal(plan.verdictEffect,'continue');assert.equal(plan.snapshots.length,6);
  const late=nativeRun({590:{candidates:two},1206:{seq:7,capture:true,edges:3,correct:true}});
  assert.match(snapshotPlan(base,late).verdictEffect,/INCONCLUSIVE/);
  assert.match(snapshotPlan(nativeRun({}),late).verdictEffect,/no B/);
});
test('anchored proof: two loop edges from distinct references and no consecutive edge into N; each clause can fail',()=>{
  const ok={lastCaptureId:15,reset:false,firstCapture:false,edges:[{kind:2,referenceId:1,currentId:15},{kind:2,referenceId:4,currentId:15},{kind:1,referenceId:13,currentId:14}]};
  assert.equal(anchoredAdmissionProof(ok,15).proven,true);assert.equal(anchoredAdmissionProof(ok,15,1).proven,true);
  assert.equal(anchoredAdmissionProof(ok,15,0).proven,false);
  assert.equal(anchoredAdmissionProof({...ok,edges:[...ok.edges,{kind:1,referenceId:14,currentId:15}]},15).proven,false);
  assert.equal(anchoredAdmissionProof({...ok,edges:ok.edges.filter(e=>e.referenceId!==4)},15).proven,false);
  assert.equal(anchoredAdmissionProof({...ok,edges:[{kind:2,referenceId:1,currentId:15},{kind:2,referenceId:1,currentId:15}]},15).proven,false);
  assert.equal(anchoredAdmissionProof({...ok,reset:true},15).proven,false);assert.equal(anchoredAdmissionProof({...ok,lastCaptureId:14},15).proven,false);
});
test('anchored proof: only the first-capture clause fails',()=>{
  const g={lastCaptureId:15,reset:false,firstCapture:true,edges:[{kind:2,referenceId:1,currentId:15},{kind:2,referenceId:4,currentId:15}]};
  const r=anchoredAdmissionProof(g,15);assert.equal(r.proven,false);
  assert.deepEqual(Object.entries(r.clauses).filter(([,v])=>v===false).map(([k])=>k),['notFirstCapture']);
});
