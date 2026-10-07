// Reference execution of the complete raw Modelica processing composition.
// Rumoca remains the production compiler; this runner issues no browser artifact.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='RGBDFastSLAMRawLoopAcceptance';
const checkCount=24;
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'full-raw-loop-'));
const durable=path.join(app,'dev/artifacts/modelica-full-raw-loop',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const names=[...rgbdSlamSourceManifest.paths,
  'tests/modelica/RGBDLocalizationInitializeTests.mo',
  'tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo',
  'tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo',
  'tests/modelica/RGBDFastInitializationFunctionAcceptance.mo',
  'tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo',
  'tests/modelica/RGBDFastSLAMRawCompositionAcceptance.mo',
  'tests/modelica/RGBDFastSLAMRawLoopAcceptance.mo'];
const sources=[...names,'src/modelica-slam-source-manifest.mjs',
  'dev/check-modelica-full-raw-loop.mjs','dev/rumoca-bounded-run.mjs']
  .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(durable,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const script=path.join(output,'full-raw-composition.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|raw.*",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120',
  '--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),
  '--','nice','-n','15','taskset','-c','10,11','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
const csvPath=model+'_res.csv';let checks=[],result=null,metrics=[];
if(fs.existsSync(path.join(output,csvPath))){
  const bytes=fs.readFileSync(path.join(output,csvPath)),lines=String(bytes).trim().split(/\r?\n/);
  const header=lines.shift().split(',').map(value=>value.replace(/^"|"$/g,''));
  const expected=['time',...Array.from({length:checkCount},(_,i)=>`checks[${i+1}]`),
    ...Array.from({length:24},(_,i)=>`raw[${i+1}]`)];
  const columnsValid=header.length===expected.length&&new Set(header).size===expected.length
    &&expected.every(name=>header.includes(name));
  const lexicalValid=lines.every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=lines.map(line=>line.split(',').map(Number));
  const ti=header.indexOf('time'),indices=expected.slice(1,checkCount+1).map(name=>header.indexOf(name));
  const rowsValid=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length
    &&row.every(Number.isFinite)&&indices.every(index=>row[index]===0||row[index]===1))
    &&rows[0][ti]===0&&rows.at(-1)[ti]===0.001;
  if(rowsValid){
    checks=indices.map(index=>rows.every(row=>row[index]===1));
    metrics=rows.map(row=>Array.from({length:24},(_,i)=>row[header.indexOf(`raw[${i+1}]`)]));
  }
  result={path:csvPath,sha256:sha(bytes),columnsValid,lexicalValid,rowsValid,rows:rows.length,
    failedChecks:checks.flatMap((pass,i)=>pass?[]:[i+1])};
}
const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{
  const bytes=fs.readFileSync(path.join(output,name));return {path:name,bytes:bytes.length,sha256:sha(bytes)};
});
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=terminal.status===0&&bookendsEqual&&simulationSucceeded&&checks.length===checkCount&&checks.every(Boolean);
let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
const report={status:pass?'OMC_FULL_RAW_LOOP_PASS':'FAILED_OR_INCOMPLETE',model,
  scope:'Actual raw full90x160/350 initialization then30 full-State carries,6s unique-image chronology,128-keyframe/256-word/256-edge/14400-map capacities; measured BoW retrieval and geometric kind2 loop back to first capture, graph correction and anchored map invariants. Core-dependent filter math; OMC reference only. No Rumoca/browser/WASM/throughput qualification.',
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,result,metrics,generated,
  generatedScratchHomeRelative:path.relative(os.homedir(),output),processStatus:terminal.status,
  simulationSucceeded,resources,rawLoopCompositionQualified:!!pass,
  originalEquationModelParity:false,publicAdapterNumericalExecution:false,rumocaArtifactIssued:false,
  browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const witness of generated.filter(entry=>entry.path===model+'.c'||entry.path===model+'_functions.c'))
  fs.copyFileSync(path.join(output,witness.path),path.join(durable,witness.path));
for(const name of ['report.json','resources.json','command.json','guardian-stderr.log','semantics.log',
  'full-raw-composition.mos','phase.txt',csvPath])if(fs.existsSync(path.join(output,name)))
    fs.copyFileSync(path.join(output,name),path.join(durable,name));
console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,
  processStatus:terminal.status,checks,metrics,result,resources}));
process.exitCode=pass?0:1;
