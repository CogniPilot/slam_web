// Actual carried full-State FAST composition, with independent geometry/control invariants.
// Filter trajectory values depend on the qualified production core; no truth poses enter it.
package RGBDFastCarriedReference
  function Image
    input Integer sample; input Boolean blank;
    output Real rgb[90,160,4]; output Real depth[90,160];
  protected Integer center; Integer loX; Integer hiX; Integer loY; Integer hiY;
    constant Integer cx[3]={36,79,121}; constant Integer cy[3]={22,45,67};
    constant Integer shift[3]={3,2,1}; constant Real z[3]={2.4,3.6,7.2};
  algorithm
    rgb := fill(128,90,160,4); depth := zeros(90,160);
    for row in 1:90 loop for column in 1:160 loop rgb[row,column,4] := 255; end for; end for;
    if not blank then
      for patch in 1:3 loop
        center := cx[patch]+shift[patch]*sample;
        for row in -10:10 loop for column in -13:13 loop for channel in 1:3 loop
          rgb[cy[patch]+row+1,center+column+1,channel] := mod(37*(column+13)+53*(row+10)
            +7*(column+13)*(row+10)+11*channel+17*patch,256);
        end for; end for; end for;
        // Depth optics differ from RGB. These supports include every selected pixel
        // and its bilinear neighbors, while staying disjoint through sample six.
        loX := integer(floor((center-15-80)*80.0/120+79)); hiX := integer(ceil((center+15-80)*80.0/120+79))+1;
        loY := integer(floor((cy[patch]-12-45)*90.0/120+44)); hiY := integer(ceil((cy[patch]+12-45)*90.0/120+44))+1;
        assert(loX >= 0 and hiX < 160 and loY >= 0 and hiY < 90,"Raw depth support is inside full image");
        for row in loY:hiY loop for column in loX:hiX loop
          assert(depth[row+1,column+1] == 0,"Independent depth planes remain disjoint");
          depth[row+1,column+1] := z[patch];
        end for; end for;
      end for;
    end if;
  end Image;

  function Carry
    input RGBDLocalizationAdvanceReference.Input previous;
    input RGBDLocalizationAdvanceReference.Output y;
    output RGBDLocalizationAdvanceReference.Input next;
  algorithm
    next := previous;
    next.position := y.nextPosition;
    next.velocity := y.nextVelocity;
    next.rotation := y.nextRotation;
    next.accelBias := y.nextAccelBias;
    next.gyroBias := y.nextGyroBias;
    next.covariance := y.nextCovariance;
    next.crossCovariance := y.nextCrossCovariance;
    next.referenceCovariance := y.nextReferenceCovariance;
    next.referencePosition := y.nextReferencePosition;
    next.referenceRotation := y.nextReferenceRotation;
    next.referenceAvailable := y.nextReferenceAvailable;
    next.referenceEpoch := y.nextReferenceEpoch;
    next.referenceUsed := y.nextReferenceUsed;
    next.lastUsedEpoch := y.nextLastUsedEpoch;
    next.referenceDescriptor := y.nextReferenceDescriptor;
    next.referencePoint := y.nextReferencePoint;
    next.referenceEnabled := y.nextReferenceEnabled;
    next.referencePixels := y.nextReferencePixels;
    next.referenceCount := y.nextReferenceCount;
    next.referenceRgbCalibration := y.nextReferenceRgbCalibration;
    next.referenceDepthCalibration := y.nextReferenceDepthCalibration;
    next.referenceNoiseReferenceFx := y.nextReferenceNoiseReferenceFx;
    next.referenceDisparityNoise := y.nextReferenceDisparityNoise;
    next.referenceBaseline := y.nextReferenceBaseline;
    next.referenceOpticalToBody := y.nextReferenceOpticalToBody;
    next.referenceCameraOriginBody := y.nextReferenceCameraOriginBody;
  end Carry;

  function PositiveSemidefinite
    input Real matrix[21,21]; output Boolean valid;
  protected Real a[21,21]; Real scale; Real tau; Real t; Real c; Real s; Real g; Real h;
  algorithm
    a := matrix; scale := 1;
    for i in 1:21 loop scale := scale+abs(a[i,i]); end for;
    valid := scale < 1e12;
    for i in 1:21 loop for j in 1:21 loop
      valid := valid and abs(a[i,j]) < 1e12 and abs(a[i,j]-a[j,i]) < 1e-10*scale;
    end for; end for;
    // Test-only cyclic Jacobi eigensolve, independent of production PSD owners.
    // Singular current/reference clone directions are legitimate; tolerance is numerical.
    if valid then
      for sweep in 1:24 loop
        for p in 1:20 loop for q in p+1:21 loop
          if abs(a[p,q]) > 1e-14*scale then
            tau := (a[q,q]-a[p,p])/(2*a[p,q]);
            t := (if tau >= 0 then 1 else -1)/(abs(tau)+sqrt(1+tau*tau));
            c := 1/sqrt(1+t*t); s := t*c;
            a[p,p] := a[p,p]-t*a[p,q]; a[q,q] := a[q,q]+t*a[p,q];
            a[p,q] := 0; a[q,p] := 0;
            for k in 1:21 loop
              if k <> p and k <> q then
                g := a[k,p]; h := a[k,q]; a[k,p] := c*g-s*h; a[p,k] := a[k,p];
                a[k,q] := s*g+c*h; a[q,k] := a[k,q];
              end if;
            end for;
          end if;
        end for; end for;
      end for;
      for i in 1:21 loop
        valid := valid and a[i,i] >= -1e-10*scale;
        for j in 1:21 loop
          if i <> j then valid := valid and abs(a[i,j]) < 1e-10*scale; end if;
        end for;
      end for;
    end if;
  end PositiveSemidefinite;

  function Finite
    input RGBDLocalizationAdvanceReference.Output y; output Boolean valid;
  algorithm
    valid := true;
    for i in 1:3 loop valid := valid and abs(y.nextPosition[i]) < 1e12; end for;
    for i in 1:3 loop valid := valid and abs(y.nextVelocity[i]) < 1e12; end for;
    for i in 1:3 loop for j in 1:3 loop valid := valid and abs(y.nextRotation[i,j]) < 1e12; end for; end for;
    for i in 1:3 loop valid := valid and abs(y.nextAccelBias[i]) < 1e12; end for;
    for i in 1:3 loop valid := valid and abs(y.nextGyroBias[i]) < 1e12; end for;
    for i in 1:15 loop for j in 1:15 loop valid := valid and abs(y.nextCovariance[i,j]) < 1e12; end for; end for;
    for i in 1:15 loop for j in 1:6 loop valid := valid and abs(y.nextCrossCovariance[i,j]) < 1e12; end for; end for;
    for i in 1:6 loop for j in 1:6 loop valid := valid and abs(y.nextReferenceCovariance[i,j]) < 1e12; end for; end for;
    for i in 1:3 loop valid := valid and abs(y.nextReferencePosition[i]) < 1e12; end for;
    for i in 1:3 loop for j in 1:3 loop valid := valid and abs(y.nextReferenceRotation[i,j]) < 1e12; end for; end for;
    valid := valid and abs(y.nextReferenceAvailable) < 1e12;
    valid := valid and abs(y.nextReferenceEpoch) < 1e12;
    valid := valid and abs(y.nextReferenceUsed) < 1e12;
    valid := valid and abs(y.nextLastUsedEpoch) < 1e12;
    for i in 1:350 loop for j in 1:49 loop valid := valid and abs(y.nextReferenceDescriptor[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop for j in 1:3 loop valid := valid and abs(y.nextReferencePoint[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop valid := valid and abs(y.nextReferenceEnabled[i]) < 1e12; end for;
    for i in 1:350 loop for j in 1:2 loop valid := valid and abs(y.nextReferencePixels[i,j]) < 1e12; end for; end for;
    valid := valid and abs(y.nextReferenceCount) < 1e12;
    for i in 1:4 loop valid := valid and abs(y.nextReferenceRgbCalibration[i]) < 1e12; end for;
    for i in 1:4 loop valid := valid and abs(y.nextReferenceDepthCalibration[i]) < 1e12; end for;
    valid := valid and abs(y.nextReferenceNoiseReferenceFx) < 1e12;
    valid := valid and abs(y.nextReferenceDisparityNoise) < 1e12;
    valid := valid and abs(y.nextReferenceBaseline) < 1e12;
    for i in 1:3 loop for j in 1:3 loop valid := valid and abs(y.nextReferenceOpticalToBody[i,j]) < 1e12; end for; end for;
    for i in 1:3 loop valid := valid and abs(y.nextReferenceCameraOriginBody[i]) < 1e12; end for;
    valid := valid and abs(y.predictionAccepted) < 1e12;
    valid := valid and abs(y.observationAccepted) < 1e12;
    valid := valid and abs(y.observationRejected) < 1e12;
    valid := valid and abs(y.captureAccepted) < 1e12;
    valid := valid and abs(y.captureRejected) < 1e12;
    valid := valid and abs(y.imageReuseRejected) < 1e12;
    valid := valid and abs(y.imagePairEligible) < 1e12;
    valid := valid and abs(y.frameValid) < 1e12;
    valid := valid and abs(y.referenceGeometryCompatible) < 1e12;
    valid := valid and abs(y.visualValid) < 1e12;
    valid := valid and abs(y.matchCount) < 1e12;
    valid := valid and abs(y.uncertaintyRejectionReason) < 1e12;
    for i in 1:350 loop for j in 1:49 loop valid := valid and abs(y.currentDescriptor[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop for j in 1:3 loop valid := valid and abs(y.currentPoint[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop valid := valid and abs(y.currentEnabled[i]) < 1e12; end for;
    valid := valid and abs(y.currentCount) < 1e12;
    for i in 1:3 loop for j in 1:3 loop valid := valid and abs(y.currentFromReference[i,j]) < 1e12; end for; end for;
    for i in 1:3 loop valid := valid and abs(y.currentFromReferenceTranslation[i]) < 1e12; end for;
    for i in 1:6 loop for j in 1:6 loop valid := valid and abs(y.relativeCovariance[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop for j in 1:3 loop valid := valid and abs(y.mapCandidatePoint[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop valid := valid and abs(y.mapCandidateEnabled[i]) < 1e12; end for;
    valid := valid and abs(y.mapCandidateCount) < 1e12;
    for i in 1:4 loop valid := valid and abs(y.nextQuaternion[i]) < 1e12; end for;
    for i in 1:3 loop for j in 1:3 loop valid := valid and abs(y.positionCovariance[i,j]) < 1e12; end for; end for;
    for i in 1:3 loop for j in 1:3 loop valid := valid and abs(y.attitudeCovariance[i,j]) < 1e12; end for; end for;
    valid := valid and abs(y.confidence) < 1e12;
    for i in 1:350 loop for j in 1:3 loop valid := valid and abs(y.features[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop valid := valid and abs(y.featureEnabled[i]) < 1e12; end for;
    for i in 1:350 loop for j in 1:2 loop valid := valid and abs(y.trackingCurrentPixel[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop for j in 1:2 loop valid := valid and abs(y.trackingReferencePixel[i,j]) < 1e12; end for; end for;
    for i in 1:350 loop valid := valid and abs(y.trackingEnabled[i]) < 1e12; end for;
  end Finite;

  function Run
    input Real clock; output Boolean checks[7,20]; output Real metrics[7,12];
  protected
    RGBDLocalizationAdvanceReference.Input x; RGBDLocalizationAdvanceReference.Input core;
    RGBDLocalizationAdvanceReference.Output y; RGBDLocalizationAdvanceReference.Output expected;
    Real rgb[90,160,4]; Real depth[90,160]; Real scores[14400]; Real selected[14400,3];
    Real descriptor[350,49]; Real point[350,3]; Real enabled[350]; Real selectionValid;
    Real joint[21,21]; Real negative[21,21]; Real world[3]; Real gram[3,3]; Real delta;
    Boolean initialized; Boolean valid; Boolean parity[57]; Boolean held; Boolean cloned;
    Boolean projected; Boolean tracked; Boolean update; Boolean rotationValid; Boolean psdSelf;
    Integer count; Integer sample; Integer referenceSample; Integer corrections; Integer captures;
    constant Integer samples[7]={1,2,3,4,4,5,6}; constant Integer epochs[7]={2,3,4,5,5,6,7};
    constant Integer expectedReference[7]={1,3,3,3,3,6,6};
    constant Integer expectedUsed[7]={1,0,0,1,1,0,1};
    constant Integer expectedLast[7]={2,2,2,5,5,5,7};
    constant Integer poseIndices[6]={1,2,3,7,8,9};
  algorithm
    (x,initialized) := RGBDFastAdvanceReference.At(1);
    checks := fill(false,7,20); metrics := zeros(7,12);
    referenceSample := 0; corrections := 0; captures := 0;
    negative := identity(21); psdSelf := PositiveSemidefinite(negative);
    negative[21,21] := -0.0001; psdSelf := psdSelf and not PositiveSemidefinite(negative);
    negative := identity(21); negative[21,1] := 0.1;
    psdSelf := psdSelf and not PositiveSemidefinite(negative);
    for frame in 1:7 loop
      sample := samples[frame]; (rgb,depth) := Image(sample,frame == 3);
      x.rgb := rgb; x.depth := depth; x.currentEpoch := epochs[frame];
      x.h := if frame == 5 then 1.0/90 else 0.2;
      x.frameEnabled := 1; x.imageCaptureRequested := 1;
      scores := RGBDFastInitializationReference.Scores(rgb);
      (selected,count,valid) := RGBDFastInitializationReference.Select(scores,350,18,true);
      (descriptor,point,enabled) := RGBDFastAdvanceReference.Front(x,selected,count);
      (y,selectionValid) := RGBDFastAdvanceReference.Call(x,350,18);
      // Separately selected core comparison is explicitly core-dependent.
      core := x; core.pixels := selected[1:350,1:2]; core.activeCount := count; core.featureScore := selected[1:350,3];
      expected := RGBDLocalizationAdvanceReference.Call(core);
      parity := RGBDLocalizationAdvanceReference.Compare(y,expected);
      checks[frame,1] := initialized and clock >= 0 and psdSelf;
      checks[frame,2] := valid and selectionValid == 1 and y.currentCount == count
        and (if frame == 3 then count == 0 else count >= 3);
      checks[frame,3] := RGBDLocalizationInitializeTests.CloseMatrix(y.currentDescriptor,descriptor,1e-10)
        and RGBDLocalizationInitializeTests.CloseMatrix(y.currentPoint,point,1e-10)
        and RGBDLocalizationInitializeTests.CloseVector(y.currentEnabled,enabled,1e-12);
      checks[frame,4] := y.predictionAccepted == 1;
      checks[frame,5] := y.observationAccepted == (if frame == 1 or frame == 4 or frame == 7 then 1 else 0);
      checks[frame,6] := y.captureAccepted == (if frame == 2 or frame == 6 then 1 else 0);
      checks[frame,7] := if frame == 3 then y.frameValid == 0 and y.visualValid == 0 and y.captureRejected == 1
        else y.frameValid == 1 and y.visualValid == 1 and y.matchCount >= 3
        and y.captureRejected == (if frame == 2 or frame == 6 then 0 else 1)
        and y.imageReuseRejected == (if frame == 2 or frame == 5 or frame == 6 then 1 else 0);
      checks[frame,8] := y.nextReferenceEpoch == expectedReference[frame] and y.nextReferenceUsed == expectedUsed[frame]
        and y.nextLastUsedEpoch == expectedLast[frame] and y.nextReferenceAvailable == 1;
      held := true; cloned := true;
      held := held and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceCovariance,x.referenceCovariance,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseVector(y.nextReferencePosition,x.referencePosition,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceRotation,x.referenceRotation,1e-12);
      held := held and y.nextReferenceAvailable == x.referenceAvailable;
      held := held and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceDescriptor,x.referenceDescriptor,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferencePoint,x.referencePoint,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceEnabled,x.referenceEnabled,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferencePixels,x.referencePixels,1e-12);
      held := held and y.nextReferenceCount == x.referenceCount;
      held := held and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceRgbCalibration,x.referenceRgbCalibration,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceDepthCalibration,x.referenceDepthCalibration,1e-12);
      held := held and y.nextReferenceNoiseReferenceFx == x.referenceNoiseReferenceFx;
      held := held and y.nextReferenceDisparityNoise == x.referenceDisparityNoise;
      held := held and y.nextReferenceBaseline == x.referenceBaseline;
      held := held and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceOpticalToBody,x.referenceOpticalToBody,1e-12);
      held := held and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceCameraOriginBody,x.referenceCameraOriginBody,1e-12);
      checks[frame,9] := if frame == 2 or frame == 6 then true else held;
      cloned := RGBDLocalizationInitializeTests.CloseVector(y.nextReferencePosition,y.nextPosition,1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceRotation,y.nextRotation,1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceDescriptor,descriptor,1e-10)
        and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferencePoint,point,1e-10)
        and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceEnabled,enabled,1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferencePixels,selected[1:350,1:2],1e-12)
        and y.nextReferenceCount == count
        and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceRgbCalibration,x.rgbCalibration,1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceDepthCalibration,x.depthCalibration,1e-12)
        and y.nextReferenceNoiseReferenceFx == x.noiseReferenceFx
        and y.nextReferenceDisparityNoise == x.disparityNoise and y.nextReferenceBaseline == x.baseline
        and RGBDLocalizationInitializeTests.CloseMatrix(y.nextReferenceOpticalToBody,x.opticalToBody,1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(y.nextReferenceCameraOriginBody,x.cameraOriginBody,1e-12);
      for i in 1:15 loop for j in 1:6 loop
        cloned := cloned and abs(y.nextCrossCovariance[i,j]-y.nextCovariance[i,poseIndices[j]]) < 1e-12;
      end for; end for;
      for i in 1:6 loop for j in 1:6 loop
        cloned := cloned and abs(y.nextReferenceCovariance[i,j]-y.nextCovariance[poseIndices[i],poseIndices[j]]) < 1e-12;
      end for; end for;
      checks[frame,10] := if frame == 2 or frame == 6 then cloned else true;
      delta := 0.06*(sample-referenceSample);
      checks[frame,11] := if frame == 3 then true else
        RGBDLocalizationInitializeTests.CloseMatrix(y.currentFromReference,identity(3),1e-8)
        and RGBDLocalizationInitializeTests.CloseVector(y.currentFromReferenceTranslation,{delta,0,0},1e-8);
      update := false;
      for i in 1:15 loop for j in 1:15 loop update := update or abs(y.nextCovariance[i,j]-x.covariance[i,j]) > 1e-9; end for; end for;
      checks[frame,12] := update;
      joint[1:15,1:15] := y.nextCovariance; joint[1:15,16:21] := y.nextCrossCovariance;
      joint[16:21,1:15] := transpose(y.nextCrossCovariance); joint[16:21,16:21] := y.nextReferenceCovariance;
      checks[frame,13] := PositiveSemidefinite(joint);
      checks[frame,14] := Finite(y);
      gram := transpose(y.nextRotation)*y.nextRotation;
      rotationValid := RGBDLocalizationInitializeTests.CloseMatrix(gram,identity(3),1e-8)
        and abs(y.nextRotation[1,1]*(y.nextRotation[2,2]*y.nextRotation[3,3]-y.nextRotation[2,3]*y.nextRotation[3,2])
          -y.nextRotation[1,2]*(y.nextRotation[2,1]*y.nextRotation[3,3]-y.nextRotation[2,3]*y.nextRotation[3,1])
          +y.nextRotation[1,3]*(y.nextRotation[2,1]*y.nextRotation[3,2]-y.nextRotation[2,2]*y.nextRotation[3,1])-1) < 1e-8;
      for i in 1:3 loop rotationValid := rotationValid and abs(y.nextPosition[i]) < 100 and abs(y.nextVelocity[i]) < 10
        and abs(y.nextAccelBias[i]) < 2 and abs(y.nextGyroBias[i]) < 0.3; end for;
      checks[frame,15] := rotationValid;
      projected := true; tracked := true;
      for feature in 1:350 loop
        world := y.nextRotation*(x.opticalToBody*point[feature,:]+x.cameraOriginBody)+y.nextPosition;
        projected := projected and y.mapCandidateEnabled[feature] == (if y.observationAccepted == 1 or y.captureAccepted == 1 then enabled[feature] else 0);
        for axis in 1:3 loop projected := projected and abs(y.mapCandidatePoint[feature,axis]
          -(if y.mapCandidateEnabled[feature] == 1 then world[axis] else 0)) < 1e-9; end for;
        if y.trackingEnabled[feature] == 1 then
          tracked := tracked and x.referenceEnabled[feature] == 1
            and abs(y.trackingCurrentPixel[feature,1]-y.trackingReferencePixel[feature,1]-120*delta/x.referencePoint[feature,3]) < 1e-8
            and y.trackingCurrentPixel[feature,2] == y.trackingReferencePixel[feature,2];
        end if;
      end for;
      projected := projected and y.mapCandidateCount == sum(y.mapCandidateEnabled);
      checks[frame,16] := projected;
      checks[frame,17] := tracked and (if frame == 3 then sum(y.trackingEnabled) == 0 else sum(y.trackingEnabled) >= 3);
      checks[frame,18] := RGBDLocalizationInitializeTests.CloseMatrix(y.positionCovariance,y.nextCovariance[1:3,1:3],1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(y.attitudeCovariance,y.nextCovariance[7:9,7:9],1e-12)
        and abs(sum(y.nextQuaternion.*y.nextQuaternion)-1) < 1e-8 and y.confidence == y.observationAccepted;
      checks[frame,19] := true;
      for field in 1:57 loop checks[frame,19] := checks[frame,19] and parity[field]; end for;
      corrections := corrections+integer(y.observationAccepted); captures := captures+integer(y.captureAccepted);
      checks[frame,20] := if frame == 7 then corrections == 3 and captures == 2 else true;
      metrics[frame,:] := {sample,x.currentEpoch,y.currentCount,y.matchCount,y.observationAccepted,y.captureAccepted,
        y.nextReferenceEpoch,y.nextReferenceUsed,y.nextLastUsedEpoch,y.currentFromReferenceTranslation[1],
        y.nextPosition[1],y.mapCandidateCount};
      if y.captureAccepted == 1 then referenceSample := sample; end if;
      x := Carry(x,y);
    end for;
  end Run;
end RGBDFastCarriedReference;

model RGBDFastCarriedFramesAcceptance
  output Boolean checks[7,20]; output Real metrics[7,12];
equation
  (checks,metrics) = RGBDFastCarriedReference.Run(time);
end RGBDFastCarriedFramesAcceptance;
