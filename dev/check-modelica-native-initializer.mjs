// Native848x480 actual FAST initializer reference gate; no source resize or host numerical path.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.slice(2).some(arg=>arg!=='--raw'))throw Error('Expected optional --raw');
const raw=process.argv.includes('--raw');
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'native-initializer-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const names=['models/Vision/Matching/RGBDFeatureMatching.mo','models/Math/RigidPointRegistration.mo',
  'models/Estimation/Localization/RGBDRelativePose.mo','models/Estimation/Localization/RGBDRegistrationUncertainty.mo',
  'models/Estimation/Localization/RGBDVisualObservation.mo','models/Estimation/Localization/RGBDVisualRelativeObservation.mo','models/Mapping/RGBDLandmarkProjection.mo',
  'models/Math/SPD6Solve.mo','models/Estimation/Inertial/ES15PoseCorrection.mo','models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo',
  'models/Estimation/Inertial/ES15NominalPrediction.mo','models/Estimation/Inertial/ES15Dynamics.mo','models/Estimation/Inertial/ES15CovariancePrediction.mo',
  'models/Estimation/Inertial/SchmidtReferenceState.mo','models/Estimation/Localization/RGBDInertialLocalizationStep.mo',
  'models/Estimation/Localization/RGBDInertialLocalizationInitialize.mo','models/Vision/Features/FastNativeFrame.mo','models/Vision/Features/FeatureSelection.mo',
  'models/Estimation/Localization/RGBDFastInertialLocalizationInitialize.mo','tests/modelica/RGBDLocalizationInitializeTests.mo',
  'tests/modelica/RGBDNativeInitializationAcceptance.mo'];
const sources=[...names,'dev/check-modelica-native-initializer.mjs','dev/rumoca-bounded-run.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,source.path),target);}
const model=raw?'RGBDRawNativeInitializationAcceptance':'RGBDNativeInitializationAcceptance',script=path.join(output,'native-initializer.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=2.25,numberOfIntervals=9,outputFormat="csv",variableFilter="scenario|checks.*|metrics.*",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8'});if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(output,'sources','dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','4096','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
console.log(JSON.stringify({phase:'launch',output,model,cases:3,checks:24,nativeGrid:[480,848],seconds:120,rssMiB:4096,cores:'6,7'}));
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const csvPath=model+'_res.csv';let checks=[],result=null;
const metricNames=['currentCount','describedCount','captureAccepted','frameValid','farPixelX','farPixelY',
  'farPointX','farPointY','farPointZ','mapCandidateCount','referenceCount','selectionValid',
  'rgbFx','rgbFy','rgbCx','rgbCy','depthFx','depthFy','depthCx','depthCy',
  'referenceRgbFx','referenceRgbFy','referenceRgbCx','referenceRgbCy',
  'referenceDepthFx','referenceDepthFy','referenceDepthCx','referenceDepthCy'];
if(fs.existsSync(path.join(output,csvPath))){
 const raw=fs.readFileSync(path.join(output,csvPath),'utf8'),lines=raw.trim().split(/\r?\n/);
 const first=lines.shift(),header=[...first.matchAll(/"([^"]*)"/g)].map(match=>match[1]);
 const expected=['time','scenario',...Array.from({length:24},(_,i)=>`checks[${i+1}]`),
  ...Array.from({length:28},(_,i)=>`metrics[${i+1}]`)];
 const columnsValid=header.map(JSON.stringify).join(',')===first&&header.length===expected.length
  &&new Set(header).size===expected.length&&expected.every(name=>header.includes(name));
 const rows=lines.map(line=>line.split(',').map(Number));
 const si=header.indexOf('scenario'),ti=header.indexOf('time'),indices=Array.from({length:24},(_,i)=>header.indexOf(`checks[${i+1}]`));
 const lexicalValid=lines.every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
 const rowsValid=columnsValid&&lexicalValid&&rows.length>=10&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite)
  &&Number.isInteger(row[si])&&row[si]>=1&&row[si]<=3&&indices.every(i=>row[i]===0||row[i]===1))
  &&rows[0][ti]===0&&rows.at(-1)[ti]===2.25&&rows.every((row,i)=>i===0||row[ti]>=rows[i-1][ti]);
 const scenarios=rowsValid?[...new Set(rows.map(row=>row[si]))].sort((a,b)=>a-b):[];
 if(rowsValid)checks=indices.map(i=>rows.every(row=>row[i]===1));
 const metrics=rowsValid?scenarios.map(scenario=>{
  const row=rows.find(row=>row[si]===scenario);return {scenario,
   values:Object.fromEntries(metricNames.map((name,i)=>[name,row[header.indexOf(`metrics[${i+1}]`)]]))};
 }):[];
 result={path:csvPath,sha256:sha(raw),columns:header,columnsValid,rowsValid,rows:rows.length,scenarios,metrics,
  allScenariosObserved:scenarios.length===3,failedRows:rowsValid?rows.filter(row=>indices.some(i=>row[i]!==1)):[]};
}
const generated=fs.readdirSync(output).filter(name=>name.endsWith('.c')||name.endsWith('.h')).map(name=>{
 const bytes=fs.readFileSync(path.join(output,name));return {path:name,sha256:sha(bytes),bytes:bytes.length,
  durableCopy:bytes.length<=1024*1024,scratchPath:path.join(output,name)};
});
const productionCallsObserved=generated.some(file=>file.path.endsWith('_functions.c')&&fs.readFileSync(path.join(output,file.path),'utf8').includes('omc_InitializeFastRGBDLocalization('));
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=terminal.status===0&&bookendsEqual&&simulationSucceeded&&result?.allScenariosObserved&&productionCallsObserved&&checks.length===24&&checks.every(Boolean);
const report={status:pass?'OMC_NATIVE_GRID_FAST_INITIALIZER_PASS':'FAILED_OR_INCOMPLETE',compilerVersion:version.stdout.trim(),
  scope:`Production InitializeFastRGBDLocalization on actual848x480 ${raw?'RGB3/Z16 codes with 1mm scale':'RGBA/metric depth'},407040 scores and350x49 outputs. Three dynamic cases: fresh capture, disabled poisoned raster hold, enabled no-capture hold. Independent analytic impulse FAST/descriptor, off-axis separate intrinsics and nonuniform harmonic depth, transformed world points, complete current15 and capture cross/reference covariance and metadata checks. Function reference only; no Rumoca/WASM/browser/fullSLAM admission`,
  sources,bookendsEqual,checks,result,generated,productionCallsObserved,processStatus:terminal.status,simulationSucceeded,
  initializerFunctionQualified:!!pass,modelWrapperQualified:false,rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-native-frontend',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','semantics.log','native-initializer.mos',csvPath,...generated.filter(item=>item.durableCopy).map(item=>item.path)])
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:durable,scratchDirectory:output,...report}));process.exitCode=pass?0:1;
