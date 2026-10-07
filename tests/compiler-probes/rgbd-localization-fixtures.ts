// Test-only independent mathematics; no application worker imports this file.
import {readFileSync} from 'node:fs';
import {rawDescriptorFixture,rawDescriptorOracle} from './rgbd-descriptor-frame-fixtures';
import {matchingOracle,type MatchingFixture,type Point} from './rgbd-feature-matching-fixtures';
import {sandwich,defaultE,type Fixture as NoiseFixture} from './rgbd-registration-uncertainty-fixtures';
import {covariance,propagated,captured,stationary,type Factors} from './schmidt-reference-fixtures';
import {eye,mat,correction,type Fixture as CorrectionFixture} from './schmidt-relative-fixtures';

export const localizationSources=['FastNativeFrame','FeatureSelection','RGBDFeatureMatching','RigidPointRegistration',
  'RGBDRelativePose','RGBDRegistrationUncertainty','RGBDVisualObservation','RGBDVisualRelativeObservation',
  'RGBDLandmarkProjection','SPD6Solve','ES15PoseCorrection','SchmidtRelativePoseCorrection',
  'ES15NominalPrediction','ES15Dynamics','ES15CovariancePrediction','SchmidtReferenceState','RGBDInertialLocalizationStep',
  'RGBDFastInertialLocalizationStep'];
export const localizationSource=()=>localizationSources.map(name=>readFileSync(`models/${name}.mo`,'utf8')).join('\n');
export const initialFactors=():Factors=>({current:mat(15,15,(i,j)=>i===j?Math.sqrt(.1):0),reference:mat(6,15,()=>0)});
export const predictedFactors=(f:Factors,h=1/90)=>{const s=stationary(h,eye(3));return propagated(f,s.Phi,s.B);};
export function localizationImage(){
  const f=rawDescriptorFixture();let seed=0x12345678;
  const byte=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>24;};
  f.rgb=f.rgb.map(row=>row.map(()=>[byte(),byte(),byte(),255]));
  f.depth=f.depth.map(row=>row.map(()=>2));f.disparityNoise=.08;
  return f;
}
export function opticalNoise(f=localizationImage()){
  const d=rawDescriptorOracle(f);
  const match:MatchingFixture={referenceDescriptor:d.descriptor,currentDescriptor:d.descriptor,
    referencePoint:d.point as Point[],currentPoint:d.point as Point[],referenceEnabled:d.enabled,currentEnabled:d.enabled,
    referenceCount:350,currentCount:350,ratio:.8,maximumDescriptorDistance:.8,usePrediction:0,
    predictedRotation:eye(3) as Point[],predictedTranslation:[0,0,0],maximumGeometricDistance:.5};
  const matched=matchingOracle(match);
  const n:NoiseFixture={referencePoint:matched.sourcePoint,currentPoint:matched.targetPoint,pairEnabled:matched.pairEnabled,
    activeCount:350,registrationAccepted:1,currentFromReference:eye(3),translation:[0,0,0],referenceBodyRotation:eye(3),
    opticalToBody:defaultE,cameraOriginBody:[.18,0,-.04],referenceRgbFocal:f.rgbCalibration.slice(0,2),
    currentRgbFocal:f.rgbCalibration.slice(0,2),referenceNoiseFx:f.noiseReferenceFx,currentNoiseFx:f.noiseReferenceFx,baseline:f.baseline};
  return {descriptor:d,matched,noise:sandwich(n,.08)};
}
export function identityCorrection(f:Factors,C:number[][]){
  const input:CorrectionFixture={p:[.6,-.8,1.2],v:[0,0,0],q:[1,0,0,0],ba:[0,0,0],bg:[0,0,0],
    pr:[.6,-.8,1.2],qr:[1,0,0,0],b:[.5,-.5,.5,-.5],o:[.18,0,-.04],z:[1,0,0,0],t:[0,0,0],
    P:covariance(f).joint,C};
  const result=correction(input);return result;
}
export const snapshotFields={
  position:'nextPosition',velocity:'nextVelocity',rotation:'nextRotation',accelBias:'nextAccelBias',gyroBias:'nextGyroBias',
  covariance:'nextCovariance',crossCovariance:'nextCrossCovariance',referenceCovariance:'nextReferenceCovariance',
  referencePosition:'nextReferencePosition',referenceRotation:'nextReferenceRotation',referenceAvailable:'nextReferenceAvailable',
  referenceEpoch:'nextReferenceEpoch',referenceUsed:'nextReferenceUsed',lastUsedEpoch:'nextLastUsedEpoch',
  referenceDescriptor:'nextReferenceDescriptor',referencePoint:'nextReferencePoint',referenceEnabled:'nextReferenceEnabled',
  referencePixels:'nextReferencePixels',referenceCount:'nextReferenceCount',referenceRgbCalibration:'nextReferenceRgbCalibration',
  referenceDepthCalibration:'nextReferenceDepthCalibration',referenceNoiseReferenceFx:'nextReferenceNoiseReferenceFx',
  referenceDisparityNoise:'nextReferenceDisparityNoise',referenceBaseline:'nextReferenceBaseline',
  referenceOpticalToBody:'nextReferenceOpticalToBody',referenceCameraOriginBody:'nextReferenceCameraOriginBody',
} as const;
export function coldState(){
  const f=localizationImage(),c=covariance(initialFactors());
  return {position:[.6,-.8,1.2],velocity:[0,0,0],rotation:eye(3).flat(),accelBias:[0,0,0],gyroBias:[0,0,0],
    covariance:c.current.flat(),crossCovariance:c.cross.flat(),referenceCovariance:c.reference.flat(),
    referencePosition:[0,0,0],referenceRotation:eye(3).flat(),referenceAvailable:[0],referenceEpoch:[0],referenceUsed:[0],lastUsedEpoch:[-1],
    referenceDescriptor:Array(350*49).fill(0),referencePoint:Array(350*3).fill(0),referenceEnabled:Array(350).fill(0),
    referencePixels:Array(350*2).fill(0),referenceCount:[0],referenceRgbCalibration:f.rgbCalibration,
    referenceDepthCalibration:f.depthCalibration,referenceNoiseReferenceFx:[f.noiseReferenceFx],referenceDisparityNoise:[.08],
    referenceBaseline:[.05],referenceOpticalToBody:defaultE.flat(),referenceCameraOriginBody:[.18,0,-.04]};
}
export {covariance,captured};
