// One actual full raw-image initializer, with28 independent input controls.
// Each reference execution uses one compile-time constant case and the full
// actual initializer. No time-varying raw-image input branch is introduced.
model RGBDLocalizationInitializeAcceptance
  parameter Integer scenario = 1 annotation(Evaluate=true);
  output Boolean checks[20];
protected
  // Explicit constant fixture expressions avoid asking the reference compiler
  // to project thousands of scalar parameters from a whole-array function
  // result while function evaluation is deliberately disabled. These are the
  // same full raw images and prior values as the independent fixture helpers.
  parameter Real rgb0[90,160,4] = {{{if channel == 4 then 255.0 else
    mod(17*(x-1)+3*(y-1)+11*channel,256) for channel in 1:4} for x in 1:160} for y in 1:90};
  parameter Real rgb1[90,160,4] = {{{if channel == 4 then 255.0 else
    mod(17*(x-1)+3*(y-1)+11*channel+13,256) for channel in 1:4} for x in 1:160} for y in 1:90};
  parameter Real depth0[90,160] = {{2.5+0.004*(x-1)+0.008*(y-1) for x in 1:160} for y in 1:90};
  parameter Real depth1[90,160] = {{2.9+0.004*(x-1)+0.008*(y-1) for x in 1:160} for y in 1:90};
  parameter Real pixels[350,2] = {{if feature == 1 then (if axis == 1 then 50 else 30)
    else if feature == 37 then (if axis == 1 then 83 else 44)
    else if feature == 350 then (if axis == 1 then 110 else 64) else -1e101
    for axis in 1:2} for feature in 1:350};
  parameter Real P[15,15] = {{(if row == column then 0.01*row else 0)+0.00003*row*column
    for column in 1:15} for row in 1:15};
  parameter Real cross[15,6] = {{0.3*P[row,RGBDLocalizationInitializeTests.selection[column]]
    for column in 1:6} for row in 1:15};
  parameter Real reference[6,6] = {{0.09*P[RGBDLocalizationInitializeTests.selection[row],
    RGBDLocalizationInitializeTests.selection[column]]+(if row == column then 0.02 else 0)
    for column in 1:6} for row in 1:6};
  parameter Real oldDescriptor[350,49] = {{if feature == 1 or feature == 37 or feature == 350
    then (if channel == 1 then 1/sqrt(2.0) else if channel == 49 then -1/sqrt(2.0) else 0.0)
    else 0.0 for channel in 1:49} for feature in 1:350};
  parameter Real oldPoint[350,3] = {{if feature == 1 or feature == 37 or feature == 350
    then (if axis == 1 then 0.001*feature else if axis == 2 then 0.2 else 2.0)
    else 0.0 for axis in 1:3} for feature in 1:350};
  parameter Real oldEnabled[350] = {if feature == 1 or feature == 37 or feature == 350 then 1.0 else 0.0
    for feature in 1:350};
  Real covarianceInput[15,15]; Real crossInput[15,6]; Real referenceInput[6,6];
  Real rotationInput[3,3]; Real referenceRotationInput[3,3]; Real cameraInput[3,3];
  Real velocityInput[3]; Real accelBiasInput[3]; Real gyroBiasInput[3]; Real densityInput[12];
  Real rgbCalibrationInput[4]; Real countInput; Real availableInput; Real epochInput;
  Real oldEpochInput; Real usedInput; Real lastUsedInput; Real requestInput;
  Boolean expectedInitialization; Boolean expectedCapture; Boolean held;
  Boolean frontOracle; Boolean cloneOracle; Boolean snapshotOracle; Boolean geometryOracle;
  Real expectedPoint[350,3]; Real expectedDescriptor[350,49]; Real expectedEnabled[350];
  Real expectedMap[350,3]; Real proposedJoint[21,21]; Real quaternionRotation[3,3];
  RGBDInertialLocalizationInitialize initializer(
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
    // These would invalidate/alter any actual IMU predictor: initializer ignores them.
    h=0.75,accel={1e5,-2e5,3e5},gyro={9e4,-8e4,7e4},density=densityInput);
