// Same28 full-domain controls as the actual-model gate, exercising its production function.
// Separate function acceptance never implies model-wrapper/Rumoca/browser admission.
function RGBDInitializationFunctionChecks
  input Integer scenario;
  output Boolean checks[20];
protected
  constant Integer imageHeight=90; constant Integer imageWidth=160;
  constant Integer featureCapacity=350; constant Integer descriptorSize=49;
  // The same independent full-size fixture values, constructed by their existing
  // functions to avoid the reference C generator's nested-comprehension defect.
  Real rgb0[90,160,4] = RGBDLocalizationInitializeTests.RGB(0);
  Real rgb1[90,160,4] = RGBDLocalizationInitializeTests.RGB(13);
  Real depth0[90,160] = RGBDLocalizationInitializeTests.Depth(0.0);
  Real depth1[90,160] = RGBDLocalizationInitializeTests.Depth(0.4);
  Real pixels[350,2] = RGBDLocalizationInitializeTests.Pixels();
  Real P[15,15] = RGBDLocalizationInitializeTests.Covariance();
  Real cross[15,6] = RGBDLocalizationInitializeTests.PriorCross(P);
  Real reference[6,6] = RGBDLocalizationInitializeTests.PriorReference(P);
  Real oldDescriptor[350,49] = RGBDLocalizationInitializeTests.OldDescriptors();
  Real oldPoint[350,3] = RGBDLocalizationInitializeTests.OldPoints();
  Real oldEnabled[350] = RGBDLocalizationInitializeTests.OldEnabled();
  Real covarianceInput[15,15]; Real crossInput[15,6]; Real referenceInput[6,6];
  Real rotationInput[3,3]; Real referenceRotationInput[3,3]; Real cameraInput[3,3];
  Real velocityInput[3]; Real accelBiasInput[3]; Real gyroBiasInput[3]; Real densityInput[12];
  Real rgbCalibrationInput[4]; Real countInput; Real availableInput; Real epochInput;
  Real oldEpochInput; Real usedInput; Real lastUsedInput; Real requestInput;
  Boolean expectedInitialization; Boolean expectedCapture; Boolean held;
  Boolean frontOracle; Boolean cloneOracle; Boolean snapshotOracle; Boolean geometryOracle;
  Real expectedPoint[350,3]; Real expectedDescriptor[350,49]; Real expectedEnabled[350];
  Real expectedMap[350,3]; Real proposedJoint[21,21]; Real quaternionRotation[3,3];
  Real initialized_nextPosition[3];
  Real initialized_nextVelocity[3];
  Real initialized_nextRotation[3,3];
  Real initialized_nextAccelBias[3];
  Real initialized_nextGyroBias[3];
  Real initialized_nextCovariance[15,15];
  Real initialized_nextCrossCovariance[15,6];
  Real initialized_nextReferenceCovariance[6,6];
  Real initialized_nextReferencePosition[3];
  Real initialized_nextReferenceRotation[3,3];
  Real initialized_nextReferenceAvailable;
  Real initialized_nextReferenceEpoch;
  Real initialized_nextReferenceUsed;
  Real initialized_nextLastUsedEpoch;
  Real initialized_nextReferenceDescriptor[featureCapacity,descriptorSize];
  Real initialized_nextReferencePoint[featureCapacity,3];
  Real initialized_nextReferenceEnabled[featureCapacity];
  Real initialized_nextReferencePixels[featureCapacity,2];
  Real initialized_nextReferenceCount;
  Real initialized_nextReferenceRgbCalibration[4];
  Real initialized_nextReferenceDepthCalibration[4];
  Real initialized_nextReferenceNoiseReferenceFx;
  Real initialized_nextReferenceDisparityNoise;
  Real initialized_nextReferenceBaseline;
  Real initialized_nextReferenceOpticalToBody[3,3];
  Real initialized_nextReferenceCameraOriginBody[3];
  Real initialized_predictionAccepted;
  Real initialized_observationAccepted;
  Real initialized_observationRejected;
  Real initialized_captureAccepted;
  Real initialized_captureRejected;
  Real initialized_imageReuseRejected;
  Real initialized_imagePairEligible;
  Real initialized_frameValid;
  Real initialized_referenceGeometryCompatible;
  Real initialized_visualValid;
  Real initialized_matchCount;
  Real initialized_uncertaintyRejectionReason;
  Real initialized_currentDescriptor[featureCapacity,descriptorSize];
  Real initialized_currentPoint[featureCapacity,3];
  Real initialized_currentEnabled[featureCapacity];
  Real initialized_currentCount;
  Real initialized_currentFromReference[3,3];
  Real initialized_currentFromReferenceTranslation[3];
  Real initialized_relativeCovariance[6,6];
  Real initialized_mapCandidatePoint[featureCapacity,3];
  Real initialized_mapCandidateEnabled[featureCapacity];
  Real initialized_mapCandidateCount;
  Real initialized_nextQuaternion[4];
  Real initialized_positionCovariance[3,3];
  Real initialized_attitudeCovariance[3,3];
  Real initialized_confidence;
  Real initialized_features[featureCapacity,3];
  Real initialized_featureEnabled[featureCapacity];
  Real initialized_trackingCurrentPixel[featureCapacity,2];
  Real initialized_trackingReferencePixel[featureCapacity,2];
  Real initialized_trackingEnabled[featureCapacity];
  Real initialized_initializationAccepted;
  Real initialized_initializationRejected;
