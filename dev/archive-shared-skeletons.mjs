// Retain bounded review evidence; raw timed-frame traces stay on scratch.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const scratch=path.join(process.env.HOME,'scratch/slam_web');
const destination='dev/artifacts/shared-skeletons';
const artifacts=[],raw=[];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function retain(source,target){
  const bytes=fs.readFileSync(source),file=path.join(destination,target);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
  artifacts.push({path:file,bytes:bytes.length,sha256:sha(bytes)});
}
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
function summarize(directory,label){
  const file=path.join(directory,'report.json'),bytes=fs.readFileSync(file),report=JSON.parse(bytes);
  if(report.errors.length)throw Error(`Browser errors in ${label}`);
  const original={path:file.replace(process.env.HOME,'$HOME'),bytes:bytes.length,sha256:sha(bytes)};
  raw.push(original);
  if(report.windows)report.windows=report.windows.map(window=>({
    lidarEnabled:window.lidarEnabled,repetition:window.repetition,skeletonSharing:window.skeletonSharing,
    captures:window.captures,wallMs:window.wallMs,meanRpcMs:mean(window.samples),
    p95RpcMs:percentile(window.samples,.95),meanWorkerMs:mean(window.worker),
    meanCameraMs:mean(window.camera.map(camera=>camera.total)),
    meanSubmissionMs:mean(window.camera.map(camera=>camera.renderSubmission)),
    meanReadbackMs:mean(window.camera.map(camera=>camera.readback))}));
  report.retainedRawReport=original;
  const summary=path.join(directory,'review-summary.json');
  fs.writeFileSync(summary,JSON.stringify(report,null,2)+'\n');retain(summary,`${label}/report.json`);
  retain(path.join(directory,'resource.json'),`${label}/resource.json`);
  retain(path.join(directory,'run.log'),`${label}/run.log`);
  return report;
}
const first=summarize(path.join(scratch,'profiles/shared-skeletons'),'first-captures');
const repeated=summarize(path.join(scratch,'profiles/shared-skeletons/matched-repeat'),'matched-captures');
const lockstep=summarize(path.join(scratch,'profiles/shared-skeletons/lockstep'),'lockstep');
const gpuProfile=repeated.profiles.map(profile=>({skeletonSharing:profile.skeletonSharing,
  skeletonUpdates:profile.gpuProfile.events.filter(event=>event.kind==='skeleton-update').length,
  skeletonApiMs:profile.gpuProfile.events.filter(event=>event.kind==='skeleton-update').reduce((sum,event)=>sum+event.apiWallMs,0),
  timerSupported:profile.gpuProfile.timerSupported,disjoint:profile.gpuProfile.disjoint,graphics:profile.graphics}));
if(gpuProfile.length!==2||gpuProfile.some(profile=>!profile.timerSupported||profile.disjoint!==false)
  ||gpuProfile[0].skeletonUpdates!==180||gpuProfile[1].skeletonUpdates!==72)throw Error('Missing actual GPU-profile update evidence');
if(first.parity.length!==6||repeated.parity.length!==6
  ||[...first.parity,...repeated.parity].some(row=>!row.rawBytesMatch))throw Error('Missing full sensor parity');
if(repeated.windows.reduce((sum,window)=>sum+window.captures,0)!==16000)throw Error('Wrong repeat capture count');
for(const file of ['final-tests.log','final-tests-resource.json','build.log','build-resource.json','typescript.log','tests.log'])
  retain(path.join(scratch,'tmp/skeleton-sharing-gate',file),`gates/${file}`);
for(const file of ['run.log','resource.json','app-browser-report.json'])
  retain(path.join(scratch,'tmp/skeleton-sharing-gate/public-preview',file),`public-preview/${file}`);
retain(path.join(scratch,'profiles/shared-skeletons/probe-first.mjs'),'source/probe-first.mjs');
for(const file of ['src/shared-cloned-skeletons.ts','src/world-actors.ts','src/sensor-render.worker.ts',
  'tests/shared-cloned-skeletons.test.ts','tests/world-actors.test.ts','tests/sensor-render-worker.test.ts',
  'dev/probe-shared-skeletons.mjs','dev/profile-live-lockstep.mjs','dev/probe-shared-skeleton-preview.mjs',
  'dev/archive-shared-skeletons.mjs','.gitignore'])retain(file,`source/${file}`);
retain('dist/index.html','public-preview/index.html');
const html=fs.readFileSync('dist/index.html','utf8'),entry=html.match(/src="(\.\/assets\/[^\"]+\.js)"/)[1];
const compilerFiles=['vendor/rumoca/rumoca_bind_wasm_bg.wasm','vendor/rumoca/rumoca_bind_wasm.js'].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join('dist',file)))}));
if(compilerFiles[0].sha256!=='1e0e098a7ae368c89bad1826efe35369921c803269b989946120e38ebf41aaf4'
  ||compilerFiles[1].sha256!=='a42e7a8012425835b3a6a4087bf2d5a4d581d1a4a902e3b090a1b68e58b26eb4')throw Error('Unexpected compiler promotion');
const original=mean(lockstep.summary.filter(row=>!row.skeletonSharing).map(row=>row.rtf));
const shared=mean(lockstep.summary.filter(row=>row.skeletonSharing).map(row=>row.rtf));
const report={schemaVersion:1,status:'SHARED_ACTOR_RIGS_HARDWARE_PARITY_MATCHED_CAPTURE_LOCKSTEP_AND_PUBLIC_STARTUP_PASS',
  recordedAt:new Date().toISOString(),skeletonOwners:{original:30,shared:12,isolatedPerCharacter:true},
  gpuProfile,
  captureSummary:repeated.summary,lockstep:{originalRtf:original,sharedRtf:shared,
    throughputIncreasePercent:100*(shared/original-1),cameraHz:90,lidarHz:10,timedFrames:1440,summary:lockstep.summary},
  validation:{targetedTests:7,typescriptPassed:true,typescriptToolResource:{exitCode:0,elapsedMs:7901.983434,peakRssKiB:588424},
    firstTestFailure:'Harness expected60 skeletons from RGB+depth update count; actual asset ownership is30. Corrected count, repeated controls pass.',
    rawSensorComparisons:12,publicStartup:true,presetAutomaticStart:true,savedProjectMigration:true},
  build:{entry,sha256:sha(fs.readFileSync(path.join('dist',entry))),outDir:'$HOME/scratch/slam_web/build/skeleton-sharing-preview'},
  compiler:{productionPinChanged:false,files:compilerFiles},preview:'http://localhost:4173',productionChanged:true,fullSlam:false,
  scope:'Exact rig-owner sharing in Three.js presentation only. Raw RGB/axial-depth/depth-cloud/LiDAR parity and Modelica actor-animation matrices pass. Capture gains are matched held-pose diagnostics; lockstep comparison uses the current inertial baseline on four-CPU affinity with possible concurrent host activity. No fullModelica SLAM, 10x, steady-frame, cross-machine or absolute improvement over the earlier differently timed pipeline run claim.',
  rawReports:raw,artifacts};
for(const item of artifacts){const bytes=fs.readFileSync(item.path);if(bytes.length!==item.bytes||sha(bytes)!==item.sha256)throw Error(`Archive mismatch ${item.path}`);}
fs.writeFileSync('dev/shared-skeletons-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,archives:artifacts.length,lockstep:report.lockstep,captureSummary:report.captureSummary}));
