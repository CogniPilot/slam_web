// OMC reference qualification only; production numerical operations remain Modelica.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

if(process.argv.length!==2)throw Error('Usage: OMC_BIN=/path/to/omc node dev/check-modelica-robust-registration.mjs');
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'robust-registration-'));
const durable=path.join(app,'dev/artifacts/modelica-robust-registration',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const model='RGBDRobustRegistrationAcceptance',checkCount=24,rawRows=8,rawColumns=8;
const sourceNames=['models/Math/RigidPointRegistration.mo','tests/modelica/RGBDRobustRegistrationAcceptance.mo'];
const freezeNames=[...sourceNames,'dev/check-modelica-robust-registration.mjs','dev/rumoca-bounded-run.mjs'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const copy=(source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);};
const json=(name,value)=>fs.writeFileSync(path.join(durable,name),JSON.stringify(value,null,2)+'\n');
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();
function strictCsv(file){
  if(!fs.existsSync(file))return {present:false,checks:[],raw:[],failedChecks:[]};
  const bytes=fs.readFileSync(file),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
  const header=[...first.matchAll(/"([^"]*)"/g)].map(match=>match[1]);
  const quotedHeader=header.map(value=>JSON.stringify(value)).join(',')===first;
  const checks=Array.from({length:checkCount},(_,index)=>`checks[${index+1}]`);
  const raw=Array.from({length:rawRows},(_,row)=>Array.from({length:rawColumns},(_,column)=>`raw[${row+1},${column+1}]`)).flat();
  const names=['time',...checks,...raw];
  const columnsValid=quotedHeader&&header.length===89&&new Set(header).size===89&&names.every(name=>header.includes(name));
  const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const lexicalValid=lines.length>0&&lines.every(line=>line.split(',').every(value=>numeric.test(value)));
  const rows=lines.map(line=>line.split(',').map(Number));
  const finiteRows=columnsValid&&lexicalValid&&rows.length>=2&&rows.every(row=>row.length===89&&row.every(Number.isFinite));
  const booleanChecks=finiteRows&&rows.every(row=>checks.every(name=>[0,1].includes(row[header.indexOf(name)])));
  const times=rows.map(row=>row[header.indexOf('time')]);
  const rowsValid=booleanChecks&&times[0]===0&&times.at(-1)===.001
    &&times.every((time,index)=>time>=0&&time<=.001&&(index===0||time>=times[index-1]));
  const accepted=rowsValid?checks.map(name=>rows.every(row=>row[header.indexOf(name)]===1)):[];
  // Retain every finite metric even when acceptance fails.
  const rawValues=finiteRows?rows.map(row=>Array.from({length:rawRows},(_,r)=>Array.from({length:rawColumns},(_,c)=>row[header.indexOf(`raw[${r+1},${c+1}]`)]))):[];
  return {present:true,path:path.basename(file),sha256:sha(bytes),columns:header.length,quotedHeader,columnsValid,lexicalValid,finiteRows,rowsValid,
    rows:rows.length,times,checks:accepted,failedChecks:accepted.flatMap((pass,index)=>pass?[]:[index+1]),raw:rawValues};
}
function preserve(){
  if(!fs.existsSync(output))return;
  for(const name of fs.readdirSync(output)){
    if(/\.(?:c|h|csv|xml|mos|json|log|txt)$/.test(name)){
      const file=path.join(output,name);if(fs.statSync(file).isFile())copy(file,path.join(durable,name));
    }
  }
}
function manifest(){json('manifest.json',{files:walk(durable).filter(file=>file!==path.join(durable,'manifest.json')).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});}
let stage='source-freeze';
try{
  const sources=freezeNames.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
  for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
  const omc=process.env.OMC_BIN??'omc';
  const candidate=path.isAbsolute(omc)?omc:(process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}});
  if(!candidate)throw Error('OMC_BIN or PATH must provide an executable omc');
  const executable=fs.realpathSync(candidate),compilerExecutable={path:executable,sha256:sha(fs.readFileSync(executable))};
  const version=spawnSync(executable,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
  if(version.error||version.status!==0)throw version.error??Error(version.stderr);
  const script=path.join(output,'robust-registration.mos');
  fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
    +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
    +sourceNames.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')
    +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
    +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|raw.*",cflags="-O0");\ngetErrorString();\n`);
  const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
    '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
    executable,'--numProcs=2','--vectorizationLimit=1',script];
  fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
  stage='bounded-omc';
  const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
  fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');
  if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
  const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
  const result=strictCsv(path.join(output,model+'_res.csv'));
  const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>{const bytes=fs.readFileSync(path.join(output,name));return {path:name,bytes:bytes.length,sha256:sha(bytes)};});
  const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256
    &&sha(fs.readFileSync(path.join(durable,'sources',source.path)))===source.sha256)&&sha(fs.readFileSync(executable))===compilerExecutable.sha256;
  let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
  const simulationSucceeded=log.includes('The simulation finished successfully.');
  const pass=terminal.status===0&&resources?.exitCode===0&&bookendsEqual&&simulationSucceeded&&result.rowsValid&&result.checks.length===24&&result.checks.every(Boolean);
  const report={status:pass?'OMC_ROBUST_REGISTRATION_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',model,
    scope:'Full350-domain Modelica robust-registration reference controls. OMC native C execution only; no Rumoca/WASM/browser/throughput or rendered-city acceptance claim.',
    compilerVersion:version.stdout.trim(),compilerExecutable,sources,loadedProductionSources:sourceNames.slice(0,1),installedMslLoaded:false,
    bookendsEqual,processStatus:terminal.status,simulationSucceeded,resources,result,generated,generatedScratchHomeRelative:path.relative(home,output),
    nativeWasmArtifactIssued:false,browserExecuted:false,renderedCityQualified:false};
  preserve();json('report.json',report);manifest();
  console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,processStatus:terminal.status,result,resources}));process.exitCode=pass?0:1;
}catch(error){
  preserve();json('failure.json',{status:'REFUSED_BEFORE_OR_DURING_GATE',stage,error:String(error?.stack??error)});manifest();
  console.error(JSON.stringify({directory:path.relative(app,durable),stage,error:String(error)}));process.exitCode=1;
}
