import {modelicaSourcePath} from '../../src/modelica-source-locations.mjs';
import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {ModelicaFilterSession,type FilterSnapshot,type FilterFrame} from '../../src/modelica-filter-session';
import type {NativeProgramArtifact} from '../../src/modelica-native-program';

const packageDirectory=process.env.RUMOCA_BRANCH_PKG;
const artifactDirectory=process.env.RUMOCA_FILTER_SESSION_ARTIFACT_DIRECTORY;
const enabled=Boolean(packageDirectory||artifactDirectory);
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const matrix=(n:number,m:number,f:(i:number,j:number)=>number):number[][]=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>f(i,j)));
const identity=(n:number)=>matrix(n,n,(i,j)=>+(i===j));
const transpose=(a:number[][])=>matrix(a[0].length,a.length,(i,j)=>a[j][i]);
const multiply=(a:number[][],b:number[][])=>matrix(a.length,b[0].length,(i,j)=>a[i].reduce((s,v,k)=>s+v*b[k][j],0));
const add=(a:number[][],b:number[][])=>matrix(a.length,a[0].length,(i,j)=>a[i][j]+b[i][j]);
const scale=(a:number[][],v:number)=>a.map(row=>row.map(x=>x*v));
const initialCovariance=scale(identity(15),.1).flat();
const density=[.06,.06,.06,.006,.006,.006,.002,.002,.002,.0002,.0002,.0002];
const imu={accel:[0,0,9.81],gyro:[0,0,0]};
let source:string,editedSource:string,artifact:NativeProgramArtifact,editedArtifact:NativeProgramArtifact;
const report:Record<string,unknown>={status:'RUNNING',runtimeIntegrated:false,productionPinChanged:false,fullSlamAccepted:false,cases:[]};
function save(){if(process.env.RUMOCA_FILTER_SESSION_REPORT)writeFileSync(process.env.RUMOCA_FILTER_SESSION_REPORT,JSON.stringify(report,null,2)+'\n');}
beforeAll(async()=>{
  if(!enabled)return;
  const files=['ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SPD6Solve','ES15PoseCorrection','ES15FilterStep'];
  source=process.env.RUMOCA_FILTER_SESSION_SOURCE?readFileSync(process.env.RUMOCA_FILTER_SESSION_SOURCE,'utf8'):files.map(f=>readFileSync(modelicaSourcePath(f),'utf8')).join('\n');
  editedSource=source.replace('next_accepted_count = accepted_count+observation_accepted;','next_accepted_count = accepted_count+observation_accepted+1.0;');
  expect(editedSource).not.toBe(source);report.sourceSha256=sha(source);report.editedSourceSha256=sha(editedSource);save();
  if(artifactDirectory){
    artifact=JSON.parse(readFileSync(resolve(artifactDirectory,'baseline.json'),'utf8'));
    editedArtifact=JSON.parse(readFileSync(resolve(artifactDirectory,'edited.json'),'utf8'));
  }else{
    const compiler=await import(/* @vite-ignore */pathToFileURL(resolve(packageDirectory!,'rumoca_bind_wasm.js')).href);
    const wasm=readFileSync(resolve(packageDirectory!,'rumoca_bind_wasm_bg.wasm'));await compiler.default({module_or_path:wasm});
    report.compilerWasmSha256=createHash('sha256').update(wasm).digest('hex');report.phase='baseline source preparation';save();
    const start=performance.now(),baselineRaw=compiler.prepare_native_program(source,'ES15FilterStep');artifact=JSON.parse(baselineRaw);report.baselineCompileMs=performance.now()-start;
    report.phase='edited source preparation';save();const editStart=performance.now(),editedRaw=compiler.prepare_native_program(editedSource,'ES15FilterStep');editedArtifact=JSON.parse(editedRaw);report.editedCompileMs=performance.now()-editStart;
    if(process.env.RUMOCA_FILTER_SESSION_EXPORT_DIRECTORY){const dir=process.env.RUMOCA_FILTER_SESSION_EXPORT_DIRECTORY;mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'baseline.json'),baselineRaw);writeFileSync(resolve(dir,'edited.json'),editedRaw);writeFileSync(resolve(dir,'source.mo'),source);writeFileSync(resolve(dir,'edited.mo'),editedSource);}
  }
  expect(artifact.source_sha256).toBe(sha(source));expect(editedArtifact.source_sha256).toBe(sha(editedSource));
  report.artifact={profile:artifact.profile,moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length};report.editedModuleSha256=editedArtifact.module_sha256;report.phase='actual persistent execution';save();
},120000);
async function session(time=0){return ModelicaFilterSession.create(artifact,source,{time,covariance:initialCovariance});}
function frame(start:number,n=4):FilterFrame{
  const h=1/180;return {time:start+n*h,dt:n*h,imu:structuredClone(imu),imuIntervals:Array.from({length:n},(_,i)=>({time:start+(i+1)*h,dt:h,imu:structuredClone(imu)}))};
}
function record(name:string){(report.cases as string[]).push(name);report.status='PARTIAL';save();}
afterAll(()=>{if(enabled){report.status=(report.cases as string[]).length===6?'PASS':'FAILED_OR_INCOMPLETE';save();}});
function close(actual:number[],expected:number[],tolerance=1e-10){expect(actual).toHaveLength(expected.length);actual.forEach((x,i)=>expect(Math.abs(x-expected[i])).toBeLessThan(tolerance));}

