// Independent Modelica semantics only; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'keyframe-landmark-semantics-'));
const names=['models/Estimation/Localization/RGBDRegistrationUncertainty.mo','models/LoopClosure/RGBDKeyframes.mo','models/Mapping/RGBDSpatialIndex.mo',
  'models/Mapping/RGBDLandmarkMap.mo','models/Mapping/RGBDMapAnchors.mo','models/Mapping/RGBDMapAnchorAssignment.mo',
  'models/Mapping/RGBDAnchoredLandmarkMap.mo','models/Mapping/RGBDLandmarkCatalog.mo','models/Mapping/RGBDKeyframeLandmarks.mo',
  'tests/modelica/RGBDKeyframeTests.mo','tests/modelica/RGBDKeyframeLandmarkTests.mo',
  'tests/modelica/RGBDKeyframeLandmarkAcceptance.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'keyframe-landmarks.mos');
const flags=process.env.MODELICA_KEYFRAME_LANDMARK_FLAGS
  ??'gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
// Reference semantics can use an unoptimized C build without changing the
// authored Modelica, dimensions or cases. This is never a throughput result.
const referenceCFlags=process.env.MODELICA_KEYFRAME_LANDMARK_CFLAGS??null;
const perfBinary=process.env.MODELICA_KEYFRAME_LANDMARK_PERF??null;
const profilePath=perfBinary===null?null:path.join(output,'reference-build.perf.data');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(flags)});\n`
  +(referenceCFlags===null?'':`setCFlags(getCFlags()+" "+${JSON.stringify(referenceCFlags)});\n`)
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +'simulate(RGBDKeyframeLandmarkAcceptance,stopTime=0.001,numberOfIntervals=1,outputFormat="csv");\ngetErrorString();\n');
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--',
  ...(perfBinary===null?[]:[perfBinary,'record','--freq','99','--call-graph','dwarf,4096',
    '--switch-output=20s','--switch-max-files=8','-o',profilePath,'--']),
  'nice','-n','15','taskset','-c','6,7',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const file=path.join(output,'RGBDKeyframeLandmarkAcceptance_res.csv');
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8');
  const lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time','slotsValidated',...Array.from({length:16},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name));
  const time=columns.indexOf('time'),visited=columns.indexOf('slotsValidated');
  const rowsValid=columnsValid&&rows.length>=2&&rows.every(row=>row.length===expected.length
    &&Number.isFinite(row[time])&&row[visited]===16*14400
    &&expected.slice(2).every(name=>row[columns.indexOf(name)]===0||row[columns.indexOf(name)]===1))
    &&rows[0][time]===0&&rows.at(-1)[time]===0.001;
  if(rowsValid)checks=expected.slice(2).map(name=>rows.every(row=>row[columns.indexOf(name)]===1));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&checks.length===16&&checks.every(Boolean)&&modelResult?.simulationSucceeded===true;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Full14400 map / 350 features / 128 catalog nodes: coupled capture/map commit, sparse final slots, eviction before matching, whole catalog/map rollback, reset, projection/epoch/vocabulary binding and no-capture frames',
  compilerVersion:version.stdout.trim(),flags,referenceCFlags,profilePath,sources,bookendsEqual,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  estimatorGraphCommit:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
