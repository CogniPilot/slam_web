// Test the actual complete raw-camera transaction, with all production capacities.
// Sequential parity shares the underlying SLAM math; controls independently test
// chronology, one-image ownership, atomic rollback and consumed graph attempts.
package RGBDFastSLAMIntervalsReference
  constant Integer maximumIntervals = 36;
  constant Integer checkCount = 18;
  constant Integer metricCount = 19;
  record BatchResult
    RGBDFastSLAMRawCompositionReference.Outcome value;
    Integer processedIntervals; Integer failedInterval; Integer batchReason;
  end BatchResult;

  function One
    input RGBDGraphProcessing.State previous;
    input Real rgb[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth,:];
    input Real depth[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth];
    input Real accel[3]; input Real gyro[3]; input Real duration; input Real endpoint;
    input Integer epoch; input Boolean image; input Boolean capture; input Boolean graph;
    input Boolean forceCapture; input RGBDGraphProcessing.Policy policy;
    input Real depthUnits = 1.0;
    output RGBDFastSLAMRawCompositionReference.Outcome result;
  algorithm
    (result.next,result.accepted,result.imageCompleted,result.mappingAccepted,
      result.graphCorrectionAccepted,result.roundoffCertified,result.publicationReason,
      result.ledgerReason,result.vocabularyReason,result.graphReason,result.graphCommitReason,
      result.graphFilterReason,result.covarianceStatus,result.graphCostBefore,result.graphCostAfter,
      result.nextQuaternion,result.selectionValid,result.predictionAccepted,result.initializationAccepted,
      result.observationAccepted,result.captureAccepted,result.matchCount,result.features,result.featureEnabled,
      result.trackingCurrentPixel,result.trackingReferencePixel,result.trackingEnabled) := AdvanceFastSLAM(
        previous=previous,rgb=rgb,depth=depth,depthUnits=depthUnits,
        rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
        disparityNoise=0.08,noiseReferenceFx=520,baseline=0.05,
        opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
        accel=accel,gyro=gyro,gravity=zeros(3),density=fill(0.01,12),
        h=duration,intervalTime=endpoint,imageEpoch=epoch,imageRequested=image,
        localCaptureRequested=capture,graphCorrectionRequested=graph,graphPolicy=policy,
        minimumInterval=if forceCapture then 0.05 else 0.5,
        maximumInterval=if forceCapture then 0.1 else 2.0);
  end One;

  function Batch
    input RGBDGraphProcessing.State previous;
    input Real rgb[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth,:];
    input Real depth[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth];
    input Real accel[maximumIntervals,3]; input Real gyro[maximumIntervals,3];
    input Real durations[maximumIntervals]; input Real endpoints[maximumIntervals];
    input Integer count; input Real frameTime; input Integer epoch;
    input Boolean image; input Boolean requested; input Boolean forceCapture;
    input Boolean graph; input RGBDGraphProcessing.Policy policy;
    input Real depthUnits = 1.0;
    output BatchResult result;
  algorithm
    (result.value.next,result.value.accepted,result.value.imageCompleted,result.value.mappingAccepted,
      result.value.graphCorrectionAccepted,result.value.roundoffCertified,result.value.publicationReason,
      result.value.ledgerReason,result.value.vocabularyReason,result.value.graphReason,result.value.graphCommitReason,
      result.value.graphFilterReason,result.value.covarianceStatus,result.value.graphCostBefore,result.value.graphCostAfter,
      result.value.nextQuaternion,result.value.selectionValid,result.value.predictionAccepted,result.value.initializationAccepted,
      result.value.observationAccepted,result.value.captureAccepted,result.value.matchCount,result.value.features,result.value.featureEnabled,
      result.value.trackingCurrentPixel,result.value.trackingReferencePixel,result.value.trackingEnabled,
      result.processedIntervals,result.failedInterval,result.batchReason) := AdvanceFastSLAMIntervals(
        previous=previous,rgb=rgb,depth=depth,depthUnits=depthUnits,
        rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
        disparityNoise=0.08,noiseReferenceFx=520,baseline=0.05,
        opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
        accel=accel,gyro=gyro,gravity=zeros(3),density=fill(0.01,12),
        durations=durations,intervalTimes=endpoints,intervalCount=count,frameTime=frameTime,
        imageEpoch=epoch,imageRequested=image,localCaptureRequested=true,requested=requested,
        graphCorrectionRequested=graph,graphPolicy=policy,
        minimumInterval=if forceCapture then 0.05 else 0.5,
        maximumInterval=if forceCapture then 0.1 else 2.0);
  end Batch;

  function DisplaysEqual
    input RGBDFastSLAMRawCompositionReference.Outcome left;
    input RGBDFastSLAMRawCompositionReference.Outcome right;
    output Boolean equal;
  algorithm
    equal := left.accepted == right.accepted and left.imageCompleted == right.imageCompleted
      and left.mappingAccepted == right.mappingAccepted
      and left.graphCorrectionAccepted == right.graphCorrectionAccepted
      and left.roundoffCertified == right.roundoffCertified
      and left.publicationReason == right.publicationReason and left.ledgerReason == right.ledgerReason
      and left.vocabularyReason == right.vocabularyReason and left.graphReason == right.graphReason
      and left.graphCommitReason == right.graphCommitReason and left.graphFilterReason == right.graphFilterReason
      and left.covarianceStatus == right.covarianceStatus
      and RGBDCompleteStateComparison.RealVector({left.graphCostBefore,left.graphCostAfter,
        left.selectionValid,left.predictionAccepted,left.initializationAccepted,left.observationAccepted,
        left.captureAccepted,left.matchCount},{right.graphCostBefore,right.graphCostAfter,
        right.selectionValid,right.predictionAccepted,right.initializationAccepted,right.observationAccepted,
        right.captureAccepted,right.matchCount},1e-12)
      and RGBDCompleteStateComparison.RealVector(left.nextQuaternion,right.nextQuaternion,1e-12)
      and RGBDCompleteStateComparison.RealMatrix(left.features,right.features,1e-12)
      and RGBDCompleteStateComparison.RealVector(left.featureEnabled,right.featureEnabled,1e-12)
      and RGBDCompleteStateComparison.RealMatrix(left.trackingCurrentPixel,right.trackingCurrentPixel,1e-12)
      and RGBDCompleteStateComparison.RealMatrix(left.trackingReferencePixel,right.trackingReferencePixel,1e-12)
      and RGBDCompleteStateComparison.RealVector(left.trackingEnabled,right.trackingEnabled,1e-12);
  end DisplaysEqual;

  function Case
    input Integer caseId;
    input RGBDGraphProcessing.State initialized;
    input RGBDGraphProcessing.State fresh;
    input Real cameraRgb[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth,:];
    input Real cameraDepth[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth];
    input Real nanValue; input Real infinity;
    input Real depthUnits = 1.0;
    output Boolean checks[checkCount]; output Real raw[metricCount];
  protected
    RGBDGraphProcessing.State previous; RGBDGraphProcessing.State sequential;
    RGBDFastSLAMRawCompositionReference.Outcome expected;
    BatchResult actual;
    RGBDGraphProcessing.Policy policy;
    Real rgb[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth,size(cameraRgb,3)];
    Real depth[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth];
    Real unusedPixels[RGBDKeyframes.featureCapacity,2];
    Real accel[maximumIntervals,3]; Real gyro[maximumIntervals,3];
    Real durations[maximumIntervals]; Real endpoints[maximumIntervals];
    Real frameTime; Real baseDuration;
    Integer count; Integer epoch; Integer expectedReason; Integer expectedProcessed; Integer expectedFailed;
    Boolean image; Boolean requested; Boolean forceCapture; Boolean graph; Boolean success;
    Boolean intermediateHeld; Boolean expectedValid; Boolean displaysCleared;
  algorithm
    checks := fill(false,checkCount); raw := zeros(metricCount);
    previous := initialized; rgb := cameraRgb; depth := cameraDepth;
    // Clock-only cases use a static view consistent with their stationary IMU.
    // The measured translated view is retained for the 0.2-second graph cases.
    if caseId <> 25 and caseId <> 26 then
      (rgb,depth,unusedPixels) := RGBDFastAdvanceReference.Image(false,size(cameraRgb,3),depthUnits);
    end if;
    accel := zeros(maximumIntervals,3); gyro := zeros(maximumIntervals,3);
    count := 3; baseDuration := 1.0/270.0;
    image := true; requested := true; forceCapture := false; graph := false; epoch := 2;
    expectedReason := 0; expectedProcessed := 3; expectedFailed := 0;
    policy := RGBDGraphProcessing.DefaultPolicy();
    if caseId == 1 then count := 1; baseDuration := 1.0/90.0;
    elseif caseId == 2 then count := 2; baseDuration := 1.0/180.0;
    elseif caseId == 3 then count := 12; baseDuration := 1.0/180.0;
    elseif caseId == 4 then count := maximumIntervals; baseDuration := 1.0/3240.0;
    elseif caseId == 25 or caseId == 26 then
      count := 2; baseDuration := 0.1; forceCapture := true; graph := true;
    end if;
    durations := fill(baseDuration,maximumIntervals);
    endpoints := zeros(maximumIntervals);
    for interval in 1:maximumIntervals loop
      endpoints[interval] := baseDuration*interval;
    end for;
    frameTime := endpoints[count]; expectedProcessed := count;
    if caseId == 5 then
      durations[1:3] := {0.003,0.004,1.0/90.0-0.007};
      endpoints[1:3] := {0.003,0.007,1.0/90.0};
      frameTime := endpoints[3];
      accel[1:3,:] := [0.03,-0.02,0.01;-0.01,0.04,-0.02;0.02,0.01,-0.03];
      gyro[1:3,:] := [0.001,-0.002,0.003;-0.004,0.005,-0.006;0.007,-0.008,0.009];
    elseif caseId == 6 then
      requested := false; count := 999; durations := fill(nanValue,maximumIntervals);
      endpoints := fill(nanValue,maximumIntervals); gyro := fill(nanValue,maximumIntervals,3);
      frameTime := nanValue; expectedReason := 1; expectedProcessed := 0;
      previous.estimator.localization.generation := -7;
      previous.estimator.localization.catalog.descriptors[RGBDKeyframes.keyframeCapacity,
        RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize] := nanValue;
    elseif caseId == 7 then count := 0; expectedReason := 2; expectedProcessed := 0;
    elseif caseId == 8 then count := maximumIntervals+1; expectedReason := 2; expectedProcessed := 0;
    elseif caseId == 9 then count := -1; expectedReason := 2; expectedProcessed := 0;
    elseif caseId == 10 then durations[2] := 0; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 11 then durations[2] := -baseDuration; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 12 then durations[2] := 0.200000001; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 13 then endpoints[2] := endpoints[2]+1e-4; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 14 then frameTime := frameTime+1e-4; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 15 then epoch := 1; expectedReason := 4; expectedProcessed := 0;
    elseif caseId == 16 then endpoints[1] := 0; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 17 then gyro[2,1] := 10000; expectedReason := 5; expectedProcessed := 1; expectedFailed := 2;
    elseif caseId == 18 then gyro[1,1] := 10000; expectedReason := 5; expectedProcessed := 0; expectedFailed := 1;
    elseif caseId == 19 then accel[count,3] := nanValue; expectedReason := 5; expectedProcessed := count-1; expectedFailed := count;
    elseif caseId == 20 then
      image := false; epoch := 1; rgb := fill(nanValue,RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth,size(cameraRgb,3));
      depth := fill(nanValue,RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth);
    elseif caseId == 21 then
      for interval in count+1:maximumIntervals loop
        durations[interval] := nanValue; endpoints[interval] := infinity;
        gyro[interval,:] := fill(nanValue,3); accel[interval,:] := fill(nanValue,3);
      end for;
    elseif caseId == 22 then previous := fresh; expectedReason := 6; expectedProcessed := 0;
    elseif caseId == 23 then durations[count] := nanValue; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 24 then frameTime := infinity; expectedReason := 3; expectedProcessed := 0;
    elseif caseId == 26 then
      // Policy refusal occurs inside the filter after Commit consumes the factor.
      policy.filter.maximumNis := 0;
    end if;
    success := expectedReason == 0;
    actual := Batch(previous,rgb,depth,accel,gyro,durations,endpoints,count,frameTime,epoch,
      image,requested,forceCapture,graph,policy,depthUnits);
    checks[1] := actual.batchReason == expectedReason;
    checks[2] := actual.processedIntervals == expectedProcessed;
    checks[3] := actual.failedInterval == expectedFailed;
    checks[4] := actual.value.accepted == success;
    checks[5] := actual.value.predictionAccepted == (if success then 1 else 0)
      and actual.value.initializationAccepted == 0;
    checks[6] := actual.value.imageCompleted == (success and image)
      and (not (success and image) or (actual.value.observationAccepted == 1 and actual.value.matchCount >= 12));
    checks[7] := actual.value.mappingAccepted == (success and image);
    checks[8] := if success then RGBDGraphProcessing.Valid(actual.value.next)
      else RGBDCompleteStateComparison.Equal(actual.value.next,previous,1e-12);
    checks[9] := if success then actual.value.next.estimator.localization.steps
      == previous.estimator.localization.steps+count
      else actual.value.next.estimator.localization.steps == previous.estimator.localization.steps;
    checks[10] := if success then abs(actual.value.next.estimator.localization.predictionTime-frameTime) < 1e-12
      else actual.value.next.estimator.localization.predictionTime == previous.estimator.localization.predictionTime;
    checks[11] := if success and image then actual.value.next.estimator.localization.lastProcessedImageEpoch == epoch
      and abs(actual.value.next.estimator.localization.lastProcessedImageTime-frameTime) < 1e-12
      else actual.value.next.estimator.localization.lastProcessedImageEpoch == previous.estimator.localization.lastProcessedImageEpoch
        and actual.value.next.estimator.localization.lastProcessedImageTime == previous.estimator.localization.lastProcessedImageTime;
    checks[12] := if success and image then actual.value.next.estimator.localization.map.imageEpoch == epoch
      else actual.value.next.estimator.localization.map.imageEpoch == previous.estimator.localization.map.imageEpoch;
    intermediateHeld := true; expectedValid := true;
    if success then
      sequential := previous;
      for interval in 1:count loop
        expected := One(sequential,rgb,depth,accel[interval,:],gyro[interval,:],durations[interval],
          endpoints[interval],epoch,image and interval == count,interval == count,
          graph and interval == count,forceCapture,policy,depthUnits);
        expectedValid := expectedValid and expected.accepted and expected.predictionAccepted == 1;
        if interval < count then
          intermediateHeld := intermediateHeld and not expected.imageCompleted and not expected.mappingAccepted
            and not expected.graphCorrectionAccepted and expected.captureAccepted == 0
            and expected.next.estimator.localization.lastProcessedImageEpoch == previous.estimator.localization.lastProcessedImageEpoch
            and expected.next.estimator.localization.catalog.nextId == previous.estimator.localization.catalog.nextId
            and expected.next.attempt.graphRevision == previous.attempt.graphRevision;
        end if;
        sequential := expected.next;
      end for;
      checks[13] := expectedValid and RGBDCompleteStateComparison.Equal(actual.value.next,sequential,1e-12);
      checks[14] := DisplaysEqual(actual.value,expected);
      checks[15] := intermediateHeld;
    else
      displaysCleared := not actual.value.graphCorrectionAccepted and not actual.value.roundoffCertified
        and actual.value.selectionValid == 0 and actual.value.observationAccepted == 0
        and actual.value.captureAccepted == 0 and actual.value.matchCount == 0
        and actual.value.graphCostBefore == 0 and actual.value.graphCostAfter == 0
        and RGBDCompleteStateComparison.RealVector(actual.value.nextQuaternion,{1,0,0,0},1e-12)
        and RGBDCompleteStateComparison.RealMatrix(actual.value.features,zeros(RGBDKeyframes.featureCapacity,3),1e-12)
        and RGBDCompleteStateComparison.RealVector(actual.value.featureEnabled,zeros(RGBDKeyframes.featureCapacity),1e-12)
        and RGBDCompleteStateComparison.RealMatrix(actual.value.trackingCurrentPixel,zeros(RGBDKeyframes.featureCapacity,2),1e-12)
        and RGBDCompleteStateComparison.RealMatrix(actual.value.trackingReferencePixel,zeros(RGBDKeyframes.featureCapacity,2),1e-12)
        and RGBDCompleteStateComparison.RealVector(actual.value.trackingEnabled,zeros(RGBDKeyframes.featureCapacity),1e-12);
      checks[13] := displaysCleared;
      checks[14] := actual.value.next.captures.lastStep == previous.captures.lastStep
        and actual.value.next.estimator.localization.catalog.nextId == previous.estimator.localization.catalog.nextId;
      checks[15] := actual.value.next.attempt.graphRevision == previous.attempt.graphRevision
        and actual.value.next.estimator.correctionRevision == previous.estimator.correctionRevision;
    end if;
    checks[16] := if success then RGBDFastSLAMRawCompositionReference.MapGeometry(actual.value.next)
      else RGBDCompleteStateComparison.Equal(actual.value.next,previous,1e-12);
    checks[17] := if caseId == 25 then actual.value.graphCorrectionAccepted
      and actual.value.next.estimator.correctionRevision == 1
      and actual.value.next.attempt.graphRevision == 2
      elseif caseId == 26 then not actual.value.graphCorrectionAccepted
        and actual.value.next.estimator.correctionRevision == 0
        and actual.value.next.attempt.graphRevision == 2
        and actual.value.graphReason == 7 and actual.value.graphCommitReason == 5
        and actual.value.graphFilterReason == 3
      else not actual.value.graphCorrectionAccepted
        and actual.value.next.attempt.graphRevision == previous.attempt.graphRevision;
    checks[18] := if caseId == 25 or caseId == 26 then
      actual.value.next.estimator.localization.catalog.nextId == 3
        and actual.value.next.captures.sequences[2] == 3
        and actual.value.next.captures.epochs[2] == 2
        and actual.value.next.captures.lastStep == 3
        and actual.value.next.estimator.localization.graph.revision == 2
      else actual.value.next.estimator.localization.catalog.nextId == previous.estimator.localization.catalog.nextId;
    raw := {caseId,actual.batchReason,actual.processedIntervals,actual.failedInterval,
      if actual.value.accepted then 1 else 0,actual.value.next.estimator.localization.steps,
      actual.value.next.estimator.localization.predictionTime,
      actual.value.next.estimator.localization.lastProcessedImageEpoch,
      actual.value.next.estimator.localization.catalog.nextId,
      if actual.value.graphCorrectionAccepted then 1 else 0,actual.value.next.attempt.graphRevision,
      actual.value.graphReason,actual.value.graphCommitReason,actual.value.graphFilterReason,
      actual.value.observationAccepted,actual.value.captureAccepted,actual.value.matchCount,
      actual.value.next.estimator.localization.map.imageEpoch,actual.value.selectionValid};
  end Case;

  function Run
    input Integer caseIds[:]; input Real clock; input Boolean rawCamera = false;
    output Boolean checks[size(caseIds,1),checkCount];
    output Real raw[size(caseIds,1),metricCount];
  protected
    RGBDGraphProcessing.State fresh;
    RGBDFastSLAMRawCompositionReference.Outcome initialized;
    Real rgb[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth,if rawCamera then 3 else 4];
    Real depth[RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth];
    Real pixels[RGBDKeyframes.featureCapacity,2];
    Real infinity; Real nanValue;
    Boolean rowChecks[checkCount]; Real rowRaw[metricCount];
  algorithm
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator({1,-2,0.5},zeros(3),[0,-1,0;1,0,0;0,0,1],
        zeros(3),zeros(3),RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    (rgb,depth,pixels) := RGBDFastAdvanceReference.Image(false,if rawCamera then 3 else 4,if rawCamera then 0.001 else 1.0);
    initialized := RGBDFastSLAMRawCompositionReference.Process(fresh,rgb,depth,true,false,false,if rawCamera then 0.001 else 1.0);
    (rgb,depth,pixels) := RGBDFastAdvanceReference.Image(true,if rawCamera then 3 else 4,if rawCamera then 0.001 else 1.0);
    infinity := exp(1000.0+clock); nanValue := sin(infinity);
    for row in 1:size(caseIds,1) loop
      (rowChecks,rowRaw) := Case(caseIds[row],initialized.next,fresh,rgb,depth,nanValue,infinity,if rawCamera then 0.001 else 1.0);
      rowChecks[1] := rowChecks[1] and initialized.accepted and initialized.imageCompleted
        and RGBDGraphProcessing.Valid(initialized.next) and clock >= 0 and clock <= 0.001;
      for column in 1:checkCount loop checks[row,column] := rowChecks[column]; end for;
      for column in 1:metricCount loop raw[row,column] := rowRaw[column]; end for;
    end for;
  end Run;
end RGBDFastSLAMIntervalsReference;

model RGBDFastSLAMIntervalsSuccessAcceptance
  output Boolean checks[9,18]; output Real raw[9,19];
equation
  (checks,raw) = RGBDFastSLAMIntervalsReference.Run({1,2,3,4,5,20,21,25,26},time);
end RGBDFastSLAMIntervalsSuccessAcceptance;

model RGBDFastSLAMIntervalsRefusalAcceptance
  output Boolean checks[17,18]; output Real raw[17,19];
equation
  (checks,raw) = RGBDFastSLAMIntervalsReference.Run({6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24},time);
end RGBDFastSLAMIntervalsRefusalAcceptance;

model RGBDFastSLAMZ16IntervalsSuccessAcceptance
  output Boolean checks[9,18]; output Real raw[9,19];
equation
  (checks,raw) = RGBDFastSLAMIntervalsReference.Run({1,2,3,4,5,20,21,25,26},time,true);
end RGBDFastSLAMZ16IntervalsSuccessAcceptance;

model RGBDFastSLAMZ16IntervalsRefusalAcceptance
  output Boolean checks[17,18]; output Real raw[17,19];
equation
  (checks,raw) = RGBDFastSLAMIntervalsReference.Run({6,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24},time,true);
end RGBDFastSLAMZ16IntervalsRefusalAcceptance;
