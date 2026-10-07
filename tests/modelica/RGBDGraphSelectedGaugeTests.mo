package RGBDGraphSelectedGaugeTests
  constant Integer checkCount = 60;

  function Inverse6
    input Real A[6,6]; output Real inverse[6,6];
  protected Real work[6,6]; Real swap; Real pivot; Real largest; Integer chosen;
  algorithm
    work := A; inverse := identity(6);
    for column in 1:6 loop
      chosen := column; largest := abs(work[column,column]);
      for row in column+1:6 loop
        if abs(work[row,column]) > largest then chosen := row; largest := abs(work[row,column]); end if;
      end for;
      for j in 1:6 loop
        swap := work[column,j]; work[column,j] := work[chosen,j]; work[chosen,j] := swap;
        swap := inverse[column,j]; inverse[column,j] := inverse[chosen,j]; inverse[chosen,j] := swap;
      end for;
      pivot := work[column,column]; work[column,:] := work[column,:]/pivot; inverse[column,:] := inverse[column,:]/pivot;
      for row in 1:6 loop
        if row <> column then
          pivot := work[row,column]; work[row,:] := work[row,:]-pivot*work[column,:];
          inverse[row,:] := inverse[row,:]-pivot*inverse[column,:];
        end if;
      end for;
    end for;
  end Inverse6;

  function Fixture
    input Integer count; input Real clock;
    output RGBDKeyframes.Catalog catalog;
    output RGBDGraphMeasurements.State graph;
    output RGBDGraphSelectedGauge.Context context;
    output Real positions[128,3]; output Real rotations[128,3,3];
    output GraphGaugeUncertainty.Binding binding;
  protected
    Integer base = 133; Integer slot; Integer a; Integer b; Integer aSlot; Integer bSlot;
    Real Ra[3,3]; Real L[6,6]; Real covariance[6,6]; Real information[6,6];
  algorithm
    catalog := RGBDKeyframes.Empty(2,1); graph := RGBDGraphMeasurements.Empty(2);
    context.generation := 2; context.sourceRevision := 13; context.graphRevision := 9; context.catalogPoseRevision := 4;
    context.captureIds := fill(-77,128); context.captureSequences := fill(-77,128);
    positions := fill(1e100,128,3); rotations := fill(1e100,128,3,3);
    Ra := GraphGaugeUncertaintyTests.Rotation({0.4,-0.3,0.2});
    catalog.nextId := if count == 128 then base+count+1 else count+1;
    catalog.nextSlot := mod(catalog.nextId-1,128)+1;
    catalog.lastEpoch := 300+5*count; catalog.lastTime := 20+0.02*count+clock;
    for node in 1:count loop
      slot := mod((if count == 128 then base else 0)+node-1,128)+1;
      catalog.occupied[slot] := true; catalog.ids[slot] := (if count == 128 then base else 0)+node;
      catalog.generations[slot] := 2; catalog.epochs[slot] := 300+5*node;
      catalog.imageTimes[slot] := 20+0.02*node+clock;
      context.captureIds[slot] := catalog.ids[slot]; context.captureSequences[slot] := 1000+7*node;
      positions[slot,:] := {10,-20,30}+Ra*{0.025*(node-1),0.3*sin(0.07*(node-1)),0.15*(cos(0.11*(node-1))-1)};
      rotations[slot,:,:] := Ra*GraphGaugeUncertaintyTests.Rotation({0.09*sin(0.05*(node-1)),-0.12*(cos(0.04*(node-1))-1),0.004*(node-1)});
      // Final graph means deliberately differ from immutable raw captures.
      catalog.bodyPositions[slot,:] := positions[slot,:]+{0.01*sin(node),0.02*cos(node),0.003};
      catalog.bodyRotations[slot,:,:] := rotations[slot,:,:]*GraphGaugeUncertaintyTests.Rotation({0.001,0.002,-0.001});
    end for;
    L := zeros(6,6);
    for i in 1:6 loop for j in 1:6 loop L[i,j] := (if i == j then 0.2 else 0)+0.001*i*j; end for; end for;
    covariance := L*transpose(L); information := Inverse6(covariance);
    // Prescribe exactly symmetric fixture information for the solver's exact
    // symmetric-operator profile; this is not production canonicalization.
    information := (information+transpose(information))/2;
    graph.revision := 9; graph.lastCaptureId := catalog.nextId-1;
    graph.nextEdgeId := if count == 128 then 257 else count;
    for edge in 1:256 loop
      if edge <= (if count == 128 then 256 else count-1) then
        a := if edge <= 127 then edge else if edge <= 253 then 1 else 2;
        b := if edge <= 127 then edge+1 else if edge <= 253 then edge-125 else edge-250;
        aSlot := mod((if count == 128 then base else 0)+a-1,128)+1;
        bSlot := mod((if count == 128 then base else 0)+b-1,128)+1;
        graph.edges[edge].enabled := true; graph.edges[edge].id := edge;
        graph.edges[edge].kind := if edge <= count-1 then 1 else 2;
        graph.edges[edge].referenceId := catalog.ids[aSlot]; graph.edges[edge].currentId := catalog.ids[bSlot];
        graph.edges[edge].referenceSlot := aSlot; graph.edges[edge].currentSlot := bSlot;
        graph.edges[edge].referenceEpoch := catalog.epochs[aSlot]; graph.edges[edge].currentEpoch := catalog.epochs[bSlot];
        graph.edges[edge].rotation := transpose(rotations[aSlot,:,:])*rotations[bSlot,:,:];
        graph.edges[edge].translation := transpose(rotations[aSlot,:,:])*(positions[bSlot,:]-positions[aSlot,:]);
        graph.edges[edge].covariance := covariance; graph.edges[edge].information := information;
      else
        graph.edges[edge].id := -77; graph.edges[edge].referenceId := -77; graph.edges[edge].referenceSlot := -77;
        graph.edges[edge].rotation := fill(1e100,3,3); graph.edges[edge].translation := fill(1e100,3);
        graph.edges[edge].covariance := fill(-1e100,6,6); graph.edges[edge].information := fill(1e100,6,6);
      end if;
    end for;
    slot := mod((if count == 128 then base else 0),128)+1;
    binding.generation := 2; binding.sourceRevision := 13; binding.graphRevision := 9; binding.catalogPoseRevision := 4;
    binding.anchorId := catalog.ids[slot]; binding.anchorEpoch := catalog.epochs[slot]; binding.anchorTime := catalog.imageTimes[slot];
    binding.anchorCaptureSequence := context.captureSequences[slot];
    slot := mod(catalog.nextId-2,128)+1;
    binding.currentId := catalog.ids[slot]; binding.currentEpoch := catalog.epochs[slot]; binding.currentTime := catalog.imageTimes[slot];
    binding.currentCaptureSequence := context.captureSequences[slot];
    slot := mod((if count == 128 then base else 0)+integer(count/2)-1,128)+1;
    binding.referenceId := catalog.ids[slot]; binding.referenceEpoch := catalog.epochs[slot]; binding.referenceTime := catalog.imageTimes[slot];
    binding.referenceCaptureSequence := context.captureSequences[slot]; binding.chart := 1;
    binding.factorProvenance := 7; binding.anchorBoundProvenance := 11;
  end Fixture;

  function Cholesky12
    input Real A[12,12]; output Real L[12,12];
  protected Real value;
  algorithm
    L := zeros(12,12);
    for i in 1:12 loop for j in 1:i loop
      value := A[i,j];
      for k in 1:j-1 loop value := value-L[i,k]*L[j,k]; end for;
      L[i,j] := if i == j then sqrt(value) else value/L[j,j];
    end for; end for;
  end Cholesky12;

  function Run
    input Real clock; output Boolean checks[checkCount];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph;
    RGBDGraphMeasurements.Problem problem; RGBDGraphSelectedGauge.Context context;
    RGBDGraphSelectedGauge.Result result; GraphGaugeUncertainty.Binding binding;
    GraphGaugeUncertainty.Estimate previous; ModelicaPoseGraphCovariance.Result selected;
    Real positions[128,3]; Real rotations[128,3,3]; Real anchorPosition[3]; Real anchorRotation[3,3];
    Real anchorBound[6,6]; Real LA[6,6]; Real t[2,3]; Real Q[2,3,3]; Real JA[12,6]; Real ignored[12,12];
    Real oracle[12,12]; Real LR[12,12]; Real shared[12,6]; Real residual[12,6]; Real gapFactor[12,6];
    Real actual[12,12]; Real gap[12,12]; Real beta; Real tolerance; Real sign; Real scale;
    Boolean requested; Boolean shouldAccept;
    Integer currentNode; Integer referenceNode; Integer count; Integer slot; Integer aSlot; Integer cSlot; Integer rSlot;
    Integer anchorProvenance; Integer factorProvenance; Integer reason; Integer covarianceStatus; Integer transportReason; Integer maximumPCG;
  algorithm
    checks := fill(false,checkCount);
    for scenario in 1:checkCount loop
      count := if scenario == 4 or scenario == 57 then 4 else 128;
      (catalog,graph,context,positions,rotations,binding) := Fixture(count,clock);
      currentNode := count; referenceNode := integer(count/2);
      aSlot := mod(binding.anchorId-1,128)+1; cSlot := mod(binding.currentId-1,128)+1; rSlot := mod(binding.referenceId-1,128)+1;
      anchorPosition := positions[aSlot,:]; anchorRotation := rotations[aSlot,:,:];
      LA := zeros(6,6);
      for i in 1:6 loop for j in 1:6 loop LA[i,j] := (if i == j then 0.15 else 0)+0.0015*i*j; end for; end for;
      anchorBound := LA*transpose(LA); anchorProvenance := 11; factorProvenance := 7;
      beta := 0.3; requested := true; shouldAccept := scenario <= 6;
      maximumPCG := 0; tolerance := 1e-10; reason := 0; covarianceStatus := 0; transportReason := 0;
      previous.binding := binding; previous.binding.sourceRevision := -77;
      previous.positions := {{7,8,9},{-1,-2,-3}}; previous.rotations := fill(-13,2,3,3); previous.covariance := fill(-77,12,12);
      if scenario == 2 then
        referenceNode := 1; rSlot := aSlot;
        binding.referenceId := binding.anchorId; binding.referenceEpoch := binding.anchorEpoch;
        binding.referenceTime := binding.anchorTime; binding.referenceCaptureSequence := binding.anchorCaptureSequence;
      elseif scenario == 3 then beta := 0.8;
      elseif scenario == 7 then
        requested := false; reason := 1; catalog.nextId := -1; graph.generation := -1;
        context.generation := -1; currentNode := -1; referenceNode := -1; beta := -1;
        positions := fill(1e100,128,3); rotations := fill(1e100,128,3,3); anchorBound := fill(-1e100,6,6);
      elseif scenario == 8 then context.generation := 3; reason := 2;
      elseif scenario == 9 then context.sourceRevision := -1; reason := 2;
      elseif scenario == 10 then context.graphRevision := 10; reason := 2;
      elseif scenario == 11 then context.catalogPoseRevision := -1; reason := 2;
      elseif scenario == 12 then context.captureIds[cSlot] := binding.currentId+1; reason := 2;
      elseif scenario == 13 then context.captureSequences[cSlot] := 0; reason := 2;
      elseif scenario == 14 then context.captureSequences[rSlot] := context.captureSequences[aSlot]; reason := 2;
      elseif scenario == 15 then catalog.ids[cSlot] := binding.currentId-1; reason := 2;
      elseif scenario == 16 then graph.generation := 3; reason := 2;
      elseif scenario == 17 then graph.edges[256].covariance[6,6] := -1; reason := 2;
      elseif scenario == 18 then graph.edges[1].enabled := false; reason := 2;
      elseif scenario == 19 then anchorProvenance := 0; reason := 2;
      elseif scenario == 20 then factorProvenance := 0; reason := 2;
      elseif scenario == 21 then currentNode := 0; reason := 3;
      elseif scenario == 22 then referenceNode := 129; reason := 3;
      elseif scenario == 23 then referenceNode := currentNode; reason := 3;
      elseif scenario == 24 then binding.generation := 3; reason := 3;
      elseif scenario == 25 then binding.sourceRevision := 14; reason := 3;
      elseif scenario == 26 then binding.graphRevision := 10; reason := 3;
      elseif scenario == 27 then binding.catalogPoseRevision := 5; reason := 3;
      elseif scenario == 28 then binding.anchorId := binding.anchorId+1; reason := 3;
      elseif scenario == 29 then binding.anchorEpoch := binding.anchorEpoch+1; reason := 3;
      elseif scenario == 30 then binding.currentId := binding.currentId-1; reason := 3;
      elseif scenario == 31 then binding.currentEpoch := binding.currentEpoch+1; reason := 3;
      elseif scenario == 32 then binding.referenceId := binding.referenceId-1; reason := 3;
      elseif scenario == 33 then binding.referenceEpoch := binding.referenceEpoch+1; reason := 3;
      elseif scenario == 34 then binding.anchorCaptureSequence := binding.anchorCaptureSequence+1; reason := 3;
      elseif scenario == 35 then binding.currentCaptureSequence := binding.currentCaptureSequence+1; reason := 3;
      elseif scenario == 36 then binding.referenceCaptureSequence := binding.referenceCaptureSequence+1; reason := 3;
      elseif scenario == 37 then binding.currentTime := binding.currentTime+0.1; reason := 3;
      elseif scenario == 38 then binding.referenceTime := binding.referenceTime+0.1; reason := 3;
      elseif scenario == 39 then binding.anchorTime := binding.anchorTime+0.1; reason := 3;
      elseif scenario == 40 then binding.factorProvenance := 8; reason := 3;
      elseif scenario == 41 then binding.anchorBoundProvenance := 12; reason := 3;
      elseif scenario == 42 then binding.chart := 2; reason := 3;
      elseif scenario == 43 then positions[cSlot,1] := 1e100; reason := 4;
      elseif scenario == 44 then rotations[rSlot,1,1] := 2; reason := 4;
      elseif scenario == 45 then anchorPosition[1] := anchorPosition[1]+0.1; reason := 4;
      elseif scenario == 46 then anchorRotation := identity(3); reason := 4;
      elseif scenario == 47 then
        graph.edges[1].rotation := graph.edges[1].rotation*GraphGaugeUncertaintyTests.Rotation({3.141492653589793,0,0});
        reason := 5; covarianceStatus := -4;
      elseif scenario == 48 then maximumPCG := 97; reason := 5; covarianceStatus := -1;
      elseif scenario == 49 then beta := 0; reason := 6; covarianceStatus := 1; transportReason := 3;
      elseif scenario == 50 then anchorBound[6,6] := -1; reason := 6; covarianceStatus := 1; transportReason := 5;
      elseif scenario == 51 then anchorBound[6,6] := 1e101; reason := 6; covarianceStatus := 1; transportReason := 5;
      elseif scenario == 52 then tolerance := 0; reason := 5; covarianceStatus := -1;
      elseif scenario == 53 then graph.edges[1].information[1,2] := graph.edges[1].information[1,2]+1e-12; reason := 5; covarianceStatus := -4;
      elseif scenario == 54 then context.captureSequences[cSlot] := 1000000001; reason := 2;
      elseif scenario == 55 then context.captureIds[aSlot] := binding.anchorId-128; reason := 2;
      elseif scenario == 56 then context.captureSequences[aSlot] := 0; reason := 2;
      elseif scenario == 57 then currentNode := 10; reason := 3;
      elseif scenario == 58 then binding.currentCaptureSequence := binding.currentId; reason := 3;
      elseif scenario == 59 then context.captureIds[rSlot] := binding.referenceId-128; reason := 2;
      elseif scenario == 60 then slot := mod(binding.anchorId+9-1,128)+1; positions[slot,1] := 1e100; reason := 4;
      end if;
      result := RGBDGraphSelectedGauge.SelectAndTransport(previous,catalog,graph,context,positions,rotations,
        currentNode,referenceNode,binding,anchorPosition,anchorRotation,anchorBound,anchorProvenance,factorProvenance,
        beta,requested,maximumPCG,tolerance);
      checks[scenario] := result.accepted == shouldAccept and result.rejectionReason == reason and not result.roundoffCertified;
      if shouldAccept then
        // The solver is called independently on prescribed final poses; this
        // comparison qualifies the adapter, not an independent solver oracle.
        problem := RGBDGraphMeasurements.PrepareProblem(catalog,graph,true);
        for node in 1:problem.nodeCount loop
          slot := problem.catalogSlot[node]; problem.positions[node,:] := positions[slot,:]; problem.rotations[node,:,:] := rotations[slot,:,:];
        end for;
        selected := ModelicaPoseGraphCovariance.Select(problem.positions,problem.rotations,problem.nodeMask,
          problem.edgeMask,problem.fromNode,problem.toNode,problem.measuredTranslation,problem.measuredRotation,
          problem.information,currentNode,referenceNode,0,1e-10,true);
        t[1,:] := transpose(anchorRotation)*(positions[cSlot,:]-anchorPosition);
        t[2,:] := transpose(anchorRotation)*(positions[rSlot,:]-anchorPosition);
        Q[1,:,:] := transpose(anchorRotation)*rotations[cSlot,:,:]; Q[2,:,:] := transpose(anchorRotation)*rotations[rSlot,:,:];
        // Independently differentiated manifold means. The selected errors
        // are already world-additive/right-local, so their Jacobian is I12.
        (JA,ignored) := GraphGaugeUncertaintyTests.Jacobians(anchorRotation,t,Q);
        oracle := JA*anchorBound*transpose(JA)/beta+selected.upper/(1-beta);
        scale := max(1.0,max(abs(oracle)));
        checks[scenario] := checks[scenario] and selected.accepted and result.covarianceStatus == 1
          and result.transportReason == 0 and GraphGaugeUncertainty.SameBinding(result.estimate.binding,binding);
        for i in 1:12 loop for j in 1:12 loop
          checks[scenario] := checks[scenario] and abs(result.estimate.covariance[i,j]-oracle[i,j]) < 2e-7*scale;
        end for; end for;
        checks[scenario] := checks[scenario] and max(abs(result.estimate.positions[1,:]-positions[cSlot,:])) < 1e-12
          and max(abs(result.estimate.positions[2,:]-positions[rSlot,:])) < 1e-12
          and max(abs(result.estimate.rotations[1,:,:]-rotations[cSlot,:,:])) < 1e-12
          and max(abs(result.estimate.rotations[2,:,:]-rotations[rSlot,:,:])) < 1e-12;
        if scenario == 1 then
          checks[scenario] := checks[scenario] and problem.nodeCount == 128 and problem.edgeCount == 256
            and problem.correlationInflation == 256 and problem.catalogSlot[1] <> 1
            and context.captureSequences[cSlot] <> catalog.ids[cSlot]
            and context.captureSequences[cSlot] <> catalog.epochs[cSlot]
            and max(abs(result.estimate.positions[1,:]-catalog.bodyPositions[cSlot,:])) > 1e-5
            and abs(result.estimate.covariance[1,10]) > 1e-5 and abs(result.estimate.covariance[1,7]) > 1e-5;
        elseif scenario == 2 then
          checks[scenario] := checks[scenario] and result.estimate.covariance[7,7] > 0
            and abs(result.estimate.covariance[1,7]) > 0 and max(abs(selected.upper[7:12,:])) == 0;
        elseif scenario == 4 then
          checks[scenario] := checks[scenario] and problem.nodeCount == 4 and problem.edgeCount == 3;
        elseif scenario == 5 or scenario == 6 then
          LR := Cholesky12(selected.upper); shared := LR[:,1:6]; residual := LR[:,7:12];
          sign := if scenario == 5 then 1 else -1;
          actual := (JA*LA+sign*shared)*transpose(JA*LA+sign*shared)+residual*transpose(residual);
          gapFactor := sqrt((1-beta)/beta)*JA*LA-sign*sqrt(beta/(1-beta))*shared;
          gap := gapFactor*transpose(gapFactor)+beta/(1-beta)*residual*transpose(residual);
          checks[scenario] := checks[scenario] and max(abs(result.estimate.covariance-actual-gap)) < 3e-7*scale;
        end if;
      else
        checks[scenario] := checks[scenario] and GraphGaugeUncertaintyTests.Equal(result.estimate,previous)
          and result.covarianceStatus == covarianceStatus and result.transportReason == transportReason;
      end if;
    end for;
  end Run;
end RGBDGraphSelectedGaugeTests;
