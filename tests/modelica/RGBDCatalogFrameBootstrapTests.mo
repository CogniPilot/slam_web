package RGBDCatalogFrameBootstrapTests
  function Run
    input Integer trials; output Boolean checks[7];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph; RGBDGraphMeasurements.State expectedGraph;
    RGBDCatalogMapping.State map; RGBDCatalogMapping.State expected; RGBDCatalogMapping.State damaged;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current; RGBDKeyframes.Frame emptyObservation;
    RGBDCatalogMapping.Result first; RGBDCatalogMapping.Result result; RGBDCatalogMapping.Result emptyResult;
    RGBDCatalogGraphCapture.Result visual;
    RGBDKeyframePolicy.Decision decision;
    Real vocabulary[256,49]; Real enabled[256]; Real candidates[350,3]; Real mask[350]; Real zeroMask[350];
    Real local[3]; Real world[3];
  algorithm
    assert(trials == 96 and RGBDKeyframes.keyframeCapacity == 128 and RGBDGraphMeasurements.edgeCapacity == 256
      and RGBDKeyframes.featureCapacity == 350 and RGBDCatalogMapping.mapCapacity == 14400,
      "Bootstrap gate retains full128/256/350/14400/96 domains");
    catalog := RGBDKeyframes.Empty(1); graph := RGBDGraphMeasurements.Empty(1); map := RGBDCatalogMapping.Empty(1,17);
    reference := RGBDLoopVerificationTests.Reference(false); current := reference; current.id := 1; current.epoch := 0; current.imageTime := 0;
    (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
    local := {reference.opticalPoint[350,3]+0.18,-reference.opticalPoint[350,1],-reference.opticalPoint[350,2]-0.04};
    world := reference.bodyRotation*local+reference.bodyPosition;
    candidates := fill(1e101,350,3); candidates[350,:] := world; mask := zeros(350); mask[350] := 1; zeroMask := zeros(350);
    visual := RGBDCatalogGraphCapture.Capture(catalog,current,vocabulary,enabled,graph,true,trials=trials);
    (first,decision) := RGBDCatalogFrame.Advance(catalog,graph,map,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    expected := RGBDCatalogMapping.Empty(1,17); expected.catalogRevision := 1; expected.frame := 1; expected.imageEpoch := 0;
    expected.occupied[1] := 1; expected.point[1,:] := world; expected.localPoint[1,:] := local;
    expected.anchorId[1] := 1; expected.anchorSlot[1] := 1; expected.confidence[1] := 1; expected.lastFrame[1] := 1;
    expectedGraph := RGBDGraphMeasurements.Empty(1); expectedGraph.revision := 1; expectedGraph.lastCaptureId := 1;
    checks[1] := visual.accepted and decision.valid and decision.captureRequested and first.accepted
      and first.rejectionReason == 0 and RGBDCatalogMappingTests.EqualMap(first.map,expected,1e-9)
      and RGBDCatalogGraphTests.EqualCatalog(first.catalog,visual.catalog)
      and RGBDGraphMeasurementTests.EqualState(first.graph,expectedGraph)
      and first.catalog.nextId == 2 and first.catalog.lastEpoch == 0 and first.catalog.lastTime == 0
      and first.problem.accepted and first.problem.nodeCount == 1 and first.problem.edgeCount == 0
      and first.diagnostics.insertedCount == 1 and first.diagnostics.mergedCount == 0;
    // Replay identity: currentimage id must still bind to the next catalog proposal.
    current.id := 2;
    (result,decision) := RGBDCatalogFrame.Advance(first.catalog,first.graph,first.map,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[2] := not decision.valid and not decision.captureRequested and decision.reason == 3
      and RGBDCatalogFrameTests.Hold(result,first.catalog,first.graph,first.map);
    current.epoch := 1;
    (result,decision) := RGBDCatalogFrame.Advance(first.catalog,first.graph,first.map,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[3] := not decision.valid and decision.reason == 3
      and RGBDCatalogFrameTests.Hold(result,first.catalog,first.graph,first.map);
    current.imageTime := 1.0/90;
    (result,decision) := RGBDCatalogFrame.Advance(first.catalog,first.graph,first.map,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    expected.frame := 2; expected.imageEpoch := 1; expected.imageTime := 1.0/90;
    expected.confidence[1] := 2; expected.lastSeen[1] := 1.0/90; expected.lastFrame[1] := 2;
    checks[4] := decision.valid and not decision.captureRequested and decision.reason == 6 and result.accepted
      and RGBDCatalogGraphTests.EqualCatalog(result.catalog,first.catalog) and RGBDGraphMeasurementTests.EqualState(result.graph,first.graph)
      and RGBDCatalogMappingTests.EqualMap(result.map,expected,1e-9)
      and result.diagnostics.insertedCount == 0 and result.diagnostics.mergedCount == 1
      and RGBDCatalogObservationTests.EmptyProblem(result.problem);
    current.epoch := 2; current.imageTime := 2.0/90; current.bodyPosition[1] := current.bodyPosition[1]+5;
    (result,decision) := RGBDCatalogFrame.Advance(first.catalog,first.graph,first.map,current,vocabulary,enabled,candidates,zeroMask,true,1,true,trials=trials);
    checks[5] := decision.valid and not decision.captureRequested and decision.reason == 6
      and result.accepted and result.map.frame == 2 and result.map.imageEpoch == 2
      and RGBDCatalogGraphTests.EqualCatalog(result.catalog,first.catalog) and RGBDGraphMeasurementTests.EqualState(result.graph,first.graph);
    current := reference; current.id := 1; current.epoch := 0; current.imageTime := 0;
    damaged := map; damaged.occupied[14400] := 1; damaged.point[14400,:] := world; damaged.localPoint[14400,:] := local;
    damaged.anchorId[14400] := 1; damaged.anchorSlot[14400] := 1; damaged.confidence[14400] := 3;
    (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,damaged,current,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[6] := decision.valid and decision.captureRequested and result.rejectionReason == 5
      and RGBDCatalogFrameTests.Hold(result,catalog,graph,damaged);
    emptyObservation := current; emptyObservation.count := 0; emptyObservation.enabled := fill(false,350);
    emptyObservation.opticalPoint := fill(1e101,350,3);
    (emptyResult,decision) := RGBDCatalogFrame.Advance(catalog,graph,map,emptyObservation,vocabulary,enabled,candidates,zeroMask,true,1,true,trials=trials);
    expected := map; expected.frame := 1; expected.imageEpoch := 0;
    checks[7] := decision.valid and not decision.captureRequested and decision.reason == 5 and emptyResult.accepted
      and RGBDCatalogGraphTests.EqualCatalog(emptyResult.catalog,catalog) and RGBDGraphMeasurementTests.EqualState(emptyResult.graph,graph)
      and RGBDCatalogMappingTests.EqualMap(emptyResult.map,expected)
      and RGBDCatalogObservationTests.EmptyProblem(emptyResult.problem);
    current.epoch := 1; current.imageTime := 1.0/90;
    (result,decision) := RGBDCatalogFrame.Advance(emptyResult.catalog,emptyResult.graph,emptyResult.map,current,
      vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    expected.catalogRevision := 1; expected.frame := 2; expected.imageEpoch := 1; expected.imageTime := 1.0/90;
    expected.occupied[1] := 1; expected.point[1,:] := world; expected.localPoint[1,:] := local;
    expected.anchorId[1] := 1; expected.anchorSlot[1] := 1; expected.confidence[1] := 1; expected.lastSeen[1] := 1.0/90; expected.lastFrame[1] := 2;
    checks[7] := checks[7] and decision.valid and decision.captureRequested and result.accepted
      and RGBDCatalogMappingTests.EqualMap(result.map,expected,1e-9) and result.catalog.nextId == 2
      and result.catalog.lastEpoch == 1 and result.catalog.lastTime == 1.0/90
      and RGBDGraphMeasurementTests.EqualState(result.graph,expectedGraph)
      and result.diagnostics.insertedCount == 1 and result.diagnostics.mergedCount == 0;
  end Run;
end RGBDCatalogFrameBootstrapTests;
