// Reference execution of actual Rumoca plant IMU and Three.js RGB-D bytes.
// Oracle poses are separate evaluation metadata and are never read here.
package RGBDRenderedFlightSLAMReference
  constant Integer height = RGBDKeyframes.imageHeight;
  constant Integer width = RGBDKeyframes.imageWidth;
  constant Integer frameCount = 13;
  constant Integer holdsPerFrame = 3;
  constant Integer maximumIntervals = 36;

  function Initialize
    input RGBDGraphProcessing.State previous;
    input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
    input Real calibration[14]; input Real opticalToBody[3,3];
    input Real initialImu[6];
    input Real depthUnits = 1.0;
    output RGBDFastSLAMRawCompositionReference.Outcome result;
  algorithm
    (result.next,result.accepted,result.imageCompleted,result.mappingAccepted,
      result.graphCorrectionAccepted,result.roundoffCertified,result.publicationReason,
      result.ledgerReason,result.vocabularyReason,result.graphReason,result.graphCommitReason,
      result.graphFilterReason,result.covarianceStatus,result.graphCostBefore,result.graphCostAfter,
      result.nextQuaternion,result.selectionValid,result.predictionAccepted,result.initializationAccepted,
      result.observationAccepted,result.captureAccepted,result.matchCount,result.features,result.featureEnabled,
      result.trackingCurrentPixel,result.trackingReferencePixel,result.trackingEnabled) := InitializeFastSLAM(
        previous=previous,rgb=rgb,depth=depth,
        rgbCalibration={calibration[5],calibration[6],calibration[3],calibration[4]},
        depthCalibration=calibration[1:4],baseline=calibration[7],
        disparityNoise=calibration[8],noiseReferenceFx=calibration[9],
        opticalToBody=opticalToBody,cameraOriginBody=calibration[10:12],
        accel=initialImu[1:3],gyro=initialImu[4:6],gravity={0,0,-9.81},density=fill(0.01,12),
        h=0,intervalTime=0,imageEpoch=0,graphCorrectionRequested=false,depthUnits=depthUnits);
  end Initialize;

  function Advance
    input RGBDGraphProcessing.State previous;
    input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
    input Real calibration[14]; input Real opticalToBody[3,3];
    input Real measuredIntervals[:,8] "time, dt, held specific force XYZ, held gyro XYZ";
    input Integer epoch; input Real frameTime;
    input Real depthUnits = 1.0;
    output RGBDRenderedCitySLAMReference.BatchResult result;
    input Boolean imageRequested = true;
    input Boolean graphCorrectionRequested = false;
  protected
    Real accel[maximumIntervals,3]; Real gyro[maximumIntervals,3];
    Real durations[maximumIntervals]; Real endpoints[maximumIntervals];
  algorithm
    accel := zeros(maximumIntervals,3); gyro := zeros(maximumIntervals,3);
    durations := zeros(maximumIntervals); endpoints := zeros(maximumIntervals);
    assert(size(measuredIntervals,1) >= 1 and size(measuredIntervals,1) <= maximumIntervals,
      "Measured interval count exceeds the authored batch capacity");
    for interval in 1:size(measuredIntervals,1) loop
      endpoints[interval] := measuredIntervals[interval,1];
      durations[interval] := measuredIntervals[interval,2];
      accel[interval,:] := measuredIntervals[interval,3:5];
      gyro[interval,:] := measuredIntervals[interval,6:8];
    end for;
    (result.value.next,result.value.accepted,result.value.imageCompleted,result.value.mappingAccepted,
      result.value.graphCorrectionAccepted,result.value.roundoffCertified,result.value.publicationReason,
      result.value.ledgerReason,result.value.vocabularyReason,result.value.graphReason,result.value.graphCommitReason,
      result.value.graphFilterReason,result.value.covarianceStatus,result.value.graphCostBefore,result.value.graphCostAfter,
      result.value.nextQuaternion,result.value.selectionValid,result.value.predictionAccepted,result.value.initializationAccepted,
      result.value.observationAccepted,result.value.captureAccepted,result.value.matchCount,result.value.features,result.value.featureEnabled,
      result.value.trackingCurrentPixel,result.value.trackingReferencePixel,result.value.trackingEnabled,
      result.processedIntervals,result.failedInterval,result.batchReason) := AdvanceFastSLAMIntervals(
        previous=previous,rgb=rgb,depth=depth,
        rgbCalibration={calibration[5],calibration[6],calibration[3],calibration[4]},
        depthCalibration=calibration[1:4],baseline=calibration[7],
        disparityNoise=calibration[8],noiseReferenceFx=calibration[9],
        opticalToBody=opticalToBody,cameraOriginBody=calibration[10:12],
        accel=accel,gyro=gyro,gravity={0,0,-9.81},density=fill(0.01,12),
        durations=durations,intervalTimes=endpoints,intervalCount=size(measuredIntervals,1),frameTime=frameTime,
        imageEpoch=epoch,imageRequested=imageRequested,localCaptureRequested=true,
        graphCorrectionRequested=graphCorrectionRequested,depthUnits=depthUnits);
  end Advance;

  function RefusalHeld
    input RGBDGraphProcessing.State previous;
    input RGBDGraphProcessing.State predicted;
    input RGBDGraphProcessing.State current;
    input Integer epoch; input Real frameTime;
    input Real relativeValid;
    output Boolean held;
  protected
    RGBDGraphProcessing.State expected;
    Real pairValid; Real pairEligible; Real captureFresh;
  algorithm
    expected := predicted;
    expected.estimator.localization.lastProcessedImageEpoch := epoch;
    expected.estimator.localization.lastProcessedImageTime := frameTime;
    (pairValid,pairEligible,captureFresh) := SchmidtImagePairEligibility(
      previous.estimator.localization.estimator.referenceAvailable,
      previous.estimator.localization.estimator.referenceUsed,
      previous.estimator.localization.estimator.referenceEpoch,epoch,
      previous.estimator.localization.estimator.lastUsedEpoch);
    // A rejected eligible innovation consumes its image once, without correction.
    if relativeValid == 1 and pairEligible == 1 then
      expected.estimator.localization.estimator.lastUsedEpoch := epoch;
      expected.estimator.localization.estimator.referenceUsed := 1;
    end if;
    held := RGBDCompleteStateComparison.Equal(current,expected,1e-12);
  end RefusalHeld;

  impure function Run
    input String datasetFile; input Real clock;
    input Integer imageSize[2] = {height,width};
    input Integer rgbChannels = 4;
    input Real depthUnits = 1.0;
    output Boolean checks[24]; output Real raw[replayFrames,24];
    output Real diagnostics[replayFrames,16];
    input String pairDiagnosticsFile = "";
    input Integer replayFrames = frameCount;
    input Boolean extended = false;
    input Boolean captureDiagnostics = false;
    input Integer holdsPerFrame = RGBDRenderedFlightSLAMReference.holdsPerFrame;
    input Boolean requireLoopClosure = false;
  protected
    Real calibrationMatrix[1,14]; Real calibration[14]; Real opticalToBody[3,3];
    Real initialImu[1,6]; Real acquisition[replayFrames,2];
    Real measuredIntervals[(replayFrames-1)*holdsPerFrame,8];
    Real rgb[imageSize[1],imageSize[2],rgbChannels]; Real depth[imageSize[1],imageSize[2]];
    Real scores[imageSize[1]*imageSize[2]]; Real selectedFeatures[RGBDKeyframes.featureCapacity,3];
    Real selectionCount; Real selectionStatus; Real rowRaw[24]; Real rowDiagnostics[16];
    Real matchedPairs[RGBDKeyframes.featureCapacity,7]; Boolean pairsWritten;
    Real captureStages[26]; Boolean captureTraced; String captureMessage;
    Integer verifiedLoops; Integer loopCorrections; Boolean firstViewLoop;
    Integer refusals; Integer emptyFrames; Integer recoveredObservations;
    Integer epoch; Integer observations; Integer captures; Real frameTime;
    RGBDGraphProcessing.State fresh; RGBDGraphProcessing.State previous;
    RGBDFastSLAMRawCompositionReference.Outcome initialized;
    RGBDFastSLAMRawCompositionReference.Outcome current;
    RGBDRenderedCitySLAMReference.BatchResult batch;
    RGBDRenderedCitySLAMReference.BatchResult imuOnly;
  algorithm
    Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REPLAY_BEGIN","flight-replay-trace.log");
    assert(replayFrames >= frameCount and (extended or replayFrames == frameCount),
      "Longer captures require the extended reference contract");
    checks := fill(true,24); raw := zeros(replayFrames,24); diagnostics := zeros(replayFrames,16);
    verifiedLoops := 0; loopCorrections := 0; firstViewLoop := false;
    refusals := 0; emptyFrames := 0; recoveredObservations := 0;
    calibrationMatrix := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"calibration",1,14,false);
    calibration := calibrationMatrix[1,:];
    opticalToBody := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"opticalToBody",3,3,false);
    initialImu := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"initialImu",1,6,false);
    acquisition := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"acquisition",replayFrames,2,false);
    measuredIntervals := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"imuIntervals",
      (replayFrames-1)*holdsPerFrame,8,false);
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),zeros(3),identity(3),zeros(3),zeros(3),
        RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    checks[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(fresh)
      and acquisition[1,1] == 0 and acquisition[1,2] == 0;
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,1,imageSize,rgbChannels);
    initialized := Initialize(fresh,rgb,depth,calibration,opticalToBody,initialImu[1,:],depthUnits);
    checks[2] := initialized.accepted and initialized.publicationReason == 0
      and initialized.ledgerReason == 0 and initialized.vocabularyReason == 1;
    checks[3] := initialized.imageCompleted and initialized.mappingAccepted
      and initialized.initializationAccepted == 1 and initialized.captureAccepted == 1
      and initialized.predictionAccepted == 0 and initialized.observationAccepted == 0;
    checks[4] := initialized.selectionValid == 1
      and RGBDFastSLAMRawCompositionReference.SumMask(initialized.featureEnabled) >= 12
      and initialized.next.vocabulary.ready and initialized.next.vocabulary.count >= 8;
    checks[5] := RGBDGraphProcessing.Valid(initialized.next)
      and initialized.next.estimator.localization.steps == 1
      and initialized.next.estimator.localization.estimator.referenceEpoch == 0
      and initialized.next.estimator.localization.estimator.lastUsedEpoch == -1
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.position,zeros(3),1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.velocity,zeros(3),1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(initialized.next.estimator.localization.estimator.rotation,identity(3),1e-12);
    rowRaw := RGBDRenderedCitySLAMReference.Metrics(initialized,0,0,0,0,0);
    for column in 1:24 loop raw[1,column] := rowRaw[column]; end for;
    previous := initialized.next; observations := 0; captures := 0;
    captureTraced := false;
    for frame in 2:replayFrames loop
      epoch := integer(acquisition[frame,1]); frameTime := acquisition[frame,2];
      checks[1] := checks[1] and acquisition[frame,1] == frame-1
        and epoch == frame-1 and abs(frameTime-(frame-1)*holdsPerFrame/90.0) < 1e-12;
      for interval in 1:holdsPerFrame loop
        checks[6] := checks[6]
          and abs(measuredIntervals[(frame-2)*holdsPerFrame+interval,1]
            -((frame-2)*holdsPerFrame+interval)/90.0) < 1e-12
          and abs(measuredIntervals[(frame-2)*holdsPerFrame+interval,2]-1.0/90.0) < 1e-12;
      end for;
      (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,frame,imageSize,rgbChannels);
      batch := Advance(previous,rgb,depth,calibration,opticalToBody,
        measuredIntervals[(frame-2)*holdsPerFrame+1:(frame-1)*holdsPerFrame,:],epoch,frameTime,depthUnits,
        graphCorrectionRequested=extended);
      current := batch.value;
      if requireLoopClosure then
        if current.next.estimator.localization.catalog.nextId <> previous.estimator.localization.catalog.nextId then
          verifiedLoops := 0;
          for edge in 1:RGBDGraphMeasurements.edgeCapacity loop
            if current.next.estimator.localization.graph.edges[edge].enabled
                and current.next.estimator.localization.graph.edges[edge].kind == 2 then
              verifiedLoops := verifiedLoops+1;
              firstViewLoop := firstViewLoop
                or current.next.estimator.localization.graph.edges[edge].referenceId == 1;
            end if;
          end for;
          Modelica.Utilities.Streams.print("RENDERED_FLIGHT_LOOP_CAPTURE epoch=" + String(epoch)
            + " time=" + String(frameTime) + " loops=" + String(verifiedLoops)
            + " graphReason=" + String(current.graphReason),"flight-replay-trace.log");
        end if;
        if current.graphCorrectionAccepted and verifiedLoops > 0 then
          loopCorrections := loopCorrections+1;
        end if;
      end if;
      scores := FastFrameScores(rgb,true);
      scores := RGBDDepthQualifiedScores(depth,scores,
        {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
        calibration[13],calibration[14],calibration[8],calibration[9],calibration[7],true,depthUnits=depthUnits);
      (selectedFeatures,selectionCount,selectionStatus) := SelectRasterFeatures(scores,
        size(rgb,2),size(rgb,1),RGBDKeyframes.featureCapacity,3,
        {18.0,0.0,1e8,3.0,RGBDKeyframes.featureCapacity,1.0,3.0,3.0},false,true);
      if captureDiagnostics and not captureTraced and current.accepted
        and current.imageCompleted and not current.mappingAccepted then
        // Log the first refusal only; retain every original numerical gate.
        // Mapping refusal prevents graph correction, so this is the actual
        // accepted producer pose/covariance used to build the measurement.
        captureStages := RGBDRenderedVisualDiagnostics.CaptureFailure(previous,
          current.next.estimator.localization.estimator,rgb,depth,
          selectedFeatures[:,1:2],selectionCount,calibration,opticalToBody,epoch,frameTime,
          {current.observationAccepted,current.captureAccepted},depthUnits);
        captureMessage := "RENDERED_FLIGHT_CAPTURE_FAILURE epoch="+String(epoch)+" stages=";
        for stage in 1:size(captureStages,1) loop
          captureMessage := captureMessage+(if stage == 1 then "" else ",")+String(captureStages[stage]);
        end for;
        Modelica.Utilities.Streams.print(captureMessage,"flight-replay-trace.log");
        captureTraced := true;
      end if;
      (rowDiagnostics,matchedPairs) := RGBDRenderedVisualDiagnostics.Evaluate(previous,rgb,depth,
        selectedFeatures[1:RGBDKeyframes.featureCapacity,1:2],selectionCount,calibration,opticalToBody,depthUnits);
      if frame == 2 and pairDiagnosticsFile <> "" then
        pairsWritten := Modelica.Utilities.Streams.writeRealMatrix(pairDiagnosticsFile,"pairs",matchedPairs,false);
        assert(pairsWritten,"Could not retain actual matched point pairs");
      end if;
      for column in 1:16 loop diagnostics[frame,column] := rowDiagnostics[column]; end for;
      checks[6] := checks[6] and batch.batchReason == 0
        and batch.processedIntervals == holdsPerFrame and batch.failedInterval == 0;
      checks[7] := checks[7] and current.accepted and current.publicationReason == 0 and current.imageCompleted;
      checks[8] := checks[8] and current.predictionAccepted == 1 and current.initializationAccepted == 0;
      checks[9] := checks[9] and current.selectionValid == 1 and selectionStatus == 1
        and selectionCount <= RGBDKeyframes.featureCapacity
        and (requireLoopClosure or RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled) >= 12)
        and selectionCount == RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled)
        and rowDiagnostics[10] == RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled);
      if requireLoopClosure and current.observationAccepted == 0 and current.captureAccepted == 0 then
        refusals := refusals+1;
        if selectionCount == 0 then emptyFrames := emptyFrames+1; end if;
        imuOnly := Advance(previous,rgb,depth,calibration,opticalToBody,
          measuredIntervals[(frame-2)*holdsPerFrame+1:(frame-1)*holdsPerFrame,:],epoch,frameTime,
          depthUnits,imageRequested=false);
        checks[10] := checks[10] and not current.mappingAccepted and not current.graphCorrectionAccepted
          and imuOnly.value.accepted and not imuOnly.value.imageCompleted
          and imuOnly.batchReason == 0 and imuOnly.processedIntervals == holdsPerFrame
          and imuOnly.failedInterval == 0
          and RefusalHeld(previous,imuOnly.value.next,current.next,epoch,frameTime,rowDiagnostics[5]);
      else
        checks[10] := checks[10] and current.observationAccepted+current.captureAccepted == 1;
        if refusals > 0 and current.observationAccepted == 1 then
          recoveredObservations := recoveredObservations+1;
        end if;
      end if;
      checks[11] := checks[11] and rowDiagnostics[8] == current.matchCount
        and (current.observationAccepted == 0 or (current.matchCount >= 3
          and RGBDFastSLAMRawCompositionReference.SumMask(current.trackingEnabled) >= 3));
      checks[12] := checks[12] and RGBDGraphProcessing.Valid(current.next);
      checks[13] := checks[13] and current.next.estimator.localization.steps == 1+holdsPerFrame*(frame-1)
        and abs(current.next.estimator.localization.predictionTime-frameTime) < 1e-12
        and current.next.estimator.localization.lastProcessedImageEpoch == epoch
        and abs(current.next.estimator.localization.lastProcessedImageTime-frameTime) < 1e-12;
      checks[14] := checks[14]
        and RGBDLocalizationInitializeTests.CloseVector(current.next.estimator.localization.estimator.referenceRgbCalibration,
          {calibration[5],calibration[6],calibration[3],calibration[4]},1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(current.next.estimator.localization.estimator.referenceDepthCalibration,calibration[1:4],1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(current.next.estimator.localization.estimator.referenceOpticalToBody,opticalToBody,1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(current.next.estimator.localization.estimator.referenceCameraOriginBody,calibration[10:12],1e-12)
        and current.next.estimator.localization.estimator.referenceDisparityNoise == calibration[8]
        and current.next.estimator.localization.estimator.referenceNoiseReferenceFx == calibration[9]
        and current.next.estimator.localization.estimator.referenceBaseline == calibration[7];
      checks[15] := checks[15] and current.next.vocabulary.count == initialized.next.vocabulary.count
        and RGBDLocalizationInitializeTests.CloseMatrix(current.next.vocabulary.words,initialized.next.vocabulary.words,1e-12);
      checks[16] := checks[16] and (if extended then
        current.next.estimator.localization.catalog.nextId >= previous.estimator.localization.catalog.nextId
        and current.next.estimator.correctionRevision >= previous.estimator.correctionRevision
        else current.next.estimator.localization.catalog.nextId == 2
          and not current.graphCorrectionAccepted and current.next.estimator.correctionRevision == 0);
      checks[17] := checks[17] and RGBDFastSLAMRawCompositionReference.MapGeometry(current.next);
      checks[18] := checks[18] and (if requireLoopClosure and not current.mappingAccepted then
        RGBDCompleteStateComparison.EqualMappingState(current.next.estimator.localization.map,
          previous.estimator.localization.map,1e-12)
        else current.mappingAccepted and current.next.estimator.localization.map.imageEpoch == epoch)
        and RGBDFastSLAMRawCompositionReference.SumMask(current.next.estimator.localization.map.occupied) > 0;
      checks[19] := checks[19] and RGBDLocalizationInitializeTests.CloseVector(current.nextQuaternion,
        RGBDLocalizationAdvanceReference.Quaternion(current.next.estimator.localization.estimator.rotation),1e-10);
      checks[20] := checks[20] and RGBDLocalizationCatalog.ValidEstimator(current.next.estimator.localization.estimator);
      checks[21] := checks[21] and (current.observationAccepted == 0
        or current.next.estimator.localization.estimator.lastUsedEpoch == epoch)
        and (current.captureAccepted == 0 or (current.next.estimator.localization.estimator.referenceEpoch == epoch
          and current.next.estimator.localization.estimator.referenceUsed == 0));
      checks[22] := checks[22] and max(abs(current.next.estimator.localization.estimator.position)) < 10;
      checks[24] := checks[24] and (rowDiagnostics[1] < 0.5
        or RGBDFastSLAMRawCompositionReference.SumMask(current.trackingEnabled) == rowDiagnostics[14])
        and (current.observationAccepted == 0 or (rowDiagnostics[1] == 1 and rowDiagnostics[7] == 1));
      observations := observations+integer(current.observationAccepted);
      captures := captures+integer(current.captureAccepted);
      rowRaw := RGBDRenderedCitySLAMReference.Metrics(current,epoch,frameTime,
        batch.batchReason,batch.processedIntervals,batch.failedInterval);
      for column in 1:24 loop raw[frame,column] := rowRaw[column]; end for;
      previous := current.next;
      Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REPLAY_FRAME " + String(frame-1)
        + " observation=" + String(current.observationAccepted)
        + " matches=" + String(current.matchCount),"flight-replay-trace.log");
    end for;
    // Keep the original short-flight contract exactly. Longer flights admit
    // source-owned keyframe/graph decisions and check useful completed updates.
    checks[23] := if extended then observations+captures+refusals == replayFrames-1
      and observations > 0 and captures > 0 else observations == 6 and captures == 6;
    if requireLoopClosure then
      checks[23] := checks[23] and verifiedLoops > 0 and firstViewLoop and loopCorrections > 0
        and refusals > 0 and emptyFrames > 0 and recoveredObservations > 0
        and previous.estimator.localization.map.imageEpoch == replayFrames-1
        and RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled) >= 12;
      Modelica.Utilities.Streams.print("RENDERED_FLIGHT_LOOP_SUMMARY loops=" + String(verifiedLoops)
        + " firstView=" + String(if firstViewLoop then 1 else 0)
        + " corrections=" + String(loopCorrections),"flight-replay-trace.log");
      Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REVISIT_SUMMARY refusals=" + String(refusals)
        + " empty=" + String(emptyFrames) + " recoveries=" + String(recoveredObservations),"flight-replay-trace.log");
    end if;
    Modelica.Utilities.Streams.print("RENDERED_FLIGHT_REPLAY_END observations=" + String(observations)
      + " captures=" + String(captures),"flight-replay-trace.log");
  end Run;
