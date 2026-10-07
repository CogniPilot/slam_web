import {it,expect} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import type * as Rumoca from '@cognipilot/rumoca';

type Vector=[number,number,number];
type Matrix=Vector[];
type Input=[string,number];
type Values=Record<string,number>;
type ReviewedCompiler=typeof Rumoca&{prepare_native_program?:(source:string,model:string)=>string};
const directory=process.env.RUMOCA_BRANCH_PKG;
const mode=process.env.RUMOCA_REGISTRATION_MODE??'full';
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const identity:Matrix=[[1,0,0],[0,1,0],[0,0,1]];
// Independent Rodrigues construction for analytic, exact matched fixtures;
// no quaternion eigensolver or production registration runs in this oracle.
function rotation(axis:Vector,angle:number):Matrix {
  const n=Math.hypot(...axis),[x,y,z]=axis.map(v=>v/n),c=Math.cos(angle),s=Math.sin(angle),d=1-c;
  return [[c+x*x*d,x*y*d-z*s,x*z*d+y*s],[y*x*d+z*s,c+y*y*d,y*z*d-x*s],[z*x*d-y*s,z*y*d+x*s,c+z*z*d]];
}
const apply=(R:Matrix,p:Vector,t:Vector):Vector=>R.map((row,i)=>row.reduce((sum,v,j)=>sum+v*p[j],t[i])) as Vector;
const determinant=(R:Matrix)=>R[0][0]*(R[1][1]*R[2][2]-R[1][2]*R[2][1])-R[0][1]*(R[1][0]*R[2][2]-R[1][2]*R[2][0])+R[0][2]*(R[1][0]*R[2][1]-R[1][1]*R[2][0]);
const near=(actual:number,expected:number,label:string,tolerance=2e-9)=>{
  expect(Number.isFinite(actual),label).toBe(true);expect(Math.abs(actual-expected),label).toBeLessThanOrEqual(tolerance*Math.max(1,Math.abs(expected)));
};
const vector=(v:Values,name:string):Vector=>[1,2,3].map(i=>v[`${name}[${i}]`]) as Vector;
const matrix=(v:Values,name:string):Matrix=>[1,2,3].map(i=>[1,2,3].map(j=>v[`${name}[${i},${j}]`]) as Vector);
const centroid=(points:Vector[]):Vector=>[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length) as Vector;
const cost=(source:Vector[],target:Vector[],R:Matrix,t:Vector)=>source.reduce((sum,p,i)=>sum+apply(R,p,t).reduce((e,v,j)=>e+(v-target[i][j])**2,0),0);
const pointSet=(capacity:number):Vector[]=>Array.from({length:capacity},(_,i)=>capacity===12?
  [(i%3)-1,Math.floor(i/3)-1.5,[1,-2,1][i%3]*(Math.floor(i/3)%2?1:-1)*.13]:
  [(i%120-59.5)/120,(Math.floor(i/120)-59.5)/240,(i%2?1:-1)*(Math.floor(i/120)%2?1:-1)*.13]);

it('independent complete-image fixtures have full rank, exact proper-transform solutions and an identifiable reflection residual',()=>{
  const points=pointSet(14400),mean=centroid(points),R=rotation([.3,-.7,.5],.81),t:Vector=[.2,-.35,.09];
  mean.forEach(v=>near(v,0,'centred full fixture'));
  for(let i=0;i<3;i++)for(let j=0;j<i;j++)near(points.reduce((sum,p)=>sum+p[i]*p[j],0),0,'diagonal covariance',1e-8);
  near(determinant(R),1,'analytic proper rotation');
  near(cost(points,points.map(p=>apply(R,p,t)),R,t),0,'analytic exact correspondence cost');
  const reflected=points.map(p=>[-p[0],p[1],p[2]] as Vector),proper:Matrix=[[-1,0,0],[0,1,0],[0,0,-1]];
  near(Math.sqrt(cost(points,reflected,proper,[0,0,0])/points.length),.26,'minimum proper reflection RMS');
  const noise=points.map((p,i)=>apply(R,p,t).map((v,j)=>v+(j===2?.01*[1,-1,-1,1][i%4]*(Math.floor(i/120)%2?1:-1):0)) as Vector);
  near(Math.sqrt(cost(points,noise,R,t)/points.length),.01,'known orthogonal residual RMS');
  // Orthogonality to each coordinate means this noise does not alter the
  // cross-covariance and hence does not alter the independently known fit.
  for(let j=0;j<3;j++)near(points.reduce((sum,p,i)=>sum+p[j]*[1,-1,-1,1][i%4]*(Math.floor(i/120)%2?1:-1),0),0,'noise orthogonality',1e-8);
});

