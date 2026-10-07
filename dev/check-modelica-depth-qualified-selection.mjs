// OMC reference gate for Modelica depth-qualified ranking; not a WASM admission.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'depth-selection-'));
const durable=path.join(app,'dev/artifacts/modelica-depth-qualified-selection',path.basename(output));
const names=['models/Vision/Matching/RGBDFeatureMatching.mo','models/Vision/Features/FeatureSelection.mo',
 'tests/modelica/RGBDDepthQualifiedSelectionAcceptance.mo','dev/check-modelica-depth-qualified-selection.mjs','dev/rumoca-bounded-run.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,source.path),target);}
const model='RGBDDepthQualifiedSelectionAcceptance';
const script=path.join(output,'acceptance.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
 +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
 +names.filter(name=>name.endsWith('.mo')).map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
 +`\ngetErrorString();\nsimulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|metrics.*",cflags="-O2");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8'});if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(output,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','90','--rss-mib','4096','--available-mib','16384',
 '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify({executable:process.execPath,args:command},null,2)+'\n');
console.log(JSON.stringify({phase:'launch',output,checks:54,grids:[[13,17],[17,13],[480,848]]}));
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
fs.writeFileSync(path.join(output,'guard.stderr'),terminal.stderr??'');
let resources;try{resources=JSON.parse(terminal.stdout);}catch{}
const csvFile=path.join(output,model+'_res.csv');let result={present:false};
if(fs.existsSync(csvFile)){
 const bytes=fs.readFileSync(csvFile),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
 const header=[...first.matchAll(/"([^"]*)"/g)].map(match=>match[1]);
 const checkNames=Array.from({length:3},(_,r)=>Array.from({length:18},(_,c)=>`checks[${r+1},${c+1}]`)).flat();
 const metricNames=Array.from({length:3},(_,r)=>Array.from({length:8},(_,c)=>`metrics[${r+1},${c+1}]`)).flat();
 const expected=['time',...checkNames,...metricNames];
 const columnsValid=header.map(JSON.stringify).join(',')===first&&header.length===expected.length
   &&new Set(header).size===expected.length&&expected.every(name=>header.includes(name));
 const lexicalValid=lines.every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
 const rows=lines.map(line=>line.split(',').map(Number)),ti=header.indexOf('time');
 const rowsValid=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite)
   &&checkNames.every(name=>row[header.indexOf(name)]===0||row[header.indexOf(name)]===1))
   &&rows[0][ti]===0&&rows.at(-1)[ti]===.001&&rows.every((row,i)=>i===0||row[ti]>=rows[i-1][ti]);
 const failedChecks=rowsValid?checkNames.filter(name=>rows.some(row=>row[header.indexOf(name)]!==1)):checkNames;
 result={present:true,sha256:sha(bytes),columnsValid,lexicalValid,rowsValid,rows:rows.length,failedChecks,
   metrics:rowsValid?Object.fromEntries(metricNames.map(name=>[name,rows[0][header.indexOf(name)]])):null};
}
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const simulationSucceeded=log.includes('The simulation finished successfully.');
const generatedCalls=fs.readdirSync(output).filter(name=>name.endsWith('.c')).some(name=>fs.readFileSync(path.join(output,name),'utf8').includes('omc_RGBDDepthQualifiedScores('));
const pass=terminal.status===0&&resources?.exitCode===0&&bookendsEqual&&simulationSucceeded&&generatedCalls&&result.rowsValid&&result.failedChecks.length===0;
const report={status:pass?'OMC_DEPTH_QUALIFIED_SELECTION_PASS':'FAILED_OR_INCOMPLETE',
 scope:'54 independent checks on small/transposed/native grids: budget recovery, distinct intrinsics, depth discontinuity, zero-weight poison, far edges, disabled poison, invalid scores and clipping/calibration refusal. Modelica OMC reference only; no Rumoca/WASM/browser estimator or throughput claim.',
 sources,compilerVersion:version.stdout.trim(),processStatus:terminal.status,resources,bookendsEqual,simulationSucceeded,generatedCalls,result};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
fs.mkdirSync(durable,{recursive:true});
for(const name of fs.readdirSync(output))if(/\.(?:mo|mos|json|csv|log|stderr|c|h|xml)$/.test(name)&&fs.statSync(path.join(output,name)).isFile())fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]).sort();}
fs.writeFileSync(path.join(durable,'manifest.json'),JSON.stringify({files:walk(durable).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))},null,2)+'\n');
console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,result,resources}));process.exitCode=pass?0:1;
