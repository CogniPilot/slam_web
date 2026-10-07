// Independent reference semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='RGBDGraphProcessingAcceptance';
const checkCount=31;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'graph-processing-semantics-'));
const names=[
  "models/RGBDRegistrationUncertainty.mo",
  "models/RGBDKeyframes.mo",
  "models/RGBDBagOfWords.mo",
  "models/RGBDVisualVocabulary.mo",
  "models/RGBDKeyframeRetrieval.mo",
  "models/RGBDFeatureMatching.mo",
  "models/RigidPointRegistration.mo",
  "models/RGBDBodyRelativeEdge.mo",
  "models/RGBDLoopVerification.mo",
  "models/ModelicaPoseGraph.mo",
  "models/RGBDCatalogLoopVerification.mo",
  "models/RGBDGraphMeasurements.mo",
  "models/RGBDCatalogGraphCapture.mo",
  "models/RGBDSpatialIndex.mo",
  "models/RGBDLandmarkMap.mo",
  "models/RGBDMapAnchors.mo",
  "models/RGBDMapAnchorAssignment.mo",
  "models/RGBDAnchoredLandmarkMap.mo",
  "models/RGBDLandmarkCatalog.mo",
  "models/RGBDLandmarkProjection.mo",
  "models/RGBDCatalogMapping.mo",
  "models/RGBDKeyframeLandmarks.mo",
  "models/RGBDCatalogObservation.mo",
  "models/RGBDKeyframePolicy.mo",
  "models/RGBDCatalogFrame.mo",
  "models/SchmidtReferenceState.mo",
  "models/SchmidtRelativePoseCorrection.mo",
  "models/RGBDLocalizationFrame.mo",
  "models/RGBDLocalizationCatalog.mo",
  "models/GraphGaugeUncertainty.mo",
  "models/SchmidtGraphPoseCorrection.mo",
  "models/RGBDGraphEstimatorCommit.mo",
  "tests/modelica/GraphGaugeUncertaintyTests.mo",
  "tests/modelica/SchmidtGraphPoseCorrectionTests.mo",
  "tests/modelica/RGBDGraphEstimatorCommitTests.mo",
  "tests/modelica/RGBDLocalizationCatalogTests.mo",
  "tests/modelica/RGBDCatalogFrameTests.mo",
  "tests/modelica/RGBDCatalogObservationTests.mo",
  "tests/modelica/RGBDGraphMeasurementTests.mo",
  "tests/modelica/RGBDCatalogMappingTests.mo",
  "tests/modelica/RGBDCatalogGraphTests.mo",
  "tests/modelica/RGBDKeyframeTests.mo",
  "tests/modelica/RGBDKeyframeRetrievalTests.mo",
  "tests/modelica/RGBDLoopVerificationTests.mo",
  "tests/modelica/RGBDCatalogLoopTests.mo",
  "models/ModelicaPoseGraphCovariance.mo",
  "models/RGBDGraphCaptureLedger.mo",
  "models/RGBDGraphAnchorBound.mo",
  "models/RGBDGraphSelectedGauge.mo",
  "models/RGBDGraphProcessing.mo",
  "tests/modelica/RGBDGraphCaptureLedgerTests.mo",
  "tests/modelica/RGBDGraphAnchorBoundTests.mo",
  "tests/modelica/RGBDGraphProcessingTests.mo",
  `tests/modelica/${model}.mo`
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-graph-processing.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'graph-processing.mos');
const frozen=path.join(output,'sources');fs.mkdirSync(frozen,{recursive:true});
for(const item of sources){const target=path.join(frozen,item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,item.path),target);}
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.125,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7',
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
    &&row.slice(1).every(value=>value===0||value===1))&&rows[0][0]===0&&rows.at(-1)[0]===0.125;
  if(columnsValid&&rowsValid)checks=expected.slice(1).map((_,index)=>rows.every(row=>row[index+1]===1));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&checks.length===checkCount&&checks.every(Boolean)&&modelResult?.simulationSucceeded===true;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Actual PrepareProblem/durable corrected warm-start/optimizer/captured anchor/typed selected covariance and full21 atomic filter/map composition. Full128/256/350/14400 controlled chain and loop graph, distinct and same-capture cases, immutable raw owners, full-map geometry and late rejection/replay. Default48 covariance iterations on success; explicit zero-PCG conservative tree bound in rollback-isolation cases. Not actual camera producer, full graph convergence gate, Rumoca WASM or browser SLAM.',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  referenceGraphProcessingQualified:pass,actualLocalizationProducerExecuted:false,publicLocalizationCatalogModelQualified:false,productionLocalizationCatalogIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-graph-processing-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
fs.cpSync(frozen,path.join(durable,'sources'),{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','graph-processing.mos',`${model}_res.csv`]){
  const source=path.join(output,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
console.log(JSON.stringify({directory:output,status:report.status,checks,modelResult,bookendsEqual,processStatus:result.status}));
process.exitCode=pass?0:1;
