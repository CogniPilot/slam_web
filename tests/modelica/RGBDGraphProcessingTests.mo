// Full-capacity composition checks. The graph is a controlled, independently
// specified chain and loop graph; graph proposals and selected bounds are computed by the
// production Modelica chain, rather than supplied by this fixture.
package RGBDGraphProcessingTests
  constant Integer checkCount = 33;

  function Fixture
    input Real clock;
    output RGBDGraphProcessing.State result;
  protected
    RGBDLocalizationCatalog.State fresh;
    Real truthPosition[3]; Real truthRotation[3,3]; Integer owner; Integer source; Integer target;
  algorithm
    fresh := RGBDLocalizationCatalog.Empty(RGBDLocalizationCatalog.EmptyEstimator(),1,17);
    result := RGBDGraphProcessing.Empty(fresh);
    result.estimator := RGBDGraphEstimatorCommitTests.FullState();
    // The legacy fixture's last measured word was sparse bin256. Rebind its
    // dictionary AND every histogram together to the bootstrap's dense prefix.
    // No appearance measurement or histogram weight changes in this relabeling.
    for word in 1:31 loop
      result.vocabulary.words[word,:] := result.estimator.localization.catalog.descriptors[1,word,:];
      result.vocabulary.enabled[word] := 1.0;
    end for;
    result.vocabulary.words[32,:] := result.estimator.localization.catalog.descriptors[1,350,:];
    result.vocabulary.enabled[32] := 1.0; result.vocabulary.count := 32; result.vocabulary.ready := true;
    result.vocabulary.words[256,:] := fill(7e99,49);
    for node in 1:128 loop
      result.estimator.localization.catalog.histograms[node,32] := result.estimator.localization.catalog.histograms[node,256];
      result.estimator.localization.catalog.histograms[node,256] := 0.0;
    end for;
    result.captures.catalogNextId := result.estimator.localization.catalog.nextId;
    result.captures.lastStep := result.estimator.localization.steps;
    result.captures.ids := result.estimator.localization.catalog.ids;
    result.captures.epochs := result.estimator.localization.catalog.epochs;
    result.captures.times := result.estimator.localization.catalog.imageTimes;
    result.captures.sequences := result.estimator.localization.catalog.ids;
    truthPosition := result.estimator.poses.positions[1,:];
    truthRotation := result.estimator.poses.rotations[1,:,:];
    result.estimator.poses.revision := 7;
    for node in 1:128 loop
      result.estimator.localization.catalog.poseCovariances[node,:,:] := 0.01*identity(6);
      if node > 1 then
        result.estimator.poses.positions[node,:] := truthPosition
          +{0.01*sin(node+clock),0.015*cos(node+clock),0.005*sin(0.7*node)};
        result.estimator.poses.rotations[node,:,:] := truthRotation
          *GraphGaugeUncertaintyTests.Rotation({0.001*sin(node),-0.001*cos(node),0.0005*sin(0.3*node)});
      end if;
    end for;
    // All256 measured edges are independent of the perturbed warm-start view.
    // The mandatory consecutive chain and distinct loop endpoints satisfy the
    // real graph owner; information still receives its correlation inflation.
    for edge in 1:256 loop
      source := if edge <= 127 then edge else if edge <= 253 then 1 else if edge <= 255 then 2 else 3;
      target := if edge <= 127 then edge+1 else if edge <= 253 then edge-125 else if edge == 254 then 4 else if edge == 255 then 5 else 6;
      result.estimator.localization.graph.edges[edge].enabled := true;
      result.estimator.localization.graph.edges[edge].id := edge;
      result.estimator.localization.graph.edges[edge].kind := if edge <= 127 then 1 else 2;
      result.estimator.localization.graph.edges[edge].referenceId := source;
      result.estimator.localization.graph.edges[edge].referenceSlot := source;
      result.estimator.localization.graph.edges[edge].referenceEpoch := source;
      result.estimator.localization.graph.edges[edge].currentId := target;
      result.estimator.localization.graph.edges[edge].currentSlot := target;
      result.estimator.localization.graph.edges[edge].currentEpoch := target;
      result.estimator.localization.graph.edges[edge].translation := zeros(3);
      result.estimator.localization.graph.edges[edge].rotation := identity(3);
      result.estimator.localization.graph.edges[edge].covariance := 0.01*identity(6);
      result.estimator.localization.graph.edges[edge].information := 100*identity(6);
    end for;
    for point in 1:14400 loop
      owner := result.estimator.localization.map.anchorSlot[point];
      result.estimator.localization.map.point[point,:] := result.estimator.poses.positions[owner,:]
        +result.estimator.poses.rotations[owner,:,:]*result.estimator.localization.map.localPoint[point,:];
    end for;
    result.estimator.localization.estimator.position := result.estimator.poses.positions[128,:];
    result.estimator.localization.estimator.rotation := result.estimator.poses.rotations[128,:,:];
    result.estimator.localization.estimator.referencePosition := result.estimator.poses.positions[32,:];
    result.estimator.localization.estimator.referenceRotation := result.estimator.poses.rotations[32,:,:];
  end Fixture;

  function PartialFixture
    input Real clock;
    input Integer count;
    output RGBDGraphProcessing.State result;
  protected
    Integer owner;
  algorithm
    result := Fixture(clock);
    result.estimator.localization.catalog.nextId := count+1;
    result.estimator.localization.catalog.nextSlot := count+1;
    result.estimator.localization.catalog.lastEpoch := count;
    result.estimator.localization.catalog.lastTime := count;
    result.estimator.localization.graph.lastCaptureId := count;
    result.estimator.localization.graph.revision := count;
    result.estimator.localization.predictionTime := count;
    result.estimator.localization.steps := count;
    result.estimator.localization.lastProcessedImageEpoch := count;
    result.estimator.localization.lastProcessedImageTime := count;
    result.estimator.localization.estimator.lastUsedEpoch := count;
    result.estimator.localization.estimator.position := result.estimator.poses.positions[count,:];
    result.estimator.localization.estimator.rotation := result.estimator.poses.rotations[count,:,:];
    result.estimator.localization.map.catalogRevision := count;
    result.estimator.localization.map.frame := count;
    result.estimator.localization.map.imageEpoch := count;
    result.estimator.localization.map.imageTime := count;
    result.estimator.poses.catalogNextId := count+1;
    result.captures.catalogNextId := count+1;
    result.captures.lastStep := count;
    for node in 1:RGBDGraphProcessing.nodeCapacity loop
      if node > count then
        result.estimator.localization.catalog.occupied[node] := false;
        result.estimator.poses.enabled[node] := false;
        result.estimator.poses.ids[node] := -77;
        result.estimator.poses.positions[node,:] := fill(1e99,3);
        result.estimator.poses.rotations[node,:,:] := fill(-1e99,3,3);
      end if;
    end for;
    for edge in 1:RGBDGraphMeasurements.edgeCapacity loop
      if result.estimator.localization.graph.edges[edge].currentId > count then
        result.estimator.localization.graph.edges[edge].enabled := false;
      end if;
    end for;
    for point in 1:RGBDCatalogMapping.mapCapacity loop
      owner := mod(point-1,count)+1;
      result.estimator.localization.map.anchorId[point] := owner;
      result.estimator.localization.map.anchorSlot[point] := owner;
      result.estimator.localization.map.lastSeen[point] := count;
      result.estimator.localization.map.lastFrame[point] := count;
      result.estimator.localization.map.point[point,:] := result.estimator.poses.positions[owner,:]
        +result.estimator.poses.rotations[owner,:,:]*result.estimator.localization.map.localPoint[point,:];
    end for;
  end PartialFixture;

  function EqualVocabulary
    input RGBDVisualVocabulary.State a; input RGBDVisualVocabulary.State b;
    output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision
      and a.version == b.version and a.count == b.count and a.ready == b.ready
      and max(abs(a.words-b.words)) == 0.0 and max(abs(a.enabled-b.enabled)) == 0.0;
  end EqualVocabulary;

  function Equal
    input RGBDGraphProcessing.State a; input RGBDGraphProcessing.State b;
    output Boolean same;
  algorithm
    same := RGBDGraphEstimatorCommitTests.Equal(a.estimator,b.estimator)
      and EqualVocabulary(a.vocabulary,b.vocabulary)
      and RGBDGraphCaptureLedgerTests.Equal(a.captures,b.captures)
      and a.attempt.generation == b.attempt.generation and a.attempt.graphRevision == b.attempt.graphRevision
      and a.attempt.factorProvenance == b.attempt.factorProvenance
      and RGBDGraphAnchorBoundTests.Equal(a.anchor,b.anchor)
      and GraphGaugeUncertaintyTests.Equal(a.selected,b.selected);
  end Equal;

  function RawHeld
    input RGBDGraphProcessing.State previous; input RGBDGraphProcessing.State next;
    output Boolean same;
  protected RGBDGraphEstimatorCommit.State normalized;
  algorithm
    normalized := next.estimator;
    // Normalize ONLY fields that correction owns. Every descriptor, calibration,
    // raw snapshot, edge, local map point, lifecycle clock and counter is compared.
    normalized.poses := previous.estimator.poses;
    normalized.correctionRevision := previous.estimator.correctionRevision;
    normalized.graphRevisionUsed := previous.estimator.graphRevisionUsed;
    normalized.localization.estimator.position := previous.estimator.localization.estimator.position;
    normalized.localization.estimator.velocity := previous.estimator.localization.estimator.velocity;
    normalized.localization.estimator.rotation := previous.estimator.localization.estimator.rotation;
    normalized.localization.estimator.accelBias := previous.estimator.localization.estimator.accelBias;
    normalized.localization.estimator.gyroBias := previous.estimator.localization.estimator.gyroBias;
    normalized.localization.estimator.covariance := previous.estimator.localization.estimator.covariance;
    normalized.localization.estimator.crossCovariance := previous.estimator.localization.estimator.crossCovariance;
    normalized.localization.estimator.referenceCovariance := previous.estimator.localization.estimator.referenceCovariance;
    normalized.localization.estimator.referencePosition := previous.estimator.localization.estimator.referencePosition;
    normalized.localization.estimator.referenceRotation := previous.estimator.localization.estimator.referenceRotation;
    normalized.localization.map.point := previous.estimator.localization.map.point;
    same := RGBDGraphEstimatorCommitTests.Equal(normalized,previous.estimator)
      and EqualVocabulary(next.vocabulary,previous.vocabulary)
      and RGBDGraphCaptureLedgerTests.Equal(next.captures,previous.captures);
  end RawHeld;

  function Run
    input Real clock;
    output Boolean checks[checkCount];
  protected
    RGBDGraphProcessing.State fresh; RGBDGraphProcessing.State base; RGBDGraphProcessing.State previous;
    RGBDGraphProcessing.State corrected;
    RGBDGraphProcessing.State normalized; RGBDGraphProcessing.Policy policy;
    RGBDGraphProcessing.Result result; RGBDGraphProcessing.Result retry;
    Boolean valid; Integer owner; Integer selectedIndex; Integer count;
  algorithm
    assert(RGBDKeyframes.keyframeCapacity == 128 and RGBDGraphMeasurements.edgeCapacity == 256
      and RGBDKeyframes.featureCapacity == 350 and RGBDCatalogMapping.mapCapacity == 14400,
      "GraphProcessing tests retain full128/256/350/14400 capacities");
    checks := fill(false,checkCount);
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(RGBDLocalizationCatalog.EmptyEstimator(),1,17));
    checks[1] := RGBDGraphProcessing.Valid(fresh);
    base := Fixture(clock); policy := RGBDGraphProcessing.DefaultPolicy();
    result := RGBDGraphProcessing.Correct(base,policy,true);
    corrected := result.next;
    checks[2] := RGBDGraphProcessing.Valid(base) and result.accepted and result.reason == 0
      and result.attempted and result.optimizerStatus == 2 and result.costBefore > 1e-6
      and result.costAfter < 1e-12 and result.acceptedIterations > 0 and not result.roundoffCertified;
    checks[3] := result.next.estimator.poses.revision == 8 and result.next.estimator.correctionRevision == 1
      and result.next.estimator.graphRevisionUsed == 128 and RGBDGraphProcessing.Valid(result.next);
    for node in 1:128 loop
      checks[3] := checks[3] and max(abs(result.next.estimator.poses.positions[node,:]-base.estimator.poses.positions[1,:])) < 1e-5
        and max(abs(result.next.estimator.poses.rotations[node,:,:]-base.estimator.poses.rotations[1,:,:])) < 1e-5;
    end for;
    checks[4] := result.projectedCount == 14400 and result.prunedCount == 0;
    for point in 1:14400 loop
      owner := result.next.estimator.localization.map.anchorSlot[point];
      checks[4] := checks[4] and max(abs(result.next.estimator.localization.map.point[point,:]
        -result.next.estimator.poses.positions[owner,:]
        -result.next.estimator.poses.rotations[owner,:,:]*result.next.estimator.localization.map.localPoint[point,:])) < 1e-12;
    end for;
    checks[5] := RawHeld(base,result.next);
    checks[6] := result.next.attempt.graphRevision == 128 and result.next.attempt.factorProvenance == 128
      and result.next.selected.binding.currentCaptureSequence == 128 and result.next.selected.binding.referenceCaptureSequence == 32
      and result.next.selected.binding.catalogPoseRevision == 7 and result.next.anchor.binding.provenance == 128
      and result.next.selected.binding.factorProvenance == 128 and result.next.selected.covariance[1,7] <> 0
      and SLAMCovariancePSDCheck(result.next.selected.covariance,1e-12) == 1;
    // Raw captures are the exact zero-cost truth in this fixture. A positive
    // costBefore proves that the actual optimizer used the corrected warm start.
    checks[7] := result.costBefore > 1e-6
      and max(abs(base.estimator.localization.catalog.bodyPositions[128,:]-base.estimator.poses.positions[1,:])) == 0
      and max(abs(base.estimator.poses.positions[128,:]-base.estimator.localization.catalog.bodyPositions[128,:])) > 1e-4;
    previous := base;
    previous.estimator.localization.referenceBirth.catalogId := 128;
    previous.estimator.localization.referenceBirth.epoch := 128;
    previous.estimator.localization.referenceBirth.sequence := 128;
    previous.estimator.localization.estimator.referenceEpoch := 128;
    previous.estimator.localization.estimator.referencePosition := previous.estimator.localization.estimator.position;
    previous.estimator.localization.estimator.referenceRotation := previous.estimator.localization.estimator.rotation;
    for row in 1:15 loop for column in 1:6 loop
      selectedIndex := if column <= 3 then column else column+3;
      previous.estimator.localization.estimator.crossCovariance[row,column] := previous.estimator.localization.estimator.covariance[row,selectedIndex];
    end for; end for;
    for row in 1:6 loop for column in 1:6 loop
      previous.estimator.localization.estimator.referenceCovariance[row,column] :=
        previous.estimator.localization.estimator.covariance[if row <= 3 then row else row+3,if column <= 3 then column else column+3];
    end for; end for;
    result := RGBDGraphProcessing.Correct(previous,policy,true);
    checks[8] := result.accepted and GraphGaugeUncertainty.CloneEstimate(result.next.selected)
      and SchmidtGraphPoseCorrection.ExactClone(RGBDGraphEstimatorCommit.EstimatorState(result.next.estimator.localization))
      and RawHeld(previous,result.next) and RGBDGraphProcessing.Valid(result.next);

    previous := base; previous.estimator.localization.map.point[14400,1] := previous.estimator.localization.map.point[14400,1]+0.01;
    policy.covariancePCG := 0;
    result := RGBDGraphProcessing.Correct(previous,policy,true);
    normalized := result.next; normalized.attempt := previous.attempt;
    checks[9] := not result.accepted and result.reason == 7 and result.commitReason == 6
      and result.filterReason == 0 and result.attempted and result.next.attempt.graphRevision == 128
      and Equal(normalized,previous) and result.projectedCount == 0 and result.prunedCount == 0;
    retry := RGBDGraphProcessing.Correct(result.next,policy,true);
    checks[10] := not retry.accepted and not retry.attempted and retry.reason == 2
      and retry.optimizerStatus == 0 and Equal(retry.next,result.next);
    for scenario in 11:19 loop
      previous := base; valid := true; policy := RGBDGraphProcessing.DefaultPolicy();
      if scenario == 11 then previous.attempt.graphRevision := 128; previous.attempt.factorProvenance := 128;
      elseif scenario == 12 then previous.captures.sequences[128] := 127;
      elseif scenario == 13 then previous.estimator.poses.ids[128] := 0;
      elseif scenario == 14 then previous.estimator.localization.referenceBirth.catalogId := 0;
      elseif scenario == 15 then previous.estimator.localization.predictionTime := 128.01;
      elseif scenario == 16 then
        previous.estimator.localization.generation := -77; previous.captures.catalogNextId := -77; valid := false;
      elseif scenario == 17 then policy.maximumIterations := 0;
      elseif scenario == 18 then policy.anchorWeight := 1;
      elseif scenario == 19 then policy.covariancePCG := -1;
      end if;
      result := RGBDGraphProcessing.Correct(previous,policy,valid);
      checks[scenario] := not result.accepted and not result.attempted and Equal(result.next,previous)
        and result.reason == (if scenario == 16 then 1 else if scenario <= 15 then 2
          else if scenario == 17 then 4 else if scenario == 18 then 5 else 6);
      if scenario <= 16 then checks[scenario] := checks[scenario] and result.optimizerStatus == 0; end if;
    end for;
    previous := base; policy := RGBDGraphProcessing.DefaultPolicy();
    policy.covariancePCG := 0; policy.filter.maximumNis := 1e-15;
    result := RGBDGraphProcessing.Correct(previous,policy,true);
    normalized := result.next; normalized.attempt := previous.attempt;
    checks[20] := not result.accepted and result.reason == 7 and result.commitReason == 5
      and result.attempted and result.next.attempt.graphRevision == 128 and Equal(normalized,previous);
    retry := RGBDGraphProcessing.Correct(result.next,policy,true);
    checks[21] := not retry.accepted and retry.reason == 2 and not retry.attempted and Equal(retry.next,result.next);
    previous := corrected; previous.anchor.binding.slot := 0;
    result := RGBDGraphProcessing.Correct(previous,policy,true);
    checks[22] := not RGBDGraphProcessing.Valid(previous) and not result.accepted
      and result.reason == 2 and not result.attempted and result.optimizerStatus == 0 and Equal(result.next,previous);
    for scenario in 23:30 loop
      previous := corrected;
      if scenario == 23 then previous.vocabulary.generation := 2;
      elseif scenario == 24 then previous.vocabulary.sourceRevision := 18;
      elseif scenario == 25 then previous.vocabulary.version := 2;
      elseif scenario == 26 then previous.vocabulary.ready := false;
      elseif scenario == 27 then previous.vocabulary.count := 0;
      elseif scenario == 28 then previous.vocabulary.words[32,49] := 7e99;
      elseif scenario == 29 then previous.vocabulary.enabled[32] := 0.5;
      elseif scenario == 30 then previous.anchor.binding.slot := 2;
      end if;
      result := RGBDGraphProcessing.Correct(previous,policy,true);
      checks[scenario] := not RGBDGraphProcessing.Valid(previous) and not result.accepted
        and result.reason == 2 and not result.attempted and result.optimizerStatus == 0 and Equal(result.next,previous);
    end for;
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(RGBDLocalizationCatalog.EmptyEstimator(),7,19,41));
    checks[31] := RGBDGraphProcessing.Valid(fresh) and fresh.vocabulary.generation == 7
      and fresh.vocabulary.sourceRevision == 19 and fresh.vocabulary.version == 41
      and fresh.vocabulary.count == 0 and not fresh.vocabulary.ready;
    // Smaller active prefixes retain the full arrays and opaque inactive poses.
    for scenario in 32:33 loop
      count := if scenario == 32 then 33 else 127;
      previous := PartialFixture(clock,count);
      policy := RGBDGraphProcessing.DefaultPolicy();
      result := RGBDGraphProcessing.Correct(previous,policy,true);
      checks[scenario] := RGBDGraphProcessing.Valid(previous) and result.accepted
        and result.costBefore > 1e-6 and result.costAfter < 1e-12
        and result.projectedCount == RGBDCatalogMapping.mapCapacity
        and RGBDGraphProcessing.Valid(result.next) and RawHeld(previous,result.next);
      for node in 1:RGBDGraphProcessing.nodeCapacity loop
        if node <= count then
          checks[scenario] := checks[scenario]
            and max(abs(result.next.estimator.poses.positions[node,:]-previous.estimator.poses.positions[1,:])) < 1e-5
            and max(abs(result.next.estimator.poses.rotations[node,:,:]-previous.estimator.poses.rotations[1,:,:])) < 1e-5;
        else
          checks[scenario] := checks[scenario]
            and result.next.estimator.poses.ids[node] == previous.estimator.poses.ids[node]
            and max(abs(result.next.estimator.poses.positions[node,:]-previous.estimator.poses.positions[node,:])) == 0
            and max(abs(result.next.estimator.poses.rotations[node,:,:]-previous.estimator.poses.rotations[node,:,:])) == 0;
        end if;
      end for;
      for point in 1:RGBDCatalogMapping.mapCapacity loop
        owner := result.next.estimator.localization.map.anchorSlot[point];
        checks[scenario] := checks[scenario]
          and max(abs(result.next.estimator.localization.map.point[point,:]
            -result.next.estimator.poses.positions[owner,:]
            -result.next.estimator.poses.rotations[owner,:,:]
              *result.next.estimator.localization.map.localPoint[point,:])) < 1e-12;
      end for;
    end for;
  end Run;
end RGBDGraphProcessingTests;
