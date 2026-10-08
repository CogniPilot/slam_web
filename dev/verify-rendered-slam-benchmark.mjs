// Compare timed generated-function execution with the qualified full reference.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const [csvFile, referenceFile, inputReportFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw Error('CSV REFERENCE_REPORT INPUT_REPORT REPORT required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(csvFile), referenceBytes = fs.readFileSync(referenceFile);
const reference = JSON.parse(referenceBytes), inputBytes = fs.readFileSync(inputReportFile);
const input = JSON.parse(inputBytes);
assert.equal(reference.status, 'OMC_RENDERED_FLIGHT_SLAM_REFERENCE_PASS');
assert.equal(reference.renderedFlightReferenceQualified,true);
assert.equal(reference.bookendsEqual,true);
assert.equal(reference.result.checks.length,24);
assert.ok(reference.result.checks.every(check=>check === true));
assert.equal(reference.result.metrics.length,3);
assert.equal(reference.metricLabels.length,24);
assert.equal(input.status, 'REFERENCE_BOUND_RAW_CAMERA_INPUT_PACKED');
assert.equal(input.referenceReportSha256, sha(referenceBytes));
assert.ok(input.frames.length >= 2 && input.frames.length <= 121);
const lines = bytes.toString().trim().split('\n');
assert.equal(lines.shift(), 'frame,simTime,start,end,kernelMs,readonlyInputs,'
  + Array.from({length:24}, (_, index) => `raw${index+1}`).join(','));
const rows = lines.map(line => {
  assert.ok(line.split(',').every(value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  return line.split(',').map(Number);
});
assert.equal(rows.length, input.frames.length);
let comparisons = 0, maximumDifference = 0;
for (const [index, row] of rows.entries()) {
  assert.equal(row.length, 30);
  assert.ok(row.every(Number.isFinite));
  assert.equal(row[0], index); assert.equal(row[1], input.frames[index].time);
  assert.ok(index === 0 || row[1] > rows[index-1][1], 'Nonincreasing simulation time');
  assert.ok(row[2] > 0 && row[3] > row[2] && row[4] > 0 && row[5] === 1);
  assert.ok(index === 0 || row[2] >= rows[index-1][3], 'Overlapping kernel intervals');
  assert.ok(Math.abs((row[3]-row[2])*1000-row[4]) < 0.000003);
  for (const expected of reference.result.metrics) {
    assert.equal(expected.length, rows.length);
    for (let column = 0; column < 24; column++) {
      const actual = row[column+6], target = expected[index][column];
      assert.ok(Number.isFinite(target));
      const difference = Math.abs(actual-target);
      maximumDifference = Math.max(maximumDifference, difference);
      assert.ok(difference <= 1e-11*Math.max(1, Math.abs(target)),
        `Reference mismatch at frame${index}/${reference.metricLabels[column]}`);
      comparisons++;
    }
  }
}
const duration = rows.at(-1)[1]-rows[0][1], durations = rows.slice(1).map(row => row[4]);
const ordered = durations.toSorted((a,b) => a-b);
const totalMs = durations.reduce((sum,value) => sum+value,0);
const report = {status:'GENERATED_MODELICA_KERNEL_METRICS_MATCH_REFERENCE',
  frameCount:rows.length,heldIntervals:input.frames.reduce((sum,frame)=>sum+frame.holds,0),
  comparisons,maximumDifference,readonlyCameraInputs:true,initializationMs:rows[0][4],
  processing:{meanMs:totalMs/durations.length,medianMs:(ordered[(ordered.length-1)>>1]+ordered[ordered.length>>1])/2,
    minimumMs:ordered[0],maximumMs:ordered.at(-1),totalMs,durationSimSeconds:duration,
    kernelOnlySimToWall:duration*1000/totalMs},
  intervals:rows.map(row=>({frame:row[0],time:row[1],start:row[2],end:row[3],kernelMs:row[4]})),
  csvSha256:sha(bytes),referenceReportSha256:sha(referenceBytes),inputReportSha256:sha(inputBytes),
  inputSha256:input.input.sha256,verifierSha256:sha(fs.readFileSync(import.meta.filename)),
  scope:'One cold sequential native OMC O2 function replay of real captured bytes. '
    + 'Timings exclude input conversion/file IO, metrics extraction, diagnostics, GPU/physics and state transport. '
    + 'Observed metrics agree with the full reference; this is not full-State equivalence, '
    + 'a Rumoca comparison, browser SLAM or complete simulation throughput.'};
fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,intervals:undefined}));
