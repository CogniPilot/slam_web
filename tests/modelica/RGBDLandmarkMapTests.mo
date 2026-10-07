// Full-capacity differential tests. The frozen implementation is test-only;
// production execution and compiler qualification must use Rumoca SolveIR WASM.
package RGBDLandmarkMapTests
  constant Integer mapCapacity = 14400;
  constant Integer featureCapacity = 350;
  constant Integer stateWidth = 8;
  constant Integer statisticCount = 13;

  function Compare
    input Real previous[:,stateWidth];
    input Real candidate[:,3];
    input Real enabled[size(candidate,1)];
    input Real previousTime = 0.0;
    input Real timeNow = 1.0/30.0;
    input Real previousFrame = 0.0;
    input Real frameNow = 1.0;
    input Real previousWorldFrame = 0.0;
    input Real worldFrame = 0.0;
    input Real resetRequested = 0.0;
    input Real poseAccepted = 1.0;
    input Real candidateCount = size(candidate,1);
    input Real confirmationObservations = 3.0;
    input Real maximumTentative = 700.0;
    input Real voxelWidth = 0.25;
    input Real mergeRadius = 0.15;
    input Real bodyPosition[3] = zeros(3);
    output Boolean equal;
    output Real next[size(previous,1),stateWidth];
    output Real stats[statisticCount];
  protected
    Real actualPoint[size(previous,1),3];
    Real actualOccupied[size(previous,1)];
    Real actualConfidence[size(previous,1)];
    Real actualLastSeen[size(previous,1)];
    Real actualLastFrame[size(previous,1)];
    Real actualConfirmed[size(previous,1)];
    Real referencePoint[size(previous,1),3];
    Real referenceOccupied[size(previous,1)];
    Real referenceConfidence[size(previous,1)];
    Real referenceLastSeen[size(previous,1)];
    Real referenceLastFrame[size(previous,1)];
    Real referenceConfirmed[size(previous,1)];
    Real reference[size(previous,1),stateWidth];
    Real referenceStats[statisticCount];
  algorithm
    (actualPoint,actualOccupied,actualConfidence,actualLastSeen,actualLastFrame,actualConfirmed,
      stats[1],stats[2],stats[3],stats[4],stats[5],stats[6],stats[7],stats[8],
      stats[9],stats[10],stats[11],stats[12],stats[13]) := UpdateLandmarkMap(
      previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,enabled,
      candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,
      previousWorldFrame,worldFrame,resetRequested,1e6,voxelWidth,mergeRadius,80.0,0.5,5.0,
      confirmationObservations,8.0,maximumTentative);
    (referencePoint,referenceOccupied,referenceConfidence,referenceLastSeen,referenceLastFrame,referenceConfirmed,
      referenceStats[1],referenceStats[2],referenceStats[3],referenceStats[4],referenceStats[5],
      referenceStats[6],referenceStats[7],referenceStats[8],referenceStats[9],referenceStats[10],
      referenceStats[11],referenceStats[12],referenceStats[13]) := ReferenceUpdateLandmarkMap(
      previous[:,1:3],previous[:,4],previous[:,5],previous[:,6],previous[:,7],candidate,enabled,
      candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,
      previousWorldFrame,worldFrame,resetRequested,1e6,voxelWidth,mergeRadius,80.0,0.5,5.0,
      confirmationObservations,8.0,maximumTentative);
    next := [actualPoint,actualOccupied,actualConfidence,actualLastSeen,actualLastFrame,actualConfirmed];
    reference := [referencePoint,referenceOccupied,referenceConfidence,referenceLastSeen,referenceLastFrame,referenceConfirmed];
    equal := true;
    for slot in 1:size(previous,1) loop
      for field in 1:stateWidth loop
        equal := equal and abs(next[slot,field]-reference[slot,field]) <= 2e-11;
      end for;
    end for;
    for field in 1:statisticCount loop
      equal := equal and abs(stats[field]-referenceStats[field]) <= 2e-11;
    end for;
  end Compare;

  function Run
    input Integer slotCount = mapCapacity "Acceptance uses all 14400 slots";
    input Integer candidateCapacity = featureCapacity "Acceptance uses all 350 candidates";
    input Real maskedBackground = 0.0;
    output Boolean passed[28];
    output Integer outputScalarsChecked;
  protected
    Real previous[slotCount,stateWidth];
    Real first[slotCount,stateWidth];
    Real next[slotCount,stateWidth];
    Real candidate[candidateCapacity,3];
    Real enabled[candidateCapacity];
    Real stats[statisticCount];
    Boolean equal;
  algorithm
    passed := fill(false,28);
    outputScalarsChecked := 28*(slotCount*stateWidth+statisticCount);
    previous := fill(maskedBackground,slotCount,stateWidth);
    enabled := ones(candidateCapacity);
    for feature in 1:candidateCapacity loop
      candidate[feature,:] := {(mod(feature-1,25)-12)*0.6,(div(feature-1,25)-7)*0.6,2};
    end for;
    (equal,next,stats) := Compare(previous,candidate,enabled);
    first := next;
    passed[1] := equal and stats[1] == 1 and stats[6] == candidateCapacity
      and stats[9] == candidateCapacity and next[candidateCapacity,4] == 1;
    previous := next;
    (equal,next,stats) := Compare(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    passed[2] := equal and stats[10] == candidateCapacity and next[candidateCapacity,5] == 2;
    previous := next;
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,3);
    passed[3] := equal and stats[7] == candidateCapacity and next[candidateCapacity,8] == 1;

    previous := zeros(slotCount,stateWidth);
    candidate := fill(0.02,candidateCapacity,3);
    candidate[:,3] := fill(2.0,candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled);
    passed[4] := equal and stats[9] == 1 and stats[10] == candidateCapacity-1 and next[1,5] == 1;
    previous := next;
    (equal,next,stats) := Compare(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    passed[5] := equal and next[1,5] == 2 and stats[7] == 0;

    previous := zeros(slotCount,stateWidth);
    previous[1,:] := {10,0,2,1,3,1,3,0};
    previous[slotCount,:] := {-10,0,2,1,3,1,3,0};
    enabled := zeros(candidateCapacity);
    enabled[candidateCapacity] := 1;
    candidate := fill(1e99,candidateCapacity,3);
    candidate[candidateCapacity,:] := {-10.02,0,2};
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.0+1.0/30.0,3,4);
    passed[6] := equal and stats[10] == 1 and next[slotCount,5] == 4 and next[slotCount,1] == -10;
    previous := zeros(slotCount,stateWidth);
    enabled[1] := 1;
    candidate[1,:] := {-0.01,0,2};
    candidate[candidateCapacity,:] := {0.01,0,2};
    (equal,next,stats) := Compare(previous,candidate,enabled);
    passed[7] := equal and stats[9] == 1 and stats[10] == 1 and next[1,1] == -0.01;

    // Every slot is occupied, including the final one. Full maps cannot insert.
    for slot in 1:slotCount loop
      previous[slot,:] := {(mod(slot-1,120)-60)*0.4,(div(slot-1,120)-60)*0.4,0,1,3,1,3,0};
    end for;
    candidate := zeros(candidateCapacity,3);
    candidate[:,1] := fill(50.0,candidateCapacity);
    candidate[:,3] := fill(2.0,candidateCapacity);
    enabled := ones(candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.0+1.0/30.0,3,4);
    passed[8] := equal and stats[6] == slotCount and stats[12] == candidateCapacity;
    previous[slotCount,6] := 0;
    enabled := zeros(candidateCapacity);
    enabled[candidateCapacity] := 1;
    (equal,next,stats) := Compare(previous,candidate,enabled,1,5.01,3,4);
    passed[9] := equal and stats[11] == 1 and stats[9] == 1 and next[slotCount,1] == 50;

    previous := zeros(slotCount,stateWidth);
    previous[1,:] := {10,0,2,1,3,1,3,0};
    previous[slotCount,:] := {-10,0,2,1,3,1,3,0};
    enabled := zeros(candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled,1,6,3,4);
    passed[10] := equal and stats[6] == 2 and stats[11] == 0;
    (equal,next,stats) := Compare(previous,candidate,enabled,1,6+1e-8,3,4);
    passed[11] := equal and stats[6] == 0 and stats[11] == 2;
    previous[1,1:3] := {80,0,0};
    previous[slotCount,1:3] := {80+1e-8,0,0};
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.1,3,4);
    passed[12] := equal and next[1,4] == 1 and next[slotCount,4] == 0 and stats[11] == 1;
    previous[1,1:3] := {10,0,2};
    previous[slotCount,1:3] := {-10,0,2};
    previous[1,5] := 1;
    previous[slotCount,5] := 1;
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.5,3,4);
    passed[13] := equal and stats[6] == 2;
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.5+1e-8,3,4);
    passed[14] := equal and stats[11] == 2;

    previous := first;
    enabled := ones(candidateCapacity);
    candidate := first[1:candidateCapacity,1:3];
    candidate[:,3] := candidate[:,3]+fill(5.0,candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2);
    passed[15] := equal and stats[8] == 700 and stats[9] == candidateCapacity;
    previous := next;
    candidate[:,3] := candidate[:,3]+fill(10.0,candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,3);
    passed[16] := equal and stats[9] == 0 and stats[12] == candidateCapacity;
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,4);
    passed[17] := equal and stats[1] == 0 and stats[4] == 2;
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,3,0,1);
    passed[18] := equal and stats[1] == 0 and stats[5] == 0;
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,2.0/30.0,2,3);
    passed[19] := equal and stats[1] == 0;
    previous[slotCount,4] := 0.5;
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,3);
    passed[20] := equal and stats[1] == 0 and stats[2] == 2;
    previous[slotCount,4] := 0;
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,3,poseAccepted=0);
    passed[21] := equal and stats[1] == 0;

    previous := zeros(slotCount,stateWidth);
    candidate := fill(1e99,candidateCapacity,3);
    enabled := zeros(candidateCapacity);
    enabled[1] := 0.5;
    enabled[candidateCapacity] := 1;
    (equal,next,stats) := Compare(previous,candidate,enabled);
    passed[22] := equal and stats[13] == 2 and stats[6] == 0;
    previous[slotCount,4] := 0.5;
    enabled := zeros(candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled,2.0/30.0,3.0/30.0,2,1,0,17,1);
    passed[23] := equal and stats[1] == 1 and stats[5] == 17 and stats[6] == 0;
    previous := first;
    candidate := first[1:candidateCapacity,1:3];
    enabled := ones(candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2,confirmationObservations=2);
    passed[24] := equal and stats[7] == candidateCapacity;
    previous := fill(1e99,slotCount,stateWidth);
    previous[:,4] := zeros(slotCount);
    enabled := zeros(candidateCapacity);
    (equal,next,stats) := Compare(previous,candidate,enabled);
    passed[25] := equal and stats[1] == 1 and next[slotCount,1] == 0 and next[slotCount,5] == 0;
    previous := first;
    (equal,next,stats) := Compare(previous,candidate,enabled,1.0/30.0,2.0/30.0,1,2,candidateCount=candidateCapacity+1);
    passed[26] := equal and stats[1] == 0;

    // Insertion consumes the earliest hole even though hash chains are unordered.
    previous := zeros(slotCount,stateWidth);
    previous[1,:] := {20,20,2,1,3,1,3,0};
    previous[3,:] := {10,10,2,1,3,1,3,0};
    enabled := zeros(candidateCapacity);
    enabled[candidateCapacity] := 1;
    candidate[candidateCapacity,:] := {30,30,2};
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.1,3,4);
    passed[27] := equal and stats[9] == 1 and next[2,1] == 30 and next[3,1] == 10;
    previous := zeros(slotCount,stateWidth);
    previous[1,:] := {-0.265625,0,2,1,3,1,3,0};
    candidate[candidateCapacity,:] := {-0.234375,0,2};
    (equal,next,stats) := Compare(previous,candidate,enabled,1,1.1,3,4,mergeRadius=0.03125);
    passed[28] := equal and stats[10] == 1 and next[1,1] == -0.265625;
  end Run;
end RGBDLandmarkMapTests;
