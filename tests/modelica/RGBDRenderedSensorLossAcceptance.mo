// Native rendered flight replay with two deliberately unavailable measurements.
// Original RGB8/Z16 bytes and plant IMU are read unchanged, then Modelica imposes
// all-zero depth on camera epoch3 and uniform RGB on epoch4. These are controlled
// measurement faults, not claims that the source camera actually observed them.
// No oracle position, velocity or orientation enters any estimator invocation.
package RGBDRenderedSensorLossReference
  constant Integer frameCount = RGBDRenderedFlightSLAMReference.frameCount;
  constant Integer holdsPerFrame = RGBDRenderedFlightSLAMReference.holdsPerFrame;

  impure function Run
    input String datasetFile; input Real clock;
    input Integer imageSize[2]; input Integer rgbChannels; input Real depthUnits;
    output Boolean checks[32]; output Real raw[frameCount,24];
    output Real diagnostics[frameCount,16];
  protected
    Real calibrationMatrix[1,14]; Real calibration[14]; Real opticalToBody[3,3];
    Real initialImu[1,6]; Real acquisition[frameCount,2];
    Real intervals[(frameCount-1)*holdsPerFrame,8];
    Real rgb[imageSize[1],imageSize[2],rgbChannels]; Real depth[imageSize[1],imageSize[2]];
    Real scores[imageSize[1]*imageSize[2]];
    Real selected[RGBDKeyframes.featureCapacity,3]; Real selectedCount; Real selectedValid;
    Real pairs[RGBDKeyframes.featureCapacity,7]; Real rowDiagnostics[16]; Real rowRaw[24];
    Real oldTrace; Real newTrace;
    Integer epoch; Integer observations; Integer captures; Integer faults; Integer processed;
    Real frameTime; Boolean blind;
    RGBDGraphProcessing.State previous;
    RGBDFastSLAMRawCompositionReference.Outcome current;
    RGBDRenderedCitySLAMReference.BatchResult batch;
    RGBDRenderedCitySLAMReference.BatchResult imuOnly;
    RGBDRenderedCitySLAMReference.BatchResult repeated;
    RGBDGraphCaptureLedger.State expectedLedger;
  algorithm
    Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REPLAY_BEGIN","flight-replay-trace.log");
    checks := fill(true,32); raw := zeros(frameCount,24); diagnostics := zeros(frameCount,16);
    observations := 0; captures := 0; faults := 0; processed := 0;
    calibrationMatrix := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"calibration",1,14,false);
    calibration := calibrationMatrix[1,:];
    opticalToBody := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"opticalToBody",3,3,false);
    initialImu := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"initialImu",1,6,false);
    acquisition := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"acquisition",frameCount,2,false);
    intervals := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"imuIntervals",
      (frameCount-1)*holdsPerFrame,8,false);
    previous := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),zeros(3),identity(3),zeros(3),zeros(3),
        RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    checks[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(previous)
      and acquisition[1,1] == 0 and acquisition[1,2] == 0
      and imageSize[1] == D435ImageProfile.height and imageSize[2] == D435ImageProfile.width
      and rgbChannels == D435ImageProfile.colorChannels and depthUnits == D435ImageProfile.depthUnits;
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,1,imageSize,rgbChannels);
    current := RGBDRenderedFlightSLAMReference.Initialize(previous,rgb,depth,calibration,opticalToBody,initialImu[1,:],depthUnits);
    checks[2] := current.accepted and current.imageCompleted and current.mappingAccepted
      and current.initializationAccepted == 1 and current.captureAccepted == 1
      and current.predictionAccepted == 0 and current.observationAccepted == 0;
    checks[3] := RGBDGraphProcessing.Valid(current.next) and current.next.vocabulary.ready
      and current.next.vocabulary.count >= 8 and current.next.estimator.localization.catalog.nextId == 2
      and RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled) >= 12;
    rowRaw := RGBDRenderedCitySLAMReference.Metrics(current,0,0,0,0,0);
    raw[1,:] := rowRaw; previous := current.next;
    for frame in 2:frameCount loop
      epoch := integer(acquisition[frame,1]); frameTime := acquisition[frame,2];
      blind := frame == 4 or frame == 5;
      checks[4] := checks[4] and acquisition[frame,1] == frame-1 and epoch == frame-1
        and abs(frameTime-(frame-1)/30.0) < 1e-12;
      for hold in 1:holdsPerFrame loop
        checks[4] := checks[4]
          and abs(intervals[(frame-2)*holdsPerFrame+hold,1]-((frame-2)*holdsPerFrame+hold)/90.0) < 1e-12
          and abs(intervals[(frame-2)*holdsPerFrame+hold,2]-1.0/90.0) < 1e-12;
      end for;
      (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,frame,imageSize,rgbChannels);
      if frame == 4 then
        depth := zeros(imageSize[1],imageSize[2]);
      elseif frame == 5 then
        rgb := fill(128.0,imageSize[1],imageSize[2],rgbChannels);
      end if;
      batch := RGBDRenderedFlightSLAMReference.Advance(previous,rgb,depth,calibration,opticalToBody,
        intervals[(frame-2)*holdsPerFrame+1:(frame-1)*holdsPerFrame,:],epoch,frameTime,depthUnits);
      current := batch.value;
      scores := FastFrameScores(rgb,true);
      scores := RGBDDepthQualifiedScores(depth,scores,
        {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
        calibration[13],calibration[14],calibration[8],calibration[9],calibration[7],true,depthUnits=depthUnits);
      (selected,selectedCount,selectedValid) := SelectRasterFeatures(scores,size(rgb,2),size(rgb,1),
        RGBDKeyframes.featureCapacity,3,{18.0,0.0,1e8,3.0,RGBDKeyframes.featureCapacity,1.0,3.0,3.0},false,true);
      (rowDiagnostics,pairs) := RGBDRenderedVisualDiagnostics.Evaluate(previous,rgb,depth,
        selected[:,1:2],selectedCount,calibration,opticalToBody,depthUnits);
      diagnostics[frame,:] := rowDiagnostics;
      checks[5] := checks[5] and batch.batchReason == 0 and batch.failedInterval == 0
        and batch.processedIntervals == holdsPerFrame;
      checks[6] := checks[6] and current.accepted and current.publicationReason == 0
        and current.ledgerReason == 0 and current.imageCompleted and current.predictionAccepted == 1
        and current.initializationAccepted == 0;
      checks[7] := checks[7] and current.next.estimator.localization.steps == 1+holdsPerFrame*(frame-1)
        and abs(current.next.estimator.localization.predictionTime-frameTime) < 1e-12
        and current.next.estimator.localization.lastProcessedImageEpoch == epoch
        and current.next.estimator.localization.lastProcessedImageTime == frameTime;
      checks[8] := checks[8] and RGBDGraphProcessing.Valid(current.next);
      checks[9] := checks[9] and RGBDCompleteStateComparison.EqualVocabulary(current.next.vocabulary,previous.vocabulary,1e-12);
      expectedLedger := previous.captures;
      expectedLedger.lastStep := 1+holdsPerFrame*(frame-1);
      checks[10] := checks[10]
        and RGBDCompleteStateComparison.EqualCatalog(current.next.estimator.localization.catalog,previous.estimator.localization.catalog,1e-12)
        and RGBDCompleteStateComparison.EqualGraphState(current.next.estimator.localization.graph,previous.estimator.localization.graph,1e-12)
        and RGBDCompleteStateComparison.EqualCaptureLedger(current.next.captures,expectedLedger,1e-12)
        and RGBDCompleteStateComparison.EqualPoseView(current.next.estimator.poses,previous.estimator.poses,1e-12);
      checks[11] := checks[11] and RGBDFastSLAMRawCompositionReference.MapGeometry(current.next);
      checks[12] := checks[12] and RGBDLocalizationInitializeTests.CloseVector(current.nextQuaternion,
        RGBDLocalizationAdvanceReference.Quaternion(current.next.estimator.localization.estimator.rotation),1e-10);
      checks[13] := checks[13] and max(abs(current.next.estimator.localization.estimator.position)) < 10;
      checks[14] := checks[14] and current.selectionValid == 1 and selectedValid == 1
        and selectedCount == RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled);
      if blind then
        faults := faults+1;
        checks[15] := checks[15] and selectedCount == 0 and current.matchCount == 0
          and RGBDFastSLAMRawCompositionReference.SumMask(current.trackingEnabled) == 0;
        checks[16] := checks[16] and current.observationAccepted == 0 and current.captureAccepted == 0
          and not current.mappingAccepted and not current.graphCorrectionAccepted;
        checks[17] := checks[17] and RGBDCompleteStateComparison.EqualMappingState(
          current.next.estimator.localization.map,previous.estimator.localization.map,1e-12);
        checks[18] := checks[18] and RGBDLocalizationCatalog.ReferenceHeld(
          previous.estimator.localization.estimator,current.next.estimator.localization.estimator)
          and RGBDCompleteStateComparison.RealMatrix(current.next.estimator.localization.estimator.referenceDescriptor,
            previous.estimator.localization.estimator.referenceDescriptor,1e-12)
          and RGBDCompleteStateComparison.RealMatrix(current.next.estimator.localization.estimator.referencePoint,
            previous.estimator.localization.estimator.referencePoint,1e-12);
        // Twin uses the same actual three held IMU samples, with no image request.
        // It checks separation of visual publication from inertial prediction;
        // the lower filter mathematics has its own independent reference tests.
        imuOnly := RGBDRenderedFlightSLAMReference.Advance(previous,rgb,depth,calibration,opticalToBody,
          intervals[(frame-2)*holdsPerFrame+1:(frame-1)*holdsPerFrame,:],epoch,frameTime,depthUnits,imageRequested=false);
        checks[19] := checks[19] and imuOnly.value.accepted and imuOnly.batchReason == 0
          and imuOnly.processedIntervals == holdsPerFrame and not imuOnly.value.imageCompleted;
        checks[20] := checks[20] and RGBDCompleteStateComparison.EqualLocalizationEstimator(
          current.next.estimator.localization.estimator,imuOnly.value.next.estimator.localization.estimator,1e-12);
        oldTrace := 0; newTrace := 0;
        for axis in 1:6 loop
          oldTrace := oldTrace+previous.estimator.localization.estimator.covariance[axis,axis];
          newTrace := newTrace+current.next.estimator.localization.estimator.covariance[axis,axis];
        end for;
        checks[21] := checks[21] and newTrace > oldTrace;
        checks[22] := checks[22]
          and current.next.estimator.localization.estimator.lastUsedEpoch == previous.estimator.localization.estimator.lastUsedEpoch
          and current.next.estimator.localization.estimator.referenceUsed == previous.estimator.localization.estimator.referenceUsed;
        // The bad image still completes its epoch exactly once. A duplicate
        // batch must refuse and preserve every field of the resulting State.
        repeated := RGBDRenderedFlightSLAMReference.Advance(current.next,rgb,depth,calibration,opticalToBody,
          intervals[(frame-2)*holdsPerFrame+1:(frame-1)*holdsPerFrame,:],epoch,frameTime,depthUnits);
        checks[23] := checks[23] and not repeated.value.accepted and not repeated.value.imageCompleted
          and repeated.processedIntervals == 0 and repeated.failedInterval == 0
          and repeated.batchReason <> 0 and RGBDCompleteStateComparison.Equal(repeated.value.next,current.next,1e-12);
        checks[31] := checks[31] and rowDiagnostics[10] == 0 and rowDiagnostics[1] == 0 and rowDiagnostics[5] == 0;
      else
        checks[26] := checks[26] and current.observationAccepted+current.captureAccepted == 1
          and current.mappingAccepted and selectedCount >= 12;
        if frame == 6 then
          checks[24] := current.observationAccepted == 1 and current.captureAccepted == 0
            and current.matchCount >= 3 and RGBDFastSLAMRawCompositionReference.SumMask(current.trackingEnabled) >= 3;
          checks[25] := previous.estimator.localization.estimator.referenceEpoch == 2
            and current.next.estimator.localization.estimator.referenceEpoch == 2
            and current.next.estimator.localization.estimator.lastUsedEpoch == epoch;
        end if;
        checks[32] := checks[32] and (current.observationAccepted == 0 or (rowDiagnostics[1] == 1 and rowDiagnostics[7] == 1));
      end if;
      observations := observations+integer(current.observationAccepted);
      captures := captures+integer(current.captureAccepted); processed := processed+batch.processedIntervals;
      rowRaw := RGBDRenderedCitySLAMReference.Metrics(current,epoch,frameTime,
        batch.batchReason,batch.processedIntervals,batch.failedInterval);
      raw[frame,:] := rowRaw; previous := current.next;
      Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REPLAY_FRAME " + String(epoch)
        + " observation=" + String(current.observationAccepted) + " matches=" + String(current.matchCount),"flight-replay-trace.log");
    end for;
    checks[27] := observations == 5 and captures == 5;
    checks[28] := faults == 2;
    checks[29] := processed == (frameCount-1)*holdsPerFrame and previous.estimator.localization.steps == 37;
    checks[30] := RGBDFastSLAMRawCompositionReference.SumMask(previous.estimator.localization.map.occupied) > 0
      and previous.estimator.localization.map.imageEpoch == frameCount-1;
    Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REPLAY_END observations=" + String(observations)
      + " captures=" + String(captures),"flight-replay-trace.log");
  end Run;
end RGBDRenderedSensorLossReference;

model RGBDRenderedSensorLossAcceptance
  parameter String datasetFile = "";
  parameter Integer imageSize[2] = {D435ImageProfile.height,D435ImageProfile.width};
  parameter Integer rgbChannels = D435ImageProfile.colorChannels;
  parameter Real depthUnits = D435ImageProfile.depthUnits;
  output Boolean checks[32]; output Real raw[13,24]; output Real diagnostics[13,16];
algorithm
  when initial() then
    (checks,raw,diagnostics) := RGBDRenderedSensorLossReference.Run(datasetFile,time,imageSize,rgbChannels,depthUnits);
  end when;
end RGBDRenderedSensorLossAcceptance;