it.skipIf(!directory)(`actual Modelica rigid registration ${mode==='control'?'12-pair numerical control (not full-capacity admission)':`14400-pair ${mode} gate`}`,async()=>{
  const compiler:ReviewedCompiler=await import(/* @vite-ignore */ pathToFileURL(resolve(directory!,'rumoca_bind_wasm.js')).href);
  const wasm=readFileSync(resolve(directory!,'rumoca_bind_wasm_bg.wasm'));
  await compiler.default({module_or_path:wasm});
  const original=readFileSync('models/Math/RigidPointRegistration.mo','utf8');
  // A control is numerical evidence only. Full admission always uses the
  // original 14,400-point source and fills every matched point.
  const control=mode==='control',capacity=control?12:14400;
  const source=control?original+'\nmodel RegistrationControl\n extends RigidPointRegistration(capacity=12);\nend RegistrationControl;\n':original;
  const model=control?'RegistrationControl':'RigidPointRegistration';
  const report:Record<string,unknown>={schemaVersion:1,status:'RUNNING',phase:'initialization',capacity,fullCapacityAdmitted:false,
    runtimeIntegrated:false,productionPinChanged:false,sourceSha256:sha(original),compilerWasmSha256:sha(wasm),
    compiler:{version:compiler.get_version(),revision:compiler.get_git_commit()},mode,cases:[],
    interface:{mapping:'targetPoint = rotation * sourcePoint + translation',inputs:['activeCount','sourcePoint[capacity,3]','targetPoint[capacity,3]','pairEnabled[capacity]'],
      outputs:['accepted','rejectionReason','rotation[3,3]','translation[3]','sourceCentroid[3]','targetCentroid[3]','validCount','invalidCount','rank','cost','rms','eigenGap']}};
  const save=()=>{if(process.env.RUMOCA_REGISTRATION_REPORT)writeFileSync(process.env.RUMOCA_REGISTRATION_REPORT,JSON.stringify(report,null,2)+'\n');};
  const phase=(name:string)=>{report.phase=name;report.phaseStartedAt=new Date().toISOString();save();console.log(`registration ${capacity} ${name}`);};
  const sessions:InstanceType<typeof compiler.WasmSimulationSession>[]=[];
  const times:number[]=[];let tick=0;
  const runCase=(session:typeof sessions[number],name:string,points:Vector[],targets:Vector[],expectedR:Matrix,expectedT:Vector,reason=0,
    settings:{count?:number;enabled?:number[];rank?:number;invalid?:number}={})=>{
    const inputs:Input[]=[['activeCount',settings.count??points.length]];
    for(let i=0;i<capacity;i++){
      inputs.push([`pairEnabled[${i+1}]`,settings.enabled?.[i]??(i<points.length?1:0)]);
      for(let j=0;j<3;j++){
        inputs.push([`sourcePoint[${i+1},${j+1}]`,points[i]?.[j]??0]);
        inputs.push([`targetPoint[${i+1},${j+1}]`,targets[i]?.[j]??0]);
      }
    }
    phase(`evaluate:${name}`);const start=performance.now();
    session.set_inputs(JSON.stringify(inputs));session.advance_to(++tick/90);
    const v=JSON.parse(session.state_json()).values as Values;times.push(performance.now()-start);
    expect(v.rejectionReason,name).toBe(reason);expect(v.accepted,name).toBe(+(reason===0));
    const R=matrix(v,'rotation'),t=vector(v,'translation');
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(R[i][j],reason?identity[i][j]:expectedR[i][j],`${name}:R${i}${j}`);
    for(let i=0;i<3;i++)near(t[i],reason?0:expectedT[i],`${name}:t${i}`);
    near(determinant(R),1,`${name}:proper rotation`);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(R.reduce((sum,row)=>sum+row[i]*row[j],0),+(i===j),`${name}:orthogonal`);
    if(settings.rank!==undefined)expect(v.rank,`${name}:rank`).toBe(settings.rank);
    if(settings.invalid!==undefined)expect(v.invalidCount,`${name}:invalidCount`).toBe(settings.invalid);
    if(reason===0){
      const active=points.filter((_,i)=>(settings.enabled?.[i]??1)===1),activeTargets=targets.filter((_,i)=>(settings.enabled?.[i]??1)===1);
      expect(v.validCount,name).toBe(active.length);
      const a=centroid(active),b=centroid(activeTargets);
      for(let j=0;j<3;j++){near(vector(v,'sourceCentroid')[j],a[j],`${name}:source centroid`);near(vector(v,'targetCentroid')[j],b[j],`${name}:target centroid`);}
      const expectedCost=cost(active,activeTargets,R,t);near(v.cost,expectedCost,`${name}:cost`,1e-8);
      near(v.rms,Math.sqrt(expectedCost/active.length),`${name}:rms`,1e-8);
    }
    (report.cases as unknown[]).push({name,activeCount:settings.count??points.length,accepted:v.accepted,reason:v.rejectionReason,rank:v.rank,validCount:v.validCount,invalidCount:v.invalidCount,cost:v.cost,rms:v.rms});save();
    return {R,t,v};
  };
  try{
    if(mode==='compile'){
      phase('source compilation');const start=performance.now();const output=compiler.compile(source,model);
      report.compilationMs=performance.now()-start;const compiled=JSON.parse(output);
      expect(compiled.balance.is_balanced).toBe(true);
      report.compilerResult={balance:compiled.balance,phaseTiming:compiled.__compile_phase_timing};report.status='COMPILED';save();return;
    }
    if(mode==='native'){
      phase('native program preparation');
      if(!compiler.prepare_native_program)throw new Error('Reviewed compiler does not expose native program preparation');
      const start=performance.now();const result=JSON.parse(compiler.prepare_native_program(source,model));
      report.nativePreparationMs=performance.now()-start;report.nativeResult=result;report.status='NATIVE_PREPARED';save();return;
    }
    phase('ordinary WASM session preparation');const start=performance.now();
    const session=compiler.WasmSimulationSession.withInteractiveOptions(source,model,1/90,'rk-like',1e-12,1e-12,'[]');
    sessions.push(session);report.preparationMs=performance.now()-start;save();
    const points=pointSet(capacity);
    const R=rotation([.3,-.7,.5],.81),t:Vector=[.2,-.35,.09],targets=points.map(p=>apply(R,p,t));
    runCase(session,'full domain non-axis rigid transform',points,targets,R,t,0,{rank:3,invalid:0});
    report.fullCapacityAdmitted=!control;save();
    const replay=runCase(session,'repeat same correspondences',points,targets,R,t);
    const planar=points.map(p=>[p[0],p[1],0] as Vector);
    runCase(session,'planar non-collinear',planar,planar.map(p=>apply(R,p,t)),R,t,0,{rank:2});
    const nearPi=rotation([1,2,-3],Math.PI-1e-8);
    runCase(session,'near half turn',points,points.map(p=>apply(nearPi,p,t)),nearPi,t);
    if(!control){
      const noisy=(magnitude:number)=>points.map((p,i)=>apply(R,p,t).map((v,j)=>v+(j===2?magnitude*[1,-1,-1,1][i%4]*(Math.floor(i/120)%2?1:-1):0)) as Vector);
      const admitted=runCase(session,'known orthogonal finite residual',points,noisy(.01),R,t);
      near(admitted.v.rms,.01,'known fitted residual RMS');
      runCase(session,'RMS gate rejects finite noisy correspondences',points,noisy(.03),identity,[0,0,0],6);
    }
    const line=points.map(p=>[p[0],0,0] as Vector);
    runCase(session,'collinear refusal',line,line.map(p=>apply(R,p,t)),identity,[0,0,0],4,{rank:1});
    const nearLine=points.map(p=>[p[0],p[1]*1e-6,0] as Vector);
    runCase(session,'relative-rank nearly collinear refusal',nearLine,nearLine.map(p=>apply(R,p,t)),identity,[0,0,0],4,{rank:1});
    const coincident=points.map(()=>[.1,.2,.3] as Vector);
    runCase(session,'coincident refusal',coincident,coincident.map(p=>apply(R,p,t)),identity,[0,0,0],4);
    runCase(session,'collapsed target eigen-gap refusal',points,coincident,identity,[0,0,0],4,{rank:3});
    runCase(session,'reflection cannot be improper rotation',points,points.map(p=>[-p[0],p[1],p[2]] as Vector),identity,[0,0,0],6);
    runCase(session,'empty observation',points,targets,identity,[0,0,0],3,{count:0});
    runCase(session,'fractional count domain',points,targets,identity,[0,0,0],1,{count:capacity-.5});
    runCase(session,'oversized count domain',points,targets,identity,[0,0,0],1,{count:capacity+1});
    runCase(session,'negative count domain',points,targets,identity,[0,0,0],1,{count:-1});
    runCase(session,'insufficient pair count',points,targets,identity,[0,0,0],3,{count:2});
    const huge=points.map(p=>[...p] as Vector);huge[capacity-1][0]=1e150;
    runCase(session,'finite huge coordinate refuses before covariance',huge,targets,identity,[0,0,0],2,{invalid:1});
    const disabled=Array.from({length:capacity},(_,i)=>i===capacity-1?0:1);
    runCase(session,'disabled huge coordinate stays masked',huge,targets,R,t,0,{enabled:disabled,invalid:0});
    const badFlags=Array(capacity).fill(1);badFlags[capacity-1]=.5;
    runCase(session,'invalid active pair flag',points,targets,identity,[0,0,0],2,{enabled:badFlags,invalid:1});
    const recovered=runCase(session,'recovery without stale state',points,targets,R,t);
    expect(recovered.R).toEqual(replay.R);expect(recovered.t).toEqual(replay.t);
    session.reset();tick=0;const reset=runCase(session,'reset deterministic replay',points,targets,R,t);
    expect(reset.R).toEqual(replay.R);expect(reset.t).toEqual(replay.t);
    session.free();sessions.pop();
    const edited=source.replace('maximumRms = 0.02','maximumRms = 0.5');expect(edited).not.toBe(source);
    phase('edited source WASM preparation');const editStart=performance.now();
    const editSession=compiler.WasmSimulationSession.withInteractiveOptions(edited,model,1/90,'rk-like',1e-12,1e-12,'[]');
    sessions.push(editSession);report.editedPreparationMs=performance.now()-editStart;report.editedSourceSha256=sha(edited);tick=0;
    // The independently known proper minimizer flips x and z, leaving the
    // reflection's smallest-variance z component as an explicit residual.
    const reflection:Matrix=[[-1,0,0],[0,1,0],[0,0,-1]];
    runCase(editSession,'edited residual gate admits proper reflection fit',points,points.map(p=>[-p[0],p[1],p[2]] as Vector),reflection,[0,0,0]);
    report.status='PASS';report.phase='complete';report.calls=times.length;
    report.meanCallMs=times.reduce((a,b)=>a+b,0)/times.length;report.maxCallMs=Math.max(...times);
    report.execution='ordinary WasmSimulationSession; native compilation is a separate admission probe';save();
  }catch(error){report.status='REFUSED_OR_FAILED';report.error=String(error);report.errorStack=error instanceof Error?error.stack:undefined;save();throw error;}
  finally{for(const session of sessions)session.free();}
},175_000);