// Exact nilpotent continuous Lyapunov solution, independent of Modelica's
// polynomial transition and three-node quadrature. Only the tests do this math.
function predicted(h:number){
  const F=matrix(15,15,()=>0),G=matrix(15,12,()=>0);
  for(let i=0;i<3;i++){F[i][i+3]=1;F[i+3][i+9]=-1;F[i+6][i+12]=-1;G[i+3][i]=-1;G[i+6][i+3]=-1;G[i+9][i+6]=1;G[i+12][i+9]=1;}
  F[3][7]=9.81;F[4][6]=-9.81;
  const powers=[identity(15)];for(let i=1;i<=4;i++)powers.push(multiply(powers.at(-1)!,F));expect(powers[4].flat()).toEqual(Array(225).fill(0));
  const factorial=[1,1,2,6],D=multiply(multiply(G,matrix(12,12,(i,j)=>i===j?density[i]**2:0)),transpose(G));
  let transition=matrix(15,15,()=>0),Q=matrix(15,15,()=>0);
  for(let i=0;i<4;i++)transition=add(transition,scale(powers[i],h**i/factorial[i]));
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)Q=add(Q,scale(multiply(multiply(powers[i],D),transpose(powers[j])),h**(i+j+1)/(factorial[i]*factorial[j]*(i+j+1))));
  return add(multiply(multiply(transition,scale(identity(15),.1)),transpose(transition)),Q);
}
function solve(a:number[][],b:number[][]){
  const n=a.length,m=b[0].length,rows=a.map((row,i)=>[...row,...b[i]]);
  for(let k=0;k<n;k++){let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(rows[i][k])>Math.abs(rows[pivot][k]))pivot=i;[rows[k],rows[pivot]]=[rows[pivot],rows[k]];
    for(let i=k+1;i<n;i++){const r=rows[i][k]/rows[k][k];for(let j=k;j<n+m;j++)rows[i][j]-=r*rows[k][j];}}
  const x=matrix(n,m,()=>0);for(let i=n-1;i>=0;i--)for(let j=0;j<m;j++)x[i][j]=(rows[i][n+j]-rows[i].slice(i+1,n).reduce((s,v,k)=>s+v*x[i+1+k][j],0))/rows[i][i];return x;
}
function observation(z=.02){return {rotation:identity(3).flat(),position:[0,0,z],covariance:scale(identity(6),.04).flat()};}

