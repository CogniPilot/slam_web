import {expect,it} from 'vitest';
import {LoopClosureHistory,keyframeThumbnail} from '../src/loop-closure-history';
import type {Estimate,SensorFrame} from '../src/types';
const frame=(sequence:number)=>({sequence,time:sequence*.2,calibration:{width:2,height:1},rgb:new Uint8Array([1,2,3,4,5,6,99,99]),
  imageLayout:{color:{width:2,height:1,strideBytes:8,format:'RGB8'}}}) as SensorFrame;
const node=(id:number)=>({id,time:(id-1)*.2,imageEpoch:id-1,position:[id,0,0],quaternion:[1,0,0,0]});
const estimate=(ids:number[],edge?:number)=>({poseGraph:{keyframes:ids.map(node),edges:edge?[{id:edge,from:0,to:1,kind:'loop'}]:[]}}) as Estimate;

it('owns a small snapshot of raw RGB with padding and leaves sensor bytes untouched',()=>{
  const input=frame(0),image=keyframeThumbnail(input,1,0,0)!;
  expect(Array.from(image.rgba)).toEqual([1,2,3,255,4,5,6,255]);
  expect(Array.from(input.rgb)).toEqual([1,2,3,4,5,6,99,99]);
  input.rgb.fill(0);expect(image.rgba[0]).toBe(1);
});

it('pairs exact retained keyframe images by identity through catalog ring reuse',()=>{
  const history=new LoopClosureHistory();history.observe(frame(0),estimate([1]));
  const first=estimate([1,2],9);history.observe(frame(1),first);history.observe(frame(1),first);
  expect(history.acceptedCount).toBe(1);expect(history.candidateCount).toBeUndefined();
  expect(history.closures[0]).toMatchObject({edgeId:9,referenceId:1,currentId:2,reference:{imageEpoch:0},current:{imageEpoch:1}});
  // Index zero now belongs to a different keyframe; the stored image must not.
  const wrapped=estimate([3,2]);wrapped.poseGraph!.edges=[{id:12,from:1,to:0,kind:'loop'}];
  history.observe(frame(2),wrapped);
  expect(history.closures[0]).toMatchObject({referenceId:2,currentId:3,reference:{imageEpoch:1},current:{imageEpoch:2}});
  expect(history.images.has(1)).toBe(false);expect(history.closures[1].reference?.id).toBe(1);
  expect(history.acceptedCount).toBe(2);
});

it('bounds retained snapshots and closure history and clears them on clock reset',()=>{
  const history=new LoopClosureHistory();
  for(let sequence=0;sequence<160;sequence++){
    const ids=Array.from({length:Math.min(sequence+1,128)},(_,i)=>sequence+2-Math.min(sequence+1,128)+i);
    const e=estimate(ids);if(sequence)e.poseGraph!.edges=[{id:sequence,from:ids.length-2,to:ids.length-1,kind:'loop'}];
    history.observe(frame(sequence),e);
  }
  expect(history.images.size).toBeLessThanOrEqual(128);expect(history.closures).toHaveLength(6);expect(history.acceptedCount).toBe(159);
  history.observe(frame(0),estimate([1]));expect(history.acceptedCount).toBe(0);expect(history.closures).toHaveLength(0);expect(history.images.size).toBe(1);
});

it('never fabricates a similarity score and counts only fresh reported candidates',()=>{
  const history=new LoopClosureHistory(),e=estimate([1,2],1);e.diagnostics={loopCandidates:3};
  history.observe(frame(1),e);history.observe(frame(1),e);
  expect(history.candidateCount).toBe(3);expect(history.closures[0].similarity).toBeUndefined();
});

it('retains rejected image pairs and authored reasons without treating them as graph closures',()=>{
  const history=new LoopClosureHistory();history.observe(frame(0),estimate([1]));
  const e=estimate([1]);e.loopClosure={attempted:true,retrievalReason:0,graphReason:0,candidateCount:1,candidates:[
    {referenceId:1,currentId:2,score:.8,reason:11,verified:false,matchedCount:24,inlierCount:20,rms:.01}]};
  history.observe(frame(1),e);history.observe(frame(1),e);
  expect(history.acceptedCount).toBe(0);expect(history.rejectedCount).toBe(1);expect(history.attempts).toHaveLength(1);
  expect(history.attempts[0]).toMatchObject({status:'rejected',reason:'Loop motion disagrees with retained pose uncertainty',reference:{imageEpoch:0},current:{imageEpoch:1}});
  const accepted=estimate([1,2],9);accepted.loopClosure={...e.loopClosure,candidates:[{...e.loopClosure.candidates[0],reason:0,verified:true}]};
  history.observe(frame(2),accepted);
  expect(history.attempts[0].status).toBe('accepted');expect(history.acceptedCount).toBe(1);expect(history.rejectedCount).toBe(1);
});

it('distinguishes verified geometry from graph admission and bounds candidate snapshots',()=>{
  const history=new LoopClosureHistory();history.observe(frame(0),estimate([1]));
  for(let sequence=1;sequence<=40;sequence++){
    const e=estimate([1]);e.loopClosure={attempted:true,retrievalReason:0,graphReason:4,candidateCount:1,candidates:[{referenceId:1,currentId:2,score:.7,reason:0,verified:true}]};
    history.observe(frame(sequence),e);
  }
  expect(history.attempts).toHaveLength(24);expect(history.acceptedCount).toBe(0);
  expect(history.attempts[0]).toMatchObject({status:'not-added',reason:'Geometric verification passed; Consecutive-keyframe constraint rejected'});
  const refused=estimate([1]);refused.diagnostics={publicationReason:6};
  refused.loopClosure={attempted:true,retrievalReason:0,graphReason:0,candidateCount:1,candidates:[{referenceId:1,currentId:2,score:.7,reason:0,verified:true}]};
  history.observe(frame(41),refused);
  expect(history.attempts[0].reason).toContain('Final localization or graph invariant rejected publication');
  history.observe(frame(0),estimate([1]));expect(history.attempts).toHaveLength(0);expect(history.rejectedCount).toBe(0);
});
