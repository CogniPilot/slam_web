package RGBDLandmarkCatalogTests
  function Run
    input Integer slots; input Integer features; input Integer nodes;
    output Boolean passed[28]; output Integer slotsValidated;
  protected
    Real previous[slots,7]; Real local[slots,3]; Integer ids[slots]; Integer owners[slots];
    Real candidate[features,3]; Real mask[features];
    Boolean oldEnabled[nodes]; Integer oldIds[nodes]; Real oldPosition[nodes,3]; Real oldRotation[nodes,3,3];
    Boolean enabled[nodes]; Integer nodeIds[nodes]; Real positions[nodes,3]; Real rotations[nodes,3,3];
    Real point[slots,3]; Real occupied[slots]; Real confidence[slots]; Real seen[slots];
    Real frame[slots]; Real confirmed[slots]; Real actual[slots,8]; Real stats[13];
    Real prepared[slots,7]; Real referencePoint[slots,3]; Real referenceOccupied[slots];
    Real referenceConfidence[slots]; Real referenceSeen[slots]; Real referenceFrame[slots];
    Real referenceConfirmed[slots]; Real reference[slots,8]; Real referenceStats[13];
    Real resultLocal[slots,3]; Integer resultIds[slots]; Integer resultOwners[slots]; Integer resultGeneration;
    Integer resultRevision; Real expectedLocal[3]; Integer expectedId; Integer expectedOwner;
    Real expectedConfirmed; Integer owner;
    Integer assigned; Integer retained; Integer cleared; Integer projected; Integer evicted;
    Integer expectedAssigned; Integer expectedRetained; Integer expectedCleared; Integer expectedProjected; Integer expectedEvicted;
    Real occupiedCount; Real confirmedCount;
    Real mapReason; Integer anchorReason; Integer syncReason; Integer correctionReason; Real updateReason;
    Integer generation; Integer revision; Integer previousGeneration; Integer previousRevision;
    Integer selectedId; Integer selectedSlot; Boolean requested; Boolean catalogAccepted; Boolean expectedAccepted;
    Real reset; Real poseAccepted; Real previousTime; Real timeNow; Real previousFrame; Real frameNow;
    Real previousWorld; Real world; Real expectedReason; Integer expectedSyncReason;
    Integer expectedCorrectionReason; Real expectedUpdateReason; Real expectedMapReason; Integer expectedAnchorReason;
    Boolean correct; Boolean insertion;
  algorithm
    assert(slots == RGBDMapAnchors.mapCapacity and features == 350 and nodes == RGBDMapAnchors.keyframeCapacity,
      "Catalog/map acceptance requires all 14400/350/128 slots");
    passed := fill(false,28); slotsValidated := 0;
    for scenario in 1:28 loop
      oldEnabled := fill(true,nodes); oldPosition := zeros(nodes,3); oldRotation := zeros(nodes,3,3);
      for node in 1:nodes loop oldIds[node] := 1000+node; oldRotation[node,:,:] := identity(3); end for;
      oldRotation[1,:,:] := [0,-1,0;1,0,0;0,0,1]; oldPosition[1,:] := {2,3,4};
      oldRotation[nodes,:,:] := [1,0,0;0,0,-1;0,1,0]; oldPosition[nodes,:] := {-3,1,2};
      enabled := oldEnabled; nodeIds := oldIds; positions := oldPosition; rotations := oldRotation;
      for slot in 1:slots loop
        owner := if mod(slot,2) == 1 then 1 else nodes;
        owners[slot] := owner; ids[slot] := oldIds[owner];
        local[slot,:] := {mod(slot,11)/10.0,mod(slot,7)/10.0,1+mod(slot,3)/10.0};
        previous[slot,1:3] := if owner == 1 then {2-local[slot,2],3+local[slot,1],4+local[slot,3]}
          else {-3+local[slot,1],1-local[slot,3],2+local[slot,2]};
        previous[slot,4:7] := {1,3,0,1};
      end for;
      candidate := fill(1e101,features,3); mask := zeros(features);
      previousTime := 0; timeNow := 1.0/90.0; previousFrame := 1; frameNow := 2;
      previousWorld := 0; world := 0; reset := 0; poseAccepted := 1;
      previousGeneration := 1; generation := 1; previousRevision := 3; revision := 3;
      selectedSlot := nodes; selectedId := nodeIds[nodes]; requested := true; catalogAccepted := true;
      expectedAccepted := true; expectedReason := 0; expectedSyncReason := 0; expectedCorrectionReason := 0;
      expectedUpdateReason := 0; expectedMapReason := 0; expectedAnchorReason := 0;
      expectedProjected := 0; expectedEvicted := 0;
      if scenario == 2 or scenario == 5 then
        positions[1,1] := positions[1,1]+1; revision := 4;
        if scenario == 2 then expectedProjected := slots;
        else poseAccepted := 0; expectedAccepted := false; expectedReason := 3;
          expectedUpdateReason := 2; expectedMapReason := 1; end if;
      elseif scenario == 3 or scenario == 6 or scenario == 7 or scenario == 9
          or scenario == 11 or scenario == 12 or scenario == 13 or scenario == 14 then
        nodeIds[nodes] := 2000; selectedId := 2000; revision := 4;
        mask[features] := 1; candidate[features,:] := previous[slots,1:3];
        if scenario == 3 then expectedProjected := div(slots,2); expectedEvicted := div(slots,2);
        elseif scenario == 6 then
          selectedId := 2001; expectedAccepted := false; expectedReason := 3;
          expectedUpdateReason := 3; expectedAnchorReason := 5;
        else
          expectedAccepted := false; expectedReason := 2;
          if scenario == 7 or scenario == 9 then
            revision := if scenario == 7 then 3 else 5; expectedSyncReason := 5;
          else
            expectedSyncReason := 6;
            if scenario == 11 then local[slots,1] := local[slots,1]+1;
            elseif scenario == 12 then previous[slots,5] := 0.5;
            elseif scenario == 13 then previous[slots,6] := 0.1;
            else previous[slots,7] := 1.5; end if;
          end if;
        end if;
      elseif scenario == 4 then
        enabled[nodes] := false; revision := 4; selectedId := 0; selectedSlot := 0;
        expectedProjected := div(slots,2); expectedEvicted := div(slots,2);
      elseif scenario == 8 then
        revision := 4; expectedAccepted := false; expectedReason := 2; expectedSyncReason := 5;
      elseif scenario == 10 then
        catalogAccepted := false; expectedAccepted := false; expectedReason := 2; expectedSyncReason := 3;
      elseif scenario == 15 then
        oldIds[nodes] := 2000; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 6;
      elseif scenario == 16 then
        rotations[nodes,:,:] := [1,0,0;0,1,0;0,0,-1]; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 4;
      elseif scenario == 17 then
        oldRotation[nodes,:,:] := [1,0,0;0,1,0;0,0,-1]; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 4;
      elseif scenario == 18 then
        positions[nodes,1] := 99.5; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 7; expectedCorrectionReason := 6;
      elseif scenario == 19 or scenario == 20 or scenario == 26 then
        reset := 1; generation := 2; revision := 0; frameNow := 1; world := 2;
        previous := fill(1e101,slots,7); local := fill(1e101,slots,3); ids := fill(-1,slots); owners := fill(-1,slots);
        oldPosition := fill(1e101,nodes,3); oldRotation := fill(1e101,nodes,3,3);
        mask[features] := 1; candidate[features,:] := {20,20,2};
        if scenario == 20 then revision := 1; expectedAccepted := false; expectedReason := 2; expectedSyncReason := 2;
        elseif scenario == 26 then
          selectedId := selectedId+1; expectedAccepted := false; expectedReason := 3;
          expectedUpdateReason := 3; expectedAnchorReason := 5;
        end if;
      elseif scenario == 21 then
        requested := false; oldRotation := fill(1e101,nodes,3,3); local[slots,:] := fill(1e101,3);
        expectedAccepted := false; expectedReason := 1; expectedSyncReason := 1;
      elseif scenario == 22 then
        oldEnabled[nodes] := false; enabled[nodes] := false;
        oldPosition[nodes,:] := fill(1e101,3); positions[nodes,:] := fill(-1e101,3);
        oldRotation[nodes,:,:] := fill(1e101,3,3); rotations[nodes,:,:] := fill(-1e101,3,3);
        for slot in 1:slots loop
          if mod(slot,2) == 0 then
            previous[slot,:] := fill(1e101,7); previous[slot,4] := 0;
            local[slot,:] := fill(1e101,3); ids[slot] := -1; owners[slot] := -1;
          end if;
        end for;
      elseif scenario == 23 then
        generation := 2; expectedAccepted := false; expectedReason := 2; expectedSyncReason := 2;
      elseif scenario == 24 then
        owners[slots] := 0; nodeIds[nodes] := 2000; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 6;
      elseif scenario == 25 then
        rotations[1,:,:] := identity(3); positions[1,:] := {10,20,30};
        rotations[nodes,:,:] := [0,-1,0;1,0,0;0,0,1]; positions[nodes,:] := {-10,-20,-30};
        revision := 4; expectedProjected := slots;
      elseif scenario == 27 then
        nodeIds[nodes] := nodeIds[1]; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 4;
      elseif scenario == 28 then
        previous[slots,4] := 0.5; enabled[nodes] := false; revision := 4;
        expectedAccepted := false; expectedReason := 2; expectedSyncReason := 6;
      end if;
      (point,occupied,confidence,seen,frame,confirmed,
        stats[1],stats[2],stats[3],stats[4],stats[5],stats[6],stats[7],stats[8],stats[9],stats[10],stats[11],stats[12],stats[13],
        resultLocal,resultIds,resultOwners,resultGeneration,resultRevision,syncReason,correctionReason,
        updateReason,mapReason,anchorReason,projected,evicted,assigned,retained,cleared) := UpdateCatalogLandmarkMap(
          previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,mask,features,zeros(3),poseAccepted,
          previousTime,timeNow,previousFrame,frameNow,previousWorld,world,reset,100.0,0.25,0.15,80.0,0.5,5.0,3.0,8.0,700.0,
          local,ids,owners,previousGeneration,previousRevision,oldEnabled,oldIds,oldPosition,oldRotation,
          enabled,nodeIds,positions,rotations,generation,revision,selectedId,selectedSlot,catalogAccepted,requested,1e-9);
      actual := [point,occupied,confidence,seen,frame,confirmed];
      correct := stats[1] == (if expectedAccepted then 1 else 0) and stats[2] == expectedReason
        and syncReason == expectedSyncReason and correctionReason == expectedCorrectionReason
        and updateReason == expectedUpdateReason and mapReason == expectedMapReason and anchorReason == expectedAnchorReason
        and resultGeneration == (if expectedAccepted then generation else previousGeneration)
        and resultRevision == (if expectedAccepted then revision else previousRevision);
      // Prepare the oracle using explicit fixture transforms and identity
      // eviction rules, without production synchronization/reprojection calls.
      prepared := previous;
      if expectedAccepted then
        if reset == 1 then prepared := zeros(slots,7);
        else
          for slot in 1:slots loop
            if previous[slot,4] == 1 then
              if (scenario == 3 or scenario == 4) and owners[slot] == nodes then prepared[slot,:] := zeros(7);
              elseif scenario == 2 and owners[slot] == 1 then prepared[slot,1] := previous[slot,1]+1;
              elseif scenario == 25 then
                prepared[slot,1:3] := if owners[slot] == 1 then
                  {10+local[slot,1],20+local[slot,2],30+local[slot,3]}
                  else {-10-local[slot,2],-20+local[slot,1],-30+local[slot,3]};
              end if;
            end if;
          end for;
        end if;
        (referencePoint,referenceOccupied,referenceConfidence,referenceSeen,referenceFrame,referenceConfirmed,
          referenceStats[1],referenceStats[2],referenceStats[3],referenceStats[4],referenceStats[5],referenceStats[6],referenceStats[7],
          referenceStats[8],referenceStats[9],referenceStats[10],referenceStats[11],referenceStats[12],referenceStats[13]) :=
          ReferenceUpdateLandmarkMap(prepared[:,1:3],prepared[:,4],prepared[:,5],prepared[:,6],prepared[:,7],candidate,mask,
            features,zeros(3),poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorld,world,reset,
            100.0,0.25,0.15,80.0,0.5,5.0,3.0,8.0,700.0);
        reference := [referencePoint,referenceOccupied,referenceConfidence,referenceSeen,referenceFrame,referenceConfirmed];
        referenceStats[11] := referenceStats[11]+expectedEvicted;
      end if;
      expectedAssigned := 0; expectedRetained := 0; expectedCleared := 0; occupiedCount := 0; confirmedCount := 0;
      for slot in 1:slots loop
        slotsValidated := slotsValidated+1;
        expectedLocal := local[slot,:]; expectedId := ids[slot]; expectedOwner := owners[slot];
        if expectedAccepted then
          for field in 1:8 loop correct := correct and abs(actual[slot,field]-reference[slot,field]) <= 2e-11; end for;
          insertion := (scenario == 3 and slot == 2) or (scenario == 19 and slot == 1);
          if reference[slot,4] == 0 then
            expectedLocal := zeros(3); expectedId := 0; expectedOwner := 0; expectedCleared := expectedCleared+1;
          elseif insertion then
            expectedLocal := {reference[slot,1]+3,reference[slot,3]-2,1-reference[slot,2]};
            expectedId := selectedId; expectedOwner := selectedSlot; expectedAssigned := expectedAssigned+1;
          else expectedRetained := expectedRetained+1; end if;
        else
          for field in 1:7 loop correct := correct and actual[slot,field] == previous[slot,field]; end for;
          expectedConfirmed := if previous[slot,4] == 1 and previous[slot,5] >= 3 then 1 else 0;
          correct := correct and actual[slot,8] == expectedConfirmed;
          occupiedCount := occupiedCount+(if previous[slot,4] == 1 then 1 else 0);
          confirmedCount := confirmedCount+expectedConfirmed;
        end if;
        for axis in 1:3 loop correct := correct and abs(resultLocal[slot,axis]-expectedLocal[axis]) <= 1e-12; end for;
        correct := correct and resultIds[slot] == expectedId and resultOwners[slot] == expectedOwner;
      end for;
      if expectedAccepted then
        correct := correct and referenceStats[1] == 1;
        for field in 3:13 loop correct := correct and abs(stats[field]-referenceStats[field]) <= 2e-11; end for;
      else
        correct := correct and stats[3] == previousTime and stats[4] == previousFrame and stats[5] == previousWorld
          and stats[6] == occupiedCount and stats[7] == confirmedCount and stats[8] == occupiedCount-confirmedCount;
        for field in 9:13 loop correct := correct and stats[field] == 0; end for;
      end if;
      passed[scenario] := correct and assigned == expectedAssigned and retained == expectedRetained
        and cleared == expectedCleared and projected == expectedProjected and evicted == expectedEvicted;
    end for;
  end Run;
end RGBDLandmarkCatalogTests;
