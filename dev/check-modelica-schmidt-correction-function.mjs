// Test-only OMC/independent oracle; application math remains Modelica-owned.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parent=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(parent,{recursive:true});
const output=fs.mkdtempSync(path.join(parent,'schmidt-correction-function-'));
const functionOnly=process.env.SCHMIDT_FUNCTION_ONLY==='1';
const model=functionOnly?'SchmidtCorrectionFunctionOnly':'SchmidtCorrectionFunctionParity';
const names=['models/Estimation/Localization/RGBDRelativePose.mo','models/Math/SPD6Solve.mo','models/Estimation/Inertial/ES15PoseCorrection.mo','models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo','tests/modelica/SchmidtCorrectionFunctionParity.mo'];
const files=[...names,'tests/compiler-probes/schmidt-relative-fixtures.ts','dev/check-modelica-schmidt-correction-function.mjs','dev/rumoca-bounded-run.mjs'];
const sha=x=>createHash('sha256').update(x).digest('hex');
const sources=files.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(app,p)))}));
for(const source of sources){const dest=path.join(output,'sources',source.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(app,source.path),dest);}
const oracleBuild=await build({entryPoints:[path.join(output,'sources/tests/compiler-probes/schmidt-relative-fixtures.ts')],bundle:true,format:'esm',platform:'node',write:false});
const oraclePath=path.join(output,'oracle.mjs');fs.writeFileSync(oraclePath,oracleBuild.outputFiles[0].contents);const oracle=await import(pathToFileURL(oraclePath));
const omc=process.env.OMC_BIN??'omc';const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});if(version.status!==0)throw Error('OMC unavailable '+version.stderr);
const script=path.join(output,'correction-function.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\nsetCommandLineOptions("--preOptModules-=evalFunc");\n'+names.map(p=>`loadFile(${JSON.stringify(path.join(output,'sources',p))});`).join('\n')+'\ngetErrorString();\n'+`simulate(${model},stopTime=20,numberOfIntervals=80,outputFormat="csv",variableFilter="(actual|reference)(Accepted|Nis|Innovation|MeasurementJacobian|Next).*|solve.*|raw.*|policyChecks.*");\ngetErrorString();\n`);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','12,13','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1','--noSimplify',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');console.log(JSON.stringify({status:'RUNNING',directory:output,command}));
const execution=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});fs.writeFileSync(path.join(output,'resources.json'),execution.stdout??'');fs.writeFileSync(path.join(output,'guardian.stderr'),execution.stderr??'');
function csv(line){let value='',quoted=false;const a=[];for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(line[i]===','&&!quoted){a.push(value);value='';}else value+=line[i];}if(quoted)throw Error('CSV quote');a.push(value);return a;}
const view=new DataView(new ArrayBuffer(8));const bits=x=>{view.setFloat64(0,x,true);return view.getBigUint64(0,true);};
const fields={accepted:[],nis:[],innovation:[6],measurementJacobian:[6,21],innovationCovariance:[6,6],nextPosition:[3],nextVelocity:[3],nextRotation:[3,3],nextAccelBias:[3],nextGyroBias:[3],nextCovariance:[15,15],nextCrossCovariance:[15,6],nextReferenceCovariance:[6,6]};
const hold={nextPosition:'position',nextVelocity:'velocity',nextRotation:'rotation',nextAccelBias:'accelBias',nextGyroBias:'gyroBias',nextCovariance:'covariance',nextCrossCovariance:'crossCovariance',nextReferenceCovariance:'referenceCovariance'};
let rows=0,columns=0,functionOutputCells=0,cells=0,bitDifferences=0,maxParityError=0,solveCells=0,solveBitDifferences=0,solveWithheldCells=0,rollbackCells=0,referenceHeldCells=0,policyChecks=0,oracleCells=0,maxOracleError=0,analyticCells=0,biasCorrectionObserved=false,attitudeCrossResetObserved=false;const scenarios=new Set(),failures=[],failureCounts={};let times=[];
function near(a,b,label,tolerance,time){const error=Math.abs(a-b);if(!Number.isFinite(a)||!Number.isFinite(b)||error>tolerance){failureCounts[label]=(failureCounts[label]??0)+1;if(failures.length<20)failures.push({label,time,actual:a,expected:b,error,tolerance});}return error;}
const csvPath=path.join(output,model+'_res.csv');
if(fs.existsSync(csvPath)){
 const lines=fs.readFileSync(csvPath,'utf8').trim().split(/\r?\n/),header=csv(lines[0]),indices=new Map(header.map((n,i)=>[n,i]));columns=header.length-1;
 for(const line of lines.slice(1)){
  const row=csv(line).map(Number);rows++;const get=n=>row[indices.get(n)];const time=get('time');times.push(time);const scenario=get('raw.scenario');scenarios.add(scenario);
  if(row.length!==header.length||row.some(x=>!Number.isFinite(x)))throw Error('Invalid/nonfinite CSV row');
  const array=(prefix,name,shape)=>{const title=prefix?prefix+name[0].toUpperCase()+name.slice(1):'raw.'+name;return shape.length===0?[get(title)]:shape.length===1?Array.from({length:shape[0]},(_,i)=>get(`${title}[${i+1}]`)):Array.from({length:shape[0]},(_,i)=>Array.from({length:shape[1]},(_,j)=>get(`${title}[${i+1},${j+1}]`)));};
  const actual={},raw={};for(const [name,shape] of Object.entries(fields)){
   actual[name]=array('actual',name,shape);const a=actual[name].flat(Infinity);functionOutputCells+=a.length;if(a.some(v=>!Number.isFinite(v)))throw Error('Missing/nonfinite actual '+name);if(!functionOnly){const b=array('reference',name,shape).flat(Infinity);for(let i=0;i<a.length;i++){cells++;bitDifferences+=Number(bits(a[i])!==bits(b[i]));maxParityError=Math.max(maxParityError,near(a[i],b[i],name,5e-13,time));}}
  }
  for(const [name,shape] of Object.entries({position:[3],velocity:[3],rotation:[3,3],accelBias:[3],gyroBias:[3],covariance:[15,15],referencePosition:[3],referenceRotation:[3,3],referenceCovariance:[6,6],crossCovariance:[15,6],opticalToBody:[3,3],cameraOriginBody:[3],measuredRotation:[3,3],measuredTranslation:[3],relativeCovariance:[6,6],q:[4],qr:[4],qb:[4],qm:[4]}))raw[name]=array('',name,shape);
  const accepts=[1,2,18,19,20].includes(scenario);near(actual.accepted[0],+accepts,'exact accepted flag',0,time);
  if(!accepts)for(const [name,input] of Object.entries(hold)){const a=actual[name].flat(Infinity),b=raw[input].flat(Infinity);for(let i=0;i<a.length;i++){rollbackCells++;near(a[i],b[i],'rollback/'+name,0,time);if(bits(a[i])!==bits(b[i])&&failures.length<20)failures.push({label:'bitwise rollback/'+name,time,i});}}
  for(let i=0;i<6;i++)for(let j=0;j<6;j++){referenceHeldCells++;near(actual.nextReferenceCovariance[i][j],raw.referenceCovariance[i][j],'reference held',0,time);}
  for(let i=1;i<=6;i++){policyChecks++;near(get(`policyChecks[${i}]`),1,'invalid policy '+i,0,time);}
  for(let i=1;i<=6;i++)for(let j=1;j<=16;j++){const a=get(`solveActual[${i},${j}]`),b=get(`solveReference[${i},${j}]`);solveCells++;solveBitDifferences+=Number(bits(a)!==bits(b));near(a,b,'exact solve',0,time);if(get('solveActualValid')===0){solveWithheldCells++;near(a,0,'withheld solve output',0,time);}}
  solveCells++;near(get('solveActualValid'),get('solveReferenceValid'),'solve valid',0,time);
  if(accepts){
   const P=oracle.mat(21,21,(i,j)=>i<15?(j<15?raw.covariance[i][j]:raw.crossCovariance[i][j-15]):j<15?raw.crossCovariance[j][i-15]:raw.referenceCovariance[i-15][j-15]);
   const f={p:raw.position,v:raw.velocity,q:raw.q,ba:raw.accelBias,bg:raw.gyroBias,pr:raw.referencePosition,qr:raw.qr,b:raw.qb,o:raw.cameraOriginBody,z:raw.qm,t:raw.measuredTranslation,P,C:raw.relativeCovariance};
   const expected=oracle.correction(f),target={innovation:expected.r,measurementJacobian:expected.H,innovationCovariance:expected.S,nis:[expected.nis],nextPosition:oracle.plus(f.p,expected.d.slice(0,3)),nextVelocity:oracle.plus(f.v,expected.d.slice(3,6)),nextRotation:oracle.rot(expected.nextQ),nextAccelBias:oracle.plus(f.ba,expected.d.slice(9,12)),nextGyroBias:oracle.plus(f.bg,expected.d.slice(12,15)),nextCovariance:expected.posterior.slice(0,15).map(r=>r.slice(0,15)),nextCrossCovariance:expected.posterior.slice(0,15).map(r=>r.slice(15)),nextReferenceCovariance:raw.referenceCovariance};
   for(const [name,v] of Object.entries(target)){const a=actual[name].flat(Infinity),b=v.flat(Infinity),tolerance=name==='nis'?3e-7:['nextCovariance','nextCrossCovariance'].includes(name)?2e-6:2e-7;for(let i=0;i<a.length;i++){oracleCells++;maxOracleError=Math.max(maxOracleError,near(a[i],b[i],'independent/'+name,tolerance,time));}}
   biasCorrectionObserved ||= expected.d.slice(9).some(v=>Math.abs(v)>1e-9);
   attitudeCrossResetObserved ||= expected.posterior.slice(6,9).some((r,i)=>r.slice(15).some((v,j)=>Math.abs(v-expected.joseph[i+6][j+15])>1e-7));
   if(scenario===2){for(let i=0;i<15;i++)for(let j=0;j<15;j++){const selected=i<3||(i>=6&&i<9);analyticCells++;near(actual.nextCovariance[i][j],i===j?(selected?0.01-0.0001/0.07:0.01):0,'analytic zero-innovation current',2e-15,time);}for(let i=0;i<15;i++)for(let j=0;j<6;j++){analyticCells++;near(actual.nextCrossCovariance[i][j],(j<3&&i===j)||(j>=3&&i===j+3)?0.0002/0.07:0,'analytic zero-innovation cross',2e-15,time);}}
  }
 }
}
const original=fs.readFileSync(path.join(app,'dev/artifacts/modelica-schmidt-correction-function/SchmidtRelativePoseCorrectionOriginal.mo'));
const current=fs.readFileSync(path.join(app,'models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo'));
const prefixUnchanged=current.subarray(0,original.length).equals(original);const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256);
const generatedFunctionExecution=fs.readdirSync(output).filter(n=>n.endsWith('.c')).map(n=>{const bytes=fs.readFileSync(path.join(output,n));return {path:n,sha256:sha(bytes),bytes:bytes.length,correctionCalls:(bytes.toString().match(/omc_SchmidtCorrectRelativePose\(/g)??[]).length,solveCalls:(bytes.toString().match(/omc_SchmidtCorrectionSolve\(/g)??[]).length};}).filter(f=>f.correctionCalls||f.solveCalls);
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const pass=execution.status===0&&prefixUnchanged&&bookendsEqual&&rows>=81&&functionOutputCells===rows*542&&(functionOnly?cells===0:cells===rows*542)&&solveCells===rows*97&&solveBitDifferences===0&&scenarios.size===20&&times[0]===0&&times.at(-1)===20&&!failures.length&&oracleCells>0&&analyticCells>0&&solveWithheldCells>0&&biasCorrectionObserved&&attitudeCrossResetObserved&&generatedFunctionExecution.some(f=>f.correctionCalls>1)&&log.includes('The simulation finished successfully.');
const report={status:pass?(functionOnly?'OMC_SCHMIDT_FUNCTION_ORACLE_PASS_REFERENCE_UNMEASURED':'OMC_SCHMIDT_CORRECTION_FUNCTION_PASS'):'FAILED_OR_INCOMPLETE',referenceParityMeasured:!functionOnly&&rows>0,scope:(functionOnly?'Function-only full15+6, original equation preparation timed out and its parity remains unmeasured; ':'Full15+6 correction function versus unchanged original equation model; ')+'20 dynamic raw-input scenarios, full225/90/36 blocks, independent quaternion/finite-difference/pivoted-solve/Joseph/reset oracle, full96solve/model parity, closed-form zero-innovation and6 invalid tuning controls',compilerVersion:version.stdout.trim(),sources,prefixSha256:sha(original),prefixUnchanged,bookendsEqual,rows,columns,functionOutputCells,cells,bitDifferences:functionOnly?null:bitDifferences,maxParityError:functionOnly?null:maxParityError,solveCells,solveBitDifferences,solveWithheldCells,rollbackCells,referenceHeldCells,policyChecks,oracleCells,maxOracleError,analyticCells,biasCorrectionObserved,attitudeCrossResetObserved,scenarios:[...scenarios].sort((a,b)=>a-b),failureCounts,failures,generatedFunctionExecution,processStatus:execution.status,signal:execution.signal,rumocaCompilerInvoked:false,browserIntegrated:false,fullSlamAccepted:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');const durable=path.join(app,'dev/artifacts/modelica-schmidt-correction-function',path.basename(output));fs.mkdirSync(durable,{recursive:true});
for(const name of ['sources','report.json','resources.json','guardian.stderr','semantics.log','command.json','correction-function.mos','oracle.mjs',model+'_res.csv'])if(fs.existsSync(path.join(output,name)))fs.cpSync(path.join(output,name),path.join(durable,name),{recursive:true});
fs.mkdirSync(path.join(durable,'generated'),{recursive:true});for(const file of generatedFunctionExecution)fs.copyFileSync(path.join(output,file.path),path.join(durable,'generated',file.path));
console.log(JSON.stringify({directory:output,durable,...report}));process.exitCode=pass?0:1;
