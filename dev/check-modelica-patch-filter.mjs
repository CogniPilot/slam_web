// Staged Modelica-only patch tracker. Default prepares frozen inputs; --run needs review/release.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2);
if(args.length>1||args.length===1&&!['--prepare','--run'].includes(args[0]))throw Error('Usage: node dev/check-modelica-patch-filter.mjs [--prepare|--run]');
const run=args[0]==='--run';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const home=os.homedir(),scratch=path.join(home,'scratch/slam_web/tmp');
fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'patch-filter-'));
const durable=path.join(app,'dev/artifacts/modelica-patch-filter',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceNames=['models/Vision/Matching/RGBDPatchTracking.mo','tests/modelica/RGBDPatchFilterAcceptance.mo'];
const frozenNames=[...sourceNames,'dev/check-modelica-patch-filter.mjs','dev/rumoca-bounded-run.mjs'];
const copy=(source,target)=>{fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);};
const json=(name,value)=>fs.writeFileSync(path.join(durable,name),JSON.stringify(value,null,2)+'\n');
const sources=frozenNames.map(name=>({path:name,bytes:fs.statSync(path.join(app,name)).size,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
const omc=process.env.OMC_BIN??'omc';
const candidate=path.isAbsolute(omc)?omc:(process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc))
  .find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}});
const compilerExecutable=candidate&&fs.existsSync(candidate)?{path:fs.realpathSync(candidate),sha256:sha(fs.readFileSync(fs.realpathSync(candidate)))}:null;
const script=path.join(output,'patch-tracking.mos');
const model='RGBDPatchFilterAcceptance';
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +sourceNames.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')
  +'\ngetErrorString();\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|raw.*",cflags="-O0");\ngetErrorString();\n`);
const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
copy(script,path.join(durable,'patch-tracking.mos'));copy(path.join(output,'command.json'),path.join(durable,'command.json'));
const base={model,sources,compilerExecutable,generatedScratchHomeRelative:path.relative(home,output),
  scope:'Staged separable5tap binomial filter, independent constant/ramp/impulse/quadratic and invalid-support controls over full90x160 arrays; small-width/height cases are explicit domain refusals. No production, tracking, flight, covariance, Rumoca/WASM/browser or performance claim.',
  sourceManifestChanged:false,productionCallersChanged:false,installedMslLoaded:false};
if(!run){
  json('preparation.json',{...base,status:'PREPARED_UNEXECUTED',command});
  console.log(JSON.stringify({directory:path.relative(app,durable),status:'PREPARED_UNEXECUTED',sources}));
}else{
  let terminal;let failure;
  try{terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});}catch(error){failure=String(error);}
  fs.writeFileSync(path.join(output,'resources.json'),terminal?.stdout??'');
  fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal?.stderr??failure??'');
  let resources=null;try{resources=JSON.parse(terminal?.stdout??'');}catch{}
  const csvPath=path.join(output,model+'_res.csv');let result={present:false};
  if(fs.existsSync(csvPath)){
    const bytes=fs.readFileSync(csvPath),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
    const header=[...first.matchAll(/"([^"]*)"/g)].map(match=>match[1]);
    const checkNames=Array.from({length:16},(_,i)=>`checks[${i+1}]`);
    const rawNames=Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>`raw[${r+1},${c+1}]`)).flat();
    const expected=['time',...checkNames,...rawNames];
    const columnsValid=header.length===expected.length&&new Set(header).size===expected.length
      &&header.map(value=>JSON.stringify(value)).join(',')===first&&expected.every(name=>header.includes(name));
    const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
    const lexicalValid=lines.length>0&&lines.every(line=>line.split(',').every(value=>number.test(value)));
    const rows=lines.map(line=>line.split(',').map(Number));
    const finiteRows=columnsValid&&lexicalValid&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite));
    const times=finiteRows?rows.map(row=>row[header.indexOf('time')]):[];
    const rowsValid=finiteRows&&rows.length>=2&&times[0]===0&&times.at(-1)===.001
      &&times.every((time,i)=>time>=0&&time<=.001&&(i===0||time>=times[i-1]))
      &&rows.every(row=>checkNames.every(name=>[0,1].includes(row[header.indexOf(name)])));
    const checks=rowsValid?checkNames.map(name=>rows.every(row=>row[header.indexOf(name)]===1)):[];
    result={present:true,sha256:sha(bytes),columns:header.length,columnsValid,lexicalValid,finiteRows,rowsValid,rows:rows.length,times,checks,
      failedChecks:checks.flatMap((pass,i)=>pass?[]:[i+1]),
      raw:finiteRows?rows.map(row=>Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>row[header.indexOf(`raw[${r+1},${c+1}]`)]))):[]};
  }
  const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256
    &&sha(fs.readFileSync(path.join(durable,'sources',source.path)))===source.sha256)
    &&compilerExecutable!==null&&sha(fs.readFileSync(compilerExecutable.path))===compilerExecutable.sha256;
  const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
  const simulationSucceeded=log.includes('The simulation finished successfully.');
  const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name)))}));
  const pass=terminal?.status===0&&resources?.exitCode===0&&bookendsEqual&&simulationSucceeded&&result.rowsValid&&result.checks.length===16&&result.checks.every(Boolean);
  for(const name of fs.readdirSync(output))if(/\.(?:c|h|csv|xml|mos|json|log|txt)$/.test(name)&&fs.statSync(path.join(output,name)).isFile())copy(path.join(output,name),path.join(durable,name));
  const report={...base,status:pass?'OMC_PATCH_FILTER_REFERENCE_PASS':'FAILED_OR_INCOMPLETE',processStatus:terminal?.status??null,
    failure,resources,bookendsEqual,simulationSucceeded,result,generated};
  json('report.json',report);console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,result,resources}));process.exitCode=pass?0:1;
}
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();
json('manifest.json',{files:walk(durable).filter(file=>file!==path.join(durable,'manifest.json')).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});
