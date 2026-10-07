import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {rgbdSlamNativeSourceManifest as manifest} from '../src/modelica-slam-source-manifest.mjs';
const directory='dev/artifacts/native-record-reset-scaling-2026-10-07';
const resetDirectory='dev/artifacts/native-state-carry/ci-a391c2e20/full-program/reset-180s';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file));
const report=json(path.join(directory,'report.json')),reset=json(path.join(resetDirectory,'report.json'));
const fullSource=manifest.paths.map(file=>fs.readFileSync(file,'utf8')).join(manifest.separator);
assert.equal(sha(fullSource),report.applicationSourceSha256);assert.equal(reset.sourceSha256,sha(fullSource));
assert.equal(report.applicationSourceBookendsEqual,true);
assert.equal(report.probeSha256,sha(fs.readFileSync(path.join(directory,'probe.mjs'))));
assert.deepEqual(report.rows.map(row=>row.capacity),[16,64,256,1024]);
assert.equal(reset.status,'ACTUAL_BROWSER_COMPILER_ISSUANCE_FAILED');assert.equal(reset.timeoutMs,180000);
assert.equal(reset.compilerIssuedSourceBoundArtifact,false);assert.match(reset.error,/timed out/);
assert.ok(reset.compilerElapsedMs>=180000);
const fullProfile=json(path.join(resetDirectory,'profile-summary.json'));
assert.equal(fullProfile.profileSha256,sha(fs.readFileSync(path.join(resetDirectory,'compiler-profile.json'))));
assert.equal(fullProfile.compilerModuleSha256,reset.compilerModuleSha256);
assert.ok(fullProfile.durationMs>=180000);
const layouts=[];
for(const row of report.rows){
  const output=path.join(directory,`capacity-${row.capacity}`),source=fs.readFileSync(path.join(output,'source.mo'));
  assert.equal(sha(source),row.sourceSha256);assert.equal(row.compilerModuleSha256,reset.compilerModuleSha256);
  assert.ok(String(source).includes(`constant Integer capacity = ${row.capacity};`));
  const issuance=json(path.join(output,'report.json'));assert.equal(issuance.sourceSha256,row.sourceSha256);
  if(row.capacity===1024){
    assert.equal(row.exitCode,1);assert.equal(issuance.timeoutMs,20000);assert.match(issuance.error,/timed out/);
    assert.equal(fs.existsSync(path.join(output,'artifact.json')),false);continue;
  }
  assert.equal(row.exitCode,0);assert.equal(issuance.status,'ACTUAL_BROWSER_COMPILER_NATIVE_PROGRAM_ISSUANCE_AND_ABI_ADMISSION_PASS');
  const raw=fs.readFileSync(path.join(output,'artifact.json')),artifact=JSON.parse(raw);
  assert.equal(sha(raw),issuance.artifactSha256);assert.equal(artifact.source_sha256,row.sourceSha256);
  assert.equal(sha(Buffer.from(artifact.module_bytes)),artifact.module_sha256);
  assert.equal(artifact.abi.y_count,row.realCells);assert.equal(artifact.abi.memory_pages*65536,row.memoryBytes);
  layouts.push({capacity:row.capacity,compileMs:row.compileMs,publishedRealBytes:artifact.abi.y_count*8,
    scratchBytes:artifact.abi.scratch_bytes,issuedMemoryBytes:row.memoryBytes,
    scratchToPublishedRealRatio:artifact.abi.scratch_bytes/(artifact.abi.y_count*8)});
}
const smallProfile=json(path.join(directory,'capacity-1024/profile-summary.json'));
assert.equal(smallProfile.profileSha256,sha(fs.readFileSync(path.join(directory,'capacity-1024/compiler-profile.json'))));
const result={status:'RESET_TIMEOUT_AND_GENERIC_CONSTRUCTOR_CONTROL_EVIDENCE_VERIFIED',recordedAt:new Date().toISOString(),
  sourceSha256:sha(fullSource),compilerModuleSha256:reset.compilerModuleSha256,
  fullReset:{timeoutMs:reset.timeoutMs,samples:fullProfile.samples,topSelf:fullProfile.self[0]},layouts,
  generic1024:{timeoutMs:20000,samples:smallProfile.samples,topSelf:smallProfile.self.slice(0,5)},
  reviewerSha256:sha(fs.readFileSync(import.meta.filename)),
  numericalExecution:false,fullBrowserSlam:false,observedMemoryRefusal:false,
  scope:'Compiler issuance/layout evidence only. Generic constructor has a different hotspot distribution and is not a reproduction of the full reset hot routine. No numerical/full-SLAM qualification or complexity-class inference.'};
fs.writeFileSync(path.join(directory,'review.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
