package RGBDLocalizationProcessingTests
  function EqualVocabulary
    input RGBDVisualVocabulary.State a; input RGBDVisualVocabulary.State b; output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision and a.version == b.version
      and a.count == b.count and a.ready == b.ready;
    for i in 1:256 loop same := same and a.enabled[i] == b.enabled[i];
      for j in 1:49 loop same := same and a.words[i,j] == b.words[i,j]; end for;
    end for;
  end EqualVocabulary;
  function EqualLedger
    input RGBDGraphCaptureLedger.State a; input RGBDGraphCaptureLedger.State b; output Boolean same;
  algorithm
    same := a.generation == b.generation and a.sourceRevision == b.sourceRevision and a.catalogNextId == b.catalogNextId and a.lastStep == b.lastStep;
    for slot in 1:128 loop same := same and a.ids[slot] == b.ids[slot] and a.epochs[slot] == b.epochs[slot]
      and a.sequences[slot] == b.sequences[slot] and a.times[slot] == b.times[slot]; end for;
  end EqualLedger;
  function EqualCaches
    input RGBDGraphProcessing.State a; input RGBDGraphProcessing.State b; output Boolean same;
  algorithm
    same := a.attempt.generation == b.attempt.generation and a.attempt.graphRevision == b.attempt.graphRevision and a.attempt.factorProvenance == b.attempt.factorProvenance
      and GraphGaugeUncertaintyTests.Equal(a.selected,b.selected)
      and a.anchor.binding.generation == b.anchor.binding.generation and a.anchor.binding.sourceRevision == b.anchor.binding.sourceRevision
      and a.anchor.binding.id == b.anchor.binding.id and a.anchor.binding.slot == b.anchor.binding.slot
      and a.anchor.binding.epoch == b.anchor.binding.epoch and a.anchor.binding.sequence == b.anchor.binding.sequence
      and a.anchor.binding.catalogPoseRevision == b.anchor.binding.catalogPoseRevision
      and a.anchor.binding.provenance == b.anchor.binding.provenance and a.anchor.binding.imageTime == b.anchor.binding.imageTime;
    for i in 1:3 loop same := same and a.anchor.position[i] == b.anchor.position[i];
      for j in 1:3 loop same := same and a.anchor.rotation[i,j] == b.anchor.rotation[i,j]; end for; end for;
    for i in 1:6 loop for j in 1:6 loop same := same and a.anchor.bound[i,j] == b.anchor.bound[i,j]; end for; end for;
  end EqualCaches;
  function Equal
    input RGBDGraphProcessing.State a; input RGBDGraphProcessing.State b; input Real geometryTolerance = 0; output Boolean same;
  protected RGBDGraphEstimatorCommit.State normalized;
  algorithm
    normalized := a.estimator; normalized.localization.map := b.estimator.localization.map;
    same := RGBDGraphEstimatorCommitTests.Equal(normalized,b.estimator)
      and RGBDCatalogMappingTests.EqualMap(a.estimator.localization.map,b.estimator.localization.map,geometryTolerance)
      and EqualLedger(a.captures,b.captures) and EqualCaches(a,b) and EqualVocabulary(a.vocabulary,b.vocabulary);
  end Equal;
  function Held
    input RGBDLocalizationProcessing.Result result; input RGBDGraphProcessing.State previous; output Boolean same;
  algorithm
    same := not result.accepted and not result.publication.accepted and not result.publication.imageCompleted and not result.publication.mappingAccepted
      and Equal(result.next,previous) and RGBDLocalizationCatalogTests.EqualState(result.publication.next,previous.estimator.localization);
  end Held;
  function Corrected
    output RGBDGraphProcessing.State state;
  protected
    RGBDGraphEstimatorCommit.State previous; RGBDGraphEstimatorCommit.Proposal proposal;
    RGBDGraphEstimatorCommit.Result result; GraphGaugeUncertainty.Binding b;
    SchmidtGraphPoseCorrection.Attempt attempt; SchmidtGraphPoseCorrection.Policy policy;
    Real M[12,12]; Real words[256,49]; Real enabled[256]; Boolean anchorAccepted; Integer anchorReason;
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
    b.chart := 1; b.factorProvenance := 128; b.anchorBoundProvenance := 128;
    proposal.selected.binding := b; proposal.graphRevision := 128; proposal.optimizerAccepted := true;
    proposal.selected.positions[1,:] := proposal.poses.positions[128,:]; proposal.selected.rotations[1,:,:] := proposal.poses.rotations[128,:,:];
    proposal.selected.positions[2,:] := proposal.poses.positions[32,:]; proposal.selected.rotations[2,:,:] := proposal.poses.rotations[32,:,:];
    for i in 1:12 loop for j in 1:12 loop M[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
    proposal.selected.covariance := M*transpose(M); attempt.generation := 1; attempt.graphRevision := 0; attempt.factorProvenance := 0;
    policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := 0.4;
    result := RGBDGraphEstimatorCommit.Commit(previous,proposal,b,attempt,policy,true);
    assert(result.accepted and result.projectedCount == 14400,"Real full-map graph correction precondition must accept");
    state.estimator := result.next; state.attempt := result.nextAttempt; state.selected := proposal.selected;
    state.captures := RGBDGraphCaptureLedger.Empty(1,17); state.captures.catalogNextId := 129; state.captures.lastStep := 199;
    state.estimator.localization.steps := 199;
    for slot in 1:128 loop state.captures.ids[slot] := slot; state.captures.epochs[slot] := slot; state.captures.sequences[slot] := slot; state.captures.times[slot] := slot; end for;
    (state.anchor,anchorAccepted,anchorReason) := RGBDGraphAnchorBound.FromCapture(RGBDGraphAnchorBound.Empty(1,17),state.estimator.localization.catalog,state.captures,17,199,0,state.estimator.poses.positions[1,:],state.estimator.poses.rotations[1,:,:],128);
    state.vocabulary := RGBDVisualVocabulary.Empty(1,17,1);
    (words,enabled) := RGBDCatalogLoopTests.Vocabulary(RGBDLoopVerificationTests.Reference(false));
    state.vocabulary.words[1:31,:] := words[1:31,:]; state.vocabulary.words[32,:] := words[256,:];
    state.vocabulary.count := 32; state.vocabulary.ready := true; state.vocabulary.enabled[1:32] := fill(1.0,32);
    state.vocabulary.words[256,49] := 1e101;
    for slot in 1:128 loop
      state.estimator.localization.catalog.histograms[slot,32] := state.estimator.localization.catalog.histograms[slot,256];
      state.estimator.localization.catalog.histograms[slot,256] := 0;
    end for;
    assert(anchorAccepted and RGBDGraphProcessing.Valid(state),"Corrected publication fixture must have authoritative ledger and receipts");
  end Corrected;

  function Bind
    input RGBDKeyframes.Frame template; input RGBDLocalizationCatalog.Estimator estimator;
    input Integer id; input Integer epoch; input Real imageTime; output RGBDKeyframes.Frame frame;
  protected Integer indices[6] = {1,2,3,7,8,9};
  algorithm
    frame := template; frame.id := id; frame.epoch := epoch; frame.imageTime := imageTime;
    frame.bodyPosition := estimator.position; frame.bodyRotation := estimator.rotation;
    for i in 1:6 loop for j in 1:6 loop frame.poseCovariance[i,j] := estimator.covariance[indices[i],indices[j]]; end for; end for;
  end Bind;
  function Main
    input Real clock; output Boolean checks[12];
  protected
    RGBDGraphProcessing.State base; RGBDGraphProcessing.State previous; RGBDGraphProcessing.State expected;
    RGBDLocalizationProcessing.Result first; RGBDLocalizationProcessing.Result capture; RGBDLocalizationProcessing.Result next; RGBDLocalizationProcessing.Result result;
    RGBDLocalizationCatalog.Estimator proposed; RGBDKeyframes.Frame template; RGBDKeyframes.Frame frame;
    RGBDCatalogGraphCapture.Result visual; RGBDCatalogMapping.State expectedMap;
    Real vocabulary[256,49]; Real enabled[256]; Real candidates[350,3]; Real mask[350]; Real local[3]; Real world[3]; Real h = 1.0/90;
  algorithm
    assert(RGBDKeyframes.keyframeCapacity == 128 and RGBDGraphMeasurements.edgeCapacity == 256 and RGBDKeyframes.featureCapacity == 350 and RGBDCatalogMapping.mapCapacity == 14400,"Publication retains all capacities");
    base := Corrected(); template := RGBDLoopVerificationTests.Reference(false); vocabulary := base.vocabulary.words; enabled := base.vocabulary.enabled;
    proposed := base.estimator.localization.estimator; proposed.lastUsedEpoch := 129; proposed.referenceUsed := 1;
    frame := Bind(template,proposed,129,129,128+h); candidates := fill(1e101,350,3); mask := zeros(350);
    first := RGBDLocalizationProcessing.Publish(base,proposed,frame,1,1,0,true,129,frame.imageTime,h,false,true,0,true,candidates,mask,minimumInterval=0.005,maximumInterval=0.015,minimumMeasuredDescriptors=-1,minimumWordDistanceSquared=-1);
    expected := base; expected.estimator.localization.estimator := proposed; expected.estimator.localization.steps := 200; expected.estimator.localization.predictionTime := frame.imageTime;
    expected.estimator.localization.lastProcessedImageEpoch := 129; expected.estimator.localization.lastProcessedImageTime := frame.imageTime;
    expected.estimator.localization.map.frame := 129; expected.estimator.localization.map.imageEpoch := 129; expected.estimator.localization.map.imageTime := frame.imageTime;
    expected.captures.lastStep := 200;
    checks[1] := first.accepted and first.vocabularyReason == 3 and first.publication.mappingAccepted and not first.publication.decision.captureRequested and Equal(first.next,expected);
    proposed := first.next.estimator.localization.estimator; frame := Bind(template,proposed,129,130,128+2*h);
    proposed := RGBDLocalizationCatalogTests.Captured(proposed,frame); frame := Bind(template,proposed,129,130,128+2*h);
    local := {frame.opticalPoint[350,3]+0.18,-frame.opticalPoint[350,1],-frame.opticalPoint[350,2]-0.04};
    world := frame.bodyRotation*local+frame.bodyPosition; candidates[350,:] := world; mask[350] := 1;
    visual := RGBDCatalogGraphCapture.Capture(base.estimator.localization.catalog,frame,vocabulary,enabled,base.estimator.localization.graph,true,trials=96);
    assert(visual.accepted,"Qualified actual96-trial visual capture must accept");
    capture := RGBDLocalizationProcessing.Publish(first.next,proposed,frame,1,0,1,true,130,frame.imageTime,h,false,true,0,true,candidates,mask,minimumInterval=0.005,maximumInterval=0.015);
    expected := first.next; expected.estimator.localization.estimator := proposed; expected.estimator.localization.steps := 201; expected.estimator.localization.predictionTime := frame.imageTime;
    expected.estimator.localization.lastProcessedImageEpoch := 130; expected.estimator.localization.lastProcessedImageTime := frame.imageTime;
    expected.estimator.localization.catalog := visual.catalog; expected.estimator.localization.graph := visual.graph;
    expected.estimator.localization.referenceBirth.epoch := 130; expected.estimator.localization.referenceBirth.sequence := 201; expected.estimator.localization.referenceBirth.catalogId := 129;
    expected.estimator.poses.revision := 2; expected.estimator.poses.catalogNextId := 130; expected.estimator.poses.ids[1] := 129;
    expected.estimator.poses.positions[1,:] := frame.bodyPosition; expected.estimator.poses.rotations[1,:,:] := frame.bodyRotation;
    expected.captures.catalogNextId := 130; expected.captures.lastStep := 201; expected.captures.ids[1] := 129; expected.captures.epochs[1] := 130; expected.captures.sequences[1] := 201; expected.captures.times[1] := frame.imageTime;
    expectedMap := first.next.estimator.localization.map;
    for slot in 1:14400 loop if expectedMap.anchorId[slot] == 1 then
      expectedMap.point[slot,:] := zeros(3); expectedMap.localPoint[slot,:] := zeros(3); expectedMap.occupied[slot] := 0; expectedMap.anchorId[slot] := 0; expectedMap.anchorSlot[slot] := 0;
      expectedMap.confidence[slot] := 0; expectedMap.lastSeen[slot] := 0; expectedMap.lastFrame[slot] := 0;
    end if; end for;
    expectedMap.catalogRevision := 129; expectedMap.frame := 130; expectedMap.imageEpoch := 130; expectedMap.imageTime := frame.imageTime;
    expectedMap.point[1,:] := world; expectedMap.localPoint[1,:] := local; expectedMap.occupied[1] := 1; expectedMap.anchorId[1] := 129; expectedMap.anchorSlot[1] := 1;
    expectedMap.confidence[1] := 1; expectedMap.lastSeen[1] := frame.imageTime; expectedMap.lastFrame[1] := 130;
    expected.estimator.localization.map := expectedMap;
    checks[2] := capture.accepted and capture.publication.mappingAccepted and capture.publication.decision.captureRequested
      and capture.publication.mapDiagnostics.evictedCount == 113 and capture.publication.mapDiagnostics.insertedCount == 1 and Equal(capture.next,expected,1e-9);
    proposed := capture.next.estimator.localization.estimator; proposed.lastUsedEpoch := 131; proposed.referenceUsed := 1;
    frame := Bind(template,proposed,130,131,128+3*h);
    next := RGBDLocalizationProcessing.Publish(capture.next,proposed,frame,1,1,0,true,131,frame.imageTime,h,false,true,0,true,candidates,mask,minimumInterval=0.005,maximumInterval=0.015);
    expected.estimator.localization.estimator := proposed; expected.estimator.localization.steps := 202; expected.estimator.localization.predictionTime := frame.imageTime;
    expected.estimator.localization.lastProcessedImageEpoch := 131; expected.estimator.localization.lastProcessedImageTime := frame.imageTime;
    expected.estimator.localization.map.frame := 131; expected.estimator.localization.map.imageEpoch := 131; expected.estimator.localization.map.imageTime := frame.imageTime;
    expected.estimator.localization.map.confidence[1] := 2; expected.estimator.localization.map.lastSeen[1] := frame.imageTime; expected.estimator.localization.map.lastFrame[1] := 131; expected.captures.lastStep := 202;
    checks[3] := next.accepted and next.publication.mappingAccepted and not next.publication.decision.captureRequested and next.publication.mapDiagnostics.mergedCount == 1 and Equal(next.next,expected,1e-9);
    for scenario in 4:12 loop
      previous := base; proposed := base.estimator.localization.estimator; proposed.lastUsedEpoch := 129; proposed.referenceUsed := 1;
      frame := Bind(template,proposed,129,129,128+h);
      if scenario == 4 then previous.captures.sequences[128] := 127;
      elseif scenario == 5 then previous.estimator.poses.sourceRevision := 18;
      elseif scenario == 6 then previous.selected.binding.generation := 2;
      elseif scenario == 7 then previous.estimator.localization.generation := -1; previous.estimator.localization.map.localPoint[14400,:] := fill(-1e101,3);
      elseif scenario == 9 then previous.estimator.localization.steps := RGBDKeyframes.identifierLimit-1; previous.captures.lastStep := previous.estimator.localization.steps;
      elseif scenario == 10 then proposed := RGBDLocalizationCatalogTests.Captured(base.estimator.localization.estimator,frame);
      elseif scenario == 11 then previous := first.next; previous.estimator.localization.map.localPoint[14400,3] := previous.estimator.localization.map.localPoint[14400,3]+1;
        frame := Bind(template,previous.estimator.localization.estimator,129,130,128+2*h); proposed := RGBDLocalizationCatalogTests.Captured(previous.estimator.localization.estimator,frame);
      elseif scenario == 12 then proposed := base.estimator.localization.estimator;
      end if;
      result := RGBDLocalizationProcessing.Publish(previous,proposed,frame,if scenario == 8 then 0 else 1,
        if scenario == 10 or scenario == 11 or scenario == 12 then 0 else 1,if scenario == 10 or scenario == 11 then 1 else 0,
        scenario <> 12,frame.epoch,frame.imageTime,h,false,scenario <> 10 and scenario <> 12,0,scenario <> 7,
        candidates,mask,minimumInterval=0.005,maximumInterval=0.015);
      if scenario <= 9 then checks[scenario] := Held(result,previous) and result.reason == (if scenario == 7 then 1 else if scenario == 8 then 3 else if scenario == 9 then 4 else 2);
      else
        expected := previous; expected.estimator.localization.estimator := proposed; expected.estimator.localization.steps := previous.estimator.localization.steps+1; expected.estimator.localization.predictionTime := frame.imageTime; expected.captures.lastStep := expected.estimator.localization.steps;
        if scenario <> 12 then expected.estimator.localization.lastProcessedImageEpoch := frame.epoch; expected.estimator.localization.lastProcessedImageTime := frame.imageTime;
          expected.estimator.localization.referenceBirth.epoch := frame.epoch; expected.estimator.localization.referenceBirth.sequence := expected.estimator.localization.steps; expected.estimator.localization.referenceBirth.catalogId := 0;
        end if;
        checks[scenario] := result.accepted and not result.publication.mappingAccepted and Equal(result.next,expected);
      end if;
    end for;
  end Main;
  function Learning
    input Real clock; output Boolean checks[15];
  protected
    RGBDGraphProcessing.State empty; RGBDGraphProcessing.State pendingOwner; RGBDGraphProcessing.State previous;
    RGBDLocalizationCatalog.State localization;
    RGBDLocalizationCatalog.Estimator proposed;
    RGBDKeyframes.Frame template; RGBDKeyframes.Frame frame;
    RGBDLocalizationProcessing.Result first; RGBDLocalizationProcessing.Result result;
    Real candidates[350,3]; Real mask[350]; Real h=1.0/90;
    Real mean; Real energy; Real expectedWord[49]; Integer feature;
    Boolean wordsCorrect;
  algorithm
    template := RGBDLoopVerificationTests.Reference(false);
    localization := RGBDLocalizationCatalog.Empty(RGBDLocalizationCatalog.EmptyEstimator(),1,17,1,17);
    empty := RGBDGraphProcessing.Empty(localization);
    // Opaque padding survives pendingOwner learning and later freezing.
    empty.vocabulary.words[256,49] := 1e101;
    candidates := fill(1e101,350,3); mask := zeros(350);
    frame := Bind(template,localization.estimator,1,0,0);
    proposed := RGBDLocalizationCatalogTests.Captured(localization.estimator,frame);
    first := RGBDLocalizationProcessing.Publish(empty,proposed,frame,1,0,1,true,0,0,0,true,true,0,true,
      candidates,mask,minimumMeasuredDescriptors=350);
    pendingOwner := first.next;
    wordsCorrect := true;
    // Independent centering/normalization oracle; measured slot350 becomes word32.
    for word in 1:32 loop
      feature := if word == 32 then 350 else word;
      mean := sum(template.descriptor[feature,:])/49;
      expectedWord := template.descriptor[feature,:]-fill(mean,49);
      energy := sqrt(sum(expectedWord .* expectedWord)); expectedWord := expectedWord/energy;
      for component in 1:49 loop wordsCorrect := wordsCorrect and abs(pendingOwner.vocabulary.words[word,component]-expectedWord[component]) < 1e-12; end for;
    end for;
    checks[1] := first.accepted and first.vocabularyReason == 2 and first.publication.frameRejectionReason == 9
      and not first.publication.mappingAccepted and not pendingOwner.vocabulary.ready and pendingOwner.vocabulary.count == 32
      and wordsCorrect and pendingOwner.vocabulary.words[256,49] == 1e101
      and pendingOwner.estimator.localization.catalog.nextId == 1 and pendingOwner.estimator.localization.map.frame == 0
      and pendingOwner.estimator.localization.referenceBirth.catalogId == 0 and pendingOwner.captures.lastStep == 1;
    // A restored pendingOwner dictionary continues on the next actual acquisition.
    proposed := pendingOwner.estimator.localization.estimator; proposed.lastUsedEpoch := 1; proposed.referenceUsed := 1;
    frame := Bind(template,proposed,1,1,h);
    result := RGBDLocalizationProcessing.Publish(pendingOwner,proposed,frame,1,1,0,true,1,h,h,false,true,0,true,candidates,mask);
    checks[2] := result.accepted and result.vocabularyReason == 1 and result.next.vocabulary.ready
      and result.next.vocabulary.count == 32 and result.next.vocabulary.words[256,49] == 1e101
      and result.publication.mappingAccepted and result.next.estimator.localization.catalog.nextId == 2
      and result.next.estimator.localization.catalog.histograms[1,32] > 0
      and result.next.estimator.localization.catalog.histograms[1,256] == 0
      and result.next.captures.sequences[1] == 2 and result.next.estimator.localization.referenceBirth.catalogId == 0;
    for scenario in 3:12 loop
      previous := pendingOwner; proposed := pendingOwner.estimator.localization.estimator;
      proposed.lastUsedEpoch := 1; proposed.referenceUsed := 1;
      frame := Bind(template,proposed,1,1,h);
      if scenario == 3 then frame.generation := 2;
      elseif scenario == 4 then frame.bodyPosition[3] := frame.bodyPosition[3]+1;
      elseif scenario == 5 then frame.descriptor[350,49] := 1e101;
      elseif scenario == 6 then frame.count := 349;
      elseif scenario == 8 then frame.epoch := 0; frame.imageTime := h;
      elseif scenario == 9 then previous.estimator.localization.steps := RGBDKeyframes.identifierLimit-1; previous.captures.lastStep := previous.estimator.localization.steps;
      elseif scenario == 10 then previous.vocabulary.words[1,1] := 1e101;
      elseif scenario == 11 then previous.vocabulary.generation := 2;
      elseif scenario == 12 then previous.vocabulary.words[1,1] := 1e101;
      end if;
      result := RGBDLocalizationProcessing.Publish(previous,proposed,frame,if scenario == 7 then 0 else 1,
        1,if scenario == 7 then 1 else 0,true,frame.epoch,frame.imageTime,h,false,true,0,scenario <> 12,candidates,mask);
      if scenario == 3 or scenario == 4 then
        checks[scenario] := result.accepted and not result.publication.mappingAccepted and result.publication.frameRejectionReason == 8
          and result.vocabularyReason == 0 and EqualVocabulary(result.next.vocabulary,previous.vocabulary);
      elseif scenario == 5 or scenario == 6 then
        checks[scenario] := result.accepted and not result.publication.mappingAccepted and result.publication.frameRejectionReason == 9
          and result.vocabularyReason == -4 and EqualVocabulary(result.next.vocabulary,previous.vocabulary)
          and result.next.estimator.localization.catalog.nextId == 1 and result.next.estimator.localization.map.frame == 0;
      else
        checks[scenario] := Held(result,previous) and result.reason ==
          (if scenario == 7 or scenario == 8 then 3 else if scenario == 9 then 4 else if scenario == 12 then 1 else 2)
          and (scenario <> 9 or result.vocabularyReason == 1);
      end if;
    end for;
    for scenario in 13:14 loop
      frame := Bind(template,localization.estimator,1,0,0);
      frame.enabled := fill(false,350);
      if scenario == 13 then frame.enabled[1] := true; frame.enabled[350] := true; end if;
      // All disabled cells remain poisoned and must not be read by learning.
      for featureIndex in 1:350 loop
        if not frame.enabled[featureIndex] then frame.descriptor[featureIndex,:] := fill(1e101,49); end if;
      end for;
      proposed := RGBDLocalizationCatalogTests.Captured(localization.estimator,frame);
      result := RGBDLocalizationProcessing.Publish(empty,proposed,frame,1,0,1,true,0,0,0,true,true,0,true,candidates,mask);
      checks[scenario] := result.accepted and result.vocabularyReason == 2 and not result.publication.mappingAccepted
        and not result.next.vocabulary.ready and result.next.vocabulary.count == (if scenario == 13 then 2 else 0)
        and result.next.estimator.localization.catalog.nextId == 1 and result.next.estimator.localization.map.frame == 0
        and result.next.vocabulary.words[256,49] == 1e101;
    end for;
    proposed := pendingOwner.estimator.localization.estimator;
    frame.descriptor := fill(1e101,350,49); frame.generation := -1;
    result := RGBDLocalizationProcessing.Publish(pendingOwner,proposed,frame,1,0,0,false,1,h,h,false,false,0,true,
      candidates,mask,minimumMeasuredDescriptors=-1,minimumWordDistanceSquared=-1);
    checks[15] := result.accepted and result.vocabularyReason == 0 and not result.publication.mappingAccepted
      and EqualVocabulary(result.next.vocabulary,pendingOwner.vocabulary)
      and result.next.estimator.localization.catalog.nextId == 1 and result.next.captures.lastStep == 2;
  end Learning;

  function Bootstrap
    input Real clock; output Boolean checks[3];
  protected
    RGBDLocalizationCatalog.State localization; RGBDGraphProcessing.State previous; RGBDGraphProcessing.State expected;
    RGBDLocalizationProcessing.Result first; RGBDLocalizationProcessing.Result result; RGBDLocalizationCatalog.Estimator proposed;
    RGBDKeyframes.Frame frame; RGBDKeyframes.Frame template; RGBDCatalogGraphCapture.Result visual;
    RGBDVisualVocabulary.State learned; Real learnMask[350]; Boolean learnedAccepted; Integer learnedReason;
    Real vocabulary[256,49]; Real enabled[256]; Real candidates[350,3]; Real mask[350]; Real local[3]; Real world[3]; Real h=1.0/90;
  algorithm
    template := RGBDLoopVerificationTests.Reference(false); localization := RGBDLocalizationCatalog.Empty(RGBDLocalizationCatalog.EmptyEstimator(),1,17,1,17);
    previous := RGBDGraphProcessing.Empty(localization); frame := Bind(template,localization.estimator,1,0,0); proposed := RGBDLocalizationCatalogTests.Captured(localization.estimator,frame);
    learnMask := zeros(350);
    for feature in 1:350 loop learnMask[feature] := if frame.enabled[feature] then 1.0 else 0.0; end for;
    (learned,learnedAccepted,learnedReason) := RGBDVisualVocabulary.Learn(previous.vocabulary,frame.descriptor,learnMask,350,1,17,1);
    assert(learnedAccepted and learned.ready,"Actual measured bootstrap must freeze before histogram storage");
    vocabulary := learned.words; enabled := learned.enabled; candidates := fill(1e101,350,3); mask := zeros(350);
    local := {frame.opticalPoint[350,3]+0.18,-frame.opticalPoint[350,1],-frame.opticalPoint[350,2]-0.04}; world := frame.bodyRotation*local+frame.bodyPosition; candidates[350,:] := world; mask[350] := 1;
    first := RGBDLocalizationProcessing.Publish(previous,proposed,frame,1,0,1,true,0,0,0,true,true,0,true,candidates,mask);
    visual := RGBDCatalogGraphCapture.Capture(localization.catalog,frame,vocabulary,enabled,localization.graph,true,trials=96);
    expected := previous; expected.vocabulary := learned; expected.estimator.localization.estimator := proposed; expected.estimator.localization.initialized := true; expected.estimator.localization.steps := 1;
    expected.estimator.localization.lastProcessedImageEpoch := 0; expected.estimator.localization.catalog := visual.catalog; expected.estimator.localization.graph := visual.graph;
    expected.estimator.localization.referenceBirth.epoch := 0; expected.estimator.localization.referenceBirth.sequence := 1; expected.estimator.localization.referenceBirth.catalogId := 1;
    expected.estimator.localization.map.catalogRevision := 1; expected.estimator.localization.map.frame := 1; expected.estimator.localization.map.imageEpoch := 0;
    expected.estimator.localization.map.point[1,:] := world; expected.estimator.localization.map.localPoint[1,:] := local; expected.estimator.localization.map.occupied[1] := 1;
    expected.estimator.localization.map.anchorId[1] := 1; expected.estimator.localization.map.anchorSlot[1] := 1; expected.estimator.localization.map.confidence[1] := 1; expected.estimator.localization.map.lastFrame[1] := 1;
    expected.estimator.poses.catalogNextId := 2; expected.estimator.poses.revision := 1; expected.estimator.poses.enabled[1] := true; expected.estimator.poses.ids[1] := 1;
    expected.estimator.poses.positions[1,:] := frame.bodyPosition; expected.estimator.poses.rotations[1,:,:] := frame.bodyRotation;
    expected.captures.catalogNextId := 2; expected.captures.lastStep := 1; expected.captures.ids[1] := 1; expected.captures.epochs[1] := 0; expected.captures.sequences[1] := 1;
    checks[1] := first.accepted and first.publication.mappingAccepted and Equal(first.next,expected);
    frame := Bind(template,proposed,2,0,h);
    result := RGBDLocalizationProcessing.Publish(first.next,proposed,frame,1,0,0,true,0,h,h,false,true,0,true,candidates,mask);
    checks[2] := result.reason == 3 and Held(result,first.next);
    proposed.lastUsedEpoch := 1; proposed.referenceUsed := 1; frame := Bind(template,proposed,2,1,h);
    result := RGBDLocalizationProcessing.Publish(first.next,proposed,frame,1,1,0,true,1,h,h,false,true,0,true,candidates,mask);
    expected.estimator.localization.estimator := proposed; expected.estimator.localization.steps := 2; expected.estimator.localization.predictionTime := h;
    expected.estimator.localization.lastProcessedImageEpoch := 1; expected.estimator.localization.lastProcessedImageTime := h;
    expected.estimator.localization.map.frame := 2; expected.estimator.localization.map.imageEpoch := 1; expected.estimator.localization.map.imageTime := h;
    expected.estimator.localization.map.confidence[1] := 2; expected.estimator.localization.map.lastSeen[1] := h; expected.estimator.localization.map.lastFrame[1] := 2; expected.captures.lastStep := 2;
    checks[3] := result.accepted and result.publication.mappingAccepted and not result.publication.decision.captureRequested and Equal(result.next,expected);
  end Bootstrap;
end RGBDLocalizationProcessingTests;
