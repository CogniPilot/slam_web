// Native-grid reference: three isolated bright points give exactly three FAST-9
// responses255, in raster order. No production scorer/selector supplies the oracle.
package RGBDNativeInitializationTests
  constant Integer imageHeight=480; constant Integer imageWidth=848;
  constant Integer featureCapacity=350; constant Integer descriptorSize=49;
  constant Integer checkCount=24;
  constant Real pixels[3,2]=[8,8;424,240;844,476];
  constant Real rgbCalibration[4]={600,580,423.5,239.5};
  constant Real depthCalibration[4]={440,400,420.25,237.75};
  constant Integer poseColumns[6]={1,2,3,7,8,9};

  function OpticalPoint
    input Real pixel[2]; output Real point[3];
  protected
    Real u; Real v; Real a; Real b; Real inverseDepth; Integer x; Integer y;
  algorithm
    u := (pixel[1]-423.5)*440/600+420.25;
    v := (pixel[2]-239.5)*400/580+237.75;
    x := integer(floor(u)); y := integer(floor(v)); a := u-x; b := v-y;
    // Test-only analytic surface sampled at four explicit depth-grid neighbours.
    inverseDepth := (1-a)*(1-b)/(2+0.001*x+0.002*y)
      +a*(1-b)/(2+0.001*(x+1)+0.002*y)
      +(1-a)*b/(2+0.001*x+0.002*(y+1))
      +a*b/(2+0.001*(x+1)+0.002*(y+1));
    point := {(pixel[1]-423.5)/600/inverseDepth,
      (pixel[2]-239.5)/580/inverseDepth,1/inverseDepth};
  end OpticalPoint;

  function Run
    input Integer scenario;
    input Integer colorChannels = 4;
    input Real depthUnits = 1.0;
    output Boolean checks[checkCount]; output Real metrics[28];
  protected
    Real rgb[imageHeight,imageWidth,colorChannels]; Real depth[imageHeight,imageWidth];
    Real P[15,15]; Real cross[15,6]; Real referenceP[6,6];
    Real oldDescriptor[featureCapacity,descriptorSize]; Real oldPoint[featureCapacity,3];
    Real oldEnabled[featureCapacity]; Real oldPixels[featureCapacity,2];
    Real expectedDescriptor[featureCapacity,descriptorSize]; Real expectedPoint[featureCapacity,3];
    Real expectedEnabled[featureCapacity]; Real expectedFeatures[featureCapacity,3];
    Real expectedMap[featureCapacity,3]; Real expectedPixels[featureCapacity,2];
    Real expectedCross[15,6]; Real expectedReferenceP[6,6]; Real quaternionRotation[3,3];
    Real nominal[4]; Boolean imageOn; Boolean capture;
    Real actual_nextPosition[3];
    Real actual_nextVelocity[3];
    Real actual_nextRotation[3,3];
    Real actual_nextAccelBias[3];
    Real actual_nextGyroBias[3];
    Real actual_nextCovariance[15,15];
    Real actual_nextCrossCovariance[15,6];
    Real actual_nextReferenceCovariance[6,6];
    Real actual_nextReferencePosition[3];
    Real actual_nextReferenceRotation[3,3];
    Real actual_nextReferenceAvailable;
    Real actual_nextReferenceEpoch;
    Real actual_nextReferenceUsed;
    Real actual_nextLastUsedEpoch;
    Real actual_nextReferenceDescriptor[featureCapacity,descriptorSize];
    Real actual_nextReferencePoint[featureCapacity,3];
    Real actual_nextReferenceEnabled[featureCapacity];
    Real actual_nextReferencePixels[featureCapacity,2];
    Real actual_nextReferenceCount;
    Real actual_nextReferenceRgbCalibration[4];
    Real actual_nextReferenceDepthCalibration[4];
    Real actual_nextReferenceNoiseReferenceFx;
    Real actual_nextReferenceDisparityNoise;
    Real actual_nextReferenceBaseline;
    Real actual_nextReferenceOpticalToBody[3,3];
    Real actual_nextReferenceCameraOriginBody[3];
    Real actual_predictionAccepted;
    Real actual_observationAccepted;
    Real actual_observationRejected;
    Real actual_captureAccepted;
    Real actual_captureRejected;
    Real actual_imageReuseRejected;
    Real actual_imagePairEligible;
    Real actual_frameValid;
    Real actual_referenceGeometryCompatible;
    Real actual_visualValid;
    Real actual_matchCount;
    Real actual_uncertaintyRejectionReason;
    Real actual_currentDescriptor[featureCapacity,descriptorSize];
    Real actual_currentPoint[featureCapacity,3];
    Real actual_currentEnabled[featureCapacity];
    Real actual_currentCount;
    Real actual_currentFromReference[3,3];
    Real actual_currentFromReferenceTranslation[3];
    Real actual_relativeCovariance[6,6];
    Real actual_mapCandidatePoint[featureCapacity,3];
    Real actual_mapCandidateEnabled[featureCapacity];
    Real actual_mapCandidateCount;
    Real actual_nextQuaternion[4];
    Real actual_positionCovariance[3,3];
    Real actual_attitudeCovariance[3,3];
    Real actual_confidence;
    Real actual_features[featureCapacity,3];
    Real actual_featureEnabled[featureCapacity];
    Real actual_trackingCurrentPixel[featureCapacity,2];
    Real actual_trackingReferencePixel[featureCapacity,2];
    Real actual_trackingEnabled[featureCapacity];
    Real actual_initializationAccepted;
    Real actual_initializationRejected;
    Real actual_selectionValid;
  algorithm
    assert(scenario >= 1 and scenario <= 3,"Exactly three dynamic native-grid scenarios");
    imageOn := scenario <> 2; capture := scenario == 1;
    for row in 1:imageHeight loop
      for column in 1:imageWidth loop
        for channel in 1:3 loop
          rgb[row,column,channel] := if imageOn then 0.0 else 1e101;
        end for;
        if colorChannels == 4 then
          rgb[row,column,4] := -1e101; // Historical alpha must remain opaque to grayscale.
        end if;
        depth[row,column] := if imageOn then
          (if depthUnits == 1.0 then 2+0.001*(column-1)+0.002*(row-1)
           else (2000+(column-1)+2*(row-1))*(0.001/depthUnits)) else -1e101;
      end for;
    end for;
    if imageOn then
      for feature in 1:3 loop
        for channel in 1:3 loop
          rgb[integer(pixels[feature,2])+1,integer(pixels[feature,1])+1,channel] := 255;
        end for;
      end for;
    end if;
    P := RGBDLocalizationInitializeTests.Covariance();
    cross := RGBDLocalizationInitializeTests.PriorCross(P);
    referenceP := RGBDLocalizationInitializeTests.PriorReference(P);
    oldDescriptor := RGBDLocalizationInitializeTests.OldDescriptors();
    oldPoint := RGBDLocalizationInitializeTests.OldPoints();
    oldEnabled := RGBDLocalizationInitializeTests.OldEnabled();
    oldPixels := RGBDLocalizationInitializeTests.Pixels();
    (actual_nextPosition,
      actual_nextVelocity,
      actual_nextRotation,
      actual_nextAccelBias,
      actual_nextGyroBias,
      actual_nextCovariance,
      actual_nextCrossCovariance,
      actual_nextReferenceCovariance,
      actual_nextReferencePosition,
      actual_nextReferenceRotation,
      actual_nextReferenceAvailable,
      actual_nextReferenceEpoch,
      actual_nextReferenceUsed,
      actual_nextLastUsedEpoch,
      actual_nextReferenceDescriptor,
      actual_nextReferencePoint,
      actual_nextReferenceEnabled,
      actual_nextReferencePixels,
      actual_nextReferenceCount,
      actual_nextReferenceRgbCalibration,
      actual_nextReferenceDepthCalibration,
      actual_nextReferenceNoiseReferenceFx,
      actual_nextReferenceDisparityNoise,
      actual_nextReferenceBaseline,
      actual_nextReferenceOpticalToBody,
      actual_nextReferenceCameraOriginBody,
      actual_predictionAccepted,
      actual_observationAccepted,
      actual_observationRejected,
      actual_captureAccepted,
      actual_captureRejected,
      actual_imageReuseRejected,
      actual_imagePairEligible,
      actual_frameValid,
      actual_referenceGeometryCompatible,
      actual_visualValid,
      actual_matchCount,
      actual_uncertaintyRejectionReason,
      actual_currentDescriptor,
      actual_currentPoint,
      actual_currentEnabled,
      actual_currentCount,
      actual_currentFromReference,
      actual_currentFromReferenceTranslation,
      actual_relativeCovariance,
      actual_mapCandidatePoint,
      actual_mapCandidateEnabled,
      actual_mapCandidateCount,
      actual_nextQuaternion,
      actual_positionCovariance,
      actual_attitudeCovariance,
      actual_confidence,
      actual_features,
      actual_featureEnabled,
      actual_trackingCurrentPixel,
      actual_trackingReferencePixel,
      actual_trackingEnabled,
      actual_initializationAccepted,
      actual_initializationRejected,
      actual_selectionValid) := InitializeFastRGBDLocalization(
      rgb=rgb,depth=depth,depthUnits=depthUnits,rgbCalibration=rgbCalibration,depthCalibration=depthCalibration,
      disparityNoise=0.08,noiseReferenceFx=440,baseline=0.05,
      opticalToBody=RGBDLocalizationInitializeTests.opticalToBody,cameraOriginBody=RGBDLocalizationInitializeTests.origin,
      frameEnabled=if imageOn then 1 else 0,imageCaptureRequested=if scenario == 3 then 0 else 1,
      position=RGBDLocalizationInitializeTests.position,velocity=RGBDLocalizationInitializeTests.velocity,
      rotation=RGBDLocalizationInitializeTests.rotation,accelBias=RGBDLocalizationInitializeTests.accelBias,
      gyroBias=RGBDLocalizationInitializeTests.gyroBias,covariance=P,crossCovariance=cross,referenceCovariance=referenceP,
      referencePosition={-0.2,0.3,0.5},referenceRotation=identity(3),referenceAvailable=1,referenceEpoch=1,currentEpoch=2,
      referenceUsed=0,lastUsedEpoch=0,referenceDescriptor=oldDescriptor,referencePoint=oldPoint,
      referenceEnabled=oldEnabled,referencePixels=oldPixels,referenceCount=350,
      referenceRgbCalibration={115,106,79,44},referenceDepthCalibration={83,75,79,44},
      referenceNoiseReferenceFx=490,referenceDisparityNoise=0.07,referenceBaseline=0.06,
      referenceOpticalToBody=identity(3),referenceCameraOriginBody={0.1,0,0},
      accel={1e5,-2e5,3e5},gyro={9e4,-8e4,7e4},gravity={0,0,-9.81},h=0.75,density=fill(0.01,12),
      imageTime=0,initializationRequested=1,selectedFeatureLimit=350,absoluteThreshold=18);
    expectedDescriptor := zeros(featureCapacity,descriptorSize); expectedPoint := zeros(featureCapacity,3);
    expectedEnabled := zeros(featureCapacity); expectedFeatures := zeros(featureCapacity,3);
    expectedMap := zeros(featureCapacity,3); expectedPixels := zeros(featureCapacity,2);
    if imageOn then
      for feature in 1:3 loop
        expectedEnabled[feature] := 1;
        for coordinate in 1:2 loop
          expectedPixels[feature,coordinate] := pixels[feature,coordinate];
        end for;
        expectedFeatures[feature,:] := {pixels[feature,1],pixels[feature,2],255};
        expectedPoint[feature,:] := OpticalPoint({pixels[feature,1],pixels[feature,2]});
        for cell in 1:descriptorSize loop
          expectedDescriptor[feature,cell] := if cell == 25 then sqrt(48.0)/7 else -1/(7*sqrt(48.0));
        end for;
        if capture then
          expectedMap[feature,:] := RGBDLocalizationInitializeTests.position
            +RGBDLocalizationInitializeTests.rotation*(RGBDLocalizationInitializeTests.opticalToBody
              *expectedPoint[feature,:]+RGBDLocalizationInitializeTests.origin);
        end if;
      end for;
    end if;
    expectedCross := cross; expectedReferenceP := referenceP;
    if capture then
      for row in 1:15 loop
        for column in 1:6 loop expectedCross[row,column] := P[row,poseColumns[column]]; end for;
      end for;
      for row in 1:6 loop
        for column in 1:6 loop expectedReferenceP[row,column] := P[poseColumns[row],poseColumns[column]]; end for;
      end for;
    end if;
    quaternionRotation := [1-2*(actual_nextQuaternion[3]^2+actual_nextQuaternion[4]^2),
      2*(actual_nextQuaternion[2]*actual_nextQuaternion[3]-actual_nextQuaternion[1]*actual_nextQuaternion[4]),
      2*(actual_nextQuaternion[2]*actual_nextQuaternion[4]+actual_nextQuaternion[1]*actual_nextQuaternion[3]);
      2*(actual_nextQuaternion[2]*actual_nextQuaternion[3]+actual_nextQuaternion[1]*actual_nextQuaternion[4]),
      1-2*(actual_nextQuaternion[2]^2+actual_nextQuaternion[4]^2),
      2*(actual_nextQuaternion[3]*actual_nextQuaternion[4]-actual_nextQuaternion[1]*actual_nextQuaternion[2]);
      2*(actual_nextQuaternion[2]*actual_nextQuaternion[4]-actual_nextQuaternion[1]*actual_nextQuaternion[3]),
      2*(actual_nextQuaternion[3]*actual_nextQuaternion[4]+actual_nextQuaternion[1]*actual_nextQuaternion[2]),
      1-2*(actual_nextQuaternion[2]^2+actual_nextQuaternion[3]^2)];
    checks[1] := actual_initializationAccepted == 1 and actual_initializationRejected == 0;
    checks[2] := actual_selectionValid == 1;
    checks[3] := actual_currentCount == (if imageOn then 3 else 0);
    checks[4] := actual_frameValid == (if imageOn then 1 else 0);
    checks[5] := actual_captureAccepted == (if capture then 1 else 0) and actual_captureRejected == 0;
    checks[6] := actual_predictionAccepted == 0 and actual_observationAccepted == 0
      and actual_observationRejected == 0 and actual_visualValid == 0 and actual_confidence == 0;
    checks[7] := RGBDLocalizationInitializeTests.CloseVector(actual_nextPosition,RGBDLocalizationInitializeTests.position,1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(actual_nextVelocity,RGBDLocalizationInitializeTests.velocity,1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual_nextRotation,RGBDLocalizationInitializeTests.rotation,1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(actual_nextAccelBias,RGBDLocalizationInitializeTests.accelBias,1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(actual_nextGyroBias,RGBDLocalizationInitializeTests.gyroBias,1e-12);
    checks[8] := RGBDLocalizationInitializeTests.CloseMatrix(actual_nextCovariance,P,1e-12);
    checks[9] := RGBDLocalizationInitializeTests.CloseMatrix(actual_nextCrossCovariance,expectedCross,1e-12);
    checks[10] := RGBDLocalizationInitializeTests.CloseMatrix(actual_nextReferenceCovariance,expectedReferenceP,1e-12);
    checks[11] := RGBDLocalizationInitializeTests.CloseVector(actual_nextReferencePosition,
      if capture then RGBDLocalizationInitializeTests.position else {-0.2,0.3,0.5},1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual_nextReferenceRotation,
        if capture then RGBDLocalizationInitializeTests.rotation else identity(3),1e-12);
    checks[12] := actual_nextReferenceAvailable == 1 and actual_nextReferenceEpoch == (if capture then 2 else 1)
      and actual_nextReferenceUsed == 0 and actual_nextLastUsedEpoch == 0;
    checks[13] := RGBDLocalizationInitializeTests.CloseMatrix(actual_currentDescriptor,expectedDescriptor,1e-10)
      and RGBDLocalizationInitializeTests.CloseVector(actual_currentEnabled,expectedEnabled,1e-12);
    checks[14] := RGBDLocalizationInitializeTests.CloseMatrix(actual_currentPoint,expectedPoint,1e-10);
    checks[15] := RGBDLocalizationInitializeTests.CloseMatrix(actual_features,expectedFeatures,1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(actual_featureEnabled,expectedEnabled,1e-12);
    checks[16] := RGBDLocalizationInitializeTests.CloseMatrix(actual_mapCandidatePoint,expectedMap,1e-10)
      and RGBDLocalizationInitializeTests.CloseVector(actual_mapCandidateEnabled,
        if capture then expectedEnabled else zeros(featureCapacity),1e-12)
      and actual_mapCandidateCount == (if capture then 3 else 0);
    checks[17] := RGBDLocalizationInitializeTests.CloseMatrix(actual_nextReferenceDescriptor,
      if capture then expectedDescriptor else oldDescriptor,1e-10)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual_nextReferencePoint,
        if capture then expectedPoint else oldPoint,1e-10)
      and RGBDLocalizationInitializeTests.CloseVector(actual_nextReferenceEnabled,
        if capture then expectedEnabled else oldEnabled,1e-12);
    checks[18] := RGBDLocalizationInitializeTests.CloseMatrix(actual_nextReferencePixels,
      if capture then expectedPixels else oldPixels,1e-12)
      and actual_nextReferenceCount == (if capture then 3 else 350);
    checks[19] := RGBDLocalizationInitializeTests.CloseVector(actual_nextReferenceRgbCalibration,
      if capture then rgbCalibration else {115,106,79,44},1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(actual_nextReferenceDepthCalibration,
        if capture then depthCalibration else {83,75,79,44},1e-12)
      and actual_nextReferenceNoiseReferenceFx == (if capture then 440 else 490)
      and actual_nextReferenceDisparityNoise == (if capture then 0.08 else 0.07)
      and actual_nextReferenceBaseline == (if capture then 0.05 else 0.06)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual_nextReferenceOpticalToBody,
        if capture then RGBDLocalizationInitializeTests.opticalToBody else identity(3),1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(actual_nextReferenceCameraOriginBody,
        if capture then RGBDLocalizationInitializeTests.origin else {0.1,0,0},1e-12);
    checks[20] := RGBDLocalizationInitializeTests.CloseMatrix(quaternionRotation,RGBDLocalizationInitializeTests.rotation,1e-10)
      and abs(sum(actual_nextQuaternion.^2)-1) < 1e-12;
    checks[21] := RGBDLocalizationInitializeTests.ZeroVector(actual_trackingEnabled,1e-12)
      and RGBDLocalizationInitializeTests.ZeroMatrix(actual_trackingCurrentPixel,1e-12)
      and RGBDLocalizationInitializeTests.ZeroMatrix(actual_trackingReferencePixel,1e-12)
      and RGBDLocalizationInitializeTests.ZeroMatrix(actual_relativeCovariance,1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual_currentFromReference,identity(3),1e-12)
      and RGBDLocalizationInitializeTests.ZeroVector(actual_currentFromReferenceTranslation,1e-12)
      and actual_matchCount == 0 and actual_uncertaintyRejectionReason == 0
      and actual_imagePairEligible == 0 and actual_imageReuseRejected == 0;
    checks[22] := (not imageOn) or (actual_features[3,1] == 844 and actual_features[3,2] == 476
      and actual_currentEnabled[3] == 1 and actual_currentPoint[3,3] > 3);
    checks[23] := RGBDLocalizationInitializeTests.CloseMatrix(actual_positionCovariance,P[1:3,1:3],1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual_attitudeCovariance,P[7:9,7:9],1e-12);
    nominal := RGBDNominalCalibration({imageHeight,imageWidth},{90.0,90.0});
    checks[24] := RGBDLocalizationInitializeTests.CloseVector(nominal,{424,240,423.5,239.5},1e-10);
    metrics := cat(1,{actual_currentCount,sum(actual_currentEnabled),actual_captureAccepted,actual_frameValid,
      actual_features[3,1],actual_features[3,2],actual_currentPoint[3,1],actual_currentPoint[3,2],
      actual_currentPoint[3,3],actual_mapCandidateCount,actual_nextReferenceCount,actual_selectionValid},
      rgbCalibration,depthCalibration,actual_nextReferenceRgbCalibration,actual_nextReferenceDepthCalibration);
  end Run;
end RGBDNativeInitializationTests;

model RGBDNativeInitializationAcceptance
  output Integer scenario; output Boolean checks[RGBDNativeInitializationTests.checkCount];
  output Real metrics[28];
equation
  scenario = min(3,1+integer(time));
  (checks,metrics) = RGBDNativeInitializationTests.Run(scenario);
end RGBDNativeInitializationAcceptance;

// Same independent geometric/covariance oracle, with actual RGB3 and integer
// millimeter codes. There is no metric image conversion before the algorithm.
model RGBDRawNativeInitializationAcceptance
  output Integer scenario; output Boolean checks[RGBDNativeInitializationTests.checkCount];
  output Real metrics[28];
equation
  scenario = min(3,1+integer(time));
  (checks,metrics) = RGBDNativeInitializationTests.Run(scenario,3,0.001);
end RGBDRawNativeInitializationAcceptance;