end RGBDRenderedFlightSLAMReference;

model RGBDRenderedFlightSLAMAcceptance
  parameter String datasetFile = "";
  parameter Integer imageSize[2] = {RGBDKeyframes.imageHeight,RGBDKeyframes.imageWidth};
  parameter Integer rgbChannels = 4;
  parameter Real depthUnits = 1.0;
  parameter String pairDiagnosticsFile = "";
  parameter Integer replayFrames = RGBDRenderedFlightSLAMReference.frameCount;
  parameter Boolean extended = false;
  parameter Boolean captureDiagnostics = false;
  parameter Integer holdsPerFrame = RGBDRenderedFlightSLAMReference.holdsPerFrame;
  parameter Boolean requireLoopClosure = false;
  output Boolean checks[24]; output Real raw[replayFrames,24]; output Real diagnostics[replayFrames,16];
algorithm
  // The dataset contains the complete changing flight. Replay it at the
  // initial event, then hold its results rather than rerunning it at every
  // solver/initialization evaluation of this test harness.
  when initial() then
    (checks,raw,diagnostics) := RGBDRenderedFlightSLAMReference.Run(datasetFile,time,imageSize,rgbChannels,depthUnits,
      pairDiagnosticsFile=pairDiagnosticsFile,replayFrames=replayFrames,extended=extended,
      captureDiagnostics=captureDiagnostics,holdsPerFrame=holdsPerFrame,requireLoopClosure=requireLoopClosure);
  end when;
end RGBDRenderedFlightSLAMAcceptance;
