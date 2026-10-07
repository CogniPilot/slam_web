// Full raw-camera OMC reference; no Rumoca or browser acceptance is implied.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'rgbd-relative-function-'));
const model='RGBDVisualRelativeFunctionAcceptance',caseCount=25,checkCount=12;
const names=['models/Vision/Matching/RGBDFeatureMatching.mo','models/Math/RigidPointRegistration.mo','models/Estimation/Localization/RGBDRelativePose.mo',
  'models/Estimation/Localization/RGBDRegistrationUncertainty.mo','models/Estimation/Localization/RGBDVisualObservation.mo','models/Estimation/Localization/RGBDVisualRelativeObservation.mo',
  'tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const sources=[...names,'dev/check-modelica-visual-relative-function.mjs','dev/rumoca-bounded-run.mjs']
  .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const sourceDir=path.join(output,'source-preimages');fs.mkdirSync(sourceDir,{recursive:true});
for(const source of sources){const bytes=fs.readFileSync(path.join(app,source.path));
  if(sha(bytes)!==source.sha256)throw Error(`Source changed while freezing: ${source.path}`);
  const dest=path.join(sourceDir,source.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);}
const script=path.join(output,'relative-function.mos');
const debug='gen,execstat,dumpBackendClocks,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
const options='--preOptModules-=evalFunc';
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debug)});\nsetCommandLineOptions(${JSON.stringify(options)});\n`
  +names.map(name=>`loadFile(${JSON.stringify(path.join(sourceDir,name))});`).join('\n')
  +`\ngetErrorString();\nwriteFile("phase.txt","simulate requested");\nsimulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",cflags="-O0");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(sourceDir,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
function parse(line){const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){cells.push(value);value='';}else value+=c;}
  if(quoted)throw Error('Unterminated CSV quote');cells.push(value);return cells;}
const fields=['valid','relativeValid','matchCount','registrationAccepted','registrationReason','rms','uncertaintyValid',
  'uncertaintyReason','uncertaintyCount','uncertaintyInvalid','descriptionInvalid','matchingValid','invalidReference',
  'invalidCurrent','bodyX','bodyY','bodyZ','translationX','translationY','translationZ','lateCurrentIndex'];
const expected=['time'];
for(const [prefix,shape] of [['checks',[caseCount,checkCount]],['raw',[caseCount,fields.length]],
  ['rawRelative',[caseCount,6,6]],['rawConditional',[caseCount,6,6]],['rawLateDescriptor',[caseCount,49]],
  ['rawLatePoint',[caseCount,3]],['rawRotation',[caseCount,3,3]],['rawBodyRotation',[caseCount,3,3]]]){
  const visit=(indexes)=>{if(indexes.length===shape.length)expected.push(`${prefix}[${indexes.join(',')}]`);
    else for(let i=1;i<=shape[indexes.length];i++)visit([...indexes,i]);};visit([]);
}
const file=path.join(output,`${model}_res.csv`);let cases=[],csv=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8'),lines=raw.trim().split(/\r?\n/);const columns=parse(lines[0]);
  const index=new Map(columns.map((name,i)=>[name,i]));const cells=lines.slice(1).map(parse);
  const lexical=cells.every(row=>row.every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rows=cells.map(row=>row.map(Number));
  const columnsValid=columns.length===expected.length&&index.size===expected.length&&expected.every(name=>index.has(name));
  const checkNames=expected.filter(name=>name.startsWith('checks['));
  const rowsValid=columnsValid&&lexical&&rows.length>=2&&rows.every(row=>row.length===expected.length&&row.every(Number.isFinite)
    &&checkNames.every(name=>row[index.get(name)]===0||row[index.get(name)]===1))
    &&rows[0][index.get('time')]===0&&rows.at(-1)[index.get('time')]===0.001;
  if(rowsValid)cases=Array.from({length:caseCount},(_,i)=>({scenario:i+1,
    checks:Array.from({length:checkCount},(_,j)=>rows.every(row=>row[index.get(`checks[${i+1},${j+1}]`)]===1)),
    raw:Object.fromEntries(fields.map((name,j)=>[name,rows[0][index.get(`raw[${i+1},${j+1}]`)]]))}));
  csv={path:path.basename(file),sha256:sha(raw),columns:columns.length,columnsValid,rowsValid,rows:rows.length};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const frozenSourcesEqual=sources.every(source=>sha(fs.readFileSync(path.join(sourceDir,source.path)))===source.sha256);
const original=JSON.parse(fs.readFileSync(path.join(app,'dev/artifacts/rgbd-relative-function/preimages.json')));
const originalPrefixes=original.map(source=>{const old=fs.readFileSync(path.join(app,'dev/artifacts/rgbd-relative-function/source-preimages',path.basename(source.path)));
  const now=fs.readFileSync(path.join(app,source.path));return {...source,prefixUnchanged:sha(old)===source.sha256&&now.subarray(0,old.length).equals(old),
    entireUnchanged:now.equals(old)};});
const generatedC=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).sort().map(name=>({path:name,
  bytes:fs.statSync(path.join(output,name)).size,sha256:sha(fs.readFileSync(path.join(output,name)))}));
const simulationSucceeded=log.includes('The simulation finished successfully.');
const pass=result.status===0&&bookendsEqual&&frozenSourcesEqual&&originalPrefixes.every(s=>s.prefixUnchanged)&&simulationSucceeded
  &&cases.length===caseCount&&cases.every(c=>c.checks.every(Boolean));
const report={status:pass?'OMC_FULL_RAW_VISUAL_RELATIVE_FUNCTION_PASS':'FAILED_OR_INCOMPLETE',model,
  scope:'Actual pure full90x160RGBA/depth+350reference/current pipeline,25controls/12groups. Independent measured descriptor basis, calibrated noncoplanar optical points, nonidentity rigid/body transform, and complete36cell relative/conditional covariance via independent partial-pivot dense oracle. No reduced domains.',
  compilerVersion:version.stdout.trim(),debug,options,cflags:'-O0',sources,bookendsEqual,frozenSourcesEqual,originalPrefixes,cases,csv,
  generatedC,generatedCStorage:'Owned HOME/scratch output directory retained; hashes recorded, not copied to source repository',
  simulationSucceeded,processStatus:result.status,signal:result.signal,referenceFunctionQualified:pass,
  equationVisualRelativeModelDifferentialQualified:false,rumocaArtifactIssued:false,initializerQualified:false,
  browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/rgbd-relative-function',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','relative-function.mos',`${model}_res.csv`]){
  const from=path.join(output,name);if(fs.existsSync(from))fs.copyFileSync(from,path.join(durable,name));}
fs.cpSync(sourceDir,path.join(durable,'source-preimages'),{recursive:true});
console.log(JSON.stringify({directory:output,report:path.join(durable,'report.json'),status:report.status,
  processStatus:result.status,bookendsEqual,csv,cases:cases.map(c=>({scenario:c.scenario,failed:c.checks.flatMap((v,i)=>v?[]:[i+1]),raw:c.raw}))}));
process.exitCode=pass?0:1;
