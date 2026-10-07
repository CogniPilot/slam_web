package RGBDAnchoredLandmarkMapTests
  function Run
    input Integer slots; input Integer features; input Integer nodes;
    output Boolean passed[20]; output Integer slotsValidated;
  protected
    Real previous[slots,7]; Real local[slots,3]; Integer ids[slots]; Integer owners[slots];
    Real candidate[features,3]; Real mask[features];
    Boolean enabled[nodes]; Integer nodeIds[nodes]; Real positions[nodes,3]; Real rotations[nodes,3,3];
    Real point[slots,3]; Real occupied[slots]; Real confidence[slots]; Real seen[slots];
    Real frame[slots]; Real confirmed[slots]; Real actual[slots,8]; Real stats[13];
    Real referencePoint[slots,3]; Real referenceOccupied[slots]; Real referenceConfidence[slots];
    Real referenceSeen[slots]; Real referenceFrame[slots]; Real referenceConfirmed[slots];
    Real reference[slots,8]; Real referenceStats[13];
    Real resultLocal[slots,3]; Integer resultIds[slots]; Integer resultOwners[slots]; Integer resultGeneration;
    Real expectedLocal[3]; Integer expectedId; Integer expectedOwner; Real expectedConfirmed;
    Integer assigned; Integer retained; Integer cleared; Integer expectedAssigned; Integer expectedRetained;
    Integer expectedCleared; Real occupiedCount; Real confirmedCount;
    Real mapReason; Integer anchorReason; Integer generation; Integer catalogGeneration; Integer previousGeneration;
    Integer selectedId; Integer selectedSlot; Boolean requested; Boolean expectedAccepted;
    Real reset; Real poseAccepted; Real previousTime; Real timeNow; Real previousFrame; Real frameNow;
    Real previousWorld; Real world; Real expectedReason; Real expectedMapReason; Integer expectedAnchorReason;
    Boolean correct; Boolean insertion;
  algorithm
    assert(slots == RGBDMapAnchors.mapCapacity and features == 350 and nodes == RGBDMapAnchors.keyframeCapacity,
      "Joint map/anchor acceptance requires the complete 14400/350/128 domains");
    passed := fill(false,20); slotsValidated := 0;
    for scenario in 1:20 loop
      previous := zeros(slots,7); local := zeros(slots,3); ids := fill(0,slots); owners := fill(0,slots);
      enabled := fill(true,nodes); positions := zeros(nodes,3); rotations := zeros(nodes,3,3);
      for node in 1:nodes loop nodeIds[node] := 1000+node; rotations[node,:,:] := identity(3); end for;
      rotations[1,:,:] := [0,-1,0;1,0,0;0,0,1]; positions[1,:] := {2,3,4};
      rotations[nodes,:,:] := [1,0,0;0,0,-1;0,1,0]; positions[nodes,:] := {-3,1,2};
      mask := ones(features);
      for feature in 1:features loop
        candidate[feature,:] := {(mod(feature-1,25)-12)*0.6,(div(feature-1,25)-7)*0.6,2};
      end for;
      previousTime := 0; timeNow := 1.0/90.0; previousFrame := 0; frameNow := 1;
      previousWorld := 0; world := 0; reset := 0; poseAccepted := 1;
      previousGeneration := 1; generation := 1; catalogGeneration := 1;
      selectedSlot := nodes; selectedId := nodeIds[nodes]; requested := true;
      expectedAccepted := true; expectedReason := 0; expectedMapReason := 0; expectedAnchorReason := 0;
      if scenario == 2 or scenario == 12 or scenario == 13 or scenario == 14 or scenario == 20 then
        for slot in 1:features loop
          previous[slot,:] := {candidate[slot,1],candidate[slot,2],candidate[slot,3],1,1,0,1};
        end for;
        previousFrame := 1; frameNow := 2;
      elseif scenario == 3 then
        previous[1,:] := {20,20,2,1,1,0,1}; previousFrame := 1; frameNow := 2;
        previousTime := 0.6; timeNow := 0.7;
        mask := zeros(features); mask[features] := 1; candidate[features,:] := {20,20,2};
      elseif scenario == 4 or scenario == 5 then
        for slot in 1:slots loop previous[slot,:] := {0,0,2,1,3,0,1}; end for;
        previousFrame := 1; frameNow := 2;
        mask := zeros(features); mask[features] := 1; candidate[features,:] := {20,20,2};
        if scenario == 4 then previous[slots,:] := zeros(7);
        else mask[1] := 1; candidate[1,:] := {0,0,2}; end if;
      end if;
      for slot in 1:slots loop
        if previous[slot,4] == 1 then
          local[slot,:] := {previous[slot,2]-3,2-previous[slot,1],previous[slot,3]-4};
          ids[slot] := nodeIds[1]; owners[slot] := 1;
        end if;
      end for;
      if scenario == 5 then
        local[slots,1] := local[slots,1]+1; expectedAccepted := false;
        expectedReason := 3; expectedAnchorReason := 5;
      elseif scenario == 6 then
        rotations[nodes,:,:] := [1,0,0;0,1,0;0,0,-1]; expectedAccepted := false;
        expectedReason := 3; expectedAnchorReason := 4;
      elseif scenario == 7 then
        poseAccepted := 0; expectedAccepted := false; expectedReason := 2; expectedMapReason := 1;
      elseif scenario == 8 then
        previous[slots,4] := 0.5; expectedAccepted := false; expectedReason := 2; expectedMapReason := 2;
      elseif scenario == 9 then
        requested := false; candidate := fill(1e101,features,3); rotations[nodes,:,:] := fill(1e101,3,3);
        local[slots,:] := fill(1e101,3); expectedAccepted := false; expectedReason := 1;
      elseif scenario == 10 or scenario == 11 then
        previous := fill(1e101,slots,7); local := fill(1e101,slots,3); ids := fill(-1,slots); owners := fill(-1,slots);
        previousTime := 0.2; previousFrame := 5; reset := 1; generation := 2; catalogGeneration := 2; world := 2;
        mask := zeros(features); mask[features] := 1; candidate[features,:] := {20,20,2};
        if scenario == 11 then catalogGeneration := 1; expectedAccepted := false; expectedReason := 3; expectedAnchorReason := 2; end if;
      elseif scenario == 12 then
        mask := zeros(features); selectedId := 0; selectedSlot := 0;
      elseif scenario == 13 then
        mask := zeros(features); previousTime := 0.6; timeNow := 0.7;
      elseif scenario == 14 then
        nodeIds[1] := 2000; expectedAccepted := false; expectedReason := 3; expectedAnchorReason := 5;
      elseif scenario == 15 then
        candidate := zeros(features,3); candidate[:,3] := fill(2.0,features);
      elseif scenario == 16 then
        selectedId := selectedId+1; expectedAccepted := false; expectedReason := 3; expectedAnchorReason := 5;
      elseif scenario == 17 then
        timeNow := previousTime; expectedAccepted := false; expectedReason := 2; expectedMapReason := 1;
      elseif scenario == 18 then
        catalogGeneration := 2; expectedAccepted := false; expectedReason := 3; expectedAnchorReason := 2;
      elseif scenario == 19 then
        mask := zeros(features); mask[features] := 1; candidate[features,:] := {20,20,2};
      elseif scenario == 20 then
        mask := zeros(features); selectedId := 0; selectedSlot := 0;
        enabled[nodes] := false; rotations[nodes,:,:] := fill(1e101,3,3); positions[nodes,:] := fill(1e101,3);
      end if;
      (point,occupied,confidence,seen,frame,confirmed,
        stats[1],stats[2],stats[3],stats[4],stats[5],stats[6],stats[7],stats[8],stats[9],stats[10],stats[11],stats[12],stats[13],
        resultLocal,resultIds,resultOwners,resultGeneration,mapReason,anchorReason,assigned,retained,cleared) :=
        UpdateAnchoredLandmarkMap(previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,mask,
          features,zeros(3),poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorld,world,reset,
          1e6,0.25,0.15,80.0,0.5,5.0,3.0,8.0,700.0,local,ids,owners,previousGeneration,
          enabled,nodeIds,positions,rotations,catalogGeneration,generation,selectedId,selectedSlot,requested,1e-9);
      actual := [point,occupied,confidence,seen,frame,confirmed];
      // Frozen pre-index map supplies an independent numerical oracle for
      // every accepted map output. It does not call the production kernel.
      (referencePoint,referenceOccupied,referenceConfidence,referenceSeen,referenceFrame,referenceConfirmed,
        referenceStats[1],referenceStats[2],referenceStats[3],referenceStats[4],referenceStats[5],referenceStats[6],referenceStats[7],
        referenceStats[8],referenceStats[9],referenceStats[10],referenceStats[11],referenceStats[12],referenceStats[13]) :=
        ReferenceUpdateLandmarkMap(previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,mask,
          features,zeros(3),poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorld,world,reset,
          1e6,0.25,0.15,80.0,0.5,5.0,3.0,8.0,700.0);
      reference := [referencePoint,referenceOccupied,referenceConfidence,referenceSeen,referenceFrame,referenceConfirmed];
      correct := stats[1] == (if expectedAccepted then 1 else 0) and stats[2] == expectedReason
        and mapReason == expectedMapReason and anchorReason == expectedAnchorReason
        and resultGeneration == (if expectedAccepted then generation else previousGeneration);
      expectedAssigned := 0; expectedRetained := 0; expectedCleared := 0; occupiedCount := 0; confirmedCount := 0;
      for slot in 1:slots loop
        slotsValidated := slotsValidated+1;
        expectedLocal := local[slot,:]; expectedId := ids[slot]; expectedOwner := owners[slot];
        expectedConfirmed := if previous[slot,4] == 1 and previous[slot,5] >= 3 then 1 else 0;
        if expectedAccepted then
          for field in 1:8 loop correct := correct and abs(actual[slot,field]-reference[slot,field]) <= 2e-11; end for;
          insertion := (scenario == 1 and slot <= features) or (scenario == 3 and slot == 1)
            or (scenario == 4 and slot == slots) or ((scenario == 10 or scenario == 15 or scenario == 19) and slot == 1);
          if reference[slot,4] == 0 then
            expectedLocal := zeros(3); expectedId := 0; expectedOwner := 0; expectedCleared := expectedCleared+1;
          elseif insertion then
            expectedLocal := {reference[slot,1]+3,reference[slot,3]-2,1-reference[slot,2]};
            expectedId := selectedId; expectedOwner := selectedSlot; expectedAssigned := expectedAssigned+1;
          else expectedRetained := expectedRetained+1; end if;
        else
          for field in 1:7 loop correct := correct and actual[slot,field] == previous[slot,field]; end for;
          correct := correct and actual[slot,8] == expectedConfirmed;
          occupiedCount := occupiedCount+(if previous[slot,4] == 1 then 1 else 0);
          confirmedCount := confirmedCount+expectedConfirmed;
        end if;
        for axis in 1:3 loop correct := correct and abs(resultLocal[slot,axis]-expectedLocal[axis]) <= 1e-12; end for;
        correct := correct and resultIds[slot] == expectedId and resultOwners[slot] == expectedOwner;
      end for;
      if expectedAccepted then
        for field in 3:13 loop correct := correct and abs(stats[field]-referenceStats[field]) <= 2e-11; end for;
        correct := correct and referenceStats[1] == 1;
      else
        correct := correct and stats[3] == previousTime and stats[4] == previousFrame and stats[5] == previousWorld
          and stats[6] == occupiedCount and stats[7] == confirmedCount and stats[8] == occupiedCount-confirmedCount;
        for field in 9:13 loop correct := correct and stats[field] == 0; end for;
      end if;
      passed[scenario] := correct and assigned == expectedAssigned and retained == expectedRetained and cleared == expectedCleared;
    end for;
  end Run;
end RGBDAnchoredLandmarkMapTests;
