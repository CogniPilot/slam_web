import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const sha = value => createHash('sha256').update(value).digest('hex');
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const summary = [];
for (const [directory, experiment] of [
  ['direct-sync-readback-2026-10-07', 'direct-sync'],
  ['browser-cpu-scaling-2026-10-07', 'cpu-cores'],
]) {
  const root = path.join('dev/artifacts', directory);
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
  const report = read('report.json');
  assert.equal(report.experiment, experiment);
  assert.equal(report.status, 'CAMERA_PACKING_ABBA_RAW_PARITY_PASS');
  assert.equal(report.sourceBookendsEqual, true);
  assert.deepEqual(report.errors, []);
  assert.equal(sha(fs.readFileSync(path.join(root, 'sources/profile-camera-packing.mjs'))), report.probeSha256);
  for (const [file, hash] of Object.entries(report.sources)) assert.equal(sha(fs.readFileSync(file)), hash);
  const windows = [0, 1, 2, 3].map(index => read(`window-${index}.json`));
  assert.deepEqual(windows.map(window => window.combined), [false, true, true, false]);
  for (const window of windows) {
    assert.equal(window.frames.length, 150);
    assert.equal(window.parity.length, 4);
    assert.deepEqual(window.parity, windows[0].parity);
    assert.deepEqual(window.rates, {cameraHz: 30, lidarHz: 10, imuHz: 90, gpsHz: 5});
    assert.ok(Math.abs(window.simSeconds - 5) < 1e-10);
    assert.ok(Math.abs(window.rtf - window.simSeconds * 1000 / window.wallMs) < 1e-12);
    assert.equal(window.graphics.acceleration, 'hardware-reported');
    if (experiment === 'direct-sync' && window.combined) assert.ok(window.referenceRequests > 0);
    if (experiment === 'cpu-cores') {
      const expected = window.combined ? [8, 9, 10, 11] : [8, 9];
      assert.deepEqual(window.affinity.requested, expected);
      assert.ok(window.affinity.observed.length > 0);
      for (const thread of window.affinity.observed) {
        const expanded = thread.allowed.split(',').flatMap(part => {
          const [first, last = first] = part.split('-').map(Number);
          return Array.from({length: last - first + 1}, (_, index) => first + index);
        });
        assert.deepEqual(expanded, expected);
      }
    }
  }
  const group = combined => {
    const selected = windows.filter(window => window.combined === combined);
    return {meanRtf: mean(selected.map(window => window.rtf)),
      meanCpuSeconds: mean(selected.map(window => window.cpuSeconds)),
      meanActiveCores: mean(selected.map(window => window.approximateCpuCores)),
      meanPhysicsWallMs: mean(selected.flatMap(window => window.frames.map(frame => frame.nodes.physics))),
      meanSensorWallMs: mean(selected.flatMap(window => window.frames.map(frame => frame.nodes.sensor)))};
  };
  const baseline = group(false), candidate = group(true);
  assert.equal(baseline.meanRtf, report.baseline.meanRtf);
  assert.equal(candidate.meanRtf, report.combined.meanRtf);
  assert.equal(candidate.meanRtf / baseline.meanRtf, report.speedRatio);
  if (experiment === 'cpu-cores') {
    assert.equal(new Set(report.topology.map(cpu => `${cpu.socket}:${cpu.core}`)).size, 4);
    assert.ok(Math.min(...windows.filter(window => window.combined).map(window => window.rtf))
      > Math.max(...windows.filter(window => !window.combined).map(window => window.rtf)));
  } else {
    assert.ok(candidate.meanRtf < baseline.meanRtf);
    assert.equal(sha(fs.readFileSync(path.join(root, 'sources/direct-sync-readback-method.mjs'))),
      report.sources['tests/fixtures/direct-sync-readback-method.mjs']);
  }
  summary.push({experiment, baseline, candidate, speedRatio: report.speedRatio,
    decision: experiment === 'direct-sync' ? 'REJECTED_SLOWER_READBACK' : 'CPU_BUDGET_SENSITIVITY_OBSERVED',
    productionOptimization: false});
}
const result = {status: 'READBACK_AND_CPU_SCALING_EVIDENCE_REVIEWED', recordedAt: new Date().toISOString(),
  reviewerSha256: sha(fs.readFileSync(import.meta.filename)), summary, fullBrowserSlam: false,
  historicalScopeCorrection: 'The original cpu-cores report reused the route-experiment scope sentence. Its actual frozen runner and affinity records show only browser CPU affinity changed; no experimental shader/readback code was routed in that campaign. The current runner now describes CPU-budget comparisons separately.',
  scope: 'Two short ABBA campaigns with inertial propagation. CPU affinity records are checked before capture. Raw parity covers four warmup samples per window. CPU deltas are approximate. Four-core improvement removes a diagnostic restriction and is not a shipped optimization or a 10x result.'};
fs.writeFileSync('dev/artifacts/browser-cpu-scaling-2026-10-07/review.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
