// Independent numerical oracle: no production FAST, selection, descriptor,
// calibrated-point, projection or covariance function supplies expected values.
package RGBDFastInitializationReference
  function Scores
    input Real rgb[90,160,4]; output Real scores[14400];
  protected
    constant Integer dy[16]={-3,-3,-2,-1,0,1,2,3,3,3,2,1,0,-1,-2,-3};
    constant Integer dx[16]={0,1,2,3,3,3,2,1,0,-1,-2,-3,-3,-3,-2,-1};
    Real gray[90,160]; Real center; Real bright; Real dark; Real difference; Integer circle;
  algorithm
    scores := zeros(14400);
    for y in 1:90 loop
      for x in 1:160 loop gray[y,x] := ((rgb[y,x,1]+rgb[y,x,2])+rgb[y,x,3])/3; end for;
    end for;
    for y in 4:87 loop
      for x in 4:157 loop
        center := gray[y,x];
        // Exhaust each nine-sample circular arc, unlike production doubling windows.
        for start in 1:16 loop
          bright := 255; dark := 255;
          for sample in 0:8 loop
            circle := mod(start+sample-1,16)+1;
            difference := gray[y+dy[circle],x+dx[circle]]-center;
            bright := min(bright,difference); dark := min(dark,-difference);
          end for;
          scores[(y-1)*160+x] := max(scores[(y-1)*160+x],max(bright,dark));
        end for;
      end for;
    end for;
  end Scores;

  function Select
    input Real scores[14400]; input Real cap; input Real threshold; input Boolean enabled;
    output Real features[14400,3]; output Integer count; output Boolean valid;
  protected
    Integer order[14400]; Integer scratch[14400]; Real rank[14400]; Boolean occupied[14400];
    Integer n; Integer width; Integer base; Integer left; Integer right; Integer middle;
    Integer finish; Integer cursor; Integer index; Integer x; Integer y;
    Real scaled; Real low; Real fraction; Boolean active; Boolean takeLeft;
  algorithm
    features := zeros(14400,3); count := 0;
    valid := cap >= 1 and cap <= 350 and cap == floor(cap) and threshold >= 0 and threshold <= 255;
    order := fill(0,14400); scratch := fill(0,14400); rank := zeros(14400);
    occupied := fill(false,14400); n := 0;
    if valid and enabled then
      for yy in 3:86 loop
        for xx in 3:156 loop
          index := yy*160+xx+1; scaled := scores[index]*1e8;
          low := floor(scaled); fraction := scaled-low;
          rank[index] := if fraction < 0.5 then low else if fraction > 0.5 then low+1
            else if mod(low,2.0) == 0 then low else low+1;
          if rank[index] >= floor(threshold*1e8)-1 then n := n+1; order[n] := index; end if;
        end for;
      end for;
      // Independent stable merge sort; production uses a heap/reverse traversal.
      width := 1;
      while width < n loop
        base := 1;
        while base <= n loop
          middle := min(base+width,n+1); finish := min(base+2*width,n+1);
          left := base; right := middle; cursor := base;
          while cursor < finish loop
            takeLeft := if left >= middle then false else if right >= finish then true
              else rank[order[left]] >= rank[order[right]];
            if takeLeft then scratch[cursor] := order[left]; left := left+1;
            else scratch[cursor] := order[right]; right := right+1; end if;
            cursor := cursor+1;
          end while;
          base := base+2*width;
        end while;
        for i in 1:n loop order[i] := scratch[i]; end for;
        width := 2*width;
      end while;
      active := true;
      for candidate in 1:n loop
        index := order[candidate];
        // Raw threshold is checked BEFORE occupancy, including occupied entries.
        if scores[index] < threshold then active := false; end if;
        if active and count < cap and not occupied[index] then
          count := count+1; x := mod(index-1,160); y := div(index-1,160);
          features[count,:] := {x,y,scores[index]};
          for yy in max(3,y-3):min(86,y+3) loop
            for xx in max(3,x-3):min(156,x+3) loop occupied[yy*160+xx+1] := true; end for;
          end for;
        end if;
      end for;
    end if;
  end Select;

  function Descriptor
    input Real rgb[90,160,4]; input Real pixel[2]; output Real descriptor[49];
  protected
    Integer x; Integer y; Integer k; Real patch[49]; Real mean; Real length;
  algorithm
    x := integer(pixel[1]); y := integer(pixel[2]); mean := 0; length := 0;
    for row in 0:6 loop
      for col in 0:6 loop
        k := row*7+col+1;
        patch[k] := ((rgb[y+row-2,x+col-2,1]+rgb[y+row-2,x+col-2,2])+rgb[y+row-2,x+col-2,3])/3;
        mean := mean+patch[k];
      end for;
    end for;
    mean := mean/49;
    for k0 in 1:49 loop length := length+(patch[k0]-mean)^2; end for;
    for k0 in 1:49 loop descriptor[k0] := (patch[k0]-mean)/sqrt(length); end for;
  end Descriptor;

  function Point
    input Real pixel[2]; output Real point[3];
  protected
    Real mapped[2]; Real fraction[2]; Real z[4]; Real inverse; Integer lower[2];
  algorithm
    for axis in 1:2 loop
      mapped[axis] := (pixel[axis]-RGBDLocalizationInitializeTests.rgbCalibration[axis+2])
        *RGBDLocalizationInitializeTests.depthCalibration[axis]/RGBDLocalizationInitializeTests.rgbCalibration[axis]
        +RGBDLocalizationInitializeTests.depthCalibration[axis+2];
      lower[axis] := integer(floor(mapped[axis])); fraction[axis] := mapped[axis]-lower[axis];
    end for;
    z := {2.5+0.004*lower[1]+0.008*lower[2],2.5+0.004*(lower[1]+1)+0.008*lower[2],
      2.5+0.004*lower[1]+0.008*(lower[2]+1),2.5+0.004*(lower[1]+1)+0.008*(lower[2]+1)};
    inverse := (1-fraction[1])*(1-fraction[2])/z[1]+fraction[1]*(1-fraction[2])/z[2]
      +(1-fraction[1])*fraction[2]/z[3]+fraction[1]*fraction[2]/z[4];
    point := {(pixel[1]-79.5)/116.4/inverse,(pixel[2]-44.5)/105.2/inverse,1/inverse};
  end Point;
