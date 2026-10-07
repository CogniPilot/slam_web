// Insertion identity checks are separate from the frozen map-value oracle.
package RGBDLandmarkReceiptTests
  constant Integer imageHeight = 90; constant Integer imageWidth = 160;
  constant Integer mapCapacity = imageHeight*imageWidth;
  constant Integer featureCapacity = 350;
  constant Integer stateWidth = 8; constant Integer statisticCount = 13;

  function Update
    input Real previous[:,stateWidth]; input Real candidate[:,3];
    input Real enabled[size(candidate,1)];
    input Real previousTime = 0.0; input Real timeNow = 1.0/30.0;
    input Real previousFrame = 0.0; input Real frameNow = 1.0;
    input Real reset = 0.0; input Real poseAccepted = 1.0;
    input Real maximumTentative = 700.0;
    input Real previousWorldFrame = 0.0; input Real worldFrame = 0.0;
    output Real next[size(previous,1),stateWidth];
    output Integer receipt[size(previous,1)]; output Real stats[statisticCount];
  protected
    Real point[size(previous,1),3]; Real occupied[size(previous,1)];
    Real confidence[size(previous,1)]; Real lastSeen[size(previous,1)];
    Real lastFrame[size(previous,1)]; Real confirmed[size(previous,1)];
  algorithm
    (point,occupied,confidence,lastSeen,lastFrame,confirmed,
      stats[1],stats[2],stats[3],stats[4],stats[5],stats[6],stats[7],stats[8],
      stats[9],stats[10],stats[11],stats[12],stats[13],receipt) := UpdateLandmarkMapWithReceipts(
        previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,enabled,
        size(candidate,1),zeros(3),poseAccepted,previousTime,timeNow,previousFrame,frameNow,
        previousWorldFrame,worldFrame,reset,1e6,0.25,0.15,80.0,0.5,5.0,3.0,8.0,maximumTentative);
    next := [point,occupied,confidence,lastSeen,lastFrame,confirmed];
  end Update;

  function Check
    input Real next[:,stateWidth]; input Integer receipt[size(next,1)];
    input Real candidate[:,3]; input Real expectedInsertions;
    output Boolean valid; output Integer visited;
  protected
    Boolean seen[size(candidate,1)]; Integer feature; Integer count;
  algorithm
    valid := true; seen := fill(false,size(candidate,1)); count := 0; visited := 0;
    for slot in 1:size(next,1) loop
      visited := visited+1; feature := receipt[slot];
      valid := valid and feature >= 0 and feature <= size(candidate,1);
      if feature > 0 and feature <= size(candidate,1) then
        count := count+1;
        valid := valid and not seen[feature] and next[slot,4] == 1.0;
        for axis in 1:3 loop valid := valid and next[slot,axis] == candidate[feature,axis]; end for;
        seen[feature] := true;
      end if;
    end for;
    valid := valid and count == expectedInsertions;
  end Check;

  function Run
    input Integer slots; input Integer features;
    output Boolean passed[16]; output Integer slotsValidated;
  protected
    Real previous[slots,stateWidth]; Real first[slots,stateWidth]; Real next[slots,stateWidth];
    Real candidate[features,3]; Real enabled[features]; Real stats[statisticCount];
    Integer receipt[slots]; Integer visited; Boolean valid; Boolean identityValid;
  algorithm
    assert(slots == mapCapacity and features == featureCapacity,"Receipt acceptance requires full map/feature capacities");
    passed := fill(false,16); slotsValidated := 0;
    previous := zeros(slots,stateWidth); enabled := ones(features);
    for feature in 1:features loop
      candidate[feature,:] := {(mod(feature-1,25)-12)*0.6,(div(feature-1,25)-7)*0.6,2};
    end for;
    (next,receipt,stats) := Update(previous,candidate,enabled); first := next;
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    identityValid := true;
    for slot in 1:slots loop identityValid := identityValid and receipt[slot] == (if slot <= features then slot else 0); end for;
    passed[1] := valid and identityValid and stats[1] == 1.0 and stats[9] == features;
    (next,receipt,stats) := Update(first,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[2] := valid and max(receipt) == 0 and stats[9] == 0 and stats[10] == features;
    candidate := zeros(features,3); candidate[:,3] := fill(2.0,features);
    (next,receipt,stats) := Update(previous,candidate,enabled); first := next;
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[3] := valid and receipt[1] == 1 and stats[9] == 1 and stats[10] == features-1 and next[1,5] == 1.0;
    enabled := zeros(features); enabled[features] := 1.0;
    candidate := fill(1e101,features,3); candidate[features,:] := {20,20,2};
    (next,receipt,stats) := Update(previous,candidate,enabled);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[4] := valid and receipt[1] == features and stats[9] == 1;
    previous := zeros(slots,stateWidth);
    previous[:,3] := fill(2.0,slots); previous[:,4] := ones(slots); previous[:,5] := fill(3.0,slots);
    previous[:,6] := fill(1.0/30.0,slots); previous[:,7] := ones(slots);
    (next,receipt,stats) := Update(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[5] := valid and max(receipt) == 0 and stats[9] == 0 and stats[12] == 1;
    previous[slots,:] := zeros(stateWidth);
    (next,receipt,stats) := Update(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[6] := valid and receipt[slots] == features and stats[9] == 1 and next[slots,4] == 1.0;
    previous := zeros(slots,stateWidth); previous[1,:] := {20,20,2,1,1,0,1,0};
    (next,receipt,stats) := Update(previous,candidate,enabled,0.6,0.7,1,2);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[7] := valid and receipt[1] == features and stats[9] == 1 and stats[11] == 1
      and next[1,1] == previous[1,1] and next[1,2] == previous[1,2] and next[1,3] == previous[1,3];
    previous := fill(1e101,slots,stateWidth);
    (next,receipt,stats) := Update(previous,candidate,enabled,reset=1.0);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[8] := valid and receipt[1] == features and stats[1] == 1 and stats[9] == 1 and stats[6] == 1;
    previous := zeros(slots,stateWidth); enabled[features] := 0.5;
    (next,receipt,stats) := Update(previous,candidate,enabled);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[9] := valid and max(receipt) == 0 and stats[1] == 1 and stats[13] == 1;
    enabled[features] := 1.0;
    (next,receipt,stats) := Update(first,candidate,enabled,1.0/30.0,2.0/30.0,1,2,poseAccepted=0.0);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[10] := valid and max(receipt) == 0 and stats[1] == 0 and stats[2] == 1;
    previous[slots,4] := 0.5;
    (next,receipt,stats) := Update(previous,candidate,enabled);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[11] := valid and max(receipt) == 0 and stats[1] == 0 and stats[2] == 2;
    previous := zeros(slots,stateWidth);
    (next,receipt,stats) := Update(previous,candidate,enabled,timeNow=0.0);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    // The first empty-map observation now admits acquisition time zero.
    // Keep the original inputs; independently check every state and receipt
    // slot, including canonical empties and the original final feature id.
    identityValid := true;
    for slot in 1:slots loop
      identityValid := identityValid and receipt[slot] == (if slot == 1 then features else 0)
        and max(abs(next[slot,:]-(if slot == 1 then {20,20,2,1,1,0,1,0} else zeros(stateWidth)))) == 0;
    end for;
    passed[12] := valid and identityValid
      and max(abs(stats-{1,0,0,1,0,1,0,1,1,0,0,0,0})) == 0;
    (next,receipt,stats) := Update(previous,candidate,enabled,worldFrame=1.0);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[13] := valid and max(receipt) == 0 and stats[1] == 0;
    (next,receipt,stats) := Update(previous,candidate,enabled,maximumTentative=0.0);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[14] := valid and max(receipt) == 0 and stats[1] == 1 and stats[12] == 1;
    candidate := zeros(features,3); candidate[:,3] := fill(2.0,features); candidate[1,:] := fill(1e101,3);
    enabled := ones(features);
    (next,receipt,stats) := Update(previous,candidate,enabled); first := next;
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[15] := valid and receipt[1] == 2 and stats[9] == 1 and stats[10] == features-2 and stats[13] == 1;
    candidate[1,:] := {0,0,2};
    (next,receipt,stats) := Update(first,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    (valid,visited) := Check(next,receipt,candidate,stats[9]); slotsValidated := slotsValidated+visited;
    passed[16] := valid and max(receipt) == 0 and stats[10] == features and next[1,5] == 2.0;
  end Run;
end RGBDLandmarkReceiptTests;
