package RGBDCatalogPoseMappingTests
  function EqualView
    input RGBDCatalogPoseMapping.PoseView a; input RGBDCatalogPoseMapping.PoseView b; output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision and a.revision == b.revision and a.catalogNextId == b.catalogNextId;
    for node in 1:128 loop
      same := same and a.enabled[node] == b.enabled[node] and a.ids[node] == b.ids[node];
      for axis in 1:3 loop
        same := same and a.positions[node,axis] == b.positions[node,axis];
        for col in 1:3 loop same := same and a.rotations[node,axis,col] == b.rotations[node,axis,col]; end for;
      end for;
    end for;
  end EqualView;
  function Hold
    input RGBDCatalogPoseMapping.Result result; input RGBDKeyframes.Catalog catalog;
    input RGBDGraphMeasurements.State graph; input RGBDCatalogMapping.State map; input RGBDCatalogPoseMapping.PoseView poses;
    output Boolean same;
  algorithm
    same := not result.accepted and RGBDCatalogFrameTests.Hold(result.mapping,catalog,graph,map) and EqualView(result.poses,poses);
  end Hold;
  function Corrected
    output RGBDGraphEstimatorCommit.State state;
  protected
    RGBDGraphEstimatorCommit.State previous; RGBDGraphEstimatorCommit.Proposal proposal;
    RGBDGraphEstimatorCommit.Result result; GraphGaugeUncertainty.Binding b;
    SchmidtGraphPoseCorrection.Attempt attempt; SchmidtGraphPoseCorrection.Policy policy;
    Real M[12,12];
  algorithm
    previous := RGBDGraphEstimatorCommitTests.FullState(); proposal.poses := previous.poses; proposal.poses.revision := 1;
    for node in 2:128 loop
      proposal.poses.positions[node,:] := previous.poses.positions[node,:]+{0.001*node,-0.0005*node,0.0003*node};
      proposal.poses.rotations[node,:,:] := previous.poses.rotations[node,:,:]*GraphGaugeUncertaintyTests.Rotation({0.0002*node,-0.0001*node,0.00015*node});
    end for;
    b.generation := 1; b.sourceRevision := 17; b.graphRevision := 128; b.catalogPoseRevision := 0;
    b.anchorId := 1; b.anchorEpoch := 1; b.anchorCaptureSequence := 1; b.anchorTime := 1;
    b.currentId := 128; b.currentEpoch := 128; b.currentCaptureSequence := 128; b.currentTime := 128;
    b.referenceId := 32; b.referenceEpoch := 32; b.referenceCaptureSequence := 32; b.referenceTime := 32;
    b.chart := 1; b.factorProvenance := 7; b.anchorBoundProvenance := 11;
    proposal.selected.binding := b; proposal.graphRevision := 128; proposal.optimizerAccepted := true;
    proposal.selected.positions[1,:] := proposal.poses.positions[128,:]; proposal.selected.rotations[1,:,:] := proposal.poses.rotations[128,:,:];
    proposal.selected.positions[2,:] := proposal.poses.positions[32,:]; proposal.selected.rotations[2,:,:] := proposal.poses.rotations[32,:,:];
    for i in 1:12 loop for j in 1:12 loop M[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
    proposal.selected.covariance := M*transpose(M); attempt.generation := 1; attempt.graphRevision := 0; attempt.factorProvenance := 0;
    policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := 0.4;
    result := RGBDGraphEstimatorCommit.Commit(previous,proposal,b,attempt,policy,true);
    assert(result.accepted and result.projectedCount == 14400,"Real full-map graph correction precondition must accept");
    state := result.next;
  end Corrected;
  function Run
    input Integer trials; output Boolean checks[13];
  protected
    RGBDGraphEstimatorCommit.State corrected;
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph; RGBDCatalogMapping.State map;
    RGBDCatalogPoseMapping.PoseView poses; RGBDCatalogPoseMapping.PoseView damaged; RGBDCatalogPoseMapping.PoseView expectedView;
    RGBDCatalogPoseMapping.Result first; RGBDCatalogPoseMapping.Result capture; RGBDCatalogPoseMapping.Result next; RGBDCatalogPoseMapping.Result result;
    RGBDCatalogMapping.Result raw; RGBDKeyframePolicy.Decision decision;
    RGBDCatalogGraphCapture.Result visual; RGBDCatalogMapping.State expected;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame measurement; RGBDKeyframes.Frame observation;
    Real vocabulary[256,49]; Real enabled[256]; Real candidates[350,3]; Real mask[350]; Real local[3]; Real world[3];
  algorithm
    assert(trials == 96 and RGBDKeyframes.keyframeCapacity == 128 and RGBDGraphMeasurements.edgeCapacity == 256
      and RGBDKeyframes.featureCapacity == 350 and RGBDCatalogMapping.mapCapacity == 14400,"Pose-aware mapping retains full domains");
    corrected := Corrected(); catalog := corrected.localization.catalog; graph := corrected.localization.graph; map := corrected.localization.map;
    poses.generation := corrected.poses.generation; poses.sourceRevision := corrected.poses.sourceRevision; poses.revision := corrected.poses.revision;
    poses.catalogNextId := corrected.poses.catalogNextId; poses.enabled := corrected.poses.enabled; poses.ids := corrected.poses.ids;
    poses.positions := corrected.poses.positions; poses.rotations := corrected.poses.rotations;
    reference := RGBDLoopVerificationTests.Reference(false); (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
    measurement := reference; measurement.id := 129; measurement.epoch := 129; measurement.imageTime := 128+1.0/90;
    measurement.bodyPosition := poses.positions[128,:]; measurement.bodyRotation := poses.rotations[128,:,:];
    candidates := fill(1e101,350,3); mask := zeros(350);
    first := RGBDCatalogPoseMapping.Advance(catalog,graph,map,poses,17,measurement,fill(1e101,256,49),fill(0.5,256),candidates,mask,true,1,true,
      seeds=fill(-7,4),sequentialSeed=-1,trials=0,refinements=0,minimumInliers=-1,minimumPivot=-1);
    expected := map; expected.frame := 129; expected.imageEpoch := 129; expected.imageTime := measurement.imageTime;
    checks[1] := first.accepted and not first.decision.captureRequested and EqualView(first.poses,poses)
      and RGBDCatalogMappingTests.EqualMap(first.mapping.map,expected) and RGBDCatalogGraphTests.EqualCatalog(first.mapping.catalog,catalog)
      and RGBDGraphMeasurementTests.EqualState(first.mapping.graph,graph);
    (raw,decision) := RGBDCatalogFrame.Advance(catalog,graph,map,measurement,vocabulary,enabled,candidates,mask,true,1,true);
    checks[2] := decision.valid and not decision.captureRequested and RGBDCatalogFrameTests.Hold(raw,catalog,graph,map);
    measurement.epoch := 130; measurement.imageTime := 130;
    local := {measurement.opticalPoint[350,3]+0.18,-measurement.opticalPoint[350,1],-measurement.opticalPoint[350,2]-0.04};
    world := measurement.bodyRotation*local+measurement.bodyPosition; candidates[350,:] := world; mask[350] := 1;
    visual := RGBDCatalogGraphCapture.Capture(catalog,measurement,vocabulary,enabled,graph,true,trials=trials);
    assert(visual.accepted,"Actual full-capacity visual capture precondition must accept");
    capture := RGBDCatalogPoseMapping.Advance(catalog,graph,first.mapping.map,poses,17,measurement,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    expected := first.mapping.map;
    for slot in 1:14400 loop
      if expected.anchorId[slot] == 1 then
        expected.point[slot,:] := zeros(3); expected.localPoint[slot,:] := zeros(3); expected.occupied[slot] := 0;
        expected.anchorId[slot] := 0; expected.anchorSlot[slot] := 0; expected.confidence[slot] := 0; expected.lastSeen[slot] := 0; expected.lastFrame[slot] := 0;
      end if;
    end for;
    expected.catalogRevision := 129; expected.frame := 130; expected.imageEpoch := 130; expected.imageTime := 130;
    expected.point[1,:] := world; expected.localPoint[1,:] := local; expected.occupied[1] := 1; expected.anchorId[1] := 129; expected.anchorSlot[1] := 1;
    expected.confidence[1] := 1; expected.lastSeen[1] := 130; expected.lastFrame[1] := 130;
    expectedView := poses; expectedView.revision := 2; expectedView.catalogNextId := 130;
    expectedView.ids[1] := 129; expectedView.positions[1,:] := measurement.bodyPosition; expectedView.rotations[1,:,:] := measurement.bodyRotation;
    checks[3] := capture.accepted and capture.decision.captureRequested and EqualView(capture.poses,expectedView)
      and RGBDCatalogMappingTests.EqualMap(capture.mapping.map,expected,1e-9)
      and RGBDCatalogGraphTests.EqualCatalog(capture.mapping.catalog,visual.catalog) and RGBDGraphMeasurementTests.EqualState(capture.mapping.graph,visual.graph)
      and capture.mapping.diagnostics.insertedCount == 1 and capture.mapping.diagnostics.evictedCount == 113;
    observation := measurement; observation.id := 130; observation.epoch := 131; observation.imageTime := 130+1.0/90;
    next := RGBDCatalogPoseMapping.Advance(capture.mapping.catalog,capture.mapping.graph,capture.mapping.map,capture.poses,17,observation,
      fill(1e101,256,49),fill(0.5,256),candidates,mask,true,1,true,trials=0);
    expected.frame := 131; expected.imageEpoch := 131; expected.imageTime := observation.imageTime; expected.confidence[1] := 2;
    expected.lastSeen[1] := observation.imageTime; expected.lastFrame[1] := 131;
    checks[4] := next.accepted and not next.decision.captureRequested and next.mapping.diagnostics.mergedCount == 1
      and EqualView(next.poses,capture.poses) and RGBDCatalogMappingTests.EqualMap(next.mapping.map,expected,1e-9)
      and RGBDCatalogGraphTests.EqualCatalog(next.mapping.catalog,visual.catalog) and RGBDGraphMeasurementTests.EqualState(next.mapping.graph,visual.graph);
    expected := first.mapping.map; expected.localPoint[14400,3] := expected.localPoint[14400,3]+1;
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,expected,poses,17,measurement,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[5] := result.decision.captureRequested and Hold(result,catalog,graph,expected,poses);
    damaged := poses; damaged.sourceRevision := 18;
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,map,damaged,17,measurement,vocabulary,enabled,candidates,mask,true,1,true);
    checks[6] := result.rejectionReason == 2 and Hold(result,catalog,graph,map,damaged);
    damaged := poses; damaged.catalogNextId := 130;
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,map,damaged,17,measurement,vocabulary,enabled,candidates,mask,true,1,true);
    checks[7] := result.rejectionReason == 2 and Hold(result,catalog,graph,map,damaged);
    damaged := poses; damaged.ids[1] := 129;
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,map,damaged,17,measurement,vocabulary,enabled,candidates,mask,true,1,true);
    checks[8] := result.rejectionReason == 2 and Hold(result,catalog,graph,map,damaged);
    damaged := poses; damaged.generation := -1; expected := map; expected.point[14400,:] := fill(1e101,3);
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,expected,damaged,-1,measurement,fill(1e101,256,49),fill(0.5,256),candidates,mask,true,-1,false);
    checks[9] := result.rejectionReason == 1 and Hold(result,catalog,graph,expected,damaged);
    result := RGBDCatalogPoseMapping.Advance(capture.mapping.catalog,capture.mapping.graph,capture.mapping.map,poses,17,observation,vocabulary,enabled,candidates,mask,true,1,true);
    checks[10] := result.rejectionReason == 2 and Hold(result,capture.mapping.catalog,capture.mapping.graph,capture.mapping.map,poses);
    candidates[350,3] := candidates[350,3]+1;
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,first.mapping.map,poses,17,measurement,vocabulary,enabled,candidates,mask,true,1,true,trials=trials);
    checks[11] := result.decision.captureRequested and Hold(result,catalog,graph,first.mapping.map,poses); candidates[350,:] := world;
    (raw,decision) := RGBDCatalogFrame.Advance(capture.mapping.catalog,capture.mapping.graph,capture.mapping.map,observation,vocabulary,enabled,candidates,mask,true,1,true);
    checks[12] := decision.valid and not decision.captureRequested and RGBDCatalogFrameTests.Hold(raw,capture.mapping.catalog,capture.mapping.graph,capture.mapping.map);
    observation := measurement; observation.id := 129; observation.epoch := 129; observation.imageTime := 128.5;
    mask := zeros(350);
    result := RGBDCatalogPoseMapping.Advance(catalog,graph,map,poses,17,observation,fill(1e101,256,49),fill(0.5,256),candidates,mask,true,1,true,
      translationThreshold=0.01,rotationThreshold=0.01,trials=0);
    checks[13] := result.accepted and result.decision.valid and not result.decision.captureRequested and result.decision.reason == 7;
  end Run;
end RGBDCatalogPoseMappingTests;
