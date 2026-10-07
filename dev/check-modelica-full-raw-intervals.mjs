// Bounded reference qualification, not Rumoca WASM or browser admission.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const phase=process.argv[2]??'success';
const phases={success:{model:'RGBDFastSLAMIntervalsSuccessAcceptance',cases:[1,2,3,4,5,20,21,25,26]},
  refusal:{model:'RGBDFastSLAMIntervalsRefusalAcceptance',cases:[6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24]},
  'raw-success':{model:'RGBDFastSLAMZ16IntervalsSuccessAcceptance',cases:[1,2,3,4,5,20,21,25,26]},
  'raw-refusal':{model:'RGBDFastSLAMZ16IntervalsRefusalAcceptance',cases:[6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24]}};
if(!Object.hasOwn(phases,phase))throw Error('Expected success, refusal, raw-success or raw-refusal');
const {model,cases}=phases[phase],checkCount=18,metricCount=19;
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,`full-raw-intervals-${phase}-`));
const durable=path.join(app,'dev/artifacts/modelica-full-raw-intervals',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const names=[...rgbdSlamSourceManifest.paths,'models/SLAM/RGBDFastSLAMIntervals.mo',
  'tests/modelica/RGBDLocalizationInitializeTests.mo',
  'tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo',
  'tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo',
  'tests/modelica/RGBDFastInitializationFunctionAcceptance.mo',
  'tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo',
  'tests/modelica/RGBDFastSLAMRawCompositionAcceptance.mo',
  'tests/modelica/RGBDCompleteStateComparison.mo',
  'tests/modelica/RGBDFastSLAMIntervalsAcceptance.mo'];
const sources=[...new Set([...names,'src/modelica-slam-source-manifest.mjs',
  'dev/check-modelica-full-raw-intervals.mjs','dev/rumoca-bounded-run.mjs'])]
  .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(durable,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const script=path.join(output,'full-raw-intervals.mos');
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
  '--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
const csvPath=model+'_res.csv';let checks=[],result=null,metrics=[];
const checkColumns=cases.flatMap((_,row)=>Array.from({length:checkCount},(_,i)=>`checks[${row+1},${i+1}]`));
const metricColumns=cases.flatMap((_,row)=>Array.from({length:metricCount},(_,i)=>`raw[${row+1},${i+1}]`));
const expected=['time',...checkColumns,...metricColumns];
// CSV header field names include commas. Parse actual quoted CSV, never split
// two-dimensional headers at the dimension separator.
function parseLine(line){
  const fields=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const char=line[i];
    if(char==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;
    }else if(char===','&&!quoted){fields.push(value);value='';}else value+=char;
  }
  if(quoted)throw Error('Unclosed CSV quote');fields.push(value);return fields;
}
if(fs.existsSync(path.join(output,csvPath))){
  const bytes=fs.readFileSync(path.join(output,csvPath)),lines=String(bytes).trim().split(/\r?\n/);
  const header=parseLine(lines.shift());
  const columnsValid=header.length===expected.length&&new Set(header).size===expected.length
    &&expected.every(name=>header.includes(name));
  const cells=lines.map(parseLine);
  const lexicalValid=cells.every(row=>row.every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=cells.map(row=>row.map(Number)),ti=header.indexOf('time');
  const indices=checkColumns.map(name=>header.indexOf(name));
  const rowsValid=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===expected.length
    &&row.every(Number.isFinite)&&indices.every(index=>row[index]===0||row[index]===1))
    &&rows[0][ti]===0&&rows.at(-1)[ti]===0.001;
  const caseIdsValid=rowsValid&&rows.every(row=>cases.every((caseId,index)=>row[header.indexOf(`raw[${index+1},1]`)]===caseId));
  if(rowsValid&&caseIdsValid){
    checks=cases.map((caseId,row)=>({caseId,checks:Array.from({length:checkCount},(_,i)=>
      rows.every(values=>values[header.indexOf(`checks[${row+1},${i+1}]`)]===1))}));
    metrics=rows.map(values=>cases.map((caseId,row)=>({caseId,values:Array.from({length:metricCount},(_,i)=>
      values[header.indexOf(`raw[${row+1},${i+1}]`)])})));
  }
  result={path:csvPath,sha256:sha(bytes),columnsValid,lexicalValid,rowsValid,caseIdsValid,rows:rows.length,
    failedChecks:checks.flatMap(row=>row.checks.flatMap((pass,i)=>pass?[]:[{caseId:row.caseId,check:i+1}]))};
}
const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{
  const bytes=fs.readFileSync(path.join(output,name));return {path:name,bytes:bytes.length,sha256:sha(bytes)};
});
// Preserve the actual runtime function bodies; remaining build outputs stay on scratch.
for(const name of generated.filter(item=>/_functions\.(?:c|h)$/.test(item.path)).map(item=>item.path))
  fs.copyFileSync(path.join(output,name),path.join(durable,name));
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=terminal.status===0&&bookendsEqual&&simulationSucceeded&&checks.length===cases.length
  &&checks.every(row=>row.checks.length===checkCount&&row.checks.every(Boolean));
let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
const report={status:pass?'OMC_FULL_RAW_INTERVALS_PASS':'FAILED_OR_INCOMPLETE',phase,model,cases,
  scope:`Actual full-capacity SLAM with ${phase.startsWith('raw-')?'RGB3/Z16 codes and 1mm scale':'RGBA/metric depth'} and source-owned held-IMU batching. Complete State/27 display-result parity against sequential actual AdvanceFastSLAM calls shares the underlying math. Independent transaction controls test chronology, stale image refusal, one final image, atomic rollback and optional graph-attempt retention. OMC reference execution only; no Rumoca WASM/browser/throughput admission.`,
  compilerVersion:version.stdout.trim(),sources,bookendsEqual,checks,result,metrics,generated,
  generatedScratchHomeRelative:path.relative(os.homedir(),output),processStatus:terminal.status,
  simulationSucceeded,resources,rawBatchReferenceQualified:!!pass,
  originalEquationModelParity:false,publicAdapterNumericalExecution:false,rumocaArtifactIssued:false,
  browserIntegrated:false,fullSlamAccepted:false,throughputQualified:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
for(const name of ['report.json','resources.json','command.json','guardian-stderr.log','semantics.log',
  'full-raw-intervals.mos','phase.txt',csvPath])if(fs.existsSync(path.join(output,name)))
    fs.copyFileSync(path.join(output,name),path.join(durable,name));
console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,phase,
  processStatus:terminal.status,failedChecks:result?.failedChecks,resources}));
process.exitCode=pass?0:1;
