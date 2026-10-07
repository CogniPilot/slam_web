import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {defaultE,fixture,I,inverse,multiply,mv,observationJacobian,pointCovariance,pose,rotation,sandwich,transpose,type Fixture,type Matrix} from './rgbd-registration-uncertainty-fixtures';
const source=readFileSync('models/Estimation/Localization/RGBDRegistrationUncertainty.mo','utf8');
const artifactPath=process.env.RUMOCA_UNCERTAINTY_ARTIFACT;
const editedPath=process.env.RUMOCA_UNCERTAINTY_EDITED_ARTIFACT;
const editedSource=source.replace('parameter Real disparitySigma = 0.1;','parameter Real disparitySigma = 0.2;');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const report:Record<string,unknown>={status:'NOT_EXECUTED',sourceSha256:sha(source),capacity:350,actualNumericGroupsCompleted:0,oracleGroupsCompleted:0,cases:[],productionPinChanged:false,runtimeIntegrated:false,fullSlam:false,conditionalReferencePose:true};
const save=()=>{if(process.env.RUMOCA_UNCERTAINTY_REPORT)writeFileSync(process.env.RUMOCA_UNCERTAINTY_REPORT,JSON.stringify(report,null,2)+'\n');};
const close=(actual:number[],expected:number[],name:string,tolerance=3e-8)=>{expect(actual.length,name).toBe(expected.length);for(let i=0;i<actual.length;i++)expect(Math.abs(actual[i]-expected[i]),`${name}/${i}`).toBeLessThan(tolerance*Math.max(1,Math.abs(expected[i])));};
it('independent full350 sandwich oracle transports all covariance cells; this is not Modelica execution',()=>{
 const f=fixture(),r=sandwich(f);expect(r.validCount).toBe(350);const changed=fixture();changed.referenceRgbFocal=[60,100];expect(sandwich(changed).relativeCovariance).not.toEqual(r.relativeCovariance);
 // H^-1 alone cannot represent this anisotropic unweighted estimator.
 const information=Array.from({length:6},()=>Array(6).fill(0));
 for(let i=0;i<350;i++){
  const q=mv(f.currentFromReference,f.referencePoint[i]),cross=[[0,-q[2],q[1]],[q[2],0,-q[0]],[-q[1],q[0],0]],J=I(3).map((row,a)=>[...row,...cross[a].map(v=>-v)]);
  const cr=pointCovariance(f.referencePoint[i],f.referenceRgbFocal,f.referenceNoiseFx,f.baseline),ct=pointCovariance(f.currentPoint[i],f.currentRgbFocal,f.currentNoiseFx,f.baseline),rot=multiply(multiply(f.currentFromReference,cr),transpose(f.currentFromReference)),sigma=ct.map((row,a)=>row.map((v,b)=>v+rot[a][b])),term=multiply(multiply(transpose(J),inverse(sigma)),J);
  for(let a=0;a<6;a++)for(let b=0;b<6;b++)information[a][b]+=term[a][b];
 }
 const weighted=inverse(information);
 expect(Math.max(...weighted.flat().map((v,i)=>Math.abs(v-r.relativeCovariance.flat()[i])))).toBeGreaterThan(1e-8);
 for(let i=0;i<6;i++){expect(r.observationCovariance[i][i]).toBeGreaterThan(0);for(let j=0;j<6;j++)expect(Math.abs(r.observationCovariance[i][j]-r.observationCovariance[j][i])).toBeLessThan(1e-12);}
 expect(()=>{const d=fixture();d.referencePoint=d.referencePoint.map(()=>[0,0,2]);d.currentPoint=d.currentPoint.map(()=>[0,0,2]);sandwich(d);}).toThrow('singular');report.oracleGroupsCompleted=Number(report.oracleGroupsCompleted)+1;save();
});
it('independent central differences verify sixDOF optical→world position/body-right angle including rotated lever arm',()=>{
 for(const E of [defaultE,rotation([3,-2,1],.7)]){const f=fixture();f.opticalToBody=E;f.cameraOriginBody=[.4,-.2,.3];const base=pose(f),G=observationJacobian(f),epsilon=1e-6;
 for(let column=0;column<6;column++){const perturb=(sign:number)=>{const d=[0,0,0];d[column%3]=sign*epsilon;return column<3?pose(f,f.currentFromReference,f.translation.map((v,k)=>v+d[k])):pose(f,multiply(rotation(d,epsilon),f.currentFromReference));};
 // rotation(axis,angle): the signed tiny axis supplies the perturbation sign.
 const plus=perturb(1),minus=perturb(-1),D=multiply(transpose(base.rotation),plus.rotation.map((r,i)=>r.map((v,j)=>(v-minus.rotation[i][j])/(2*epsilon))));
 const derivative=[...plus.position.map((v,k)=>(v-minus.position[k])/(2*epsilon)),(D[2][1]-D[1][2])/2,(D[0][2]-D[2][0])/2,(D[1][0]-D[0][1])/2];close(derivative,G.map(row=>row[column]),`Jacobian column ${column}`,2e-9);}}
 report.oracleGroupsCompleted=Number(report.oracleGroupsCompleted)+1;save();
});
let artifact:NativeProgramArtifact,program:NativeProgram;
beforeAll(async()=>{if(!artifactPath)return;report.status='RUNNING';artifact=JSON.parse(readFileSync(artifactPath,'utf8'));report.artifactSha256=sha(readFileSync(artifactPath,'utf8'));report.compiler=artifact.compiler;report.moduleSha256=artifact.module_sha256;program=await NativeProgram.instantiate(artifact,source);expect(program.input('pairEnabled').length).toBe(350);save();});
afterAll(()=>{if(artifactPath&&report.status==='RUNNING')report.status=Number(report.actualNumericGroupsCompleted)===3?'ACTUAL_FULL350_NATIVE_NUMERICS_PASS':'FAILED_OR_INCOMPLETE';save();});
function run(name:string,f:Fixture,accepted=true,disparity=.1){for(const [key,value]of Object.entries(f))program.input(key).set(Array.isArray(value)?value.flat():[value]);const bytes=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();const start=performance.now();program.evaluate(0);expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(bytes);expect(program.output('valid')[0]).toBe(+accepted);
 if(accepted){const expected=sandwich(f,disparity);for(const name of ['relativeCovariance','observationCovariance','normalMatrix','noiseMatrix','observationJacobian']as const)close([...program.output(name)],expected[name].flat(),name);expect(program.output('validCount')[0]).toBe(expected.validCount);}else{expect([...program.output('relativeCovariance')]).toEqual(Array(36).fill(0));expect([...program.output('observationCovariance')]).toEqual(Array(36).fill(0));}
 (report.cases as unknown[]).push({name,valid:+accepted,elapsedMs:performance.now()-start,rejectionReason:program.output('rejectionReason')[0]});save();}
