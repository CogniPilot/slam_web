package RGBDCatalogLoopTests
  function Vocabulary
    input RGBDKeyframes.Frame frame;
    output Real words[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    output Real enabled[RGBDKeyframes.wordCapacity];
  protected
    Integer feature;
  algorithm
    words := zeros(RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize);
    enabled := zeros(RGBDKeyframes.wordCapacity);
    for word in 1:RGBDKeyframes.wordCapacity loop
      feature := if word < RGBDKeyframes.wordCapacity then word else RGBDKeyframes.featureCapacity;
      if frame.enabled[feature] then words[word,:] := frame.descriptor[feature,:]; enabled[word] := 1; end if;
    end for;
  end Vocabulary;

  function FullCatalog
    input Boolean dense;
    output RGBDKeyframes.Catalog catalog;
  protected
    RGBDKeyframes.Frame frame; Boolean accepted; Integer reason;
    Real words[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize]; Real enabled[RGBDKeyframes.wordCapacity];
    Real index[RGBDKeyframes.featureCapacity]; Integer ids[4]; Integer slots[4]; Real scores[4];
    Integer count; Real assignments;
  algorithm
    frame := RGBDLoopVerificationTests.Reference(dense);
    (words,enabled) := Vocabulary(frame);
    catalog := RGBDKeyframes.Empty();
    (frame,accepted,reason,index,ids,slots,scores,count,assignments) := RGBDKeyframeRetrieval.PrepareCapture(
      catalog,frame,words,enabled,true,maximumWordDistanceSquared=if dense then 4.0 else 0.8);
    assert(accepted and assignments == (if dense then RGBDKeyframes.featureCapacity else 32),
      "Full catalog fixture must retain a histogram for every measured descriptor");
    catalog.nextId := RGBDKeyframes.keyframeCapacity+1;
    catalog.nextSlot := 1; catalog.lastEpoch := RGBDKeyframes.keyframeCapacity;
    catalog.lastTime := RGBDKeyframes.keyframeCapacity;
    for node in 1:RGBDKeyframes.keyframeCapacity loop
      frame.id := node; frame.epoch := node; frame.imageTime := node;
      catalog.generations[node] := frame.generation; catalog.ids[node] := frame.id;
      catalog.epochs[node] := frame.epoch; catalog.imageTimes[node] := frame.imageTime;
      catalog.counts[node] := frame.count; catalog.featureEnabled[node,:] := frame.enabled;
      catalog.descriptors[node,:,:] := frame.descriptor; catalog.opticalPoints[node,:,:] := frame.opticalPoint;
      catalog.pixelCoordinates[node,:,:] := frame.pixels; catalog.rgbSizes[node,:] := frame.rgbSize;
      catalog.depthSizes[node,:] := frame.depthSize; catalog.rgbCalibrations[node,:] := frame.rgbCalibration;
      catalog.depthCalibrations[node,:] := frame.depthCalibration;
      catalog.opticalToBodyRotations[node,:,:] := frame.opticalToBody; catalog.cameraOriginsBody[node,:] := frame.cameraOriginBody;
      catalog.disparityNoises[node] := frame.disparityNoise; catalog.noiseReferenceFocals[node] := frame.noiseReferenceFx;
      catalog.baselines[node] := frame.baseline; catalog.bodyRotations[node,:,:] := frame.bodyRotation;
      catalog.bodyPositions[node,:] := frame.bodyPosition; catalog.poseCovariances[node,:,:] := frame.poseCovariance;
      catalog.vocabularyVersions[node] := frame.vocabularyVersion; catalog.histograms[node,:] := frame.histogram;
      catalog.occupied[node] := true;
    end for;
  end FullCatalog;

  function Run
    input Integer trials;
    output Boolean passed[10];
  protected
    RGBDKeyframes.Catalog sparseCatalog; RGBDKeyframes.Catalog denseCatalog; RGBDKeyframes.Catalog catalog;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current; RGBDKeyframes.Frame prepared; RGBDKeyframes.Frame expected;
    Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize]; Real enabled[RGBDKeyframes.wordCapacity];
    Real words[RGBDKeyframes.featureCapacity]; Integer ids[4]; Integer slots[4]; Real scores[4];
    RGBDLoopVerification.Proposal proposals[4]; RGBDCatalogLoopVerification.Batch batch;
    Boolean accepted; Integer reason; Integer count; Real assignments; Integer verified;
    Integer seeds[4]; Integer nextSeeds[4]; Integer expectedSeed;
    Real C[3,3]; Real t[3]; Real expectedHistogram[RGBDKeyframes.wordCapacity];
    Boolean requested; Boolean expectedAccepted; Integer expectedReason; Integer expectedCount;
    Integer expectedVerified; Integer expectedProposalReason; Boolean correct; Boolean expectedVerification;
  algorithm
    assert(trials == 96,"The full catalog loop gate retains the original 96 hypotheses");
    sparseCatalog := FullCatalog(false); denseCatalog := FullCatalog(true);
    C := PGExp({0.03,-0.04,0.12}); t := {0.3,-0.2,0.1}; passed := fill(false,10);
    for scenario in 1:10 loop
      catalog := if scenario == 10 then denseCatalog else sparseCatalog;
      reference := RGBDLoopVerificationTests.Reference(scenario == 10);
      (vocabulary,enabled) := Vocabulary(reference);
      current := RGBDLoopVerificationTests.Current(reference,C,t,if scenario == 2 then 20 else 0,scenario == 10);
      current.id := RGBDKeyframes.keyframeCapacity+1; current.imageTime := 140;
      expectedHistogram := catalog.histograms[1,:];
      requested := true; expectedAccepted := true; expectedReason := 0; expectedCount := 4;
      expectedVerified := 4; expectedProposalReason := 0; seeds := fill(7,4);
      if scenario == 2 then expectedVerified := 0; expectedProposalReason := 7;
      elseif scenario == 3 then
        catalog.histograms := zeros(RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity);
        catalog.histograms[:,1] := fill(1.0,RGBDKeyframes.keyframeCapacity);
        catalog.histograms[RGBDKeyframes.keyframeCapacity,:] := expectedHistogram;
        expectedCount := 1; expectedVerified := 1;
      elseif scenario == 4 then
        catalog.histograms[RGBDKeyframes.keyframeCapacity,1] := 1e101;
        expectedAccepted := false; expectedReason := 3; expectedCount := 0; expectedVerified := 0;
      elseif scenario == 5 then
        requested := false; catalog.nextSlot := -1; current.bodyRotation := fill(1e101,3,3);
        expectedAccepted := false; expectedReason := 1; expectedCount := 0; expectedVerified := 0;
      elseif scenario == 6 then
        current.generation := 2; expectedAccepted := false; expectedReason := 2; expectedCount := 0; expectedVerified := 0;
      elseif scenario == 7 then
        current.disparityNoise := 2*current.disparityNoise; expectedVerified := 0; expectedProposalReason := 5;
      elseif scenario == 8 then
        catalog.opticalPoints[:,RGBDKeyframes.featureCapacity,3] := fill(-1.0,RGBDKeyframes.keyframeCapacity);
        expectedVerified := 0; expectedProposalReason := 4;
      elseif scenario == 9 then seeds := {7,17,37,97};
      end if;
      batch := RGBDCatalogLoopVerification.ProposeCapture(catalog,current,vocabulary,enabled,requested,seeds,
          maximumWordDistanceSquared=if scenario == 10 then 4.0 else 0.8,trials=trials,
          minimumFraction=if scenario == 2 then 0.75 else 0.5);
      prepared := batch.prepared; accepted := batch.retrievalAccepted; reason := batch.retrievalRejectionReason;
      words := batch.wordIndex; ids := batch.candidateId; slots := batch.candidateSlot; scores := batch.candidateScore;
      count := batch.candidateCount; assignments := batch.assignmentCount; proposals := batch.proposals;
      verified := batch.verifiedCount; nextSeeds := batch.nextSeeds;
      expected := current; if expectedAccepted then expected.histogram := expectedHistogram; end if;
      correct := accepted == expectedAccepted and reason == expectedReason and count == expectedCount
        and verified == expectedVerified and RGBDKeyframeRetrievalTests.EqualFrame(prepared,expected)
        and assignments == (if not expectedAccepted then 0 else if scenario == 10 then RGBDKeyframes.featureCapacity else 32);
      for feature in 1:RGBDKeyframes.featureCapacity loop
        if not expectedAccepted then correct := correct and words[feature] == 0;
        elseif scenario == 10 then
          correct := correct and words[feature] >= 1 and words[feature] <= RGBDKeyframes.wordCapacity;
        else
          correct := correct and words[feature] == (if feature <= 31 then 32-feature
            else if feature == RGBDKeyframes.featureCapacity-5 then RGBDKeyframes.wordCapacity else 0);
        end if;
      end for;
      if scenario == 10 then correct := correct and words[1] == RGBDKeyframes.wordCapacity and words[RGBDKeyframes.featureCapacity] == 1; end if;
      for rank in 1:RGBDKeyframeRetrieval.proposalCapacity loop
        expectedVerification := expectedVerified > 0 and rank <= expectedCount;
        correct := correct and proposals[rank].verified == expectedVerification;
        if rank <= expectedCount then
          correct := correct and ids[rank] == (if scenario == 3 then RGBDKeyframes.keyframeCapacity else rank+1)
            and slots[rank] == ids[rank] and abs(scores[rank]-1.0) < 1e-12
            and proposals[rank].rejectionReason == expectedProposalReason;
        else
          correct := correct and ids[rank] == 0 and slots[rank] == 0 and scores[rank] == 0
            and proposals[rank].rejectionReason == 1;
        end if;
        expectedSeed := seeds[rank];
        if rank <= expectedCount and (expectedVerification or scenario == 2) then
          // Independent exact-double recurrence; production uses Schrage's
          // bounded Integer decomposition rather than this large product.
          for advance in 1:3*trials loop expectedSeed := integer(mod(16807.0*expectedSeed,2147483647.0)); end for;
        end if;
        correct := correct and nextSeeds[rank] == expectedSeed and proposals[rank].nextSeed == expectedSeed;
        if expectedVerification then
          correct := correct and proposals[rank].referenceId == ids[rank] and proposals[rank].currentId == current.id
            and proposals[rank].generation == current.generation and proposals[rank].referenceEpoch == ids[rank]
            and proposals[rank].currentEpoch == current.epoch
            and proposals[rank].matchedCount == (if scenario == 10 then RGBDKeyframes.featureCapacity else 32)
            and proposals[rank].inlierCount == proposals[rank].matchedCount
            and max(abs(proposals[rank].opticalRotation-C)) < 1e-9
            and max(abs(proposals[rank].opticalTranslation-t)) < 1e-9
            and max(abs(proposals[rank].covariance*proposals[rank].information-identity(6))) < 1e-8;
          for feature in 1:RGBDKeyframes.featureCapacity loop
            correct := correct and proposals[rank].inliers[feature] == reference.enabled[feature]
              and proposals[rank].partners[feature] == (if not reference.enabled[feature] then 0
                else if scenario == 10 then RGBDKeyframes.featureCapacity+1-feature
                else if feature <= 31 then 32-feature else RGBDKeyframes.featureCapacity-5);
          end for;
          correct := correct and max(abs(reference.cameraOriginBody+reference.opticalToBody*reference.opticalPoint[RGBDKeyframes.featureCapacity,:]
            -(proposals[rank].bodyTranslation+proposals[rank].bodyRotation*(current.cameraOriginBody
              +current.opticalToBody*current.opticalPoint[if scenario == 10 then 1 else RGBDKeyframes.featureCapacity-5,:])))) < 1e-9;
        else
          correct := correct and proposals[rank].inlierCount == 0 and proposals[rank].generation == 0
            and proposals[rank].referenceId == 0 and proposals[rank].currentId == 0
            and max(abs(proposals[rank].covariance)) == 0 and max(abs(proposals[rank].information)) == 0;
          for feature in 1:RGBDKeyframes.featureCapacity loop
            correct := correct and not proposals[rank].inliers[feature] and proposals[rank].partners[feature] == 0;
          end for;
        end if;
      end for;
      passed[scenario] := correct;
    end for;
  end Run;
end RGBDCatalogLoopTests;
