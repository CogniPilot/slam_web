// Independent reference semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='RGBDLocalizationInitializeAcceptance';
const checkCount=20,caseCount=28,stopTime=0.001;
const backend=process.env.OMC_INITIALIZE_BACKEND??'old';
if(!['old','new'].includes(backend))throw Error('Expected OMC_INITIALIZE_BACKEND=old or new');
const debugFlags=backend==='new'
  ?'gen,execstat,dumpBackendClocks,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,-nfScalarize'
  :'gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
// The C runtime needs scalar storage in SimCode. Preserve arrays until then
// only in this explicit reference diagnostic; default behavior is unchanged.
const commandLineOptions=backend==='new'
  ?'--newBackend=true --simCodeTarget=C --simCodeScalarize=true --preOptModules-=evalFunc'
  :'--preOptModules-=evalFunc';
const requested=(process.env.LOCALIZATION_INITIALIZE_CASES??Array.from({length:caseCount},(_,i)=>i+1).join(',')).split(',').map(Number);
if(!requested.length||new Set(requested).size!==requested.length||requested.some(n=>!Number.isInteger(n)||n<1||n>caseCount))throw Error('Invalid case selection');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'localization-initialize-semantics-'));
const names=['models/Vision/Matching/RGBDFeatureMatching.mo','models/Math/RigidPointRegistration.mo',
  'models/Estimation/Localization/RGBDRelativePose.mo','models/Estimation/Localization/RGBDRegistrationUncertainty.mo',
  'models/Estimation/Localization/RGBDVisualObservation.mo','models/Estimation/Localization/RGBDVisualRelativeObservation.mo','models/Mapping/RGBDLandmarkProjection.mo',
  'models/Math/SPD6Solve.mo','models/Estimation/Inertial/ES15PoseCorrection.mo','models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo',
  'models/Estimation/Inertial/ES15NominalPrediction.mo','models/Estimation/Inertial/ES15Dynamics.mo','models/Estimation/Inertial/ES15CovariancePrediction.mo',
  'models/Estimation/Inertial/SchmidtReferenceState.mo','models/Estimation/Localization/RGBDInertialLocalizationStep.mo',
  'models/Estimation/Localization/RGBDInertialLocalizationInitialize.mo','tests/modelica/RGBDLocalizationInitializeTests.mo',
  'tests/modelica/RGBDLocalizationInitializeAcceptance.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-localization-initialize.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const frozen=path.join(output,'source-preimages');
for(const entry of sources){
  const target=path.join(frozen,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,entry.path),target);
}
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const cases=[];
for(const scenario of requested){
  const directory=path.join(output,`case-${scenario}`); fs.mkdirSync(directory);
  const caseModel=`${model}Case${scenario}`;
  const script=path.join(directory,'localization-initialize.mos');
  const caseSource=`model ${caseModel} extends ${model}(final scenario=${scenario}); end ${caseModel};`;
  fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debugFlags)});\n`
    +`setCommandLineOptions(${JSON.stringify(commandLineOptions)});\n`
    +names.map(name=>`loadFile(${JSON.stringify(path.join(frozen,name))});`).join('\n')
    +`\nloadString(${JSON.stringify(caseSource)});\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n`
    +`simulate(${caseModel},stopTime=${stopTime},numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|scenario");\nwriteFile("phase.txt","simulation returned");\ngetErrorString();\n`);
  const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
    '--available-mib','16384','--log',path.join(directory,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9',
    'env','OMP_NUM_THREADS=1',`TMPDIR=${directory}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
  fs.writeFileSync(path.join(directory,'command.json'),JSON.stringify(command,null,2)+'\n');
  const result=spawnSync(process.execPath,command,{cwd:directory,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(directory,'resources.json'),result.stdout??'');
  const log=fs.readFileSync(path.join(directory,'semantics.log'),'utf8');
  const file=path.join(directory,`${caseModel}_res.csv`);
  let checks=[],modelResult=null;
  if(fs.existsSync(file)){
    const raw=fs.readFileSync(file,'utf8'),lines=raw.trim().split(/\r?\n/);
    const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
    const lexicalValid=lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
    const rows=lines.slice(1).map(line=>line.split(',').map(Number));
    const checkNames=Array.from({length:checkCount},(_,index)=>`checks[${index+1}]`);
    const expected=['time',...checkNames,'scenario'];
    const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name));
    const timeIndex=columns.indexOf('time'),scenarioIndex=columns.indexOf('scenario'),indices=checkNames.map(name=>columns.indexOf(name));
    const rowsValid=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length
      &&Number.isFinite(row[timeIndex])&&row[scenarioIndex]===scenario&&indices.every(index=>row[index]===0||row[index]===1))
      &&rows[0][timeIndex]===0&&rows.at(-1)[timeIndex]===stopTime;
    if(rowsValid)checks=indices.map(index=>rows.every(row=>row[index]===1));
    modelResult={path:path.relative(output,file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
      simulationSucceeded:log.includes('The simulation finished successfully.')};
  }
  const pass=result.status===0&&checks.length===checkCount&&checks.every(Boolean)&&modelResult?.simulationSucceeded===true;
  cases.push({scenario,pass,checks,failedChecks:checks.flatMap((passed,i)=>passed?[]:[i+1]),modelResult,processStatus:result.status,signal:result.signal});
  console.log(JSON.stringify({directory,scenario,pass,processStatus:result.status,failedChecks:cases.at(-1).failedChecks}));
  if(!pass)break;
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const allCasesObserved=cases.length===caseCount&&new Set(cases.map(value=>value.scenario)).size===caseCount;
const selectedPass=bookendsEqual&&cases.length===requested.length&&cases.every(value=>value.pass);
const pass=selectedPass&&allCasesObserved;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':selectedPass?'PARTIAL_CONTROLS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Actual RGBDInertialLocalizationInitialize equation-model core, full90x160RGBA/depth and350 selected domain:28 constant independent input controls; nonuniform calibrated raw images, three enabled features incl350, independent descriptor/optical/world-point oracles, moving estimated nominal, full15/cross/reference prior and singular21clone, all snapshot metadata, no IMU prediction, time/prior/config/domain/consumed-image refusals. FAST/enclosing/browser unqualified.',
  compilerVersion:version.stdout.trim(),backend,debugFlags,commandLineOptions,sources,bookendsEqual,requested,allCasesObserved,cases,
  rumocaArtifactIssued:false,browserIntegrated:false,referenceCoreInitializerQualified:pass,
  fastInitializerQualified:false,enclosingCompositionQualified:false,productionInitializerIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-localization-initialize-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true}); fs.copyFileSync(path.join(output,'report.json'),path.join(durable,'report.json'));
fs.cpSync(frozen,path.join(durable,'source-preimages'),{recursive:true});
for(const value of cases){
  const sourceDirectory=path.join(output,`case-${value.scenario}`),targetDirectory=path.join(durable,`case-${value.scenario}`);
  fs.mkdirSync(targetDirectory);
  for(const name of ['semantics.log','resources.json','command.json','phase.txt','localization-initialize.mos',`${model}Case${value.scenario}_res.csv`]){
    const source=path.join(sourceDirectory,name); if(fs.existsSync(source))fs.copyFileSync(source,path.join(targetDirectory,name));
  }
}
console.log(JSON.stringify({directory:output,...report})); process.exitCode=selectedPass?0:1;