algorithm
  for row in 1:15 loop
    for column in 1:15 loop
      covarianceInput[row,column] := if noEvent(scenario == 4 and row == 15 and column == 15) then -1 else P[row,column];
    end for;
    for column in 1:6 loop
      crossInput[row,column] := if noEvent(scenario == 2) then 0
        else if noEvent(scenario == 5 and row == 15 and column == 6) then 1000 else cross[row,column];
    end for;
  end for;
  for row in 1:6 loop
    for column in 1:6 loop
      referenceInput[row,column] := if noEvent(scenario == 2 or scenario == 28) then 0
        else if noEvent(scenario == 6 and row == 6 and column == 6) then -1 else reference[row,column];
    end for;
  end for;
  rotationInput := if noEvent(scenario == 7) then diagonal({-1,1,1}) else RGBDLocalizationInitializeTests.rotation;
  referenceRotationInput := if noEvent(scenario == 8) then diagonal({-1,1,1}) else identity(3);
  cameraInput := if noEvent(scenario == 19) then diagonal({-1,1,1}) else RGBDLocalizationInitializeTests.opticalToBody;
  velocityInput := if noEvent(scenario == 9) then {1e7,0,0} else RGBDLocalizationInitializeTests.velocity;
  accelBiasInput := if noEvent(scenario == 10) then {3,0,0} else RGBDLocalizationInitializeTests.accelBias;
  gyroBiasInput := if noEvent(scenario == 11) then {1,0,0} else RGBDLocalizationInitializeTests.gyroBias;
  for channel in 1:12 loop densityInput[channel] := if noEvent(scenario == 12) then -1 else 0.01; end for;
  rgbCalibrationInput := if noEvent(scenario == 21) then {0,105.2,79.5,44.5} else RGBDLocalizationInitializeTests.rgbCalibration;
  countInput := if noEvent(scenario == 17) then 350.5 else if noEvent(scenario == 18) then 351
    else if noEvent(scenario == 27) then 2 else 350;
  availableInput := if noEvent(scenario == 2 or scenario == 28) then 0 else 1;
  epochInput := if noEvent(scenario == 2) then 0 else if noEvent(scenario == 14) then 2.5
    else if noEvent(scenario == 16) then 1 else 2;
  oldEpochInput := if noEvent(scenario == 2) then 0 else if noEvent(scenario == 15) then 2 else 1;
  usedInput := if noEvent(scenario == 16) then 1 else 0;
  lastUsedInput := if noEvent(scenario == 2) then -1 else if noEvent(scenario == 16) then 1 else 0;
  requestInput := if noEvent(scenario == 25) then 0 else if noEvent(scenario == 26) then 0.5 else 1;
  expectedInitialization := not ((scenario >= 3 and scenario <= 14) or scenario == 25 or scenario == 26 or scenario == 28);
  expectedCapture := scenario == 1 or scenario == 2 or scenario == 24;
  (initialized_nextPosition,initialized_nextVelocity,initialized_nextRotation,
    initialized_nextAccelBias,initialized_nextGyroBias,initialized_nextCovariance,
    initialized_nextCrossCovariance,initialized_nextReferenceCovariance,initialized_nextReferencePosition,
    initialized_nextReferenceRotation,initialized_nextReferenceAvailable,initialized_nextReferenceEpoch,
    initialized_nextReferenceUsed,initialized_nextLastUsedEpoch,initialized_nextReferenceDescriptor,
    initialized_nextReferencePoint,initialized_nextReferenceEnabled,initialized_nextReferencePixels,
    initialized_nextReferenceCount,initialized_nextReferenceRgbCalibration,initialized_nextReferenceDepthCalibration,
    initialized_nextReferenceNoiseReferenceFx,initialized_nextReferenceDisparityNoise,initialized_nextReferenceBaseline,
    initialized_nextReferenceOpticalToBody,initialized_nextReferenceCameraOriginBody,initialized_predictionAccepted,
    initialized_observationAccepted,initialized_observationRejected,initialized_captureAccepted,
    initialized_captureRejected,initialized_imageReuseRejected,initialized_imagePairEligible,
    initialized_frameValid,initialized_referenceGeometryCompatible,initialized_visualValid,
    initialized_matchCount,initialized_uncertaintyRejectionReason,initialized_currentDescriptor,
    initialized_currentPoint,initialized_currentEnabled,initialized_currentCount,
    initialized_currentFromReference,initialized_currentFromReferenceTranslation,initialized_relativeCovariance,
    initialized_mapCandidatePoint,initialized_mapCandidateEnabled,initialized_mapCandidateCount,
    initialized_nextQuaternion,initialized_positionCovariance,initialized_attitudeCovariance,
    initialized_confidence,initialized_features,initialized_featureEnabled,
    initialized_trackingCurrentPixel,initialized_trackingReferencePixel,initialized_trackingEnabled,
    initialized_initializationAccepted,initialized_initializationRejected) := InitializeRGBDLocalization(
rgb=if noEvent(scenario == 24) then rgb1 else rgb0,
    depth=if noEvent(scenario == 24) then depth1 else depth0,pixels=pixels,activeCount=countInput,
    rgbCalibration=rgbCalibrationInput,depthCalibration=RGBDLocalizationInitializeTests.depthCalibration,
    opticalToBody=cameraInput,cameraOriginBody=RGBDLocalizationInitializeTests.origin,
    disparityNoise=0.08,noiseReferenceFx=500,baseline=if noEvent(scenario == 20) then 0 else 0.05,
    position=RGBDLocalizationInitializeTests.position,velocity=velocityInput,
    rotation=rotationInput,accelBias=accelBiasInput,gyroBias=gyroBiasInput,
    covariance=covarianceInput,crossCovariance=crossInput,referenceCovariance=referenceInput,
    referencePosition={-0.2,0.3,0.5},referenceRotation=referenceRotationInput,
    referenceAvailable=availableInput,referenceEpoch=oldEpochInput,referenceUsed=usedInput,lastUsedEpoch=lastUsedInput,
    referenceDescriptor=oldDescriptor,referencePoint=oldPoint,referenceEnabled=oldEnabled,
    referencePixels=pixels,referenceCount=350,referenceRgbCalibration={115,106,79,44},
    referenceDepthCalibration={83,75,79,44},referenceNoiseReferenceFx=490,
    referenceDisparityNoise=0.07,referenceBaseline=0.06,
    referenceOpticalToBody=identity(3),referenceCameraOriginBody={0.1,0,0},
    currentEpoch=epochInput,frameEnabled=if noEvent(scenario == 13) then 0.5 else if noEvent(scenario == 23) then 0 else 1,
    imageCaptureRequested=if noEvent(scenario == 22) then 0 else 1,
    imageTime=if noEvent(scenario == 3) then 0.1 else 0,initializationRequested=requestInput,
    
    h=0.75,accel={1e5,-2e5,3e5},gyro={9e4,-8e4,7e4},density=densityInput,gravity={0.0,0.0,-9.81},featureScore=zeros(350));
  held := RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceDescriptor,oldDescriptor,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePoint,oldPoint,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceEnabled,oldEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePixels,pixels,1e-12)
    and SLAMExactRealEqual(initialized_nextReferenceCount,350)
    and SLAMExactRealEqual(initialized_nextReferenceAvailable,availableInput)
    and SLAMExactRealEqual(initialized_nextReferenceEpoch,oldEpochInput)
    and SLAMExactRealEqual(initialized_nextReferenceUsed,usedInput)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextCrossCovariance,crossInput,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceCovariance,referenceInput,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferencePosition,{-0.2,0.3,0.5},1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceRotation,referenceRotationInput,1e-12);
  proposedJoint := cat(1,cat(2,initialized_nextCovariance,initialized_nextCrossCovariance),
    cat(2,transpose(initialized_nextCrossCovariance),initialized_nextReferenceCovariance));
  quaternionRotation := {{1-2*(initialized_nextQuaternion[3]^2+initialized_nextQuaternion[4]^2),
    2*(initialized_nextQuaternion[2]*initialized_nextQuaternion[3]-initialized_nextQuaternion[1]*initialized_nextQuaternion[4]),
    2*(initialized_nextQuaternion[2]*initialized_nextQuaternion[4]+initialized_nextQuaternion[1]*initialized_nextQuaternion[3])},
    {2*(initialized_nextQuaternion[2]*initialized_nextQuaternion[3]+initialized_nextQuaternion[1]*initialized_nextQuaternion[4]),
    1-2*(initialized_nextQuaternion[2]^2+initialized_nextQuaternion[4]^2),
    2*(initialized_nextQuaternion[3]*initialized_nextQuaternion[4]-initialized_nextQuaternion[1]*initialized_nextQuaternion[2])},
    {2*(initialized_nextQuaternion[2]*initialized_nextQuaternion[4]-initialized_nextQuaternion[1]*initialized_nextQuaternion[3]),
    2*(initialized_nextQuaternion[3]*initialized_nextQuaternion[4]+initialized_nextQuaternion[1]*initialized_nextQuaternion[2]),
    1-2*(initialized_nextQuaternion[2]^2+initialized_nextQuaternion[3]^2)}};
  cloneOracle := true; snapshotOracle := true; frontOracle := true; geometryOracle := true;
  expectedPoint := zeros(350,3); expectedDescriptor := zeros(350,49); expectedEnabled := zeros(350);
  expectedMap := zeros(350,3);
  for row in 1:15 loop
    for column in 1:6 loop
      cloneOracle := cloneOracle and abs(initialized_nextCrossCovariance[row,column]
        -covarianceInput[row,RGBDLocalizationInitializeTests.selection[column]]) < 1e-12;
    end for;
  end for;
  for row in 1:6 loop
    for column in 1:6 loop
      cloneOracle := cloneOracle and abs(initialized_nextReferenceCovariance[row,column]
        -covarianceInput[RGBDLocalizationInitializeTests.selection[row],RGBDLocalizationInitializeTests.selection[column]]) < 1e-12;
    end for;
  end for;
  cloneOracle := cloneOracle and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferencePosition,RGBDLocalizationInitializeTests.position,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceRotation,rotationInput,1e-12) and initialized_nextReferenceAvailable > 0.5
    and SLAMExactRealEqual(initialized_nextReferenceEpoch,epochInput) and initialized_nextReferenceUsed < 0.5;
  for feature in 1:350 loop
    if feature == 1 or feature == 37 or feature == 350 then
      expectedEnabled[feature] := 1;
      expectedPoint[feature,:] := RGBDLocalizationInitializeTests.ExpectedPoint(feature,if scenario == 24 then 0.4 else 0);
      expectedDescriptor[feature,:] := RGBDLocalizationInitializeTests.ExpectedDescriptor(feature,if scenario == 24 then 13 else 0);
      expectedMap[feature,:] := rotationInput*(RGBDLocalizationInitializeTests.opticalToBody*expectedPoint[feature,:]
        +RGBDLocalizationInitializeTests.origin)+RGBDLocalizationInitializeTests.position;
    end if;
  end for;
  frontOracle := RGBDLocalizationInitializeTests.CloseVector(initialized_currentEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_currentPoint,expectedPoint,1e-10)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_currentDescriptor,expectedDescriptor,1e-10);
  snapshotOracle := RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceDescriptor,expectedDescriptor,1e-10)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePoint,expectedPoint,1e-10)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePixels,pixels,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceRgbCalibration,RGBDLocalizationInitializeTests.rgbCalibration,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceDepthCalibration,RGBDLocalizationInitializeTests.depthCalibration,1e-12)
    and SLAMExactRealEqual(initialized_nextReferenceNoiseReferenceFx,500)
    and SLAMExactRealEqual(initialized_nextReferenceDisparityNoise,0.08) and SLAMExactRealEqual(initialized_nextReferenceBaseline,0.05)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceOpticalToBody,RGBDLocalizationInitializeTests.opticalToBody,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceCameraOriginBody,RGBDLocalizationInitializeTests.origin,1e-12);
  geometryOracle := RGBDLocalizationInitializeTests.CloseVector(initialized_mapCandidateEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_mapCandidatePoint,expectedMap,1e-10) and SLAMExactRealEqual(initialized_mapCandidateCount,3);
  checks[1] := SLAMExactRealEqual(initialized_initializationAccepted,if expectedInitialization then 1 else 0);
  checks[2] := SLAMExactRealEqual(initialized_initializationRejected,if expectedInitialization or scenario == 25 then 0 else 1);
  checks[3] := SLAMExactRealEqual(initialized_captureAccepted,if expectedCapture then 1 else 0);
  checks[4] := SLAMExactRealEqual(initialized_captureRejected,if expectedCapture or scenario == 13 or scenario == 22 or scenario == 23 then 0 else 1);
  checks[5] := RGBDLocalizationInitializeTests.CloseVector(initialized_nextPosition,RGBDLocalizationInitializeTests.position,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextVelocity,velocityInput,1e-12) and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextRotation,rotationInput,1e-12);
  checks[6] := RGBDLocalizationInitializeTests.CloseVector(initialized_nextAccelBias,accelBiasInput,1e-12) and RGBDLocalizationInitializeTests.CloseVector(initialized_nextGyroBias,gyroBiasInput,1e-12);
  checks[7] := RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextCovariance,covarianceInput,1e-12);
  checks[8] := initialized_predictionAccepted < 0.5 and initialized_observationAccepted < 0.5
    and initialized_observationRejected < 0.5 and initialized_visualValid < 0.5 and initialized_confidence < 0.5;
  checks[9] := SLAMExactRealEqual(initialized_nextLastUsedEpoch,lastUsedInput)
    and initialized_imagePairEligible < 0.5 and initialized_imageReuseRejected < 0.5;
  checks[10] := if expectedCapture then cloneOracle else held;
  checks[11] := if expectedCapture then snapshotOracle else
    RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceRgbCalibration,{115,106,79,44},1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceDepthCalibration,{83,75,79,44},1e-12)
    and SLAMExactRealEqual(initialized_nextReferenceNoiseReferenceFx,490)
    and SLAMExactRealEqual(initialized_nextReferenceDisparityNoise,0.07)
    and SLAMExactRealEqual(initialized_nextReferenceBaseline,0.06)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceOpticalToBody,identity(3),1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceCameraOriginBody,{0.1,0,0},1e-12);
  checks[12] := if expectedCapture then frontOracle else true;
  checks[13] := if expectedCapture then geometryOracle else RGBDLocalizationInitializeTests.ZeroVector(initialized_mapCandidateEnabled,0.5);
  checks[14] := if expectedCapture then SLAMCovariancePSDCheck(proposedJoint,1e-12) > 0.5 else true;
  checks[15] := RGBDLocalizationInitializeTests.ZeroMatrix(initialized_relativeCovariance,1e-12) and RGBDLocalizationInitializeTests.CloseMatrix(initialized_currentFromReference,identity(3),1e-12)
    and RGBDLocalizationInitializeTests.ZeroVector(initialized_currentFromReferenceTranslation,1e-12);
  checks[16] := RGBDLocalizationInitializeTests.ZeroVector(initialized_trackingEnabled,0.5) and RGBDLocalizationInitializeTests.ZeroMatrix(initialized_trackingCurrentPixel,1e-12)
    and RGBDLocalizationInitializeTests.ZeroMatrix(initialized_trackingReferencePixel,1e-12) and initialized_matchCount < 0.5;
  checks[17] := if scenario == 7 then true else RGBDLocalizationInitializeTests.CloseMatrix(quaternionRotation,rotationInput,1e-10);
  checks[18] := RGBDLocalizationInitializeTests.CloseMatrix(initialized_positionCovariance,covarianceInput[1:3,1:3],1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_attitudeCovariance,covarianceInput[7:9,7:9],1e-12);
  // Fractional frame flags do not enable an acquisition, just like flag zero.
  checks[19] := SLAMExactRealEqual(initialized_currentCount,if scenario == 13 or scenario == 23 then 0 else countInput);
  checks[20] := if expectedCapture then initialized_currentEnabled[350] > 0.5
    and SLAMExactRealEqual(initialized_nextReferenceCount,350) else true;end RGBDInitializationFunctionChecks;

model RGBDInitializationFunctionAcceptance
  output Integer scenario;
  output Boolean checks[20];
equation
  scenario = min(28,1+integer(time));
  checks = RGBDInitializationFunctionChecks(scenario);
end RGBDInitializationFunctionAcceptance;
