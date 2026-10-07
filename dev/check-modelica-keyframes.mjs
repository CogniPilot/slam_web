// Differential Modelica semantics only: OMC never supplies application execution.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.env.MODELICA_KEYFRAME_CHECK_MODE??'native';
if(!['native','interpreter','model'].includes(mode))throw Error('Unknown differential check mode');
const scope=process.env.MODELICA_KEYFRAME_CHECK_SCOPE??'catalog';
if(!['catalog','initialization'].includes(scope)||scope==='initialization'&&mode!=='model')
  throw Error('Initialization equivalence requires model mode');
const checkCount=scope==='initialization'?3:20;
const model=scope==='initialization'?'RGBDKeyframeInitializationAcceptance':'RGBDKeyframeAcceptance';
const output=process.env.MODELICA_KEYFRAME_CHECK_DIRECTORY
  ??fs.mkdtempSync(path.join(os.homedir(),'scratch/slam_web/tmp/keyframe-semantics-'));
fs.mkdirSync(output,{recursive:true});
const names=['models/Estimation/Localization/RGBDRegistrationUncertainty.mo','models/LoopClosure/RGBDKeyframes.mo'];
if(scope==='initialization')names.push('tests/modelica/RGBDKeyframesInitializationReference.mo',
  'tests/modelica/RGBDKeyframeInitializationTests.mo','tests/modelica/RGBDKeyframeInitializationAcceptance.mo');
else {
  names.push('tests/modelica/RGBDKeyframeTests.mo');
  if(mode==='model')names.push('tests/modelica/RGBDKeyframeAcceptance.mo');
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
// Modelica string escaping, not shell interpolation.
const quoted=value=>'"'+value.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
const script=path.join(output,'keyframes.mos');
const flags=mode==='model'?'gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize':mode==='native'
  ?'gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandOperations,-nfScalarize'
  :'evalfunc,-gen,nfEvalConstArgFuncs,-nfExpandOperations,-nfScalarize';
fs.writeFileSync(script,`setDebugFlags("${flags}");\n`
  +names.map(name=>`loadFile(${quoted(path.join(app,name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","loaded");\n'
  +(mode==='native'?'generateCode(RGBDKeyframeTests.Run);\ngetErrorString();\n':'')
  +'writeFile("phase.txt","execution requested");\n'
  +(mode==='model'?`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv");\ngetErrorString();\n`:
  'print("KEYFRAME_RESULT_BEGIN\\n");\n'
  +'RGBDKeyframeTests.Run(1);\nprint("KEYFRAME_RESULT_END\\n");\ngetErrorString();\n'));
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120',
  '--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),'--',
  'nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resource.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const section=log.split('KEYFRAME_RESULT_BEGIN')[1]?.split('KEYFRAME_RESULT_END')[0]??'';
const matched=section.match(/\{((?:true|false)(?:,\s*(?:true|false))*)\}/);
let controls=matched?matched[1].split(',').map(value=>value.trim()==='true'):[];
let modelResult=null;
if(mode==='model'){
  const filename=`${model}_res.csv`;
  const file=path.join(output,filename);
  if(fs.existsSync(file)){
    const raw=fs.readFileSync(file,'utf8');
    const lines=raw.trim().split(/\r?\n/);
    const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
    const rows=lines.slice(1).map(line=>line.split(',').map(Number));
    const checkNames=Array.from({length:checkCount},(_,index)=>`checks[${index+1}]`);
    const expected=['time',...checkNames,...(scope==='initialization'?['slotsValidated']:[])];
    const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length
      &&expected.every(name=>columns.includes(name));
    const time=columns.indexOf('time');
    const rowsValid=columnsValid&&rows.length>=2&&rows.every(row=>row.length===expected.length&&Number.isFinite(row[time])
      &&checkNames.every(name=>row[columns.indexOf(name)]===0||row[columns.indexOf(name)]===1)
      &&(scope!=='initialization'||row[columns.indexOf('slotsValidated')]===3*128))
      &&rows[0][time]===0&&rows.at(-1)[time]===0.001;
    if(columnsValid&&rowsValid)controls=checkNames.map(name=>rows.every(row=>row[columns.indexOf(name)]===1));
    modelResult={path:filename,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
      simulationSucceeded:log.includes('The simulation finished successfully.')};
  }
}
const unchanged=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const passed=result.status===0&&unchanged&&controls.length===checkCount&&controls.every(Boolean)
  &&(mode!=='model'||modelResult?.simulationSucceeded===true);
const report={status:passed?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:scope==='initialization'?'All128 slots and entire350x49 payload against frozen pre-optimization empty-frame contract, three generation/vocabulary configurations'
    :'full128-slot Modelica catalog and sparse350-feature payload; OMC differential semantics only',
  compilerVersion:version.stdout.trim(),mode,compilerFlags:flags,sources,bookendsEqual:unchanged,flags:controls,modelResult,
  lastPhase:fs.existsSync(path.join(output,'phase.txt'))?fs.readFileSync(path.join(output,'phase.txt'),'utf8'):null,
  processStatus:result.status,signal:result.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=passed?0:1;
