// Staged first-pair patch inspection; default prepares only. No host tracking/estimation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
import {validatePreparedRGBFlightInput} from './prepare-modelica-rgb-flight-input.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
const flags=process.argv.slice(3);
if(process.argv.length<3||flags.some(flag=>!['--run','--representation=0','--representation=1','--interpolation=0','--interpolation=1','--cycle=0','--cycle=0.25'].includes(flag))
 ||new Set(flags).size!==flags.length||flags.filter(flag=>flag.startsWith('--representation=')).length>1
 ||flags.filter(flag=>flag.startsWith('--interpolation=')).length>1||flags.filter(flag=>flag.startsWith('--cycle=')).length>1)
 throw Error('Usage: node dev/check-modelica-flight-patches.mjs <frozen flight receipt or checked RGB-only preparation> [--representation=0|1] [--interpolation=0|1] [--cycle=0|0.25] [--run]');
const run=flags.includes('--run'),representationMode=flags.includes('--representation=1')?1:0;
const interpolationMethod=flags.includes('--interpolation=1')?1:0;
const maximumCycleError=flags.includes('--cycle=0.25')?.25:0;
const input=fs.realpathSync(path.resolve(process.argv[2])),old=JSON.parse(fs.readFileSync(path.join(input,'report.json')));
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'flight-patch-diagnostics-'));
const durable=path.join(app,'dev/artifacts/modelica-flight-patches',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const assert=(value,message)=>{if(!value)throw Error(message);};
const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
const json=(name,value)=>fs.writeFileSync(path.join(durable,name),JSON.stringify(value,null,2)+'\n');
const model='RGBDRenderedFlightPatchDiagnostics',capacity=350;
const labels={
 tracks:['referenceSlot','referenceEnabled','referenceDomainValid','referenceU','referenceV','seedU','seedV','trackAccepted','reason','iterations','ssd','minimumEigenvalue','trackedU','trackedV','depthValid','targetX','targetY','targetZ','candidate','robustInlier','predictedPointResidual','sourceX','sourceY','sourceZ','seedValid'],
 details:['stopDetail','evaluated','lastEvaluatedU','lastEvaluatedV','acceptedTrial','lastAcceptedTrialU','lastAcceptedTrialV','initialSsd','stepValid','lastRawStepU','lastRawStepV','lastRawStepNorm','lastBacktrack','lastTrialScale','lastTrialU','lastTrialV','lastTrialInSearch','lastTrialValid','lastTrialSsd','windowRejects','sampleRejects','nonDecreaseRejects','lastEnergy','maximumEigenvalue','lastGradientU','lastGradientV'],
 selfControls:['referenceSlot','referenceEnabled','referenceSampleValid','referenceMaxCellDifference','referenceSsd','referenceEnergy','selfExactAccepted','selfExactReason','selfExactIterations','selfExactSsd','selfExactEigenvalue','selfExactStop','selfSeedAccepted','selfSeedReason','selfSeedIterations','selfSeedSsd','selfSeedEigenvalue','selfSeedStop','currentAtReferenceValid','currentAtReferenceSsd','currentAtReferenceEnergy','currentAtSeedValid','currentAtSeedSsd','currentAtSeedEnergy'],
 fits:['accepted','reason','validCount','invalidCount','rank','cost','rms','eigenGap','sourceCentroidX','sourceCentroidY','sourceCentroidZ','targetCentroidX','targetCentroidY','targetCentroidZ','R11','R12','R13','R21','R22','R23','R31','R32','R33','tX','tY','tZ'],
 summary:['pairValid','pairEligible','predictionAccepted','geometryCompatible','contextValid','referenceEnabled','invalidReference','validSeeds','tracked','validDepth','geometricCandidates','robustInliers','originalAccepted','originalRms','robustAccepted','robustRms','initializationAccepted','referenceCount','referenceEnabledCount','referenceEpoch','allHoldsAccepted','predictedBodyX','predictedBodyY','predictedBodyZ','representationMode'],
 templateInfo:['representationMode','templateValid','trackInvoked'],
 cycleDetails:['forwardAccepted','invoked','qualified','reason','reverseAccepted','reverseReason','reverseIterations','returnedU','returnedV','cycleError','reverseSsd','reverseEigenvalue'],
 prediction:['accepted','substeps','endTime'],fitMethods:['original','robust']};
function csv(file){
 if(!fs.existsSync(file))return {present:false};
 const bytes=fs.readFileSync(file),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
 const header=[...first.matchAll(/"([^"]*)"/g)].map(m=>m[1]);
 const names=['time',...Array.from({length:8},(_,i)=>`checks[${i+1}]`),...labels.summary.map((_,i)=>`summary[${i+1}]`),'writerSuccess','samplerMode','cycleMode'];
 const columnsValid=header.map(JSON.stringify).join(',')===first&&header.length===names.length&&new Set(header).size===names.length&&names.every(n=>header.includes(n));
 const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
 const lexicalValid=lines.length>=2&&lines.every(line=>line.split(',').every(value=>numeric.test(value)));
 const rows=lines.map(line=>line.split(',').map(Number));
 const finiteRows=columnsValid&&lexicalValid&&rows.every(row=>row.length===names.length&&row.every(Number.isFinite));
 if(!finiteRows)return {present:true,sha256:sha(bytes),columns:header.length,expectedColumns:names.length,columnsValid,lexicalValid,finiteRows};
 const indices=new Map(header.map((name,index)=>[name,index])),read=(row,name)=>row[indices.get(name)];
 const times=rows.map(row=>read(row,'time'));
 const rowsValid=times[0]===0&&times.at(-1)===.001&&times.every((t,i)=>t>=0&&t<=.001&&(i===0||t>=times[i-1]));
 const checks=Array.from({length:8},(_,i)=>rows.every(row=>read(row,`checks[${i+1}]`)===1));
 const summary=labels.summary.map((_,i)=>read(rows[0],`summary[${i+1}]`));
 const repeatedSummaryEqual=rows.every(row=>header.every((name,index)=>name==='time'||row[index]===rows[0][index]));
 const writerSuccess=rows.every(row=>read(row,'writerSuccess')===1);
 const samplerModes=rows.map(row=>read(row,'samplerMode'));
 const samplerIdentityMatches=samplerModes.every(value=>value===interpolationMethod)
  &&rows.every(row=>read(row,'cycleMode')===maximumCycleError);
 return {present:true,sha256:sha(bytes),columns:header.length,columnsValid,lexicalValid,finiteRows,rowsValid,rows:rows.length,times,checks,repeatedSummaryEqual,summary,writerSuccess,samplerModes,samplerIdentityMatches};
}
function sidecar(file,result){
 if(!fs.existsSync(file))return {present:false};
 const bytes=fs.readFileSync(file),expectedCells=65907,name='diagnostics';
 assert(bytes.length>=20,'Complete diagnostic MATv4 header');
 const type=bytes.readInt32LE(0),rows=bytes.readInt32LE(4),columns=bytes.readInt32LE(8),imaginary=bytes.readInt32LE(12),length=bytes.readInt32LE(16);
 assert(type===0&&imaginary===0&&rows===1&&columns===expectedCells&&length===name.length+1,'Exact little-endian real Float64 diagnostic matrix shape');
 assert(bytes.length===20+length+expectedCells*8&&bytes[20+length-1]===0
  &&bytes.subarray(20,20+length-1).toString('ascii')===name,'Exact sole matrix identity/length, no trailing bytes');
 const data=Array.from({length:expectedCells},(_,i)=>bytes.readDoubleLE(20+length+i*8));
 assert(data.every(Number.isFinite),'Finite complete diagnostic matrix');
 let cursor=0;const take=n=>{const values=data.slice(cursor,cursor+n);cursor+=n;return values;};
 const diagnostics={tracks:Array.from({length:capacity},()=>take(25)),details:Array.from({length:capacity},()=>take(26)),
  selfControls:Array.from({length:capacity},()=>take(24)),descriptorDifference:Array.from({length:capacity},()=>take(49)),
  templateInfo:Array.from({length:capacity},()=>take(3)),templateDifference:Array.from({length:capacity},()=>take(49)),
  fits:Array.from({length:2},()=>take(26)),
  prediction:Array.from({length:3},()=>take(3)),predictedRotation:Array.from({length:3},()=>take(3)),predictedTranslation:take(3),summary:take(25)};
 const checks=take(8);diagnostics.cycleDetails=Array.from({length:capacity},()=>take(12));
 diagnostics.maximumCycleError=take(1)[0];
 assert(diagnostics.maximumCycleError===maximumCycleError,'Executed cycle limit identity');
 assert(cursor===expectedCells,'Complete exact diagnostic field order');
 // OMC CSV emits 16 significant decimal digits; all discrete summaries remain exact.
 const realFields=new Set([14,16,22,23,24]);
 const summaryComparison=diagnostics.summary.map((value,index)=>({field:index+1,binary:value,csv:result.summary[index],
  comparison:realFields.has(index+1)?'exact 16-significant-digit decimal conversion':'exact discrete value',
  matches:(realFields.has(index+1)?Number(value.toPrecision(16)):value)===result.summary[index]}));
 assert(result.rowsValid&&summaryComparison.every(entry=>entry.matches),'Sidecar summary matches native CSV decimal rendering, no numeric tolerance');
 assert(diagnostics.summary[24]===representationMode&&diagnostics.templateInfo.every(row=>row[0]===representationMode),'Executed representation identity matches requested mode');
 assert(checks.every((value,index)=>value===(result.checks[index]?1:0)),'Sidecar execution checks match CSV exactly');
 json('diagnostics.json',{labels,...diagnostics});
 return {present:true,path:path.basename(file),sha256:sha(bytes),bytes:bytes.length,cells:expectedCells,
  matrices:[{name,rows,columns}],logicalShapes:{tracks:[capacity,25],details:[capacity,26],selfControls:[capacity,24],descriptorDifference:[capacity,49],
   templateInfo:[capacity,3],templateDifference:[capacity,49],fits:[2,26],prediction:[3,3],predictedRotation:[3,3],predictedTranslation:[3],summary:[25],checks:[8],cycleDetails:[capacity,12],maximumCycleError:[1]},
  exactDecoded:true,csvPrecision:{discreteFields:'1..13,15,17..21,25 exact',realFields:'14,16,22..24 exact Number(binary.toPrecision(16)) equality; no tolerance',summaryComparison},
  summary:diagnostics.summary,fits:diagnostics.fits,prediction:diagnostics.prediction};
}
let stage='frozen-input';
try{
 const preparedRgb=old.model==='RGBDRenderedFlightInputPreparation'?validatePreparedRGBFlightInput(input):null;
 assert(preparedRgb||(old.model==='RGBDRenderedFlightSLAMAcceptance'&&old.mat?.matrices.some(m=>m.name==='imuIntervals'&&m.rows===36&&m.columns===8)),'Actual flight receipt or recomputed RGB-only preparation required');
 const inputProvenance=preparedRgb?{inputClass:'RGB_ONLY_VARIANT_PREPARED',rgbInputPreparation:{variant:old.variant,parent:old.parent,capture:old.capture,proofRecomputed:true}}:{};
 const mat=fs.readFileSync(path.join(input,old.mat.path));assert(sha(mat)===old.mat.sha256,'Frozen actual flight MAT hash');
 copy(path.join(input,old.mat.path),path.join(output,'rendered-flight.mat'));copy(path.join(input,old.mat.path),path.join(durable,'rendered-flight.mat'));
 copy(path.join(input,'report.json'),path.join(durable,'input-report.json'));
 const productionNames=[...new Set([...rgbdSlamSourceManifest.paths,'models/SLAM/RGBDFastSLAMIntervals.mo'])];
 const names=[...productionNames,'models/Vision/Matching/RGBDPatchTracking.mo','tests/modelica/RGBDLocalizationInitializeTests.mo','tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo',
  'tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastInitializationFunctionAcceptance.mo',
  'tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastSLAMRawCompositionAcceptance.mo',
  'tests/modelica/RGBDCompleteStateComparison.mo','tests/modelica/RGBDRenderedFrameInput.mo','tests/modelica/RGBDRenderedVisualDiagnostics.mo',
  'tests/modelica/RGBDRenderedCitySLAMAcceptance.mo','tests/modelica/RGBDRenderedFlightSLAMAcceptance.mo','tests/modelica/RGBDRenderedFlightPairDiagnostics.mo','tests/modelica/RGBDRenderedFlightPatchDiagnostics.mo'];
 const sources=[...names,'src/modelica-slam-source-manifest.mjs','dev/check-modelica-flight-patches.mjs','dev/prepare-modelica-rgb-flight-input.mjs','dev/rumoca-bounded-run.mjs']
  .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
 for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
 const library=path.join(home,'.openmodelica/libraries/Modelica 4.1.0+maint.om');
 const librarySources=['package.mo','Utilities/Streams.mo'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(library,name)))}));
 for(const entry of librarySources)copy(path.join(library,entry.path),path.join(durable,'installed-msl',entry.path));
 const omc=process.env.OMC_BIN??'omc';
 const executable=fs.realpathSync(path.isAbsolute(omc)?omc:(process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}));
 const compiler={path:executable,sha256:sha(fs.readFileSync(executable))};
 const script=path.join(output,'flight-patch.mos');
 fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\ngetVersion(Modelica);\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')+'\ngetErrorString();\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|summary.*|writerSuccess|samplerMode|cycleMode",cflags="-O0",simflags=${JSON.stringify('-override=datasetFile='+path.join(output,'rendered-flight.mat')+',diagnosticFile='+path.join(output,'flight-patch-diagnostics.mat')+',representationMode='+representationMode+',interpolationMethod='+interpolationMethod+',maximumCycleError='+maximumCycleError)});\ngetErrorString();\n`);
 stage='bounded-reference';
 const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','6,7','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  executable,'--numProcs=2','--vectorizationLimit=1',script];
 fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
 if(!run){
  preserve();json('preparation.json',{status:'PREPARED_UNEXECUTED',model,representationMode,interpolationMethod,maximumCycleError,...inputProvenance,sources,librarySources,compiler,command,labels,
   inputReceipt:path.relative(app,input),inputReportSha256:sha(fs.readFileSync(path.join(input,'report.json'))),
   mat:{path:'rendered-flight.mat',sha256:old.mat.sha256,bytes:mat.length},generatedScratchHomeRelative:path.relative(home,output),
   scope:'Test-only measured-pair patch tracking, fractional calibrated depth, original strict .02 fits; no covariance/State/production integration or expected acceptance.'});
  manifest();console.log(JSON.stringify({directory:path.relative(app,durable),status:'PREPARED_UNEXECUTED',sources:sources.filter(entry=>/PatchTracking|PatchDiagnostics|flight-patches/.test(entry.path))}));process.exit(0);
 }
 const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
 fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
 const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
 let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
 const result=csv(path.join(output,model+'_res.csv'));
 const binaryDiagnostics=sidecar(path.join(output,'flight-patch-diagnostics.mat'),result);
 const bookendsEqual=sources.every(entry=>sha(fs.readFileSync(path.join(app,entry.path)))===entry.sha256&&sha(fs.readFileSync(path.join(durable,'sources',entry.path)))===entry.sha256)
  &&sha(fs.readFileSync(path.join(input,old.mat.path)))===old.mat.sha256&&sha(fs.readFileSync(path.join(output,'rendered-flight.mat')))===old.mat.sha256
  &&(!preparedRgb||validatePreparedRGBFlightInput(input).reportSha256===preparedRgb.reportSha256)
  &&librarySources.every(entry=>sha(fs.readFileSync(path.join(library,entry.path)))===entry.sha256)&&sha(fs.readFileSync(executable))===compiler.sha256;
 const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>({path:name,bytes:fs.statSync(path.join(output,name)).size,sha256:sha(fs.readFileSync(path.join(output,name)))}));
 const simulationSucceeded=log.includes('The simulation finished successfully.');
 const pass=terminal.status===0&&resources?.exitCode===0&&simulationSucceeded&&bookendsEqual&&result.rowsValid&&result.repeatedSummaryEqual&&result.writerSuccess&&result.samplerIdentityMatches&&result.checks?.every(Boolean)&&binaryDiagnostics.exactDecoded;
 const report={status:pass?'DIAGNOSTICS_EXECUTED':'FAILED_OR_INCOMPLETE',model,representationMode,interpolationMethod,maximumCycleError,...inputProvenance,
  scope:'One actual measured pair, complete350 reference-slot patch tracking, fractional measured depth and unchanged original/robust strict .02 fits. Execution only; accepted tracking or fit is not required. No production integration, covariance, SLAM/runtime/throughput claim.',
  inputReceipt:path.relative(app,input),inputReportSha256:sha(fs.readFileSync(path.join(input,'report.json'))),mat:{path:'rendered-flight.mat',sha256:old.mat.sha256,bytes:mat.length},
  noOracleMatrixRead:true,geometryPrior:'Three actual previous-sample held IMUs through ES15PredictHeldInterval, full15/6 covariance carry, initialized estimate/reference and measured calibration only.',
  limitations:['Single-seed translation-only patch tracking has no ambiguity, occlusion, general warp or full-image forward/backward certificate.',
   'Reference-slot tracked pairs do not alter independently redetected FAST capture/map inventory or the production currentIndex contract.',
   'A .5m geometric gate retains the existing prediction-mode distance bound; strict registration RMS remains .02 with64 hypotheses/fraction.5.',
   'An optional reverse tracker gates depth-pair admission using the original reference image; its complete sparse cycle details are exported. Forward convergence alone remains separately observable.',
   'No patch localization covariance, filter update, reference capture or State mutation is performed.',
   'Only execution/context checks are acceptance criteria; track/fit and self-control outcomes are diagnostic results.',
   'Mode0 retains raw captured templates; explicit mode1 filters BOTH raw grayscale frames and locally rebuilds templates at unchanged reference pixels. Original State/sourceXYZ/depth and fresh FAST inventory are unchanged.',
   'Binomial filtering requires full valid5x5 support; two-pixel borders and poisoned supports remain invalid. Template availability is separately exported.',
   'MAT is exact Float64; Real CSV summaries must equal exact Number(binary.toPrecision(16)), with no tolerance; discrete fields compare exactly.'],
  labels,sources,librarySources,compiler,bookendsEqual,processStatus:terminal.status,resources,simulationSucceeded,result,binaryDiagnostics,generated,
  generatedScratchHomeRelative:path.relative(home,output),fullSlamAccepted:false};
 preserve();json('report.json',report);manifest();
 console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,resources,result,binaryDiagnostics}));process.exitCode=pass?0:1;
}catch(error){preserve();json('failure.json',{stage,error:String(error?.stack??error)});manifest();console.error(JSON.stringify({directory:path.relative(app,durable),stage,error:String(error)}));process.exitCode=1;}
function preserve(){for(const name of fs.readdirSync(output)){const file=path.join(output,name);if(fs.statSync(file).isFile()&&/\.(?:json|log|mos|txt|csv|mat|c|h|xml)$/.test(name))copy(file,path.join(durable,name));}}
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();}
function manifest(){json('manifest.json',{files:walk(durable).filter(file=>file!==path.join(durable,'manifest.json')).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});}
