// Full-raster reference math and source wiring. Production compilation is Rumoca.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'descriptor-frame-guard-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['models/RGBDFeatureMatching.mo','tests/modelica/RGBDLocalizationInitializeTests.mo',
  'tests/modelica/RGBDDescriptorFrameGuardTests.mo','models/RGBDVisualObservation.mo',
  'models/RGBDInertialLocalizationStep.mo','models/RGBDInertialLocalizationInitialize.mo',
  'dev/check-modelica-descriptor-frame-guard.mjs'];
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const text=name=>fs.readFileSync(path.join(output,'sources',name),'utf8');
const baseline=fs.readFileSync(path.join(app,'dev/artifacts/modelica-descriptor-frame-guard/preimages/RGBDFeatureMatching.mo'),'utf8');
const grayExpression=value=>value.match(/gray\[y,x\]\s*(?::=|=)\s*([\s\S]*?);/)?.[1].replace(/\s+/g,'');
const wiring={
  grayscaleExpressionUnchanged:grayExpression(baseline)===grayExpression(text(names[0])),
  referenceGrayscaleUnchanged:grayExpression(baseline)===grayExpression(text(names[2])),
  modelCallsGuardedFunction:/DescribeRGBDFrame\(rgb,depth,pixels,activeCount,[\s\S]*minimumContrast,imageEnabled\)/.test(text(names[0])),
  visualPassesFlag:/RGBDDescriptorFrame description\(imageEnabled=imageEnabled,/.test(text(names[3])),
  stepUsesExactAcquisition:/RGBDVisualRelativeObservation visual\(imageEnabled=imageOn,/.test(text(names[4]))&&/imageOn = SLAMExactRealEqual\(frameEnabled,1\.0\)/.test(text(names[4])),
  initializeUsesAcceptedAcquisition:/DescribeRGBDFrame\(\s*rgb,depth,pixels,if imageOn and initializationAccepted > 0\.5 then activeCount else 0\.0,[\s\S]*minimumContrast,imageOn and initializationAccepted > 0\.5\)/.test(text(names[5]))
    &&/imageOn := SLAMExactRealEqual\(frameEnabled,1\.0\)/.test(text(names[5]))
};
const model='RGBDDescriptorFrameGuardAcceptance';
const debugFlags='gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
const script=path.join(output,'descriptor-frame.mos');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debugFlags)});\n`
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +names.slice(0,3).map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=15.25,numberOfIntervals=61,outputFormat="csv",variableFilter="checks.*|scenario");\ngetErrorString();\n`);
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
  const expected=['time','scenario',...Array.from({length:8},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name));
  const checkIndices=expected.slice(2).map(name=>columns.indexOf(name));
  const timeIndex=columns.indexOf('time'),scenarioIndex=columns.indexOf('scenario');
  const rowsValid=columnsValid&&rows.length>=62&&rows.every(row=>row.length===expected.length
    &&row.every(Number.isFinite)&&Number.isInteger(row[scenarioIndex])&&row[scenarioIndex]>=1&&row[scenarioIndex]<=16
    &&checkIndices.every(index=>row[index]===0||row[index]===1))
    &&rows[0][timeIndex]===0&&rows.at(-1)[timeIndex]===15.25;
  const scenarios=rowsValid?[...new Set(rows.map(row=>row[scenarioIndex]))].sort((a,b)=>a-b):[];
  if(rowsValid)checks=checkIndices.map(index=>rows.every(row=>row[index]===1));
  modelResult={path:filename,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,scenarios,
    allScenariosObserved:scenarios.length===16,
    failedRows:rowsValid?rows.filter(row=>checkIndices.some(index=>row[index]!==1)):[],
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=processResult.status===0&&bookendsEqual&&Object.values(wiring).every(Boolean)
  &&checks.length===8&&checks.every(Boolean)&&modelResult?.allScenariosObserved===true&&modelResult?.simulationSucceeded===true;
const generated=fs.readdirSync(output).filter(name=>name.endsWith('_functions.c')).map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name)))}));
const report={status:pass?'OMC_FULL_RASTER_DESCRIPTOR_GUARD_PASS':'FAILED_OR_INCOMPLETE',
  scope:'Actual DescribeRGBDFrame function: full90x160 raw RGBA/depth and350x49 descriptor outputs,16 dynamic scenarios, baseline extraction parity, independent descriptor/optical-point expectations, disabled poison and re-enabled identical image. Source-only model wiring checks; not the complete localization model.',
  compilerVersion:version.stdout.trim(),debugFlags,sources,bookendsEqual,wiring,checks,modelResult,generated,
  processStatus:processResult.status,signal:processResult.signal,
  rumocaArtifactIssued:false,browserIntegrated:false,wasmPerformanceMeasured:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-descriptor-frame-guard',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','semantics.log','descriptor-frame.mos',filename,...generated.map(entry=>entry.path)]){
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
}
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:durable,scratchDirectory:output,...report}));
process.exitCode=pass?0:1;
