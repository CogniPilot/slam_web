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
