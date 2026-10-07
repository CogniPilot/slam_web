// Independent full-domain reference check; production compilation stays in Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'matching-active-domain-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['models/RGBDFeatureMatching.mo','tests/modelica/RGBDMatchingDenseReference.mo',
  'tests/modelica/RGBDMatchingActiveDomainTests.mo','dev/check-modelica-matching-active-domain.mjs'];
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const model='RGBDMatchingActiveDomainAcceptance';
const debugFlags='gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
const script=path.join(output,'matching.mos');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debugFlags)});\n`
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.filter(name=>name.endsWith('.mo')).map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=23.25,numberOfIntervals=93,outputFormat="csv",variableFilter="checks.*|scenario");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const processResult=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),processResult.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const filename=`${model}_res.csv`,file=path.join(output,filename);
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8'),lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time','scenario',...Array.from({length:12},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name));
  const checkIndices=expected.slice(2).map(name=>columns.indexOf(name));
  const timeIndex=columns.indexOf('time'),scenarioIndex=columns.indexOf('scenario');
  const rowsValid=columnsValid&&rows.length>=94&&rows.every(row=>row.length===expected.length
    &&row.every(Number.isFinite)&&Number.isInteger(row[scenarioIndex])&&row[scenarioIndex]>=1&&row[scenarioIndex]<=24
    &&checkIndices.every(index=>row[index]===0||row[index]===1))
    &&rows[0][timeIndex]===0&&rows.at(-1)[timeIndex]===23.25;
  const scenarios=rowsValid?[...new Set(rows.map(row=>row[scenarioIndex]))].sort((a,b)=>a-b):[];
  if(rowsValid)checks=checkIndices.map(index=>rows.every(row=>row[index]===1));
  const failedRows=rowsValid?rows.filter(row=>checkIndices.some(index=>row[index]!==1)):[];
  modelResult={path:filename,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,scenarios,
    allScenariosObserved:scenarios.length===24,failedRows,
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=processResult.status===0&&bookendsEqual&&checks.length===12&&checks.every(Boolean)
  &&modelResult?.allScenariosObserved===true&&modelResult?.simulationSucceeded===true;
const generated=fs.readdirSync(output).filter(name=>name.endsWith('_functions.c')).map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name)))}));
const report={status:pass?'OMC_FULL_DOMAIN_MATCHING_PARITY_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Full350x49 descriptor and350x3 point domains. Dynamic24-scenario original-vs-active-list comparison of every output element, with independent sparse/dense/empty/refusal expectations. This checks the matching function, not raw camera or full SLAM execution.',
  compilerVersion:version.stdout.trim(),debugFlags,sources,bookendsEqual,checks,modelResult,generated,
  processStatus:processResult.status,signal:processResult.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,wasmPerformanceMeasured:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-matching-active-domain',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','semantics.log','matching.mos',filename,...generated.map(entry=>entry.path)]){
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
}
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:durable,scratchDirectory:output,...report}));
process.exitCode=pass?0:1;
