import {afterAll,beforeAll,expect,it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProgram,type NativeProgramArtifact} from '../../src/modelica-native-program';
import {localizationSource,snapshotFields} from './rgbd-localization-fixtures';
import {covariance} from './schmidt-reference-fixtures';
import {mat,mm,mv,rot,tr} from './schmidt-relative-fixtures';
import {movingOracle,movingSlots,movingColdState,movingMount,movingOrigin,movingAccel,movingH,movingHeldIntervals,
  movingInitialQ,physicalRotation} from './rgbd-moving-localization-fixtures';

const artifactPath=process.env.RUMOCA_LOCALIZATION_ARTIFACT;
const source=process.env.RUMOCA_LOCALIZATION_SOURCE?readFileSync(process.env.RUMOCA_LOCALIZATION_SOURCE,'utf8'):localizationSource();
const oracle=movingOracle();
const report={status:artifactPath?'RUNNING':'ARTIFACT_NOT_PROVIDED',actualNumericalCases:0,oracleChecks:0,
  sourceSha256:createHash('sha256').update(source).digest('hex'),moduleSha256:null as string|null,
  motion:{rotation:physicalRotation,slots:movingSlots,angularQuantizationError:oracle.angularQuantizationError,
    translationQuantizationError:oracle.translationQuantizationError,rms:oracle.fit.rms,nis:oracle.update.nis},
  fullRasterFeatureSelectionAccepted:false,fullSlamAccepted:false,runtimeIntegrated:false};
const save=()=>{if(process.env.RUMOCA_MOVING_LOCALIZATION_REPORT)writeFileSync(process.env.RUMOCA_MOVING_LOCALIZATION_REPORT,JSON.stringify(report,null,2)+'\n');};
let program:NativeProgram,artifact:NativeProgramArtifact;
beforeAll(async()=>{save();if(!artifactPath)return;
  artifact=JSON.parse(readFileSync(artifactPath,'utf8'));expect(artifact.model_name).toBe('RGBDInertialLocalizationStep');
  expect(artifact.var_layout.shapes.rgb).toEqual([90,160,4]);expect(artifact.var_layout.shapes.pixels).toEqual([350,2]);
  program=await NativeProgram.instantiate(artifact,source);report.moduleSha256=artifact.module_sha256;save();});
afterAll(()=>{if(artifactPath)report.status=report.actualNumericalCases===1?'ACTUAL_MOVING_CORE_PASS':'FAILED_OR_INCOMPLETE';save();});
function near(a:ArrayLike<number>,b:ArrayLike<number>,label:string,tolerance=3e-8){expect(a.length,label).toBe(b.length);
  for(let i=0;i<b.length;i++)if(!Number.isFinite(a[i])||Math.abs(a[i]-b[i])>tolerance)
    throw Error(`${label}[${i}] ${a[i]} != ${b[i]} (tolerance ${tolerance})`);}
const state=()=>Object.fromEntries(Object.entries(snapshotFields).map(([input,output])=>[input,Array.from(program.output(output))]));
function evaluate(s:Record<string,number[]>,image:typeof oracle.reference,epoch:number,capture:number,frame=1){
  const inputs={...s,rgb:image.rgb.flat(2),depth:image.depth.flat(),pixels:image.pixels.flat(),activeCount:[350],
    rgbCalibration:image.rgbCalibration,depthCalibration:image.depthCalibration,disparityNoise:[image.disparityNoise],
    noiseReferenceFx:[image.noiseReferenceFx],baseline:[image.baseline],opticalToBody:movingMount.flat(),cameraOriginBody:movingOrigin,
    accel:movingAccel,gyro:[0,0,0],gravity:[0,0,-9.81],h:[movingH],frameEnabled:[frame],imageCaptureRequested:[capture],
    currentEpoch:[epoch],featureScore:Array(350).fill(1)};
  for(const [name,values] of Object.entries(inputs)){expect(program.input(name).length,name).toBe(values.length);program.input(name).set(values);}
  const P=new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8).slice();program.evaluate(epoch/90);
  expect(new Uint8Array(program.memory.buffer,artifact.abi.p_offset,artifact.abi.p_count*8),'all P remains readonly').toEqual(P);return state();
}
function retainedReference(before:Record<string,number[]>,after:Record<string,number[]>){
  for(const name of Object.keys(snapshotFields).filter(n=>n.startsWith('reference')&&!['referenceUsed','referenceCovariance'].includes(n)))
    expect(after[name],name).toEqual(before[name]);}

