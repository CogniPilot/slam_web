// Reference qualification of extracted actual Modelica helpers, not a host implementation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'tracking-geometry-'));
const durable=path.join(app,'dev/artifacts/modelica-native-frontend',path.basename(output));
const names=['models/RGBDInertialLocalizationStep.mo',
  'dev/artifacts/modelica-native-frontend/preimages/RGBDInertialLocalizationStep.mo',
  'models/SchmidtReferenceState.mo','tests/modelica/RGBDTrackingGeometryAcceptance.mo',
  'dev/check-modelica-tracking-geometry.mjs','dev/rumoca-bounded-run.mjs'];
const sources=names.map(name=>{
  const bytes=fs.readFileSync(path.join(app,name)),target=path.join(output,'source-preimages',name);
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  return {path:name,sha256:sha(bytes),bytes:bytes.length};
});
function extract(file,name){
  const source=fs.readFileSync(path.join(output,'source-preimages',file),'utf8');
  const start=source.indexOf(`function ${name}\n`),ending=`end ${name};`;
  const end=source.indexOf(ending,start);
  if(start<0||end<start||source.indexOf(`function ${name}\n`,start+1)>=0)throw Error(`Ambiguous helper ${name}`);
  return source.slice(start,end+ending.length)+'\n';
}
const current=extract(names[0],'RGBDLocalizationTracking');
const frozen=extract(names[1],'RGBDLocalizationTracking').replaceAll('RGBDLocalizationTracking','RGBDLocalizationTrackingFrozen');
const equality=extract(names[2],'SLAMExactRealEqual');
const helperPath=path.join(output,'TrackingHelpers.mo');fs.writeFileSync(helperPath,equality+'\n'+current+'\n'+frozen);
const fixturePath=path.join(output,'source-preimages',names[3]);
const model='RGBDTrackingGeometryAcceptance',checkCount=32;
const scenarios=['native last valid 847/479','old x848','old y480','current x848','current y480',
  'negative old x','fractional old y','fractional current x','negative current y','partner zero',
  'partner out of range351','fractional partner','negative partner','disabled reference poison',
  'disabled current poison','fractional old mask','fractional current mask','zero height',
  'negative height','zero width','negative width','wide rectangular3x7','tall rectangular7x3',
  'single pixel1x1','compatibility valid boundaries','compatibility old x160',
  'compatibility current y90','compatibility fractional partner','compatibility fractional old pixel',
  'compatibility disabled reference poison','compatibility disabled current poison',
  'compatibility all350 reverse correspondences'];
const script=path.join(output,'tracking-geometry.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +`loadFile(${JSON.stringify(helperPath)});\nloadFile(${JSON.stringify(fixturePath)});\ngetErrorString();\n`
  +'writeFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(output,'source-preimages','dev/rumoca-bounded-run.mjs'),
  '--seconds','120','--rss-mib','4096','--available-mib','16384','--log',path.join(output,'semantics.log'),
  '--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
console.log(JSON.stringify({phase:'launch',output,model,scenarios:scenarios.length,cores:'6,7',seconds:120,rssMiB:4096}));
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
fs.writeFileSync(path.join(output,'driver-stderr.log'),result.stderr??'');
const logPath=path.join(output,'semantics.log'),log=fs.existsSync(logPath)?fs.readFileSync(logPath,'utf8'):'';
const csvPath=path.join(output,`${model}_res.csv`),expected=['time',...Array.from({length:checkCount},(_,i)=>`checks[${i+1}]`)];
let csv=null,checks=[];
if(fs.existsSync(csvPath)){
  const bytes=fs.readFileSync(csvPath),lines=bytes.toString('utf8').trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(v=>v.replace(/^"|"$/g,''));
  const rawRows=lines.slice(1).map(line=>line.split(','));
  const lexical=rawRows.every(row=>row.every(v=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)));
  const rows=rawRows.map(row=>row.map(Number));
  const columnsValid=columns.length===expected.length&&columns.every((v,i)=>v===expected[i]);
  const rowsValid=lexical&&rows.length===3&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite)
    &&row.slice(1).every(v=>v===0||v===1))&&rows[0][0]===0&&rows.at(-1)[0]===0.001;
  if(columnsValid&&rowsValid)checks=scenarios.map((scenario,i)=>({case:i+1,scenario,pass:rows.every(row=>row[i+1]===1)}));
  csv={path:path.basename(csvPath),sha256:sha(bytes),bytes:bytes.length,columns,columnsValid,rowsValid,rows:rows.length};
}
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256);
const generated=fs.readdirSync(output).filter(name=>name.endsWith('.c')||name.endsWith('.h')).map(name=>{
  const bytes=fs.readFileSync(path.join(output,name));return {path:name,sha256:sha(bytes),bytes:bytes.length};
});
const functions=generated.filter(s=>s.path.endsWith('_functions.c'));
const helperEmissionObserved=functions.some(s=>{
  const text=fs.readFileSync(path.join(output,s.path),'utf8');
  return text.includes('omc_RGBDLocalizationTracking(')&&text.includes('omc_RGBDLocalizationTrackingFrozen(');
});
const pass=result.status===0&&bookendsEqual&&checks.length===checkCount&&checks.every(c=>c.pass)
  &&log.includes('The simulation finished successfully.')&&helperEmissionObserved;
const report={status:pass?'MODELICA_TRACKING_GEOMETRY_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Actual current helper full350-slot geometry at848x480, rectangular and invalid grids; eight90x160 exact numeric comparisons against extracted frozen helper. Finite out-of-domain disabled payload poison. No matching/filter/SLAM/browser/compiler admission claim.',
  output,compilerVersion:version.stdout.trim(),sources,bookendsEqual,
  extractedHelpers:{path:'TrackingHelpers.mo',sha256:sha(fs.readFileSync(helperPath)),currentSha256:sha(current),frozenRenamedSha256:sha(frozen),equalitySha256:sha(equality)},
  checks,csv,generated,helperEmissionObserved,processStatus:result.status,signal:result.signal,
  simulationSucceeded:log.includes('The simulation finished successfully.'),rumocaArtifactIssued:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','tracking-geometry.mos','TrackingHelpers.mo','semantics.log','driver-stderr.log',`${model}_res.csv`]){
  const source=path.join(output,name);if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
fs.cpSync(path.join(output,'source-preimages'),path.join(durable,'source-preimages'),{recursive:true});
fs.mkdirSync(path.join(durable,'generated'),{recursive:true});
for(const source of generated)fs.copyFileSync(path.join(output,source.path),path.join(durable,'generated',source.path));
console.log(JSON.stringify({durable,...report}));process.exitCode=pass?0:1;
