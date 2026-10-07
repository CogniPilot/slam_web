// Test-only inspection of one actual measured pair. No host matching/estimation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {rgbdSlamSourceManifest} from '../src/modelica-slam-source-manifest.mjs';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),home=os.homedir();
if(process.argv.length!==3)throw Error('Usage: node dev/check-modelica-flight-pairs.mjs <frozen rendered-flight-slam receipt>');
const input=fs.realpathSync(path.resolve(process.argv[2])),old=JSON.parse(fs.readFileSync(path.join(input,'report.json')));
const scratch=path.join(home,'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'flight-pair-diagnostics-'));
const durable=path.join(app,'dev/artifacts/modelica-flight-pairs',path.basename(output));fs.mkdirSync(durable,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const assert=(value,message)=>{if(!value)throw Error(message);};
const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
const json=(name,value)=>fs.writeFileSync(path.join(durable,name),JSON.stringify(value,null,2)+'\n');
const model='RGBDRenderedFlightPairDiagnostics',capacity=350;
const labels={
 inventory:['slot','pixelX','pixelY','fastScore','describedEnabled','opticalX','opticalY','opticalZ','calibratedDepthValid','patchMean','patchNorm','contrastValid'],
 pairs:['referenceSlot','referenceEnabled','referencePixelX','referencePixelY','referenceOpticalX','referenceOpticalY','referenceOpticalZ','acceptedCurrentIndex',
   'currentPixelX','currentPixelY','currentOpticalX','currentOpticalY','currentOpticalZ','candidatePairEnabled','nearestDescriptorSquared','secondDescriptorSquared',
   'acceptedDescriptorSquared','pixelDeltaX','pixelDeltaY','rawOpticalDeltaNorm','returnedOriginalTransformResidual','returnedRobustTransformResidual','robustInlier','estimatedPriorGeometricResidual'],
 fits:['accepted','reason','validCount','invalidCount','rank','cost','rms','eigenGap','sourceCentroidX','sourceCentroidY','sourceCentroidZ',
   'targetCentroidX','targetCentroidY','targetCentroidZ','R11','R12','R13','R21','R22','R23','R31','R32','R33','tX','tY','tZ'],
 matching:['candidateCount','configurationValid','invalidReference','invalidCurrent','robustInliers'],
 summary:['initializationAccepted','referenceCount','referenceEnabledCount','referenceEpoch','frame0SelectedCount','frame0SelectionStatus',
   'frame0DescribedCount','frame0DescriptionInvalidCount','frame1SelectedCount','frame1SelectionStatus','frame1DescribedCount','frame1DescriptionInvalidCount',
   'predictionAccepted','predictedBodyX','predictedBodyY','predictedBodyZ'],prediction:['accepted','substeps','endTime'],
 modes:['unguided','estimated-IMU-geometry'],fitMethods:['original','robust']};
function csv(file){
 if(!fs.existsSync(file))return {present:false};
 const bytes=fs.readFileSync(file),lines=String(bytes).trim().split(/\r?\n/),first=lines.shift();
 const header=[...first.matchAll(/"([^"]*)"/g)].map(m=>m[1]);
 const names=['time',...Array.from({length:8},(_,i)=>`checks[${i+1}]`),...labels.summary.map((_,i)=>`summary[${i+1}]`),'writerSuccess'];
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
 return {present:true,sha256:sha(bytes),columns:header.length,columnsValid,lexicalValid,finiteRows,rowsValid,rows:rows.length,times,checks,repeatedSummaryEqual,summary,writerSuccess};
}
function sidecar(file,result){
 if(!fs.existsSync(file))return {present:false};
 const bytes=fs.readFileSync(file),expectedCells=25359,name='diagnostics';
 assert(bytes.length>=20,'Complete diagnostic MATv4 header');
 const type=bytes.readInt32LE(0),rows=bytes.readInt32LE(4),columns=bytes.readInt32LE(8),imaginary=bytes.readInt32LE(12),length=bytes.readInt32LE(16);
 assert(type===0&&imaginary===0&&rows===1&&columns===expectedCells&&length===name.length+1,'Exact little-endian real Float64 diagnostic matrix shape');
 assert(bytes.length===20+length+expectedCells*8&&bytes[20+length-1]===0
  &&bytes.subarray(20,20+length-1).toString('ascii')===name,'Exact sole matrix identity/length, no trailing bytes');
 const data=Array.from({length:expectedCells},(_,i)=>bytes.readDoubleLE(20+length+i*8));
 assert(data.every(Number.isFinite),'Finite complete diagnostic matrix');
 let cursor=0;const take=n=>{const values=data.slice(cursor,cursor+n);cursor+=n;return values;};
 const table=(a,b,c)=>Array.from({length:a},()=>Array.from({length:b},()=>take(c)));
 const diagnostics={inventory:table(2,capacity,12),pairs:table(2,capacity,24),fits:table(2,2,26),
  matching:Array.from({length:2},()=>take(5)),prediction:Array.from({length:3},()=>take(3)),
  predictedRotation:Array.from({length:3},()=>take(3)),predictedTranslation:take(3),summary:take(16)};
 const checks=take(8);assert(cursor===expectedCells,'Complete exact diagnostic field order');
 const summaryComparison=diagnostics.summary.map((value,i)=>({index:i+1,binary:value,csv:result.summary[i],exact:value===result.summary[i],
  decimal16:Number(value.toPrecision(16)),pass:i<13?value===result.summary[i]:Number(value.toPrecision(16))===result.summary[i]}));
 assert(result.rowsValid&&summaryComparison.every(field=>field.pass),'Sidecar summary matches exact discrete or16-significant-digit CSV fields');
 assert(checks.every((v,i)=>v===(result.checks[i]?1:0)),'Sidecar execution checks match CSV');
 json('diagnostics.json',{labels,...diagnostics});
 return {present:true,path:path.basename(file),sha256:sha(bytes),bytes:bytes.length,cells:expectedCells,
  matrices:[{name,rows,columns}],logicalShapes:{inventory:[2,capacity,12],pairs:[2,capacity,24],fits:[2,2,26],matching:[2,5],prediction:[3,3],predictedRotation:[3,3],predictedTranslation:[3],summary:[16],checks:[8]},
  exactDecoded:true,csvPrecision:{discreteFields:'1..13 exact',realFields:'14..16 exact Number(binary.toPrecision(16)) equality; no tolerance',summaryComparison},summary:diagnostics.summary,matching:diagnostics.matching,fits:diagnostics.fits,prediction:diagnostics.prediction};
}
let stage='frozen-input';
try{
 assert(old.model==='RGBDRenderedFlightSLAMAcceptance'&&old.mat?.matrices.some(m=>m.name==='imuIntervals'&&m.rows===36&&m.columns===8),'Actual flight receipt required');
 const mat=fs.readFileSync(path.join(input,old.mat.path));assert(sha(mat)===old.mat.sha256,'Frozen actual flight MAT hash');
 copy(path.join(input,old.mat.path),path.join(output,'rendered-flight.mat'));copy(path.join(input,old.mat.path),path.join(durable,'rendered-flight.mat'));
 copy(path.join(input,'report.json'),path.join(durable,'input-report.json'));
 const productionNames=[...new Set([...rgbdSlamSourceManifest.paths,'models/RGBDFastSLAMIntervals.mo'])];
 const names=[...productionNames,'tests/modelica/RGBDLocalizationInitializeTests.mo','tests/modelica/RGBDVisualRelativeFunctionAcceptance.mo',
  'tests/modelica/RGBDLocalizationAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastInitializationFunctionAcceptance.mo',
  'tests/modelica/RGBDFastAdvanceFunctionAcceptance.mo','tests/modelica/RGBDFastSLAMRawCompositionAcceptance.mo',
  'tests/modelica/RGBDCompleteStateComparison.mo','tests/modelica/RGBDRenderedFrameInput.mo','tests/modelica/RGBDRenderedVisualDiagnostics.mo',
  'tests/modelica/RGBDRenderedCitySLAMAcceptance.mo','tests/modelica/RGBDRenderedFlightSLAMAcceptance.mo','tests/modelica/RGBDRenderedFlightPairDiagnostics.mo'];
 const sources=[...names,'src/modelica-slam-source-manifest.mjs','dev/check-modelica-flight-pairs.mjs','dev/rumoca-bounded-run.mjs']
  .map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
 for(const source of sources)copy(path.join(app,source.path),path.join(durable,'sources',source.path));
 const library=path.join(home,'.openmodelica/libraries/Modelica 4.1.0+maint.om');
 const librarySources=['package.mo','Utilities/Streams.mo'].map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(library,name)))}));
 for(const entry of librarySources)copy(path.join(library,entry.path),path.join(durable,'installed-msl',entry.path));
 const omc=process.env.OMC_BIN??'omc',version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
 assert(version.status===0,'OMC version query');
 const executable=fs.realpathSync(path.isAbsolute(omc)?omc:(process.env.PATH??'').split(path.delimiter).map(dir=>path.join(dir,omc)).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}}));
 const compiler={version:version.stdout.trim(),path:executable,sha256:sha(fs.readFileSync(executable))};
 const script=path.join(output,'flight-pair.mos');
 fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize,execstat");\n'
  +'setCommandLineOptions("--preOptModules-=evalFunc");\nloadModel(Modelica,{"4.1.0"});\ngetVersion(Modelica);\n'
  +names.map(name=>`loadFile(${JSON.stringify(path.join(durable,'sources',name))});`).join('\n')+'\ngetErrorString();\n'
  +`simulate(${model},stopTime=0.001,numberOfIntervals=1,outputFormat="csv",variableFilter="checks.*|summary.*|writerSuccess",cflags="-O0",simflags=${JSON.stringify('-override=datasetFile='+path.join(output,'rendered-flight.mat')+',diagnosticFile='+path.join(output,'flight-pair-diagnostics.mat'))});\ngetErrorString();\n`);
 stage='bounded-reference';
 const command=[path.join(durable,'sources/dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384',
  '--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','8,9','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,
  executable,'--numProcs=2','--vectorizationLimit=1',script];
 fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
 const terminal=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
 fs.writeFileSync(path.join(output,'resources.json'),terminal.stdout??'');if(terminal.stderr)fs.writeFileSync(path.join(output,'guardian-stderr.log'),terminal.stderr);
 const log=fs.existsSync(path.join(output,'semantics.log'))?fs.readFileSync(path.join(output,'semantics.log'),'utf8'):'';
 let resources=null;try{resources=JSON.parse(terminal.stdout);}catch{}
 const result=csv(path.join(output,model+'_res.csv'));
 const binaryDiagnostics=sidecar(path.join(output,'flight-pair-diagnostics.mat'),result);
 const bookendsEqual=sources.every(entry=>sha(fs.readFileSync(path.join(app,entry.path)))===entry.sha256&&sha(fs.readFileSync(path.join(durable,'sources',entry.path)))===entry.sha256)
  &&sha(fs.readFileSync(path.join(input,old.mat.path)))===old.mat.sha256&&sha(fs.readFileSync(path.join(output,'rendered-flight.mat')))===old.mat.sha256
  &&librarySources.every(entry=>sha(fs.readFileSync(path.join(library,entry.path)))===entry.sha256)&&sha(fs.readFileSync(executable))===compiler.sha256;
 const generated=fs.readdirSync(output).filter(name=>/\.(?:c|h)$/.test(name)).map(name=>({path:name,bytes:fs.statSync(path.join(output,name)).size,sha256:sha(fs.readFileSync(path.join(output,name)))}));
 const simulationSucceeded=log.includes('The simulation finished successfully.');
 const pass=terminal.status===0&&resources?.exitCode===0&&simulationSucceeded&&bookendsEqual&&result.rowsValid&&result.repeatedSummaryEqual&&result.writerSuccess&&result.checks?.every(Boolean)&&binaryDiagnostics.exactDecoded;
 const report={status:pass?'DIAGNOSTICS_EXECUTED':'FAILED_OR_INCOMPLETE',model,
  scope:'One actual measured pair, complete350 feature domains, original and robust unchanged fits with/without existing estimated-IMU geometry matching. Execution receipt only; acceptance is not required and no SLAM/runtime/throughput qualification is implied.',
  inputReceipt:path.relative(app,input),inputReportSha256:sha(fs.readFileSync(path.join(input,'report.json'))),mat:{path:'rendered-flight.mat',sha256:old.mat.sha256,bytes:mat.length},
  noOracleMatrixRead:true,geometryPrior:'Three actual previous-sample held IMUs through ES15PredictHeldInterval, full15/6 covariance carry, initialized estimate/reference and measured calibration only.',
  limitations:['Returned refused-fit transforms are canonical identity/zero; pair returned-transform residuals are not residuals of the internally rejected candidate. Fit rms preserves candidate diagnostics.',
   'Guided matcher retains existing singleton/ratio/reciprocal gates; no thresholds or candidate policy change.',
   'Fixture diagnostic patch contrast checks target these finite captured RGB bytes; production DescribeRGBDFrame remains the owner of enabled masks.',
   'The flight harness margin>=12 features is distinct from production minimum3 geometry.'],
  labels,sources,librarySources,compiler,bookendsEqual,processStatus:terminal.status,resources,simulationSucceeded,result,binaryDiagnostics,generated,
  generatedScratchHomeRelative:path.relative(home,output),fullSlamAccepted:false};
 preserve();json('report.json',report);manifest();
 console.log(JSON.stringify({directory:path.relative(app,durable),status:report.status,resources,result,binaryDiagnostics}));process.exitCode=pass?0:1;
}catch(error){preserve();json('failure.json',{stage,error:String(error?.stack??error)});manifest();console.error(JSON.stringify({directory:path.relative(app,durable),stage,error:String(error)}));process.exitCode=1;}
function preserve(){for(const name of fs.readdirSync(output)){const file=path.join(output,name);if(fs.statSync(file).isFile()&&/\.(?:json|log|mos|txt|csv|mat|c|h|xml)$/.test(name))copy(file,path.join(durable,name));}}
function walk(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]).sort();}
function manifest(){json('manifest.json',{files:walk(durable).filter(file=>file!==path.join(durable,'manifest.json')).map(file=>({path:path.relative(durable,file),bytes:fs.statSync(file).size,sha256:sha(fs.readFileSync(file))}))});}
