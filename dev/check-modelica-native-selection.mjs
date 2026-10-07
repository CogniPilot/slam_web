// Full native-sized selection reference gate. Host code freezes/reviews evidence only.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

if(process.argv.length!==2)throw Error('Usage: OMC_BIN=/path/to/omc node dev/check-modelica-native-selection.mjs');
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'native-selection-'));
const durable=path.join(app,'dev/artifacts/modelica-native-frontend',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
const model='RGBDNativeSelectionAcceptance';
const sourceNames=['models/FeatureSelection.mo','tests/modelica/RGBDNativeSelectionAcceptance.mo'];
const frozenNames=[...sourceNames,'dev/check-modelica-native-selection.mjs','dev/rumoca-bounded-run.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=(source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);};
const json=(name,value)=>fs.writeFileSync(path.join(durable,name),JSON.stringify(value,null,2)+'\n');
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();
const manifest=()=>json('manifest.json',{files:walk(durable).filter(file=>file!==path.join(durable,'manifest.json')).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});
function preserve(){
  for(const name of fs.readdirSync(output))if(/\.(?:c|h|csv|xml|mos|json|log|txt|makefile)$/.test(name)&&fs.statSync(path.join(output,name)).isFile())copy(path.join(output,name),path.join(durable,name));
}
function strictCsv(file){
  if(!fs.existsSync(file))return {present:false};
  const bytes=fs.readFileSync(file),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
  const header=[...first.matchAll(/"([^"]*)"/g)].map(match=>match[1]);
  const checks=Array.from({length:40},(_,i)=>`checks[${i+1}]`);
  const metrics=Array.from({length:10},(_,r)=>Array.from({length:8},(_,c)=>`metrics[${r+1},${c+1}]`)).flat();
  const selected=Array.from({length:350},(_,r)=>Array.from({length:3},(_,c)=>`selected[${r+1},${c+1}]`)).flat();
  const expected=['time',...checks,...metrics,...selected];
  const columnsValid=header.map(value=>JSON.stringify(value)).join(',')===first&&header.length===expected.length
    &&new Set(header).size===expected.length&&expected.every(name=>header.includes(name));
  const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const lexicalValid=lines.length>0&&lines.every(line=>line.split(',').every(value=>numeric.test(value)));
  const rows=lines.map(line=>line.split(',').map(Number));
  const finiteRows=columnsValid&&lexicalValid&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite));
  const times=finiteRows?rows.map(row=>row[header.indexOf('time')]):[];
  const rowsValid=finiteRows&&rows.length>=2&&times[0]===0&&times.at(-1)===.001
    &&times.every((time,i)=>time>=0&&time<=.001&&(i===0||time>=times[i-1]))
    &&rows.every(row=>checks.every(name=>[0,1].includes(row[header.indexOf(name)])));
  const acceptance=rowsValid?checks.map(name=>rows.every(row=>row[header.indexOf(name)]===1)):[];
  return {present:true,sha256:sha(bytes),columns:header.length,columnsValid,lexicalValid,finiteRows,rowsValid,rows:rows.length,times,
    checks:acceptance,failedChecks:acceptance.flatMap((pass,i)=>pass?[]:[i+1]),
    metrics:finiteRows?rows.map(row=>Array.from({length:10},(_,r)=>Array.from({length:8},(_,c)=>row[header.indexOf(`metrics[${r+1},${c+1}]`)]))):[],
    selected:finiteRows?rows.map(row=>Array.from({length:350},(_,r)=>Array.from({length:3},(_,c)=>row[header.indexOf(`selected[${r+1},${c+1}]`)]))):[]};
}
let stage='source-freeze';
try{
  const sources=frozenNames.map(name=>({path:name,bytes:fs.statSync(path.join(app,name)).size,sha256:sha(fs.readFileSync(path.join(app,name)))}));
  for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
  const omc=process.env.OMC_BIN??'omc';
  const candidate=path.isAbsolute(omc)?omc:(process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}});
  if(!candidate)throw Error('OMC_BIN or PATH must provide omc');
  const executable=fs.realpathSync(candidate),compilerExecutable={path:executable,sha256:sha(fs.readFileSync(executable))};
  const version=spawnSync(executable,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
  if(version.error||version.status!==0)throw version.error??Error(version.stderr);
  const script=path.join(output,'native-selection.mos');
  fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
    +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
    +sourceNames.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')
    +'\ngetErrorString();\n'
    +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|metrics.*|selected.*",cflags="-O0");\ngetErrorString();\n`);
  const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','4096','--available-mib','16384',
    '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
    executable,'--numProcs=2','--vectorizationLimit=1',script];
  fs.writeFileSync(path.join(output,'command.json'),JSON.stringify({executable:process.execPath,args:command,environment:{PATH:process.env.PATH}},null,2)+'\n');
  stage='bounded-omc';
  const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
  fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr??'');
  let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
  const result=strictCsv(path.join(output,model+'_res.csv'));
  const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>({path:name,bytes:fs.statSync(path.join(output,name)).size,sha256:sha(fs.readFileSync(path.join(output,name)))}));
  const generatedText=generated.filter(file=>file.path.endsWith('.c')).map(file=>fs.readFileSync(path.join(output,file.path),'utf8')).join('\n');
  const generatedRuntimeEvidence={runFunctionPresent:generatedText.includes('omc_RGBDNativeSelectionReference_Run('),
    selectionCallOccurrences:(generatedText.match(/omc_SelectRasterFeatures\(/g)??[]).length};
  const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256
    &&sha(fs.readFileSync(path.join(durable,'sources',source.path)))===source.sha256)&&sha(fs.readFileSync(executable))===compilerExecutable.sha256;
  const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
  const simulationSucceeded=log.includes('The simulation finished successfully.');
  const pass=terminal.status===0&&resources?.exitCode===0&&bookendsEqual&&simulationSucceeded&&result.rowsValid
    &&result.checks.length===40&&result.checks.every(Boolean)&&generatedRuntimeEvidence.runFunctionPresent&&generatedRuntimeEvidence.selectionCallOccurrences>=3;
  const report={model,status:pass?'OMC_NATIVE_SIZE_SELECTION_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',
    scope:'Actual SelectRasterFeatures on848x480 scores,350-row output versus407040-row legacy capacity; independent sparse peak/rank/tie/suppression/early-stop and refusal expectations. OMC native reference only, not complete SLAM, Rumoca/WASM/browser or a performance qualification.',
    sources,compilerExecutable,compilerVersion:version.stdout.trim(),installedMslLoaded:false,processStatus:terminal.status,
    resources,bookendsEqual,simulationSucceeded,result,generated,generatedRuntimeEvidence,
    shapes:{scores:[480,848],compactOutput:[350,3],legacyOutput:[407040,3],candidateScratchPerCall:407040,topLevelSelected:[350,3]},
    generatedScratchHomeRelative:path.relative(home,output),nativeWasmArtifactIssued:false,browserExecuted:false};
  preserve();json('report.json',report);manifest();
  console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,processStatus:terminal.status,
    checks:result.checks,failedChecks:result.failedChecks,columns:result.columns,metrics:result.metrics?.[0],resources}));
  process.exitCode=pass?0:1;
}catch(error){
  preserve();json('failure.json',{status:'REFUSED_BEFORE_OR_DURING_GATE',stage,error:String(error?.stack??error)});manifest();
  console.error(JSON.stringify({directory:path.relative(app,durable),stage,error:String(error)}));process.exitCode=1;
}