it('independent moving raw-image fixture has unique sparse matches, noncoplanar geometry and a nonzero accepted six-axis innovation (oracle only)',()=>{
  expect(oracle.reference.rgb).toHaveLength(90);expect(oracle.reference.rgb[0]).toHaveLength(160);
  expect(oracle.reference.depth.flat().every(v=>v===Math.fround(v))).toBe(true);
  expect(oracle.referenceOracle.enabled.reduce((a,b)=>a+b,0)).toBe(24);expect(oracle.matched.count).toBe(24);
  movingSlots.forEach((slot,key)=>expect(oracle.matched.currentIndex[slot]).toBe(movingSlots[23-key]+1));
  expect(oracle.matched.pairEnabled[349]).toBe(1);expect(oracle.fit.rms).toBeLessThan(.012);
  // Quantizing to integer pixel centers moves bearings by <=0.5/focal.
  // Aggregate rotation/translation tolerances are independently qualified
  // fixture bounds, not claimed exact correspondence to continuous motion.
  expect(oracle.angularQuantizationError).toBeLessThan(.005);
  expect(oracle.translationQuantizationError).toBeLessThan(.012);
  expect(oracle.update.r.every(v=>Math.abs(v)>1e-4)).toBe(true);
  expect(oracle.update.nis).toBeGreaterThan(.01);expect(oracle.update.nis).toBeLessThan(22.46);
  expect(oracle.update.d.slice(0,3).every(v=>Math.abs(v)>1e-8),JSON.stringify(oracle.update.d)).toBe(true);
  expect(oracle.update.d.slice(6,9).every(v=>Math.abs(v)>1e-8),JSON.stringify(oracle.update.d)).toBe(true);
  expect(oracle.update.d.slice(9,12).every(v=>Math.abs(v)<=2),JSON.stringify(oracle.update.d)).toBe(true);
  expect(oracle.update.d.slice(12,15).every(v=>Math.abs(v)<=.3),JSON.stringify(oracle.update.d)).toBe(true);
  expect(oracle.noise.relativeCovariance.flat().every(Number.isFinite)).toBe(true);
  const points=oracle.matched.sourcePoint.filter((_,i)=>oracle.matched.pairEnabled[i]===1);
  const mean=[0,1,2].map(k=>points.reduce((s,p)=>s+p[k],0)/points.length);
  const spread=mat(3,3,(i,j)=>points.reduce((s,p)=>s+(p[i]-mean[i])*(p[j]-mean[j]),0));
  const determinant=spread[0][0]*(spread[1][1]*spread[2][2]-spread[1][2]*spread[2][1])
    -spread[0][1]*(spread[1][0]*spread[2][2]-spread[1][2]*spread[2][0])
    +spread[0][2]*(spread[1][0]*spread[2][1]-spread[1][1]*spread[2][0]);
  expect(determinant).toBeGreaterThan(1);
  const inverseConventionR=tr(oracle.fit.R),inverseConventionT=mv(inverseConventionR,oracle.fit.t).map(v=>-v);
  const wrongRms=Math.sqrt(points.reduce((s,p,index)=>{
    const slot=movingSlots[index],target=oracle.matched.targetPoint[slot],wrong=mv(inverseConventionR,p).map((v,k)=>v+inverseConventionT[k]);
    return s+wrong.reduce((e,v,k)=>e+(v-target[k])**2,0);},0)/points.length);
  expect(wrongRms).toBeGreaterThan(oracle.fit.rms*4);
  // This geometry would expose the standard-mount-only or zero-lever-arm bug.
  expect(Math.abs(movingMount[0][0])).toBeGreaterThan(.01);expect(movingOrigin.every(v=>v!==0)).toBe(true);
  report.oracleChecks++;save();
});