end RGBDFastInitializationReference;

// Case1 acquisition;2 disabled;3 re-enabled changed texture;4 fractional flag;
//5..7 invalid caps;8 cap3;9 cap1;10..11 invalid thresholds;12 threshold255;
//13 threshold0;14 no capture;15 nonzero time;16 request0;17 requestfractional;
//18 alpha poison;19 invalid depth;20 stale epoch;21 invalid P;22 cold clone.
function RGBDFastInitializationFunctionChecks
  input Integer scenario;
  output Boolean checks[24];
protected
  constant Integer imageHeight=90; constant Integer imageWidth=160;
  constant Integer featureCapacity=350; constant Integer descriptorSize=49;
  Real rgb[90,160,4]; Real depth[90,160]; Real scores[14400]; Real selected[14400,3];
  Real expectedDescriptor[350,49]; Real expectedPoint[350,3]; Real expectedEnabled[350];
  Real expectedFeatures[350,3]; Real expectedMap[350,3]; Real quaternionRotation[3,3];
  Real covarianceInput[15,15]; Real crossInput[15,6]; Real referenceInput[6,6];
  Real oldDescriptor[350,49]; Real oldPoint[350,3]; Real oldEnabled[350]; Real pixels[350,2];
  Real cap; Real threshold; Real frame; Real request; Real imageTime; Real capture;
  Real availableInput; Real epochInput; Real oldEpochInput; Real lastUsedInput;
  Integer count; Integer phase; Boolean selectionValid; Boolean expectedInitialization; Boolean frameValid;
  Boolean expectedCapture; Boolean front; Boolean held; Boolean cloneOracle; Boolean snapshotOracle;
  Boolean frontOracle; Boolean geometryOracle; Boolean suppressed;
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
  Real initialized_selectionValid;
