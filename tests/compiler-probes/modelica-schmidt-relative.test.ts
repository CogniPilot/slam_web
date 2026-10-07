import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {correction,derivedJacobian,fixture,gaugeFixture,geometryCases,inputs,innovation,jacobian,mat,minus,mv,norm,plus,predicted,product,rot,exp,tr,type Mat} from './schmidt-relative-fixtures';

const source=['RGBDRelativePose','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection'].map(n=>readFileSync(`models/${n}.mo`,'utf8')).join('');
const artifactFile=process.env.RUMOCA_SCHMIDT_RELATIVE_ARTIFACT;
const sha=(x:string|Uint8Array)=>createHash('sha256').update(x).digest('hex');
const flat=(v:unknown):number[]=>Array.isArray(v)?v.flat(Infinity) as number[]:[v as number];
const difference=(a:ArrayLike<number>,b:ArrayLike<number>)=>Math.max(0,...Array.from(a).map((v,i)=>Math.abs(v-b[i])));
function near(a:ArrayLike<number>,b:ArrayLike<number>,label:string,tolerance=2e-7){expect(a.length,label).toBe(b.length);expect(difference(a,b),label).toBeLessThan(tolerance);}
function put(p:NativeProgram,x:Record<string,unknown>){for(const [name,v] of Object.entries(x))p.input(name).set(flat(v));}
function parameterBytes(p:NativeProgram,a:NativeProgramArtifact){return new Uint8Array(p.memory.buffer,a.abi.p_offset,a.abi.p_count*8).slice();}
// Independent LDL: no model jitter and no copied Modelica Cholesky formulas.
function psd(P:Mat,tolerance=1e-9){
  const a=P.map(r=>[...r]);for(let i=0;i<a.length;i++)for(let j=0;j<a.length;j++)expect(Math.abs(a[i][j]-a[j][i])).toBeLessThan(tolerance);
  for(let k=0;k<a.length;k++){expect(a[k][k]).toBeGreaterThan(-tolerance);if(a[k][k]<tolerance){for(let j=k+1;j<a.length;j++)expect(Math.abs(a[k][j])).toBeLessThan(tolerance);continue;}
    for(let i=k+1;i<a.length;i++)for(let j=k+1;j<a.length;j++)a[i][j]-=a[i][k]*a[j][k]/a[k][k];}
}

it('independent optical geometry and finite differences respect relative gauge and right-local conventions',()=>{
  for(const {f} of geometryCases()){
    const H=jacobian(f),cameraTranspose=tr(rot(product(f.q,f.b)));
    near(derivedJacobian(f).flat(),H.flat(),'all21 derived analytic columns vs FD',4e-9);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      expect(H[i][j]).toBeCloseTo(-cameraTranspose[i][j],7);
      expect(H[i][j+15]).toBeCloseTo(cameraTranspose[i][j],7);
    }
    for(let i=0;i<6;i++)for(let j=3;j<6;j++)expect(Math.abs(H[i][j])).toBe(0);
    const shifted=structuredClone(f);shifted.p=plus(f.p,[15,-23,9]);shifted.pr=plus(f.pr,[15,-23,9]);
    near(innovation(shifted),innovation(f),'global translation invariant',1e-12);
    // A common WORLD rotation must be expressed in each body's own local tangent.
    const axis=[.3,-.5,.7];
    const cross=(p:number[])=>[axis[1]*p[2]-axis[2]*p[1],axis[2]*p[0]-axis[0]*p[2],axis[0]*p[1]-axis[1]*p[0]];
    const g=[...cross(f.p),0,0,0,...mv(tr(rot(f.q)),axis),0,0,0,0,0,0,...cross(f.pr),...mv(tr(rot(f.qr)),axis)];
    expect(norm(mv(H,g))).toBeLessThan(2e-8);
    const p=predicted(f),landmark=[2,.3,4],refOptical=mv(tr(rot(product(f.qr,f.b))),minus(landmark,plus(f.pr,mv(rot(f.qr),f.o))));
    const currentOptical=mv(tr(rot(product(f.q,f.b))),minus(landmark,plus(f.p,mv(rot(f.q),f.o))));
    near(plus(mv(rot(p.q),refOptical),p.t),currentOptical,'optical point transform',2e-12);
  }
});

