// Startup geometry reference, using raw pixels from a separately captured
// initialized Modelica plant. Capture ordinal five becomes epoch zero of this
// new estimator session. No renderer pose or physics truth is read here.
package RGBDRenderedCityCenterReference
  constant Integer height = RGBDKeyframes.imageHeight;
  constant Integer width = RGBDKeyframes.imageWidth;

  impure function Run
    input String datasetFile; input Real clock;
    output Boolean checks[12]; output Real raw[1,24]; output Real diagnostics[1,16];
  protected
    Real calibrationMatrix[1,14]; Real calibration[14]; Real opticalToBody[3,3];
    Real rgb[height,width,4]; Real depth[height,width];
    Real scores[height*width]; Real selectedFeatures[height*width,3];
    Real selectionCount; Real selectionStatus; Real rgbNonzero; Real depthPositive;
    Real minimumPositive; Real maximumPositive; Real features; Real mapCount;
    Real rowRaw[24]; Real rowDiagnostics[16];
    RGBDGraphProcessing.State fresh;
    RGBDFastSLAMRawCompositionReference.Outcome initialized;
  algorithm
    checks := fill(false,12); raw := zeros(1,24); diagnostics := zeros(1,16);
    calibrationMatrix := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"calibration",1,14,false);
    calibration := calibrationMatrix[1,:];
    opticalToBody := Modelica.Utilities.Streams.readRealMatrix(datasetFile,"opticalToBody",3,3,false);
    (rgb,depth) := RGBDRenderedFrameInput.Read(datasetFile,5);
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),zeros(3),identity(3),zeros(3),zeros(3),
        RGBDLocalizationInitializeTests.Covariance()),1,1,1,0));
    initialized := RGBDRenderedCitySLAMReference.Initialize(fresh,rgb,depth,calibration,opticalToBody);
    scores := FastFrameScores(rgb,true);
    (selectedFeatures,selectionCount,selectionStatus) := SelectRasterFeatures(scores,
      width,height,width*height,3,{18.0,0.0,1e8,3.0,RGBDKeyframes.featureCapacity,1.0,3.0,3.0},false,true);
    rgbNonzero := 0; depthPositive := 0; minimumPositive := calibration[14]; maximumPositive := 0;
    for row in 1:height loop
      for column in 1:width loop
        for channel in 1:4 loop
          if rgb[row,column,channel] > 0 then rgbNonzero := rgbNonzero+1; end if;
        end for;
        if depth[row,column] > 0 then
          depthPositive := depthPositive+1;
          minimumPositive := min(minimumPositive,depth[row,column]);
          maximumPositive := max(maximumPositive,depth[row,column]);
        end if;
      end for;
    end for;
    features := RGBDFastSLAMRawCompositionReference.SumMask(initialized.featureEnabled);
    mapCount := RGBDFastSLAMRawCompositionReference.SumMask(initialized.next.estimator.localization.map.occupied);
    checks[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(fresh);
    // Fresh empty vocabulary learns this first valid image and freezes it.
    // Learn's success code is 1; zero means learning was not requested.
    checks[2] := initialized.accepted and initialized.publicationReason == 0
      and initialized.ledgerReason == 0 and initialized.vocabularyReason == 1;
    checks[3] := initialized.imageCompleted and initialized.mappingAccepted;
    checks[4] := initialized.selectionValid == 1 and features >= 12;
    checks[5] := initialized.initializationAccepted == 1 and initialized.captureAccepted == 1
      and initialized.predictionAccepted == 0 and initialized.observationAccepted == 0 and initialized.matchCount == 0;
    checks[6] := RGBDGraphProcessing.Valid(initialized.next) and initialized.next.estimator.localization.initialized
      and initialized.next.estimator.localization.steps == 1
      and initialized.next.estimator.localization.predictionTime == 0
      and initialized.next.estimator.localization.lastProcessedImageEpoch == 0
      and initialized.next.estimator.localization.lastProcessedImageTime == 0;
    checks[7] := initialized.next.estimator.localization.estimator.referenceAvailable == 1
      and initialized.next.estimator.localization.estimator.referenceEpoch == 0
      and initialized.next.estimator.localization.estimator.referenceUsed == 0
      and initialized.next.estimator.localization.estimator.lastUsedEpoch == -1
      and initialized.next.estimator.localization.estimator.referenceCount >= 12
      and RGBDFastSLAMRawCompositionReference.SumMask(initialized.next.estimator.localization.estimator.referenceEnabled) >= 12;
    checks[8] := initialized.next.vocabulary.ready and initialized.next.vocabulary.count >= 8
      and initialized.next.vocabulary.generation == 1 and initialized.next.vocabulary.sourceRevision == 1;
    checks[9] := initialized.next.estimator.localization.catalog.nextId == 2
      and initialized.next.estimator.localization.catalog.occupied[1]
      and initialized.next.estimator.localization.catalog.epochs[1] == 0
      and initialized.next.captures.lastStep == 1 and initialized.next.captures.sequences[1] == 1
      and initialized.next.captures.epochs[1] == 0 and initialized.next.estimator.poses.enabled[1];
    checks[10] := RGBDFastSLAMRawCompositionReference.MapGeometry(initialized.next)
      and mapCount > 0 and initialized.next.estimator.localization.map.imageEpoch == 0;
    checks[11] := RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.position,zeros(3),1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.velocity,zeros(3),1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(initialized.next.estimator.localization.estimator.rotation,identity(3),1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.nextQuaternion,{1,0,0,0},1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.referenceRgbCalibration,
        {calibration[5],calibration[6],calibration[3],calibration[4]},1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.referenceDepthCalibration,calibration[1:4],1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(initialized.next.estimator.localization.estimator.referenceOpticalToBody,opticalToBody,1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.referenceCameraOriginBody,calibration[10:12],1e-12)
      and initialized.next.estimator.localization.estimator.referenceDisparityNoise == calibration[8]
      and initialized.next.estimator.localization.estimator.referenceNoiseReferenceFx == calibration[9]
      and initialized.next.estimator.localization.estimator.referenceBaseline == calibration[7];
    checks[12] := rgbNonzero > height*width and depthPositive > 0
      and minimumPositive >= calibration[13] and maximumPositive <= calibration[14]
      and selectionStatus == 1 and selectionCount >= 12 and selectionCount <= RGBDKeyframes.featureCapacity;
    rowRaw := RGBDRenderedCitySLAMReference.Metrics(initialized,0,0,0,0,0);
    rowDiagnostics := {rgbNonzero,depthPositive,minimumPositive,maximumPositive,
      selectionStatus,selectionCount,features,initialized.next.estimator.localization.estimator.referenceCount,
      RGBDFastSLAMRawCompositionReference.SumMask(initialized.next.estimator.localization.estimator.referenceEnabled),
      initialized.next.vocabulary.count,mapCount,initialized.publicationReason,initialized.ledgerReason,
      initialized.vocabularyReason,initialized.next.estimator.localization.estimator.referenceAvailable,initialized.captureAccepted};
    for column in 1:24 loop raw[1,column] := rowRaw[column]; end for;
    for column in 1:16 loop diagnostics[1,column] := rowDiagnostics[column]; end for;
  end Run;
end RGBDRenderedCityCenterReference;

model RGBDRenderedCityCenterAcceptance
  parameter String datasetFile = "";
  output Boolean checks[12]; output Real raw[1,24]; output Real diagnostics[1,16];
equation
  (checks,raw,diagnostics) = RGBDRenderedCityCenterReference.Run(datasetFile,time);
end RGBDRenderedCityCenterAcceptance;