algorithm
  phase := if scenario == 3 then 17 else 0;
  for y in 1:90 loop
    for x in 1:160 loop
      for channel in 1:4 loop
        rgb[y,x,channel] := if channel == 4 then (if scenario == 18 then 1e101 else 255)
          else mod(37*(x-1)+53*(y-1)+7*(x-1)*(y-1)+11*channel+phase,256);
      end for;
      depth[y,x] := if scenario == 19 then 0 else 2.5+0.004*(x-1)+0.008*(y-1);
    end for;
  end for;
  covarianceInput := RGBDLocalizationInitializeTests.Covariance();
  crossInput := if scenario == 22 then zeros(15,6) else RGBDLocalizationInitializeTests.PriorCross(covarianceInput);
  referenceInput := if scenario == 22 then zeros(6,6) else RGBDLocalizationInitializeTests.PriorReference(covarianceInput);
  if scenario == 21 then covarianceInput[15,15] := -1; end if;
  oldDescriptor := RGBDLocalizationInitializeTests.OldDescriptors();
  oldPoint := RGBDLocalizationInitializeTests.OldPoints(); oldEnabled := RGBDLocalizationInitializeTests.OldEnabled();
  pixels := RGBDLocalizationInitializeTests.Pixels();
  availableInput := if scenario == 22 then 0 else 1;
  oldEpochInput := if scenario == 22 then 0 else 1;
  epochInput := if scenario == 22 then 0 else if scenario == 20 then 1 else 2;
  lastUsedInput := if scenario == 22 then -1 else 0;
  cap := if scenario == 5 then 0 else if scenario == 6 then 351 else if scenario == 7 then 3.5
    else if scenario == 8 then 3 else if scenario == 9 then 1 else 350;
  threshold := if scenario == 10 then -1 else if scenario == 11 then 256 else if scenario == 12 then 255
    else if scenario == 13 then 0 else 18;
  frame := if scenario == 2 then 0 else if scenario == 4 then 0.5 else 1;
  request := if scenario == 16 then 0 else if scenario == 17 then 0.5 else 1;
  imageTime := if scenario == 15 then 0.01 else 0;
  capture := if scenario == 14 then 0 else 1;
  scores := RGBDFastInitializationReference.Scores(rgb);
  (selected,count,selectionValid) := RGBDFastInitializationReference.Select(scores,cap,threshold,frame == 1);
  expectedInitialization := request == 1 and imageTime == 0 and scenario <> 21 and (frame == 0 or frame == 1);
  front := expectedInitialization and frame == 1 and scenario <> 19;
  frameValid := front and count >= 3;
  expectedCapture := frameValid and capture == 1 and scenario <> 20;
  (initialized_nextPosition,
    initialized_nextVelocity,
    initialized_nextRotation,
    initialized_nextAccelBias,
    initialized_nextGyroBias,
    initialized_nextCovariance,
    initialized_nextCrossCovariance,
    initialized_nextReferenceCovariance,
    initialized_nextReferencePosition,
    initialized_nextReferenceRotation,
    initialized_nextReferenceAvailable,
    initialized_nextReferenceEpoch,
    initialized_nextReferenceUsed,
    initialized_nextLastUsedEpoch,
    initialized_nextReferenceDescriptor,
    initialized_nextReferencePoint,
    initialized_nextReferenceEnabled,
    initialized_nextReferencePixels,
    initialized_nextReferenceCount,
    initialized_nextReferenceRgbCalibration,
    initialized_nextReferenceDepthCalibration,
    initialized_nextReferenceNoiseReferenceFx,
    initialized_nextReferenceDisparityNoise,
    initialized_nextReferenceBaseline,
    initialized_nextReferenceOpticalToBody,
    initialized_nextReferenceCameraOriginBody,
    initialized_predictionAccepted,
    initialized_observationAccepted,
    initialized_observationRejected,
    initialized_captureAccepted,
    initialized_captureRejected,
    initialized_imageReuseRejected,
    initialized_imagePairEligible,
    initialized_frameValid,
    initialized_referenceGeometryCompatible,
    initialized_visualValid,
    initialized_matchCount,
    initialized_uncertaintyRejectionReason,
    initialized_currentDescriptor,
    initialized_currentPoint,
    initialized_currentEnabled,
    initialized_currentCount,
    initialized_currentFromReference,
    initialized_currentFromReferenceTranslation,
    initialized_relativeCovariance,
    initialized_mapCandidatePoint,
    initialized_mapCandidateEnabled,
    initialized_mapCandidateCount,
    initialized_nextQuaternion,
    initialized_positionCovariance,
    initialized_attitudeCovariance,
    initialized_confidence,
    initialized_features,
    initialized_featureEnabled,
    initialized_trackingCurrentPixel,
    initialized_trackingReferencePixel,
    initialized_trackingEnabled,
    initialized_initializationAccepted,
    initialized_initializationRejected,
    initialized_selectionValid) := InitializeFastRGBDLocalization(
    rgb=rgb,depth=depth,rgbCalibration=RGBDLocalizationInitializeTests.rgbCalibration,
    depthCalibration=RGBDLocalizationInitializeTests.depthCalibration,disparityNoise=0.08,noiseReferenceFx=500,baseline=0.05,
    opticalToBody=RGBDLocalizationInitializeTests.opticalToBody,cameraOriginBody=RGBDLocalizationInitializeTests.origin,
    frameEnabled=frame,imageCaptureRequested=capture,position=RGBDLocalizationInitializeTests.position,
    velocity=RGBDLocalizationInitializeTests.velocity,rotation=RGBDLocalizationInitializeTests.rotation,
    accelBias=RGBDLocalizationInitializeTests.accelBias,gyroBias=RGBDLocalizationInitializeTests.gyroBias,
    covariance=covarianceInput,crossCovariance=crossInput,referenceCovariance=referenceInput,
    referencePosition={-0.2,0.3,0.5},referenceRotation=identity(3),
    referenceAvailable=availableInput,referenceEpoch=oldEpochInput,currentEpoch=epochInput,referenceUsed=0,lastUsedEpoch=lastUsedInput,
    referenceDescriptor=oldDescriptor,referencePoint=oldPoint,referenceEnabled=oldEnabled,referencePixels=pixels,
    referenceCount=350,referenceRgbCalibration={115,106,79,44},referenceDepthCalibration={83,75,79,44},
    referenceNoiseReferenceFx=490,referenceDisparityNoise=0.07,referenceBaseline=0.06,
    referenceOpticalToBody=identity(3),referenceCameraOriginBody={0.1,0,0},accel={1e5,-2e5,3e5},gyro={9e4,-8e4,7e4},
    gravity={0,0,-9.81},h=0.75,density=fill(0.01,12),imageTime=imageTime,initializationRequested=request,
    selectedFeatureLimit=cap,absoluteThreshold=threshold);
  held := RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceDescriptor,oldDescriptor,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePoint,oldPoint,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceEnabled,oldEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePixels,pixels,1e-12)
    and SLAMExactRealEqual(initialized_nextReferenceCount,350)
    and SLAMExactRealEqual(initialized_nextReferenceAvailable,availableInput)
    and SLAMExactRealEqual(initialized_nextReferenceEpoch,oldEpochInput)
    and SLAMExactRealEqual(initialized_nextReferenceUsed,0)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextCrossCovariance,crossInput,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceCovariance,referenceInput,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferencePosition,{-0.2,0.3,0.5},1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceRotation,identity(3),1e-12);
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
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceRotation,RGBDLocalizationInitializeTests.rotation,1e-12) and initialized_nextReferenceAvailable > 0.5
    and SLAMExactRealEqual(initialized_nextReferenceEpoch,epochInput) and initialized_nextReferenceUsed < 0.5;
  expectedFeatures := zeros(350,3);
  for feature in 1:350 loop
    if front and feature <= count then
      expectedEnabled[feature] := 1;
      expectedPoint[feature,:] := RGBDFastInitializationReference.Point(selected[feature,1:2]);
      expectedDescriptor[feature,:] := RGBDFastInitializationReference.Descriptor(rgb,selected[feature,1:2]);
      expectedFeatures[feature,:] := selected[feature,:];
      if expectedCapture then
        expectedMap[feature,:] := RGBDLocalizationInitializeTests.rotation*
          (RGBDLocalizationInitializeTests.opticalToBody*expectedPoint[feature,:]+RGBDLocalizationInitializeTests.origin)
          +RGBDLocalizationInitializeTests.position;
      end if;
    end if;
  end for;
  frontOracle := RGBDLocalizationInitializeTests.CloseVector(initialized_currentEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_currentPoint,expectedPoint,1e-10)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_currentDescriptor,expectedDescriptor,1e-10);
  snapshotOracle := RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceDescriptor,expectedDescriptor,1e-10)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePoint,expectedPoint,1e-10)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferencePixels,selected[1:350,1:2],1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceRgbCalibration,RGBDLocalizationInitializeTests.rgbCalibration,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceDepthCalibration,RGBDLocalizationInitializeTests.depthCalibration,1e-12)
    and SLAMExactRealEqual(initialized_nextReferenceNoiseReferenceFx,500)
    and SLAMExactRealEqual(initialized_nextReferenceDisparityNoise,0.08) and SLAMExactRealEqual(initialized_nextReferenceBaseline,0.05)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextReferenceOpticalToBody,RGBDLocalizationInitializeTests.opticalToBody,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextReferenceCameraOriginBody,RGBDLocalizationInitializeTests.origin,1e-12);
  geometryOracle := RGBDLocalizationInitializeTests.CloseVector(initialized_mapCandidateEnabled,expectedEnabled,1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_mapCandidatePoint,expectedMap,1e-10) and SLAMExactRealEqual(initialized_mapCandidateCount,count);
  checks[1] := SLAMExactRealEqual(initialized_initializationAccepted,if expectedInitialization then 1 else 0);
  checks[2] := SLAMExactRealEqual(initialized_initializationRejected,if expectedInitialization or request == 0 then 0 else 1);
  checks[3] := SLAMExactRealEqual(initialized_captureAccepted,if expectedCapture then 1 else 0);
  checks[4] := SLAMExactRealEqual(initialized_captureRejected,if expectedCapture or frame <> 1 or capture == 0 then 0 else 1);
  checks[5] := RGBDLocalizationInitializeTests.CloseVector(initialized_nextPosition,RGBDLocalizationInitializeTests.position,1e-12)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_nextVelocity,RGBDLocalizationInitializeTests.velocity,1e-12) and RGBDLocalizationInitializeTests.CloseMatrix(initialized_nextRotation,RGBDLocalizationInitializeTests.rotation,1e-12);
  checks[6] := RGBDLocalizationInitializeTests.CloseVector(initialized_nextAccelBias,RGBDLocalizationInitializeTests.accelBias,1e-12) and RGBDLocalizationInitializeTests.CloseVector(initialized_nextGyroBias,RGBDLocalizationInitializeTests.gyroBias,1e-12);
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
  checks[12] := frontOracle;
  checks[13] := RGBDLocalizationInitializeTests.CloseMatrix(initialized_mapCandidatePoint,expectedMap,1e-10)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_mapCandidateEnabled,if expectedCapture then expectedEnabled else zeros(350),1e-12)
    and initialized_mapCandidateCount == (if expectedCapture then count else 0);
  checks[14] := initialized_frameValid == (if frameValid then 1 else 0)
    and initialized_referenceGeometryCompatible == 0;
  checks[15] := RGBDLocalizationInitializeTests.ZeroMatrix(initialized_relativeCovariance,1e-12) and RGBDLocalizationInitializeTests.CloseMatrix(initialized_currentFromReference,identity(3),1e-12)
    and RGBDLocalizationInitializeTests.ZeroVector(initialized_currentFromReferenceTranslation,1e-12);
  checks[16] := RGBDLocalizationInitializeTests.ZeroVector(initialized_trackingEnabled,0.5) and RGBDLocalizationInitializeTests.ZeroMatrix(initialized_trackingCurrentPixel,1e-12)
    and RGBDLocalizationInitializeTests.ZeroMatrix(initialized_trackingReferencePixel,1e-12) and initialized_matchCount < 0.5;
  checks[17] := RGBDLocalizationInitializeTests.CloseMatrix(quaternionRotation,RGBDLocalizationInitializeTests.rotation,1e-10);
  checks[18] := RGBDLocalizationInitializeTests.CloseMatrix(initialized_positionCovariance,covarianceInput[1:3,1:3],1e-12)
    and RGBDLocalizationInitializeTests.CloseMatrix(initialized_attitudeCovariance,covarianceInput[7:9,7:9],1e-12);
  checks[19] := initialized_currentCount == (if frame == 1 then count else 0)
    and initialized_selectionValid == (if selectionValid then 1 else 0);
  checks[20] := RGBDLocalizationInitializeTests.CloseMatrix(initialized_features,expectedFeatures,1e-10)
    and RGBDLocalizationInitializeTests.CloseVector(initialized_featureEnabled,expectedEnabled,1e-12);
  checks[21] := if expectedCapture then initialized_nextReferenceCount == count else held;
  checks[22] := if scenario == 1 or scenario == 3 or scenario == 18 then count == 350
    and abs(expectedPoint[1,3]-expectedPoint[count,3]) > 1e-6
    else if scenario == 8 then count == 3 else if scenario == 9 then count == 1 else true;
  suppressed := true;
  for first in 1:count loop
    suppressed := suppressed and selected[first,1] >= 3 and selected[first,1] <= 156
      and selected[first,2] >= 3 and selected[first,2] <= 86;
    for second in first+1:count loop
      suppressed := suppressed and (abs(selected[first,1]-selected[second,1]) > 3
        or abs(selected[first,2]-selected[second,2]) > 3);
    end for;
  end for;
  checks[23] := suppressed;
  checks[24] := initialized_uncertaintyRejectionReason == 0
    and abs(sum(initialized_nextQuaternion.^2)-1) < 1e-12;
end RGBDFastInitializationFunctionChecks;

model RGBDFastInitializationFunctionAcceptance
  output Integer scenario;
  output Boolean checks[24];
equation
  scenario = min(22,1+integer(time));
  checks = RGBDFastInitializationFunctionChecks(scenario);
end RGBDFastInitializationFunctionAcceptance;
