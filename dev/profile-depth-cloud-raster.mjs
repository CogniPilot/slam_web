// Compare two presentation encodings of the same native sensor frames.
// Each run freezes current sources; the normal preview is never replaced.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const output=path.resolve(process.argv[2]??'');
if(!process.argv[2]||fs.existsSync(output))throw Error('A fresh output directory is required');
fs.mkdirSync(output,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),runs=[];
for(const [name,dense,diagnostic] of [['dense-1',true,false],['raster-1',false,false],['raster-2',false,false],['dense-2',true,false],['raster-diagnostic',false,true]]){
  const destination=path.join(output,name);
  const child=spawn(process.execPath,['dev/profile-frozen-pipeline.mjs',destination],{
    env:{...process.env,SLAM_PIPELINE_SENSOR_DIAGNOSTIC:'sync',SLAM_PIPELINE_READBACK_MATRIX:'0',SLAM_PIPELINE_GPU_DIAGNOSTIC:'0',
      SLAM_PIPELINE_THROUGHPUT_ONLY:diagnostic?'0':'1',SLAM_PROFILE_DENSE_CLOUD_READBACK:dense?'1':'0'},stdio:'inherit'});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  if(code!==0)throw Error(`Comparison ${name} failed: ${code}`);
  const report=JSON.parse(fs.readFileSync(path.join(destination,'report.json')));
  if(!report.sourceBookendsEqual||!report.assetsBookendsEqual)throw Error(`Bookend failure: ${name}`);
  runs.push({name,report:name+'/report.json',reportSha256:sha(fs.readFileSync(path.join(destination,'report.json'))),rows:report.rows.map(r=>({name:r.name,summary:r.summary}))});
}
const summaries=runs.slice(0,4).map(r=>r.rows[0].summary);
const invariant=({settings,workload,frames,flowCounts})=>({settings,frames,flowCounts,workload:{...workload,cloudPresentation:undefined}});
const workloadsMatch=summaries.every(s=>JSON.stringify(invariant(s))===JSON.stringify(invariant(summaries[0])));
if(!workloadsMatch)throw Error('Sensor workload changed between presentation encodings');
fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify({recordedAt:new Date().toISOString(),workloadsMatch,runs,
  driverSha256:sha(fs.readFileSync(import.meta.filename)),scope:'Same current runtime with dense XYZ readback versus native Z16 viewer GPU unprojection, reversed repeated order. Native camera resolution, noise, rates, actors, raw algorithm inputs and LiDAR unchanged. Only display point encoding/readback changes. Four sampling-disabled throughput runs plus a separate raster CPU/perf/GPU diagnostic. Shared host, externally bounded resources. No full Modelica SLAM or10x acceptance.'},null,2));
