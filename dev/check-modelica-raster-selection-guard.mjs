// Full14400-slot reference test; no host selection or production code generation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'raster-selection-guard-'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const names=['models/Vision/Features/FeatureSelection.mo','tests/modelica/RasterSelectionReference.mo',
  'tests/modelica/RasterSelectionGuardTests.mo','models/Estimation/Localization/RGBDFastInertialLocalizationStep.mo',
  'models/Estimation/Localization/RGBDFastInertialLocalizationInitialize.mo','dev/check-modelica-raster-selection-guard.mjs'];
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,source.path),target);}
const text=name=>fs.readFileSync(path.join(output,'sources',name),'utf8');
const initializer=text(names[4]).split('function InitializeFastRGBDLocalization')[1]?.split('end InitializeFastRGBDLocalization')[0]??'';
const adapter=text(names[4]).split('model RGBDFastInertialLocalizationInitialize')[1]?.split('end RGBDFastInertialLocalizationInitialize')[0]??'';
const step=text(names[3]).split('function AdvanceFastRGBDLocalization')[1]?.split('end AdvanceFastRGBDLocalization')[0]??'';
const stepAdapter=text(names[3]).split('model RGBDFastInertialLocalizationStep')[1]?.split('end RGBDFastInertialLocalizationStep')[0]??'';
const acquisitionInputs=['rgb','depth','rgbCalibration','depthCalibration','disparityNoise',
  'noiseReferenceFx','baseline','opticalToBody','cameraOriginBody','frameEnabled'];
const forwardsAcquisition=(body,name)=>{
  const compact=body.replace(/\s+/g,'');
  return [acquisitionInputs.join(','),acquisitionInputs.map(input=>`${input}=${input}`).join(',')]
    .some(prefix=>compact.includes(`):=${name}(${prefix},`));
};
const exactSelection=body=>(body.match(/imageOn\s*:=/g)??[]).length===1
  &&/imageOn\s*:=\s*SLAMExactRealEqual\(frameEnabled\s*,\s*1\.0\)/.test(body)
  &&/SelectRasterFeatures\(scores,\s*imageWidth,imageHeight,imageWidth\*imageHeight,3,\s*\{absoluteThreshold,0\.0,1e8,3\.0,selectedFeatureLimit,1\.0,3\.0,3\.0\},false,imageOn\)/.test(body);
const wiring={modelPassesFlag:/SelectRasterFeatures\(scores,width,height,capacity,minimumBorder,settings,grid,enabled\)/.test(text(names[0])),
  stepBindsExactAcquisition:exactSelection(step),
  initializerBindsExactAcquisition:exactSelection(initializer),
  stepAdapterForwardsFrameFlag:forwardsAcquisition(stepAdapter,'AdvanceFastRGBDLocalization'),
  initializerAdapterForwardsFrameFlag:forwardsAcquisition(adapter,'InitializeFastRGBDLocalization')};
const model='RasterSelectionGuardAcceptance';
const debugFlags='gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize';
const script=path.join(output,'selection.mos');
fs.writeFileSync(script,`setDebugFlags(${JSON.stringify(debugFlags)});\nsetCommandLineOptions("--preOptModules-=evalFunc");\n`
  +names.slice(0,3).map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +`\ngetErrorString();\nsimulate(${model},stopTime=15.25,numberOfIntervals=61,outputFormat="csv",variableFilter="checks.*|scenario");\ngetErrorString();\n`);
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
  const expected=['time','scenario',...Array.from({length:6},(_,i)=>`checks[${i+1}]`)];
  const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(name=>columns.includes(name));
  const indices=expected.slice(2).map(name=>columns.indexOf(name)),ti=columns.indexOf('time'),si=columns.indexOf('scenario');
  const rowsValid=columnsValid&&rows.length>=62&&rows.every(row=>row.length===8&&row.every(Number.isFinite)
    &&Number.isInteger(row[si])&&row[si]>=1&&row[si]<=16&&indices.every(i=>row[i]===0||row[i]===1))
    &&rows[0][ti]===0&&rows.at(-1)[ti]===15.25;
  const scenarios=rowsValid?[...new Set(rows.map(row=>row[si]))].sort((a,b)=>a-b):[];
  if(rowsValid)checks=indices.map(i=>rows.every(row=>row[i]===1));
  modelResult={path:filename,sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,scenarios,
    allScenariosObserved:scenarios.length===16,failedRows:rowsValid?rows.filter(row=>indices.some(i=>row[i]!==1)):[],
    simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&bookendsEqual&&Object.values(wiring).every(Boolean)&&checks.length===6&&checks.every(Boolean)
  &&modelResult?.allScenariosObserved===true&&modelResult?.simulationSucceeded===true;
const generated=fs.readdirSync(output).filter(name=>name.endsWith('_functions.c')).map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(output,name)))}));
const report={status:pass?'OMC_FULL_RASTER_SELECTION_GUARD_PASS':'FAILED_OR_INCOMPLETE',
  scope:'SelectRasterFeatures full14400 scores and14400x3 outputs,16 dynamic cases: exact original enabled parity, disabled poison/zero threshold/grid/configuration, full cap, stable ties and lazy grid score validation. Model bindings are source checks.',
  compilerVersion:version.stdout.trim(),debugFlags,sources,bookendsEqual,wiring,checks,modelResult,generated,processStatus:result.status,
  rumocaArtifactIssued:false,browserIntegrated:false,wasmPerformanceMeasured:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-image-acquisition-guard',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','resources.json','command.json','semantics.log','selection.mos',filename,...generated.map(entry=>entry.path)])
  if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
console.log(JSON.stringify({directory:durable,scratchDirectory:output,...report}));process.exitCode=pass?0:1;
