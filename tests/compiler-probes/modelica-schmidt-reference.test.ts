import {modelicaSourcePath} from '../../src/modelica-source-locations.mjs';
import {expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {correction,correlated,eye,exp,mat,mm,plus,predicted,product,rot,tr,type Fixture,type Mat} from './schmidt-relative-fixtures';
import {captureInputs,captured,correctedFactors,covariance,latentFixture,noiseFactor,nominalInputs,poseIndices,predictionInputs,propagated,stationary,transition,type Factors} from './schmidt-reference-fixtures';
const names=['RGBDRelativePose','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection','ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SchmidtReferenceState'];
const source=names.map(n=>readFileSync(modelicaSourcePath(n),'utf8')).join('');
const sha=(x:string|Uint8Array)=>createHash('sha256').update(x).digest('hex');
const flat=(x:unknown):number[]=>Array.isArray(x)?x.flat(Infinity) as number[]:[x as number];
const diff=(a:ArrayLike<number>,b:ArrayLike<number>)=>Math.max(0,...Array.from(a).map((v,i)=>Math.abs(v-b[i])));
function near(a:ArrayLike<number>,b:ArrayLike<number>,label:string,tol=2e-10){expect(a.length,label).toBe(b.length);expect(diff(a,b),label).toBeLessThan(tol);}
const poseSelection=mat(6,15,(i,j)=>+(poseIndices[i]===j));
// A dense LDL pivot check is independent of source PSD validation.
function positiveSemidefinite(P:Mat){const a=P.map(r=>[...r]);for(let i=0;i<a.length;i++)for(let j=0;j<a.length;j++)expect(Math.abs(a[i][j]-a[j][i])).toBeLessThan(2e-9);
  for(let k=0;k<a.length;k++){expect(a[k][k]).toBeGreaterThan(-2e-9);if(a[k][k]<=0){for(let j=k+1;j<a.length;j++)expect(Math.abs(a[k][j])).toBeLessThan(2e-8);continue;}for(let i=k+1;i<a.length;i++)for(let j=k+1;j<a.length;j++)a[i][j]-=a[i][k]*a[j][k]/a[k][k];}}
function matrixPrediction(f:Factors){const c=covariance(f),Phi=transition(),B=noiseFactor(),Q=mm(B,tr(B)),P=mm(mm(Phi,c.current),tr(Phi));return {P:mat(15,15,(i,j)=>P[i][j]+Q[i][j]),cross:mm(Phi,c.cross)};}

it('full21 independent latent factors preserve shared offset through repeated prediction and replacement',()=>{
  let f=latentFixture();const initial=covariance(f),Phi=transition(),B=noiseFactor();
  for(let i=0;i<12;i++){const expected=matrixPrediction(f),next=propagated(f,Phi,B),actual=covariance(next);
    near(actual.current.flat(),expected.P.flat(),'current covariance');near(actual.cross.flat(),expected.cross.flat(),'cross propagation');
    expect(actual.reference).toEqual(initial.reference);positiveSemidefinite(actual.joint);f=next;}
  const before=covariance(f),capture=captured(f),after=covariance(capture);
  near(after.cross.flat(),mm(before.current,tr(poseSelection)).flat(),'all90 cross entries');
  near(after.reference.flat(),mm(mm(poseSelection,before.current),tr(poseSelection)).flat(),'all36 reference entries');
  expect(after.current).toEqual(before.current);positiveSemidefinite(after.joint);
  expect(after.current[0][0]).toBeGreaterThan(60);expect(after.reference[0][0]).toBeGreaterThan(60);expect(after.cross[0][0]).toBeGreaterThan(60);
  expect(diff(before.cross.flat(),after.cross.flat())).toBeGreaterThan(.001);
  const next=covariance(propagated(capture,Phi,B));expect(next.reference).toEqual(after.reference);positiveSemidefinite(next.joint);
  near(covariance(propagated(f,eye(15),mat(15,0,()=>0))).joint.flat(),before.joint.flat(),'zero transition/noise covariance identity');
});

it('reference pose selection uses current right-local theta and retains all velocity/bias correlations',()=>{
  const f=latentFixture();f.current[4][8]=.02;f.current[10][6]=.03;const c=covariance(captured(f)),p=covariance(f).current;
  expect(c.cross[4][5]).not.toBe(0);expect(c.cross[10][3]).not.toBe(0);
  expect(c.cross[4][5]).toBe(p[4][8]);expect(c.cross[10][3]).toBe(p[10][6]);
  const s=stationary();expect(s.powers[4].flat().every(v=>Math.abs(v)<1e-20)).toBe(true);positiveSemidefinite(mm(s.B,tr(s.B)));
});

type Case={label:string;inputs:Record<string,unknown>;expected:Record<string,unknown>;tolerance?:number};
const blockExpected=(f:Factors)=>{const c=covariance(f);return {accepted:[1],nextCovariance:c.current,nextCrossCovariance:c.cross,nextReferenceCovariance:c.reference};};
function cases(){
  const f=latentFixture(),before=covariance(f),prediction:Case[]=[{label:'correlated full21 prediction',inputs:predictionInputs(f),expected:blockExpected(propagated(f,transition(),noiseFactor()))}];
  let history=f;for(let i=0;i<12;i++){const x=predictionInputs(history),next=propagated(history,transition(),noiseFactor());prediction.push({label:`frozen-reference step${i}`,inputs:x,expected:blockExpected(next)});history=next;}
  const capture:Case[]=[];
  for(const [label,available,state] of [['initial creation',0,f],['replacement after12 steps',1,history]] as const){const x=captureInputs(state);x.referenceAvailable=[available];const c=covariance(captured(state));capture.push({label,inputs:x,expected:{accepted:[1],rejected:[0],nextReferenceAvailable:[1],nextReferencePosition:x.position,nextReferenceRotation:x.rotation,nextCovariance:c.current,nextCrossCovariance:c.cross,nextReferenceCovariance:c.reference}});}
  const rejectedPrediction:{label:string;edit:(x:Record<string,unknown>)=>void}[]=[{label:'disabled prediction',edit:x=>{x.predictionEnabled=[0];}},{label:'malformed availability',edit:x=>{x.referenceAvailable=[.5];}},{label:'indefinite process covariance',edit:x=>{(x.processCovariance as Mat)[0][0]=-.1;}},{label:'invalid joint cross',edit:x=>{(x.crossCovariance as Mat)[0][5]=100;}},{label:'NaN transition',edit:x=>{(x.transition as Mat)[0][0]=NaN;}}];
  for(const c of rejectedPrediction){const x:Record<string,unknown>=predictionInputs(f);c.edit(x);prediction.push({label:c.label,inputs:x,expected:{accepted:[0],nextCovariance:x.covariance,nextCrossCovariance:x.crossCovariance,nextReferenceCovariance:x.referenceCovariance}});}
  const noRef=predictionInputs(f);noRef.referenceAvailable=[0];prediction.push({label:'no-reference prediction',inputs:noRef,expected:{accepted:[1],nextCovariance:covariance(propagated(f,transition(),noiseFactor())).current,nextCrossCovariance:before.cross,nextReferenceCovariance:before.reference}});
  const invalidCapture:{label:string;edit:(x:Record<string,unknown>)=>void}[]=[{label:'no replacement requested',edit:x=>{x.captureRequested=[0];}},{label:'invalid current frame',edit:x=>{x.currentValid=[0];}},{label:'fractional request',edit:x=>{x.captureRequested=[.5];}},{label:'reflected current rotation',edit:x=>{x.rotation=[[-1,0,0],[0,1,0],[0,0,1]];}},{label:'indefinite current covariance',edit:x=>{(x.covariance as Mat)[0][0]=-.1;}},{label:'invalid old joint covariance',edit:x=>{(x.crossCovariance as Mat)[0][5]=100;}},{label:'nonfinite current position',edit:x=>{x.position=[NaN,0,0];}}];
  for(const c of invalidCapture){const x:Record<string,unknown>=captureInputs(f);c.edit(x);capture.push({label:c.label,inputs:x,expected:{accepted:[0],rejected:[c.label==='no replacement requested'?0:1],nextReferenceAvailable:x.referenceAvailable,nextReferencePosition:x.referencePosition,nextReferenceRotation:x.referenceRotation,nextCovariance:x.covariance,nextCrossCovariance:x.crossCovariance,nextReferenceCovariance:x.referenceCovariance}});}
  const predictionNominal:Case[]=[];for(const h of [1/90,.02]){const x=nominalInputs(f,h),s=stationary(h),c=covariance(propagated(f,s.Phi,s.B));predictionNominal.push({label:`stationary held-IMU h=${h}`,inputs:x,expected:{accepted:[1],transition:s.Phi,processCovariance:mm(s.B,tr(s.B)),nextPosition:(x.position as number[]).map((v,i)=>v+(x.velocity as number[])[i]*h),nextVelocity:x.velocity,nextRotation:x.rotation,nextAccelBias:x.accelBias,nextGyroBias:x.gyroBias,nextCovariance:c.current,nextCrossCovariance:c.cross,nextReferenceCovariance:x.referenceCovariance,nextReferencePosition:x.referencePosition,nextReferenceRotation:x.referenceRotation,nextReferenceAvailable:[1]}});}
  const zero=nominalInputs(f,0);predictionNominal.push({label:'zero-dt preserves complete state',inputs:zero,expected:{accepted:[0],nextPosition:zero.position,nextVelocity:zero.velocity,nextRotation:zero.rotation,nextAccelBias:zero.accelBias,nextGyroBias:zero.gyroBias,nextCovariance:zero.covariance,nextCrossCovariance:zero.crossCovariance,nextReferenceCovariance:zero.referenceCovariance,nextReferencePosition:zero.referencePosition,nextReferenceRotation:zero.referenceRotation,nextReferenceAvailable:zero.referenceAvailable}});
  // Complete transaction fixtures use the oracle's factor state from the prior
  // frame, rather than inventing an independent reference at every step.
  const step:Case[]=[],h=1/90,s=stationary(h),R=s.R;
  const stateFields=(x:Record<string,unknown>)=>({nextPosition:x.position,nextVelocity:x.velocity,nextRotation:x.rotation,nextAccelBias:x.accelBias,nextGyroBias:x.gyroBias,
    nextCovariance:x.covariance,nextCrossCovariance:x.crossCovariance,nextReferenceCovariance:x.referenceCovariance,
    nextReferencePosition:x.referencePosition,nextReferenceRotation:x.referenceRotation,nextReferenceAvailable:x.referenceAvailable});
  const flags=(prediction:number,capture:number,rejected=0)=>({predictionAccepted:[prediction],observationAccepted:[0],observationRejected:[rejected],captureAccepted:[capture],captureRejected:[0]});
  const defaults={measurementEnabled:[0],captureRequested:[0],referenceEpoch:[0],currentEpoch:[1],referenceUsed:[0],lastUsedEpoch:[-1]};
  const epochFields={nextReferenceEpoch:[0],nextReferenceUsed:[0],nextLastUsedEpoch:[-1]};
  const zeroStep={...zero,...defaults,captureRequested:[1]};step.push({label:'zero-dt refuses replacement without losing old reference',inputs:zeroStep,expected:{...stateFields(zeroStep),...epochFields,...flags(0,0),captureRejected:[1]}});
  const missing={...nominalInputs(f),...defaults,referenceAvailable:[0],currentEpoch:[0],measurementEnabled:[1]};const missingCurrent=covariance(propagated(f,s.Phi,s.B));
  step.push({label:'no-reference prediction cannot accept a relative observation',inputs:missing,expected:{...stateFields(missing),...epochFields,...flags(1,0,1),imageReuseRejected:[1],nextPosition:(missing.position as number[]).map((v,i)=>v+(missing.velocity as number[])[i]*h),nextCovariance:missingCurrent.current}});
  let chain=captured(propagated(f,s.Phi,s.B)),position=[.6+.1*h,-.8-.2*h,1.2+.3*h],referencePosition=[...position];
  const first={...missing,captureRequested:[1]},firstCov=covariance(chain);
  step.push({label:'initial creation snapshots predicted current covariance',inputs:first,expected:{...stateFields(first),...epochFields,...flags(1,1,1),imageReuseRejected:[1],nextPosition:position,nextCovariance:firstCov.current,nextCrossCovariance:firstCov.cross,nextReferenceCovariance:firstCov.reference,nextReferencePosition:referencePosition,nextReferenceRotation:R,nextReferenceAvailable:[1]}});
  for(let i=0;i<12;i++){
    const x={...nominalInputs(chain),...defaults,currentEpoch:[i+1],position:[...position],referencePosition:[...referencePosition],referenceRotation:R},next=propagated(chain,s.Phi,s.B),c=covariance(next),nextPosition=position.map((v,j)=>v+(x.velocity as number[])[j]*h);
    step.push({label:`persistent frozen-reference transaction${i}`,inputs:x,expected:{...stateFields(x),...epochFields,...flags(1,0),imagePairEligible:[1],nextPosition,nextCovariance:c.current,nextCrossCovariance:c.cross,nextReferenceCovariance:c.reference}});
    chain=next;position=nextPosition;
  }
  const replace={...nominalInputs(chain),...defaults,currentEpoch:[13],position:[...position],referencePosition:[...referencePosition],referenceRotation:R,captureRequested:[1]},replacement=covariance(captured(propagated(chain,s.Phi,s.B))),lastPosition=position.map((v,j)=>v+(replace.velocity as number[])[j]*h);
  step.push({label:'replacement refreezes after prediction without zeroing common uncertainty',inputs:replace,expected:{...stateFields(replace),...epochFields,nextReferenceEpoch:[13],...flags(1,1),nextPosition:lastPosition,nextCovariance:replacement.current,nextCrossCovariance:replacement.cross,nextReferenceCovariance:replacement.reference,nextReferencePosition:lastPosition,nextReferenceRotation:R}});
  const observation:Fixture={p:lastPosition,v:replace.velocity as number[],q:exp([.35,-.28,.17]),ba:replace.accelBias as number[],bg:replace.gyroBias as number[],
    pr:referencePosition,qr:exp([.35,-.28,.17]),b:exp([.7,-.5,1.1]),o:[.23,-.12,.07],z:exp([0,0,0]),t:[0,0,0],
    P:covariance(propagated(chain,s.Phi,s.B)).joint,C:correlated(6,.03)};
  const z=predicted(observation);observation.t=plus(z.t,[.012,-.008,.01]);observation.z=product(exp([.015,-.01,.008]),z.q);
  const corrected=correction(observation),pc=corrected.posterior.slice(0,15).map(r=>r.slice(0,15)),px=corrected.posterior.slice(0,15).map(r=>r.slice(15)),pNext=plus(observation.p,corrected.d.slice(0,3)),RNext=rot(corrected.nextQ),vNext=plus(observation.v,corrected.d.slice(3,6)),baNext=plus(observation.ba,corrected.d.slice(9,12)),bgNext=plus(observation.bg,corrected.d.slice(12,15));
  expect(corrected.nis).toBeLessThan(22.46);
  step.push({label:'relative correction consumes images and refuses same-frame replacement',tolerance:2e-7,
    inputs:{...replace,measurementEnabled:[1],opticalToBody:rot(observation.b),cameraOriginBody:observation.o,measuredRotation:rot(observation.z),measuredTranslation:observation.t,relativeCovariance:observation.C},
    expected:{...stateFields(replace),...flags(1,0),observationAccepted:[1],captureRejected:[1],nextReferenceEpoch:[0],nextReferenceUsed:[1],nextLastUsedEpoch:[13],
      nextPosition:pNext,nextVelocity:vNext,nextRotation:RNext,nextAccelBias:baNext,nextGyroBias:bgNext,
      nextCovariance:pc,nextCrossCovariance:px,nextReferenceCovariance:replace.referenceCovariance}});
  const outlier:Fixture={...observation,t:plus(observation.t,[3,-2,1])};
  expect(correction(outlier).nis).toBeGreaterThan(22.46);
  const rejectedObservation={...replace,measurementEnabled:[1],opticalToBody:rot(outlier.b),cameraOriginBody:outlier.o,
    measuredRotation:rot(outlier.z),measuredTranslation:outlier.t,relativeCovariance:outlier.C};
  step.push({label:'innovation rejection still consumes the disjoint image pair',inputs:rejectedObservation,
    expected:{...stateFields(rejectedObservation),...flags(1,0,1),captureRejected:[1],
      nextPosition:lastPosition,nextCovariance:observation.P.slice(0,15).map(r=>r.slice(0,15)),
      nextCrossCovariance:observation.P.slice(0,15).map(r=>r.slice(15)),
      nextReferenceEpoch:[0],nextReferenceUsed:[1],nextLastUsedEpoch:[13]}});
  const malformedEpoch={...replace,currentEpoch:[13.5],measurementEnabled:[1]};
  step.push({label:'malformed epoch blocks visual update and replacement but preserves valid IMU prediction',inputs:malformedEpoch,
    expected:{...stateFields(malformedEpoch),...epochFields,...flags(1,0,1),captureRejected:[1],imageReuseRejected:[1],
      nextPosition:lastPosition,nextCovariance:observation.P.slice(0,15).map(r=>r.slice(0,15)),
      nextCrossCovariance:observation.P.slice(0,15).map(r=>r.slice(15))}});
  const injected=correctedFactors(propagated(chain,s.Phi,s.B),corrected.H,corrected.K,corrected.N,corrected.d);
  near(covariance(injected).joint.flat(),corrected.posterior.flat(),'independent latent Joseph/reset factors',2e-8);
  const freshDynamics=stationary(h,RNext),fresh=propagated(injected,freshDynamics.Phi,freshDynamics.B),freshCov=covariance(captured(fresh)),freshPosition=pNext.map((v,i)=>v+vNext[i]*h);
  const freshInputs={...replace,position:pNext,velocity:vNext,rotation:RNext,accelBias:baNext,gyroBias:bgNext,
    accel:plus(freshDynamics.force,baNext),gyro:bgNext,covariance:pc,crossCovariance:px,
    currentEpoch:[14],referenceUsed:[1],lastUsedEpoch:[13],measurementEnabled:[1],captureRequested:[1]};
  step.push({label:'used reference cannot correct again; fresh frame14 may become next reference',tolerance:2e-7,inputs:freshInputs,
    expected:{...stateFields(freshInputs),...flags(1,1,1),imageReuseRejected:[1],nextPosition:freshPosition,
      nextCovariance:freshCov.current,nextCrossCovariance:freshCov.cross,nextReferenceCovariance:freshCov.reference,
      nextReferencePosition:freshPosition,nextReferenceRotation:RNext,nextReferenceEpoch:[14],nextReferenceUsed:[0],nextLastUsedEpoch:[13]}});
  const epochs:Case[]=[
    {label:'pair0/1 may be evaluated once',inputs:{referenceAvailable:[1],referenceUsed:[0],referenceEpoch:[0],currentEpoch:[1],lastUsedEpoch:[-1]},expected:{valid:[1],eligible:[1],captureFresh:[1]}},
    {label:'corrected current1 cannot be recycled as a reference',inputs:{referenceAvailable:[1],referenceUsed:[1],referenceEpoch:[0],currentEpoch:[1],lastUsedEpoch:[1]},expected:{valid:[1],eligible:[0],captureFresh:[0]}},
    {label:'fresh frame2 can be captured but old reference cannot correct again',inputs:{referenceAvailable:[1],referenceUsed:[1],referenceEpoch:[0],currentEpoch:[2],lastUsedEpoch:[1]},expected:{valid:[1],eligible:[0],captureFresh:[1]}},
    {label:'fresh disjoint pair2/3 is eligible',inputs:{referenceAvailable:[1],referenceUsed:[0],referenceEpoch:[2],currentEpoch:[3],lastUsedEpoch:[1]},expected:{valid:[1],eligible:[1],captureFresh:[1]}},
    {label:'same epoch cannot be both frame and replacement',inputs:{referenceAvailable:[1],referenceUsed:[0],referenceEpoch:[2],currentEpoch:[2],lastUsedEpoch:[1]},expected:{valid:[1],eligible:[0],captureFresh:[0]}},
  ];
  for(const [label,field,value] of [['fractional current epoch','currentEpoch',1.5],['infinite current epoch','currentEpoch',Infinity],['NaN current epoch','currentEpoch',NaN],['unsafe integer epoch','currentEpoch',9007199254740992],['fractional reference epoch','referenceEpoch',.5],['invalid last-used sentinel','lastUsedEpoch',-2],['fractional used flag','referenceUsed',.5]] as const){const x=structuredClone(epochs[0].inputs);x[field]=[value];epochs.push({label,inputs:x,expected:{valid:[0],eligible:[0],captureFresh:[0]}});}
  return {SchmidtReferencePrediction:prediction,SchmidtReferenceCapture:capture,ES15SchmidtPrediction:predictionNominal,ES15SchmidtReferenceStep:step,SchmidtImagePairGate:epochs};
}

it('source-bound lifecycle fixtures cover no-reference/create/refreeze/zero-dt and preserve full dimensions',()=>{
  const groups=cases();for(const [model,rows] of Object.entries(groups))for(const c of rows){if(model==='SchmidtImagePairGate')continue;expect(flat(c.inputs.covariance)).toHaveLength(225);expect(flat(c.inputs.crossCovariance)).toHaveLength(90);expect(flat(c.inputs.referenceCovariance)).toHaveLength(36);}
  expect(groups.SchmidtReferenceCapture[0].expected.nextReferenceAvailable).toEqual([1]);
  expect(groups.ES15SchmidtPrediction.at(-1)!.expected.accepted).toEqual([0]);
  if(process.env.RUMOCA_SCHMIDT_REFERENCE_FIXTURES){const encode=(x:unknown):unknown=>Array.isArray(x)?x.map(encode):typeof x==='number'&&!Number.isFinite(x)?Number.isNaN(x)?'NaN':x>0?'Infinity':'-Infinity':x;
    const fixtures=Object.fromEntries(Object.entries(groups).map(([model,rows])=>[model,rows.map(c=>({label:c.label,inputs:Object.fromEntries(Object.entries(c.inputs).map(([k,v])=>[k,encode(flat(v))])),expected:Object.fromEntries(Object.entries(c.expected).map(([k,v])=>[k,{values:encode(flat(v)),tolerance:k==='accepted'||k==='rejected'||k==='nextReferenceAvailable'?0:c.tolerance??2e-9}]))}))]));
    writeFileSync(process.env.RUMOCA_SCHMIDT_REFERENCE_FIXTURES,JSON.stringify({schemaVersion:1,sourceSha256:sha(source),sourceComponents:names,augmentedDimension:21,groups:fixtures,nativeAdmitted:false,numericallyVerified:false,oracle:'independent shared latent factors; four-node process-noise factors; no values from Modelica outputs'},null,2)+'\n');}
});

for(const [model,env] of [['SchmidtReferencePrediction','RUMOCA_SCHMIDT_REFERENCE_PREDICTION_ARTIFACT'],['SchmidtReferenceCapture','RUMOCA_SCHMIDT_REFERENCE_CAPTURE_ARTIFACT'],['ES15SchmidtPrediction','RUMOCA_ES15_SCHMIDT_PREDICTION_ARTIFACT'],['ES15SchmidtReferenceStep','RUMOCA_ES15_SCHMIDT_STEP_ARTIFACT'],['SchmidtImagePairGate','RUMOCA_IMAGE_PAIR_GATE_ARTIFACT']] as const){const file=process.env[env];it.skipIf(!file)(`actual source-issued full21 ${model} matches independent factors and preserves rejected state`,async()=>{
  const artifact=JSON.parse(readFileSync(file!,'utf8')) as NativeProgramArtifact,p=await NativeProgram.instantiate(artifact,source);
  for(const c of cases()[model]){for(const [name,v] of Object.entries(c.inputs))p.input(name).set(flat(v));const bytes=new Uint8Array(p.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();p.evaluate(0);expect(new Uint8Array(p.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8)).toEqual(bytes);for(const [name,wanted]of Object.entries(c.expected))near(p.output(name),flat(wanted),`${c.label}/${name}`,c.tolerance??2e-9);}
  p.reset();await expect(NativeProgram.instantiate(artifact,source+'\n// edited')).rejects.toThrow('does not match its source');
},120_000);}
