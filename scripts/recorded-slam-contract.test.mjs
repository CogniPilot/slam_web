import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scientificProjection,compareRecordedFrame,validateRecordedFixture,RecordedComparisonAudit} from './recorded-slam-contract.mjs';
const estimate=()=>({x:1,y:2,z:3,quaternion:[1,0,0,0],diagnostics:{accepted:1,retiredLoopFactors:3,stepMsMax:4,stepMsTotal:8},poseGraph:{keyframes:[{id:9}]},loopClosure:{attempted:true,candidates:[{referenceId:1,currentId:9}]}});
test('timing variation cannot alter the scientific comparison',()=>{
  const a=estimate(),b=estimate();b.diagnostics.stepMsMax=1000;b.diagnostics.stepMsTotal=2000;
  compareRecordedFrame(scientificProjection(a,1,.2),scientificProjection(b,1,.2));
});
test('pose, clock, graph count, acceptance and loop identity differences fail',()=>{
  const expected=scientificProjection(estimate(),1,.2);
  for(const change of [e=>e.x+=1e-12,e=>e.diagnostics.accepted=0,e=>e.diagnostics.retiredLoopFactors=2,e=>e.poseGraph.keyframes.push({id:10}),e=>e.loopClosure.candidates[0].currentId=10]){
    const actual=estimate();change(actual);
    assert.throws(()=>compareRecordedFrame(scientificProjection(actual,1,.2),expected));
  }
  assert.throws(()=>compareRecordedFrame({...expected,time:.4},expected));
  assert.throws(()=>compareRecordedFrame({...expected,index:2},expected));
});
test('nonfinite pose and diagnostic values are refused',()=>{
  for(const change of [e=>e.x=NaN,e=>e.quaternion[0]=Infinity,e=>e.diagnostics.accepted=NaN]){
    const actual=estimate();change(actual);assert.throws(()=>scientificProjection(actual,1,.2));
  }
});
test('comparison uses the retained JSON zero representation',()=>{
  const a=estimate(),b=estimate();a.x=-0;b.x=0;
  compareRecordedFrame(scientificProjection(a,1,.2),scientificProjection(b,1,.2));
});
test('retaining later frames never erases an exact mismatch or graph failure',()=>{
  const expected=scientificProjection(estimate(),1,.2),audit=new RecordedComparisonAudit();
  audit.frame(expected,expected);audit.graph({keyframes:[]},{keyframes:[]});audit.assertExact();
  const actual=structuredClone(expected);actual.position[0]=1+Number.EPSILON;
  audit.frame(actual,expected);audit.frame(expected,expected);
  assert.equal(audit.summary().frameMismatches,1);assert.throws(()=>audit.assertExact());
  for(let i=0;i<10;i++)audit.frame(actual,expected);
  assert.equal(audit.summary().firstMismatches.length,5);assert.equal(audit.summary().frameMismatches,11);
  const graphAudit=new RecordedComparisonAudit();graphAudit.graph({keyframes:[1]},{keyframes:[]});
  assert.equal(graphAudit.summary().graphMismatch,true);assert.throws(()=>graphAudit.assertExact());
  assert.throws(()=>audit.record('frame',()=>{throw Error('Transport failure');}),/Transport failure/);
});
test('fixture admission refuses evaluator leakage, gaps and mismatched clocks',()=>{
  const make=()=>{
    const sensorFrames=Array.from({length:2501},(_,index)=>({scene:'office-loop',index,time:index/5,sequence:index,imageLayout:{},calibration:{},imu:{},imuIntervals:[],images:Object.fromEntries(['rgb','depth'].map(kind=>[kind,{path:`office-loop/frames/${String(index).padStart(4,'0')}-${kind}.bin`,sha256:'0'.repeat(64)}]))}));
    return {sensors:{sensorFrames},golden:sensorFrames.map(({index,time})=>({index,time}))};
  };
  const binding={sourceFrames:2501,firstTime:0,lastTime:500},valid=make();validateRecordedFixture(binding,valid.sensors,valid.golden);
  for(const change of [f=>f.sensors.sensorFrames[5].truth={},f=>f.sensors.sensorFrames[5].index=4,f=>f.golden[5].time=1.1,f=>f.sensors.sensorFrames.pop()]){
    const invalid=make();change(invalid);assert.throws(()=>validateRecordedFixture(binding,invalid.sensors,invalid.golden));
  }
});
