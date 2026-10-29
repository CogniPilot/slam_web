import assert from 'node:assert/strict';

export function validateRecordedFixture(binding,sensors,golden){
  assert.equal(binding.sourceFrames,2501);assert.equal(binding.firstTime,0);assert.equal(binding.lastTime,500);
  assert.equal(sensors.sensorFrames.length,2501);assert.equal(golden.length,2501);
  let previous=-Infinity;
  for(const [index,frame] of sensors.sensorFrames.entries()){
    assert.equal(frame.index,index);assert.equal(frame.scene,'office-loop');
    assert.ok(Number.isFinite(frame.time)&&frame.time>previous);previous=frame.time;
    assert.equal(frame.time,golden[index].time);assert.equal(golden[index].index,index);
    assert.deepEqual(Object.keys(frame).sort(),['scene','index','time','sequence','imageLayout','calibration','imu','imuIntervals','images'].sort());
    for(const kind of ['rgb','depth']){
      assert.equal(frame.images[kind].path,`office-loop/frames/${String(index).padStart(4,'0')}-${kind}.bin`);
      assert.match(frame.images[kind].sha256,/^[a-f0-9]{64}$/);
    }
  }
  assert.equal(sensors.sensorFrames[0].time,0);assert.equal(previous,500);
}

export function scientificProjection(estimate,index,time){
  const position=[estimate.x,estimate.y,estimate.z],quaternion=Array.from(estimate.quaternion);
  assert.ok([...position,...quaternion].every(Number.isFinite));
  const diagnostics=Object.fromEntries(Object.entries(estimate.diagnostics).filter(([key])=>!['stepMsMax','stepMsTotal'].includes(key)));
  for(const value of Object.values(diagnostics))if(typeof value==='number')assert.ok(Number.isFinite(value));
  // Match the retained JSON boundary, including its canonical zero representation.
  return JSON.parse(JSON.stringify({index,time,position,quaternion,diagnostics,graphSize:estimate.poseGraph.keyframes.length,loopClosure:estimate.loopClosure}));
}

export function compareRecordedFrame(actual,expected){
  // Exact scientific results: no tolerance, interpolation or changed acceptance threshold.
  assert.deepStrictEqual(actual,expected,`Recorded worker parity at frame ${expected.index}, t=${expected.time}`);
}

/** Collect diagnostic coverage without turning any exact mismatch into a pass. */
export class RecordedComparisonAudit {
  frameMismatches=0;
  graphMismatch=false;
  firstMismatches=[];
  record(kind,compare,identity={}){
    try{compare();}
    catch(error){
      if(!(error instanceof assert.AssertionError))throw error;
      if(kind==='frame')this.frameMismatches++;else this.graphMismatch=true;
      if(this.firstMismatches.length<5)this.firstMismatches.push({kind,...identity,error:String(error)});
    }
  }
  frame(actual,expected){this.record('frame',()=>compareRecordedFrame(actual,expected),{index:expected.index,time:expected.time});}
  graph(actual,expected){this.record('graph',()=>assert.deepStrictEqual(actual,expected,'Recorded final graph parity'));}
  summary(){return {frameMismatches:this.frameMismatches,graphMismatch:this.graphMismatch,firstMismatches:this.firstMismatches};}
  assertExact(){
    assert.equal(this.frameMismatches,0,'Recorded scientific frames differ; inspect firstMismatches and OBSERVATIONS.jsonl');
    assert.equal(this.graphMismatch,false,'Recorded final graph differs; inspect FINAL-GRAPH.json');
  }
}
