package RGBDMapAnchorAssignmentTests
  function Run
    input Integer slots; input Integer features; input Integer nodes;
    output Boolean passed[40];
  protected
    Real previous[slots,3]; Real occupied[slots]; Real local[slots,3];
    Integer ids[slots]; Integer owners[slots];
    Real nextPoint[slots,3]; Real nextOccupied[slots]; Integer receipts[slots];
    Real candidates[features,3]; Real mask[features];
    Boolean enabled[nodes]; Integer nodeIds[nodes];
    Real positions[nodes,3]; Real rotations[nodes,3,3];
    Real result[slots,3]; Integer resultIds[slots]; Integer resultOwners[slots];
    Real expected[3]; Integer expectedId; Integer expectedOwner; Integer owner;
    Integer previousGeneration; Integer generation; Integer catalogGeneration;
    Integer selectedId; Integer selectedSlot; Real count; Real limit; Real tolerance;
    Boolean requested; Boolean mapAccepted; Boolean reset; Boolean expectedAccepted;
    Integer expectedReason; Integer resultGeneration; Boolean accepted; Integer reason;
    Integer assigned; Integer retained; Integer cleared;
    Integer expectedAssigned; Integer expectedRetained; Integer expectedCleared;
    Boolean correct;
  algorithm
    assert(slots == RGBDMapAnchors.mapCapacity and features == 350
      and nodes == RGBDMapAnchors.keyframeCapacity,
      "Anchor assignment acceptance requires all 14400/350/128 slots");
    passed := fill(false,40);
    for scenario in 1:40 loop
      enabled := fill(true,nodes); positions := zeros(nodes,3);
      rotations := zeros(nodes,3,3);
      for node in 1:nodes loop
        nodeIds[node] := 1000+node; rotations[node,:,:] := identity(3);
      end for;
      rotations[1,:,:] := [0,-1,0;1,0,0;0,0,1]; positions[1,:] := {2,3,4};
      rotations[nodes,:,:] := [1,0,0;0,0,-1;0,1,0]; positions[nodes,:] := {-3,1,2};
      for slot in 1:slots loop
        owner := if mod(slot,2) == 1 then 1 else nodes;
        owners[slot] := owner; ids[slot] := nodeIds[owner];
        local[slot,:] := {mod(slot,11)/10.0,mod(slot,7)/10.0,1+mod(slot,3)/10.0};
        previous[slot,:] := if owner == 1 then {2-local[slot,2],3+local[slot,1],4+local[slot,3]}
          else {-3+local[slot,1],1-local[slot,3],2+local[slot,2]};
      end for;
      occupied := ones(slots); nextPoint := previous; nextOccupied := occupied;
      receipts := fill(0,slots); mask := ones(features);
      for feature in 1:features loop candidates[feature,:] := {7+feature/1000.0,8,9}; end for;
      previousGeneration := 1; generation := 1; catalogGeneration := 1;
      selectedId := nodeIds[nodes]; selectedSlot := nodes;
      count := features; limit := 100; tolerance := 1e-9;
      requested := true; mapAccepted := true; reset := false;
      expectedAccepted := true; expectedReason := 0;
      // Every case starts with the complete occupied map. Mutations below
      // exercise the last slots as well as rollback after provisional writes.
      if scenario == 2 then
        receipts[1] := 1; nextPoint[1,:] := candidates[1,:];
      elseif scenario == 3 then
        receipts[1] := 1; candidates[1,:] := previous[1,:];
      elseif scenario == 4 then
        receipts[slots] := features; nextPoint[slots,:] := candidates[features,:];
      elseif scenario == 5 then
        nextOccupied[slots] := 0; local[slots,:] := fill(1e101,3);
        ids[slots] := -10; owners[slots] := -20;
      elseif scenario == 6 then
        reset := true; generation := 2; catalogGeneration := 2;
        nextOccupied := zeros(slots); nextOccupied[1] := 1; nextOccupied[slots] := 1;
        receipts[1] := 1; receipts[slots] := features;
        nextPoint[1,:] := candidates[1,:]; nextPoint[slots,:] := candidates[features,:];
      elseif scenario == 7 then
        receipts[1] := 1; receipts[slots] := 1;
        nextPoint[1,:] := candidates[1,:]; nextPoint[slots,:] := candidates[1,:];
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 8 then
        receipts[slots] := features+1; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 9 then
        receipts[slots] := -1; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 10 then
        receipts[1] := 1; nextPoint[1,:] := candidates[1,:]; mask[1] := 0;
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 11 then
        receipts[slots] := features; nextPoint[slots,:] := candidates[features,:]; count := features-1;
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 12 then
        receipts[1] := 1; nextPoint[1,:] := candidates[1,:];
        receipts[slots] := features; nextPoint[slots,:] := candidates[features,:];
        nextPoint[slots,1] := nextPoint[slots,1]+0.001;
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 13 then
        nextOccupied[slots] := 0; receipts[slots] := features;
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 14 then
        occupied[slots] := 0; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 15 then
        ids[slots] := ids[slots]+1; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 16 then
        owners[slots] := 0; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 17 then
        nodeIds[nodes] := 2000; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 18 then
        enabled[nodes] := false; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 19 then
        rotations[nodes,:,:] := [1,0,0;0,1,0;0,0,-1]; expectedAccepted := false; expectedReason := 4;
      elseif scenario == 20 then
        nodeIds[nodes] := nodeIds[1]; expectedAccepted := false; expectedReason := 4;
      elseif scenario == 21 then
        catalogGeneration := 2; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 22 then
        reset := true; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 23 then
        reset := true; generation := 2; catalogGeneration := 2;
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 24 then
        nextPoint[slots,1] := nextPoint[slots,1]+0.01; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 25 then
        local[slots,1] := local[slots,1]+0.01; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 26 or scenario == 27 then
        rotations[nodes,:,:] := fill(1e101,3,3); local[slots,:] := fill(1e101,3);
        requested := scenario <> 26; mapAccepted := scenario <> 27;
        expectedAccepted := false; expectedReason := if scenario == 26 then 1 else 3;
      elseif scenario == 28 then
        nextOccupied := zeros(slots); selectedId := 0; selectedSlot := 0;
      elseif scenario == 29 then
        selectedId := selectedId+1; receipts[1] := 1; nextPoint[1,:] := candidates[1,:];
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 30 then
        tolerance := 0; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 31 then
        count := features-0.5; expectedAccepted := false; expectedReason := 2;
      elseif scenario == 32 then
        limit := 0.1; expectedAccepted := false; expectedReason := 4;
      elseif scenario == 33 then
        receipts[1] := 1; candidates[1,:] := {100,8,9}; nextPoint[1,:] := candidates[1,:];
        expectedAccepted := false; expectedReason := 5;
      elseif scenario == 34 then
        nextOccupied[slots] := 0.5; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 35 then
        ids[slots] := RGBDMapAnchors.identifierLimit+1; expectedAccepted := false; expectedReason := 5;
      elseif scenario == 36 then
        enabled[nodes] := false; rotations[nodes,:,:] := fill(1e101,3,3); positions[nodes,:] := fill(1e101,3);
        for slot in 1:slots loop
          owners[slot] := 1; ids[slot] := nodeIds[1];
          previous[slot,:] := {2-local[slot,2],3+local[slot,1],4+local[slot,3]};
        end for;
        nextPoint := previous;
      elseif scenario == 37 then
        selectedId := 0; selectedSlot := 0;
      elseif scenario == 38 or scenario == 39 then
        reset := true; previousGeneration := 0;
        nextOccupied := zeros(slots); nextOccupied[1] := 1; receipts[1] := 1;
        nextPoint[1,:] := candidates[1,:];
        if scenario == 39 then
          local := fill(1e101,slots,3); ids := fill(-1,slots); owners := fill(-1,slots);
          occupied := fill(0.5,slots);
        end if;
      elseif scenario == 40 then
        selectedSlot := 0; receipts[1] := 1; nextPoint[1,:] := candidates[1,:];
        expectedAccepted := false; expectedReason := 5;
      end if;
      (result,resultIds,resultOwners,resultGeneration,accepted,reason,assigned,retained,cleared) :=
        AssignLandmarkAnchors(previous,occupied,local,ids,owners,previousGeneration,
          nextPoint,nextOccupied,receipts,candidates,mask,count,enabled,nodeIds,positions,rotations,
          catalogGeneration,generation,selectedId,selectedSlot,mapAccepted,requested,reset,limit,tolerance);
      correct := accepted == expectedAccepted and reason == expectedReason
        and resultGeneration == (if expectedAccepted then generation else previousGeneration);
      expectedAssigned := 0; expectedRetained := 0; expectedCleared := 0;
      // Independent closed-form expectation for every output slot; no call
      // to the production inverse/forward transform or a reduced capacity.
      for slot in 1:slots loop
        expected := local[slot,:]; expectedId := ids[slot]; expectedOwner := owners[slot];
        if expectedAccepted then
          if nextOccupied[slot] == 0 then
            expected := zeros(3); expectedId := 0; expectedOwner := 0;
            expectedCleared := expectedCleared+1;
          elseif receipts[slot] > 0 then
            expected := {nextPoint[slot,1]+3,nextPoint[slot,3]-2,1-nextPoint[slot,2]};
            expectedId := selectedId; expectedOwner := selectedSlot; expectedAssigned := expectedAssigned+1;
          else expectedRetained := expectedRetained+1; end if;
        end if;
        for axis in 1:3 loop
          correct := correct and abs(result[slot,axis]-expected[axis]) <= 1e-12;
        end for;
        correct := correct and resultIds[slot] == expectedId and resultOwners[slot] == expectedOwner;
      end for;
      passed[scenario] := correct and assigned == expectedAssigned and retained == expectedRetained
        and cleared == expectedCleared;
    end for;
  end Run;
end RGBDMapAnchorAssignmentTests;
