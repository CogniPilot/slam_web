// Full-raster OMC reference semantics and structured source guard inspection.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scalarize=!process.argv.includes('--array-equations');
const functionOnly=process.argv.includes('--function');
const referenceFlags=`gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,${scalarize?'nfScalarize':'-nfScalarize'}`;
const root=path.join(os.homedir(),'scratch/slam_web/tmp');
fs.mkdirSync(root,{recursive:true});
const output=fs.mkdtempSync(path.join(root,'fast-frame-guard-semantics-'));
const compilationNames=['models/Vision/Features/FastNativeFrame.mo','tests/modelica/FastNativeFrameGuardTests.mo',
  functionOnly?'tests/modelica/FastFrameScoresGuardAcceptance.mo':'tests/modelica/FastNativeFrameGuardAcceptance.mo'];
const model=functionOnly?'FastFrameScoresGuardAcceptance':'FastNativeFrameGuardAcceptance';
const wrapperNames=['models/Estimation/Localization/RGBDFastInertialLocalizationStep.mo','models/Estimation/Localization/RGBDFastInertialLocalizationInitialize.mo'];
const names=[...compilationNames,...wrapperNames,'dev/check-modelica-fast-frame-guard.mjs'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=names.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
for(const source of sources){
  const target=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.copyFileSync(path.join(app,source.path),target);
}
const strip=value=>value.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' ')
  .replace(/"(?:\\.|[^"\\])*"/g,' ');
const authored=strip(fs.readFileSync(path.join(output,'sources',compilationNames[0]),'utf8'));
const detector=authored.split('model FastNativeFrame')[1]?.split('end FastNativeFrame')[0]??'';
const helper=authored.split('function FastFrameScores')[1]?.split('end FastFrameScores')[0]??'';
// This helper has one algorithmic if statement, with all raster reads/calls
// inside its body. Record the relevant source nodes; execution is checked below.
const branch=helper.match(/if\s+enabled\s+then([\s\S]*?)end\s+if\s*;/);
const gray=branch?.[1].match(/gray\[row,column\]\s*:=\s*([\s\S]*?);/);
const grayReads=gray?.[1].match(/rgb\[row,column,[123]\]/g)??[];
const acquisitionInputs=['rgb','depth','rgbCalibration','depthCalibration','disparityNoise',
  'noiseReferenceFx','baseline','opticalToBody','cameraOriginBody','frameEnabled'];
