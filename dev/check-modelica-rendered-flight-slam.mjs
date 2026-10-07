// Test-only OMC replay of hash-bound rendered RGB-D. No estimator math or input injection.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
import {captureFailureFields,parseCaptureFailureTrace} from './rendered-flight-capture-diagnostics.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
if(process.argv.length!==3)throw Error('Usage: node dev/check-modelica-rendered-flight-slam.mjs <capture-directory>');
const capture=fs.realpathSync(path.resolve(process.argv[2]));
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'rendered-flight-slam-'));
const durable=path.join(app,'dev/artifacts/modelica-rendered-flight-slam',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const scenario=process.env.SLAM_REFERENCE_SCENARIO??'flight';
if(!['flight','sensor-loss','flight-extended'].includes(scenario))throw Error('SLAM_REFERENCE_SCENARIO must be flight, flight-extended or sensor-loss');
const sensorLoss=scenario==='sensor-loss';
const extended=scenario==='flight-extended';
// Declared before the longer replay: evaluation-only tolerances, never model inputs.
// This is a short moving-flight regression, not general SLAM accuracy certification.
const extendedPoseLimits=Object.freeze({maximumErrorMeters:0.5,rmseMeters:0.25,minimumOracleDisplacementMeters:1});
const model=sensorLoss?'RGBDRenderedSensorLossGridAcceptance':extended?'RGBDRenderedFlightExtendedGridAcceptance':'RGBDRenderedFlightGridAcceptance',checkCount=sensorLoss?32:24,diagnosticCount=16;
let frameRows=13,sampleRows=37,intervalRows=36;
let height,width,channels,rawCamera=false,depthUnits=1;
const referenceCflags=process.env.SLAM_REFERENCE_CFLAGS??'-O0';
const pairDiagnostic=process.env.SLAM_REFERENCE_PAIR_DIAGNOSTIC==='1';
const captureDiagnostic=process.env.SLAM_REFERENCE_CAPTURE_DIAGNOSTIC==='1';
if(!['0','1'].includes(process.env.SLAM_REFERENCE_CAPTURE_DIAGNOSTIC??'0'))
  throw Error('SLAM_REFERENCE_CAPTURE_DIAGNOSTIC must be 0 or 1');
if(!['-O0','-O2'].includes(referenceCflags))throw Error('SLAM_REFERENCE_CFLAGS must be -O0 or -O2');
const referenceSeconds=Number(process.env.SLAM_REFERENCE_SECONDS??120);
const maximumReferenceSeconds=extended?540:300;
if(!Number.isInteger(referenceSeconds)||referenceSeconds<1||referenceSeconds>maximumReferenceSeconds)
  throw Error(`SLAM_REFERENCE_SECONDS must be an integer from1 to${maximumReferenceSeconds}`);
const metricLabels=['epoch','frameTime','accepted','imageCompleted','mappingAccepted','selectionValid','initializationAccepted','predictionAccepted',
  'observationAccepted','captureAccepted','matchCount','featureCount','trackingCount','occupiedMapCount','steps','catalogNextId','referenceEpoch','lastUsedEpoch',
  'batchReason','processedIntervals','failedInterval','positionX','positionY','positionZ'];
const diagnosticLabels=['registrationAccepted','registrationReason','registrationRms','registrationRank','relativeValid','uncertaintyReason',
  'uncertaintyValid','matchCount','descriptionInvalidCount','currentEnabledCount','matchingConfigurationValid','invalidReference','invalidCurrent',
  'registrationValidCount','registrationInvalidCount','frontendPoseValid'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const fileSha=file=>{
  const hash=createHash('sha256'),buffer=Buffer.alloc(1024*1024),fd=fs.openSync(file,'r');
  try{let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));}
  finally{fs.closeSync(fd);}
  return hash.digest('hex');
};
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const json=(name,value)=>fs.writeFileSync(path.join(durable,name),JSON.stringify(value,null,2)+'\n');
const snapshot=[];
const copy=(source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);};
function captureFile(name,expectedSha){
  assert(typeof name==='string'&&!path.isAbsolute(name),'Relative capture file required');
  const file=fs.realpathSync(path.join(capture,name));
  assert(file.startsWith(capture+path.sep),'Capture path escaped its directory');
  const bytes=fs.readFileSync(file),digest=sha(bytes);
  if(expectedSha!==undefined)assert(digest===expectedSha,`Capture hash mismatch: ${name}`);
  if(!snapshot.some(entry=>entry.path===name)){
    const durableCopy=!extended||!/^frame-\d+\.(rgb8|z16-le)$/.test(name);
    snapshot.push({path:name,bytes:bytes.length,sha256:digest,durableCopy,
      ...(durableCopy?{}:{originalHomeRelative:path.relative(home,file)})});
    if(durableCopy)copy(file,path.join(durable,'capture',name));
  }
  return bytes;
}
const matName='rendered-flight.mat',matFile=path.join(output,matName),matrixSpecs=[];
let matFd;
function matrix(name,rows,columns,read){
  assert(Number.isSafeInteger(rows)&&rows>0&&Number.isSafeInteger(columns)&&columns>0,'Positive matrix extents');
  const label=Buffer.from(name+'\0','ascii'),header=Buffer.alloc(20),data=Buffer.alloc(rows*columns*8);
  for(const [index,value]of[0,rows,columns,0,label.length].entries())header.writeInt32LE(value,index*4);
  for(let column=0;column<columns;column++)for(let row=0;row<rows;row++){
    const value=read(row,column);assert(Number.isFinite(value),`Nonfinite MAT value ${name}[${row},${column}]`);
    data.writeDoubleLE(value,(column*rows+row)*8);
  }
  if(matFd===undefined)matFd=fs.openSync(matFile,'w');
  for(const bytes of [header,label,data])assert(fs.writeSync(matFd,bytes)===bytes.length,'Complete MAT matrix write');
  matrixSpecs.push({name,rows,columns,read});
}
function exactArray(actual,expected,label){assert(JSON.stringify(actual)===JSON.stringify(expected),label);}
function validateFrame(frame,index,calibration){
  assert(frame.sequence===index&&Number.isFinite(frame.time),'Exact frame sequence and finite acquisition time');
  const rgbMeta=frame.rgb,depthMeta=frame.depth;
  assert(rgbMeta.type==='Uint8'&&rgbMeta.order===(rawCamera?'row-major top-down RGB':'row-major top-down RGBA')&&rgbMeta.colorSpace==='sRGB display encoded','Exact RGB encoding/orientation');
  exactArray(rgbMeta.shape,[height,width,channels],'RGB shape matches captured channel inventory');
  assert(depthMeta.type===(rawCamera?'Uint16':'Float32')&&depthMeta.endianness==='little'&&depthMeta.order==='row-major top-down'
    &&depthMeta.meaning===(rawCamera?'axial optical-Z depth units':'axial optical-Z metres')&&depthMeta.encoding===(rawCamera?'axial-z16-le':'axial-f32-le-rgba8'),'Exact axial depth format/orientation');
  exactArray(depthMeta.shape,[height,width],'Depth shape matches the captured grid');
  const rgb=captureFile(rgbMeta.path,rgbMeta.sha256),depth=captureFile(depthMeta.path,depthMeta.sha256),depthBytes=rawCamera?2:4;
  assert(rgb.length===height*width*channels&&rgbMeta.bytes===rgb.length,'Exact RGB byte count');
  assert(depth.length===height*width*depthBytes&&depthMeta.bytes===depth.length,'Exact depth byte count');
  if(rawCamera){
    const layout=frame.imageLayout;
    assert(rgbMeta.strideBytes===width*3&&depthMeta.strideBytes===width*2&&depthMeta.unitsMeters===depthUnits,'Exact raw row strides and Z16 scale');
    exactArray(layout,{color:{width,height,strideBytes:width*3,bytes:rgb.length,format:'RGB8'},depth:{width,height,strideBytes:width*2,bytes:depth.length,format:'Z16',unitsMeters:depthUnits,isBigEndian:false},rowOrder:'top-down',aligned:false,clockDomain:'simulation'},'Captured SDK-style raw image layout');
    assert(frame.depthNoiseTick===Math.round(frame.time*180),'Shader noise keyed by committed simulation tick');
  }
  const depthAt=index=>rawCamera?depth.readUInt16LE(index*2):depth.readFloatLE(index*4);
  let positive=0,zero=0,min=Infinity,max=-Infinity;
  for(let i=0;i<height*width;i++){
    const z=depthAt(i);assert(Number.isFinite(z)&&z>=0,'Finite nonnegative renderer depth lane');
    // Noisy Z16 may cross nominal geometric clipping planes; the authored
    // Modelica depth qualification owns sample admission.
    if(!rawCamera)assert(z===0||(z>=calibration.near&&z<=calibration.far),'Nominal metric depth inside captured clipping planes');
    if(z>0){positive++;min=Math.min(min,z);max=Math.max(max,z);}else zero++;
  }
  const stats=frame.stats.depth;
  assert(stats.finite===height*width&&stats.nonfinite===0&&stats.positive===positive&&stats.zero===zero
    &&stats.minPositive===(positive?min:null)&&stats.maxPositive===(positive?max:null),'Independent depth statistics match capture');
  let nonzero=0,nonopaque=0;for(let i=0;i<rgb.length;i++){if(rgb[i]!==0)nonzero++;if(!rawCamera&&i%4===3&&rgb[i]!==255)nonopaque++;}
  assert(frame.stats.rgb.nonzeroBytes===nonzero&&frame.stats.rgb.uniqueByteValues===new Set(rgb).size
    &&(rawCamera||frame.stats.rgb.nonopaqueAlpha===nonopaque),'Independent RGB statistics match capture');
  matrix(`rgb_${index+1}`,height,width*channels,(r,c)=>rgb[r*width*channels+c]);
  // MAT reference packaging preserves codes exactly, with no host metric
  // depth image. Modelica receives depthUnits separately.
  matrix(`depth_${index+1}`,height,width,(r,c)=>depthAt(r*width+c));
  return {sequence:index,time:frame.time,positiveDepth:positive,zeroDepth:zero,rgbSha256:sha(rgb),depthSha256:sha(depth)};
}
function strictCsv(file){
  if(!fs.existsSync(file))return {present:false,checks:[],metrics:[],diagnostics:[],failedChecks:[]};
  const bytes=fs.readFileSync(file),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
  const header=[...first.matchAll(/"([^"]*)"/g)].map(m=>m[1]);
  const quotedHeader=header.map(value=>JSON.stringify(value)).join(',')===first;
  const checkNames=Array.from({length:checkCount},(_,i)=>`checks[${i+1}]`);
  const rawNames=Array.from({length:frameRows},(_,r)=>Array.from({length:24},(_,c)=>`raw[${r+1},${c+1}]`)).flat();
  const diagnosticNames=Array.from({length:frameRows},(_,r)=>Array.from({length:diagnosticCount},(_,c)=>`diagnostics[${r+1},${c+1}]`)).flat();
  const names=['time',...checkNames,...rawNames,...diagnosticNames];
  const columnsValid=quotedHeader&&header.length===names.length&&new Set(header).size===names.length&&names.every(n=>header.includes(n));
  const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const lexicalValid=lines.length>0&&lines.every(line=>line.split(',').every(value=>numeric.test(value)));
  const rows=lines.map(line=>line.split(',').map(Number)),time=header.indexOf('time');
  const finiteRows=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===names.length&&row.every(Number.isFinite));
  const booleanChecks=finiteRows&&rows.every(row=>checkNames.every(n=>row[header.indexOf(n)]===0||row[header.indexOf(n)]===1));
  const rowsValid=booleanChecks&&rows[0][time]===0&&rows.at(-1)[time]===.001
    &&rows.every((row,i)=>row[time]>=0&&row[time]<=.001&&(i===0||row[time]>=rows[i-1][time]));
  const checks=rowsValid?checkNames.map(n=>rows.every(row=>row[header.indexOf(n)]===1)):[];
  // Keep every available numerical diagnostic even when Boolean acceptance fails.
  const metrics=finiteRows?rows.map(row=>Array.from({length:frameRows},(_,r)=>Array.from({length:24},(_,c)=>row[header.indexOf(`raw[${r+1},${c+1}]`)]))):[];
  const diagnostics=finiteRows?rows.map(row=>Array.from({length:frameRows},(_,r)=>Array.from({length:diagnosticCount},(_,c)=>row[header.indexOf(`diagnostics[${r+1},${c+1}]`)]))):[];
  return {present:true,path:path.basename(file),sha256:sha(bytes),columns:header.length,quotedHeader,columnsValid,lexicalValid,
    finiteRows,rowsValid,rows:rows.length,checks,metrics,diagnostics,failedChecks:checks.flatMap((pass,i)=>pass?[]:[i+1])};
}


