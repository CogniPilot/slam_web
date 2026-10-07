// Test-only OMC replay of hash-bound rendered RGB-D. No estimator math or input injection.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
const args=process.argv.slice(2),centerMode=args.includes('--center'),captureArgs=args.filter(arg=>arg!=='--center');
if(captureArgs.length!==1||args.length!==(centerMode?2:1)||captureArgs[0].startsWith('--'))
  throw Error('Usage: node dev/check-modelica-rendered-city-slam.mjs <capture-directory> [--center]');
const capture=fs.realpathSync(path.resolve(captureArgs[0]));
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'rendered-city-slam-'));
const durable=path.join(app,'dev/artifacts/modelica-rendered-city-slam',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const model=centerMode?'RGBDRenderedCityCenterAcceptance':'RGBDRenderedCitySLAMAcceptance';
const height=90,width=160,channels=4,checkCount=centerMode?12:24,frameRows=centerMode?1:4,diagnosticCount=16;
const metricLabels=['epoch','frameTime','accepted','imageCompleted','mappingAccepted','selectionValid','initializationAccepted','predictionAccepted',
  'observationAccepted','captureAccepted','matchCount','featureCount','trackingCount','occupiedMapCount','steps','catalogNextId','referenceEpoch','lastUsedEpoch',
  'batchReason','processedIntervals','failedInterval','positionX','positionY','positionZ'];
const diagnosticLabels=centerMode?['rgbNonzeroByteCount','positiveDepthCount','minimumPositiveDepth','maximumPositiveDepth','selectionStatus',
  'selectedCount','describedEnabledCount','referenceCount','referenceEnabledCount','vocabularyCount','mapPointCount','publicationReason',
  'ledgerReason','vocabularyReason','referenceAvailable','captureAccepted']:
  ['registrationAccepted','registrationReason','registrationRms','registrationRank','relativeValid','uncertaintyReason',
  'uncertaintyValid','matchCount','descriptionInvalidCount','currentEnabledCount','matchingConfigurationValid','invalidReference','invalidCurrent',
  'registrationValidCount','registrationInvalidCount','frontendPoseValid'];
const sha=x=>createHash('sha256').update(x).digest('hex');
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
    snapshot.push({path:name,bytes:bytes.length,sha256:digest});
    copy(file,path.join(durable,'capture',name));
  }
  return bytes;
}
const matrixParts=[],matrixSpecs=[];
function matrix(name,rows,columns,read){
  assert(Number.isSafeInteger(rows)&&rows>0&&Number.isSafeInteger(columns)&&columns>0,'Positive matrix extents');
  const label=Buffer.from(name+'\0','ascii'),header=Buffer.alloc(20),data=Buffer.alloc(rows*columns*8);
  for(const [index,value]of[0,rows,columns,0,label.length].entries())header.writeInt32LE(value,index*4);
  for(let column=0;column<columns;column++)for(let row=0;row<rows;row++){
    const value=read(row,column);assert(Number.isFinite(value),`Nonfinite MAT value ${name}[${row},${column}]`);
    data.writeDoubleLE(value,(column*rows+row)*8);
  }
  matrixParts.push(header,label,data);matrixSpecs.push({name,rows,columns,read});
}
function exactArray(actual,expected,label){assert(JSON.stringify(actual)===JSON.stringify(expected),label);}
function rotation(pose){
  const q=pose.quaternion;
  assert(Array.isArray(q)&&q.length===4&&q.every(Number.isFinite),'Finite wxyz oracle quaternion');
  assert(Math.abs(q.reduce((sum,v)=>sum+v*v,0)-1)<1e-12,'Unit oracle quaternion; never normalize it');
  const [w,x,y,z]=q;
  // Oracle-only metadata representation conversion, never fed into the estimator after initialization.
  return [1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];
}
function validateFrame(frame,index,calibration){
  assert(frame.sequence===index&&Number.isFinite(frame.time),'Exact frame sequence and finite acquisition time');
  const rgbMeta=frame.rgb,depthMeta=frame.depth;
  assert(rgbMeta.type==='Uint8'&&rgbMeta.order==='row-major top-down RGBA'&&rgbMeta.colorSpace==='sRGB display encoded','Exact RGB byte encoding/orientation');
  exactArray(rgbMeta.shape,[height,width,channels],'RGB shape90x160x4');
  assert(depthMeta.type==='Float32'&&depthMeta.endianness==='little'&&depthMeta.order==='row-major top-down'
    &&depthMeta.meaning==='axial optical-Z metres'&&depthMeta.encoding==='axial-f32-le-rgba8','Exact axial f32 depth encoding/orientation');
  exactArray(depthMeta.shape,[height,width],'Depth shape90x160');
  const rgb=captureFile(rgbMeta.path,rgbMeta.sha256),depth=captureFile(depthMeta.path,depthMeta.sha256);
  assert(rgb.length===height*width*channels&&rgbMeta.bytes===rgb.length,'Exact RGB byte count');
  assert(depth.length===height*width*4&&depthMeta.bytes===depth.length,'Exact depth byte count');
  let positive=0,zero=0,min=Infinity,max=-Infinity;
  for(let i=0;i<height*width;i++){
    const z=depth.readFloatLE(i*4);assert(Number.isFinite(z)&&z>=0,'Finite nonnegative renderer depth lane');
    assert(z===0||(z>=calibration.near&&z<=calibration.far),'Positive depth lies within captured clipping planes');
    if(z>0){positive++;min=Math.min(min,z);max=Math.max(max,z);}else zero++;
  }
  const stats=frame.stats.depth;
  assert(stats.finite===height*width&&stats.nonfinite===0&&stats.positive===positive&&stats.zero===zero
    &&stats.minPositive===(positive?min:null)&&stats.maxPositive===(positive?max:null),'Independent depth statistics match capture');
  let nonzero=0,nonopaque=0;for(let i=0;i<rgb.length;i++){if(rgb[i]!==0)nonzero++;if(i%4===3&&rgb[i]!==255)nonopaque++;}
  assert(frame.stats.rgb.nonzeroBytes===nonzero&&frame.stats.rgb.uniqueByteValues===new Set(rgb).size
    &&frame.stats.rgb.nonopaqueAlpha===nonopaque,'Independent RGB statistics match capture');
  matrix(`rgb_${index+1}`,height,width*channels,(r,c)=>rgb[r*width*channels+c]);
  matrix(`depth_${index+1}`,height,width,(r,c)=>depth.readFloatLE((r*width+c)*4));
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
  assert(captureManifest.schema==='modelica-rendered-city-frames-v1'&&captureManifest.status==='ACTUAL_THREE_RGBD_CAPTURE_PASS'
    &&captureManifest.sourceBookendsEqual===true&&captureManifest.frameCount===4&&captureManifest.frames.length===4,'Completed four-frame capture manifest required');
  const before=JSON.parse(captureFile('sources-before.json')),after=JSON.parse(captureFile('sources-after.json'));
  assert(JSON.stringify(before)===JSON.stringify(after)&&sha(Buffer.from(JSON.stringify(before)))===captureManifest.sourcesManifestSha256,'Capture source/asset bookends and digest');
  const startupPhysics=centerMode?captureManifest.startupPhysics:null;
  if(centerMode){
    assert(startupPhysics?.modelName==='LabQuadrotor'&&startupPhysics.advanced===false
      &&startupPhysics.initializationApi==='WasmSimulationSession.withInteractiveOptions'
      &&startupPhysics.snapshotApi==='readPhysicsSnapshot(session,true)','Center requires actual unadvanced compiler-owned plant initialization');
    assert(captureManifest.diagnostics?.streetCenter?.poseSource==='startupPhysics.initialSnapshot','Center capture must use actual initialized physics snapshot');
    for(const key of ['source','js','wasm','physicsWorker','snapshotReader']){
      const proof=startupPhysics[key],entry=before.find(value=>value.path===proof?.sourcePath);
      assert(entry&&entry.sha256===proof.sha256&&entry.bytes===proof.bytes,'Startup source identity must belong to capture bookends: '+key);
      assert(captureFile(proof.path,proof.sha256).length===proof.bytes,'Startup proof byte count: '+key);
      if(key==='js'||key==='wasm')assert(captureManifest.servedResources.some(value=>value.sourcePath===proof.sourcePath&&value.sha256===proof.sha256),'Startup compiler bytes actually served: '+key);
    }
    assert(startupPhysics.source.sourcePath==='models/LabQuadrotor.mo','Exact plant source owner');
    const state=JSON.parse(captureFile(startupPhysics.stateJson.path,startupPhysics.stateJson.sha256)),initial=startupPhysics.initialSnapshot;
    assert(state.time===0&&initial.time===state.time,'Unadvanced initialized source time');
    const fields={x:initial.x,y:initial.y,z:initial.z,qw:initial.quaternion?.[0],qx:initial.quaternion?.[1],qy:initial.quaternion?.[2],qz:initial.quaternion?.[3],
      vx:initial.velocity?.[0],vy:initial.velocity?.[1],vz:initial.velocity?.[2],imu_ax:initial.accel?.[0],imu_ay:initial.accel?.[1],imu_az:initial.accel?.[2],p:initial.gyro?.[0],q:initial.gyro?.[1],r:initial.gyro?.[2]};
    assert(Object.entries(fields).every(([name,value])=>Number.isFinite(value)&&Object.is(value,state.values?.[name])),'Snapshot fields equal actual compiler state JSON');
  }
  captureFile(captureManifest.screenshot.path,captureManifest.screenshot.sha256);
  const calibration=captureManifest.calibration;
  assert(calibration.width===width&&calibration.height===height&&calibration.cx===79.5&&calibration.cy===44.5,'D435-inspired reduced dimensions/principal point');
  const calibrationKeys=['fx','fy','cx','cy','rgbFx','rgbFy','baseline','depthNoiseDisparityPx','depthNoiseReferenceFx'];
  assert(calibrationKeys.every(k=>Number.isFinite(calibration[k]))&&calibration.fx>0&&calibration.fy>0&&calibration.rgbFx>0&&calibration.rgbFy>0
    &&calibration.fx!==calibration.rgbFx&&calibration.fy!==calibration.rgbFy&&calibration.baseline>0&&calibration.depthNoiseDisparityPx>0&&calibration.depthNoiseReferenceFx>0,'Separate finite positive RGB/depth calibration');
  assert(Number.isFinite(calibration.near)&&Number.isFinite(calibration.far)&&calibration.near>0&&calibration.far>calibration.near,'Finite depth clipping planes');
  assert(calibration.depthEncoding==='axial-f32-le-rgba8','D435 depth encoding');
  exactArray(calibration.opticalToBody,[0,0,1,-1,0,0,0,-1,0],'Captured optical/body convention');
  assert(Array.isArray(calibration.originFlu)&&calibration.originFlu.length===3&&calibration.originFlu.every(Number.isFinite),'Finite optical origin');
  const frames=captureManifest.frames.map((frame,i)=>{assert(frame.time===i/30,'Exact captured30Hz acquisition clock');return validateFrame(frame,i,calibration);});
  const oracle=JSON.parse(captureFile(captureManifest.oraclePath));
  assert(oracle.frame==='world FLU'&&oracle.quaternionOrder==='wxyz'&&oracle.poses.length===4,'Separate four-pose wxyz renderer oracle');
  for(let i=0;i<4;i++)assert(['x','y','z','time'].every(k=>Number.isFinite(oracle.poses[i][k]))&&oracle.poses[i].time===frames[i].time,'Finite time-bound oracle pose');
  const originPose=oracle.poses[0],rotations=oracle.poses.map(rotation);
  const positions=oracle.poses.map(p=>[p.x-originPose.x,p.y-originPose.y,p.z-originPose.z]);
  let diagnostic=null,centerPose=null;
  assert(!centerMode||captureManifest.diagnostics?.streetCenter,'Center mode requires captured streetCenter diagnostic');
  if(captureManifest.diagnostics?.streetCenter){
    diagnostic=validateFrame(captureManifest.diagnostics.streetCenter,4,calibration);
    const poseFile=JSON.parse(captureFile(captureManifest.diagnostics.streetCenter.oraclePath));
    assert(poseFile.frame==='world FLU'&&poseFile.quaternionOrder==='wxyz','Separate diagnostic oracle convention');
    const p=poseFile.pose;assert(['x','y','z','time'].every(k=>Number.isFinite(p[k])),'Finite diagnostic oracle');centerPose=p;
    if(centerMode){
      assert(['x','y','z','time'].every(key=>Object.is(p[key],startupPhysics.initialSnapshot[key])),'Center oracle position/time equals actual initialization snapshot');
      exactArray(p.quaternion,startupPhysics.initialSnapshot.quaternion,'Center oracle rotation equals actual initialization snapshot');
    }
    const R=rotation(p);matrix('diagnosticOraclePosition',1,3,(_,c)=>[p.x-originPose.x,p.y-originPose.y,p.z-originPose.z][c]);
    matrix('diagnosticOracleRotation',1,9,(_,c)=>R[c]);
  }
  const fields=[calibration.fx,calibration.fy,calibration.cx,calibration.cy,calibration.rgbFx,calibration.rgbFy,calibration.baseline,
    calibration.depthNoiseDisparityPx,calibration.depthNoiseReferenceFx,...calibration.originFlu,calibration.near,calibration.far];
  matrix('calibration',1,14,(_,c)=>fields[c]);matrix('opticalToBody',3,3,(r,c)=>calibration.opticalToBody[r*3+c]);
  matrix('acquisition',4,2,(r,c)=>c===0?frames[r].sequence:frames[r].time);
  matrix('oraclePosition',4,3,(r,c)=>positions[r][c]);matrix('oracleRotation',4,9,(r,c)=>rotations[r][c]);
  const mat=Buffer.concat(matrixParts),matName='rendered-city.mat';fs.writeFileSync(path.join(output,matName),mat);copy(path.join(output,matName),path.join(durable,matName));
  // Independent decode checks every actual MAT cell against its raw typed source/metadata.
  let offset=0,decodedCells=0,decodedMatrices=0;
  for(const spec of matrixSpecs){
    const type=mat.readInt32LE(offset),rows=mat.readInt32LE(offset+4),columns=mat.readInt32LE(offset+8),imag=mat.readInt32LE(offset+12),length=mat.readInt32LE(offset+16);
    const name=mat.subarray(offset+20,offset+20+length-1).toString('ascii');
    assert(type===0&&imag===0&&name===spec.name&&rows===spec.rows&&columns===spec.columns,'Exact MATv4 header/schema');offset+=20+length;
    for(let c=0;c<columns;c++)for(let r=0;r<rows;r++){assert(Object.is(mat.readDoubleLE(offset+(c*rows+r)*8),spec.read(r,c)),`MAT typed lane mismatch ${name}`);decodedCells++;}
    offset+=rows*columns*8;decodedMatrices++;
  }
  assert(offset===mat.length,'No trailing or missing MAT bytes');
  stage='source-freeze';
  const productionNames=[...new Set([...rgbdSlamSourceManifest.paths,'models/RGBDFastSLAMIntervals.mo'])];
  const names=[...productionNames,'tests/modelica/RGBDLocalizationInitializeTests.mo',
    'tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo','tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo',
    'tests/modelica/RGBDFastInitializationFunctionAcceptance.mo','tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo',
    'tests/modelica/RGBDFastSLAMRawCompositionAcceptance.mo','tests/modelica/RGBDCompleteStateComparison.mo',
    'tests/modelica/RGBDRenderedFrameInput.mo',
    'tests/modelica/RGBDRenderedVisualDiagnostics.mo',
    'tests/modelica/RGBDRenderedCitySLAMAcceptance.mo',
    ...(centerMode?['tests/modelica/RGBDRenderedCityCenterAcceptance.mo']:[])];
  const sources=[...names,'src/modelica-slam-source-manifest.mjs','dev/check-modelica-rendered-city-slam.mjs','dev/rumoca-bounded-run.mjs']
    .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
  for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
  assert(sources.every(source=>sha(fs.readFileSync(path.join(durable,'sources',source.path)))===source.sha256),'Frozen source copies');
  const library=path.join(home,'.openmodelica/libraries/Modelica 4.1.0+maint.om');
  const librarySources=['package.mo','Utilities/Streams.mo'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(library,name)))}));
  for(const entry of librarySources)copy(path.join(library,entry.path),path.join(durable,'installed-msl',entry.path));
  const script=path.join(output,'rendered-city-slam.mos');
  fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
    +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\ngetVersion(Modelica);\n'
    +names.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')
    +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
    +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|raw.*|diagnostics.*",cflags="-O0",simflags=${JSON.stringify('-override=datasetFile='+path.join(output,matName))});\ngetErrorString();\n`);
  const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
  if(version.error||version.status!==0)throw version.error??Error(version.stderr);
  const executable=path.isAbsolute(omc)?fs.realpathSync(omc):fs.realpathSync((process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}})??omc);
  const compilerExecutable={path:executable,sha256:sha(fs.readFileSync(executable))};
  stage='bounded-omc';
  const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
    '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
    omc,'--numProcs=2','--vectorizationLimit=1',script];
  fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
  const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
  const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
  const result=strictCsv(path.join(output,model+'_res.csv'));
  const advisoryPositions=centerMode?[[0,0,0]]:positions;
  const advisoryPoseEvaluation=result.metrics.length?{scope:'Separate renderer-oracle evaluation only; not an acceptance criterion, estimator input or accuracy certification.',
    originPose:centerMode?centerPose:originPose,
    frames:result.metrics[0].map((raw,index)=>{const estimate=raw.slice(21,24),error=estimate.map((value,axis)=>value-advisoryPositions[index][axis]);
      return {sequence:centerMode?4:index,time:centerMode?centerPose.time:frames[index].time,estimatedPosition:estimate,oraclePosition:advisoryPositions[index],positionError:error,euclideanError:Math.hypot(...error)};})}:null;
  const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{const bytes=fs.readFileSync(path.join(output,name));return {path:name,bytes:bytes.length,sha256:sha(bytes)};});
  const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256)
    &&snapshot.every(entry=>sha(fs.readFileSync(path.join(capture,entry.path)))===entry.sha256)
    &&librarySources.every(entry=>sha(fs.readFileSync(path.join(library,entry.path)))===entry.sha256)
    &&sha(fs.readFileSync(path.join(output,matName)))===sha(mat)
    &&sha(fs.readFileSync(executable))===compilerExecutable.sha256;
  let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
  const simulationSucceeded=log.includes('The simulation finished successfully.');
  const pass=terminal.status===0&&resources?.exitCode===0&&bookendsEqual&&simulationSucceeded&&result.rowsValid&&result.checks.length===checkCount&&result.checks.every(Boolean);
  const report={status:pass?(centerMode?'OMC_RENDERED_CITY_CENTER_INITIALIZATION_REFERENCE_PASS':'OMC_RENDERED_CITY_SLAM_REFERENCE_PASS'):'FAILED_OR_INCOMPLETE',model,
    mode:centerMode?'center-initialization':'four-frame-localization',
    scope:centerMode?'Hash-bound actual street-center RGB-D initialization through the complete Modelica lifecycle. Test-only MAT file IO and exact typed widening; separate center-relative oracle evaluation only. No oracle inputs, host estimator math, subsequent tracking, Rumoca/browser/throughput qualification.':
      'Hash-bound actual city RGB-D reference replay through complete Modelica lifecycle. Test-only MAT file IO and exact typed widening; controlled kinematic renderer poses are oracle metadata, not an inertially simulated flight. No camera truth injection after initialization, host estimator math, Rumoca/browser/throughput qualification.',
    captureDirectory:path.relative(app,capture),captureManifestSha256:sha(manifestBytes),captureFiles:snapshot,frames,diagnostic,
    ...(centerMode?{startupPhysics}:{}),
    oracleOriginPose:centerMode?centerPose:originPose,oraclePositions:advisoryPositions,
    ...(centerMode?{packedPrimaryOracleOriginPose:originPose,packedPrimaryOraclePositions:positions}:{}),
    compilerVersion:version.stdout.trim(),compilerExecutable,sources,productionSourceCount:productionNames.length,
    librarySources,installedMslHomeRelative:path.relative(home,library),
    mat:{path:matName,sha256:sha(mat),bytes:mat.length,type:'MATv4 little-endian float64 column-major',
      matrices:matrixSpecs.map(({name,rows,columns})=>({name,rows,columns})),independentDecode:{pass:true,decodedCells,decodedMatrices},
      calibrationFields:['depthFx','depthFy','cx','cy','rgbFx','rgbFy','baseline','disparityNoise','noiseRefFx','originX','originY','originZ','near','far']},
    bookendsEqual,processStatus:terminal.status,simulationSucceeded,resources,result,metricLabels,diagnosticLabels,
    diagnosticScope:centerMode?'Test-only statistics of the actual startup image/depth and selected/described/reference/vocabulary/map admission. Does not feed or replace the initialization transaction.':
      'Separate test-only frontend reevaluation using the original deterministic selected pixels/count and incoming reference. Does not feed or replace the lifecycle transaction.',
    advisoryPoseEvaluation,generated,
    generatedScratchHomeRelative:path.relative(home,output),renderedCityCompositionQualified:!!pass&&!centerMode,
    renderedCityCenterInitializationQualified:!!pass&&centerMode,
    nativeArtifactIssued:false,browserEstimatorExecuted:false,publicAdapterNumericalExecution:false,fullSlamAccepted:false};
  json('report.json',report);
  for(const name of ['resources.json','command.json','guardian-stderr.log','semantics.log','rendered-city-slam.mos','phase.txt',model+'_res.csv',model+'.c',model+'_functions.c']){
    const file=path.join(output,name);if(fs.existsSync(file))copy(file,path.join(durable,name));
  }
  json('manifest.json',{files:walk(durable).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});
  console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,processStatus:terminal.status,result,resources}));process.exitCode=pass?0:1;
}catch(error){
  // Preserve available receipts even if a postprocessing exception follows a failed run.
  for(const name of ['resources.json','command.json','guardian-stderr.log','semantics.log','rendered-city-slam.mos','phase.txt',model+'_res.csv',model+'.c',model+'_functions.c']){
    const file=path.join(output,name);if(fs.existsSync(file))copy(file,path.join(durable,name));
  }
  json('preflight-failure.json',{status:'REFUSED_BEFORE_OR_DURING_GATE',stage,error:String(error?.stack??error),captureDirectory:path.relative(app,capture),captureFiles:snapshot});
  console.error(JSON.stringify({directory:path.relative(app,durable),stage,error:String(error)}));process.exitCode=1;
}
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();}