const forwardsAcquisition=(body,name)=>{
  const compact=body.replace(/\s+/g,'');
  return [acquisitionInputs.join(','),acquisitionInputs.map(input=>`${input}=${input}`).join(',')]
    .some(prefix=>compact.includes(`):=${name}(${prefix},`));
};
const wrappers=wrapperNames.map(name=>{
  const source=strip(fs.readFileSync(path.join(output,'sources',name),'utf8'));
  const step=name.endsWith('Step.mo');
  const functionName=step?'AdvanceFastRGBDLocalization':'InitializeFastRGBDLocalization';
  const modelName=step?'RGBDFastInertialLocalizationStep':'RGBDFastInertialLocalizationInitialize';
  const initializer=source.split('function '+functionName)[1]?.split('end '+functionName)[0]??'';
  const adapter=source.split('model '+modelName)[1]?.split('end '+modelName)[0]??'';
  return {path:name,kind:'function',exactFrameEnabledBinding:
    (initializer.match(/imageOn\s*:=/g)??[]).length===1
    &&/imageOn\s*:=\s*SLAMExactRealEqual\(frameEnabled\s*,\s*1\.0\)/.test(initializer)
    &&/scores\s*:=\s*FastFrameScores\(rgb\s*,\s*imageOn\)/.test(initializer)
    &&forwardsAcquisition(adapter,functionName)};
});
const structuralChecks={defaultEnabledTrue:[detector,helper].every(value=>/input\s+Boolean\s+enabled\s*=\s*true/.test(value)),
  modelCallsGuardedArrayFunction:/scores\s*=\s*FastFrameScores\(rgb,enabled\)/.test(detector),
  grayscaleRGBReadsGuarded:!!gray&&grayReads.length===3,
  noAlphaRead:!helper.includes('rgb[row,column,4]'),
  singlePatchCallUnderEnabledBranch:(helper.match(/FastPatchScore\(/g)??[]).length===1
    &&(branch?.[1].match(/FastPatchScore\(/g)??[]).length===1,
  radiusAndBordersPreserved:/constant Integer radius\s*=\s*3/.test(helper)
    &&/for row in radius\+1:size\(rgb,1\)-radius loop/.test(branch?.[1]??'')
    &&/for column in radius\+1:size\(rgb,2\)-radius loop/.test(branch?.[1]??'')
    &&/scores\s*:=\s*zeros\(size\(rgb,1\)\*size\(rgb,2\)\)/.test(helper),
  bothWrappersBindExactFrameEnabled:wrappers.every(item=>item.exactFrameEnabledBinding)};
const structural={method:'Inspection of the array function algorithmic if and raster loops; not a compiler AST or an execution-cost measurement',
  checks:structuralChecks,pass:Object.values(structuralChecks).every(Boolean),
  acquisitionBranch:branch?{kind:'AlgorithmicIf',condition:'enabled',body:branch[1]}:null,
  grayscaleExpression:gray?.[1]??null,wrappers};
fs.writeFileSync(path.join(output,'source-guard-inspection.json'),JSON.stringify(structural,null,2)+'\n');
const script=path.join(output,'fast-frame-guard.mos');
fs.writeFileSync(script,`setDebugFlags("${referenceFlags}");\n`
  +'setCommandLineOptions("--preOptModules-=evalFunc");\n'
  +compilationNames.map(name=>`loadFile(${JSON.stringify(path.join(output,'sources',name))});`).join('\n')
  +'\ngetErrorString();\nwriteFile("phase.txt","simulation requested");\n'
  +`simulate(${model},stopTime=3.25,numberOfIntervals=13,outputFormat="csv",variableFilter="checks.*|frameEnabled");\ngetErrorString();\n`);
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192',
  '--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7',
  'env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const file=path.join(output,`${model}_res.csv`);
let checks=[],modelResult=null;
if(fs.existsSync(file)){
  const raw=fs.readFileSync(file,'utf8'),lines=raw.trim().split(/\r?\n/);
  const columns=lines[0].split(',').map(value=>value.replace(/^"|"$/g,''));
  const rows=lines.slice(1).map(line=>line.split(',').map(Number));
  const expected=['time','frameEnabled',...Array.from({length:4},(_,index)=>`checks[${index+1}]`)];
  const columnsValid=columns.length===expected.length&&new Set(columns).size===expected.length&&expected.every(value=>columns.includes(value));
  const timeIndex=columns.indexOf('time'),enabledIndex=columns.indexOf('frameEnabled');
  const rowsValid=columnsValid&&rows.length>=14&&rows.every(row=>row.length===expected.length&&Number.isFinite(row[timeIndex])
    &&row.every((value,index)=>index===timeIndex||(value===0||value===1)))
    &&rows[0][timeIndex]===0&&rows.at(-1)[timeIndex]===3.25;
  if(columnsValid&&rowsValid)checks=expected.slice(2).map(name=>rows.every(row=>row[columns.indexOf(name)]===1));
  const phases=[{time:0,enabled:0},{time:1.25,enabled:1},{time:2.25,enabled:0},{time:3.25,enabled:1}]
    .map(phase=>({...phase,observed:rows.some(row=>row[timeIndex]===phase.time&&row[enabledIndex]===phase.enabled)}));
  modelResult={path:path.basename(file),sha256:sha(raw),columnsValid,rowsValid,rows:rows.length,phases,
    phasesObserved:phases.every(phase=>phase.observed),simulationSucceeded:log.includes('The simulation finished successfully.')};
}
const bookendsEqual=sources.every(source=>sha(fs.readFileSync(path.join(app,source.path)))===source.sha256);
const pass=result.status===0&&structural.pass&&bookendsEqual&&checks.length===4&&checks.every(Boolean)
  &&modelResult?.simulationSucceeded===true&&modelResult?.phasesObserved===true;
const report={status:pass?(functionOnly?'OMC_FULL_RASTER_FAST_FUNCTION_GUARD_PASS':'OMC_MODELICA_SEMANTICS_AND_SOURCE_GUARD_PASS'):'FAILED_OR_INCOMPLETE',
  scope:`Actual full90x160 ${functionOnly?'FastFrameScores function':'FastNativeFrame model instance'}, all57600RGBA/all14400scores: poisoned disabled inputs, independent FAST9 enabled oracle, center120/borderzeros, poisonedalphaignored, disabled/enabled/disabled/sameimage-reenabled phases; separate source guard inspection`,
  compilerVersion:version.stdout.trim(),referenceFlags,sources,bookendsEqual,structuralChecks,structuralPass:structural.pass,checks,modelResult,
  processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false,
  functionOnly,modelInstanceQualified:pass&&!functionOnly,functionQualified:pass&&functionOnly,
  wasmPerformanceMeasured:false,executionCostProven:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-fast-frame-guard-semantics',path.basename(output));
fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','source-guard-inspection.json','semantics.log','resources.json','command.json','fast-frame-guard.mos',`${model}_res.csv`]){
  const source=path.join(output,name);
  if(fs.existsSync(source))fs.copyFileSync(source,path.join(durable,name));
}
fs.cpSync(path.join(output,'sources'),path.join(durable,'sources'),{recursive:true});
for(const name of fs.readdirSync(output))if(name.endsWith('_functions.c'))fs.copyFileSync(path.join(output,name),path.join(durable,name));
console.log(JSON.stringify({directory:output,...report}));
process.exitCode=pass?0:1;