it('full21 Schmidt Joseph/reset preserves reference and common-position uncertainty',()=>{
  const small=gaugeFixture(0),common=gaugeFixture(40),a=correction(small),b=correction(common);
  near(a.S.flat(),b.S.flat(),'common uncertainty cancels from relative S',2e-7);
  near(a.d,b.d,'common uncertainty does not create absolute gain',2e-7);
  near(b.posterior.slice(15).map(r=>r.slice(15)).flat(),common.P.slice(15).map(r=>r.slice(15)).flat(),'reference unchanged',2e-10);
  for(let i=0;i<21;i++)for(let j=0;j<21;j++){
    const commonExpected=(i<3||i>=15&&i<18)&&(j<3||j>=15&&j<18)&&i%15===j%15?40:0;
    expect(Math.abs(b.posterior[i][j]-a.posterior[i][j]-commonExpected)).toBeLessThan(2e-6);
  }
  expect(b.posterior[0][0]).toBeGreaterThan(40);expect(b.posterior[0][0]).toBeLessThan(common.P[0][0]);
  expect(b.K.slice(15).flat().every(v=>v===0)).toBe(true);psd(b.posterior);
  // Destroying the retained cross-correlation changes the statistical problem:
  // it falsely treats two copies of the common global uncertainty as independent.
  const disconnected=structuredClone(common);
  for(let i=0;i<15;i++)for(let j=15;j<21;j++){disconnected.P[i][j]=0;disconnected.P[j][i]=0;}
  expect(correction(disconnected).posterior[0][0]).toBeLessThan(30);
  const f=fixture(),r=correction(f);psd(r.posterior);expect(r.nis).toBeGreaterThan(0);expect(r.nis).toBeLessThan(22.46);
  expect(difference(r.posterior.slice(0,15).map(v=>v.slice(15)).flat(),f.P.slice(0,15).map(v=>v.slice(15)).flat())).toBeGreaterThan(1e-5);
  const coupled=correction(geometryCases().find(x=>x.label==='strong attitude-reference cross reset')!.f);
  expect(difference(coupled.posterior.slice(6,9).map(v=>v.slice(15)).flat(),coupled.joseph.slice(6,9).map(v=>v.slice(15)).flat())).toBeGreaterThan(1e-5);
  if(process.env.RUMOCA_SCHMIDT_ORACLE_REPORT)writeFileSync(process.env.RUMOCA_SCHMIDT_ORACLE_REPORT,JSON.stringify({
    sourceSha256:sha(source),geometryCases:geometryCases().length,
    maximumAnalyticVsFiniteDifferenceHError:Math.max(...geometryCases().map(({f})=>difference(derivedJacobian(f).flat(),jacobian(f).flat()))),
    commonPositionVariance:40,commonPriorPositionVariance:common.P[0][0],commonPosteriorPositionVariance:b.posterior[0][0],
    incorrectUncorrelatedPosteriorPositionVariance:correction(disconnected).posterior[0][0],
    commonSInvarianceError:difference(a.S.flat(),b.S.flat()),commonCorrectionInvarianceError:difference(a.d,b.d),
    referencePreserved:true,posteriorPsd:true,nativeNumericallyVerified:false,
  },null,2)+'\n');
});

