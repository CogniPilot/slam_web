// Full raw FAST trajectory and selection-to-qualified-core composition gate.
// Core filter equality depends on the separately qualified Advance function;
// FAST, selection, measured optical geometry and descriptors have own oracles.
package RGBDFastAdvanceReference
  constant Integer imageHeight=90; constant Integer imageWidth=160;
  constant Integer featureCapacity=350; constant Integer descriptorSize=49;
  constant Integer cx[3]={36,79,121}; constant Integer cy[3]={22,45,67};
  constant Integer shift[3]={3,2,1}; constant Real z[3]={2.4,3.6,7.2};
  function Image
    input Boolean current;
    input Integer colorChannels = 4; input Real depthUnits = 1.0;
    output Real rgb[90,160,colorChannels]; output Real depth[90,160]; output Real pixels[350,2];
  protected Integer center; Integer loX; Integer hiX; Integer loY; Integer hiY;
  algorithm
    rgb := fill(128,90,160,colorChannels); depth := zeros(90,160); pixels := zeros(350,2);
    if colorChannels == 4 then
      for row in 1:90 loop for column in 1:160 loop rgb[row,column,4] := 255; end for; end for;
    end if;
    for patch in 1:3 loop
      center := cx[patch]+(if current then shift[patch] else 0);
      for row in -10:10 loop
        for column in -13:13 loop
          for channel in 1:3 loop
            rgb[cy[patch]+row+1,center+column+1,channel] := mod(37*(column+13)+53*(row+10)
              +7*(column+13)*(row+10)+11*channel+17*patch,256);
          end for;
        end for;
      end for;
      // Wide frontoparallel depth support covers every FAST/description border
      // sample, with independent depth optics and no reduced image dimensions.
      loX := integer(floor((center-17-80)*80.0/120+79)); hiX := integer(ceil((center+17-80)*80.0/120+79))+1;
      loY := integer(floor((cy[patch]-14-45)*90.0/120+44)); hiY := integer(ceil((cy[patch]+14-45)*90.0/120+44))+1;
      for row in loY:hiY loop
        for column in loX:hiX loop
          assert(depth[row+1,column+1] == 0,"Independent measured depth patches do not overlap");
          depth[row+1,column+1] := if depthUnits == 1.0 then z[patch] else floor(z[patch]/depthUnits+0.5);
        end for;
      end for;
    end for;
  end Image;

  function Call
    input RGBDLocalizationAdvanceReference.Input x; input Real limit; input Real threshold;
    output RGBDLocalizationAdvanceReference.Output y; output Real selectionValid;
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
      trackingEnabled,
      selectionValid) := AdvanceFastRGBDLocalization(
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
      selectedFeatureLimit=limit,absoluteThreshold=threshold);
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
    input Integer scenario; output RGBDLocalizationAdvanceReference.Input x; output Boolean initialized;
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
    Real seed_selectionValid;
  algorithm
    (raw,depth,pixel) := Image(false);
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
      seed_initializationRejected,seed_selectionValid) := InitializeFastRGBDLocalization(
      rgb=raw,depth=depth,selectedFeatureLimit=350,absoluteThreshold=18,
      rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
      disparityNoise=0.08,noiseReferenceFx=500,baseline=0.05,opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
      frameEnabled=1,imageCaptureRequested=1,position={1,-2,0.5},velocity={-0.29,0.01,0.01},rotation=[0,-1,0;1,0,0;0,0,1],
      accelBias=zeros(3),gyroBias=zeros(3),covariance=P,crossCovariance=zeros(15,6),referenceCovariance=zeros(6,6),
      referencePosition=zeros(3),referenceRotation=identity(3),referenceAvailable=0,referenceEpoch=0,currentEpoch=1,
      referenceUsed=0,lastUsedEpoch=-1,referenceDescriptor=zeros(350,49),referencePoint=zeros(350,3),referenceEnabled=zeros(350),
      referencePixels=zeros(350,2),referenceCount=0,referenceRgbCalibration=RGBDVisualRelativeReference.referenceRgb,
      referenceDepthCalibration=RGBDVisualRelativeReference.referenceDepth,referenceNoiseReferenceFx=500,referenceDisparityNoise=0.08,
      referenceBaseline=0.05,referenceOpticalToBody=[0,0,1;-1,0,0;0,-1,0],referenceCameraOriginBody={0.18,-0.09,0.07},
      accel=zeros(3),gyro=zeros(3),gravity=zeros(3),h=0.2,density=fill(0.01,12),imageTime=0,initializationRequested=1);
    initialized := seed_initializationAccepted == 1 and seed_captureAccepted == 1 and seed_nextReferenceCount >= 3 and seed_selectionValid == 1;
    (raw,depth,pixel) := Image(true);
    x.rgb := raw; x.depth := depth; x.pixels := pixel; x.activeCount := 350; x.featureScore := fill(9,350);
    x.rgbCalibration := RGBDVisualRelativeReference.referenceRgb; x.depthCalibration := RGBDVisualRelativeReference.referenceDepth;
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
    x.currentEpoch := 2; x.accel := zeros(3); x.gyro := zeros(3);
    x.gravity := zeros(3); x.h := 0.2; x.density := fill(0.01,12);
    if scenario == 2 then
      x.frameEnabled := 0; x.h := 1.0/90;
      x.rgb := fill(1e101,90,160,4); x.depth := fill(-1e101,90,160);
    elseif scenario == 11 then
      for row in 1:90 loop for column in 1:160 loop x.rgb[row,column,4] := 1e101; end for; end for;
    elseif scenario == 12 then x.h := 0;
    elseif scenario == 13 then x.referenceUsed := 1; x.lastUsedEpoch := 2;
    elseif scenario == 14 then x.imageCaptureRequested := 0;
    end if;
  end At;

  function Front
    input RGBDLocalizationAdvanceReference.Input x; input Real selected[14400,3]; input Integer count;
    output Real descriptor[350,49]; output Real point[350,3]; output Real enabled[350];
  protected
    Integer lowerX; Integer lowerY; Integer pixelX; Integer pixelY; Integer index;
    Real mappedX; Real mappedY; Real depth; Real values[49]; Real mean; Real energy;
    Boolean usable;
  algorithm
    descriptor := zeros(350,49); point := zeros(350,3); enabled := zeros(350);
    for feature in 1:count loop
      pixelX := integer(selected[feature,1]); pixelY := integer(selected[feature,2]);
      mappedX := (pixelX-80)*80.0/120+79; mappedY := (pixelY-45)*90.0/120+44;
      lowerX := integer(floor(mappedX)); lowerY := integer(floor(mappedY));
      depth := x.depth[lowerY+1,lowerX+1];
      usable := depth > 0 and depth == x.depth[lowerY+2,lowerX+1]
        and depth == x.depth[lowerY+1,lowerX+2] and depth == x.depth[lowerY+2,lowerX+2];
      mean := 0;
      for row in 0:6 loop
        for column in 0:6 loop
          index := row*7+column+1;
          values[index] := (x.rgb[pixelY+row-2,pixelX+column-2,1]+x.rgb[pixelY+row-2,pixelX+column-2,2]
            +x.rgb[pixelY+row-2,pixelX+column-2,3])/3; mean := mean+values[index];
        end for;
      end for;
      mean := mean/49; energy := 0;
      for index0 in 1:49 loop energy := energy+(values[index0]-mean)^2; end for;
      if usable and energy > 49*(255e-6)^2 then
        enabled[feature] := 1;
        point[feature,:] := {(pixelX-80)*depth/120,(pixelY-45)*depth/120,depth};
        for index0 in 1:49 loop descriptor[feature,index0] := (values[index0]-mean)/sqrt(energy); end for;
      end if;
    end for;
  end Front;

  function Checks
    input Integer scenario; output Boolean checks[64];
  protected
    RGBDLocalizationAdvanceReference.Input x; RGBDLocalizationAdvanceReference.Input core;
    RGBDLocalizationAdvanceReference.Output actual; RGBDLocalizationAdvanceReference.Output expected;
    RGBDLocalizationAdvanceReference.Prediction predicted;
    Real limit; Real threshold; Real selectionValid; Real scores[14400]; Real selected[14400,3];
    Real descriptor[350,49]; Real point[350,3]; Real enabled[350]; Real referenceRGB[90,160,4];
    Real referenceDepth[90,160]; Real unusedPixels[350,2]; Real seedSelected[14400,3];
    Integer count; Integer seedCount; Boolean valid; Boolean seedValid; Boolean seeded; Boolean parity[57];
  algorithm
    (x,seeded) := At(scenario);
    limit := if scenario == 4 then 0 else if scenario == 5 then 351 else if scenario == 6 then 3
      else if scenario == 7 then 1 else 350;
    threshold := if scenario == 8 then -1 else if scenario == 9 then 256 else if scenario == 10 then 255 else 18;
    (actual,selectionValid) := Call(x,limit,threshold);
    scores := if x.frameEnabled == 1 then RGBDFastInitializationReference.Scores(x.rgb) else zeros(14400);
    (selected,count,valid) := RGBDFastInitializationReference.Select(scores,limit,threshold,x.frameEnabled == 1);
    core := x; core.pixels := selected[1:350,1:2]; core.activeCount := count; core.featureScore := selected[1:350,3];
    expected := RGBDLocalizationAdvanceReference.Call(core);
    parity := RGBDLocalizationAdvanceReference.Compare(actual,expected);
    for check in 1:57 loop checks[check] := parity[check]; end for;
    checks[58] := selectionValid == (if valid then 1 else 0);
    (referenceRGB,referenceDepth,unusedPixels) := Image(false);
    scores := RGBDFastInitializationReference.Scores(referenceRGB);
    (seedSelected,seedCount,seedValid) := RGBDFastInitializationReference.Select(scores,350,18,true);
    checks[59] := seeded and seedValid and seedCount >= 3 and x.referenceCount == seedCount
      and RGBDLocalizationInitializeTests.CloseMatrix(x.referencePixels,seedSelected[1:350,1:2],1e-12);
    (descriptor,point,enabled) := Front(x,selected,count);
    checks[60] := RGBDLocalizationInitializeTests.CloseMatrix(actual.currentDescriptor,descriptor,1e-10)
      and RGBDLocalizationInitializeTests.CloseMatrix(actual.currentPoint,point,1e-10)
      and RGBDLocalizationInitializeTests.CloseVector(actual.currentEnabled,enabled,1e-12);
    checks[61] := if scenario == 1 or scenario == 3 or scenario == 11 or scenario == 14 then actual.visualValid == 1
      and actual.observationAccepted == 1 and actual.matchCount >= 3 else true;
    checks[62] := if scenario == 1 or scenario == 3 or scenario == 11 or scenario == 14 then
      RGBDLocalizationInitializeTests.CloseMatrix(actual.currentFromReference,identity(3),1e-8)
      and RGBDLocalizationInitializeTests.CloseVector(actual.currentFromReferenceTranslation,{0.06,0,0},1e-8) else true;
    predicted := RGBDLocalizationAdvanceReference.Predict(x);
    checks[63] := if scenario == 1 then max(abs(actual.nextCovariance-predicted.P)) > 1e-9
      and max(abs(actual.nextPosition-predicted.p)) > 1e-7 and actual.nextReferenceUsed == 1
      and actual.nextLastUsedEpoch == 2 and actual.captureAccepted == 0 else true;
    checks[64] := if scenario == 13 then actual.imageReuseRejected == 1 and actual.observationAccepted == 0
      else if scenario == 12 then actual.predictionAccepted == 0
        and RGBDLocalizationInitializeTests.CloseMatrix(actual.nextCovariance,x.covariance,1e-12) else true;
  end Checks;
end RGBDFastAdvanceReference;

model RGBDFastAdvanceFunctionAcceptance
  output Integer scenario; output Boolean checks[64];
equation
  scenario = min(14,1+integer(time));
  checks = RGBDFastAdvanceReference.Checks(scenario);
end RGBDFastAdvanceFunctionAcceptance;