function complete(){report.actualNumericGroupsCompleted=Number(report.actualNumericGroupsCompleted)+1;save();}
it.skipIf(!artifactPath)('actual issued Modelica full350 sandwich matches anisotropic calibrated independent oracle',()=>{run('general6DOF full350',fixture());const f=fixture();f.opticalToBody=rotation([1,-2,4],.81);f.cameraOriginBody=[.4,-.2,.3];f.referenceBodyRotation=rotation([-1,4,2],-.9);run('nonidentity extrinsics and lever arm',f);const p=fixture();p.referencePoint.forEach(v=>v[2]=2);p.currentPoint=p.referencePoint.map(v=>mv(p.currentFromReference,v).map((x,k)=>x+p.translation[k]));run('planar rank2 accepted',p);complete();});
it.skipIf(!artifactPath)('actual fullslot masks, malformed counts/calibration/SO3/degeneracy refuse and recover',()=>{const sparse=fixture();sparse.pairEnabled.fill(0);for(const i of [0,100,220,349])sparse.pairEnabled[i]=1;for(let i=0;i<350;i++)if(!sparse.pairEnabled[i]){sparse.referencePoint[i].fill(NaN);sparse.currentPoint[i].fill(NaN);}run('sparse first/late slots maskedNaN',sparse);
 for(const count of [0,2,-1,.5,351,NaN,Infinity]){const f=fixture();f.activeCount=count;run(`count ${count}`,f,false);}for(const flag of [.5,NaN,2]){const f=fixture();f.pairEnabled[349]=flag;run(`late invalid mask ${flag}`,f,false);}for(const field of ['baseline','referenceNoiseFx','currentNoiseFx']as const){const f=fixture();f[field]=0;run(`invalid ${field}`,f,false);}const bad=fixture();bad.currentPoint[349][2]=NaN;run('late activeNaN',bad,false);const reflect=fixture();reflect.opticalToBody=[[-1,0,0],[0,1,0],[0,0,1]];run('improper extrinsics',reflect,false);const line=fixture();line.referencePoint=line.referencePoint.map((_,i)=>[0,0,2+i*.001]);line.currentPoint=line.referencePoint.map(p=>mv(line.currentFromReference,p).map((x,k)=>x+line.translation[k]));run('collinear rank refusal',line,false);run('recovery',fixture());complete();});
