package RGBDGraphEstimatorCommitTests
  function EqualView
    input RGBDGraphEstimatorCommit.PoseView a; input RGBDGraphEstimatorCommit.PoseView b; output Boolean same;
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
  function Equal
    input RGBDGraphEstimatorCommit.State a; input RGBDGraphEstimatorCommit.State b; output Boolean same;
  algorithm
    same := a.correctionRevision == b.correctionRevision and a.graphRevisionUsed == b.graphRevisionUsed
      and EqualView(a.poses,b.poses) and RGBDLocalizationCatalogTests.EqualState(a.localization,b.localization);
  end Equal;
  function Filter
    input RGBDLocalizationCatalog.State a; output SchmidtGraphPoseCorrection.State b;
  algorithm
    b.position := a.estimator.position; b.velocity := a.estimator.velocity; b.rotation := a.estimator.rotation;
    b.accelBias := a.estimator.accelBias; b.gyroBias := a.estimator.gyroBias;
    b.covariance := a.estimator.covariance; b.crossCovariance := a.estimator.crossCovariance; b.referenceCovariance := a.estimator.referenceCovariance;
    b.referencePosition := a.estimator.referencePosition; b.referenceRotation := a.estimator.referenceRotation;
    b.referenceAvailable := true; b.referenceUsed := true; b.generation := a.generation; b.sourceRevision := a.sourceRevision;
    b.currentId := a.catalog.nextId-1; b.currentEpoch := a.catalog.lastEpoch; b.currentCaptureSequence := a.steps;
    b.referenceId := a.referenceBirth.catalogId; b.referenceEpoch := a.referenceBirth.epoch; b.referenceCaptureSequence := a.referenceBirth.sequence;
    b.lastUsedEpoch := a.catalog.lastEpoch; b.predictionTime := a.predictionTime; b.referenceTime := a.catalog.imageTimes[32];
  end Filter;
  function FullState
    output RGBDGraphEstimatorCommit.State state;
  protected
    RGBDLocalizationCatalog.State localization; RGBDLocalizationCatalog.Estimator estimator; RGBDKeyframes.Frame frame;
    Real L[21,21]; Real P[21,21]; Real R[3,3]; Integer owner;
  algorithm
    frame := RGBDLoopVerificationTests.Reference(false); frame.epoch := 32;
    R := GraphGaugeUncertaintyTests.Rotation({0.2,-0.3,0.1}); frame.bodyRotation := R; frame.bodyPosition := {1,2,3};
    for i in 1:21 loop for j in 1:21 loop L[i,j] := (if i == j then 0.2 else 0)+0.0003*i*j; end for; end for;
    P := L*transpose(L);
    estimator := RGBDLocalizationCatalog.EmptyEstimator(frame.bodyPosition,{0.4,-0.3,0.2},R,{0.01,0.02,0.03},{0.001,0.002,0.003},P[1:15,1:15]);
    estimator := RGBDLocalizationCatalogTests.Captured(estimator,frame); estimator.referenceUsed := 1; estimator.lastUsedEpoch := 128;
    estimator.crossCovariance := P[1:15,16:21]; estimator.referenceCovariance := P[16:21,16:21];
    // Disabled raw snapshot payload is deliberately opaque and must survive.
    estimator.referenceDescriptor[349,49] := 7e99; estimator.referencePoint[349,:] := {8e99,9e99,1e99};
    localization := RGBDLocalizationCatalog.Empty(estimator,1,17,1,17);
    localization.initialized := true; localization.predictionTime := 128; localization.steps := 128;
    localization.lastProcessedImageEpoch := 128; localization.lastProcessedImageTime := 128;
    localization.referenceBirth.epoch := 32; localization.referenceBirth.sequence := 32; localization.referenceBirth.catalogId := 32;
    localization.catalog := RGBDCatalogLoopTests.FullCatalog(false); localization.graph := RGBDGraphMeasurementTests.FullState();
    for node in 1:128 loop
      localization.catalog.bodyPositions[node,:] := frame.bodyPosition; localization.catalog.bodyRotations[node,:,:] := R;
    end for;
    localization.catalog.descriptors[128,349,49] := 7e99; localization.catalog.opticalPoints[128,349,:] := {8e99,9e99,1e99};
    localization.map.catalogRevision := 128; localization.map.frame := 128; localization.map.imageEpoch := 128; localization.map.imageTime := 128;
    for slot in 1:14400 loop
      owner := mod(slot-1,128)+1; localization.map.occupied[slot] := 1; localization.map.confidence[slot] := 3;
      localization.map.lastSeen[slot] := 128; localization.map.lastFrame[slot] := 128;
      localization.map.anchorId[slot] := owner; localization.map.anchorSlot[slot] := owner;
      localization.map.localPoint[slot,:] := {1+mod(slot,7)/10,-0.5+mod(slot,11)/10,2+mod(slot,13)/10};
      localization.map.point[slot,:] := R*localization.map.localPoint[slot,:]+frame.bodyPosition;
    end for;
    state := RGBDGraphEstimatorCommit.FromLocalization(localization);
  end FullState;
  function Run
    input Real executionTime = 0;
    output Boolean checks[21];
  protected
    RGBDGraphEstimatorCommit.State base; RGBDGraphEstimatorCommit.State previous; RGBDGraphEstimatorCommit.State normalized;
    RGBDGraphEstimatorCommit.Proposal proposal; RGBDGraphEstimatorCommit.Result result; RGBDGraphEstimatorCommit.Result retry;
    RGBDGraphEstimatorCommit.PoseView expectedView;
    GraphGaugeUncertainty.Binding binding; SchmidtGraphPoseCorrection.Attempt attempt; SchmidtGraphPoseCorrection.Policy policy;
    SchmidtGraphPoseCorrection.State filterState; SchmidtGraphPoseCorrection.State expectedFilter;
    RGBDCatalogMapping.State expectedMap;
    Real H[12,21]; Real Q[12,12]; Real K[21,12]; Real delta[21]; Real before[21,21]; Real reset[21,21]; Real D[12,12]; Real nis;
    Real M[12,12]; Integer current; Integer owner; Integer reason;
    Boolean requested; Boolean accepts; Boolean attempted; Boolean filterAccepted; Boolean changed;
  algorithm
    assert(RGBDKeyframes.keyframeCapacity == 128 and RGBDGraphMeasurements.edgeCapacity == 256 and RGBDKeyframes.featureCapacity == 350
      and RGBDCatalogMapping.mapCapacity == 14400,"Commit tests retain full128/256/350/14400 capacities");
    base := FullState(); checks := fill(false,21);
    for scenario in 1:21 loop
      previous := base;
      if scenario == 19 then
        // Inactivity control keeps the fixed128/256/350/14400 arrays intact.
        previous.localization.catalog.occupied[128] := false; previous.localization.catalog.nextId := 128; previous.localization.catalog.nextSlot := 128;
        previous.localization.catalog.lastEpoch := 127; previous.localization.catalog.lastTime := 127;
        previous.localization.graph.lastCaptureId := 127; previous.localization.graph.revision := 127;
        for edge in 1:256 loop if previous.localization.graph.edges[edge].currentId == 128 then previous.localization.graph.edges[edge].enabled := false; end if; end for;
        previous.localization.predictionTime := 127; previous.localization.steps := 127; previous.localization.lastProcessedImageEpoch := 127; previous.localization.lastProcessedImageTime := 127;
        previous.localization.estimator.lastUsedEpoch := 127; previous.localization.map.catalogRevision := 127;
        previous.localization.map.frame := 127; previous.localization.map.imageEpoch := 127; previous.localization.map.imageTime := 127;
        previous.poses.enabled[128] := false; previous.poses.catalogNextId := 128;
        previous.poses.ids[128] := -77; previous.poses.positions[128,:] := fill(1e99,3); previous.poses.rotations[128,:,:] := fill(-1e99,3,3);
        for slot in 1:14400 loop
          if previous.localization.map.anchorId[slot] == 128 then previous.localization.map.anchorId[slot] := 127; previous.localization.map.anchorSlot[slot] := 127; end if;
          previous.localization.map.lastSeen[slot] := 127; previous.localization.map.lastFrame[slot] := 127;
        end for;
      end if;
      current := previous.localization.catalog.nextId-1;
      binding.generation := 1; binding.sourceRevision := 17; binding.graphRevision := previous.localization.graph.revision; binding.catalogPoseRevision := 0;
      binding.anchorId := 1; binding.anchorEpoch := 1; binding.anchorCaptureSequence := 1; binding.anchorTime := 1;
      binding.currentId := current; binding.currentEpoch := current; binding.currentCaptureSequence := current; binding.currentTime := current;
      binding.referenceId := 32; binding.referenceEpoch := 32; binding.referenceCaptureSequence := 32; binding.referenceTime := 32;
      binding.chart := 1; binding.factorProvenance := 7; binding.anchorBoundProvenance := 11;
      proposal.poses := previous.poses; proposal.poses.revision := 1;
      for node in 2:current loop
        proposal.poses.positions[node,:] := previous.poses.positions[node,:]+{0.001*node,-0.0005*node,0.0003*node};
        proposal.poses.rotations[node,:,:] := previous.poses.rotations[node,:,:]*GraphGaugeUncertaintyTests.Rotation({0.0002*node,-0.0001*node,0.00015*node});
      end for;
      proposal.selected.binding := binding; proposal.graphRevision := binding.graphRevision; proposal.optimizerAccepted := true;
      for i in 1:12 loop for j in 1:12 loop M[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
      proposal.selected.covariance := M*transpose(M);
      attempt.generation := 1; attempt.graphRevision := 0; attempt.factorProvenance := 0;
      policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := 0.4;
      requested := true; accepts := true; attempted := true; filterAccepted := true; changed := true; reason := 0;
      if scenario == 2 then proposal.poses := previous.poses; changed := false;
      elseif scenario == 3 then previous.localization.map.point[14400,3] := previous.localization.map.point[14400,3]+1; accepts := false; reason := 6;
      elseif scenario == 4 then proposal.selected.binding.generation := 2; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 5 then previous.localization.predictionTime := 129; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 6 then previous.localization.referenceBirth.sequence := 33; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 7 then proposal.poses.revision := 0; accepts := false; filterAccepted := false; reason := 4;
      elseif scenario == 8 then attempt.graphRevision := proposal.graphRevision; attempt.factorProvenance := 7; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 9 then proposal.poses.positions[1,1] := proposal.poses.positions[1,1]+0.1; accepts := false; filterAccepted := false; reason := 4;
      elseif scenario == 10 then proposal.optimizerAccepted := false; accepts := false; filterAccepted := false; reason := 3;
      elseif scenario == 11 then policy.maximumNis := 1e-12; accepts := false; filterAccepted := false; reason := 5;
      elseif scenario == 12 then
        requested := false; previous.localization.generation := -1; previous.localization.catalog.descriptors[128,350,49] := -1e101;
        previous.poses.positions[128,:] := fill(1e101,3); accepts := false; attempted := false; filterAccepted := false; reason := 1;
      elseif scenario == 13 then proposal.selected.binding.sourceRevision := 18; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 14 then previous.correctionRevision := 1; previous.graphRevisionUsed := 127; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 15 then proposal.selected.binding.catalogPoseRevision := 1; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 16 then attempt.graphRevision := 127; attempt.factorProvenance := 7; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 17 then proposal.graphRevision := 127; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 18 then
        previous.localization.graph.edges[256].enabled := false; previous.localization.graph.edges[256].id := -77;
        previous.localization.graph.edges[256].information[6,6] := -1e99;
      elseif scenario == 19 then
        proposal.poses.ids[128] := -88; proposal.poses.positions[128,:] := fill(-1e99,3); proposal.poses.rotations[128,:,:] := fill(1e99,3,3);
      elseif scenario == 20 then previous.correctionRevision := 1; previous.graphRevisionUsed := 0; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 21 then accepts := false; filterAccepted := false; reason := 4;
      end if;
      proposal.selected.positions[1,:] := proposal.poses.positions[current,:]; proposal.selected.rotations[1,:,:] := proposal.poses.rotations[current,:,:];
      proposal.selected.positions[2,:] := proposal.poses.positions[32,:]; proposal.selected.rotations[2,:,:] := proposal.poses.rotations[32,:,:];
      if scenario == 7 or scenario == 21 then proposal.selected.positions[2,1] := proposal.selected.positions[2,1]+0.01; end if;
      result := RGBDGraphEstimatorCommit.Commit(previous,proposal,binding,attempt,policy,requested);
      checks[scenario] := result.accepted == accepts and result.reason == reason and result.attempted == attempted and result.filterAccepted == filterAccepted
        and result.nextAttempt.generation == attempt.generation and result.nextAttempt.graphRevision == (if attempted then proposal.graphRevision else attempt.graphRevision)
        and result.nextAttempt.factorProvenance == (if attempted then proposal.selected.binding.factorProvenance else attempt.factorProvenance);
      if accepts then
        filterState := Filter(previous.localization);
        (expectedFilter,H,Q,K,delta,before,reset,nis,D) := SchmidtGraphPoseCorrectionTests.Oracle(filterState,proposal.selected,policy.weight,false);
        checks[scenario] := checks[scenario] and max(abs(result.next.localization.estimator.position-expectedFilter.position)) < 2e-8
          and max(abs(result.next.localization.estimator.velocity-expectedFilter.velocity)) < 2e-8
          and max(abs(result.next.localization.estimator.accelBias-expectedFilter.accelBias)) < 2e-8
          and max(abs(result.next.localization.estimator.gyroBias-expectedFilter.gyroBias)) < 2e-8
          and max(abs(result.next.localization.estimator.rotation-expectedFilter.rotation)) < 2e-8
          and max(abs(result.next.localization.estimator.referencePosition-expectedFilter.referencePosition)) < 2e-8
          and max(abs(result.next.localization.estimator.referenceRotation-expectedFilter.referenceRotation)) < 2e-8
          and max(abs(result.next.localization.estimator.covariance-expectedFilter.covariance)) < 2e-7
          and max(abs(result.next.localization.estimator.crossCovariance-expectedFilter.crossCovariance)) < 2e-7
          and max(abs(result.next.localization.estimator.referenceCovariance-expectedFilter.referenceCovariance)) < 2e-7;
        expectedMap := previous.localization.map;
        if changed then
          for slot in 1:14400 loop owner := previous.localization.map.anchorSlot[slot];
            expectedMap.point[slot,:] := proposal.poses.rotations[owner,:,:]*previous.localization.map.localPoint[slot,:]+proposal.poses.positions[owner,:];
          end for;
        end if;
        checks[scenario] := checks[scenario] and RGBDCatalogMappingTests.EqualMap(result.next.localization.map,expectedMap,1e-9)
          and result.projectedCount == (if changed then 14400 else 0) and result.prunedCount == 0;
        expectedView := previous.poses; expectedView.revision := proposal.poses.revision;
        for node in 1:128 loop if previous.poses.enabled[node] then
          expectedView.positions[node,:] := proposal.poses.positions[node,:]; expectedView.rotations[node,:,:] := proposal.poses.rotations[node,:,:];
        end if; end for;
        checks[scenario] := checks[scenario] and EqualView(result.next.poses,expectedView)
          and result.next.correctionRevision == previous.correctionRevision+1 and result.next.graphRevisionUsed == proposal.graphRevision;
        normalized := result.next;
        normalized.localization.estimator.position := previous.localization.estimator.position;
        normalized.localization.estimator.velocity := previous.localization.estimator.velocity;
        normalized.localization.estimator.rotation := previous.localization.estimator.rotation;
        normalized.localization.estimator.accelBias := previous.localization.estimator.accelBias;
        normalized.localization.estimator.gyroBias := previous.localization.estimator.gyroBias;
        normalized.localization.estimator.covariance := previous.localization.estimator.covariance;
        normalized.localization.estimator.crossCovariance := previous.localization.estimator.crossCovariance;
        normalized.localization.estimator.referenceCovariance := previous.localization.estimator.referenceCovariance;
        normalized.localization.estimator.referencePosition := previous.localization.estimator.referencePosition;
        normalized.localization.estimator.referenceRotation := previous.localization.estimator.referenceRotation;
        normalized.localization.map := previous.localization.map;
        normalized.poses := previous.poses; normalized.correctionRevision := previous.correctionRevision; normalized.graphRevisionUsed := previous.graphRevisionUsed;
        checks[scenario] := checks[scenario] and Equal(normalized,previous);
        if changed then checks[scenario] := checks[scenario] and max(abs(result.next.localization.estimator.position-result.next.poses.positions[current,:])) > 1e-5; end if;
      else checks[scenario] := checks[scenario] and Equal(result.next,previous) and result.projectedCount == 0 and result.prunedCount == 0;
      end if;
      if scenario == 1 or scenario == 3 then
        retry := RGBDGraphEstimatorCommit.Commit(previous,proposal,binding,result.nextAttempt,policy,true);
        checks[scenario] := checks[scenario] and not retry.accepted and not retry.attempted and retry.reason == 2 and Equal(retry.next,previous);
      end if;
      if scenario == 3 then checks[scenario] := checks[scenario] and result.filterAccepted and result.mapReason <> 0; end if;
    end for;
  end Run;
  function CloneRun
    input Real executionTime = 0;
    output Boolean checks[9];
  protected
    RGBDGraphEstimatorCommit.State previous; RGBDGraphEstimatorCommit.State normalized;
    RGBDGraphEstimatorCommit.Proposal proposal; RGBDGraphEstimatorCommit.Result result; RGBDGraphEstimatorCommit.Result retry;
    RGBDKeyframes.Frame frame; GraphGaugeUncertainty.Binding binding;
    SchmidtGraphPoseCorrection.State filterState; SchmidtGraphPoseCorrection.State expected;
    SchmidtGraphPoseCorrection.Policy policy; SchmidtGraphPoseCorrection.Attempt attempt;
    RGBDCatalogMapping.State expectedMap;
    Real H[12,21]; Real Q[12,12]; Real K[21,12]; Real delta[21]; Real before[21,21]; Real reset[21,21]; Real D[12,12]; Real nis;
    Real M[6,6]; Real W[6,6]; Boolean accepts; Boolean attempted; Boolean filterAccepted; Boolean requested; Integer reason; Integer owner;
    Integer indices[6] = {1,2,3,7,8,9};
  algorithm
    for scenario in 1:9 loop
      previous := FullState(); frame := RGBDLoopVerificationTests.Reference(false); frame.epoch := 128;
      previous.localization.estimator := RGBDLocalizationCatalogTests.Captured(previous.localization.estimator,frame);
      previous.localization.estimator.lastUsedEpoch := 127;
      previous.localization.referenceBirth.catalogId := 128; previous.localization.referenceBirth.epoch := 128; previous.localization.referenceBirth.sequence := 128;
      binding := GraphGaugeUncertaintyTests.Binding(); binding.generation := 1; binding.sourceRevision := 17;
      binding.graphRevision := 128; binding.catalogPoseRevision := 0; binding.anchorId := 1; binding.anchorEpoch := 1; binding.anchorTime := 1; binding.anchorCaptureSequence := 1;
      binding.currentId := 128; binding.currentEpoch := 128; binding.currentTime := 128; binding.currentCaptureSequence := 128;
      binding.referenceId := 128; binding.referenceEpoch := 128; binding.referenceTime := 128; binding.referenceCaptureSequence := 128;
      proposal.poses := previous.poses; proposal.poses.revision := 1;
      for node in 2:128 loop
        proposal.poses.positions[node,:] := previous.poses.positions[node,:]+{0.001*node,-0.0005*node,0.0003*node};
        proposal.poses.rotations[node,:,:] := previous.poses.rotations[node,:,:]*GraphGaugeUncertaintyTests.Rotation({0.0002*node,-0.0001*node,0.00015*node});
      end for;
      proposal.selected.binding := binding; proposal.graphRevision := 128; proposal.optimizerAccepted := true;
      for i in 1:6 loop for j in 1:6 loop M[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
      W := M*transpose(M); proposal.selected.covariance[1:6,1:6] := W; proposal.selected.covariance[1:6,7:12] := W;
      proposal.selected.covariance[7:12,1:6] := W; proposal.selected.covariance[7:12,7:12] := W;
      attempt.generation := 1; attempt.graphRevision := 0; attempt.factorProvenance := 0;
      policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := 0.4;
      accepts := true; attempted := true; filterAccepted := true; requested := true; reason := 0;
      if scenario == 2 then proposal.poses := previous.poses;
      elseif scenario == 3 then previous.localization.map.point[14400,3] := previous.localization.map.point[14400,3]+1; accepts := false; reason := 6;
      elseif scenario == 4 then accepts := false; filterAccepted := false; reason := 4;
      elseif scenario == 5 then proposal.selected.covariance[7:12,7:12] := W+identity(6)*0.01; accepts := false; filterAccepted := false; reason := 5;
      elseif scenario == 6 then previous.localization.referenceBirth.sequence := 127; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 7 then binding.referenceEpoch := 127; proposal.selected.binding := binding; accepts := false; attempted := false; filterAccepted := false; reason := 2;
      elseif scenario == 8 then previous.localization.estimator.referenceCovariance := previous.localization.estimator.referenceCovariance+identity(6)*0.01; accepts := false; filterAccepted := false; reason := 5;
      elseif scenario == 9 then requested := false; previous.localization.map.localPoint[14400,:] := fill(-1e99,3); accepts := false; attempted := false; filterAccepted := false; reason := 1;
      end if;
      proposal.selected.positions[1,:] := proposal.poses.positions[128,:]; proposal.selected.positions[2,:] := proposal.selected.positions[1,:];
      proposal.selected.rotations[1,:,:] := proposal.poses.rotations[128,:,:]; proposal.selected.rotations[2,:,:] := proposal.selected.rotations[1,:,:];
      if scenario == 4 then proposal.selected.positions[2,1] := proposal.selected.positions[2,1]+0.01; end if;
      result := RGBDGraphEstimatorCommit.Commit(previous,proposal,binding,attempt,policy,requested);
      checks[scenario] := result.accepted == accepts and result.attempted == attempted and result.filterAccepted == filterAccepted and result.reason == reason;
      if accepts then
        filterState := Filter(previous.localization); filterState.referenceUsed := false; filterState.lastUsedEpoch := 127; filterState.referenceTime := 128;
        (expected,H,Q,K,delta,before,reset,nis,D) := SchmidtGraphPoseCorrectionTests.Oracle(filterState,proposal.selected,policy.weight,false);
        checks[scenario] := checks[scenario] and max(abs(result.next.localization.estimator.covariance-expected.covariance)) < 2e-7
          and max(abs(result.next.localization.estimator.crossCovariance-expected.crossCovariance)) < 2e-7
          and max(abs(result.next.localization.estimator.referenceCovariance-expected.referenceCovariance)) < 2e-7
          and max(abs(result.next.localization.estimator.position-expected.position)) < 2e-8
          and max(abs(result.next.localization.estimator.rotation-expected.rotation)) < 2e-8
          and max(abs(result.next.localization.estimator.velocity-expected.velocity)) < 2e-8
          and max(abs(result.next.localization.estimator.accelBias-expected.accelBias)) < 2e-8
          and max(abs(result.next.localization.estimator.gyroBias-expected.gyroBias)) < 2e-8
          and max(abs(result.next.localization.estimator.referencePosition-expected.referencePosition)) < 2e-8
          and max(abs(result.next.localization.estimator.referenceRotation-expected.referenceRotation)) < 2e-8;
        for i in 1:15 loop for j in 1:6 loop checks[scenario] := checks[scenario]
          and result.next.localization.estimator.crossCovariance[i,j] == result.next.localization.estimator.covariance[i,indices[j]]; end for; end for;
        expectedMap := previous.localization.map;
        if scenario <> 2 then for slot in 1:14400 loop
          owner := previous.localization.map.anchorSlot[slot]; expectedMap.point[slot,:] := proposal.poses.rotations[owner,:,:]*previous.localization.map.localPoint[slot,:]+proposal.poses.positions[owner,:];
        end for; end if;
        checks[scenario] := checks[scenario] and RGBDCatalogMappingTests.EqualMap(result.next.localization.map,expectedMap,1e-9)
          and result.projectedCount == (if scenario == 2 then 0 else 14400) and result.prunedCount == 0;
        normalized := result.next;
        normalized.localization.estimator.position := previous.localization.estimator.position;
        normalized.localization.estimator.velocity := previous.localization.estimator.velocity;
        normalized.localization.estimator.rotation := previous.localization.estimator.rotation;
        normalized.localization.estimator.accelBias := previous.localization.estimator.accelBias;
        normalized.localization.estimator.gyroBias := previous.localization.estimator.gyroBias;
        normalized.localization.estimator.covariance := previous.localization.estimator.covariance;
        normalized.localization.estimator.crossCovariance := previous.localization.estimator.crossCovariance;
        normalized.localization.estimator.referenceCovariance := previous.localization.estimator.referenceCovariance;
        normalized.localization.estimator.referencePosition := previous.localization.estimator.referencePosition;
        normalized.localization.estimator.referenceRotation := previous.localization.estimator.referenceRotation;
        normalized.localization.map := previous.localization.map; normalized.poses := previous.poses;
        normalized.correctionRevision := previous.correctionRevision; normalized.graphRevisionUsed := previous.graphRevisionUsed;
        checks[scenario] := checks[scenario] and Equal(normalized,previous);
      else checks[scenario] := checks[scenario] and Equal(result.next,previous); end if;
      if scenario == 1 or scenario == 3 then
        retry := RGBDGraphEstimatorCommit.Commit(previous,proposal,binding,result.nextAttempt,policy,true);
        checks[scenario] := checks[scenario] and not retry.accepted and not retry.attempted and retry.reason == 2 and Equal(retry.next,previous);
      end if;
    end for;
  end CloneRun;
end RGBDGraphEstimatorCommitTests;
