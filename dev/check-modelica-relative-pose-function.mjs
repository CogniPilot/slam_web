import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'rgbd-relative-pose-function-'));
const model='RGBDRelativeBodyPoseFunctionAcceptance',caseCount=18,checkCount=5,stop=(caseCount-0.5)/64;
const names=['models/RGBDRelativePose.mo','tests/modelica/RGBDRelativeBodyPoseFunctionAcceptance.mo'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const sources=[...names,'dev/check-modelica-relative-pose-function.mjs','dev/rumoca-bounded-run.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const script=path.join(output,'relative-pose.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\nsetCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=${stop},numberOfIntervals=${caseCount*8-4},outputFormat="csv",variableFilter="scenario|checks.*|raw.*",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const file=path.join(output,`${model}_res.csv`);let csv=null,cases=[];
if(fs.existsSync(file)){
  const text=fs.readFileSync(file,'utf8'),lines=text.trim().split(/\r?\n/);
  const columns=Array.from(lines[0].matchAll(/"([^"]*)"|([^,]+)/g),m=>m[1]??m[2]);
  const expected=['time','scenario','rawValid',...Array.from({length:5},(_,i)=>`checks[${i+1}]`),
    ...Array.from({length:3},(_,i)=>`rawPosition[${i+1}]`),...Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>`rawRotation[${i+1},${j+1}]`)).flat()];
  const index=new Map(columns.map((n,i)=>[n,i]));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const lexical=lines.slice(1).every(line=>line.split(',').every(x=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(x)));
  const columnsValid=columns.length===expected.length&&index.size===expected.length&&expected.every(n=>index.has(n));
  const rowsValid=columnsValid&&lexical&&rows.length>caseCount&&rows.every(row=>row.length===columns.length&&row.every(Number.isFinite)
    &&Number.isInteger(row[index.get('scenario')])&&row[index.get('scenario')]>=1&&row[index.get('scenario')]<=caseCount
    &&Array.from({length:checkCount},(_,i)=>row[index.get(`checks[${i+1}]`)]).every(x=>x===0||x===1))
    &&rows[0][index.get('time')]===0&&rows.at(-1)[index.get('time')]===stop;
  if(rowsValid)cases=Array.from({length:caseCount},(_,i)=>{const selected=rows.filter(r=>r[index.get('scenario')]===i+1);
    return {scenario:i+1,rows:selected.length,checks:Array.from({length:checkCount},(_,j)=>selected.length>0&&selected.every(r=>r[index.get(`checks[${j+1}]`)]===1))};});
  csv={path:path.basename(file),sha256:sha(text),columnsValid,rowsValid,rows:rows.length};
}
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256);
const pass=result.status===0&&bookendsEqual&&log.includes('The simulation finished successfully.')&&cases.length===caseCount&&cases.every(c=>c.checks.every(Boolean));
const report={status:pass?'OMC_RELATIVE_BODY_POSE_FUNCTION_MODEL_PARITY_PASS':'FAILED_OR_INCOMPLETE',sources,bookendsEqual,cases,csv,processStatus:result.status,signal:result.signal,
  scope:'18dynamiccases, original unchanged equation RGBDRelativePose versus pure function, general proper rotations, optical mount/origin, invalid masks/rotations/coordinates, nonfinite and output-overflow rejection, tolerance and recovery.2e-13relative/absolute coordinate comparison.',
  originalVisualRelativeEquationModelQualified:false,rumocaArtifactIssued:false,browserQualified:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/rgbd-relative-function',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','relative-pose.mos',`${model}_res.csv`]){const from=path.join(output,name);if(fs.existsSync(from))fs.copyFileSync(from,path.join(durable,name));}
for(const name of names){const to=path.join(durable,'source-preimages',name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(app,name),to);}
console.log(JSON.stringify({directory:output,report:path.join(durable,'report.json'),...report}));process.exitCode=pass?0:1;
