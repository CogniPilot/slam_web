// Independent reference semantics for loop-anchored capture under forced eviction. The flag is a
// constant that defaults off, so this loads a staged copy of RGBDGraphMeasurements.mo with it on.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'loop-anchor-eviction-semantics-'));
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
  "tests/modelica/RGBDKeyframeTests.mo",
  "tests/modelica/RGBDKeyframeRetrievalTests.mo",
  "tests/modelica/RGBDLoopVerificationTests.mo",
  "tests/modelica/RGBDCatalogLoopTests.mo",
  "models/Optimization/RGBDGraphMeasurements.mo",
  "tests/modelica/RGBDGraphMeasurementTests.mo",
  "tests/modelica/RGBDLoopAnchorEvictionTests.mo",
  "tests/modelica/RGBDLoopAnchorEvictionAcceptance.mo"
];
const flagged='models/Optimization/RGBDGraphMeasurements.mo',flagOff='constant Boolean loopAnchoredCapture = false;';
const original=fs.readFileSync(path.join(app,flagged),'utf8');
if(original.split(flagOff).length!==2)throw Error('expected exactly one '+flagOff);
const staged=path.join(output,'RGBDGraphMeasurements.mo');
fs.writeFileSync(staged,original.replace(flagOff,'constant Boolean loopAnchoredCapture = true;'));
const load=name=>name===flagged?staged:path.join(app,name);
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-loop-anchor-eviction.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'loop-anchor-eviction.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +names.map(name=>`loadFile(${JSON.stringify(load(name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +'simulate(RGBDLoopAnchorEvictionAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv");\ngetErrorString();\n');
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
const file=path.join(output,'RGBDLoopAnchorEvictionAcceptance_res.csv');
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8');
  const lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const lexicalValid=lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time',...Array.from({length:8},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&columns.every((value,index)=>value===expected[index]);
  const rowsValid=lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length&&Number.isFinite(row[0])
    &&row.slice(1).every(value=>value===0||value===1))&&rows[0][0]===0&&rows.at(-1)[0]===0.001;
  if(columnsValid&&rowsValid)checks=expected.slice(1).map((_,index)=>rows.every(row=>row[index+1]===1));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&checks.length===8&&checks.every(Boolean)&&modelResult?.simulationSucceeded===true;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Full 64-slot catalog, flag on: keyframe 64 anchored by loops from ids 1 and 2 with no consecutive edge; evicting 1 keeps it attached, evicting 2 detaches ids 3-63; the gauge moves to 64, detachedNodes counts 61, the solve holds only the newest component, and five later captures are admitted',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  flagOnStaged:true,referenceGraphAdmissionQualified:pass,productionGraphAdmissionIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
