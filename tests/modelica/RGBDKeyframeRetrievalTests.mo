package RGBDKeyframeRetrievalTests
  function EqualFrame
    input RGBDKeyframes.Frame first; input RGBDKeyframes.Frame second;
    output Boolean equal;
  algorithm
    equal := first.generation == second.generation and first.id == second.id and first.epoch == second.epoch
      and first.imageTime == second.imageTime and first.count == second.count
      and first.disparityNoise == second.disparityNoise and first.noiseReferenceFx == second.noiseReferenceFx
      and first.baseline == second.baseline and first.vocabularyVersion == second.vocabularyVersion;
    for axis in 1:3 loop
      equal := equal and first.cameraOriginBody[axis] == second.cameraOriginBody[axis]
        and first.bodyPosition[axis] == second.bodyPosition[axis];
      for column in 1:3 loop
        equal := equal and first.opticalToBody[axis,column] == second.opticalToBody[axis,column]
          and first.bodyRotation[axis,column] == second.bodyRotation[axis,column];
      end for;
    end for;
    for axis in 1:2 loop equal := equal and first.rgbSize[axis] == second.rgbSize[axis] and first.depthSize[axis] == second.depthSize[axis]; end for;
    for axis in 1:4 loop equal := equal and first.rgbCalibration[axis] == second.rgbCalibration[axis] and first.depthCalibration[axis] == second.depthCalibration[axis]; end for;
    for row in 1:6 loop
      for column in 1:6 loop equal := equal and first.poseCovariance[row,column] == second.poseCovariance[row,column]; end for;
    end for;
    for feature in 1:RGBDKeyframes.featureCapacity loop
      equal := equal and first.enabled[feature] == second.enabled[feature];
      for sample in 1:RGBDKeyframes.descriptorSize loop equal := equal and first.descriptor[feature,sample] == second.descriptor[feature,sample]; end for;
      for axis in 1:3 loop equal := equal and first.opticalPoint[feature,axis] == second.opticalPoint[feature,axis]; end for;
      for axis in 1:2 loop equal := equal and first.pixels[feature,axis] == second.pixels[feature,axis]; end for;
    end for;
    for word in 1:RGBDKeyframes.wordCapacity loop equal := equal and first.histogram[word] == second.histogram[word]; end for;
  end EqualFrame;

  function FullCatalog
    output RGBDKeyframes.Catalog catalog;
  protected
    RGBDKeyframes.Frame frame;
  algorithm
    catalog := RGBDKeyframes.Empty();
    catalog.nextId := RGBDKeyframes.keyframeCapacity+1;
    catalog.nextSlot := 1; catalog.lastEpoch := RGBDKeyframes.keyframeCapacity;
    catalog.lastTime := RGBDKeyframes.keyframeCapacity;
    for node in 1:RGBDKeyframes.keyframeCapacity loop
      frame := RGBDKeyframeTests.Measurement(node,node,node);
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
      catalog.vocabularyVersions[node] := frame.vocabularyVersion;
      catalog.histograms[node,:] := zeros(RGBDKeyframes.wordCapacity);
      catalog.histograms[node,RGBDKeyframes.wordCapacity] := 1;
      catalog.occupied[node] := true;
    end for;
  end FullCatalog;

  function Run
    input Integer initialGeneration = 1;
    output Boolean passed[20];
  protected
    RGBDKeyframes.Catalog fullCatalog; RGBDKeyframes.Catalog catalog;
    RGBDKeyframes.Frame measurement; RGBDKeyframes.Frame prepared; RGBDKeyframes.Frame expected;
    Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    Real enabled[RGBDKeyframes.wordCapacity]; Real words[RGBDKeyframes.featureCapacity];
    Integer ids[RGBDKeyframeRetrieval.proposalCapacity]; Integer slots[RGBDKeyframeRetrieval.proposalCapacity];
    Real scores[RGBDKeyframeRetrieval.proposalCapacity];
    Boolean accepted; Integer reason; Integer count; Real assignments;
    Boolean expectedAccepted; Integer expectedReason; Integer expectedCount;
    Real age; Real distance; Integer minimumAssignments; Boolean requested; Boolean correct;
  algorithm
    assert(initialGeneration == 1,"Controls use the complete original catalog dimensions");
    fullCatalog := FullCatalog(); passed := fill(false,20);
    for scenario in 1:20 loop
      catalog := fullCatalog;
      measurement := RGBDKeyframeTests.Measurement(RGBDKeyframes.keyframeCapacity+1,
        RGBDKeyframes.keyframeCapacity+1,RGBDKeyframes.keyframeCapacity+1);
      vocabulary := zeros(RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize);
      enabled := zeros(RGBDKeyframes.wordCapacity);
      vocabulary[RGBDKeyframes.wordCapacity,1] := 1/sqrt(2.0);
      vocabulary[RGBDKeyframes.wordCapacity,2] := -1/sqrt(2.0);
      enabled[RGBDKeyframes.wordCapacity] := 1;
      age := 0; distance := 0.8; minimumAssignments := 8; requested := true;
      expectedAccepted := true; expectedReason := 0; expectedCount := RGBDKeyframeRetrieval.proposalCapacity;
      if scenario == 1 or scenario == 14 or scenario == 17 then
        catalog := RGBDKeyframes.Empty(); measurement := RGBDKeyframeTests.Measurement(1,1,0);
        expectedCount := 0;
      elseif scenario == 3 or scenario == 4 then
        catalog.histograms := zeros(RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity);
        catalog.histograms[:,1] := fill(1.0,RGBDKeyframes.keyframeCapacity);
        catalog.histograms[RGBDKeyframes.keyframeCapacity,1] := 0;
        catalog.histograms[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity] := 1;
        expectedCount := if scenario == 3 then 1 else 0;
        age := if scenario == 3 then 1 else 2;
      elseif scenario == 5 then measurement.generation := 2; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 6 then measurement.vocabularyVersion := 2; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 7 then measurement.id := measurement.id+1; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 8 then measurement.epoch := catalog.lastEpoch; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 9 then measurement.imageTime := catalog.lastTime; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 10 then catalog.histograms[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity] := 1e101; expectedAccepted := false; expectedReason := 3;
      elseif scenario == 11 then measurement.opticalPoint[RGBDKeyframes.featureCapacity,3] := -1; expectedAccepted := false; expectedReason := 4;
      elseif scenario == 12 then distance := 5; expectedAccepted := false; expectedReason := 3;
      elseif scenario == 13 then requested := false; catalog.nextSlot := -1; measurement.bodyRotation := fill(1e101,3,3); expectedAccepted := false; expectedReason := 1;
      elseif scenario == 15 then enabled := zeros(RGBDKeyframes.wordCapacity); expectedAccepted := false; expectedReason := 3;
      elseif scenario == 16 then minimumAssignments := 9; expectedAccepted := false; expectedReason := 3;
      elseif scenario == 18 then measurement.count := RGBDKeyframes.featureCapacity-1; minimumAssignments := 7; expectedAccepted := false; expectedReason := 4;
      elseif scenario == 19 then measurement.descriptor[RGBDKeyframes.featureCapacity,1] := 1; expectedAccepted := false; expectedReason := 4;
      elseif scenario == 20 then catalog.nextSlot := 0; expectedAccepted := false; expectedReason := 2;
      end if;
      if scenario == 14 then
        // Disabled storage must not invent documents or reject valid capture.
        catalog.histograms := fill(1e101,RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity);
      elseif scenario == 17 then
        catalog := RGBDKeyframes.Empty(2,2); measurement.generation := 2; measurement.vocabularyVersion := 2;
      end if;
      (prepared,accepted,reason,words,ids,slots,scores,count,assignments) := RGBDKeyframeRetrieval.PrepareCapture(
        catalog,measurement,vocabulary,enabled,requested,distance,minimumAssignments,0.35,age);
      expected := measurement;
      if expectedAccepted then
        expected.histogram := zeros(RGBDKeyframes.wordCapacity); expected.histogram[RGBDKeyframes.wordCapacity] := 1;
      end if;
      correct := accepted == expectedAccepted and reason == expectedReason
        and RGBDKeyframeRetrievalTests.EqualFrame(prepared,expected)
        and count == (if expectedAccepted then expectedCount else 0)
        and assignments == (if expectedAccepted then 8 else 0);
      for feature in 1:RGBDKeyframes.featureCapacity loop
        correct := correct and words[feature] == (if expectedAccepted and (feature <= 7 or feature == RGBDKeyframes.featureCapacity)
          then RGBDKeyframes.wordCapacity else 0);
      end for;
      for rank in 1:RGBDKeyframeRetrieval.proposalCapacity loop
        if expectedAccepted and rank <= expectedCount then
          correct := correct and ids[rank] == (if scenario == 3 then RGBDKeyframes.keyframeCapacity else rank+1)
            and slots[rank] == ids[rank] and abs(scores[rank]-1.0) <= 1e-12;
        else correct := correct and ids[rank] == 0 and slots[rank] == 0 and scores[rank] == 0; end if;
      end for;
      passed[scenario] := correct;
    end for;
  end Run;
end RGBDKeyframeRetrievalTests;