it.skipIf(!artifactPath)('actual source core registers moving calibrated RGBD, corrects correlated state, consumes pair and commits a fresh reference atomically',()=>{
  const first=evaluate(movingColdState(),oracle.reference,10,1),firstCov=covariance(oracle.first);
  expect(program.output('captureAccepted')[0]).toBe(1);expect(program.output('observationAccepted')[0]).toBe(0);
  near(program.output('nextReferenceDescriptor'),oracle.referenceOracle.descriptor.flat(),'reference descriptors17150');
  near(program.output('nextReferencePoint'),oracle.referenceOracle.point.flat(),'reference optical1050');
  near(program.output('nextCrossCovariance'),firstCov.cross.flat(),'capture cross90');
  near(program.output('nextReferenceCovariance'),firstCov.reference.flat(),'capture nuisance36');
  near(program.output('nextQuaternion'),movingInitialQ,'tilted initial quaternion');

  let held=first;
  for(let i=0;i<movingHeldIntervals;i++){
    held=evaluate(held,oracle.reference,10,0,0);
    expect(program.output('observationAccepted')[0]).toBe(0);expect(program.output('captureAccepted')[0]).toBe(0);
    retainedReference(first,held);
  }
  const next=evaluate(held,oracle.current,11,1);
  expect(program.output('visualValid')[0]).toBe(1);expect(program.output('matchCount')[0]).toBe(24);
  expect(program.output('observationAccepted')[0]).toBe(1);expect(program.output('captureAccepted')[0]).toBe(0);
  expect(program.output('captureRejected')[0]).toBe(1);expect(next.referenceUsed).toEqual([1]);expect(next.lastUsedEpoch).toEqual([11]);
  near(program.output('currentPoint'),oracle.currentOracle.point.flat(),'all calibrated current1050');
  near(program.output('currentFromReference'),oracle.fit.R.flat(),'independent fitted optical rotation',2e-8);
  near(program.output('currentFromReferenceTranslation'),oracle.fit.t,'independent fitted optical translation',2e-8);
  near(program.output('relativeCovariance'),oracle.noise.relativeCovariance.flat(),'sandwich36',3e-8);
  near(program.output('nextPosition'),oracle.nextPosition,'corrected position',3e-8);
  near(program.output('nextVelocity'),oracle.update.d.slice(3,6),'corrected velocity',3e-8);
  near(program.output('nextQuaternion'),oracle.update.nextQ,'corrected quaternion',3e-8);
  near(program.output('nextRotation'),oracle.nextR.flat(),'corrected body/world rotation',3e-8);
  near(program.output('nextAccelBias'),oracle.update.d.slice(9,12),'corrected accel bias',3e-8);
  near(program.output('nextGyroBias'),oracle.update.d.slice(12,15),'corrected gyro bias',3e-8);
  near(program.output('nextCovariance'),oracle.update.posterior.slice(0,15).flatMap(r=>r.slice(0,15)),'Joseph/reset225',4e-8);
  near(program.output('nextCrossCovariance'),oracle.update.posterior.slice(0,15).flatMap(r=>r.slice(15)),'Joseph/reset cross90',4e-8);
  near(program.output('nextReferenceCovariance'),oracle.update.posterior.slice(15).flatMap(r=>r.slice(15)),'frozen reference36',4e-8);
  near(program.output('positionCovariance'),oracle.update.posterior.slice(0,3).flatMap(r=>r.slice(0,3)),'viewer position9');
  near(program.output('attitudeCovariance'),oracle.update.posterior.slice(6,9).flatMap(r=>r.slice(6,9)),'viewer attitude9');
  retainedReference(first,next);
  expect(Array.from(program.output('trackingEnabled'))).toEqual(oracle.matched.pairEnabled);
  movingSlots.forEach(slot=>{const partner=oracle.matched.currentIndex[slot]-1;
    near(program.output('trackingReferencePixel').slice(slot*2,slot*2+2),oracle.reference.pixels[slot],`tracking reference${slot}`,0);
    near(program.output('trackingCurrentPixel').slice(slot*2,slot*2+2),oracle.current.pixels[partner],`tracking current${slot}`,0);});
  expect(Array.from(program.output('mapCandidateEnabled'))).toEqual(oracle.currentOracle.enabled);
  movingSlots.forEach(slot=>near(program.output('mapCandidatePoint').slice(slot*3,slot*3+3),oracle.worldPoints[slot],`body/world point${slot}`,8e-8));
  expect(program.output('confidence')[0]).toBe(1);
  // Already-consumed pair may not be corrected again; a newer image can only
  // refreeze its pixels, descriptors, calibration and pose/covariance together.
  const replacement=evaluate(next,oracle.current,12,1);
  expect(program.output('imageReuseRejected')[0]).toBe(1);expect(program.output('observationAccepted')[0]).toBe(0);
  expect(program.output('captureAccepted')[0]).toBe(1);expect(replacement.referenceEpoch).toEqual([12]);expect(replacement.referenceUsed).toEqual([0]);
  near(replacement.referenceDescriptor,oracle.currentOracle.descriptor.flat(),'replacement descriptor');
  near(replacement.referencePoint,oracle.currentOracle.point.flat(),'replacement optical point');
  expect(replacement.referencePixels).toEqual(oracle.current.pixels.flat());expect(replacement.referenceOpticalToBody).toEqual(movingMount.flat());
  expect(replacement.referenceCameraOriginBody).toEqual(movingOrigin);
  const poseIndices=[0,1,2,6,7,8];
  const C=Array.from({length:15},(_,i)=>replacement.covariance.slice(i*15,i*15+15));
  near(replacement.referenceCovariance,poseIndices.flatMap(i=>poseIndices.map(j=>C[i][j])),'atomic captured pose36');
  near(replacement.crossCovariance,C.flatMap(row=>poseIndices.map(j=>row[j])),'atomic captured cross90');
  near(replacement.referencePosition,replacement.position,'atomic captured position');near(replacement.referenceRotation,replacement.rotation,'atomic captured rotation');
  const orthogonal=mm(tr(rot(oracle.update.nextQ)),rot(oracle.update.nextQ));
  near(orthogonal.flat(),[1,0,0,0,1,0,0,0,1],'quaternion proper rotation',1e-12);
  program.reset();const replay=evaluate(movingColdState(),oracle.reference,10,1);expect(replay).toEqual(first);
  report.actualNumericalCases++;save();
},120000);
