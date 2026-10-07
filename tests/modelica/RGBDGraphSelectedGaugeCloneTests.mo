package RGBDGraphSelectedGaugeCloneTests
  constant Integer checkCount = 20;

  function Cholesky6
    input Real A[6,6]; output Real L[6,6];
  protected Real value;
  algorithm
    L := zeros(6,6);
    for i in 1:6 loop for j in 1:i loop
      value := A[i,j];
      for k in 1:j-1 loop value := value-L[i,k]*L[j,k]; end for;
      L[i,j] := if i == j then sqrt(value) else value/L[j,j];
    end for; end for;
  end Cholesky6;

  function Run
    input Real clock; output Boolean checks[checkCount];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph;
    RGBDGraphMeasurements.Problem problem; RGBDGraphCaptureLedger.State ledger;
    RGBDGraphSelectedGauge.Context context; RGBDGraphSelectedGauge.Context previousContext;
    RGBDGraphSelectedGauge.Result result; GraphGaugeUncertainty.Binding binding;
    GraphGaugeUncertainty.Estimate previous; ModelicaPoseGraphCovariance.Result selected;
    Real positions[128,3]; Real rotations[128,3,3]; Real pa[3]; Real Ra[3,3]; Real Pa[6,6];
    Real LA[6,6]; Real LR[6,6]; Real t[2,3]; Real Q[2,3,3]; Real JA[12,6]; Real ignored[12,12];
    Real oracle[12,12]; Real shared[12,6]; Real actual[12,12]; Real gapFactor[12,6]; Real gap[12,12];
    Real beta; Real sign; Real scale;
    Integer count; Integer node; Integer slot; Integer aSlot; Integer cSlot; Integer expectedReason;
    Integer contextReason; Boolean contextAccepted; Boolean requested; Boolean shouldAccept;
  algorithm
    checks := fill(false,checkCount);
    for scenario in 1:checkCount loop
      count := if scenario == 3 then 4 else 128;
      (catalog,graph,context,positions,rotations,binding) := RGBDGraphSelectedGaugeTests.Fixture(count,clock);
      aSlot := mod(binding.anchorId-1,128)+1;
      node := if scenario == 2 then 1 else count; cSlot := mod((if count == 128 then 133 else 0)+node-1,128)+1;
      binding.currentId := catalog.ids[cSlot]; binding.currentEpoch := catalog.epochs[cSlot];
      binding.currentTime := catalog.imageTimes[cSlot]; binding.currentCaptureSequence := context.captureSequences[cSlot];
      binding.referenceId := binding.currentId; binding.referenceEpoch := binding.currentEpoch;
      binding.referenceTime := binding.currentTime; binding.referenceCaptureSequence := binding.currentCaptureSequence;
      ledger := RGBDGraphCaptureLedger.Empty(2,13); ledger.catalogNextId := catalog.nextId; ledger.lastStep := 2000;
      ledger.ids := context.captureIds; ledger.sequences := context.captureSequences;
      ledger.epochs := catalog.epochs; ledger.times := catalog.imageTimes;
      previousContext := context; previousContext.sourceRevision := -77;
      if scenario >= 17 then
        if scenario == 17 then ledger.ids[cSlot] := ledger.ids[cSlot]-128;
        elseif scenario == 18 then ledger.epochs[cSlot] := ledger.epochs[cSlot]+1;
        elseif scenario == 19 then ledger.times[cSlot] := ledger.times[cSlot]+0.1;
        elseif scenario == 20 then ledger.sequences[cSlot] := 0;
        end if;
      end if;
      (context,contextAccepted,contextReason) := RGBDGraphSelectedGauge.ContextFromLedger(
        previousContext,ledger,catalog,graph,13,2000,4,true);
      if scenario >= 17 then
        checks[scenario] := not contextAccepted and contextReason == 2
          and RGBDGraphSelectedGaugeContextTests.Equal(context,previousContext);
      else
        pa := positions[aSlot,:]; Ra := rotations[aSlot,:,:]; LA := zeros(6,6);
        for i in 1:6 loop for j in 1:6 loop LA[i,j] := (if i == j then 0.15 else 0)+0.0015*i*j; end for; end for;
        Pa := LA*transpose(LA); beta := if scenario == 4 then 0.8 else 0.3;
        requested := true; shouldAccept := scenario <= 6; expectedReason := 0;
        previous.binding := binding; previous.binding.sourceRevision := -77;
        previous.positions := {{7,8,9},{-1,-2,-3}}; previous.rotations := fill(-13,2,3,3);
        previous.covariance := fill(-77,12,12);
        if scenario == 7 then binding.referenceEpoch := binding.referenceEpoch-1; expectedReason := 3;
        elseif scenario == 8 then binding.referenceTime := binding.referenceTime-0.1; expectedReason := 3;
        elseif scenario == 9 then binding.referenceCaptureSequence := binding.referenceCaptureSequence-1; expectedReason := 3;
        elseif scenario == 10 then binding.referenceId := binding.referenceId-1; expectedReason := 3;
        elseif scenario == 11 then context.captureIds[cSlot] := context.captureIds[cSlot]-128; expectedReason := 2;
        elseif scenario == 12 then context.captureSequences[cSlot] := 0; expectedReason := 2;
        elseif scenario == 13 then context.captureSequences[cSlot] := 1007; expectedReason := 2;
        elseif scenario == 14 then binding.factorProvenance := 8; expectedReason := 3;
        elseif scenario == 15 then
          requested := false; expectedReason := 1; node := -77; catalog.nextId := -77;
          context.generation := -77; positions := fill(1e100,128,3); Pa := fill(-1e100,6,6);
        elseif scenario == 16 then rotations[cSlot,1,1] := 2; expectedReason := 4;
        end if;
        result := RGBDGraphSelectedGauge.SelectAndTransport(previous,catalog,graph,context,positions,rotations,
          node,node,binding,pa,Ra,Pa,11,7,beta,requested,0,1e-10);
        checks[scenario] := contextAccepted and contextReason == 0
          and result.accepted == shouldAccept and result.rejectionReason == expectedReason and not result.roundoffCertified;
        if shouldAccept then
          problem := RGBDGraphMeasurements.PrepareProblem(catalog,graph,true);
          for n in 1:problem.nodeCount loop
            slot := problem.catalogSlot[n]; problem.positions[n,:] := positions[slot,:]; problem.rotations[n,:,:] := rotations[slot,:,:];
          end for;
          // Independently invoke the selected owner on equal columns. This is
          // an adapter oracle, not an independent graph covariance proof.
          selected := ModelicaPoseGraphCovariance.Select(problem.positions,problem.rotations,problem.nodeMask,
            problem.edgeMask,problem.fromNode,problem.toNode,problem.measuredTranslation,problem.measuredRotation,
            problem.information,node,node,0,1e-10,true);
          if node == 1 then t := zeros(2,3); Q[1,:,:] := identity(3); Q[2,:,:] := identity(3);
          else
            t[1,:] := transpose(Ra)*(positions[cSlot,:]-pa); t[2,:] := t[1,:];
            Q[1,:,:] := transpose(Ra)*rotations[cSlot,:,:]; Q[2,:,:] := Q[1,:,:];
          end if;
          (JA,ignored) := GraphGaugeUncertaintyTests.Jacobians(Ra,t,Q);
          oracle := JA*Pa*transpose(JA)/beta+selected.upper/(1-beta); scale := max(1.0,max(abs(oracle)));
          checks[scenario] := checks[scenario] and selected.accepted and result.covarianceStatus == 1
            and result.transportReason == 0 and GraphGaugeUncertainty.CloneEstimate(result.estimate)
            and GraphGaugeUncertainty.SameBinding(result.estimate.binding,binding)
            and max(abs(result.estimate.positions[1,:]-positions[cSlot,:])) < 1e-12
            and max(abs(result.estimate.rotations[1,:,:]-rotations[cSlot,:,:])) < 1e-12;
          for i in 1:12 loop for j in 1:12 loop
            checks[scenario] := checks[scenario] and abs(result.estimate.covariance[i,j]-oracle[i,j]) < 2e-7*scale;
          end for; end for;
          for i in 1:6 loop for j in 1:6 loop
            checks[scenario] := checks[scenario] and selected.upper[i,j] == selected.upper[i,j+6]
              and selected.upper[i,j] == selected.upper[i+6,j] and selected.upper[i,j] == selected.upper[i+6,j+6];
          end for; end for;
          if scenario == 1 then
            checks[scenario] := checks[scenario] and problem.nodeCount == 128 and problem.edgeCount == 256
              and problem.catalogSlot[1] <> 1 and result.estimate.covariance[1,7] > 0;
          elseif scenario == 2 then
            checks[scenario] := checks[scenario] and max(abs(selected.upper)) == 0
              and result.estimate.covariance[1,1] > 0 and result.estimate.covariance[1,7] > 0;
          elseif scenario == 3 then
            checks[scenario] := checks[scenario] and problem.nodeCount == 4 and problem.edgeCount == 3;
          elseif scenario == 5 or scenario == 6 then
            // The duplicate bound is rank6, not SPD12: preserve the same
            // latent graph error in both rows rather than Cholesky12/fusing twice.
            LR := Cholesky6(selected.upper[1:6,1:6]); shared[1:6,:] := LR; shared[7:12,:] := LR;
            sign := if scenario == 5 then 1 else -1;
            actual := (JA*LA+sign*shared)*transpose(JA*LA+sign*shared);
            gapFactor := sqrt((1-beta)/beta)*JA*LA-sign*sqrt(beta/(1-beta))*shared;
            gap := gapFactor*transpose(gapFactor);
            checks[scenario] := checks[scenario] and max(abs(result.estimate.covariance-actual-gap)) < 3e-7*scale;
          end if;
        else
          checks[scenario] := checks[scenario] and GraphGaugeUncertaintyTests.Equal(result.estimate,previous)
            and result.covarianceStatus == 0 and result.transportReason == 0;
        end if;
      end if;
    end for;
  end Run;
end RGBDGraphSelectedGaugeCloneTests;
