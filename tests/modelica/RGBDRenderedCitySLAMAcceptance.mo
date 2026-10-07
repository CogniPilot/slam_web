// Native reference replay of actual GPU-rendered bytes, not a WASM loader.
// The four imposed views describe a tiny kinematic translation, not a simulated
// quadrotor flight. No renderer oracle enters the estimator. Initial velocity
// and held accelerations below explicitly describe this test's motion plan.
package RGBDRenderedCitySLAMReference
  constant Integer height = RGBDKeyframes.imageHeight;
  constant Integer width = RGBDKeyframes.imageWidth;
  constant Integer maximumIntervals = 36;
  record BatchResult
    RGBDFastSLAMRawCompositionReference.Outcome value;
    Integer processedIntervals; Integer failedInterval; Integer batchReason;
  end BatchResult;

  function Initialize
    input RGBDGraphProcessing.State previous;
    input Real rgb[height,width,4]; input Real depth[height,width];
    input Real calibration[14]; input Real opticalToBody[3,3];
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
        accel={0,0,9.81},gyro=zeros(3),gravity={0,0,-9.81},density=fill(0.01,12),
        h=0,intervalTime=0,imageEpoch=0,graphCorrectionRequested=false);
  end Initialize;

  function Advance
    input RGBDGraphProcessing.State previous;
    input Real rgb[height,width,4]; input Real depth[height,width];
    input Real calibration[14]; input Real opticalToBody[3,3];
    input Integer epoch; input Real frameTime;
    output BatchResult result;
  protected
    Real accel[maximumIntervals,3]; Real gyro[maximumIntervals,3];
    Real durations[maximumIntervals]; Real endpoints[maximumIntervals];
  algorithm
    accel := zeros(maximumIntervals,3); gyro := zeros(maximumIntervals,3);
    durations := fill(1.0/90.0,maximumIntervals); endpoints := zeros(maximumIntervals);
    for interval in 1:3 loop
      // First two acquisitions translate at 0.3m/s. The final 1/30s interval
      // returns from x=.02 to x=0 with constant -54m/s2 and initial v=.3m/s.
      // This deliberately abrupt imposed view is not a physically flown route.
      accel[interval,:] := {if epoch == 3 then -54.0 else 0.0,0.0,9.81};
      endpoints[interval] := frameTime-(3-interval)/90.0;
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
        durations=durations,intervalTimes=endpoints,intervalCount=3,frameTime=frameTime,
        imageEpoch=epoch,imageRequested=true,localCaptureRequested=true,
        graphCorrectionRequested=false);
  end Advance;

  function Metrics
    input RGBDFastSLAMRawCompositionReference.Outcome value;
    input Integer epoch; input Real frameTime;
    input Integer batchReason; input Integer processed; input Integer failed;
    output Real raw[24];
  algorithm
    raw := {epoch,frameTime,if value.accepted then 1 else 0,
      if value.imageCompleted then 1 else 0,if value.mappingAccepted then 1 else 0,
      value.selectionValid,value.initializationAccepted,value.predictionAccepted,
      value.observationAccepted,value.captureAccepted,value.matchCount,
      RGBDFastSLAMRawCompositionReference.SumMask(value.featureEnabled),
      RGBDFastSLAMRawCompositionReference.SumMask(value.trackingEnabled),
      RGBDFastSLAMRawCompositionReference.SumMask(value.next.estimator.localization.map.occupied),
      value.next.estimator.localization.steps,value.next.estimator.localization.catalog.nextId,
      value.next.estimator.localization.estimator.referenceEpoch,
      value.next.estimator.localization.estimator.lastUsedEpoch,
      batchReason,processed,failed,
      value.next.estimator.localization.estimator.position[1],
      value.next.estimator.localization.estimator.position[2],
      value.next.estimator.localization.estimator.position[3]};
  end Metrics;

  impure function Run
    input String datasetFile; input Real clock;
    output Boolean checks[24]; output Real raw[4,24];
    output Real diagnostics[4,16];
  protected
    Real calibrationMatrix[1,14]; Real calibration[14]; Real opticalToBody[3,3];
    Real acquisition[4,2]; Real rgb[height,width,4]; Real depth[height,width];
    Real scores[height*width]; Real selectedFeatures[height*width,3];
    Real selectionCount; Real selectionStatus;
    Real rowRaw[24]; Real rowDiagnostics[16]; Integer epoch; Real frameTime;
    RGBDGraphProcessing.State fresh; RGBDGraphProcessing.State previous;
    RGBDFastSLAMRawCompositionReference.Outcome initialized;
    RGBDFastSLAMRawCompositionReference.Outcome current;
    BatchResult batch;
    Boolean expectObservation;
  algorithm
    checks := fill(true,24); raw := zeros(4,24); diagnostics := zeros(4,16);
    calibrationMatrix := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"calibration",1,14,false);
    calibration := calibrationMatrix[1,:];
    opticalToBody := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"opticalToBody",3,3,false);
    acquisition := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"acquisition",4,2,false);
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),{0.3,0,0},identity(3),zeros(3),zeros(3),
        RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    checks[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(fresh)
      and acquisition[1,1] == 0 and acquisition[1,2] == 0;
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,1);
    initialized := Initialize(fresh,rgb,depth,calibration,opticalToBody);
    current := initialized;
    checks[2] := initialized.accepted and initialized.publicationReason == 0;
    checks[3] := initialized.imageCompleted and initialized.initializationAccepted == 1
      and initialized.captureAccepted == 1 and initialized.predictionAccepted == 0;
    checks[4] := initialized.selectionValid == 1
      and RGBDFastSLAMRawCompositionReference.SumMask(initialized.featureEnabled) >= 12;
    checks[5] := initialized.mappingAccepted and initialized.next.estimator.localization.catalog.nextId == 2
      and initialized.next.vocabulary.ready and initialized.next.vocabulary.count >= 8;
    checks[6] := RGBDGraphProcessing.Valid(initialized.next)
      and initialized.next.estimator.localization.steps == 1
      and initialized.next.estimator.localization.lastProcessedImageEpoch == 0
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.position,zeros(3),1e-12);
    rowRaw := Metrics(initialized,0,0,0,0,0);
    for column in 1:24 loop raw[1,column] := rowRaw[column]; end for;
    previous := initialized.next;
    for frame in 2:4 loop
      epoch := integer(acquisition[frame,1]); frameTime := acquisition[frame,2];
      checks[1] := checks[1] and epoch == frame-1 and abs(frameTime-(frame-1)/30.0) < 1e-12;
      (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,frame);
      batch := Advance(previous,rgb,depth,calibration,opticalToBody,epoch,frameTime);
      current := batch.value;
      // Reproduce the producer's deterministic selection, not its displayed
      // features: invalid described slots can be sparse in that display mask.
      scores := FastFrameScores(rgb,true);
      (selectedFeatures,selectionCount,selectionStatus) := SelectRasterFeatures(scores,
        width,height,width*height,3,{18.0,0.0,1e8,3.0,RGBDKeyframes.featureCapacity,1.0,3.0,3.0},false,true);
      // Independent diagnostic evaluation cannot feed the transaction or
      // modify its returned State. Preserve original selection indices/count.
      rowDiagnostics := RGBDRenderedVisualDiagnostics.Evaluate(previous,rgb,depth,
        selectedFeatures[1:RGBDKeyframes.featureCapacity,1:2],selectionCount,
        calibration,opticalToBody);
      for column in 1:16 loop diagnostics[frame,column] := rowDiagnostics[column]; end for;
      checks[7] := checks[7] and current.accepted and current.publicationReason == 0
        and batch.batchReason == 0 and batch.processedIntervals == 3 and batch.failedInterval == 0;
      checks[8] := checks[8] and current.imageCompleted;
      checks[9] := checks[9] and current.predictionAccepted == 1 and current.initializationAccepted == 0;
      // Independent-pair policy consumes both raw images. The next image births
      // a fresh reference, then the following image supplies the next update.
      expectObservation := frame == 2 or frame == 4;
      checks[10] := checks[10] and current.observationAccepted == (if expectObservation then 1 else 0);
      checks[11] := checks[11] and rowDiagnostics[8] == current.matchCount
        and (not expectObservation or current.matchCount >= 12);
      checks[12] := checks[12] and current.captureAccepted == (if expectObservation then 0 else 1);
      checks[13] := checks[13] and RGBDGraphProcessing.Valid(current.next);
      checks[14] := checks[14] and current.next.estimator.localization.steps == 1+3*(frame-1)
        and abs(current.next.estimator.localization.predictionTime-frameTime) < 1e-12
        and current.next.estimator.localization.lastProcessedImageEpoch == epoch
        and abs(current.next.estimator.localization.lastProcessedImageTime-frameTime) < 1e-12;
      checks[15] := checks[15]
        and RGBDLocalizationInitializeTests.CloseVector(current.next.estimator.localization.estimator.referenceRgbCalibration,
          {calibration[5],calibration[6],calibration[3],calibration[4]},1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(current.next.estimator.localization.estimator.referenceDepthCalibration,calibration[1:4],1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(current.next.estimator.localization.estimator.referenceOpticalToBody,opticalToBody,1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(current.next.estimator.localization.estimator.referenceCameraOriginBody,calibration[10:12],1e-12)
        and current.next.estimator.localization.estimator.referenceDisparityNoise == calibration[8]
        and current.next.estimator.localization.estimator.referenceNoiseReferenceFx == calibration[9]
        and current.next.estimator.localization.estimator.referenceBaseline == calibration[7];
      checks[16] := checks[16] and current.next.estimator.localization.catalog.nextId == 2
        and current.next.vocabulary.count == initialized.next.vocabulary.count
        and RGBDLocalizationInitializeTests.CloseMatrix(current.next.vocabulary.words,initialized.next.vocabulary.words,1e-12);
      checks[17] := checks[17] and not current.graphCorrectionAccepted
        and current.next.estimator.correctionRevision == 0
        and current.next.attempt.graphRevision == initialized.next.attempt.graphRevision;
      checks[18] := checks[18] and current.next.estimator.localization.estimator.referenceEpoch == (if frame == 2 then 0 else 2)
        and current.next.estimator.localization.estimator.lastUsedEpoch == (if frame < 4 then 1 else 3);
      checks[19] := checks[19] and RGBDFastSLAMRawCompositionReference.MapGeometry(current.next);
      checks[20] := checks[20] and current.mappingAccepted
        and current.next.estimator.localization.map.imageEpoch == epoch
        and RGBDFastSLAMRawCompositionReference.SumMask(current.next.estimator.localization.map.occupied) > 0;
      checks[21] := checks[21] and RGBDLocalizationInitializeTests.CloseVector(current.nextQuaternion,
        RGBDLocalizationAdvanceReference.Quaternion(current.next.estimator.localization.estimator.rotation),1e-10);
      checks[22] := checks[22] and RGBDLocalizationCatalog.ValidEstimator(current.next.estimator.localization.estimator);
      checks[23] := checks[23] and RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled) >= 12
        and rowDiagnostics[10] == RGBDFastSLAMRawCompositionReference.SumMask(current.featureEnabled)
        and (rowDiagnostics[1] < 0.5 or RGBDFastSLAMRawCompositionReference.SumMask(current.trackingEnabled) == rowDiagnostics[14])
        and selectionStatus == 1 and selectionCount <= RGBDKeyframes.featureCapacity
        and (not expectObservation or RGBDFastSLAMRawCompositionReference.SumMask(current.trackingEnabled) >= 12);
      checks[24] := checks[24] and RGBDLocalizationInitializeTests.CloseVector(
        current.next.estimator.localization.catalog.bodyPositions[1,:],zeros(3),1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(current.next.estimator.localization.catalog.descriptors[1,:,:],
          initialized.next.estimator.localization.catalog.descriptors[1,:,:],1e-12);
      rowRaw := Metrics(current,epoch,frameTime,batch.batchReason,batch.processedIntervals,batch.failedInterval);
      for column in 1:24 loop raw[frame,column] := rowRaw[column]; end for;
      previous := current.next;
    end for;
  end Run;
end RGBDRenderedCitySLAMReference;

model RGBDRenderedCitySLAMAcceptance
  parameter String datasetFile = "";
  output Boolean checks[24]; output Real raw[4,24];
  output Real diagnostics[4,16];
equation
  (checks,raw,diagnostics) = RGBDRenderedCitySLAMReference.Run(datasetFile,time);
end RGBDRenderedCitySLAMAcceptance;