let stage='capture-validation';
try{
  const manifestBytes=captureFile('manifest.json'),captureManifest=JSON.parse(manifestBytes);
  frameRows=captureManifest.frameCount;
  assert(Number.isSafeInteger(frameRows)&&frameRows>=13&&frameRows<=121&&(extended||frameRows===13),
    'Supported source-bound frame count; extended captures require flight-extended');
  intervalRows=(frameRows-1)*3;sampleRows=intervalRows+1;
  rawCamera=captureManifest.schema==='modelica-rendered-flight-frames-v2';channels=rawCamera?3:4;
  if(sensorLoss)assert(rawCamera,'Sensor-loss qualification requires native raw RGB8/Z16');
  if(rawCamera){depthUnits=captureManifest.frames[0]?.depth?.unitsMeters;assert(Number.isFinite(depthUnits)&&depthUnits>0,'Positive recorded Z16 units');}
  assert((rawCamera||captureManifest.schema==='modelica-rendered-flight-frames-v1')&&captureManifest.status==='ACTUAL_RUMOCA_FLIGHT_RGBD_CAPTURE_PASS'
    &&captureManifest.sourceBookendsEqual===true&&captureManifest.frames.length===frameRows
    &&captureManifest.imuSampleCount===sampleRows&&captureManifest.heldIntervalCount===intervalRows,'Complete actual flight capture required');
  const before=JSON.parse(captureFile('sources-before.json')),after=JSON.parse(captureFile('sources-after.json'));
  assert(JSON.stringify(before)===JSON.stringify(after)&&sha(Buffer.from(JSON.stringify(before)))===captureManifest.sourcesManifestSha256,'Capture source/asset bookends');
  const physics=captureManifest.physics;
  assert(physics?.modelName==='LabQuadrotor'&&physics.advanced===true&&physics.initializationApi==='WasmSimulationSession.withInteractiveOptions'
    &&physics.snapshotApi==='readPhysicsSnapshot(session,true)','Actual compiler-owned advanced plant acquisition');
  assert(physics.options?.stepSize===.005&&physics.options.solver==='rk-like'
    &&physics.options.absoluteTolerance===1e-8&&physics.options.relativeTolerance===1e-6,'Exact physics session solver options');
  const initialInputs=[['forward',0],['left',0],['up',0],['yaw',0]];
  exactArray(JSON.parse(physics.options.inputs),initialInputs,'Exact initialization input commands');
  exactArray(physics.rates,{cameraHz:30,lidarHz:10,imuHz:90,gpsHz:5},'Exact source sensor-clock rates');
  assert(captureManifest.acquisition.autopilot===true&&captureManifest.acquisition.indoorTour===false,'Exact acquisition command mode');
  exactArray(captureManifest.acquisition.command,{forward:0,left:0,up:0,yaw:0},'Exact commanded controls');
  for(const key of ['source','js','wasm','physicsWorker','snapshotReader','runtime','sensorClock']){
    const proof=physics[key],entry=before.find(value=>value.path===proof?.sourcePath);
    assert(entry&&entry.sha256===proof.sha256&&entry.bytes===proof.bytes,'Physics source belongs to capture bookends: '+key);
    assert(captureFile(proof.path,proof.sha256).length===proof.bytes,'Physics proof byte count: '+key);
    if(key==='js'||key==='wasm')assert(captureManifest.servedResources.some(value=>value.sourcePath===proof.sourcePath&&value.sha256===proof.sha256),'Compiler proof actually served: '+key);
  }
  assert(physics.source.sourcePath==='models/Vehicles/LabQuadrotor.mo','Exact plant source identity');
  const measurements=JSON.parse(captureFile(captureManifest.measurements.path,captureManifest.measurements.sha256));
  assert(measurements.schema==='rumoca-modeled-imu-hold-v1'&&measurements.frame==='body FLU'
    &&measurements.accelUnits==='m/s^2 specific force'&&measurements.gyroUnits==='rad/s'
    &&measurements.samples.length===sampleRows&&measurements.batches.length===frameRows-1,'Exact modeled IMU corpus and units');
  const snapshots=JSON.parse(captureFile(captureManifest.oracleSnapshots.path,captureManifest.oracleSnapshots.sha256)).snapshots;
  assert(snapshots.length===sampleRows&&physics.stateJson.length===sampleRows,'Complete acquisition provenance snapshots');
  function vector(value,label){assert(Array.isArray(value)&&value.length===3&&value.every(Number.isFinite),label);}
  for(let index=0;index<sampleRows;index++){
    const sample=measurements.samples[index],truth=snapshots[index],proof=physics.stateJson[index];
    const state=JSON.parse(captureFile(proof.path,proof.sha256));
    assert(sample.index===index&&proof.index===index&&Number.isFinite(sample.time)&&Math.abs(sample.time-index/90)<1e-12
      &&sample.time===truth.time&&sample.time===proof.time&&sample.time===state.time,'Source-bound IMU sample chronology');
    vector(sample.imu.accel,'Finite measured specific force');vector(sample.imu.gyro,'Finite measured angular velocity');
    exactArray(sample.imu.accel,truth.accel,'Measured acceleration matches source acquisition');exactArray(sample.imu.gyro,truth.gyro,'Measured gyro matches source acquisition');
    const values={x:truth.x,y:truth.y,z:truth.z,qw:truth.quaternion?.[0],qx:truth.quaternion?.[1],qy:truth.quaternion?.[2],qz:truth.quaternion?.[3],
      vx:truth.velocity?.[0],vy:truth.velocity?.[1],vz:truth.velocity?.[2],imu_ax:truth.accel?.[0],imu_ay:truth.accel?.[1],imu_az:truth.accel?.[2],p:truth.gyro?.[0],q:truth.gyro?.[1],r:truth.gyro?.[2]};
    assert(Object.entries(values).every(([name,value])=>Number.isFinite(value)&&value===state.values?.[name]),'Snapshot equals raw source observation');
  }
  assert(physics.initialSnapshot.path===captureManifest.oracleSnapshots.path&&physics.initialSnapshot.index===0
    &&physics.finalSnapshot.path===captureManifest.oracleSnapshots.path&&physics.finalSnapshot.index===intervalRows,'Acquisition endpoint snapshot identities');
  const calls=JSON.parse(captureFile(physics.calls.path,physics.calls.sha256));assert(calls.length===intervalRows,'Exactly the measured physics advances');
  const calibration=captureManifest.calibration;
  ({height,width}=calibration);
  assert((height===480&&width===848)||(height===90&&width===160),'Supported native or historical capture grid');
  assert(calibration.cx===(width-1)/2&&calibration.cy===(height-1)/2,'Nominal centered camera principal point matches grid');
  assert(['fx','fy','rgbFx','rgbFy','baseline','depthNoiseDisparityPx','depthNoiseReferenceFx'].every(key=>Number.isFinite(calibration[key])&&calibration[key]>0),'Finite positive calibration');
  assert(calibration.fx!==calibration.rgbFx&&calibration.fy!==calibration.rgbFy&&calibration.near>0&&calibration.far>calibration.near
    &&calibration.depthEncoding===(rawCamera?'axial-z16-le':'axial-f32-le-rgba8'),'Separate camera optics and axial depth');
  if(rawCamera)exactArray(captureManifest.acquisition.depthNoise,{model:'independent-pixel-hash-v1',seed:7,disparityNoisePx:calibration.depthNoiseDisparityPx,referenceFx:calibration.depthNoiseReferenceFx,baselineMeters:calibration.baseline,dropoutProbability:.005,unitsMeters:depthUnits},'Production shader-noise settings');
  exactArray(calibration.opticalToBody,[0,0,1,-1,0,0,0,-1,0],'Exact optical/body convention');vector(calibration.originFlu,'Finite camera origin');
  captureFile(captureManifest.screenshot.path,captureManifest.screenshot.sha256);
  const frames=captureManifest.frames.map((frame,index)=>{assert(Math.abs(frame.time-index/30)<1e-12&&frame.time===measurements.samples[index*3].time,'Camera endpoint uses actual measured physics time');return validateFrame(frame,index,calibration);});
  const intervals=[];
  for(let frame=0;frame<frameRows;frame++){
    const original=captureManifest.frames[frame];exactArray(original.imu,measurements.samples[frame*3].imu,'Frame IMU equals actual endpoint sample');
    assert(original.imuIntervals.length===(frame===0?0:3),'Three held samples per noninitial camera frame');
    if(frame===0){assert(original.dt===0,'Initial acquisition has no interval');continue;}
    assert(Number.isFinite(original.dt)&&Math.abs(original.dt-1/30)<1e-12,'Actual camera interval duration');
    const batch=measurements.batches[frame-1];assert(batch.sequence===frame&&batch.time===original.time&&batch.dt===original.dt,'Frame/batch exact binding');
    exactArray(batch.imuIntervals,original.imuIntervals,'Manifest and measurement holds agree');
    for(let hold=0;hold<3;hold++){
      const index=(frame-1)*3+hold,interval=original.imuIntervals[hold],sample=measurements.samples[index],next=measurements.samples[index+1],call=calls[index];
      assert(interval.sampleIndex===index&&interval.sampleTime===sample.time&&interval.time===next.time
        &&Number.isFinite(interval.dt)&&interval.dt>0&&interval.dt<=.02&&Math.abs(interval.dt-1/90)<1e-12
        &&Math.abs(interval.time-(index+1)/90)<1e-12&&Math.abs(interval.dt-(next.time-sample.time))<1e-15,'Actual previous sample held over complete interval');
      exactArray(interval.imu,sample.imu,'Held values are exact source sample, never interpolation');
      assert(call.index===index&&call.sequence===frame&&call.previousHeldSampleIndex===index&&call.resultSampleIndex===index+1
        &&call.stateIndex===index+1&&call.event.time===interval.time&&call.commandTime===frames[frame-1].time,'Physics advance/hold source lineage');
      exactArray(JSON.parse(call.inputsJson),[...initialInputs,['autopilot',1],['indoorTour',0],['commandTime',frames[frame-1].time]],'Exact actual physics API command packet');
      assert(call.event.camera===((index+1)%3===0)&&call.event.imu===true&&call.event.lidar===false
        &&call.event.gps===((index+1)%18===0),'Exact integer-grid SensorClock event flags');
      intervals.push([interval.time,interval.dt,...interval.imu.accel,...interval.imu.gyro]);
    }
  }
  assert(intervals.length===intervalRows,'Complete held intervals');
  const oracle=JSON.parse(captureFile(captureManifest.oracle.path,captureManifest.oracle.sha256));
  assert(oracle.frame==='world FLU'&&oracle.quaternionOrder==='wxyz'&&oracle.poses.length===frameRows,'Separate evaluation oracle');
  const originPose=oracle.poses[0],oracleQuaternionNormErrors=oracle.poses.map((pose,index)=>{
    const truth=snapshots[index*3];assert(pose.sequence===index&&['x','y','z','time'].every(key=>Number.isFinite(pose[key])&&pose[key]===truth[key]),'Source-bound camera oracle');
    assert(Array.isArray(pose.quaternion)&&pose.quaternion.length===4&&pose.quaternion.every(Number.isFinite),'Finite source oracle quaternion');
    exactArray(pose.quaternion,truth.quaternion,'Source-bound oracle quaternion');return Math.abs(Math.hypot(...pose.quaternion)-1);
  });
  const positions=oracle.poses.map(pose=>[pose.x-originPose.x,pose.y-originPose.y,pose.z-originPose.z]);
  const fields=[calibration.fx,calibration.fy,calibration.cx,calibration.cy,calibration.rgbFx,calibration.rgbFy,calibration.baseline,
    calibration.depthNoiseDisparityPx,calibration.depthNoiseReferenceFx,...calibration.originFlu,calibration.near,calibration.far];
  matrix('calibration',1,14,(_,column)=>fields[column]);matrix('opticalToBody',3,3,(row,column)=>calibration.opticalToBody[row*3+column]);
  matrix('acquisition',frameRows,2,(row,column)=>column===0?frames[row].sequence:frames[row].time);
  matrix('imuIntervals',intervalRows,8,(row,column)=>intervals[row][column]);
  const initial=measurements.samples[0].imu;matrix('initialImu',1,6,(_,column)=>[...initial.accel,...initial.gyro][column]);
  matrix('oraclePosition',frameRows,3,(row,column)=>positions[row][column]);
  fs.closeSync(matFd);matFd=undefined;
  const matBytes=fs.statSync(matFile).size,matSha256=fileSha(matFile);
  // Native-grid expanded MAT data is disposable input packaging, retained on
  // scratch. Durable receipts retain original raw bytes and decode identities.
  const durableMat=matBytes<=8*1024*1024;
  if(durableMat)copy(path.join(output,matName),path.join(durable,matName));
  let offset=0,decodedCells=0;
  const decodeFd=fs.openSync(matFile,'r');
  for(const spec of matrixSpecs){
    const header=Buffer.alloc(20);assert(fs.readSync(decodeFd,header,0,20,offset)===20,'Complete MAT header');
    const rows=header.readInt32LE(4),columns=header.readInt32LE(8),length=header.readInt32LE(16),label=Buffer.alloc(length);
    assert(fs.readSync(decodeFd,label,0,length,offset+20)===length,'Complete MAT label');
    assert(header.readInt32LE(0)===0&&header.readInt32LE(12)===0&&rows===spec.rows&&columns===spec.columns
      &&label.subarray(0,length-1).toString('ascii')===spec.name,'Exact MATv4 header');offset+=20+length;
    const data=Buffer.alloc(rows*columns*8);
    assert(fs.readSync(decodeFd,data,0,data.length,offset)===data.length,'Complete MAT data');
    for(let column=0;column<columns;column++)for(let row=0;row<rows;row++){assert(Object.is(data.readDoubleLE((column*rows+row)*8),spec.read(row,column)),'Exact typed MAT source cell');decodedCells++;}
    offset+=rows*columns*8;
  }
  fs.closeSync(decodeFd);assert(offset===matBytes,'Complete MAT payload');
  stage='source-freeze';
  const productionNames=[...new Set([...rgbdSlamSourceManifest.paths,'models/SLAM/RGBDFastSLAMIntervals.mo'])];
  const names=[...productionNames,'tests/modelica/RGBDLocalizationInitializeTests.mo','tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo',
    'tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastInitializationFunctionAcceptance.mo',
    'tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastSLAMRawCompositionAcceptance.mo',
    'tests/modelica/RGBDCompleteStateComparison.mo','tests/modelica/RGBDRenderedFrameInput.mo','tests/modelica/RGBDRenderedVisualDiagnostics.mo',
    'tests/modelica/RGBDRenderedCitySLAMAcceptance.mo','tests/modelica/RGBDRenderedFlightSLAMAcceptance.mo',
    ...(sensorLoss?['tests/modelica/RGBDRenderedSensorLossAcceptance.mo','models/Sensors/D435ImageProfile.mo']:[])];
  const sources=[...names,'src/modelica-slam-source-manifest.mjs','dev/check-modelica-rendered-flight-slam.mjs',
    'dev/rendered-flight-capture-diagnostics.mjs','dev/rumoca-bounded-run.mjs']
    .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
  for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
  const library=path.join(home,'.openmodelica/libraries/Modelica 4.1.0+maint.om');
  const librarySources=['package.mo','Utilities/Streams.mo'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(library,name)))}));
  for(const entry of librarySources)copy(path.join(library,entry.path),path.join(durable,'installed-msl',entry.path));
  const script=path.join(output,'rendered-flight-slam.mos');
  const pairFile=pairDiagnostic?path.join(output,'matched-pairs.mat'):'';
  if(captureDiagnostic&&sensorLoss)throw Error('Capture diagnostics require a flight reference scenario');
  const gridSource=`model ${model}\n  extends ${sensorLoss?'RGBDRenderedSensorLossAcceptance':'RGBDRenderedFlightSLAMAcceptance'}(imageSize={${height},${width}},rgbChannels=${channels},depthUnits=${depthUnits}${sensorLoss?'':',pairDiagnosticsFile='+JSON.stringify(pairFile)}${extended?`,replayFrames=${frameRows},extended=true`:''}${captureDiagnostic?',captureDiagnostics=true':''});\nend ${model};\n`;
  const gridEntry=path.join(output,'grid-entrypoint.mo');fs.writeFileSync(gridEntry,gridSource);
  fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
    +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\ngetVersion(Modelica);\n'
    +names.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')
    +`\nloadFile(${JSON.stringify(gridEntry)});\n`
    +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
    +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|raw.*|diagnostics.*",cflags=${JSON.stringify(referenceCflags)},simflags=${JSON.stringify('-override=datasetFile='+path.join(output,matName))});\ngetErrorString();\n`);
  const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
  if(version.error||version.status!==0)throw version.error??Error(version.stderr);
  const executable=path.isAbsolute(omc)?fs.realpathSync(omc):fs.realpathSync((process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}})??omc);
  const compilerExecutable={path:executable,sha256:sha(fs.readFileSync(executable))};
  stage='bounded-omc';
  const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds',String(referenceSeconds),'--rss-mib','8192','--available-mib','16384',
    '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
    executable,'--numProcs=2','--vectorizationLimit=1',script];
  fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
  const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
  const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
  const result=strictCsv(path.join(output,model+'_res.csv'));
  const advisoryPoseEvaluation=result.metrics.length?{scope:'Separate oracle evaluation only, never estimator input or gating accuracy certification.',originPose,
    frames:result.metrics[0].map((raw,index)=>{const estimate=raw.slice(21,24),error=estimate.map((value,axis)=>value-positions[index][axis]);
      return {sequence:index,time:frames[index].time,estimatedPosition:estimate,oraclePosition:positions[index],positionError:error,euclideanError:Math.hypot(...error)};})}:null;
  const extendedPoseEvaluation=extended?{
    scope:'Predeclared short moving-flight position regression, evaluated against separate oracle poses after execution; no truth enters the estimator.',
    limits:extendedPoseLimits,
    oracleMaximumDisplacementMeters:Math.max(...positions.map(position=>Math.hypot(...position))),
    outputRows:result.metrics.map((row,index)=>{
      const errors=row.map((raw,frame)=>Math.hypot(...raw.slice(21,24).map((value,axis)=>value-positions[frame][axis])));
      const maximumErrorMeters=Math.max(...errors),rmseMeters=Math.sqrt(errors.reduce((sum,error)=>sum+error*error,0)/errors.length);
      return {index,frameCount:errors.length,maximumErrorMeters,rmseMeters,
        pass:errors.length===frameRows&&errors.every(Number.isFinite)
          &&maximumErrorMeters<=extendedPoseLimits.maximumErrorMeters&&rmseMeters<=extendedPoseLimits.rmseMeters};
    })}:null;
  if(extendedPoseEvaluation)extendedPoseEvaluation.pass=result.rowsValid
    &&extendedPoseEvaluation.oracleMaximumDisplacementMeters>=extendedPoseLimits.minimumOracleDisplacementMeters
    &&extendedPoseEvaluation.outputRows.length>0&&extendedPoseEvaluation.outputRows.every(row=>row.pass);
  const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{const bytes=fs.readFileSync(path.join(output,name));return {path:name,bytes:bytes.length,sha256:sha(bytes)};});
  const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256&&sha(fs.readFileSync(path.join(durable,'sources',source.path)))===source.sha256)
    &&snapshot.every(entry=>sha(fs.readFileSync(path.join(capture,entry.path)))===entry.sha256)
    &&librarySources.every(entry=>sha(fs.readFileSync(path.join(library,entry.path)))===entry.sha256)
    &&sha(fs.readFileSync(gridEntry))===sha(gridSource)
    &&fileSha(matFile)===matSha256&&sha(fs.readFileSync(executable))===compilerExecutable.sha256;
  let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
  const simulationSucceeded=log.includes('The simulation finished successfully.');
  const traceFile=path.join(output,'flight-replay-trace.log');
  const trace=fs.existsSync(traceFile)?fs.readFileSync(traceFile,'utf8'):'';
  const replayTrace={path:'flight-replay-trace.log',sha256:sha(trace),
    beginCount:(trace.match(/^RENDERED_FLIGHT_REPLAY_BEGIN$/gm)??[]).length,
    completed:(trace.match(/^RENDERED_FLIGHT_REPLAY_END .*$/gm)??[]),
    frames:(trace.match(/^RENDERED_FLIGHT_REPLAY_FRAME .*$/gm)??[])};
  const captureReceipts=parseCaptureFailureTrace(trace);
  const expectedCaptureEpoch=result.metrics[0]?.find(row=>row[2]===1&&row[3]===1&&row[4]===0)?.[0]??null;
  const captureTraceConsistent=result.rowsValid&&(expectedCaptureEpoch===null?captureReceipts.length===0
    :captureReceipts.length===1&&captureReceipts[0].epoch===expectedCaptureEpoch);
  const pass=terminal.status===0&&resources?.exitCode===0&&bookendsEqual&&simulationSucceeded&&result.rowsValid&&result.checks.length===checkCount&&result.checks.every(Boolean)
    &&(!extended||extendedPoseEvaluation.pass)&&(!captureDiagnostic||captureTraceConsistent);
  const report={status:pass?(sensorLoss?'OMC_RENDERED_SENSOR_LOSS_REFERENCE_PASS':'OMC_RENDERED_FLIGHT_SLAM_REFERENCE_PASS'):'FAILED_OR_INCOMPLETE',model,scenario,
    scope:`${frameRows} actual Rumoca plant/Three RGB-D frames and${intervalRows} source-measured held IMU intervals through complete Modelica localization/mapping reference. No authored acceleration, pose/velocity/rotation state injection, host estimator math, runtime WASM/browser estimator or throughput qualification. Raw modeled IMU has no stochastic bias/noise.`,
    cameraInput:{rawCamera,channels,depthUnits,depthNoise:captureManifest.acquisition.depthNoise,hostMetricDepthConversion:false},
    controlledSensorFaults:sensorLoss?{owner:'tests/modelica/RGBDRenderedSensorLossAcceptance.mo',
      mutations:[{epoch:3,kind:'all-zero Z16 depth'},{epoch:4,kind:'uniform RGB8=128'}],
      capturedBytesModified:false,imuModified:false,claim:'Controlled unavailable measurements, not observed capture faults.'}:null,
    matchedPairDiagnostic:pairDiagnostic?{requested:true,path:'matched-pairs.mat',present:fs.existsSync(pairFile),sha256:fs.existsSync(pairFile)?sha(fs.readFileSync(pairFile)):null}:null,
    captureFailureDiagnostic:{requested:captureDiagnostic,
      fields:captureFailureFields,parsed:captureReceipts,expectedCaptureEpoch,
      traceConsistent:captureDiagnostic?captureTraceConsistent:null,
      receipts:trace.match(/^RENDERED_FLIGHT_CAPTURE_FAILURE .*$/gm)??[]},
    captureDirectory:path.relative(app,capture),captureManifestSha256:sha(manifestBytes),captureFiles:snapshot,frames,
    imageSize:[height,width],gridEntrypoint:{path:'grid-entrypoint.mo',sha256:sha(gridSource),source:gridSource},
    physics,imu:{sampleCount:sampleRows,intervalCount:intervalRows,initial:measurements.samples[0].imu,convention:measurements.semantics},
    compilerVersion:version.stdout.trim(),compilerExecutable,referenceCflags,sources,productionSourceCount:productionNames.length,librarySources,
    oracleRotation:{packed:false,reason:'Unused by Modelica fixture; raw source quaternions remain unchanged in frozen oracle proofs. No normalization or conversion touches sensor/model inputs.',
      rawQuaternionNormErrors:oracleQuaternionNormErrors,maximumRawQuaternionNormError:Math.max(...oracleQuaternionNormErrors)},
    mat:{path:matName,sha256:matSha256,bytes:matBytes,type:'MATv4 little-endian float64 column-major',
      durableCopy:durableMat,scratchHomeRelative:path.relative(home,path.join(output,matName)),
      matrices:matrixSpecs.map(({name,rows,columns})=>({name,rows,columns})),independentDecode:{pass:true,decodedCells,decodedMatrices:matrixSpecs.length},
      imuIntervalFields:['endTime','duration','accelX','accelY','accelZ','gyroX','gyroY','gyroZ'],initialImuFields:['accelX','accelY','accelZ','gyroX','gyroY','gyroZ']},
    bookendsEqual,processStatus:terminal.status,simulationSucceeded,replayTrace,resources,result,metricLabels,diagnosticLabels,advisoryPoseEvaluation,extendedPoseEvaluation,generated,
    generatedScratchHomeRelative:path.relative(home,output),renderedFlightReferenceQualified:!!pass,
    nativeArtifactIssued:false,browserEstimatorExecuted:false,publicAdapterNumericalExecution:false,fullSlamAccepted:false};
  preserve();json('report.json',report);manifest();
  console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,processStatus:terminal.status,result,resources}));process.exitCode=pass?0:1;
}catch(error){
  preserve();json('failure.json',{status:'REFUSED_BEFORE_OR_DURING_GATE',stage,error:String(error?.stack??error),captureDirectory:path.relative(app,capture),captureFiles:snapshot});manifest();
  console.error(JSON.stringify({directory:path.relative(app,durable),stage,error:String(error)}));process.exitCode=1;
}
function preserve(){for(const name of fs.readdirSync(output)){
    const file=path.join(output,name);if(fs.statSync(file).isFile()&&(/\.(?:json|log|mo|mos|txt|csv|c|h|xml)$/.test(name)||name==='matched-pairs.mat'))copy(file,path.join(durable,name));
}}
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();}
function manifest(){json('manifest.json',{files:walk(durable).filter(file=>file!==path.join(durable,'manifest.json')).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});}
