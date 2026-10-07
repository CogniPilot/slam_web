// Independent reference semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv.length>3||process.argv[2]!==undefined&&process.argv[2]!=='--tracking')
  throw Error('Usage: node dev/check-modelica-catalog-frame.mjs [--tracking]');
const tracking=process.argv[2]==='--tracking';
const model=tracking?'RGBDCatalogFrameTrackingAcceptance':'RGBDCatalogFrameAcceptance';
const checkCount=tracking?5:6;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'catalog-frame-semantics-'));
const names=[
  "models/Estimation/Localization/RGBDRegistrationUncertainty.mo",
  "models/LoopClosure/RGBDKeyframes.mo",
  "models/LoopClosure/RGBDBagOfWords.mo",
  "models/LoopClosure/RGBDKeyframeRetrieval.mo",
  "models/Vision/Matching/RGBDFeatureMatching.mo",
  "models/Math/RigidPointRegistration.mo",
  "models/LoopClosure/RGBDBodyRelativeEdge.mo",
  "models/LoopClosure/RGBDLoopVerification.mo",
  "models/Optimization/ModelicaPoseGraph.mo",
  "models/LoopClosure/RGBDCatalogLoopVerification.mo",
  "models/Optimization/RGBDGraphMeasurements.mo",
  "models/Optimization/RGBDCatalogGraphCapture.mo",
  "models/Mapping/RGBDSpatialIndex.mo",
  "models/Mapping/RGBDLandmarkMap.mo",
  "models/Mapping/RGBDMapAnchors.mo",
  "models/Mapping/RGBDMapAnchorAssignment.mo",
  "models/Mapping/RGBDAnchoredLandmarkMap.mo",
  "models/Mapping/RGBDLandmarkCatalog.mo",
  "models/Mapping/RGBDLandmarkProjection.mo",
  "models/Mapping/RGBDCatalogMapping.mo",
  "models/Mapping/RGBDKeyframeLandmarks.mo",
  "models/Mapping/RGBDCatalogObservation.mo",
  "models/LoopClosure/RGBDKeyframePolicy.mo",
  "models/Mapping/RGBDCatalogFrame.mo",
  "tests/modelica/RGBDCatalogFrameTests.mo",
  "tests/modelica/RGBDCatalogObservationTests.mo",
  "tests/modelica/RGBDGraphMeasurementTests.mo",
  "tests/modelica/RGBDCatalogMappingTests.mo",
  "tests/modelica/RGBDCatalogGraphTests.mo",
  "tests/modelica/RGBDKeyframeTests.mo",
  "tests/modelica/RGBDKeyframeRetrievalTests.mo",
  "tests/modelica/RGBDLoopVerificationTests.mo",
  "tests/modelica/RGBDCatalogLoopTests.mo",
  ...(tracking?[
    'models/Estimation/Inertial/SchmidtReferenceState.mo',
    'models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo',
    'models/Estimation/Localization/RGBDLocalizationFrame.mo',
    'models/Estimation/Localization/RGBDLocalizationCatalog.mo',
    'tests/modelica/RGBDLocalizationCatalogTests.mo'
  ]:[]),
  tracking?'tests/modelica/RGBDCatalogFrameTrackingTests.mo':`tests/modelica/${model}.mo`
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-catalog-frame.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'catalog-frame.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const file=path.join(output,`${model}_res.csv`);
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8');
  const lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const lexicalValid=lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time',...Array.from({length:checkCount},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&columns.every((value,index)=>value===expected[index]);
  const rowsValid=lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length&&Number.isFinite(row[0])
    &&row.slice(1).every(value=>value===0||value===1))&&rows[0][0]===0&&rows.at(-1)[0]===0.001;
  if(columnsValid&&rowsValid)checks=expected.slice(1).map((_,index)=>rows.every(row=>row[index+1]===1));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&checks.length===checkCount&&checks.every(Boolean)&&modelResult?.simulationSucceeded===true;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:tracking?'Actual full-capacity Advance after failed rigid consensus: retained catalog/graph, admitted map observation with old anchor, refusal receipts, and corrupted-candidate rollback. No browser/WASM qualification.':'Actual Advance function full128/256/350/14400/96:two noncaptureimages with poisoned capture-only parameters, fullvisualcapture+maponce, late map failure, stale mapepoch and stale graph wholeowner holds. PublicFrameStep projection not qualified',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  referenceFrameFunctionQualified:pass,publicFrameStepQualified:false,productionFrameIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-catalog-frame-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','catalog-frame.mos',`${model}_res.csv`]){
  const source=path.join(output,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
