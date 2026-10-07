package RGBDCatalogFrameTrackingTests
  function Run
    output Boolean checks[5];
  protected
    RGBDKeyframes.Catalog catalog;
    RGBDGraphMeasurements.State graph;
    RGBDCatalogMapping.State previous;
    RGBDCatalogMapping.State expected;
    RGBDCatalogMapping.Result result;
    RGBDKeyframes.Frame reference;
    RGBDKeyframes.Frame measurement;
    RGBDKeyframePolicy.Decision decision;
    RGBDLocalizationCatalog.State localization;
    RGBDLocalizationCatalog.Estimator proposed;
    RGBDLocalizationCatalog.Result published;
    Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
    Real candidates[RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension];
    Real enabled[RGBDKeyframes.featureCapacity];
    Real localPoint[RGBDKeyframes.dimension];
    Integer feature;
  algorithm
    catalog := RGBDCatalogLoopTests.FullCatalog(false);
    graph := RGBDGraphMeasurementTests.FullState();
    reference := RGBDLoopVerificationTests.Reference(false);
    (vocabulary,vocabularyEnabled) := RGBDCatalogLoopTests.Vocabulary(reference);
    measurement := reference;
    measurement.id := catalog.nextId;
    measurement.epoch := 200;
    measurement.imageTime := 140;
    // A scale change preserves descriptor matches but cannot be a rigid motion.
    for slot in 1:RGBDKeyframes.featureCapacity loop
      if measurement.enabled[slot] then
        measurement.opticalPoint[slot,:] := 2*reference.opticalPoint[slot,:];
      end if;
    end for;
    previous := RGBDCatalogMapping.Empty(1,17);
    previous.catalogRevision := 128;
    previous.frame := 128;
    previous.imageTime := 128;
    previous.imageEpoch := 128;
    feature := RGBDKeyframes.featureCapacity;
    localPoint := measurement.opticalToBody*measurement.opticalPoint[feature,:]
      +measurement.cameraOriginBody;
    candidates := zeros(RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension);
    candidates[feature,:] := measurement.bodyRotation*localPoint+measurement.bodyPosition;
    enabled := zeros(RGBDKeyframes.featureCapacity);
    enabled[feature] := 1;
    (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,previous,
      measurement,vocabulary,vocabularyEnabled,candidates,enabled,true,1,true);
    checks[1] := decision.valid and decision.captureRequested and result.accepted
      and result.diagnostics.keyframeRejectionReason == 4
      and result.diagnostics.sequentialRejectionReason == 7;
    checks[2] := RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
      and RGBDGraphMeasurementTests.EqualState(result.graph,graph)
      and RGBDCatalogObservationTests.EmptyProblem(result.problem);
    expected := previous;
    expected.frame := 129;
    expected.imageEpoch := measurement.epoch;
    expected.imageTime := measurement.imageTime;
    expected.occupied[1] := 1;
    expected.point[1,:] := candidates[feature,:];
    expected.localPoint[1,:] := localPoint;
    expected.anchorId[1] := 128;
    expected.anchorSlot[1] := 128;
    expected.confidence[1] := 1;
    expected.lastSeen[1] := measurement.imageTime;
    expected.lastFrame[1] := expected.frame;
    checks[3] := RGBDCatalogMappingTests.EqualMap(result.map,expected,1e-9)
      and result.diagnostics.insertedCount == 1;
    // A refused keyframe must not let a corrupt candidate bypass map admission.
    candidates[feature,1] := candidates[feature,1]+1;
    (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,previous,
      measurement,vocabulary,vocabularyEnabled,candidates,enabled,true,1,true);
    checks[4] := RGBDCatalogFrameTests.Hold(result,catalog,graph,previous)
      and result.diagnostics.keyframeRejectionReason == 4
      and result.diagnostics.sequentialRejectionReason == 7;
    candidates[feature,:] := expected.point[1,:];
    localization := RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(reference.bodyPosition,
        rotation=reference.bodyRotation),1,17,1,17);
    localization.initialized := true;
    localization.steps := 199;
    localization.predictionTime := 140;
    localization.lastProcessedImageEpoch := 199;
    localization.lastProcessedImageTime := 140;
    localization.catalog := catalog;
    localization.graph := graph;
    localization.map := previous;
    measurement.imageTime := 140+1.0/90;
    proposed := RGBDLocalizationCatalogTests.Captured(localization.estimator,measurement);
    for row in 1:RGBDKeyframes.poseDimension loop
      for column in 1:RGBDKeyframes.poseDimension loop
        measurement.poseCovariance[row,column] := proposed.covariance[
          RGBDLocalizationFrame.poseIndices[row],RGBDLocalizationFrame.poseIndices[column]];
      end for;
    end for;
    published := RGBDLocalizationCatalog.Publish(localization,proposed,measurement,
      1,0,1,true,measurement.epoch,measurement.imageTime,1.0/90,false,true,0,true,
      candidates,enabled,vocabulary,vocabularyEnabled);
    checks[5] := published.accepted and published.mappingAccepted
      and published.mapDiagnostics.keyframeRejectionReason == 4
      and published.next.catalog.nextId == catalog.nextId
      and published.next.referenceBirth.epoch == measurement.epoch
      and published.next.referenceBirth.sequence == localization.steps+1
      and published.next.referenceBirth.catalogId == 0;
  end Run;
end RGBDCatalogFrameTrackingTests;

model RGBDCatalogFrameTrackingAcceptance
  output Boolean checks[5];
equation
  checks = RGBDCatalogFrameTrackingTests.Run();
end RGBDCatalogFrameTrackingAcceptance;