it.skipIf(!enabled)('actual full filter retains all state and225 covariance cells across held IMU intervals',async()=>{
  const batch=await session(),individual=await session();const input=frame(0),before=structuredClone(input);
  const result=batch.advance(input);for(const item of input.imuIntervals!)individual.advance({time:item.time,dt:item.dt,imu:item.imu});
  expect(result).toEqual(individual.snapshot());expect(input).toEqual(before);expect(result.steps).toBe(4);expect(result.time).toBe(4/180);
  close(result.covariance,predicted(4/180).flat());expect(result.rotation).toEqual(identity(3).flat());expect(result.position).toEqual([0,0,0]);expect(result.velocity).toEqual([0,0,0]);
  const continuation=batch.advance(frame(result.time));close(continuation.covariance,predicted(8/180).flat());expect(continuation.steps).toBe(8);record('multi-step full-state continuity + independent225-cell Lyapunov oracle');
});
it.skipIf(!enabled)('actual Modelica correction occurs only on final held interval with Gaussian/Joseph oracle',async()=>{
  const model=await session(),f=frame(0);f.observation=observation();const result=model.advance(f);
  const prior=predicted(4/180),selected=[0,1,2,6,7,8],H=matrix(6,15,(i,j)=>+(selected[i]===j)),C=scale(identity(6),.04),S=add(multiply(multiply(H,prior),transpose(H)),C);
  const K=transpose(solve(S,transpose(multiply(prior,transpose(H))))),delta=K.map(row=>row[2]*.02),residual=add(identity(15),scale(multiply(K,H),-1));
  const posterior=add(multiply(multiply(residual,prior),transpose(residual)),multiply(multiply(K,C),transpose(K)));
  close(result.covariance,posterior.flat());close(result.position,delta.slice(0,3));close(result.velocity,delta.slice(3,6));close(result.accelBias,delta.slice(9,12));close(result.gyroBias,delta.slice(12,15));
  expect(result.acceptedCount).toBe(1);expect(result.rejectedCount).toBe(0);expect(result.lastNis).toBeCloseTo(.02**2/S[2][2],12);
  const split=await session();for(const [i,item] of f.imuIntervals!.entries())split.advance({time:item.time,dt:item.dt,imu:item.imu,...(i===3?{observation:f.observation}:{})});expect(result).toEqual(split.snapshot());record('final-interval accepted correction + independent Gaussian/Joseph oracle');
});
it.skipIf(!enabled)('actual Modelica refuses NIS and finite non-SPD observations while retaining prediction',async()=>{
  for(const bad of ['NIS','covariance']){const model=await session(),f=frame(0),observed=observation(bad==='NIS'?100:.02);if(bad==='covariance')observed.covariance[35]=-.04;f.observation=observed;
    const result=model.advance(f);expect(result.acceptedCount).toBe(0);expect(result.rejectedCount).toBe(1);close(result.covariance,predicted(4/180).flat());expect(result.position).toEqual([0,0,0]);expect(result.steps).toBe(4);
    const recovery=frame(result.time);recovery.observation=observation();expect(model.advance(recovery).acceptedCount).toBe(1);}
  record('source-owned NIS/non-SPD observation refusal + recovery');
});
it.skipIf(!enabled)('malformed transport and later invalid Modelica step roll back the entire batch',async()=>{
  const model=await session(),before=model.snapshot();
  const gap=frame(0);gap.imuIntervals![1].time+=.001;expect(()=>model.advance(gap)).toThrow();expect(model.snapshot()).toEqual(before);
  const malformed=frame(0);malformed.imuIntervals![3].imu.accel=[0,0];expect(()=>model.advance(malformed)).toThrow();expect(model.snapshot()).toEqual(before);
  const nan=frame(0),observed=observation();observed.covariance[0]=NaN;nan.observation=observed;expect(()=>model.advance(nan)).toThrow();expect(model.snapshot()).toEqual(before);
  for(const invalid of [null,false,0]){const f=frame(0);f.observation=invalid as unknown as FilterFrame['observation'];expect(()=>model.advance(f)).toThrow('Invalid filter observation');expect(model.snapshot()).toEqual(before);}
  const bad=frame(0);bad.imuIntervals![1].imu.gyro=[2000,0,0];expect(()=>model.advance(bad)).toThrow('Modelica filter rejected');expect(model.snapshot()).toEqual(before);
  const slow={time:1/30,dt:1/30,imu};expect(()=>model.advance(slow)).toThrow();expect(model.snapshot()).toEqual(before);
  const recovered=model.advance(frame(0)),control=(await session()).advance(frame(0));expect(recovered).toEqual(control);expect(()=>model.advance(frame(0))).toThrow();expect(model.snapshot()).toEqual(recovered);
  record('pre-mutation malformed refusal + later Modelica invalid-step atomic rollback/recovery');
});
it.skipIf(!enabled)('reset, copied snapshots, strict reload and late timestamps preserve deterministic retained state',async()=>{
  const model=await session(),first=model.advance(frame(0));const copied=model.snapshot();copied.covariance[0]=999;expect(model.snapshot()).toEqual(first);
  const reloaded=await ModelicaFilterSession.create(artifact,source,JSON.parse(JSON.stringify(first)) as FilterSnapshot);const next=frame(first.time);expect(reloaded.advance(next)).toEqual(model.advance(next));
  for(const malformed of [{...first,covariance:first.covariance.slice(1)},{...first,covariance:first.covariance.map((x,i)=>i===0?NaN:x)},{...first,steps:.5},{...first,sourceSha256:'0'.repeat(64)}]){const prior=model.snapshot();expect(()=>model.restore(malformed)).toThrow();expect(model.snapshot()).toEqual(prior);}
  model.reset();expect(model.advance(frame(0))).toEqual(first);
  const late=await session(1e6),result=late.advance(frame(1e6));expect(result.time).toBe(1e6+4/180);close(result.covariance,predicted(4/180).flat());record('reset/reload/source binding, copied snapshots,1e6-second timestamp tolerance');
});
it.skipIf(!enabled)('actual source edit changes retained counters and refuses stale source/module reload',async()=>{
  await expect(ModelicaFilterSession.create(artifact,editedSource,{time:0,covariance:initialCovariance})).rejects.toThrow('does not match its source');
  const edited=await ModelicaFilterSession.create(editedArtifact,editedSource,{time:0,covariance:initialCovariance});
  const value=edited.advance(frame(0,2));expect(value.acceptedCount).toBe(2);expect(value.steps).toBe(2);
  const reload=await ModelicaFilterSession.create(editedArtifact,editedSource,JSON.parse(JSON.stringify(value)) as FilterSnapshot);expect(reload.advance(frame(value.time,1)).acceptedCount).toBe(3);
  edited.reset();expect(edited.advance(frame(0,2))).toEqual(value);record('actual Modelica counter source edit + persisted retained-state reload');
});
