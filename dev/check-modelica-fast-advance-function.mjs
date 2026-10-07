// Full raw fast-advance-function reference gate; separate from public-model admission.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'fast-advance-function-'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const original=false;
const adapter=false;
const names=['models/RGBDFeatureMatching.mo','models/RigidPointRegistration.mo',
  'models/RGBDRelativePose.mo','models/RGBDRegistrationUncertainty.mo',
  'models/RGBDVisualObservation.mo','models/RGBDVisualRelativeObservation.mo','models/RGBDLandmarkProjection.mo',
  'models/SPD6Solve.mo','models/ES15PoseCorrection.mo','models/SchmidtRelativePoseCorrection.mo',
  'models/ES15NominalPrediction.mo','models/ES15Dynamics.mo','models/ES15CovariancePrediction.mo',
  'models/SchmidtReferenceState.mo','models/RGBDInertialLocalizationStep.mo',
  'models/RGBDInertialLocalizationInitialize.mo','models/FastNativeFrame.mo','models/FeatureSelection.mo',
  'models/RGBDFastInertialLocalizationInitialize.mo','models/RGBDFastInertialLocalizationStep.mo','tests/modelica/RGBDLocalizationInitializeTests.mo',
  'tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo','tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastInitializationFunctionAcceptance.mo',
  'tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo'];
if(original)names[names.indexOf('models/RGBDInertialLocalizationStep.mo')]='dev/artifacts/modelica-fast-advance-function/adapter-preimages/RGBDInertialLocalizationStep.qualified-function.mo';
const sources=[...names,'dev/check-modelica-fast-advance-function.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,source.path),target);}
const model='RGBDFastAdvanceFunctionAcceptance',script=path.join(output,'fast-advance-function.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=13.25,numberOfIntervals=53,outputFormat="csv",variableFilter="scenario|checks.*",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8'});if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const csvPath=model+'_res.csv';let checks=[],result=null;
if(fs.existsSync(path.join(output,csvPath))){
  const raw=fs.readFileSync(path.join(output,csvPath),'utf8'),lines=raw.trim().split(/\r?\n/);
  const header=[...lines.shift().matchAll(/"([^"]*)"/g)].map(match=>match[1]);
  const expected=['time','scenario',...Array.from({length:64},(_,i)=>`checks[${i+1}]`)];
  const rows=lines.map(line=>line.split(',').map(Number));
  const columnsValid=header.length===66&&new Set(header).size===66&&expected.every(name=>header.includes(name));
  const indices=expected.slice(2).map(name=>header.indexOf(name)),si=header.indexOf('scenario'),ti=header.indexOf('time');
  const lexicalValid=lines.every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rowsValid=columnsValid&&lexicalValid&&rows.length>=54&&rows.every(row=>row.length===66&&row.every(Number.isFinite)
    &&Number.isInteger(row[si])&&row[si]>=1&&row[si]<=14&&indices.every(i=>row[i]===0||row[i]===1))
    &&rows[0][ti]===0&&rows.at(-1)[ti]===13.25;
  const scenarios=rowsValid?[...new Set(rows.map(row=>row[si]))].sort((a,b)=>a-b):[];
  if(rowsValid)checks=indices.map(i=>rows.every(row=>row[i]===1));
  result={path:csvPath,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,scenarios,
    allScenariosObserved:scenarios.length===14,failedRows:rowsValid?rows.filter(row=>indices.some(i=>row[i]!==1)):[]};
}
const generated=fs.readdirSync(output).filter(name=>name.endsWith('_functions.c')).map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name)))}));
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=terminal.status===0&&bookendsEqual&&simulationSucceeded&&result?.allScenariosObserved&&checks.length===64&&checks.every(Boolean);
const report={status:pass?'OMC_RAW_FAST_ADVANCE_COMPOSITION_PASS':'FAILED_OR_INCOMPLETE',compilerVersion:version.stdout.trim(),
  scope:'Full90x160/14400/350 FAST advance composition: independent bruteFAST9/stable merge-sort selection and analytic three-plane rawpixel translation/descriptor oracles,actual retained FAST initialization. All57 core outputs compared to separately qualified AdvanceRGBDLocalization; that comparison is core-dependent,not an all-independent filter trajectory proof.14cases/64checks. Publicmodel/WASM/browser/fullSLAM unqualified.',
  sources,bookendsEqual,checks,result,generated,processStatus:terminal.status,simulationSucceeded,
  fastAdvanceCompositionQualified:!!pass,originalConnectedModelParity:!!pass&&original,modelAdapterBindingQualified:!!pass&&adapter,modelWrapperQualified:!!pass&&adapter,rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-fast-advance-function',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','semantics.log','fast-advance-function.mos',csvPath,...generated.map(item=>item.path)])
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:durable,scratchDirectory:output,...report}));process.exitCode=pass?0:1;
