// Compare the preserved pre-change runtime and current runtime in one campaign.
// Only profiling helpers are updated in the disposable baseline checkout.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const repo=process.cwd(),output=path.resolve(process.argv[2]??'');
if(!process.argv[2]||fs.existsSync(output))throw Error('A fresh output directory is required');
fs.mkdirSync(output,{recursive:true});
const prior='dev/artifacts/packed-sensor-diagnostic-2026-10-07';
const priorReport=JSON.parse(fs.readFileSync(path.join(prior,'report.json')));
const priorSources=JSON.parse(fs.readFileSync(path.join(prior,'sources-before.json')));
const original=path.resolve(os.homedir(),priorReport.scratchHomeRelative,'source');
const scratch=path.join(os.homedir(),'scratch/slam_web/build');fs.mkdirSync(scratch,{recursive:true});
const baseline=fs.mkdtempSync(path.join(scratch,'viewer-baseline-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const entry of priorSources){
  const bytes=fs.readFileSync(path.join(original,entry.path));
  if(sha(bytes)!==entry.sha256)throw Error(`Historical source changed: ${entry.path}`);
  const target=path.join(baseline,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
}
const helpers=['scripts/profile-browser.mjs','dev/profile-frozen-pipeline.mjs','dev/profile-session-instrumentation.mjs'];
for(const name of helpers)fs.copyFileSync(path.join(repo,name),path.join(baseline,name));
fs.symlinkSync(path.join(repo,'node_modules'),path.join(baseline,'node_modules'),'dir');
fs.symlinkSync(path.join(repo,'public'),path.join(baseline,'public'),'dir');
fs.writeFileSync(path.join(output,'baseline-provenance.json'),JSON.stringify({priorReport:prior+'/report.json',priorReportSha256:sha(fs.readFileSync(prior+'/report.json')),originalHomeRelative:path.relative(os.homedir(),original),baselineHomeRelative:path.relative(os.homedir(),baseline),verifiedHistoricalSources:priorSources,updatedProfilingHelpers:helpers.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(repo,name)))})),scope:'Historical runtime source verified byte-exactly; only matching measurement helpers replaced in a disposable scratch copy. Shared current public assets are hashed by each run.'},null,2));
const runs=[];
for(const [name,cwd,diagnostic] of [['before-1',baseline,false],['after-1',repo,false],['after-2',repo,false],['before-2',baseline,false],['after-diagnostic',repo,true]]){
  const destination=path.join(output,name);
  const child=spawn(process.execPath,[path.join(repo,'dev/profile-frozen-pipeline.mjs'),destination],{cwd,env:{...process.env,SLAM_PIPELINE_SENSOR_DIAGNOSTIC:'sync',SLAM_PIPELINE_READBACK_MATRIX:'0',SLAM_PIPELINE_GPU_DIAGNOSTIC:'0',SLAM_PIPELINE_THROUGHPUT_ONLY:diagnostic?'0':'1'},stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0)throw Error(`Comparison ${name} failed: ${code}`);
  const report=JSON.parse(fs.readFileSync(path.join(destination,'report.json')));
  if(!report.sourceBookendsEqual||!report.assetsBookendsEqual)throw Error(`Bookend failure: ${name}`);
  runs.push({name,report:name+'/report.json',reportSha256:sha(fs.readFileSync(path.join(destination,'report.json'))),rows:report.rows.map(r=>({name:r.name,summary:r.summary}))});
}
fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify({recordedAt:new Date().toISOString(),runs,scope:'Same campaign, reversed before/after order, native balanced camera+INS+depth-cloud+64-beam-LiDAR. Sampling-disabled throughput repeated twice per runtime, then a separate after CPU/perf/GPU diagnostic. Exact clocks, sources and served assets are recorded per run; shared host and bounded owned CPU resources. No full Modelica SLAM or10x acceptance.'},null,2));