it.skipIf(!artifactFile)('actual full15+6 source-issued Schmidt correction matches independent FD/Joseph and rejects invalid observations',async()=>{
  const artifactRaw=readFileSync(artifactFile!,'utf8'),artifact=JSON.parse(artifactRaw) as NativeProgramArtifact,p=await NativeProgram.instantiate(artifact,source),cases:Record<string,unknown>[]=[];
  const browserCases:{label:string;inputs:Record<string,(number|string)[]>;expected:Record<string,{values:(number|string)[];tolerance:number}>}[]=[];
  const encoded=(value:unknown)=>flat(value).map(v=>Number.isNaN(v)?'NaN':v===Infinity?'Infinity':v===-Infinity?'-Infinity':v);
  const fixtureInputs=(x:Record<string,unknown>)=>Object.fromEntries(Object.entries(x).map(([name,value])=>[name,encoded(value)]));
  const expectedField=(value:unknown,tolerance=2e-7)=>({values:encoded(value),tolerance});
  const run=(label:string,x:Record<string,unknown>)=>{put(p,x);const bytes=parameterBytes(p,artifact);p.evaluate(0);expect(parameterBytes(p,artifact),`${label} P readonly`).toEqual(bytes);return p.output('accepted')[0];};
  for(const {label,f} of geometryCases()){
    const oracle=correction(f),x=inputs(f);expect(run(label,x)).toBe(1);
    near(p.output('innovation'),oracle.r,label);near(p.output('measurementJacobian'),oracle.H.flat(),label);
    near(p.output('innovationCovariance'),oracle.S.flat(),label,2e-7);expect(Math.abs(p.output('nis')[0]-oracle.nis)).toBeLessThan(3e-7);
    near(p.output('nextPosition'),plus(f.p,oracle.d.slice(0,3)),label);near(p.output('nextVelocity'),plus(f.v,oracle.d.slice(3,6)),label);
    near(p.output('nextRotation'),rot(oracle.nextQ).flat(),label);near(p.output('nextAccelBias'),plus(f.ba,oracle.d.slice(9,12)),label);
    near(p.output('nextGyroBias'),plus(f.bg,oracle.d.slice(12,15)),label);
    near(p.output('nextCovariance'),oracle.posterior.slice(0,15).map(r=>r.slice(0,15)).flat(),label,2e-6);
    near(p.output('nextCrossCovariance'),oracle.posterior.slice(0,15).map(r=>r.slice(15)).flat(),label,2e-6);
    expect([...p.output('nextReferenceCovariance')]).toEqual(flat(x.referenceCovariance));
    const pc=p.output('nextCovariance'),px=p.output('nextCrossCovariance'),pr=p.output('nextReferenceCovariance');
    const augmented=mat(21,21,(i,j)=>i<15?(j<15?pc[i*15+j]:px[i*6+j-15]):j<15?px[j*6+i-15]:pr[(i-15)*6+j-15]);
    psd(augmented,2e-8);
    if(label==='correlated gauge')expect(augmented[0][0]).toBeGreaterThan(40);
    browserCases.push({label,inputs:fixtureInputs(x),expected:{accepted:expectedField([1],0),
      innovation:expectedField(oracle.r),measurementJacobian:expectedField(oracle.H),innovationCovariance:expectedField(oracle.S),nis:expectedField([oracle.nis],3e-7),
      nextPosition:expectedField(plus(f.p,oracle.d.slice(0,3))),nextVelocity:expectedField(plus(f.v,oracle.d.slice(3,6))),
      nextRotation:expectedField(rot(oracle.nextQ)),nextAccelBias:expectedField(plus(f.ba,oracle.d.slice(9,12))),nextGyroBias:expectedField(plus(f.bg,oracle.d.slice(12,15))),
      nextCovariance:expectedField(oracle.posterior.slice(0,15).map(r=>r.slice(0,15)),2e-6),
      nextCrossCovariance:expectedField(oracle.posterior.slice(0,15).map(r=>r.slice(15)),2e-6),nextReferenceCovariance:expectedField(x.referenceCovariance,0),
    }});
    cases.push({label,accepted:true,HError:difference(p.output('measurementJacobian'),oracle.H.flat()),covarianceError:difference(p.output('nextCovariance'),oracle.posterior.slice(0,15).map(r=>r.slice(0,15)).flat()),nis:p.output('nis')[0]});
  }
  const base=inputs(fixture()),invalid:{label:string;edit:(x:Record<string,unknown>)=>void}[]=[
    {label:'dropout',edit:x=>{x.measurementEnabled=[0];}},{label:'fractional enable',edit:x=>{x.measurementEnabled=[.5];}},
    {label:'position outlier',edit:x=>{x.measuredTranslation=[80,-30,20];}},
    {label:'angular outlier',edit:x=>{x.measuredRotation=rot(exp([2,0,0]));}},
    {label:'reflection',edit:x=>{x.measuredRotation=[[-1,0,0],[0,1,0],[0,0,1]];}},
    {label:'invalid retained reference rotation',edit:x=>{(x.referenceRotation as Mat)[0][0]+=.1;}},
    {label:'invalid extrinsic rotation',edit:x=>{(x.opticalToBody as Mat)[1][0]+=.1;}},
    {label:'excessive finite lever',edit:x=>{x.cameraOriginBody=[11,0,0];}},
    {label:'bias limit',edit:x=>{x.accelBias=[3,0,0];}},
    {label:'asymmetric prior',edit:x=>{(x.covariance as Mat)[0][1]+=.2;}},
    {label:'indefinite augmented cross covariance',edit:x=>{(x.crossCovariance as Mat)[0][0]=2;}},
    {label:'indefinite reference covariance',edit:x=>{(x.referenceCovariance as Mat)[0][0]=-.1;}},
    {label:'singular measurement noise',edit:x=>{x.relativeCovariance=mat(6,6,()=>0);}},
    {label:'indefinite measurement noise',edit:x=>{(x.relativeCovariance as Mat)[0][0]=-.1;}},
    {label:'asymmetric measurement noise',edit:x=>{(x.relativeCovariance as Mat)[0][1]+=.1;}},
    {label:'NaN covariance',edit:x=>{(x.covariance as Mat)[0][0]=NaN;}},
    {label:'infinite lever',edit:x=>{x.cameraOriginBody=[Infinity,0,0];}},
  ];
  for(const c of invalid){const x=structuredClone(base);c.edit(x);expect(run(c.label,x)).toBe(0);
    for(const [out,input] of [['nextPosition','position'],['nextVelocity','velocity'],['nextRotation','rotation'],['nextAccelBias','accelBias'],['nextGyroBias','gyroBias'],['nextCovariance','covariance'],['nextCrossCovariance','crossCovariance'],['nextReferenceCovariance','referenceCovariance']])expect([...p.output(out)],`${c.label}/${out}`).toEqual(flat(x[input]));
    cases.push({label:c.label,accepted:false,statePreserved:true});expect(run('recovery',base)).toBe(1);
    const expected:Record<string,{values:(number|string)[];tolerance:number}>={accepted:expectedField([0],0)};
    for(const [out,input] of [['nextPosition','position'],['nextVelocity','velocity'],['nextRotation','rotation'],['nextAccelBias','accelBias'],['nextGyroBias','gyroBias'],['nextCovariance','covariance'],['nextCrossCovariance','crossCovariance'],['nextReferenceCovariance','referenceCovariance']])expected[out]=expectedField(x[input],0);
    browserCases.push({label:c.label,inputs:fixtureInputs(x),expected});
  }
  const expected=[...p.output('nextCovariance')];p.reset();expect(run('reset',base)).toBe(1);expect([...p.output('nextCovariance')]).toEqual(expected);
  const reload=await NativeProgram.instantiate(JSON.parse(JSON.stringify(artifact)),source);put(reload,base);reload.evaluate(0);expect([...reload.output('nextCovariance')]).toEqual(expected);
  await expect(NativeProgram.instantiate(artifact,source+'\n// edit')).rejects.toThrow('does not match its source');
  if(process.env.RUMOCA_SCHMIDT_RELATIVE_REPORT)writeFileSync(process.env.RUMOCA_SCHMIDT_RELATIVE_REPORT,JSON.stringify({sourceSha256:sha(source),moduleSha256:artifact.module_sha256,moduleBytes:artifact.module_bytes.length,dimension:21,cases,PReadonly:true,reset:true,reload:true,staleSourceRejected:true,runtimeIntegrated:false,fullSlam:false},null,2)+'\n');
  if(process.env.RUMOCA_SCHMIDT_BROWSER_FIXTURES)writeFileSync(process.env.RUMOCA_SCHMIDT_BROWSER_FIXTURES,JSON.stringify({
    schemaVersion:1,sourceSha256:sha(source),moduleSha256:artifact.module_sha256,artifactSha256:sha(artifactRaw),
    oracleSourceSha256:sha(readFileSync('tests/compiler-probes/schmidt-relative-fixtures.ts')),dimension:21,recoveryCase:0,
    cases:browserCases,expectedOrigin:'Independent quaternion finite differences, pivoted Gaussian solve and full21 Schmidt Joseph/reset oracle; never model outputs',
  },null,2)+'\n');
},120_000);
