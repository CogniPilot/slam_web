// Independent reference semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contextMode=process.argv[2]==='--context';
const cloneMode=process.argv[2]==='--clone';
const anchorMode=process.argv[2]==='--anchor';
if(!['','--context','--clone','--anchor'].includes(process.argv[2]??'')||process.argv.length>((contextMode||cloneMode||anchorMode)?3:2))
  throw Error('Usage: check-modelica-graph-selected-gauge.mjs [--context|--clone|--anchor]');
const model=contextMode?'RGBDGraphSelectedGaugeContextAcceptance':cloneMode?'RGBDGraphSelectedGaugeCloneAcceptance':anchorMode?'RGBDGraphSelectedGaugeAnchorAcceptance':'RGBDGraphSelectedGaugeAcceptance';
const checkCount=contextMode?16:cloneMode?20:anchorMode?24:60;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,contextMode?'graph-selected-gauge-context-':cloneMode?'graph-selected-gauge-clone-':anchorMode?'graph-selected-gauge-anchor-':'graph-selected-gauge-semantics-'));
const names=[
  "models/Estimation/Localization/RGBDRegistrationUncertainty.mo",
  "models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo",
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
  "models/Optimization/ModelicaPoseGraphCovariance.mo",
  "models/Optimization/GraphGaugeUncertainty.mo",
  "models/Estimation/Inertial/SchmidtGraphPoseCorrection.mo",
  "models/Optimization/RGBDGraphCaptureLedger.mo",
  "models/Optimization/RGBDGraphAnchorBound.mo",
  "models/Optimization/RGBDGraphSelectedGauge.mo",
  ...(contextMode?[
    "tests/modelica/RGBDGraphSelectedGaugeContextTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeContextAcceptance.mo"
  ]:cloneMode?[
    "tests/modelica/GraphGaugeUncertaintyTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeContextTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeCloneTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeCloneAcceptance.mo"
  ]:anchorMode?[
    "tests/modelica/GraphGaugeUncertaintyTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeAnchorTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeAnchorAcceptance.mo"
  ]:[
    "tests/modelica/GraphGaugeUncertaintyTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeTests.mo",
    "tests/modelica/RGBDGraphSelectedGaugeAcceptance.mo"
  ])
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-graph-selected-gauge.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'graph-selected-gauge.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11',
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
  scope:contextMode?'Capture context factory invokes actual durable Ledger.Valid, copies catalog-bound IDs/accepted-birth-step sequences and actual graph/pose revision metadata. Full128 wrapped and partial inactive-poison catalogs; complete Context holds on disabled/refusal. Does not call selected covariance or validate graph factors; SelectAndTransport retains that owner. Not session integration or provenance authentication'
    :cloneMode?'Same-capture adapter retains one shared six-dimensional graph error in both selected rows, all144 covariance entries and nonzero uncertain-anchor transport. Actual SameCapture/ValidBinding plus Transport duplicate consistency; full128/256 and partial inactive poison, signed unknown-cross Gram extremes, metadata/ledger identity refusals and whole Estimate/Context holds. Independent finite-difference chart oracle, existing solver invoked separately; no correction/session/browser or independent graph convergence qualification'
    :anchorMode?'Typed retained anchor Estimate produced by actual FromCapture and matched to actual oldest catalog slot, Context, Binding and final anchor mean before actual selected-gauge adapter. First-order error SECOND MOMENT, not centered/global covariance. Full128/256 plus partial and same-capture/anchor-endpoint cases, all144-cell independent finite-difference transport oracle, every anchor metadata field/wrong mean/late PSD/disabled complete Estimate holds. Existing covariance solver invoked separately; no statistical-input, session/browser or independent convergence qualification'
    :'Full128 occupied wrapped catalog /256 active measured factors through actual PrepareProblem and actual selected covariance, then full144-cell gauge conversion and uncertain-anchor transport. Independent finite-difference composition oracle for adapter chart; solver is independently invoked, not independently reimplemented in this gate. Complete identity/sequence/time/provenance/refusal/disabled holds and inactive poison; signed unknown-cross Gram extremes. Explicit caller-owned Context and anchor-bound provenance, not durable-session or statistical certification',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,failureIndices:checks.flatMap((passed,index)=>passed?[]:[index+1]),
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  referenceSelectedGraphGaugeAdapterQualified:!contextMode&&pass,sequenceLedgerContextQualified:contextMode&&pass,
  referenceSameCaptureAdapterQualified:cloneMode&&pass,
  referenceTypedAnchorAdapterQualified:anchorMode&&pass,
  callerBoundsCertified:false,sessionSequenceLedgerIntegrated:false,roundoffCertified:false,independentCovarianceSolverQualified:false,productionGraphCorrectionIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-graph-selected-gauge-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','graph-selected-gauge.mos',`${model}_res.csv`]){
  const source=path.join(output,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
