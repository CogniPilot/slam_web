package RGBDCatalogFrameTests
  function Hold
    input RGBDCatalogMapping.Result result; input RGBDKeyframes.Catalog catalog;
    input RGBDGraphMeasurements.State graph; input RGBDCatalogMapping.State map;
    output Boolean equal;
  algorithm
    equal := not result.accepted and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
      and RGBDGraphMeasurementTests.EqualState(result.graph,graph) and RGBDCatalogMappingTests.EqualMap(result.map,map)
      and RGBDCatalogObservationTests.EmptyProblem(result.problem);
  end Hold;

  function Run
    input Integer trials; output Boolean checks[6];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph; RGBDGraphMeasurements.State damagedGraph;
    RGBDCatalogMapping.State base; RGBDCatalogMapping.State previous; RGBDCatalogMapping.State expected;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current;
    RGBDCatalogGraphCapture.Result visual;
    RGBDCatalogMapping.Result result; RGBDCatalogMapping.Result first;
    RGBDKeyframePolicy.Decision decision;
    Real vocabulary[256,49]; Real enabled[256]; Real poisonedVocabulary[256,49]; Real poisonedEnabled[256];
    Real candidates[350,3]; Real mask[350]; Real local[3]; Real world[3];
  algorithm
    assert(trials == 96 and RGBDKeyframes.keyframeCapacity == 128 and RGBDGraphMeasurements.edgeCapacity == 256
      and RGBDKeyframes.featureCapacity == 350 and RGBDCatalogMapping.mapCapacity == 14400,
      "Frame acceptance retains full128/256/350/14400/96 domains");
    catalog := RGBDCatalogLoopTests.FullCatalog(false); graph := RGBDGraphMeasurementTests.FullState();
    reference := RGBDLoopVerificationTests.Reference(false); current := reference;
    current.id := 129; current.epoch := 129; current.imageTime := 128+1.0/90;
    (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
    poisonedVocabulary := fill(1e101,256,49); poisonedEnabled := fill(0.5,256);
    // Independent fixed RDF->FLU extrinsic and retained body pose geometry.
    local := {reference.opticalPoint[350,3]+0.18,-reference.opticalPoint[350,1],-reference.opticalPoint[350,2]-0.04};
    world := reference.bodyRotation*local+reference.bodyPosition;
    candidates := fill(1e101,350,3); mask := zeros(350); candidates[350,:] := world; mask[350] := 1;
    base := RGBDCatalogMapping.Empty(1,17); base.catalogRevision := 128;
    base.imageTime := 128; base.imageEpoch := 128; base.frame := 128;
    checks := fill(false,6);
    for image in 1:2 loop
      previous := if image == 1 then base else first.map;
      current.epoch := 128+image; current.imageTime := 128+image/90.0;
      (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,previous,current,poisonedVocabulary,poisonedEnabled,
        candidates,mask,true,1,true,seeds=fill(-7,4),sequentialSeed=-11,
        maximumWordDistanceSquared=-1,minimumAssignments=-1,minimumSimilarity=-1,minimumAge=-1,
        trials=0,refinements=0,minimumInliers=-1,minimumFraction=-1,inlierDistance=-1,maximumRms=-1,
        descriptorRatio=-1,maximumDescriptorDistance=-1,registrationCoordinateLimit=-1,rankTolerance=-1,
        localizationSigma=-1,depthInflation=-1,minimumPivot=-1);
      expected := base; expected.frame := 128+image; expected.imageEpoch := 128+image; expected.imageTime := current.imageTime;
      expected.occupied[1] := 1; expected.point[1,:] := world; expected.localPoint[1,:] := local;
      expected.anchorId[1] := 128; expected.anchorSlot[1] := 128; expected.confidence[1] := image;
      expected.lastSeen[1] := current.imageTime; expected.lastFrame[1] := 128+image;
      checks[image] := decision.valid and not decision.captureRequested and decision.reason == 6
        and result.accepted and result.rejectionReason == 0
        and RGBDCatalogMappingTests.EqualMap(result.map,expected,1e-9)
        and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog) and RGBDGraphMeasurementTests.EqualState(result.graph,graph)
        and RGBDCatalogObservationTests.EmptyProblem(result.problem)
        and result.diagnostics.insertedCount == (if image == 1 then 1 else 0)
        and result.diagnostics.mergedCount == (if image == 1 then 0 else 1);
      first := result;
    end for;
    current.epoch := 200; current.imageTime := 140;
    visual := RGBDCatalogGraphCapture.Capture(catalog,current,vocabulary,enabled,graph,true,trials=trials);
    assert(visual.accepted and visual.sequentialDiagnostics.verified and visual.loopDiagnostics.verifiedCount == 4,
      "Capture branch requires actual full-capacity96-hypothesis visual/graph proposal");
    (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,base,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    expected := RGBDCatalogMapping.Empty(1,17); expected.catalogRevision := 129; expected.frame := 129;
    expected.imageTime := 140; expected.imageEpoch := 200; expected.occupied[1] := 1;
    expected.point[1,:] := world; expected.localPoint[1,:] := local; expected.anchorId[1] := 129; expected.anchorSlot[1] := 1;
    expected.confidence[1] := 1; expected.lastSeen[1] := 140; expected.lastFrame[1] := 129;
    checks[3] := decision.valid and decision.captureRequested and result.accepted and result.rejectionReason == 0
      and RGBDCatalogGraphTests.EqualCatalog(result.catalog,visual.catalog) and RGBDGraphMeasurementTests.EqualState(result.graph,visual.graph)
      and RGBDCatalogMappingTests.EqualMap(result.map,expected,1e-9) and result.problem.accepted
      and result.problem.nodeCount == 128 and result.problem.edgeCount == 256
      and result.diagnostics.insertedCount == 1 and result.diagnostics.mergedCount == 0 and result.diagnostics.assignedCount == 1;
    previous := base; previous.occupied[14400] := 1; previous.point[14400,:] := world;
    previous.localPoint[14400,:] := local; previous.anchorId[14400] := 128; previous.anchorSlot[14400] := 128;
    previous.confidence[14400] := 3; previous.lastSeen[14400] := 129; previous.lastFrame[14400] := 128;
    (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,previous,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[4] := decision.captureRequested and result.rejectionReason == 5 and result.diagnostics.mapAccepted == 0
      and Hold(result,catalog,graph,previous);
    previous := base; previous.imageEpoch := 200;
    (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,previous,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[5] := decision.captureRequested and result.rejectionReason == 4 and Hold(result,catalog,graph,previous);
    previous := base; damagedGraph := graph; damagedGraph.lastCaptureId := 127;
    (result,decision) := RGBDCatalogFrame.Advance(catalog,damagedGraph,previous,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[6] := decision.captureRequested and result.rejectionReason == 2 and Hold(result,catalog,damagedGraph,previous);
  end Run;
end RGBDCatalogFrameTests;