equation
  for row in 1:15 loop
    for column in 1:15 loop
      covarianceInput[row,column] = if noEvent(scenario == 4 and row == 15 and column == 15) then -1 else P[row,column];
    end for;
    for column in 1:6 loop
      crossInput[row,column] = if noEvent(scenario == 2) then 0
        else if noEvent(scenario == 5 and row == 15 and column == 6) then 1000 else cross[row,column];
    end for;
  end for;
  for row in 1:6 loop
    for column in 1:6 loop
      referenceInput[row,column] = if noEvent(scenario == 2 or scenario == 28) then 0
        else if noEvent(scenario == 6 and row == 6 and column == 6) then -1 else reference[row,column];
    end for;
  end for;
  rotationInput = if noEvent(scenario == 7) then diagonal({-1,1,1}) else RGBDLocalizationInitializeTests.rotation;
  referenceRotationInput = if noEvent(scenario == 8) then diagonal({-1,1,1}) else identity(3);
  cameraInput = if noEvent(scenario == 19) then diagonal({-1,1,1}) else RGBDLocalizationInitializeTests.opticalToBody;
  velocityInput = if noEvent(scenario == 9) then {1e7,0,0} else RGBDLocalizationInitializeTests.velocity;
  accelBiasInput = if noEvent(scenario == 10) then {3,0,0} else RGBDLocalizationInitializeTests.accelBias;
  gyroBiasInput = if noEvent(scenario == 11) then {1,0,0} else RGBDLocalizationInitializeTests.gyroBias;
  for channel in 1:12 loop densityInput[channel] = if noEvent(scenario == 12) then -1 else 0.01; end for;
  rgbCalibrationInput = if noEvent(scenario == 21) then {0,105.2,79.5,44.5} else RGBDLocalizationInitializeTests.rgbCalibration;
  countInput = if noEvent(scenario == 17) then 350.5 else if noEvent(scenario == 18) then 351
    else if noEvent(scenario == 27) then 2 else 350;
  availableInput = if noEvent(scenario == 2 or scenario == 28) then 0 else 1;
  epochInput = if noEvent(scenario == 2) then 0 else if noEvent(scenario == 14) then 2.5
    else if noEvent(scenario == 16) then 1 else 2;
  oldEpochInput = if noEvent(scenario == 2) then 0 else if noEvent(scenario == 15) then 2 else 1;
  usedInput = if noEvent(scenario == 16) then 1 else 0;
  lastUsedInput = if noEvent(scenario == 2) then -1 else if noEvent(scenario == 16) then 1 else 0;
  requestInput = if noEvent(scenario == 25) then 0 else if noEvent(scenario == 26) then 0.5 else 1;
  expectedInitialization = not ((scenario >= 3 and scenario <= 14) or scenario == 25 or scenario == 26 or scenario == 28);
  expectedCapture = scenario == 1 or scenario == 2 or scenario == 24;
  held = RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceDescriptor,oldDescriptor,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferencePoint,oldPoint,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceEnabled,oldEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferencePixels,pixels,1e-12)
    and SLAMExactRealEqual(initializer.nextReferenceCount,350)
    and SLAMExactRealEqual(initializer.nextReferenceAvailable,availableInput)
    and SLAMExactRealEqual(initializer.nextReferenceEpoch,oldEpochInput)
    and SLAMExactRealEqual(initializer.nextReferenceUsed,usedInput)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextCrossCovariance,crossInput,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceCovariance,referenceInput,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferencePosition,{-0.2,0.3,0.5},1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceRotation,referenceRotationInput,1e-12);
  proposedJoint = cat(1,cat(2,initializer.nextCovariance,initializer.nextCrossCovariance),
    cat(2,transpose(initializer.nextCrossCovariance),initializer.nextReferenceCovariance));
  quaternionRotation = {{1-2*(initializer.nextQuaternion[3]^2+initializer.nextQuaternion[4]^2),
    2*(initializer.nextQuaternion[2]*initializer.nextQuaternion[3]-initializer.nextQuaternion[1]*initializer.nextQuaternion[4]),
    2*(initializer.nextQuaternion[2]*initializer.nextQuaternion[4]+initializer.nextQuaternion[1]*initializer.nextQuaternion[3])},
    {2*(initializer.nextQuaternion[2]*initializer.nextQuaternion[3]+initializer.nextQuaternion[1]*initializer.nextQuaternion[4]),
    1-2*(initializer.nextQuaternion[2]^2+initializer.nextQuaternion[4]^2),
    2*(initializer.nextQuaternion[3]*initializer.nextQuaternion[4]-initializer.nextQuaternion[1]*initializer.nextQuaternion[2])},
    {2*(initializer.nextQuaternion[2]*initializer.nextQuaternion[4]-initializer.nextQuaternion[1]*initializer.nextQuaternion[3]),
    2*(initializer.nextQuaternion[3]*initializer.nextQuaternion[4]+initializer.nextQuaternion[1]*initializer.nextQuaternion[2]),
    1-2*(initializer.nextQuaternion[2]^2+initializer.nextQuaternion[3]^2)}};
  checks[1] = SLAMExactRealEqual(initializer.initializationAccepted,if expectedInitialization then 1 else 0);
  checks[2] = SLAMExactRealEqual(initializer.initializationRejected,if expectedInitialization or scenario == 25 then 0 else 1);
  checks[3] = SLAMExactRealEqual(initializer.captureAccepted,if expectedCapture then 1 else 0);
  checks[4] = SLAMExactRealEqual(initializer.captureRejected,if expectedCapture or scenario == 13 or scenario == 22 or scenario == 23 then 0 else 1);
  checks[5] = RGBDLocalizationInitializeTests.CloseVector(initializer.nextPosition,RGBDLocalizationInitializeTests.position,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextVelocity,velocityInput,1e-12) and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextRotation,rotationInput,1e-12);
  checks[6] = RGBDLocalizationInitializeTests.CloseVector(initializer.nextAccelBias,accelBiasInput,1e-12) and RGBDLocalizationInitializeTests.CloseVector(initializer.nextGyroBias,gyroBiasInput,1e-12);
  checks[7] = RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextCovariance,covarianceInput,1e-12);
  checks[8] = initializer.predictionAccepted < 0.5 and initializer.observationAccepted < 0.5
    and initializer.observationRejected < 0.5 and initializer.visualValid < 0.5 and initializer.confidence < 0.5;
  checks[9] = SLAMExactRealEqual(initializer.nextLastUsedEpoch,lastUsedInput)
    and initializer.imagePairEligible < 0.5 and initializer.imageReuseRejected < 0.5;
  checks[10] = if expectedCapture then cloneOracle else held;
  checks[11] = if expectedCapture then snapshotOracle else
    RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceRgbCalibration,{115,106,79,44},1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceDepthCalibration,{83,75,79,44},1e-12)
    and SLAMExactRealEqual(initializer.nextReferenceNoiseReferenceFx,490)
    and SLAMExactRealEqual(initializer.nextReferenceDisparityNoise,0.07)
    and SLAMExactRealEqual(initializer.nextReferenceBaseline,0.06)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceOpticalToBody,identity(3),1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceCameraOriginBody,{0.1,0,0},1e-12);
  checks[12] = if expectedCapture then frontOracle else true;
  checks[13] = if expectedCapture then geometryOracle else RGBDLocalizationInitializeTests.ZeroVector(initializer.mapCandidateEnabled,0.5);
  checks[14] = if expectedCapture then SLAMCovariancePSDCheck(proposedJoint,1e-12) > 0.5 else true;
  checks[15] = RGBDLocalizationInitializeTests.ZeroMatrix(initializer.relativeCovariance,1e-12) and RGBDLocalizationInitializeTests.CloseMatrix(initializer.currentFromReference,identity(3),1e-12)
    and RGBDLocalizationInitializeTests.ZeroVector(initializer.currentFromReferenceTranslation,1e-12);
  checks[16] = RGBDLocalizationInitializeTests.ZeroVector(initializer.trackingEnabled,0.5) and RGBDLocalizationInitializeTests.ZeroMatrix(initializer.trackingCurrentPixel,1e-12)
    and RGBDLocalizationInitializeTests.ZeroMatrix(initializer.trackingReferencePixel,1e-12) and initializer.matchCount < 0.5;
  checks[17] = if scenario == 7 then true else RGBDLocalizationInitializeTests.CloseMatrix(quaternionRotation,rotationInput,1e-10);
  checks[18] = RGBDLocalizationInitializeTests.CloseMatrix(initializer.positionCovariance,covarianceInput[1:3,1:3],1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.attitudeCovariance,covarianceInput[7:9,7:9],1e-12);
  // Fractional frame flags do not enable an acquisition, just like flag zero.
  checks[19] = SLAMExactRealEqual(initializer.currentCount,if scenario == 13 or scenario == 23 then 0 else countInput);
  checks[20] = if expectedCapture then initializer.currentEnabled[350] > 0.5
    and SLAMExactRealEqual(initializer.nextReferenceCount,350) else true;
