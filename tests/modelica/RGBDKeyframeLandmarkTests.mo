package RGBDKeyframeLandmarkTests
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

  function EqualCatalog
    input RGBDKeyframes.Catalog first; input RGBDKeyframes.Catalog second;
    output Boolean equal;
  algorithm
    equal := first.generation == second.generation and first.vocabularyVersion == second.vocabularyVersion
      and first.nextId == second.nextId and first.nextSlot == second.nextSlot
      and first.lastEpoch == second.lastEpoch and first.lastTime == second.lastTime;
    for node in 1:RGBDKeyframes.keyframeCapacity loop
      equal := equal and first.occupied[node] == second.occupied[node]
        and EqualFrame(RGBDKeyframes.ReadSlot(first,node),RGBDKeyframes.ReadSlot(second,node));
    end for;
  end EqualCatalog;

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
      catalog.vocabularyVersions[node] := frame.vocabularyVersion; catalog.histograms[node,:] := frame.histogram;
      catalog.occupied[node] := true;
    end for;
  end FullCatalog;

  function Run
    input Integer slots; input Integer features; input Integer nodes;
    output Boolean passed[16]; output Integer slotsValidated;
  protected
    RGBDKeyframes.Catalog previousCatalog; RGBDKeyframes.Catalog fullCatalog;
    RGBDKeyframes.Catalog expectedCatalog; RGBDKeyframes.Catalog resultCatalog;
    RGBDKeyframes.Frame measurement;
    Real previous[slots,7]; Real local[slots,3]; Integer ids[slots]; Integer owners[slots];
    Real candidate[features,3]; Real mask[features]; Real bodyPosition[3]; Real worldPoint[3];
    Real point[slots,3]; Real occupied[slots]; Real confidence[slots]; Real seen[slots]; Real frame[slots]; Real confirmed[slots];
    Real actual[slots,8]; Real stats[13]; Real resultLocal[slots,3]; Integer resultIds[slots]; Integer resultOwners[slots];
    Integer resultGeneration; Integer resultRevision; Boolean captureAccepted; Integer storedSlot; Integer evictedId;
    Integer measurementReason; Integer catalogReason; Integer correctionReason;
    Real catalogUpdateReason; Real updateReason; Real mapReason; Integer anchorReason;
    Integer projected; Integer evicted; Integer assigned; Integer retained; Integer cleared;
    Integer previousGeneration; Integer generation; Integer previousRevision; Integer imageEpoch;
    Real previousTime; Real timeNow; Real previousFrame; Real frameNow; Real reset; Real worldFrame;
    Real count; Real poseAccepted; Boolean capture; Boolean requested; Boolean expectedAccepted;
    Real expectedReason; Integer expectedMeasurementReason; Integer expectedCatalogReason;
    Real expectedCatalogUpdateReason; Real expectedUpdateReason; Real expectedMapReason; Integer expectedAnchorReason;
    Boolean expectedCapture; Integer expectedStored; Integer expectedEvicted;
    Integer expectedRevision; Integer expectedProjected; Integer expectedEvictionCount;
    Integer expectedAssigned; Integer expectedRetained; Integer expectedCleared;
    Real expectedPoint[3]; Real expectedLocal[3]; Real expectedOccupied; Real expectedConfidence;
    Real expectedSeen; Real expectedFrame; Real expectedConfirmed; Integer expectedId; Integer expectedOwner;
    Real expectedOccupiedCount; Real expectedConfirmedCount; Boolean correct;
    Boolean referenceAccepted; Integer unusedSlot; Integer unusedEvicted;
  algorithm
    assert(slots == RGBDMapAnchors.mapCapacity and features == RGBDKeyframes.featureCapacity
      and nodes == RGBDKeyframes.keyframeCapacity,"Keyframe/map controls require full14400/350/128 domains");
    fullCatalog := FullCatalog();
    passed := fill(false,16); slotsValidated := 0;
    for scenario in 1:16 loop
      previousCatalog := RGBDKeyframes.Empty();
      previous := zeros(slots,7); local := zeros(slots,3); ids := fill(0,slots); owners := fill(0,slots);
      previousGeneration := 1; generation := 1; previousRevision := 0;
      previousTime := 0; timeNow := 1.0/90.0; previousFrame := 0; frameNow := 1;
      imageEpoch := 1; reset := 0; worldFrame := 0; poseAccepted := 1; capture := true; requested := true;
      measurement := RGBDKeyframeTests.Measurement(1,imageEpoch,timeNow);
      count := features; mask := zeros(features); mask[features] := 1; candidate := fill(1e101,features,3);
      expectedAccepted := true; expectedCapture := true; expectedStored := 1; expectedEvicted := 0;
      expectedReason := 0; expectedMeasurementReason := 0; expectedCatalogReason := 0;
      expectedCatalogUpdateReason := 0; expectedUpdateReason := 0; expectedMapReason := 0; expectedAnchorReason := 0;
      expectedRevision := 1; expectedProjected := 0; expectedEvictionCount := 0;
      if scenario == 3 or scenario == 4 or scenario == 5 or scenario == 10 or scenario == 11
          or scenario == 12 or scenario == 14 or scenario == 15 then
        previousCatalog := fullCatalog; previousRevision := nodes;
        previousTime := nodes; timeNow := nodes+1; previousFrame := nodes; frameNow := nodes+1;
        imageEpoch := nodes+1; measurement := RGBDKeyframeTests.Measurement(nodes+1,imageEpoch,timeNow);
        expectedEvicted := 1; expectedRevision := nodes+1;
      end if;
      // Closed-form RDF->FLU fixture with identity body rotation.
      bodyPosition := measurement.bodyPosition;
      worldPoint := {bodyPosition[1]+2.18,bodyPosition[2]-0.35,bodyPosition[3]-0.24};
      candidate[features,:] := worldPoint;
      if scenario == 3 or scenario == 4 or scenario == 5 or scenario == 11 or scenario == 14 then
        previous[slots,:] := {worldPoint[1],worldPoint[2],worldPoint[3],1,3,previousTime,previousFrame};
        local[slots,:] := worldPoint-fullCatalog.bodyPositions[1,:]; ids[slots] := 1; owners[slots] := 1;
        if scenario == 3 then expectedEvictionCount := 1;
        elseif scenario == 4 then
          local[slots,1] := local[slots,1]+1; expectedAccepted := false; expectedReason := 3;
          expectedCatalogUpdateReason := 2; expectedCatalogReason := 6;
        elseif scenario == 5 then
          poseAccepted := 0; expectedAccepted := false; expectedReason := 3;
          expectedCatalogUpdateReason := 3; expectedUpdateReason := 2; expectedMapReason := 1;
        end if;
      end if;
      if scenario == 2 then
        capture := false; expectedAccepted := false; expectedReason := 3;
        expectedCatalogUpdateReason := 3; expectedUpdateReason := 3; expectedAnchorReason := 5;
      elseif scenario == 6 then
        measurement.id := 2; expectedAccepted := false; expectedReason := 2; expectedMeasurementReason := 3;
      elseif scenario == 7 then
        imageEpoch := 2; expectedAccepted := false; expectedReason := 2; expectedMeasurementReason := 2;
      elseif scenario == 8 then
        candidate[features,1] := candidate[features,1]+0.01;
        expectedAccepted := false; expectedReason := 2; expectedMeasurementReason := 2;
      elseif scenario == 9 then
        measurement.cameraOriginBody[1] := measurement.cameraOriginBody[1]+0.01;
        expectedAccepted := false; expectedReason := 2; expectedMeasurementReason := 2;
      elseif scenario == 10 or scenario == 15 then
        reset := 1; generation := 2; expectedRevision := 0; expectedEvicted := 0;
        imageEpoch := 1; timeNow := 1.0/90.0; frameNow := 1; worldFrame := 2;
        measurement := RGBDKeyframeTests.Measurement(1,imageEpoch,timeNow);
        measurement.generation := 2; measurement.vocabularyVersion := 2;
        bodyPosition := measurement.bodyPosition;
        worldPoint := {bodyPosition[1]+2.18,bodyPosition[2]-0.35,bodyPosition[3]-0.24}; candidate[features,:] := worldPoint;
        previous := fill(1e101,slots,7); local := fill(1e101,slots,3); ids := fill(-1,slots); owners := fill(-1,slots);
        if scenario == 15 then
          poseAccepted := 0; expectedAccepted := false; expectedReason := 3;
          expectedCatalogUpdateReason := 3; expectedUpdateReason := 2; expectedMapReason := 1;
        end if;
      elseif scenario == 11 then
        capture := false; measurement.id := 0; measurement.count := 0; count := 0; mask := zeros(features);
        measurement.opticalPoint := fill(1e101,features,3);
        expectedCapture := false; expectedStored := 0; expectedEvicted := 0; expectedRevision := previousRevision;
      elseif scenario == 12 then
        requested := false; measurement.bodyRotation := fill(1e101,3,3); local[slots,:] := fill(1e101,3);
        expectedAccepted := false; expectedReason := 1;
      elseif scenario == 13 then
        generation := 2; expectedAccepted := false; expectedReason := 2; expectedMeasurementReason := 1;
      elseif scenario == 14 then
        capture := false; measurement.vocabularyVersion := 2;
        expectedAccepted := false; expectedReason := 2; expectedMeasurementReason := 2;
      elseif scenario == 16 then mask := zeros(features); end if;
      if not expectedAccepted then
        expectedCapture := false; expectedStored := 0; expectedEvicted := 0;
        expectedRevision := previousRevision; expectedProjected := 0; expectedEvictionCount := 0;
      end if;
      // Store/reset are already separately qualified. Here they supply the
      // expected accepted catalog; failures must hold every original field.
      expectedCatalog := previousCatalog;
      if expectedAccepted then
        if reset == 1 then (expectedCatalog,referenceAccepted) := RGBDKeyframes.Reset(previousCatalog,generation,measurement.vocabularyVersion); end if;
        if capture then
          (expectedCatalog,referenceAccepted,unusedSlot,unusedEvicted) := RGBDKeyframes.Store(expectedCatalog,measurement,true);
          assert(referenceAccepted,"Accepted fixture must admit the reference capture");
        end if;
      end if;
      (point,occupied,confidence,seen,frame,confirmed,
        stats[1],stats[2],stats[3],stats[4],stats[5],stats[6],stats[7],stats[8],stats[9],stats[10],stats[11],stats[12],stats[13],
        resultCatalog,resultLocal,resultIds,resultOwners,resultGeneration,resultRevision,captureAccepted,storedSlot,evictedId,
        measurementReason,catalogReason,correctionReason,catalogUpdateReason,updateReason,mapReason,anchorReason,
        projected,evicted,assigned,retained,cleared) := UpdateKeyframeLandmarks(
          previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,mask,count,bodyPosition,poseAccepted,
          previousTime,timeNow,previousFrame,frameNow,0,worldFrame,reset,1e6,0.25,0.15,80.0,0.5,5.0,3.0,8.0,700.0,
          previousCatalog,measurement,imageEpoch,generation,capture,requested,local,ids,owners,previousGeneration,previousRevision,1e-9);
      actual := [point,occupied,confidence,seen,frame,confirmed];
      correct := stats[1] == (if expectedAccepted then 1 else 0) and stats[2] == expectedReason
        and measurementReason == expectedMeasurementReason and catalogReason == expectedCatalogReason and correctionReason == 0
        and catalogUpdateReason == expectedCatalogUpdateReason and updateReason == expectedUpdateReason
        and mapReason == expectedMapReason and anchorReason == expectedAnchorReason
        and captureAccepted == expectedCapture and storedSlot == expectedStored and evictedId == expectedEvicted
        and resultRevision == expectedRevision and resultGeneration == (if expectedAccepted then generation else previousGeneration)
        and EqualCatalog(resultCatalog,expectedCatalog);
      expectedAssigned := 0; expectedRetained := 0; expectedCleared := 0; expectedOccupiedCount := 0; expectedConfirmedCount := 0;
      for slot in 1:slots loop
        slotsValidated := slotsValidated+1;
        expectedPoint := previous[slot,1:3]; expectedOccupied := previous[slot,4]; expectedConfidence := previous[slot,5];
        expectedSeen := previous[slot,6]; expectedFrame := previous[slot,7];
        expectedLocal := local[slot,:]; expectedId := ids[slot]; expectedOwner := owners[slot];
        if expectedAccepted and scenario <> 11 then
          expectedPoint := zeros(3); expectedOccupied := 0; expectedConfidence := 0; expectedSeen := 0; expectedFrame := 0;
          expectedLocal := zeros(3); expectedId := 0; expectedOwner := 0;
          if slot == 1 and scenario <> 16 then
            expectedPoint := worldPoint; expectedOccupied := 1; expectedConfidence := 1; expectedSeen := timeNow; expectedFrame := frameNow;
            expectedLocal := {2.18,-0.35,-0.24}; expectedId := measurement.id; expectedOwner := 1;
          end if;
        end if;
        expectedConfirmed := if expectedOccupied == 1 and expectedConfidence >= 3 then 1 else 0;
        for axis in 1:3 loop
          correct := correct and abs(point[slot,axis]-expectedPoint[axis]) <= 1e-12
            and abs(resultLocal[slot,axis]-expectedLocal[axis]) <= 1e-12;
        end for;
        correct := correct and occupied[slot] == expectedOccupied and confidence[slot] == expectedConfidence
          and seen[slot] == expectedSeen and frame[slot] == expectedFrame and confirmed[slot] == expectedConfirmed
          and resultIds[slot] == expectedId and resultOwners[slot] == expectedOwner;
        expectedOccupiedCount := expectedOccupiedCount+(if expectedOccupied == 1 then 1 else 0);
        expectedConfirmedCount := expectedConfirmedCount+expectedConfirmed;
        if expectedAccepted then
          if expectedOccupied == 0 then expectedCleared := expectedCleared+1;
          elseif scenario == 11 then expectedRetained := expectedRetained+1;
          else expectedAssigned := expectedAssigned+1; end if;
        end if;
      end for;
      correct := correct and stats[3] == (if expectedAccepted then timeNow else previousTime)
        and stats[4] == (if expectedAccepted then frameNow else previousFrame)
        and stats[5] == (if expectedAccepted then worldFrame else 0)
        and stats[6] == expectedOccupiedCount and stats[7] == expectedConfirmedCount
        and stats[8] == expectedOccupiedCount-expectedConfirmedCount
        and stats[9] == expectedAssigned and stats[10] == 0 and stats[11] == expectedEvictionCount and stats[12] == 0 and stats[13] == 0;
      passed[scenario] := correct and assigned == expectedAssigned and retained == expectedRetained and cleared == expectedCleared
        and projected == expectedProjected and evicted == expectedEvictionCount;
    end for;
  end Run;
end RGBDKeyframeLandmarkTests;
