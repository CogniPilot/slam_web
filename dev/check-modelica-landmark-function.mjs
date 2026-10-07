// Independent OMC reference only; this does not issue a Rumoca/browser artifact.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'landmark-function-semantics-'));
const models=['RGBDLandmarkFunctionAcceptance','RGBDLandmarkZeroLimitAcceptance',
  'RGBDLandmarkNegativeLimitAcceptance','RGBDLandmarkLargeLimitAcceptance','RGBDLandmarkSmallLimitAcceptance'];
const model=process.env.LANDMARK_REFERENCE_MODEL??models[0];
if(!models.includes(model))throw Error('Unknown landmark reference model');
const checkCount=12,caseCount=42,stopTime=(caseCount-0.5)/64;
const names=['models/Mapping/RGBDLandmarkProjection.mo','tests/modelica/RGBDLandmarkFunctionAcceptance.mo'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=[...names,'dev/check-modelica-landmark-function.mjs','dev/rumoca-bounded-run.mjs'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const debug='gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
const options='--preOptModules-=evalFunc';
const script=path.join(output,'landmark-function.mos');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debug)});\nsetCommandLineOptions(${JSON.stringify(options)});\n`
  +names.map(name=>`loadFile(${JSON.stringify(path.join(app,name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=${stopTime},numberOfIntervals=${caseCount*8-4},outputFormat="csv",variableFilter="scenario|checks.*",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','12,13',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const file=path.join(output,`${model}_res.csv`);
let cases=[],csv=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8');
  const lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const expected=['time',...Array.from({length:checkCount},(_,i)=>`checks[${i+1}]`),'scenario'];
  const columnsValid=columns.length===expected.length&&expected.every(name=>columns.includes(name));
  const lexicalValid=lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const index=columns.indexOf('scenario'),timeIndex=columns.indexOf('time');
  const checkIndexes=Array.from({length:checkCount},(_,i)=>columns.indexOf(`checks[${i+1}]`));
  const rowsValid=columnsValid&&lexicalValid&&rows.length>caseCount&&rows.every(row=>row.length===expected.length
    &&Number.isFinite(row[timeIndex])&&Number.isInteger(row[index])&&row[index]>=1&&row[index]<=caseCount
    &&checkIndexes.every(i=>row[i]===0||row[i]===1))&&rows[0][timeIndex]===0&&rows.at(-1)[timeIndex]===stopTime;
  if(rowsValid)cases=Array.from({length:caseCount},(_,i)=>{
    const selected=rows.filter(row=>row[index]===i+1);
    const checks=checkIndexes.map(j=>selected.length>0&&selected.every(row=>row[j]===1));
    return {scenario:i+1,rows:selected.length,checks,passed:checks.every(Boolean)};
  });
  csv={path:path.basename(file),sha256:sha(raw),columns,columnsValid,rowsValid,rows:rows.length};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=result.status===0&&bookendsEqual&&simulationSucceeded&&cases.length===caseCount&&cases.every(c=>c.passed);
const report={status:pass?'OMC_FULL350_LANDMARK_FUNCTION_PASS':'FAILED_OR_INCOMPLETE',
  scope:'One full350 dynamic equation-model/function comparison,42cases/12checks each: exact full1050 world/350 mask parity; independent RDF/FLU/world transforms/counts (default limit) or independent refused-output/count controls (limit variants), sparse350, malformed inputs, NaN/Inf padding, rotation tolerance, output bounds and recovery. Other coordinate-limit models require their own receipt.',
  model,
  compilerVersion:version.stdout.trim(),debug,options,cflags:'-O0',sources,bookendsEqual,cases,csv,simulationSucceeded,
  processStatus:result.status,signal:result.signal,referenceFunctionQualified:pass,
  rumocaArtifactIssued:false,browserIntegrated:false,initializerQualified:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-landmark-function-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','landmark-function.mos',`${model}_res.csv`]){
  const source=path.join(output,name);if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
const sourceDir=path.join(durable,'sources');fs.mkdirSync(sourceDir,{recursive:true});
for(const name of names)fs.copyFileSync(path.join(app,name),path.join(sourceDir,path.basename(name)));
console.log(JSON.stringify({directory:output,report:path.join(durable,'report.json'),status:report.status,
  processStatus:result.status,bookendsEqual,cases:cases.map(c=>({scenario:c.scenario,passed:c.passed,failed:c.checks.flatMap((v,i)=>v?[]:[i+1])})),csv}));
process.exitCode=pass?0:1;
