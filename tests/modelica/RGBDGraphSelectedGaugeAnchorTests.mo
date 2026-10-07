package RGBDGraphSelectedGaugeAnchorTests
  constant Integer checkCount = 24;

  function Run
    input Real clock; output Boolean checks[checkCount];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph;
    RGBDGraphMeasurements.Problem problem; RGBDGraphCaptureLedger.State ledger;
    RGBDGraphSelectedGauge.Context context; RGBDGraphSelectedGauge.Result result;
    RGBDGraphAnchorBound.Estimate anchor; RGBDGraphAnchorBound.Estimate emptyAnchor;
    GraphGaugeUncertainty.Binding binding; GraphGaugeUncertainty.Estimate previous;
    ModelicaPoseGraphCovariance.Result selected;
    Real positions[128,3]; Real rotations[128,3,3]; Real LA[6,6]; Real t[2,3]; Real Q[2,3,3];
    Real JA[12,6]; Real ignored[12,12]; Real oracle[12,12]; Real beta; Real scale;
    Integer count; Integer aSlot; Integer cSlot; Integer rSlot; Integer slot;
    Integer currentNode; Integer referenceNode; Integer expectedReason; Integer anchorReason;
    Integer contextReason; Boolean anchorAccepted; Boolean contextAccepted; Boolean requested; Boolean shouldAccept;
  algorithm
    checks := fill(false,checkCount);
    for scenario in 1:checkCount loop
      count := if scenario == 4 then 4 else 128;
      (catalog,graph,context,positions,rotations,binding) := RGBDGraphSelectedGaugeTests.Fixture(count,clock);
      aSlot := mod(binding.anchorId-1,128)+1; cSlot := mod(binding.currentId-1,128)+1;
      currentNode := count; referenceNode := integer(count/2);
      if scenario == 3 or scenario == 5 then
        if scenario == 5 then currentNode := 1; cSlot := aSlot;
          binding.currentId := binding.anchorId; binding.currentEpoch := binding.anchorEpoch;
          binding.currentTime := binding.anchorTime; binding.currentCaptureSequence := binding.anchorCaptureSequence;
        end if;
        referenceNode := currentNode; binding.referenceId := binding.currentId; binding.referenceEpoch := binding.currentEpoch;
        binding.referenceTime := binding.currentTime; binding.referenceCaptureSequence := binding.currentCaptureSequence;
      end if;
      rSlot := mod(binding.referenceId-1,128)+1;
      if scenario == 2 then
        positions[aSlot,:] := catalog.bodyPositions[aSlot,:]; rotations[aSlot,:,:] := catalog.bodyRotations[aSlot,:,:];
      end if;
      LA := zeros(6,6);
      for i in 1:6 loop for j in 1:6 loop LA[i,j] := (if i == j then 0.15 else 0)+0.0015*i*j; end for; end for;
      catalog.poseCovariances[aSlot,:,:] := LA*transpose(LA);
      ledger := RGBDGraphCaptureLedger.Empty(2,13); ledger.catalogNextId := catalog.nextId; ledger.lastStep := 2000;
      ledger.ids := context.captureIds; ledger.sequences := context.captureSequences;
      ledger.epochs := catalog.epochs; ledger.times := catalog.imageTimes;
      (context,contextAccepted,contextReason) := RGBDGraphSelectedGauge.ContextFromLedger(
        context,ledger,catalog,graph,13,2000,4,true);
      emptyAnchor := RGBDGraphAnchorBound.Empty(2,13);
      (anchor,anchorAccepted,anchorReason) := RGBDGraphAnchorBound.FromCapture(
        emptyAnchor,catalog,ledger,13,2000,4,positions[aSlot,:],rotations[aSlot,:,:],11,
        if scenario == 6 then 0.7 else 0.5,5.0,0.35,true);
      previous.binding := binding; previous.binding.sourceRevision := -77;
      previous.positions := {{7,8,9},{-1,-2,-3}}; previous.rotations := fill(-13,2,3,3);
      previous.covariance := fill(-77,12,12);
      requested := true; shouldAccept := scenario <= 6; expectedReason := if shouldAccept then 0 else 7;
      beta := if scenario == 6 then 0.8 else 0.3;
      if scenario == 7 then anchor.binding.generation := 3;
      elseif scenario == 8 then anchor.binding.sourceRevision := 14;
      elseif scenario == 9 then anchor.binding.id := anchor.binding.id+1;
      elseif scenario == 10 then anchor.binding.slot := mod(aSlot,128)+1;
      elseif scenario == 11 then anchor.binding.epoch := anchor.binding.epoch+1;
      elseif scenario == 12 then anchor.binding.sequence := anchor.binding.sequence+1;
      elseif scenario == 13 then anchor.binding.catalogPoseRevision := 5;
      elseif scenario == 14 then anchor.binding.imageTime := anchor.binding.imageTime+0.1;
      elseif scenario == 15 then anchor.binding.provenance := 12;
      elseif scenario == 16 then anchor.position[1] := anchor.position[1]+0.1;
      elseif scenario == 17 then anchor.rotation := anchor.rotation*GraphGaugeUncertaintyTests.Rotation({0.001,0,0});
      elseif scenario == 18 then anchor.bound[6,6] := -1; expectedReason := 6;
      elseif scenario == 19 then binding.anchorBoundProvenance := 12;
      elseif scenario == 20 then
        requested := false; expectedReason := 1; catalog.nextId := -77; context.generation := -77;
        anchor := emptyAnchor; anchor.bound := fill(-1e100,6,6); currentNode := -77; referenceNode := -77;
        positions := fill(1e100,128,3);
      elseif scenario == 21 then context.captureIds[aSlot] := binding.anchorId-128;
      elseif scenario == 22 then context.captureSequences[aSlot] := binding.anchorCaptureSequence+1;
      elseif scenario == 23 then
        anchor.binding.id := binding.currentId; anchor.binding.slot := cSlot;
        anchor.binding.epoch := binding.currentEpoch; anchor.binding.sequence := binding.currentCaptureSequence;
        anchor.binding.imageTime := binding.currentTime;
      elseif scenario == 24 then anchor := emptyAnchor;
      end if;
      result := RGBDGraphSelectedGauge.SelectFromAnchor(previous,catalog,graph,context,positions,rotations,
        currentNode,referenceNode,binding,anchor,7,beta,requested,0,1e-10);
      checks[scenario] := contextAccepted and contextReason == 0 and anchorAccepted and anchorReason == 0
        and result.accepted == shouldAccept and result.rejectionReason == expectedReason and not result.roundoffCertified;
      if shouldAccept then
        problem := RGBDGraphMeasurements.PrepareProblem(catalog,graph,true);
        for node in 1:problem.nodeCount loop
          slot := problem.catalogSlot[node]; problem.positions[node,:] := positions[slot,:]; problem.rotations[node,:,:] := rotations[slot,:,:];
        end for;
        selected := ModelicaPoseGraphCovariance.Select(problem.positions,problem.rotations,problem.nodeMask,
          problem.edgeMask,problem.fromNode,problem.toNode,problem.measuredTranslation,problem.measuredRotation,
          problem.information,currentNode,referenceNode,0,1e-10,true);
        t[1,:] := if currentNode == 1 then zeros(3) else transpose(anchor.rotation)*(positions[cSlot,:]-anchor.position);
        t[2,:] := if referenceNode == 1 then zeros(3) else transpose(anchor.rotation)*(positions[rSlot,:]-anchor.position);
        Q[1,:,:] := if currentNode == 1 then identity(3) else transpose(anchor.rotation)*rotations[cSlot,:,:];
        Q[2,:,:] := if referenceNode == 1 then identity(3) else transpose(anchor.rotation)*rotations[rSlot,:,:];
        (JA,ignored) := GraphGaugeUncertaintyTests.Jacobians(anchor.rotation,t,Q);
        oracle := JA*anchor.bound*transpose(JA)/beta+selected.upper/(1-beta); scale := max(1.0,max(abs(oracle)));
        checks[scenario] := checks[scenario] and selected.accepted and result.covarianceStatus == 1
          and result.transportReason == 0 and GraphGaugeUncertainty.SameBinding(result.estimate.binding,binding)
          and max(abs(result.estimate.positions[1,:]-positions[cSlot,:])) < 1e-12
          and max(abs(result.estimate.positions[2,:]-positions[rSlot,:])) < 1e-12
          and max(abs(result.estimate.rotations[1,:,:]-rotations[cSlot,:,:])) < 1e-12
          and max(abs(result.estimate.rotations[2,:,:]-rotations[rSlot,:,:])) < 1e-12;
        for i in 1:12 loop for j in 1:12 loop
          checks[scenario] := checks[scenario] and abs(result.estimate.covariance[i,j]-oracle[i,j]) < 2e-7*scale;
        end for; end for;
        if scenario == 2 then checks[scenario] := checks[scenario] and max(abs(anchor.bound-catalog.poseCovariances[aSlot,:,:])) == 0;
        elseif scenario == 3 or scenario == 5 then checks[scenario] := checks[scenario] and GraphGaugeUncertainty.CloneEstimate(result.estimate);
        end if;
        if scenario == 5 then checks[scenario] := checks[scenario] and max(abs(selected.upper)) == 0 and result.estimate.covariance[1,7] > 0; end if;
        checks[scenario] := checks[scenario] and max(abs(anchor.bound)) > 0;
      else
        checks[scenario] := checks[scenario] and GraphGaugeUncertaintyTests.Equal(result.estimate,previous);
        if scenario == 18 then
          checks[scenario] := checks[scenario] and result.covarianceStatus == 1 and result.transportReason == 5;
        else checks[scenario] := checks[scenario] and result.covarianceStatus == 0 and result.transportReason == 0;
        end if;
      end if;
    end for;
  end Run;
end RGBDGraphSelectedGaugeAnchorTests;
