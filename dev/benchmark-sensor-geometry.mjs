import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';

const output=path.resolve(process.env.SLAM_SENSOR_PROFILE_OUT??'test-results/sensor-geometry');
await mkdir(output,{recursive:true});
const results=[];
// ABBA order: identical bundle, actors, source inputs and rates. Fresh projects
// start from the same seed; order reversal exposes shared-machine drift.
for(const [name,enabled] of [['a-unbatched',false],['b-batched',true],['c-batched',true],['d-unbatched',false]]){
  const destination=path.join(output,name);await mkdir(destination,{recursive:true});
  const env={...process.env,SLAM_PROFILE_OUT:destination,SLAM_PROFILE_FRAMES:process.env.SLAM_PROFILE_FRAMES??'450',
    SLAM_PROFILE_SCENE:'city',SLAM_PROFILE_DETAIL:'high',SLAM_PROFILE_LIDAR:'1',SLAM_PROFILE_DEPTH_CLOUD:'1',
    SLAM_PROFILE_READBACK:'sync',SLAM_PROFILE_GEOMETRY_BATCHING:enabled?'1':'0',
    SLAM_PROFILE_SENSOR_RATES:JSON.stringify({cameraHz:90,lidarHz:20,imuHz:90,gpsHz:10})};
  const child=spawn(process.execPath,['scripts/profile-browser.mjs'],{env,stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  await writeFile(path.join(destination,'run.log'),log);
  if(code!==0)throw new Error(`${name} profile failed: ${code}; see ${destination}`);
  const {summary}=JSON.parse(await readFile(path.join(destination,'timings.json'),'utf8'));
  results.push({name,summary});console.log(JSON.stringify({name,rate:summary.simulationRate,sensorMs:summary.meanNodeMs.sensor}));
}
const sum=(values,key)=>values.reduce((total,value)=>total+key(value),0);
const aggregates=[false,true].map(enabled=>{
  const runs=results.filter(result=>result.summary.geometryBatching===enabled).map(result=>result.summary);
  const seconds=sum(runs,r=>r.frames/r.workload.sensorRates.cameraHz),wallMs=sum(runs,r=>r.elapsedMs);
  return {enabled,simulationSeconds:seconds,wallMs,simulationRate:seconds/(wallMs/1000),
    meanSensorMs:sum(runs,r=>r.frames*r.meanNodeMs.sensor)/sum(runs,r=>r.frames)};
});
await writeFile(path.join(output,'comparison.json'),JSON.stringify({scope:'Full GPU sensors plus available Modelica INS/detector; full visual SLAM and10x pending',
  order:'ABBA',results,aggregates,throughputRatio:aggregates[1].simulationRate/aggregates[0].simulationRate},null,2));
