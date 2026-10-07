// Test-only OMC execution; production compilation remains Rumoca-owned.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(os.homedir(),'scratch/slam_web/tmp');fs.mkdirSync(scratch,{recursive:true});
const output=fs.mkdtempSync(path.join(scratch,'rotation-coordinates-'));
const model='SLAMRotationCoordinatesTests';
const files=['models/Estimation/Localization/RGBDRelativePose.mo','models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo','tests/modelica/SLAMRotationCoordinatesTests.mo','dev/check-modelica-rotation-coordinates.mjs','dev/rumoca-bounded-run.mjs'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=files.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(app,name)))}));
const omc=process.env.OMC_BIN??'omc';
const version=spawnSync(omc,['--version'],{encoding:'utf8',env:{...process.env,TMPDIR:output}});
if(version.error||version.status!==0)throw version.error??Error(version.stderr);
const script=path.join(output,'rotation-coordinates.mos');
fs.writeFileSync(script,'setDebugFlags("gen,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,nfScalarize");\n'+files.filter(f=>f.endsWith('.mo')).map(f=>`loadFile(${JSON.stringify(path.join(app,f))});`).join('\n')+`\ngetErrorString();\nsimulate(${model},startTime=0,stopTime=1,numberOfIntervals=40,outputFormat="csv",variableFilter="(actual|reference)(Vector|Angle|Valid|Quaternion).*|rotations.*");\ngetErrorString();\n`);
const command=[path.join(app,'dev/rumoca-bounded-run.mjs'),'--seconds','120','--rss-mib','8192','--available-mib','16384','--log',path.join(output,'semantics.log'),'--','nice','-n','15','taskset','-c','10,11','env','OMP_NUM_THREADS=1',`TMPDIR=${output}`,omc,'--numProcs=2','--vectorizationLimit=1',script];
fs.writeFileSync(path.join(output,'command.json'),JSON.stringify(command,null,2)+'\n');
console.log(JSON.stringify({status:'RUNNING',directory:output,command}));
const result=spawnSync(process.execPath,command,{cwd:output,encoding:'utf8',maxBuffer:4*1024*1024});
fs.writeFileSync(path.join(output,'resources.json'),result.stdout??'');
function csv(line){const fields=[];let value='',quoted=false;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(line[i]===','&&!quoted){fields.push(value);value='';}else value+=line[i];}if(quoted)throw Error('CSV quote');fields.push(value);return fields;}
const view=new DataView(new ArrayBuffer(8));const bits=x=>{view.setFloat64(0,x,true);return view.getBigUint64(0,true);};
let rows=0,columns=0,comparisons=0,bitDifferences=0,maxError=0,oracleChecks=0,maxOracleError=0;const failures=[];let times=[];
function check(a,b,label,time,tolerance=5e-13){oracleChecks++;const e=Math.abs(a-b);maxOracleError=Math.max(maxOracleError,e);if(!Number.isFinite(a)||!Number.isFinite(b)||e>tolerance)if(failures.length<16)failures.push({label,time,a,b,error:e});}
const csvPath=path.join(output,model+'_res.csv');
if(fs.existsSync(csvPath)){
 const lines=fs.readFileSync(csvPath,'utf8').trim().split(/\r?\n/);const header=csv(lines[0]);const index=new Map(header.map((n,i)=>[n,i]));columns=header.length-1;
 for(const line of lines.slice(1)){const values=csv(line).map(Number);rows++;const t=values[index.get('time')];times.push(t);const get=name=>values[index.get(name)];if(values.length!==header.length||values.some(x=>!Number.isFinite(x)))throw Error('Invalid CSV');
  for(let c=1;c<=16;c++){
   for(const [name,n] of [['Vector',3],['Angle',0],['Valid',0],['Quaternion',4]])for(let j=1;j<=(n||1);j++){
    const label=n?`${name}[${c},${j}]`:`${name}[${c}]`;const a=get('actual'+label),b=get('reference'+label);comparisons++;bitDifferences+=Number(bits(a)!==bits(b));maxError=Math.max(maxError,Math.abs(a-b));if(!Number.isFinite(a)||!Number.isFinite(b)||Math.abs(a-b)>5e-13)if(failures.length<16)failures.push({label,t,a,b});
   }
   const valid=get(`actualValid[${c}]`);check(valid,c<=12?1:0,'valid'+c,t,0);
   const q=Array.from({length:4},(_,j)=>get(`actualQuaternion[${c},${j+1}]`));const v=Array.from({length:3},(_,j)=>get(`actualVector[${c},${j+1}]`));
   if(valid>0.5){const [w,x,y,z]=q;check(q.reduce((s,e)=>s+e*e,0),1,'unit quaternion'+c,t);check(Math.min(w,0),0,'signed quaternion'+c,t,0);
    const reconstructed=[[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]];
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)check(reconstructed[i][j],get(`rotations[${c},${i+1},${j+1}]`),'quaternion rotation'+c,t);
    check(Math.hypot(...v),get(`actualAngle[${c}]`),'log angle'+c,t);
    if(c===6){const axis=[-2,1,3],norm=Math.sqrt(14),a=1e-10*(1+t);for(let j=0;j<3;j++)check(v[j],axis[j]/norm*a,'small angle'+j,t,1e-22);}
    if(c===7){check(get(`actualAngle[${c}]`),0,'identity angle',t,0);for(const e of v)check(e,0,'identity log',t,0);}
   }else for(const e of v)check(e,0,'invalid log fallback'+c,t,0);
  }
 }
}
const generatedFunctionExecution=fs.readdirSync(output).filter(f=>f.endsWith('.c')).map(f=>{const p=path.join(output,f),data=fs.readFileSync(p);return {path:f,sha256:sha(data),bytes:data.length,references:(data.toString().match(/omc_SLAMRotationCoordinates\(/g)??[]).length};}).filter(f=>f.references);
const bookendsEqual=sources.every(s=>sha(fs.readFileSync(path.join(app,s.path)))===s.sha256);
const production=fs.readFileSync(path.join(app,'models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo'),'utf8');const referenceBlock=production.slice(production.indexOf('model SLAMRotationLog\n'),production.indexOf('end SLAMRotationLog;')+'end SLAMRotationLog;'.length);
const originalModelSha256=fs.readFileSync(path.join(app,'dev/artifacts/modelica-rotation-coordinates/original-model-sha256.txt'),'utf8').trim();const originalModelUnchanged=sha(referenceBlock)===originalModelSha256;
const log=fs.readFileSync(path.join(output,'semantics.log'),'utf8');
const pass=result.status===0&&bookendsEqual&&originalModelUnchanged&&rows>=41&&columns===432&&comparisons===rows*144&&bitDifferences===0&&!failures.length&&times[0]===0&&times.at(-1)===1&&generatedFunctionExecution.length>1&&log.includes('The simulation finished successfully.');
const report={status:pass?'OMC_ROTATION_COORDINATES_PASS':'FAILED_OR_INCOMPLETE',scope:'Actual full3D Modelica function versus unchanged equation model including protected quaternion;12 proper/dynamic cases and4 invalid cases',compilerVersion:version.stdout.trim(),sources,originalModelSha256,originalModelUnchanged,bookendsEqual,rows,columns,comparisons,bitDifferences,maxError,oracleChecks,maxOracleError,failures,times,generatedFunctionExecution,processStatus:result.status,signal:result.signal,rumocaArtifactIssued:false,browserIntegrated:false};
fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const durable=path.join(app,'dev/artifacts/modelica-rotation-coordinates');fs.mkdirSync(durable,{recursive:true});
for(const name of ['report.json','semantics.log','resources.json','command.json','rotation-coordinates.mos',model+'_res.csv'])if(fs.existsSync(path.join(output,name)))fs.copyFileSync(path.join(output,name),path.join(durable,name));
for(const file of generatedFunctionExecution){fs.mkdirSync(path.join(durable,'generated'),{recursive:true});fs.copyFileSync(path.join(output,file.path),path.join(durable,'generated',file.path));}
for(const source of sources){const target=path.join(durable,'sources',source.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(app,source.path),target);}
console.log(JSON.stringify({directory:output,...report}));process.exitCode=pass?0:1;
