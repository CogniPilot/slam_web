// Full ES15/reference-state semantics; production compilation belongs to Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'held-imu-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['models/Estimation/Localization/RGBDRelativePose.mo','models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo',
  'models/Estimation/Inertial/ES15NominalPrediction.mo','models/Estimation/Inertial/ES15Dynamics.mo','models/Estimation/Inertial/ES15CovariancePrediction.mo',
  'models/Estimation/Inertial/SchmidtReferenceState.mo','tests/modelica/ES15SchmidtPredictionReference.mo',
  'tests/modelica/ES15HeldIntervalTests.mo','models/Estimation/Localization/RGBDLocalizationCatalog.mo',
  'src/modelica-localization-session.ts','dev/check-modelica-held-imu.mjs'];
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,source.path),target);}
const text=name=>fs.readFileSync(path.join(output,'sources',name),'utf8');
const wiring={publicPredictionUsesFunction:/ES15PredictHeldInterval\(/.test(text('models/Estimation/Inertial/SchmidtReferenceState.mo')),
  catalogUsesHeldBound:(text('models/Estimation/Localization/RGBDLocalizationCatalog.mo').match(/ES15HeldIntervalValid\(h\)/g)??[]).length===2,
  hostPreservesIntervals:/const intervals=imuIntervals\(frame,\.2\)/.test(text('src/modelica-localization-session.ts'))};
const model='ES15HeldIntervalAcceptance';
const debugFlags='gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
const script=path.join(output,'held-imu.mos');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debugFlags)});\nsetCommandLineOptions("--preOptModules-=evalFunc");\n`
  +names.slice(0,8).map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=23.25,numberOfIntervals=93,outputFormat="csv",variableFilter="checks.*|scenario");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const filename=model+'_res.csv';let checks=[],modelResult=null;
if(fs.existsSync(path.join(output,filename))){
  const raw=fs.readFileSync(path.join(output,filename),'utf8'),lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(x=>x.replace(/^"|"$/g,'')),rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time','scenario',...Array.from({length:16},(_,i)=>`checks[${i+1}]`)];
  const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name));
  const indices=expected.slice(2).map(name=>columns.indexOf(name)),ti=columns.indexOf('time'),si=columns.indexOf('scenario');
  const lexicalValid=lines.slice(1).every(line=>line.split(',').every(value=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)));
  const rowsValid=columnsValid&&lexicalValid&&rows.length>=94&&rows.every(row=>row.length===18&&row.every(Number.isFinite)
    &&Number.isInteger(row[si])&&row[si]>=1&&row[si]<=24&&indices.every(i=>row[i]===0||row[i]===1))
    &&rows[0][ti]===0&&rows.at(-1)[ti]===23.25;
  const scenarios=rowsValid?[...new Set(rows.map(row=>row[si]))].sort((a,b)=>a-b):[];
  if(rowsValid)checks=indices.map(i=>rows.every(row=>row[i]===1));
  modelResult={path:filename,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,scenarios,
    allScenariosObserved:scenarios.length===24,failedRows:rowsValid?rows.filter(row=>indices.some(i=>row[i]!==1)):[],
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&Object.values(wiring).every(Boolean)&&checks.length===16&&checks.every(Boolean)
  &&modelResult?.allScenariosObserved===true&&modelResult?.simulationSucceeded===true;
const generated=fs.readdirSync(output).filter(name=>name.endsWith('_functions.c')).map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name)))}));
const report={status:pass?'OMC_FULL_ES15_HELD_INTERVAL_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Actual ES15SchmidtPrediction model, full15 current+6 reference covariance;24 dynamic cases,16 checks: original equation-model single-step parity, independent analytic constant-dynamics transition/noise/nominal/covariance, angular subdivision, singular clone, unavailable buffers, invalid inputs and late-substep atomic rollback. Browser/full SLAM unqualified.',
  compilerVersion:version.stdout.trim(),debugFlags,sources,bookendsEqual,wiring,checks,modelResult,generated,processStatus:result.status,
  rumocaArtifactIssued:false,browserIntegrated:false,wasmPerformanceMeasured:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-held-imu',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','semantics.log','held-imu.mos',filename,...generated.map(entry=>entry.path)])
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:durable,scratchDirectory:output,...report}));process.exitCode=pass?0:1;
