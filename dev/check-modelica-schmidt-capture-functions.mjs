// Actual full-dimension equation-model/function parity; no runtime admission claim.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'schmidt-capture-functions-'));
const model='SchmidtCaptureFunctionParity',count=4;
const names=['models/Estimation/Localization/RGBDRelativePose.mo','models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo',
  'models/Estimation/Inertial/ES15NominalPrediction.mo','models/Estimation/Inertial/ES15Dynamics.mo','models/Estimation/Inertial/ES15CovariancePrediction.mo',
  'models/Estimation/Inertial/SchmidtReferenceState.mo','tests/modelica/SchmidtCaptureFunctionParity.mo'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceNames=[...names,'dev/check-modelica-schmidt-capture-functions.mjs'];
const identities=()=>sourceNames.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
const sources=identities();
for(const name of sourceNames){const dest=path.join(output,'sources',name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(app,name),dest);}
const script=path.join(output,'parity.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(p=>`loadFile(${JSON.stringify(path.join(output,'sources',p))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=20,numberOfIntervals=80,outputFormat="csv",variableFilter="checks.*|captureScenario|pairScenario");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8'});
if(version.status!==0)throw Error('OMC_BIN must identify OpenModelica: '+version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','4,5',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const execution=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),execution.stdout??'');
fs.writeFileSync(path.join(output,'guardian.stderr'),execution.stderr??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const csv=path.join(output,`${model}_res.csv`);
let checks=[],csvResult=null;
if(fs.existsSync(csv)){
  const raw=fs.readFileSync(csv,'utf8'),lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const expected=['time','captureScenario','pairScenario',...Array.from({length:count},(_,i)=>`checks[${i+1}]`)];
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const columnsValid=columns.length===expected.length&&expected.every(name=>columns.includes(name));
  const timeColumn=columns.indexOf('time'),scenarioColumn=columns.indexOf('captureScenario'),pairColumn=columns.indexOf('pairScenario');
  const checkColumns=Array.from({length:count},(_,i)=>columns.indexOf(`checks[${i+1}]`));
  const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const scenarios=[...new Set(rows.map(row=>row[scenarioColumn]))].sort((a,b)=>a-b);
  const pairScenarios=[...new Set(rows.map(row=>row[pairColumn]))].sort((a,b)=>a-b);
  const rowsValid=rows.length>=81&&lines.slice(1).every(line=>line.split(',').every(value=>numeric.test(value)))
    &&rows.every(row=>row.length===count+3&&Number.isFinite(row[timeColumn])&&row[timeColumn]>=0&&row[timeColumn]<=20
      &&checkColumns.every(index=>row[index]===0||row[index]===1)&&Number.isInteger(row[scenarioColumn])&&Number.isInteger(row[pairColumn]))
    &&rows[0][timeColumn]===0&&rows.at(-1)[timeColumn]===20
    &&JSON.stringify(scenarios)===JSON.stringify(Array.from({length:18},(_,i)=>i+1))
    &&JSON.stringify(pairScenarios)===JSON.stringify(Array.from({length:20},(_,i)=>i+1));
  if(columnsValid&&rowsValid)checks=checkColumns.map(index=>rows.every(row=>row[index]===1));
  csvResult={path:path.basename(csv),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,
    scenarios,pairScenarios,simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const after=identities(),bookendsEqual=JSON.stringify(sources)===JSON.stringify(after);
const pass=execution.status===0&&bookendsEqual&&checks.length===count&&checks.every(Boolean)&&csvResult?.simulationSucceeded;
const report={schemaVersion:1,status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Pure SchmidtCaptureReference and SchmidtImagePairEligibility versus live byte-unchanged equation models. Dynamic18capture and20pair scenarios; full15+6 covariance225/cross90/reference36 entries, valid clone/source tangents, available/unavailable/disabled/invalid/limit/metadata/reused configurations. No Rumoca, browser or actual localization qualification.',
  compilerVersion:version.stdout.trim(),sources,after,bookendsEqual,checks,csvResult,processStatus:execution.status,
  signal:execution.signal,rumocaCompilerInvoked:false,browserIntegrated:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-schmidt-capture-functions',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['sources','report.json','semantics.log','resources.json','guardian.stderr','command.json','parity.mos',`${model}_res.csv`])
  if(fs.existsSync(path.join(output,name)))fs.cpSync(path.join(output,name),path.join(durable,name),{recursive:true});
console.log(JSON.stringify({directory:output,durable,status:report.status,checks,csvResult,bookendsEqual,processStatus:execution.status}));
process.exitCode=pass?0:1;
