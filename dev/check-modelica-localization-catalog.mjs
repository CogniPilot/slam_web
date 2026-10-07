// Independent reference semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='RGBDLocalizationCatalogAcceptance';
const checkCount=24;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'localization-catalog-semantics-'));
const names=[
  "models/RGBDRegistrationUncertainty.mo",
  "models/RGBDKeyframes.mo",
  "models/RGBDBagOfWords.mo",
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
  `tests/modelica/${model}.mo`
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-localization-catalog.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const script=path.join(output,'localization-catalog.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','4,5',
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
  scope:'Controlled accepted-estimator Publish proposals full350/49/15+6/128/256/14400/96: original19 controls retained, plus actual CanAdvance30Hz/.2/zero/negative/overbound/discontinuity/idle and unchanged initialization; no-image controlled Publish30Hz/.2 and overbound whole-State refusal. Actual localization/prediction/frontend/public model not executed or qualified.',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  referencePublishControlledProposalsQualified:pass,actualLocalizationProducerExecuted:false,publicLocalizationCatalogModelQualified:false,productionLocalizationCatalogIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-localization-catalog-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','localization-catalog.mos',`${model}_res.csv`]){
  const source=path.join(output,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
