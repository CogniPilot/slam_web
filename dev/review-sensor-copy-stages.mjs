import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const directory = 'dev/artifacts/sensor-copy-stages-2026-10-07';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(path.join(directory, file)));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const probeSha = sha(fs.readFileSync(path.join(directory, 'executed/profile-current-sensor-worker.mjs')));
const profilerSha = sha(fs.readFileSync(path.join(directory, 'executed/gpu-sensor-profiler.ts')));
const baselineSources = read('sync-drain-0/sources.json');
const groups = [];

for (const mode of ['sync', 'async']) {
  for (const finish of [false, true]) {
    const name = `${mode}-drain-${Number(finish)}`;
    const report = read(`${name}/report.json`);
    const sources = read(`${name}/sources.json`);
    assert.equal(report.status, 'HELD_POSE_SENSOR_WORKER_GPU_TIMING_AND_RAW_PARITY_COMPLETE');
    assert.equal(report.probeSha256, probeSha);
    assert.equal(sources['src/gpu-sensor-profiler.ts'], profilerSha);
    assert.deepEqual(sources, baselineSources);
    assert.equal(report.sourceBookendsEqual, true);
    assert.equal(report.timeBefore, report.timeAfter);
    assert.deepEqual(report.errors, []);
    assert.equal(report.hostOnly, true);
    assert.equal(report.repeats, 30);
    assert.equal(report.rows.length, 60);
    assert.equal(report.drainBeforeCopy, finish);
    assert.equal(report.readbackMode, mode);
    for (const lidarEnabled of [false, true]) {
      const rows = report.rows.filter(row => row.lidarEnabled === lidarEnabled);
      assert.equal(rows.length, 30);
      for (const row of rows) {
        assert.equal(row.rawBytesMatch, true);
        assert.equal(row.graphics.acceleration, 'hardware-reported');
        assert.equal(row.gpuProfile.timerSupported, false);
        const events = row.gpuProfile.events;
        const copies = events.filter(event => event.kind === 'host-copy');
        assert.equal(copies.length, 1);
        assert.ok(copies[0].bytes >= row.rgbBytes + row.depthBytes + row.scanBytes);
        assert.ok(Number.isFinite(copies[0].apiWallMs) && copies[0].apiWallMs >= 0);
        const fences = events.filter(event => event.kind === 'fence-wait');
        assert.equal(fences.length, mode === 'async' ? 1 : 0);
        for (const fence of fences) {
          assert.ok(fence.polls >= 1 && Number.isInteger(fence.polls));
          assert.ok(Number.isFinite(fence.waitMs) && fence.waitMs >= fence.apiWallMs - 0.2);
        }
        assert.equal(events.filter(event => event.kind === 'gpu-drain').length, finish ? 1 : 0);
      }
      const events = rows.flatMap(row => row.gpuProfile.events);
      groups.push({mode, lidarEnabled, finishExperiment: finish, captures: rows.length,
        meanRpcWallMs: mean(rows.map(row => row.rpcWallMs)),
        meanCopyApiWallMs: mean(events.filter(event => event.kind === 'host-copy').map(event => event.apiWallMs)),
        meanFenceWaitMs: mean(events.filter(event => event.kind === 'fence-wait').map(event => event.waitMs)),
        meanFencePolls: mean(events.filter(event => event.kind === 'fence-wait').map(event => event.polls)),
        meanFinishApiWallMs: mean(events.filter(event => event.kind === 'gpu-drain').map(event => event.apiWallMs))});
    }
  }
}

const implementation = read('chromium-finish.json');
assert.match(implementation.excerpt, /ContextGL\(\)->Flush\(\)/);
assert.match(implementation.excerpt, /Intentionally a flush, not a finish/);
const finalProbeSha = sha(fs.readFileSync(path.join(directory, 'final/profile-current-sensor-worker.mjs')));
const finalProfilerSha = sha(fs.readFileSync(path.join(directory, 'final/gpu-sensor-profiler.ts')));
assert.equal(sha(fs.readFileSync('src/gpu-sensor-profiler.ts')), finalProfilerSha);
for (const mode of ['sync', 'async']) {
  const report = read(`final/${mode}/report.json`);
  const sources = read(`final/${mode}/sources.json`);
  assert.equal(report.probeSha256, finalProbeSha);
  assert.equal(sources['src/gpu-sensor-profiler.ts'], finalProfilerSha);
  assert.equal(report.sourceBookendsEqual, true);
  assert.equal(report.timeBefore, report.timeAfter);
  assert.equal(report.rows.length, 10);
  assert.equal(report.hostOnly, true);
  assert.equal(report.readbackMode, mode);
  assert.ok(report.profileRouteRequests > 0);
  for (const [file, hash] of Object.entries(sources)) {
    if (file !== 'src/gpu-sensor-profiler.ts') assert.equal(hash, baselineSources[file]);
    assert.equal(sha(fs.readFileSync(file)), hash);
  }
  assert.deepEqual(report.errors, []);
  for (const row of report.rows) {
    assert.equal(row.rawBytesMatch, true);
    assert.equal(row.gpuProfile.timerSupported, false);
    assert.equal(row.gpuProfile.events.some(event => event.kind === 'gpu-drain'), false);
    assert.equal(row.gpuProfile.events.filter(event => event.kind === 'fence-wait').length, mode === 'async' ? 1 : 0);
  }
}
const result = {status: 'FENCE_AND_COPY_DIAGNOSTIC_EVIDENCE_REVIEWED', recordedAt: new Date().toISOString(),
  probeSha256: probeSha, profilerSha256: profilerSha, reviewerSha256: sha(fs.readFileSync(import.meta.filename)),
  finalProbeSha256: finalProbeSha, finalProfilerSha256: finalProfilerSha, finalCapturesVerified: 20,
  groups, finishExperimentValidCompletionBarrier: false,
  limitations: ['Original gpu-drain/drainedBeforeCopy labels are invalid: Chromium implements finish as flush. Those observations do not isolate GPU completion.',
    'Fence wait includes GPU/browser completion and event-loop polling/scheduling; it is not pure GPU execution time.',
    'Post-fence getBufferSubData includes browser/driver mapping and transport, not just memcpy.',
    'Held-pose profiling with repeated parity checks is not a matched flight-throughput benchmark or full browser SLAM execution.'],
  fullBrowserSlam: false, speedupQualified: false};
fs.writeFileSync(path.join(directory, 'review.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
