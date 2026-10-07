// Audit measured experiments and the decision to retain the existing transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const directory='dev/artifacts/sensor-readback-profile-2026-10-07';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(path.join(directory,file)));
const sources=read('sources.json');
for(const [file,digest] of Object.entries(sources))assert.equal(sha(fs.readFileSync(file)),digest,`Production source changed: ${file}`);
const profiles=[];
for(const name of ['synchronous','asynchronous']){
  const report=read(`${name}.json`),summary=read(`${name}-summary.json`),profile=read(`${name}.cpuprofile.json`);
  assert.equal(report.status,'HELD_POSE_SENSOR_WORKER_GPU_TIMING_AND_RAW_PARITY_COMPLETE');
  assert.deepEqual(report.errors,[]);assert.equal(report.sourceBookendsEqual,true);
  assert.equal(report.timeBefore,report.timeAfter);assert.equal(report.rows.length,10);
  for(const row of report.rows){
    assert.equal(row.rawBytesMatch,true);assert.equal(row.rgbBytes,848*480*3);assert.equal(row.depthBytes,848*480*2);
    assert.equal(row.graphics.acceleration,'hardware-reported');
    assert.equal(row.gpuProfile.disjoint,false);assert.equal(row.gpuProfile.timerSupported,true);
  }
  assert.equal(profile.status,'ACTUAL_WORKER_CPU_PROFILE_CAPTURED');
  assert.match(profile.worker.url,/sensor-render\.worker/);assert.equal(profile.interval,1000);
  assert.equal(summary.profileSha256,sha(fs.readFileSync(path.join(directory,`${name}.cpuprofile.json`))));
  assert.equal(summary.samples,profile.profile.samples.length);assert.ok(summary.samples>1000);
  profiles.push({name,samples:summary.samples,worker:profile.worker.url,
    readbackSamplePercent:summary.self.find(row=>row.name==='getBufferSubData').percent,
    heldCaptures:report.perfCapture.captures,heldWallMs:report.perfCapture.wallMs});
}
const experiments=[];
for(const [label,reportFile,prefix] of [['combined-attachment','combined-experiment.json',''],['static-read-hint','static-read/report.json','static-read/']]){
  const report=read(reportFile),windows=[0,1,2,3].map(index=>read(`${prefix}window-${index}.json`));
  assert.equal(report.status,'CAMERA_PACKING_ABBA_RAW_PARITY_PASS');assert.deepEqual(report.errors,[]);
  assert.equal(report.sourceBookendsEqual,true);assert.equal(report.fullSlam,false);
  assert.deepEqual(windows.map(row=>row.combined),[false,true,true,false]);
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  for(const row of windows){
    assert.equal(row.frames.length,150);assert.ok(Math.abs(row.simSeconds-5)<1e-10);
    assert.deepEqual(row.parity,windows[0].parity);assert.equal(row.parity.length,4);
    assert.deepEqual(row.rates,{cameraHz:30,lidarHz:10,imuHz:90,gpsHz:5});
    assert.equal(row.graphics.acceleration,'hardware-reported');
  }
  const baseline=mean(windows.filter(row=>!row.combined).map(row=>row.rtf));
  const candidate=mean(windows.filter(row=>row.combined).map(row=>row.rtf));
  assert.equal(report.speedRatio,candidate/baseline);assert.ok(report.speedRatio<1);
  experiments.push({label,baselineRtf:baseline,candidateRtf:candidate,speedRatio:report.speedRatio,
    decision:'REJECTED_NOT_PROMOTED',matchingRawFlightSamples:16});
}
const candidate=fs.readFileSync(path.join(directory,'combined-candidate.ts'));
assert.equal(sha(candidate),read('combined-experiment.json').sources['src/gpu-realsense-packing.ts']);
const perfData=path.join(process.env.HOME,'scratch/slam_web/profiles/sensor-cpu-pgmBeV/perf.data');
assert.ok(fs.existsSync(perfData),'Original owned perf trace must be present for this audit');
const result={status:'SENSOR_READBACK_PROFILE_AND_REJECTED_EXPERIMENTS_VERIFIED',recordedAt:new Date().toISOString(),
  productionBookendsRestored:true,profiles,experiments,perf:{homeRelative:'scratch/slam_web/profiles/sensor-cpu-pgmBeV/perf.data',
    sha256:sha(fs.readFileSync(perfData)),bytes:fs.statSync(perfData).size},
  reviewerSha256:sha(fs.readFileSync(import.meta.filename)),fullBrowserSlam:false,tenTimesRealtime:false,
  scope:'Worker samples include blocking time and are not an actual CPU-utilization percentage. Held-pose sampled captures are diagnostic; ABBA windows cover the complete current inertial pipeline with moving actors. No full-SLAM throughput or cross-computer performance claim.'};
fs.writeFileSync(path.join(directory,'review.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
