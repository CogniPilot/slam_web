// Reference only: durable accepted-step metadata, never a runtime compiler.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='RGBDGraphCaptureLedgerAcceptance',count=16;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'graph-capture-ledger-semantics-'));
const names=['models/RGBDRegistrationUncertainty.mo','models/RGBDKeyframes.mo',
  'models/RGBDGraphCaptureLedger.mo','tests/modelica/RGBDGraphCaptureLedgerTests.mo',
  'tests/modelica/RGBDGraphCaptureLedgerAcceptance.mo'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const sources=[...names,'dev/check-modelica-graph-capture-ledger.mjs'].map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
const script=path.join(output,'graph-capture-ledger.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(p=>`loadFile(${JSON.stringify(path.join(app,p))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=0.125,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8'});if(version.status!==0)throw Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const processResult=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),processResult.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8'),file=path.join(output,`${model}_res.csv`);
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8'),lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(v=>v.replace(/^"|"$/g,''));
  const expected=['time',...Array.from({length:count},(_,i)=>`checks[${i+1}]`)];
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const columnsValid=columns.length===expected.length&&columns.every((v,i)=>v===expected[i]);
  const rowsValid=rows.length===3&&lines.slice(1).every(line=>line.split(',').every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)))
    &&rows.every(row=>row.length===expected.length&&Number.isFinite(row[0])&&row[0]>=0&&row[0]<=0.125&&row.slice(1).every(v=>v===0||v===1))
    &&rows[0][0]===0&&rows.at(-1)[0]===0.125;
  if(columnsValid&&rowsValid)checks=Array.from({length:count},(_,i)=>rows.every(row=>row[i+1]===1));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256);
const pass=processResult.status===0&&bookendsEqual&&checks.length===count&&checks.every(Boolean)&&modelResult?.simulationSucceeded;
const report={status:pass?'OMC_MODELICA_SEMANTICS_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Full128-slot metadata ownership; actual Catalog header admission, capture129/ring reuse with separate camera epoch/acceptedstep, noncapture step, time0firstcapture, malformed/restored metadata and exact disabled/refusal hold. Not raw-frame admission or browser session qualification.',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,modelResult,processStatus:processResult.status,
  rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-graph-capture-ledger-semantics',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','graph-capture-ledger.mos',`${model}_res.csv`]){
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
}
console.log(JSON.stringify({directory:output,status:report.status,checks,modelResult,bookendsEqual,processStatus:processResult.status}));
process.exitCode=pass?0:1;