algorithm
  cloneOracle := true; snapshotOracle := true; frontOracle := true; geometryOracle := true;
  expectedPoint := zeros(350,3); expectedDescriptor := zeros(350,49); expectedEnabled := zeros(350);
  expectedMap := zeros(350,3);
  for row in 1:15 loop
    for column in 1:6 loop
      cloneOracle := cloneOracle and abs(initializer.nextCrossCovariance[row,column]
        -covarianceInput[row,RGBDLocalizationInitializeTests.selection[column]]) < 1e-12;
    end for;
  end for;
  for row in 1:6 loop
    for column in 1:6 loop
      cloneOracle := cloneOracle and abs(initializer.nextReferenceCovariance[row,column]
        -covarianceInput[RGBDLocalizationInitializeTests.selection[row],RGBDLocalizationInitializeTests.selection[column]]) < 1e-12;
    end for;
  end for;
  cloneOracle := cloneOracle and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferencePosition,RGBDLocalizationInitializeTests.position,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceRotation,rotationInput,1e-12) and initializer.nextReferenceAvailable > 0.5
    and SLAMExactRealEqual(initializer.nextReferenceEpoch,epochInput) and initializer.nextReferenceUsed < 0.5;
  for feature in 1:350 loop
    if feature == 1 or feature == 37 or feature == 350 then
      expectedEnabled[feature] := 1;
      expectedPoint[feature,:] := RGBDLocalizationInitializeTests.ExpectedPoint(feature,if scenario == 24 then 0.4 else 0);
      expectedDescriptor[feature,:] := RGBDLocalizationInitializeTests.ExpectedDescriptor(feature,if scenario == 24 then 13 else 0);
      expectedMap[feature,:] := rotationInput*(RGBDLocalizationInitializeTests.opticalToBody*expectedPoint[feature,:]
        +RGBDLocalizationInitializeTests.origin)+RGBDLocalizationInitializeTests.position;
    end if;
  end for;
  frontOracle := RGBDLocalizationInitializeTests.CloseVector(initializer.currentEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.currentPoint,expectedPoint,1e-10)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.currentDescriptor,expectedDescriptor,1e-10);
  snapshotOracle := RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceDescriptor,expectedDescriptor,1e-10)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferencePoint,expectedPoint,1e-10)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferencePixels,pixels,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceRgbCalibration,RGBDLocalizationInitializeTests.rgbCalibration,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceDepthCalibration,RGBDLocalizationInitializeTests.depthCalibration,1e-12)
    and SLAMExactRealEqual(initializer.nextReferenceNoiseReferenceFx,500)
    and SLAMExactRealEqual(initializer.nextReferenceDisparityNoise,0.08) and SLAMExactRealEqual(initializer.nextReferenceBaseline,0.05)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.nextReferenceOpticalToBody,RGBDLocalizationInitializeTests.opticalToBody,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initializer.nextReferenceCameraOriginBody,RGBDLocalizationInitializeTests.origin,1e-12);
  geometryOracle := RGBDLocalizationInitializeTests.CloseVector(initializer.mapCandidateEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initializer.mapCandidatePoint,expectedMap,1e-10) and SLAMExactRealEqual(initializer.mapCandidateCount,3);
end RGBDLocalizationInitializeAcceptance;