it.skipIf(!artifactPath)('actual reset and source-bound JSON reload preserve covariance; actual source edit controls variance',async()=>{const f=fixture();run('before reset',f);const saved=[...program.output('observationCovariance')];program.reset();run('after reset',f);close([...program.output('observationCovariance')],saved,'reset');await expect(NativeProgram.instantiate(artifact,editedSource)).rejects.toThrow('does not match its source');program=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);run('JSON reload',f);if(!editedPath)throw Error('Edited actual artifact required; source-edit group cannot be passed without execution');artifact=JSON.parse(readFileSync(editedPath,'utf8'));program=await NativeProgram.instantiate(artifact,editedSource);run('disparity sigma edited0.2',f,true,.2);report.editedSourceSha256=sha(editedSource);report.editedModuleSha256=artifact.module_sha256;complete();});
it('independent inverse-depth interpolation bound does not invent independent-neighbor precision',()=>{
 const weights=[.12,.18,.28,.42],sigma=.1/(450*.05),depths=[2,2.02,1.98,2.01],inverseDepth=weights.reduce((s,w,i)=>s+w/depths[i],0),z=1/inverseDepth;
 const correlated=z*z*weights.reduce((s,w)=>s+w*sigma,0),independent=z*z*Math.sqrt(weights.reduce((s,w)=>s+w*w*sigma*sigma,0));
 expect(correlated).toBeGreaterThan(independent);expect(Math.abs(correlated-z*z*sigma)).toBeLessThan(1e-14);
 report.oracleGroupsCompleted=Number(report.oracleGroupsCompleted)+1;save();
});
// Ordinary compiler-WASM execution is a separate fallback validation path, not
// native admission. No production fallback is installed by this probe.
it.skipIf(!process.env.RUMOCA_UNCERTAINTY_SESSION_PKG)('actual ordinary compiler WASM validates full350 source covariance; native admission remains separate',async()=>{
 const {resolve}=await import('node:path'),{pathToFileURL}=await import('node:url');
 const directory=process.env.RUMOCA_UNCERTAINTY_SESSION_PKG!;
 const compiler=await import(/* @vite-ignore */pathToFileURL(resolve(directory,'rumoca_bind_wasm.js')).href);
 const wasm=readFileSync(resolve(directory,'rumoca_bind_wasm_bg.wasm'));await compiler.default({module_or_path:wasm});
 report.sessionCompilerWasmSha256=createHash('sha256').update(wasm).digest('hex');report.sessionSourceSha256=sha(source);report.sessionStatus='RUNNING';report.sessionNumericCasesCompleted=0;
 const fields=(f:Fixture):[string,number][]=>Object.entries(f).flatMap(([key,v])=>Array.isArray(v)?Array.isArray(v[0])?(v as Matrix).flatMap((row,i)=>row.map((n,j)=>[`${key}[${i+1},${j+1}]`,n]as[string,number])):(v as number[]).map((n,i)=>[`${key}[${i+1}]`,n]as[string,number]):[[key,v as number]]);
 const make=(text:string)=>{report.sessionPhase='preparation';save();const start=performance.now();const s=compiler.WasmSimulationSession.withInteractiveOptions(text,'RGBDRegistrationUncertainty',1/90,'rk-like',1e-10,1e-10,JSON.stringify(fields(fixture())));report.sessionPreparationMs=performance.now()-start;save();return s;};
 let tick=0;
 const evaluate=(s:InstanceType<typeof compiler.WasmSimulationSession>,name:string,f:Fixture,valid=true,disparity=.1)=>{
  report.sessionPhase=`execute ${name}`;save();const all=fields(f),special=all.filter(([,v])=>!Number.isFinite(v));s.set_inputs(JSON.stringify(all.map(([key,v])=>[key,Number.isFinite(v)?v:0])));
  for(const[key,v]of special)s.set_input(key,v);
  const start=performance.now();s.advance_to(++tick/90);const values=JSON.parse(s.state_json()).values as Record<string,number>;
  expect(values.valid,name).toBe(+valid);const expected=valid?sandwich(f,disparity):undefined;
  for(const key of ['relativeCovariance','observationCovariance']as const)close(Array.from({length:36},(_,i)=>values[`${key}[${Math.floor(i/6)+1},${i%6+1}]`]),expected?expected[key].flat():Array(36).fill(0),name+'/'+key);
  if(expected)for(const key of ['normalMatrix','noiseMatrix','observationJacobian']as const)close(Array.from({length:36},(_,i)=>values[`${key}[${Math.floor(i/6)+1},${i%6+1}]`]),expected[key].flat(),name+'/'+key);
  (report.cases as unknown[]).push({execution:'ordinary compiler WASM',name,valid:+valid,elapsedMs:performance.now()-start,rejectionReason:values.rejectionReason});report.sessionNumericCasesCompleted=Number(report.sessionNumericCasesCompleted)+1;save();return values;
 };
 let s:InstanceType<typeof compiler.WasmSimulationSession>|undefined;
 try{
  s=make(source);evaluate(s,'full350 general6DOF',fixture());
  const other=fixture();other.opticalToBody=rotation([2,-1,3],.72);other.cameraOriginBody=[.4,-.2,.3];evaluate(s,'nonidentity extrinsics',other);
  const planar=fixture();planar.referencePoint.forEach(p=>p[2]=2);planar.currentPoint=planar.referencePoint.map(p=>mv(planar.currentFromReference,p).map((v,k)=>v+planar.translation[k]));evaluate(s,'planar rank2',planar);
  const sparse=fixture();sparse.pairEnabled.fill(0);[0,100,220,349].forEach(i=>sparse.pairEnabled[i]=1);for(let i=0;i<350;i++)if(!sparse.pairEnabled[i]){sparse.referencePoint[i].fill(NaN);sparse.currentPoint[i].fill(NaN);}evaluate(s,'sparse late-slot maskedNaN',sparse);
  for(const count of [0,2,-1,.5,351]){const f=fixture();f.activeCount=count;evaluate(s,`count ${count}`,f,false);}
  for(const bad of [.5,2,NaN]){const f=fixture();f.pairEnabled[349]=bad;evaluate(s,`late mask ${bad}`,f,false);}
  const activeNaN=fixture();activeNaN.currentPoint[349][2]=NaN;evaluate(s,'late activeNaN',activeNaN,false);
  const reflect=fixture();reflect.opticalToBody=[[-1,0,0],[0,1,0],[0,0,1]];evaluate(s,'reflection',reflect,false);
  const calibration=fixture();calibration.referenceNoiseFx=0;evaluate(s,'invalid physical calibration',calibration,false);
  const line=fixture();line.referencePoint=line.referencePoint.map((_,i)=>[0,0,2+i*.001]);line.currentPoint=line.referencePoint.map(p=>mv(line.currentFromReference,p).map((v,k)=>v+line.translation[k]));evaluate(s,'collinear',line,false);
  const recovery=evaluate(s,'recovery',fixture());s.reset();tick=0;const reset=evaluate(s,'reset',fixture());close([reset['observationCovariance[1,1]']],[recovery['observationCovariance[1,1]']],'reset');
  s.free();s=undefined;const saved=JSON.parse(JSON.stringify({source}));s=make(saved.source);evaluate(s,'saved source reload',fixture());s.free();s=undefined;
  s=make(editedSource);tick=0;evaluate(s,'actual disparity parameter edit',fixture(),true,.2);report.sessionEditedSourceSha256=sha(editedSource);
  report.sessionStatus='ACTUAL_FULL350_ORDINARY_WASM_NUMERICS_PASS';
 }catch(error){report.sessionStatus='FAILED_OR_REFUSED';report.sessionFailure=String(error);throw error;}finally{s?.free();save();}
},600_000);
