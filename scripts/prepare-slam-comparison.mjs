import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';

const [captureRoot,outputRoot]=process.argv.slice(2);
if(!captureRoot||!outputRoot)throw Error('Usage: node scripts/prepare-slam-comparison.mjs CAPTURE_ROOT NEW_OUTPUT_DIRECTORY');
const source=resolve(captureRoot),output=resolve(outputRoot);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(await readFile(join(source,'receipt.json'),'utf8'));
if(receipt.failure)throw Error('Capture did not complete successfully');
if(!Array.isArray(receipt.cases)||receipt.cases.length===0)throw Error('Capture has no completed scenes');
// Older receipts mixed response-body archival warnings into pageErrors. They
// remain visible, but are distinct from a runtime exception during acquisition.
if(receipt.pageErrors?.some(error=>!String(error).startsWith('Asset archive: ')))throw Error('Capture has runtime page errors');
const SCENE_ID=/^[a-z][a-z0-9-]{0,31}$/;
const sensors=[],truth=[],files=[],seen=new Set();
for(const {environment,frames} of receipt.cases){
  // Scene ids come from the capture receipt; the id also names a directory.
  if(typeof environment!=='string'||!SCENE_ID.test(environment))throw Error('Invalid scene id');
  if(seen.has(environment))throw Error('Duplicate scene');
  seen.add(environment);
  const folder=join(source,environment);
  const names=(await readdir(join(folder,'frames'))).filter(n=>/^\d+\.json$/.test(n)).sort();
  if(names.length!==frames||frames<1)throw Error('Capture frame count mismatch');
  let previous=-Infinity;
  for(const name of names){
    const raw=await readFile(join(folder,'frames',name)),row=JSON.parse(raw);
    if(row.index!==Number.parseInt(name,10)||row.index!==names.indexOf(name))throw Error('Capture index gap');
    if(!Number.isFinite(row.time)||row.time<=previous)throw Error('Non-monotonic image timestamps');
    if(row.time!==row.metadata.time||row.sequence!==row.metadata.sequence)throw Error('Inconsistent frame metadata');
    previous=row.time;
    const {imageLayout,calibration,imu,imuIntervals=[]}=row.metadata;
    if(imageLayout.color.format!=='RGB8'||imageLayout.depth.format!=='Z16'||imageLayout.depth.isBigEndian||imageLayout.rowOrder!=='top-down')throw Error('Unsupported source image layout');
    for(const n of ['fx','fy','rgbFx','rgbFy'])if(!(calibration[n]>0))throw Error('Invalid camera calibration');
    if(!(imageLayout.depth.unitsMeters>0))throw Error('Invalid depth units');
    const images={};
    for(const kind of ['rgb','depth']){
      const entry=row.image[kind],path=resolve(folder,entry.file),rel=relative(folder,path);
      if(rel==='..'||rel.startsWith('../')||isAbsolute(rel))throw Error('Image path escapes capture');
      const bytes=await readFile(path),digest=sha(bytes);
      const layout=imageLayout[kind==='rgb'?'color':'depth'];
      if(bytes.length!==layout.strideBytes*layout.height||bytes.length!==entry.bytes||digest!==entry.sha256)throw Error(`Image integrity failure: ${environment}/${entry.file}`);
      images[kind]={path:join(environment,entry.file),bytes:bytes.length,sha256:digest};
    }
    // Only sensor observations enter this manifest. Estimated states and truth
    // are deliberately excluded from each estimator's replay input contract.
    sensors.push({scene:environment,index:row.index,time:row.time,sequence:row.sequence,imageLayout,calibration,imu,imuIntervals,images});
    const t=row.truth;
    if(t.time!==row.time||![t.x,t.y,t.z,...t.quaternion].every(Number.isFinite))throw Error('Invalid evaluation truth');
    truth.push({scene:environment,index:row.index,time:t.time,bodyPosition:[t.x,t.y,t.z],bodyQuaternionWxyz:t.quaternion});
    files.push({path:join(environment,'frames',name),sha256:sha(raw)});
  }
}
await mkdir(output); // Never overwrite a previously sealed dataset.
const input={schema:1,format:'slam-lab-raw-rgbd-v1',clock:'simulation seconds',imagePathBase:'external capture root supplied to runner',sensorFrames:sensors};
const evaluation={schema:1,scope:'Evaluator only; never publish to estimator topics',bodyFrame:'FLU',quaternionOrder:'wxyz',samples:truth};
const inputBytes=JSON.stringify(input)+'\n',truthBytes=JSON.stringify(evaluation)+'\n';
await writeFile(join(output,'sensors.json'),inputBytes);
await writeFile(join(output,'ground-truth.json'),truthBytes);
const manifest={schema:1,status:'sealed-inputs-only-no-comparative-results',sourceFrames:files,frames:sensors.length,scenes:receipt.cases.map(c=>c.environment),sensorsSha256:sha(inputBytes),groundTruthSha256:sha(truthBytes),registrationRequired:sensors.some(f=>!f.imageLayout.aligned),adapterGates:['Verify common timestamp and calibration handling','Validate registration, depth units and camera-to-body transform','No truth, estimated poses or graph output to estimator','Hash any derived image set and include preprocessing time','Record source/module/config pins before a run']};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({output,...manifest,sourceFrames:files.length},null,2));
