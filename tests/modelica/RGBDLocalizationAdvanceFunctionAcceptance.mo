// Connected full-domain fixture. Actual initialization supplies the retained
// reference. Expected step values use separate matrix/finite-difference math.
package RGBDLocalizationAdvanceReference
  constant Integer imageHeight=90; constant Integer imageWidth=160;
  constant Integer featureCapacity=350; constant Integer descriptorSize=49;
  record Input
    Real rgb[imageHeight,imageWidth,4];
    Real depth[imageHeight,imageWidth];
    Real rgbCalibration[4];
    Real depthCalibration[4];
    Real disparityNoise;
    Real noiseReferenceFx;
    Real baseline;
    Real opticalToBody[3,3];
    Real cameraOriginBody[3];
    Real frameEnabled;
    Real imageCaptureRequested;
    Real position[3];
    Real velocity[3];
    Real rotation[3,3];
    Real accelBias[3];
    Real gyroBias[3];
    Real covariance[15,15];
    Real crossCovariance[15,6];
    Real referenceCovariance[6,6];
    Real referencePosition[3];
    Real referenceRotation[3,3];
    Real referenceAvailable;
    Real referenceEpoch;
    Real currentEpoch;
    Real referenceUsed;
    Real lastUsedEpoch;
    Real referenceDescriptor[featureCapacity,descriptorSize];
    Real referencePoint[featureCapacity,3];
    Real referenceEnabled[featureCapacity];
    Real referencePixels[featureCapacity,2];
    Real referenceCount;
    Real referenceRgbCalibration[4];
    Real referenceDepthCalibration[4];
    Real referenceNoiseReferenceFx;
    Real referenceDisparityNoise;
    Real referenceBaseline;
    Real referenceOpticalToBody[3,3];
    Real referenceCameraOriginBody[3];
    Real accel[3];
    Real gyro[3];
    Real gravity[3];
    Real h;
    Real density[12];
    Real pixels[featureCapacity,2];
    Real activeCount;
    Real featureScore[featureCapacity];
  end Input;
  record Output
    Real nextPosition[3];
    Real nextVelocity[3];
    Real nextRotation[3,3];
    Real nextAccelBias[3];
    Real nextGyroBias[3];
    Real nextCovariance[15,15];
    Real nextCrossCovariance[15,6];
    Real nextReferenceCovariance[6,6];
    Real nextReferencePosition[3];
    Real nextReferenceRotation[3,3];
    Real nextReferenceAvailable;
    Real nextReferenceEpoch;
    Real nextReferenceUsed;
    Real nextLastUsedEpoch;
    Real nextReferenceDescriptor[featureCapacity,descriptorSize];
    Real nextReferencePoint[featureCapacity,3];
    Real nextReferenceEnabled[featureCapacity];
    Real nextReferencePixels[featureCapacity,2];
    Real nextReferenceCount;
    Real nextReferenceRgbCalibration[4];
    Real nextReferenceDepthCalibration[4];
    Real nextReferenceNoiseReferenceFx;
    Real nextReferenceDisparityNoise;
    Real nextReferenceBaseline;
    Real nextReferenceOpticalToBody[3,3];
    Real nextReferenceCameraOriginBody[3];
    Real predictionAccepted;
    Real observationAccepted;
    Real observationRejected;
    Real captureAccepted;
    Real captureRejected;
    Real imageReuseRejected;
    Real imagePairEligible;
    Real frameValid;
    Real referenceGeometryCompatible;
    Real visualValid;
    Real matchCount;
    Real uncertaintyRejectionReason;
    Real currentDescriptor[featureCapacity,descriptorSize];
    Real currentPoint[featureCapacity,3];
    Real currentEnabled[featureCapacity];
    Real currentCount;
    Real currentFromReference[3,3];
    Real currentFromReferenceTranslation[3];
    Real relativeCovariance[6,6];
    Real mapCandidatePoint[featureCapacity,3];
    Real mapCandidateEnabled[featureCapacity];
    Real mapCandidateCount;
    Real nextQuaternion[4];
    Real positionCovariance[3,3];
    Real attitudeCovariance[3,3];
    Real confidence;
    Real features[featureCapacity,3];
    Real featureEnabled[featureCapacity];
    Real trackingCurrentPixel[featureCapacity,2];
    Real trackingReferencePixel[featureCapacity,2];
    Real trackingEnabled[featureCapacity];
  end Output;
  record Prediction
    Boolean accepted; Real p[3]; Real v[3]; Real R[3,3]; Real P[15,15]; Real C[15,6];
  end Prediction;

  function Call
    input Input x; output Output y;
  protected
    Real nextPosition[3];
    Real nextVelocity[3];
    Real nextRotation[3,3];
    Real nextAccelBias[3];
    Real nextGyroBias[3];
    Real nextCovariance[15,15];
    Real nextCrossCovariance[15,6];
    Real nextReferenceCovariance[6,6];
    Real nextReferencePosition[3];
    Real nextReferenceRotation[3,3];
    Real nextReferenceAvailable;
    Real nextReferenceEpoch;
    Real nextReferenceUsed;
    Real nextLastUsedEpoch;
    Real nextReferenceDescriptor[featureCapacity,descriptorSize];
    Real nextReferencePoint[featureCapacity,3];
    Real nextReferenceEnabled[featureCapacity];
    Real nextReferencePixels[featureCapacity,2];
    Real nextReferenceCount;
    Real nextReferenceRgbCalibration[4];
    Real nextReferenceDepthCalibration[4];
    Real nextReferenceNoiseReferenceFx;
    Real nextReferenceDisparityNoise;
    Real nextReferenceBaseline;
    Real nextReferenceOpticalToBody[3,3];
    Real nextReferenceCameraOriginBody[3];
    Real predictionAccepted;
    Real observationAccepted;
    Real observationRejected;
    Real captureAccepted;
    Real captureRejected;
    Real imageReuseRejected;
    Real imagePairEligible;
    Real frameValid;
    Real referenceGeometryCompatible;
    Real visualValid;
    Real matchCount;
    Real uncertaintyRejectionReason;
    Real currentDescriptor[featureCapacity,descriptorSize];
    Real currentPoint[featureCapacity,3];
    Real currentEnabled[featureCapacity];
    Real currentCount;
    Real currentFromReference[3,3];
    Real currentFromReferenceTranslation[3];
    Real relativeCovariance[6,6];
    Real mapCandidatePoint[featureCapacity,3];
    Real mapCandidateEnabled[featureCapacity];
    Real mapCandidateCount;
    Real nextQuaternion[4];
    Real positionCovariance[3,3];
    Real attitudeCovariance[3,3];
    Real confidence;
    Real features[featureCapacity,3];
    Real featureEnabled[featureCapacity];
    Real trackingCurrentPixel[featureCapacity,2];
    Real trackingReferencePixel[featureCapacity,2];
    Real trackingEnabled[featureCapacity];
  algorithm
    (nextPosition,
      nextVelocity,
      nextRotation,
      nextAccelBias,
      nextGyroBias,
      nextCovariance,
      nextCrossCovariance,
      nextReferenceCovariance,
      nextReferencePosition,
      nextReferenceRotation,
      nextReferenceAvailable,
      nextReferenceEpoch,
      nextReferenceUsed,
      nextLastUsedEpoch,
      nextReferenceDescriptor,
      nextReferencePoint,
      nextReferenceEnabled,
      nextReferencePixels,
      nextReferenceCount,
      nextReferenceRgbCalibration,
      nextReferenceDepthCalibration,
      nextReferenceNoiseReferenceFx,
      nextReferenceDisparityNoise,
      nextReferenceBaseline,
      nextReferenceOpticalToBody,
      nextReferenceCameraOriginBody,
      predictionAccepted,
      observationAccepted,
      observationRejected,
      captureAccepted,
      captureRejected,
      imageReuseRejected,
      imagePairEligible,
      frameValid,
      referenceGeometryCompatible,
      visualValid,
      matchCount,
      uncertaintyRejectionReason,
      currentDescriptor,
      currentPoint,
      currentEnabled,
      currentCount,
      currentFromReference,
      currentFromReferenceTranslation,
      relativeCovariance,
      mapCandidatePoint,
      mapCandidateEnabled,
      mapCandidateCount,
      nextQuaternion,
      positionCovariance,
      attitudeCovariance,
      confidence,
      features,
      featureEnabled,
      trackingCurrentPixel,
      trackingReferencePixel,
      trackingEnabled) := AdvanceRGBDLocalization(
      rgb=x.rgb,
      depth=x.depth,
      rgbCalibration=x.rgbCalibration,
      depthCalibration=x.depthCalibration,
      disparityNoise=x.disparityNoise,
      noiseReferenceFx=x.noiseReferenceFx,
      baseline=x.baseline,
      opticalToBody=x.opticalToBody,
      cameraOriginBody=x.cameraOriginBody,
      frameEnabled=x.frameEnabled,
      imageCaptureRequested=x.imageCaptureRequested,
      position=x.position,
      velocity=x.velocity,
      rotation=x.rotation,
      accelBias=x.accelBias,
      gyroBias=x.gyroBias,
      covariance=x.covariance,
      crossCovariance=x.crossCovariance,
      referenceCovariance=x.referenceCovariance,
      referencePosition=x.referencePosition,
      referenceRotation=x.referenceRotation,
      referenceAvailable=x.referenceAvailable,
      referenceEpoch=x.referenceEpoch,
      currentEpoch=x.currentEpoch,
      referenceUsed=x.referenceUsed,
      lastUsedEpoch=x.lastUsedEpoch,
      referenceDescriptor=x.referenceDescriptor,
      referencePoint=x.referencePoint,
      referenceEnabled=x.referenceEnabled,
      referencePixels=x.referencePixels,
      referenceCount=x.referenceCount,
      referenceRgbCalibration=x.referenceRgbCalibration,
      referenceDepthCalibration=x.referenceDepthCalibration,
      referenceNoiseReferenceFx=x.referenceNoiseReferenceFx,
      referenceDisparityNoise=x.referenceDisparityNoise,
      referenceBaseline=x.referenceBaseline,
      referenceOpticalToBody=x.referenceOpticalToBody,
      referenceCameraOriginBody=x.referenceCameraOriginBody,
      accel=x.accel,
      gyro=x.gyro,
      gravity=x.gravity,
      h=x.h,
      density=x.density,
      pixels=x.pixels,
      activeCount=x.activeCount,
      featureScore=x.featureScore);
    y.nextPosition := nextPosition;
    y.nextVelocity := nextVelocity;
    y.nextRotation := nextRotation;
    y.nextAccelBias := nextAccelBias;
    y.nextGyroBias := nextGyroBias;
    y.nextCovariance := nextCovariance;
    y.nextCrossCovariance := nextCrossCovariance;
    y.nextReferenceCovariance := nextReferenceCovariance;
    y.nextReferencePosition := nextReferencePosition;
    y.nextReferenceRotation := nextReferenceRotation;
    y.nextReferenceAvailable := nextReferenceAvailable;
    y.nextReferenceEpoch := nextReferenceEpoch;
    y.nextReferenceUsed := nextReferenceUsed;
    y.nextLastUsedEpoch := nextLastUsedEpoch;
    y.nextReferenceDescriptor := nextReferenceDescriptor;
    y.nextReferencePoint := nextReferencePoint;
    y.nextReferenceEnabled := nextReferenceEnabled;
    y.nextReferencePixels := nextReferencePixels;
    y.nextReferenceCount := nextReferenceCount;
    y.nextReferenceRgbCalibration := nextReferenceRgbCalibration;
    y.nextReferenceDepthCalibration := nextReferenceDepthCalibration;
    y.nextReferenceNoiseReferenceFx := nextReferenceNoiseReferenceFx;
    y.nextReferenceDisparityNoise := nextReferenceDisparityNoise;
    y.nextReferenceBaseline := nextReferenceBaseline;
    y.nextReferenceOpticalToBody := nextReferenceOpticalToBody;
    y.nextReferenceCameraOriginBody := nextReferenceCameraOriginBody;
    y.predictionAccepted := predictionAccepted;
    y.observationAccepted := observationAccepted;
    y.observationRejected := observationRejected;
    y.captureAccepted := captureAccepted;
    y.captureRejected := captureRejected;
    y.imageReuseRejected := imageReuseRejected;
    y.imagePairEligible := imagePairEligible;
    y.frameValid := frameValid;
    y.referenceGeometryCompatible := referenceGeometryCompatible;
    y.visualValid := visualValid;
    y.matchCount := matchCount;
    y.uncertaintyRejectionReason := uncertaintyRejectionReason;
    y.currentDescriptor := currentDescriptor;
    y.currentPoint := currentPoint;
    y.currentEnabled := currentEnabled;
    y.currentCount := currentCount;
    y.currentFromReference := currentFromReference;
    y.currentFromReferenceTranslation := currentFromReferenceTranslation;
    y.relativeCovariance := relativeCovariance;
    y.mapCandidatePoint := mapCandidatePoint;
    y.mapCandidateEnabled := mapCandidateEnabled;
    y.mapCandidateCount := mapCandidateCount;
    y.nextQuaternion := nextQuaternion;
    y.positionCovariance := positionCovariance;
    y.attitudeCovariance := attitudeCovariance;
    y.confidence := confidence;
    y.features := features;
    y.featureEnabled := featureEnabled;
    y.trackingCurrentPixel := trackingCurrentPixel;
    y.trackingReferencePixel := trackingReferencePixel;
    y.trackingEnabled := trackingEnabled;
  end Call;

  function At
    input Integer scenario; output Input x; output Boolean initialized;
  protected
    Real raw[90,160,4]; Real depth[90,160]; Real pixel[350,2]; Real P[15,15];
    Real seed_nextPosition[3];
    Real seed_nextVelocity[3];
    Real seed_nextRotation[3,3];
    Real seed_nextAccelBias[3];
    Real seed_nextGyroBias[3];
    Real seed_nextCovariance[15,15];
    Real seed_nextCrossCovariance[15,6];
    Real seed_nextReferenceCovariance[6,6];
    Real seed_nextReferencePosition[3];
    Real seed_nextReferenceRotation[3,3];
    Real seed_nextReferenceAvailable;
    Real seed_nextReferenceEpoch;
    Real seed_nextReferenceUsed;
    Real seed_nextLastUsedEpoch;
    Real seed_nextReferenceDescriptor[featureCapacity,descriptorSize];
    Real seed_nextReferencePoint[featureCapacity,3];
    Real seed_nextReferenceEnabled[featureCapacity];
    Real seed_nextReferencePixels[featureCapacity,2];
    Real seed_nextReferenceCount;
    Real seed_nextReferenceRgbCalibration[4];
    Real seed_nextReferenceDepthCalibration[4];
    Real seed_nextReferenceNoiseReferenceFx;
    Real seed_nextReferenceDisparityNoise;
    Real seed_nextReferenceBaseline;
    Real seed_nextReferenceOpticalToBody[3,3];
    Real seed_nextReferenceCameraOriginBody[3];
    Real seed_predictionAccepted;
    Real seed_observationAccepted;
    Real seed_observationRejected;
    Real seed_captureAccepted;
    Real seed_captureRejected;
    Real seed_imageReuseRejected;
    Real seed_imagePairEligible;
    Real seed_frameValid;
    Real seed_referenceGeometryCompatible;
    Real seed_visualValid;
    Real seed_matchCount;
    Real seed_uncertaintyRejectionReason;
    Real seed_currentDescriptor[featureCapacity,descriptorSize];
    Real seed_currentPoint[featureCapacity,3];
    Real seed_currentEnabled[featureCapacity];
    Real seed_currentCount;
    Real seed_currentFromReference[3,3];
    Real seed_currentFromReferenceTranslation[3];
    Real seed_relativeCovariance[6,6];
    Real seed_mapCandidatePoint[featureCapacity,3];
    Real seed_mapCandidateEnabled[featureCapacity];
    Real seed_mapCandidateCount;
    Real seed_nextQuaternion[4];
    Real seed_positionCovariance[3,3];
    Real seed_attitudeCovariance[3,3];
    Real seed_confidence;
    Real seed_features[featureCapacity,3];
    Real seed_featureEnabled[featureCapacity];
    Real seed_trackingCurrentPixel[featureCapacity,2];
    Real seed_trackingReferencePixel[featureCapacity,2];
    Real seed_trackingEnabled[featureCapacity];
    Real seed_initializationAccepted;
    Real seed_initializationRejected;
  algorithm
    (raw,depth,pixel) := RGBDVisualRelativeReference.Image(false);
    P := RGBDLocalizationInitializeTests.Covariance();
    (seed_nextPosition,
      seed_nextVelocity,
      seed_nextRotation,
      seed_nextAccelBias,
      seed_nextGyroBias,
      seed_nextCovariance,
      seed_nextCrossCovariance,
      seed_nextReferenceCovariance,
      seed_nextReferencePosition,
      seed_nextReferenceRotation,
      seed_nextReferenceAvailable,
      seed_nextReferenceEpoch,
      seed_nextReferenceUsed,
      seed_nextLastUsedEpoch,
      seed_nextReferenceDescriptor,
      seed_nextReferencePoint,
      seed_nextReferenceEnabled,
      seed_nextReferencePixels,
      seed_nextReferenceCount,
      seed_nextReferenceRgbCalibration,
      seed_nextReferenceDepthCalibration,
      seed_nextReferenceNoiseReferenceFx,
      seed_nextReferenceDisparityNoise,
      seed_nextReferenceBaseline,
      seed_nextReferenceOpticalToBody,
      seed_nextReferenceCameraOriginBody,
      seed_predictionAccepted,
      seed_observationAccepted,
      seed_observationRejected,
      seed_captureAccepted,
      seed_captureRejected,
      seed_imageReuseRejected,
      seed_imagePairEligible,
      seed_frameValid,
      seed_referenceGeometryCompatible,
      seed_visualValid,
      seed_matchCount,
      seed_uncertaintyRejectionReason,
      seed_currentDescriptor,
      seed_currentPoint,
      seed_currentEnabled,
      seed_currentCount,
      seed_currentFromReference,
      seed_currentFromReferenceTranslation,
      seed_relativeCovariance,
      seed_mapCandidatePoint,
      seed_mapCandidateEnabled,
      seed_mapCandidateCount,
      seed_nextQuaternion,
      seed_positionCovariance,
      seed_attitudeCovariance,
      seed_confidence,
      seed_features,
      seed_featureEnabled,
      seed_trackingCurrentPixel,
      seed_trackingReferencePixel,
      seed_trackingEnabled,
      seed_initializationAccepted,
      seed_initializationRejected) := InitializeRGBDLocalization(
      rgb=raw,depth=depth,pixels=pixel,activeCount=350,featureScore=fill(7,350),
      rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
      disparityNoise=0.08,noiseReferenceFx=500,baseline=0.05,opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
      frameEnabled=1,imageCaptureRequested=1,position={1,-2,0.5},velocity={1.39,0.01,1.69},rotation=[0,-1,0;1,0,0;0,0,1],
      accelBias=zeros(3),gyroBias=zeros(3),covariance=P,crossCovariance=zeros(15,6),referenceCovariance=zeros(6,6),
      referencePosition=zeros(3),referenceRotation=identity(3),referenceAvailable=0,referenceEpoch=0,currentEpoch=1,
      referenceUsed=0,lastUsedEpoch=-1,referenceDescriptor=zeros(350,49),referencePoint=zeros(350,3),referenceEnabled=zeros(350),
      referencePixels=zeros(350,2),referenceCount=0,referenceRgbCalibration=RGBDVisualRelativeReference.referenceRgb,
      referenceDepthCalibration=RGBDVisualRelativeReference.referenceDepth,referenceNoiseReferenceFx=500,referenceDisparityNoise=0.08,
      referenceBaseline=0.05,referenceOpticalToBody=[0,0,1;-1,0,0;0,-1,0],referenceCameraOriginBody={0.18,-0.09,0.07},
      accel=zeros(3),gyro=zeros(3),gravity=zeros(3),h=0.2,density=fill(0.01,12),imageTime=0,initializationRequested=1);
    initialized := seed_initializationAccepted == 1 and seed_captureAccepted == 1 and seed_nextReferenceCount == 350;
    (raw,depth,pixel) := RGBDVisualRelativeReference.Image(true);
    x.rgb := raw; x.depth := depth; x.pixels := pixel; x.activeCount := 350; x.featureScore := fill(9,350);
    x.rgbCalibration := RGBDVisualRelativeReference.currentRgb; x.depthCalibration := RGBDVisualRelativeReference.currentDepth;
    x.disparityNoise := 0.08; x.noiseReferenceFx := 520; x.baseline := 0.05;
    x.opticalToBody := [0,0,1;-1,0,0;0,-1,0]; x.cameraOriginBody := {0.18,-0.09,0.07};
    x.frameEnabled := 1; x.imageCaptureRequested := 1;
    x.position := seed_nextPosition;
    x.velocity := seed_nextVelocity;
    x.rotation := seed_nextRotation;
    x.accelBias := seed_nextAccelBias;
    x.gyroBias := seed_nextGyroBias;
    x.covariance := seed_nextCovariance;
    x.crossCovariance := seed_nextCrossCovariance;
    x.referenceCovariance := seed_nextReferenceCovariance;
    x.referencePosition := seed_nextReferencePosition;
    x.referenceRotation := seed_nextReferenceRotation;
    x.referenceAvailable := seed_nextReferenceAvailable;
    x.referenceEpoch := seed_nextReferenceEpoch;
    x.referenceUsed := seed_nextReferenceUsed;
    x.lastUsedEpoch := seed_nextLastUsedEpoch;
    x.referenceDescriptor := seed_nextReferenceDescriptor;
    x.referencePoint := seed_nextReferencePoint;
    x.referenceEnabled := seed_nextReferenceEnabled;
    x.referencePixels := seed_nextReferencePixels;
    x.referenceCount := seed_nextReferenceCount;
    x.referenceRgbCalibration := seed_nextReferenceRgbCalibration;
    x.referenceDepthCalibration := seed_nextReferenceDepthCalibration;
    x.referenceNoiseReferenceFx := seed_nextReferenceNoiseReferenceFx;
    x.referenceDisparityNoise := seed_nextReferenceDisparityNoise;
    x.referenceBaseline := seed_nextReferenceBaseline;
    x.referenceOpticalToBody := seed_nextReferenceOpticalToBody;
    x.referenceCameraOriginBody := seed_nextReferenceCameraOriginBody;
    x.currentEpoch := 2; x.accel := zeros(3); x.gyro := {(3.141592653589793-0.02)/0.2,0,0};
    x.gravity := zeros(3); x.h := 0.2; x.density := fill(0.01,12);
    if scenario == 2 then
      x.frameEnabled := 0; x.h := 1.0/90; x.gyro := zeros(3);
      x.rgb := fill(1e101,90,160,4); x.depth := fill(-1e101,90,160); x.pixels := fill(-1e101,350,2);
    elseif scenario == 3 then x.h := 0;
    elseif scenario == 4 then x.h := 0.2001;
    elseif scenario == 5 then x.referenceUsed := 1; x.lastUsedEpoch := 2;
    elseif scenario == 6 then x.baseline := 0.06;
    elseif scenario == 7 then x.gyro := zeros(3);
    elseif scenario == 8 then x.currentEpoch := 1;
    elseif scenario == 9 then x.imageCaptureRequested := 0;
    elseif scenario == 10 then x.frameEnabled := 0.5;
    elseif scenario == 11 then
      for row in 1:90 loop for column in 1:160 loop x.rgb[row,column,4] := 1e101; end for; end for;
    elseif scenario == 12 then x.depth := zeros(90,160);
    elseif scenario == 13 then x.activeCount := 350.5;
    elseif scenario == 14 then x.position[1] := 999999.8;
    elseif scenario == 15 then x.covariance[15,15] := -1;
    elseif scenario == 16 then x.referenceAvailable := 0; x.referenceEpoch := 0; x.currentEpoch := 0; x.lastUsedEpoch := -1;
    end if;
  end At;

  function Compare
    input Output a; input Output b; output Boolean equal[57];
  algorithm
    equal[1] := RGBDLocalizationInitializeTests.CloseVector(a.nextPosition,b.nextPosition,2e-7);
    equal[2] := RGBDLocalizationInitializeTests.CloseVector(a.nextVelocity,b.nextVelocity,2e-7);
    equal[3] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextRotation,b.nextRotation,2e-7);
    equal[4] := RGBDLocalizationInitializeTests.CloseVector(a.nextAccelBias,b.nextAccelBias,2e-7);
    equal[5] := RGBDLocalizationInitializeTests.CloseVector(a.nextGyroBias,b.nextGyroBias,2e-7);
    equal[6] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextCovariance,b.nextCovariance,2e-7);
    equal[7] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextCrossCovariance,b.nextCrossCovariance,2e-7);
    equal[8] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextReferenceCovariance,b.nextReferenceCovariance,2e-7);
    equal[9] := RGBDLocalizationInitializeTests.CloseVector(a.nextReferencePosition,b.nextReferencePosition,2e-7);
    equal[10] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextReferenceRotation,b.nextReferenceRotation,2e-7);
    equal[11] := abs(a.nextReferenceAvailable-b.nextReferenceAvailable) < 2e-7;
    equal[12] := abs(a.nextReferenceEpoch-b.nextReferenceEpoch) < 2e-7;
    equal[13] := abs(a.nextReferenceUsed-b.nextReferenceUsed) < 2e-7;
    equal[14] := abs(a.nextLastUsedEpoch-b.nextLastUsedEpoch) < 2e-7;
    equal[15] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextReferenceDescriptor,b.nextReferenceDescriptor,2e-7);
    equal[16] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextReferencePoint,b.nextReferencePoint,2e-7);
    equal[17] := RGBDLocalizationInitializeTests.CloseVector(a.nextReferenceEnabled,b.nextReferenceEnabled,2e-7);
    equal[18] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextReferencePixels,b.nextReferencePixels,2e-7);
    equal[19] := abs(a.nextReferenceCount-b.nextReferenceCount) < 2e-7;
    equal[20] := RGBDLocalizationInitializeTests.CloseVector(a.nextReferenceRgbCalibration,b.nextReferenceRgbCalibration,2e-7);
    equal[21] := RGBDLocalizationInitializeTests.CloseVector(a.nextReferenceDepthCalibration,b.nextReferenceDepthCalibration,2e-7);
    equal[22] := abs(a.nextReferenceNoiseReferenceFx-b.nextReferenceNoiseReferenceFx) < 2e-7;
    equal[23] := abs(a.nextReferenceDisparityNoise-b.nextReferenceDisparityNoise) < 2e-7;
    equal[24] := abs(a.nextReferenceBaseline-b.nextReferenceBaseline) < 2e-7;
    equal[25] := RGBDLocalizationInitializeTests.CloseMatrix(a.nextReferenceOpticalToBody,b.nextReferenceOpticalToBody,2e-7);
    equal[26] := RGBDLocalizationInitializeTests.CloseVector(a.nextReferenceCameraOriginBody,b.nextReferenceCameraOriginBody,2e-7);
    equal[27] := abs(a.predictionAccepted-b.predictionAccepted) < 2e-7;
    equal[28] := abs(a.observationAccepted-b.observationAccepted) < 2e-7;
    equal[29] := abs(a.observationRejected-b.observationRejected) < 2e-7;
    equal[30] := abs(a.captureAccepted-b.captureAccepted) < 2e-7;
    equal[31] := abs(a.captureRejected-b.captureRejected) < 2e-7;
    equal[32] := abs(a.imageReuseRejected-b.imageReuseRejected) < 2e-7;
    equal[33] := abs(a.imagePairEligible-b.imagePairEligible) < 2e-7;
    equal[34] := abs(a.frameValid-b.frameValid) < 2e-7;
    equal[35] := abs(a.referenceGeometryCompatible-b.referenceGeometryCompatible) < 2e-7;
    equal[36] := abs(a.visualValid-b.visualValid) < 2e-7;
    equal[37] := abs(a.matchCount-b.matchCount) < 2e-7;
    equal[38] := abs(a.uncertaintyRejectionReason-b.uncertaintyRejectionReason) < 2e-7;
    equal[39] := RGBDLocalizationInitializeTests.CloseMatrix(a.currentDescriptor,b.currentDescriptor,2e-7);
    equal[40] := RGBDLocalizationInitializeTests.CloseMatrix(a.currentPoint,b.currentPoint,2e-7);
    equal[41] := RGBDLocalizationInitializeTests.CloseVector(a.currentEnabled,b.currentEnabled,2e-7);
    equal[42] := abs(a.currentCount-b.currentCount) < 2e-7;
    equal[43] := RGBDLocalizationInitializeTests.CloseMatrix(a.currentFromReference,b.currentFromReference,2e-7);
    equal[44] := RGBDLocalizationInitializeTests.CloseVector(a.currentFromReferenceTranslation,b.currentFromReferenceTranslation,2e-7);
    equal[45] := RGBDLocalizationInitializeTests.CloseMatrix(a.relativeCovariance,b.relativeCovariance,2e-7);
    equal[46] := RGBDLocalizationInitializeTests.CloseMatrix(a.mapCandidatePoint,b.mapCandidatePoint,2e-7);
    equal[47] := RGBDLocalizationInitializeTests.CloseVector(a.mapCandidateEnabled,b.mapCandidateEnabled,2e-7);
    equal[48] := abs(a.mapCandidateCount-b.mapCandidateCount) < 2e-7;
    equal[49] := RGBDLocalizationInitializeTests.CloseVector(a.nextQuaternion,b.nextQuaternion,2e-7);
    equal[50] := RGBDLocalizationInitializeTests.CloseMatrix(a.positionCovariance,b.positionCovariance,2e-7);
    equal[51] := RGBDLocalizationInitializeTests.CloseMatrix(a.attitudeCovariance,b.attitudeCovariance,2e-7);
    equal[52] := abs(a.confidence-b.confidence) < 2e-7;
    equal[53] := RGBDLocalizationInitializeTests.CloseMatrix(a.features,b.features,2e-7);
    equal[54] := RGBDLocalizationInitializeTests.CloseVector(a.featureEnabled,b.featureEnabled,2e-7);
    equal[55] := RGBDLocalizationInitializeTests.CloseMatrix(a.trackingCurrentPixel,b.trackingCurrentPixel,2e-7);
    equal[56] := RGBDLocalizationInitializeTests.CloseMatrix(a.trackingReferencePixel,b.trackingReferencePixel,2e-7);
    equal[57] := RGBDLocalizationInitializeTests.CloseVector(a.trackingEnabled,b.trackingEnabled,2e-7);
  end Compare;

  function Skew
    input Real v[3]; output Real K[3,3];
  algorithm K := [0,-v[3],v[2];v[3],0,-v[1];-v[2],v[1],0]; end Skew;

  function Exp
    input Real v[3]; output Real R[3,3];
  protected Real angle; Real K[3,3]; Real a; Real b;
  algorithm
    angle := sqrt(sum(v.^2)); K := Skew(v);
    a := if angle < 1e-6 then 1-angle^2/6+angle^4/120 else sin(angle)/angle;
    b := if angle < 1e-6 then 0.5-angle^2/24+angle^4/720 else (1-cos(angle))/angle^2;
    R := identity(3)+a*K+b*K*K;
  end Exp;

  function Log
    input Real R[3,3]; output Real v[3];
  protected Real sine; Real cosine; Real angle;
  algorithm
    v := {(R[3,2]-R[2,3])/2,(R[1,3]-R[3,1])/2,(R[2,1]-R[1,2])/2};
    sine := sqrt(sum(v.^2)); cosine := (R[1,1]+R[2,2]+R[3,3]-1)/2;
    angle := atan2(sine,cosine);
    v := (if sine < 1e-8 then 1+sine^2/6 else angle/sine)*v;
  end Log;

  function Predict
    input Input x; output Prediction y;
  protected
    Integer n; Real dt; Real angle; Real midpoint[3,3]; Real F[15,15]; Real G[15,12];
    Real A[15,15]; Real A2[15,15]; Real A3[15,15]; Real Phi[15,15]; Real E[15,15];
    Real B[15,12]; Real Q[15,15]; Real joint[21,21]; Real T[21,21]; Real process[21,21];
    Real raw[21,21]; Real fraction[3]; Real weight[3]; Real p[3]; Boolean running;
  algorithm
    y.p := x.position; y.v := x.velocity; y.R := x.rotation; y.P := x.covariance; y.C := x.crossCovariance;
    y.accepted := false;
    running := x.h > 0 and x.h <= 0.2 and x.covariance[15,15] > 0;
    if running then
      n := max(1,integer(ceil(max(x.h/0.02,abs(x.gyro[1])*x.h/0.1))));
      if x.h/n > 0.02 or abs(x.gyro[1])*x.h/n > 0.1 then n := n+1; end if;
      dt := x.h/n;
      joint := cat(1,cat(2,x.covariance,x.crossCovariance),cat(2,transpose(x.crossCovariance),x.referenceCovariance));
      fraction := {0.5-sqrt(15.0)/10,0.5,0.5+sqrt(15.0)/10}; weight := {5.0/18,4.0/9,5.0/18};
      // Fixture-specific analytic force-free motion about the body x axis.
      // The full21 joint is propagated independently, including frozen reference.
      for step in 1:n loop
        if running then
          angle := x.gyro[1]*(step-0.5)*dt;
          midpoint := x.rotation*[1,0,0;0,cos(angle),-sin(angle);0,sin(angle),cos(angle)];
          F := zeros(15,15); G := zeros(15,12);
          F[1:3,4:6] := identity(3); F[4:6,10:12] := -midpoint;
          F[7:9,7:9] := -Skew(x.gyro); F[7:9,13:15] := -identity(3);
          G[4:6,1:3] := -midpoint; G[7:9,4:6] := -identity(3);
          G[10:12,7:9] := identity(3); G[13:15,10:12] := identity(3);
          A := dt*F; A2 := A*A; A3 := A2*A;
          Phi := identity(15)+A+A2/2+A3/6; Q := zeros(15,15);
          for node in 1:3 loop
            E := identity(15)+fraction[node]*A+fraction[node]^2*A2/2+fraction[node]^3*A3/6;
            B := E*G;
            for channel in 1:12 loop B[:,channel] := B[:,channel]*x.density[channel]; end for;
            Q := Q+dt*weight[node]*B*transpose(B);
          end for;
          T := identity(21); T[1:15,1:15] := Phi; process := zeros(21,21); process[1:15,1:15] := Q;
          raw := T*joint*transpose(T)+process; joint := (raw+transpose(raw))/2;
          p := x.position+x.velocity*(step*dt);
          for axis in 1:3 loop running := running and abs(p[axis]) <= 1e6; end for;
        end if;
      end for;
      if running then
        y.accepted := true; y.p := x.position+x.velocity*x.h;
        angle := x.gyro[1]*x.h;
        y.R := x.rotation*[1,0,0;0,cos(angle),-sin(angle);0,sin(angle),cos(angle)];
        y.P := joint[1:15,1:15]; y.C := if x.referenceAvailable == 1 then joint[1:15,16:21] else x.crossCovariance;
      end if;
    end if;
  end Predict;

  function Residual
    input Input x; input Real p[3]; input Real R[3,3]; input Real pr[3]; input Real Rr[3,3];
    output Real residual[6];
  protected Real predictedR[3,3]; Real predictedT[3];
  algorithm
    predictedR := transpose(x.opticalToBody)*transpose(R)*Rr*x.opticalToBody;
    predictedT := transpose(x.opticalToBody)*(transpose(R)*(pr-p+Rr*x.cameraOriginBody)-x.cameraOriginBody);
    residual := cat(1,{0.1,-0.2,0}-predictedT,Log(transpose(predictedR)*diagonal({-1,-1,1})));
  end Residual;

  function Correct
    input Input x; input Prediction prediction; input Real sigma[6,6];
    output Prediction y; output Real ba[3]; output Real bg[3]; output Boolean accepted;
  protected
    Real prior[21,21]; Real H[6,21]; Real K[21,6]; Real S[6,6]; Real N[6,6]; Real map[6,6];
    Real residual[6]; Real rp[6]; Real rm[6]; Real p[3]; Real pr[3]; Real R[3,3]; Real Rr[3,3];
    Real basis[3]; Real increment[15]; Real inverse[6,6]; Real M[21,21]; Real posterior[21,21];
    Real reset[21,21]; Real logK[3,3]; Real resetK[3,3]; Real angle; Real coefficient; Real nis;
    constant Real delta=1e-6;
  algorithm
    y := prediction; ba := x.accelBias; bg := x.gyroBias; accepted := false;
    residual := Residual(x,prediction.p,prediction.R,x.referencePosition,x.referenceRotation);
    // Central differences of the actual geometric measurement residual provide
    // an independent full6x21 Jacobian; no production correction/Jacobian call.
    H := zeros(6,21);
    for column in 1:21 loop
      p := prediction.p; pr := x.referencePosition; R := prediction.R; Rr := x.referenceRotation; basis := zeros(3);
      if column <= 3 then p[column] := p[column]+delta;
      elseif column >= 7 and column <= 9 then basis[column-6] := delta; R := R*Exp(basis);
      elseif column >= 16 and column <= 18 then pr[column-15] := pr[column-15]+delta;
      elseif column >= 19 then basis[column-18] := delta; Rr := Rr*Exp(basis); end if;
      rp := Residual(x,p,R,pr,Rr);
      p := prediction.p; pr := x.referencePosition; R := prediction.R; Rr := x.referenceRotation; basis := zeros(3);
      if column <= 3 then p[column] := p[column]-delta;
      elseif column >= 7 and column <= 9 then basis[column-6] := -delta; R := R*Exp(basis);
      elseif column >= 16 and column <= 18 then pr[column-15] := pr[column-15]-delta;
      elseif column >= 19 then basis[column-18] := -delta; Rr := Rr*Exp(basis); end if;
      rm := Residual(x,p,R,pr,Rr); H[:,column] := -(rp-rm)/(2*delta);
    end for;
    angle := sqrt(sum(residual[4:6].^2)); logK := Skew(residual[4:6]);
    coefficient := if angle < 1e-5 then 1.0/12+angle^2/720 else (1-angle*cos(angle/2)/(2*sin(angle/2)))/angle^2;
    map := identity(6); map[4:6,4:6] := (identity(3)+logK/2+coefficient*logK*logK)*diagonal({-1,-1,1});
    N := map*sigma*transpose(map);
    prior := cat(1,cat(2,prediction.P,prediction.C),cat(2,transpose(prediction.C),x.referenceCovariance));
    S := H*prior*transpose(H)+N; inverse := RGBDVisualRelativeReference.Inverse(S);
    nis := sum(residual.*(inverse*residual));
    accepted := angle < 0.35 and nis >= 0 and nis <= 22.46;
    if accepted then
      K := prior*transpose(H)*inverse; K[16:21,:] := zeros(6,6);
      increment := K[1:15,:]*residual;
      y.p := prediction.p+increment[1:3]; y.v := prediction.v+increment[4:6];
      y.R := prediction.R*Exp(increment[7:9]); ba := ba+increment[10:12]; bg := bg+increment[13:15];
      M := identity(21)-K*H; posterior := M*prior*transpose(M)+K*N*transpose(K);
      reset := identity(21); resetK := Skew(increment[7:9]); angle := sqrt(sum(increment[7:9].^2));
      reset[7:9,7:9] := identity(3)-(if angle < 1e-6 then 0.5-angle^2/24 else (1-cos(angle))/angle^2)*resetK
        +(if angle < 1e-6 then 1.0/6-angle^2/120 else (angle-sin(angle))/angle^3)*resetK*resetK;
      posterior := reset*posterior*transpose(reset);
      y.P := (posterior[1:15,1:15]+transpose(posterior[1:15,1:15]))/2; y.C := posterior[1:15,16:21];
    end if;
  end Correct;

  function Quaternion
    input Real R[3,3]; output Real q[4];
  protected Real scale;
  algorithm
    if R[1,1]+R[2,2]+R[3,3] > 0 then
      scale := 2*sqrt(1+R[1,1]+R[2,2]+R[3,3]);
      q := {scale/4,(R[3,2]-R[2,3])/scale,(R[1,3]-R[3,1])/scale,(R[2,1]-R[1,2])/scale};
    elseif R[1,1] > R[2,2] and R[1,1] > R[3,3] then
      scale := 2*sqrt(1+R[1,1]-R[2,2]-R[3,3]);
      q := {(R[3,2]-R[2,3])/scale,scale/4,(R[1,2]+R[2,1])/scale,(R[1,3]+R[3,1])/scale};
    elseif R[2,2] > R[3,3] then
      scale := 2*sqrt(1-R[1,1]+R[2,2]-R[3,3]);
      q := {(R[1,3]-R[3,1])/scale,(R[1,2]+R[2,1])/scale,scale/4,(R[2,3]+R[3,2])/scale};
    else
      scale := 2*sqrt(1-R[1,1]-R[2,2]+R[3,3]);
      q := {(R[2,1]-R[1,2])/scale,(R[1,3]+R[3,1])/scale,(R[2,3]+R[3,2])/scale,scale/4};
    end if;
    q := (if q[1] < 0 then -1 else 1)*q/sqrt(sum(q.^2));
  end Quaternion;

  function Oracle
    input Input x; input Integer scenario; output Output y; output Boolean proof[8];
  protected
    Prediction predicted; Prediction corrected; Real ba[3]; Real bg[3];
    Real sigma[6,6]; Real conditional[6,6]; Real used; Integer slot;
    Boolean initializedFront; Boolean geometry; Boolean visual; Boolean eligible; Boolean fresh;
    Boolean attempted; Boolean observation; Boolean capture; Boolean frame; Boolean validPair;
  algorithm
    y.nextPosition := zeros(3);
    y.nextVelocity := zeros(3);
    y.nextRotation := zeros(3,3);
    y.nextAccelBias := zeros(3);
    y.nextGyroBias := zeros(3);
    y.nextCovariance := zeros(15,15);
    y.nextCrossCovariance := zeros(15,6);
    y.nextReferenceCovariance := zeros(6,6);
    y.nextReferencePosition := zeros(3);
    y.nextReferenceRotation := zeros(3,3);
    y.nextReferenceAvailable := 0;
    y.nextReferenceEpoch := 0;
    y.nextReferenceUsed := 0;
    y.nextLastUsedEpoch := 0;
    y.nextReferenceDescriptor := zeros(featureCapacity,descriptorSize);
    y.nextReferencePoint := zeros(featureCapacity,3);
    y.nextReferenceEnabled := zeros(featureCapacity);
    y.nextReferencePixels := zeros(featureCapacity,2);
    y.nextReferenceCount := 0;
    y.nextReferenceRgbCalibration := zeros(4);
    y.nextReferenceDepthCalibration := zeros(4);
    y.nextReferenceNoiseReferenceFx := 0;
    y.nextReferenceDisparityNoise := 0;
    y.nextReferenceBaseline := 0;
    y.nextReferenceOpticalToBody := zeros(3,3);
    y.nextReferenceCameraOriginBody := zeros(3);
    y.predictionAccepted := 0;
    y.observationAccepted := 0;
    y.observationRejected := 0;
    y.captureAccepted := 0;
    y.captureRejected := 0;
    y.imageReuseRejected := 0;
    y.imagePairEligible := 0;
    y.frameValid := 0;
    y.referenceGeometryCompatible := 0;
    y.visualValid := 0;
    y.matchCount := 0;
    y.uncertaintyRejectionReason := 0;
    y.currentDescriptor := zeros(featureCapacity,descriptorSize);
    y.currentPoint := zeros(featureCapacity,3);
    y.currentEnabled := zeros(featureCapacity);
    y.currentCount := 0;
    y.currentFromReference := zeros(3,3);
    y.currentFromReferenceTranslation := zeros(3);
    y.relativeCovariance := zeros(6,6);
    y.mapCandidatePoint := zeros(featureCapacity,3);
    y.mapCandidateEnabled := zeros(featureCapacity);
    y.mapCandidateCount := 0;
    y.nextQuaternion := zeros(4);
    y.positionCovariance := zeros(3,3);
    y.attitudeCovariance := zeros(3,3);
    y.confidence := 0;
    y.features := zeros(featureCapacity,3);
    y.featureEnabled := zeros(featureCapacity);
    y.trackingCurrentPixel := zeros(featureCapacity,2);
    y.trackingReferencePixel := zeros(featureCapacity,2);
    y.trackingEnabled := zeros(featureCapacity);
    predicted := Predict(x); corrected := predicted; ba := x.accelBias; bg := x.gyroBias;
    initializedFront := x.frameEnabled == 1 and x.activeCount == floor(x.activeCount)
      and x.activeCount >= 0 and x.activeCount <= 350 and scenario <> 12;
    geometry := x.baseline == x.referenceBaseline;
    visual := initializedFront and geometry and x.referenceAvailable == 1;
    frame := initializedFront;
    validPair := if x.referenceAvailable == 0 then x.referenceUsed == 0
      else if x.referenceUsed == 0 then x.referenceEpoch > x.lastUsedEpoch else x.referenceEpoch <= x.lastUsedEpoch;
    eligible := validPair and x.referenceAvailable == 1 and x.referenceUsed == 0 and x.currentEpoch > x.referenceEpoch;
    fresh := validPair and x.currentEpoch > x.lastUsedEpoch and (x.referenceAvailable == 0 or x.currentEpoch > x.referenceEpoch);
    attempted := predicted.accepted and eligible and visual;
    observation := false; sigma := zeros(6,6);
    if visual then
      (sigma,conditional) := RGBDVisualRelativeReference.Noise(fill(true,6));
      if attempted and scenario <> 7 then (corrected,ba,bg,observation) := Correct(x,predicted,sigma); end if;
    end if;
    used := if attempted then x.currentEpoch else x.lastUsedEpoch;
    capture := predicted.accepted and fresh and x.currentEpoch > used and frame and x.imageCaptureRequested == 1;
    y.nextPosition := corrected.p; y.nextVelocity := corrected.v; y.nextRotation := corrected.R;
    y.nextAccelBias := ba; y.nextGyroBias := bg; y.nextCovariance := corrected.P; y.nextCrossCovariance := corrected.C;
    y.nextReferenceCovariance := x.referenceCovariance;
    y.nextReferencePosition := x.referencePosition; y.nextReferenceRotation := x.referenceRotation;
    y.nextReferenceAvailable := x.referenceAvailable; y.nextReferenceEpoch := x.referenceEpoch;
    y.nextReferenceUsed := if attempted then 1 else x.referenceUsed; y.nextLastUsedEpoch := used;
    y.nextReferenceDescriptor := x.referenceDescriptor; y.nextReferencePoint := x.referencePoint;
    y.nextReferenceEnabled := x.referenceEnabled; y.nextReferencePixels := x.referencePixels;
    y.nextReferenceCount := x.referenceCount; y.nextReferenceRgbCalibration := x.referenceRgbCalibration;
    y.nextReferenceDepthCalibration := x.referenceDepthCalibration; y.nextReferenceNoiseReferenceFx := x.referenceNoiseReferenceFx;
    y.nextReferenceDisparityNoise := x.referenceDisparityNoise; y.nextReferenceBaseline := x.referenceBaseline;
    y.nextReferenceOpticalToBody := x.referenceOpticalToBody; y.nextReferenceCameraOriginBody := x.referenceCameraOriginBody;
    y.predictionAccepted := if predicted.accepted then 1 else 0;
    y.observationAccepted := if observation then 1 else 0;
    y.observationRejected := if predicted.accepted and visual and not observation then 1 else 0;
    y.captureAccepted := if capture then 1 else 0;
    y.captureRejected := if x.imageCaptureRequested == 1 and x.frameEnabled == 1 and not capture then 1 else 0;
    y.imageReuseRejected := if predicted.accepted and visual and not eligible then 1 else 0;
    y.imagePairEligible := if eligible then 1 else 0; y.frameValid := if frame then 1 else 0;
    y.referenceGeometryCompatible := if geometry then 1 else 0;
    y.visualValid := if visual then 1 else 0; y.matchCount := if visual then 6 else 0;
    y.uncertaintyRejectionReason := if visual then 0 else 2;
    y.currentCount := if x.frameEnabled == 1 then x.activeCount else 0;
    y.currentFromReference := if visual then diagonal({-1,-1,1}) else identity(3);
    y.currentFromReferenceTranslation := if visual then {0.1,-0.2,0} else zeros(3);
    y.relativeCovariance := sigma;
    y.nextQuaternion := Quaternion(corrected.R); y.positionCovariance := corrected.P[1:3,1:3];
    y.attitudeCovariance := corrected.P[7:9,7:9]; y.confidence := if observation then 1 else 0;
    for feature in 1:6 loop
      slot := RGBDVisualRelativeReference.slots[feature];
      if initializedFront then
        y.currentEnabled[slot] := 1; y.featureEnabled[slot] := 1;
        y.currentPoint[slot,:] := RGBDVisualRelativeReference.Point(feature,true);
        y.currentDescriptor[slot,feature] := 1/sqrt(2.0); y.currentDescriptor[slot,49] := -1/sqrt(2.0);
        y.features[slot,:] := {x.pixels[slot,1],x.pixels[slot,2],9};
        if observation or capture then
          y.mapCandidateEnabled[slot] := 1;
          y.mapCandidatePoint[slot,:] := corrected.R*(x.opticalToBody*y.currentPoint[slot,:]+x.cameraOriginBody)+corrected.p;
        end if;
      end if;
      if visual then
        y.trackingEnabled[slot] := 1; y.trackingCurrentPixel[slot,:] := x.pixels[slot,:];
        y.trackingReferencePixel[slot,:] := x.referencePixels[slot,:];
      end if;
    end for;
    y.mapCandidateCount := if observation or capture then 6 else 0;
    if capture then
      y.nextReferencePosition := corrected.p; y.nextReferenceRotation := corrected.R;
      y.nextReferenceAvailable := 1; y.nextReferenceEpoch := x.currentEpoch; y.nextReferenceUsed := 0;
      y.nextReferenceDescriptor := y.currentDescriptor; y.nextReferencePoint := y.currentPoint;
      y.nextReferenceEnabled := y.currentEnabled; y.nextReferencePixels := x.pixels; y.nextReferenceCount := x.activeCount;
      y.nextReferenceRgbCalibration := x.rgbCalibration; y.nextReferenceDepthCalibration := x.depthCalibration;
      y.nextReferenceNoiseReferenceFx := x.noiseReferenceFx; y.nextReferenceDisparityNoise := x.disparityNoise;
      y.nextReferenceBaseline := x.baseline; y.nextReferenceOpticalToBody := x.opticalToBody;
      y.nextReferenceCameraOriginBody := x.cameraOriginBody;
      for row in 1:15 loop for column in 1:6 loop
        y.nextCrossCovariance[row,column] := corrected.P[row,RGBDLocalizationInitializeTests.selection[column]];
      end for; end for;
      for row in 1:6 loop for column in 1:6 loop
        y.nextReferenceCovariance[row,column] := corrected.P[RGBDLocalizationInitializeTests.selection[row],RGBDLocalizationInitializeTests.selection[column]];
      end for; end for;
    end if;
    proof := fill(true,8);
    proof[1] := if scenario == 1 or scenario == 9 or scenario == 11 then observation
      and max(abs(corrected.P-predicted.P)) > 1e-9 and max(abs(corrected.p-predicted.p)) > 1e-7 else true;
    proof[2] := if scenario == 7 then attempted and not observation and abs(x.gyro[1]) < 1e-12 else true;
    proof[3] := if scenario == 14 then not predicted.accepted and x.position[1]+x.velocity[1]*(x.h/32) < 1e6
      and x.position[1]+x.velocity[1]*x.h > 1e6 else true;
    proof[4] := if scenario == 6 or scenario == 16 then capture else true;
    proof[5] := if scenario == 1 or scenario == 7 then y.nextLastUsedEpoch == 2 and y.nextReferenceUsed == 1 and not capture else true;
    proof[6] := if scenario == 2 or scenario == 10 then predicted.accepted and not observation and not attempted else true;
    proof[7] := if scenario == 3 or scenario == 4 or scenario == 14 or scenario == 15 then not predicted.accepted
      and RGBDLocalizationInitializeTests.CloseMatrix(y.nextCovariance,x.covariance,1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(y.nextCrossCovariance,x.crossCovariance,1e-12) else true;
    proof[8] := if scenario == 5 or scenario == 8 then y.imageReuseRejected == 1 else true;
  end Oracle;

  function Checks
    input Integer scenario; output Boolean checks[66];
  protected
    Input x; Output actual; Output expected; Boolean initialized; Boolean proof[8];
    Boolean parity[57]; Boolean seed; Integer slot; Real wanted[3]; Real descriptor[350,49]; Real point[350,3]; Real enabled[350];
  algorithm
    (x,initialized) := At(scenario); actual := Call(x); (expected,proof) := Oracle(x,scenario);
    parity := Compare(actual,expected);
    descriptor := zeros(350,49); point := zeros(350,3); enabled := zeros(350);
    for feature in 1:6 loop
      slot := RGBDVisualRelativeReference.slots[feature]; enabled[slot] := 1;
      descriptor[slot,feature] := 1/sqrt(2.0); descriptor[slot,49] := -1/sqrt(2.0);
      point[slot,:] := RGBDVisualRelativeReference.Point(feature,false);
    end for;
    seed := initialized and RGBDLocalizationInitializeTests.CloseMatrix(x.referenceDescriptor,descriptor,1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(x.referencePoint,point,1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(x.referenceEnabled,enabled,1e-12);
    for i in 1:57 loop checks[i] := parity[i]; end for;
    checks[58] := seed;
    for i in 1:8 loop checks[i+58] := proof[i]; end for;
  end Checks;
end RGBDLocalizationAdvanceReference;

model RGBDLocalizationAdvanceFunctionAcceptance
  output Integer scenario;
  output Boolean checks[66];
equation
  scenario = min(16,1+integer(time));
  checks = RGBDLocalizationAdvanceReference.Checks(scenario);
end RGBDLocalizationAdvanceFunctionAcceptance;

// Separately bounded attempt against the unchanged connected equation model.
// Its resource refusal, if any, cannot be counted as function/original parity.
model RGBDLocalizationAdvanceOriginalModelAcceptance
  RGBDLocalizationAdvanceReference.Input raw;
  RGBDLocalizationAdvanceReference.Output actual;
  RGBDLocalizationAdvanceReference.Output reference;
  Boolean initialized;
  output Integer scenario;
  output Boolean checks[66];
protected
  RGBDInertialLocalizationStep original(
    rgb=raw.rgb,
    depth=raw.depth,
    rgbCalibration=raw.rgbCalibration,
    depthCalibration=raw.depthCalibration,
    disparityNoise=raw.disparityNoise,
    noiseReferenceFx=raw.noiseReferenceFx,
    baseline=raw.baseline,
    opticalToBody=raw.opticalToBody,
    cameraOriginBody=raw.cameraOriginBody,
    frameEnabled=raw.frameEnabled,
    imageCaptureRequested=raw.imageCaptureRequested,
    position=raw.position,
    velocity=raw.velocity,
    rotation=raw.rotation,
    accelBias=raw.accelBias,
    gyroBias=raw.gyroBias,
    covariance=raw.covariance,
    crossCovariance=raw.crossCovariance,
    referenceCovariance=raw.referenceCovariance,
    referencePosition=raw.referencePosition,
    referenceRotation=raw.referenceRotation,
    referenceAvailable=raw.referenceAvailable,
    referenceEpoch=raw.referenceEpoch,
    currentEpoch=raw.currentEpoch,
    referenceUsed=raw.referenceUsed,
    lastUsedEpoch=raw.lastUsedEpoch,
    referenceDescriptor=raw.referenceDescriptor,
    referencePoint=raw.referencePoint,
    referenceEnabled=raw.referenceEnabled,
    referencePixels=raw.referencePixels,
    referenceCount=raw.referenceCount,
    referenceRgbCalibration=raw.referenceRgbCalibration,
    referenceDepthCalibration=raw.referenceDepthCalibration,
    referenceNoiseReferenceFx=raw.referenceNoiseReferenceFx,
    referenceDisparityNoise=raw.referenceDisparityNoise,
    referenceBaseline=raw.referenceBaseline,
    referenceOpticalToBody=raw.referenceOpticalToBody,
    referenceCameraOriginBody=raw.referenceCameraOriginBody,
    accel=raw.accel,
    gyro=raw.gyro,
    gravity=raw.gravity,
    h=raw.h,
    density=raw.density,
    pixels=raw.pixels,
    activeCount=raw.activeCount,
    featureScore=raw.featureScore);
equation
  scenario = min(16,1+integer(time));
  (raw,initialized) = RGBDLocalizationAdvanceReference.At(scenario);
  actual = RGBDLocalizationAdvanceReference.Call(raw);
  reference.nextPosition = original.nextPosition;
  reference.nextVelocity = original.nextVelocity;
  reference.nextRotation = original.nextRotation;
  reference.nextAccelBias = original.nextAccelBias;
  reference.nextGyroBias = original.nextGyroBias;
  reference.nextCovariance = original.nextCovariance;
  reference.nextCrossCovariance = original.nextCrossCovariance;
  reference.nextReferenceCovariance = original.nextReferenceCovariance;
  reference.nextReferencePosition = original.nextReferencePosition;
  reference.nextReferenceRotation = original.nextReferenceRotation;
  reference.nextReferenceAvailable = original.nextReferenceAvailable;
  reference.nextReferenceEpoch = original.nextReferenceEpoch;
  reference.nextReferenceUsed = original.nextReferenceUsed;
  reference.nextLastUsedEpoch = original.nextLastUsedEpoch;
  reference.nextReferenceDescriptor = original.nextReferenceDescriptor;
  reference.nextReferencePoint = original.nextReferencePoint;
  reference.nextReferenceEnabled = original.nextReferenceEnabled;
  reference.nextReferencePixels = original.nextReferencePixels;
  reference.nextReferenceCount = original.nextReferenceCount;
  reference.nextReferenceRgbCalibration = original.nextReferenceRgbCalibration;
  reference.nextReferenceDepthCalibration = original.nextReferenceDepthCalibration;
  reference.nextReferenceNoiseReferenceFx = original.nextReferenceNoiseReferenceFx;
  reference.nextReferenceDisparityNoise = original.nextReferenceDisparityNoise;
  reference.nextReferenceBaseline = original.nextReferenceBaseline;
  reference.nextReferenceOpticalToBody = original.nextReferenceOpticalToBody;
  reference.nextReferenceCameraOriginBody = original.nextReferenceCameraOriginBody;
  reference.predictionAccepted = original.predictionAccepted;
  reference.observationAccepted = original.observationAccepted;
  reference.observationRejected = original.observationRejected;
  reference.captureAccepted = original.captureAccepted;
  reference.captureRejected = original.captureRejected;
  reference.imageReuseRejected = original.imageReuseRejected;
  reference.imagePairEligible = original.imagePairEligible;
  reference.frameValid = original.frameValid;
  reference.referenceGeometryCompatible = original.referenceGeometryCompatible;
  reference.visualValid = original.visualValid;
  reference.matchCount = original.matchCount;
  reference.uncertaintyRejectionReason = original.uncertaintyRejectionReason;
  reference.currentDescriptor = original.currentDescriptor;
  reference.currentPoint = original.currentPoint;
  reference.currentEnabled = original.currentEnabled;
  reference.currentCount = original.currentCount;
  reference.currentFromReference = original.currentFromReference;
  reference.currentFromReferenceTranslation = original.currentFromReferenceTranslation;
  reference.relativeCovariance = original.relativeCovariance;
  reference.mapCandidatePoint = original.mapCandidatePoint;
  reference.mapCandidateEnabled = original.mapCandidateEnabled;
  reference.mapCandidateCount = original.mapCandidateCount;
  reference.nextQuaternion = original.nextQuaternion;
  reference.positionCovariance = original.positionCovariance;
  reference.attitudeCovariance = original.attitudeCovariance;
  reference.confidence = original.confidence;
  reference.features = original.features;
  reference.featureEnabled = original.featureEnabled;
  reference.trackingCurrentPixel = original.trackingCurrentPixel;
  reference.trackingReferencePixel = original.trackingReferencePixel;
  reference.trackingEnabled = original.trackingEnabled;
  checks[1:57] = RGBDLocalizationAdvanceReference.Compare(actual,reference);
  checks[58] = initialized;
  checks[59:66] = fill(true,8);
end RGBDLocalizationAdvanceOriginalModelAcceptance;
