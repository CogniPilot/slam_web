package RGBDMapAnchorTests
  constant Integer slots = RGBDMapAnchors.mapCapacity;
  constant Integer nodes = RGBDMapAnchors.keyframeCapacity;
  constant Integer dimension = RGBDMapAnchors.dimension;

  // Compare every matrix element without a rank-dependent reduction lowering.
  function MatrixError
    input Real first[:,:]; input Real second[size(first,1),size(first,2)];
    output Real error;
  algorithm
    error := 0.0;
    for row in 1:size(first,1) loop
      for column in 1:size(first,2) loop
        error := max(error,abs(first[row,column]-second[row,column]));
      end for;
    end for;
  end MatrixError;

  function MatrixMagnitude
    input Real value[:,:]; output Real magnitude;
  algorithm
    magnitude := 0.0;
    for row in 1:size(value,1) loop
      for column in 1:size(value,2) loop magnitude := max(magnitude,abs(value[row,column])); end for;
    end for;
  end MatrixMagnitude;

  function Apply
    input Real previous[:,dimension]; input Real local[size(previous,1),dimension];
    input Real occupied[size(previous,1)]; input Integer ids[size(previous,1)]; input Integer owners[size(previous,1)];
    input Boolean enabled[:]; input Integer nodeIds[size(enabled,1)];
    input Real positions[size(enabled,1),dimension]; input Real rotations[size(enabled,1),dimension,dimension];
    input Boolean requested = true; input Boolean graphAccepted = true;
    input Integer generation = 1; input Integer graphGeneration = 1;
    input Integer previousRevision = 3; input Integer graphRevision = 4;
    input Real limit = 100.0;
    output Real nextPoint[size(previous,1),dimension];
    output Real nextLocal[size(previous,1),dimension];
    output Real nextOccupied[size(previous,1)];
    output Integer nextIds[size(previous,1)];
    output Integer nextOwners[size(previous,1)];
    output Integer nextRevision;
    output Boolean accepted;
    output Integer reason;
    output Integer projected;
    output Integer pruned;
  algorithm
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,
      accepted,reason,projected,pruned) := RGBDMapAnchors.Reproject(
        previous,local,occupied,ids,owners,generation,previousRevision,enabled,nodeIds,
        positions,rotations,graphGeneration,graphRevision,graphAccepted,requested,limit);
  end Apply;

  function Retained
    input Real nextPoint[:,dimension];
    input Real nextLocal[size(nextPoint,1),dimension];
    input Real nextOccupied[size(nextPoint,1)];
    input Integer nextIds[size(nextPoint,1)];
    input Integer nextOwners[size(nextPoint,1)];
    input Integer nextRevision;
    input Boolean accepted;
    input Integer reason;
    input Integer projected;
    input Integer pruned;
    input Real previous[size(nextPoint,1),dimension]; input Real local[size(nextPoint,1),dimension];
    input Real occupied[size(nextPoint,1)]; input Integer ids[size(nextPoint,1)]; input Integer owners[size(nextPoint,1)];
    output Boolean valid;
  algorithm
    valid := not accepted and nextRevision == 3 and projected == 0 and pruned == 0
      and MatrixError(nextPoint,previous) == 0.0 and MatrixError(nextLocal,local) == 0.0
      and max(abs(nextOccupied-occupied)) == 0.0 and max(abs(nextIds-ids)) == 0
      and max(abs(nextOwners-owners)) == 0;
  end Retained;

  function Run
    input Integer slots; input Integer nodes;
    output Boolean passed[28];
  protected
    Real previous[slots,dimension]; Real local[slots,dimension]; Real expected[slots,dimension];
    Real occupied[slots]; Integer ids[slots]; Integer owners[slots];
    Boolean enabled[nodes]; Integer nodeIds[nodes];
    Real positions[nodes,dimension]; Real rotations[nodes,dimension,dimension];
    Real changedLocal[slots,dimension]; Real changedPrevious[slots,dimension];
    Real changedOccupied[slots]; Integer changedIds[slots]; Integer changedOwners[slots];
    Real A[dimension,dimension]; Real B[dimension,dimension];
    Real nextPoint[slots,dimension]; Real nextLocal[slots,dimension];
    Real nextOccupied[slots]; Integer nextIds[slots]; Integer nextOwners[slots];
    Integer nextRevision; Boolean accepted; Integer reason; Integer projected; Integer pruned;
    Real firstPoint[slots,dimension]; Boolean correct; Integer owner;
  algorithm
    assert(slots == RGBDMapAnchors.mapCapacity and nodes == RGBDMapAnchors.keyframeCapacity,
      "This acceptance suite requires the complete map and keyframe domains");
    passed := fill(false,28); local := zeros(slots,dimension); occupied := ones(slots);
    ids := fill(0,slots); owners := fill(0,slots);
    enabled := fill(true,nodes); nodeIds := fill(0,nodes);
    positions := zeros(nodes,dimension); rotations := zeros(nodes,dimension,dimension);
    A := [0,-1,0;1,0,0;0,0,1]; B := [1,0,0;0,0,-1;0,1,0];
    for node in 1:nodes loop nodeIds[node] := 1000+node; rotations[node,:,:] := identity(dimension); end for;
    rotations[1,:,:] := A; rotations[nodes,:,:] := B;
    positions[1,:] := {2,3,4}; positions[nodes,:] := {-3,1,2};
    for slot in 1:slots loop
      owner := if mod(slot,2) == 1 then 1 else nodes;
      owners[slot] := owner; ids[slot] := nodeIds[owner];
      local[slot,:] := {mod(slot,11)/10.0,mod(slot,7)/10.0,1+mod(slot,3)/10.0};
      expected[slot,:] := if owner == 1 then {2-local[slot,2],3+local[slot,1],4+local[slot,3]}
        else {-3+local[slot,1],1-local[slot,3],2+local[slot,2]};
    end for;
    previous := local;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations); firstPoint := nextPoint;
    passed[1] := accepted and reason == 0 and MatrixError(nextPoint,expected) < 1e-12;
    passed[2] := MatrixError(nextLocal,local) == 0.0 and max(abs(nextIds-ids)) == 0
      and max(abs(nextOwners-owners)) == 0 and min(nextOccupied) == 1.0 and max(nextOccupied) == 1.0;
    passed[3] := nextRevision == 4 and projected == slots and pruned == 0;
    passed[4] := max(abs(nextPoint[slots,:]-expected[slots,:])) < 1e-12 and nextOwners[slots] == nodes;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(firstPoint,local,occupied,ids,owners,
      enabled,nodeIds,positions,rotations,previousRevision=4,graphRevision=5);
    passed[5] := accepted and nextRevision == 5 and MatrixError(nextPoint,firstPoint) == 0.0
      and MatrixError(nextLocal,local) == 0.0 and max(abs(nextIds-ids)) == 0 and max(abs(nextOwners-owners)) == 0;
    positions[1,1] := positions[1,1]+1.0;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(firstPoint,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,
      previousRevision=4,graphRevision=5);
    correct := accepted;
    for slot in 1:slots loop
      correct := correct and max(abs(nextPoint[slot,:]-expected[slot,:]
        -(if owners[slot] == 1 then {1.0,0.0,0.0} else zeros(dimension)))) < 1e-12;
    end for;
    passed[6] := correct; positions[1,1] := 2.0;
    enabled[nodes] := false;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    correct := accepted and pruned == div(slots,2) and projected == div(slots,2);
    for slot in 1:slots loop
      if owners[slot] == nodes then
        correct := correct and nextOccupied[slot] == 0.0 and nextIds[slot] == 0 and nextOwners[slot] == 0
          and max(abs(nextPoint[slot,:])) == 0.0 and max(abs(nextLocal[slot,:])) == 0.0;
      else correct := correct and max(abs(nextPoint[slot,:]-expected[slot,:])) < 1e-12; end if;
    end for;
    passed[7] := correct; enabled[nodes] := true;
    nodeIds[nodes] := 2000;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    correct := accepted and pruned == div(slots,2) and projected == div(slots,2);
    for slot in 1:slots loop
      if owners[slot] == nodes then
        correct := correct and nextOccupied[slot] == 0.0 and nextIds[slot] == 0 and nextOwners[slot] == 0
          and max(abs(nextPoint[slot,:])) == 0.0 and max(abs(nextLocal[slot,:])) == 0.0;
      else correct := correct and max(abs(nextPoint[slot,:]-expected[slot,:])) < 1e-12; end if;
    end for;
    passed[8] := correct;
    nodeIds[nodes] := 1000+nodes; enabled[nodes] := false;
    rotations[nodes,:,:] := fill(1e101,dimension,dimension); positions[nodes,:] := fill(1e101,dimension);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[9] := accepted and pruned == div(slots,2);
    enabled[nodes] := true; rotations[nodes,:,:] := B; positions[nodes,:] := {-3,1,2};
    changedLocal := local; changedPrevious := previous; changedOccupied := occupied;
    changedIds := ids; changedOwners := owners;
    changedLocal[slots,:] := fill(1e101,dimension); changedPrevious[slots,:] := fill(1e101,dimension);
    changedOccupied[slots] := 0.0; changedIds[slots] := -7; changedOwners[slots] := -9;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(changedPrevious,changedLocal,changedOccupied,changedIds,changedOwners,
      enabled,nodeIds,positions,rotations);
    passed[10] := accepted and projected == slots-1 and nextOccupied[slots] == 0.0
      and max(abs(nextPoint[slots,:])) == 0.0 and nextIds[slots] == 0 and nextOwners[slots] == 0;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,changedLocal,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[11] := reason == 5 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,changedLocal,occupied,ids,owners);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(changedPrevious,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[12] := reason == 5 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,changedPrevious,local,occupied,ids,owners);
    changedOccupied := occupied; changedOccupied[slots] := 0.5;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,changedOccupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[13] := reason == 5 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,changedOccupied,ids,owners);
    changedOwners := owners; changedOwners[slots] := nodes+1;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,changedOwners,enabled,nodeIds,positions,rotations);
    passed[14] := reason == 5 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,changedOwners);
    changedIds := ids; changedIds[slots] := 0;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,changedIds,owners,enabled,nodeIds,positions,rotations);
    passed[15] := reason == 5 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,changedIds,owners);
    nodeIds[nodes] := nodeIds[1];
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[16] := reason == 4 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    nodeIds[nodes] := 1000+nodes; rotations[nodes,:,:] := [1,0,0;0,1,0;0,0,-1];
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[17] := reason == 4 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    rotations[nodes,:,:] := B; positions[nodes,:] := fill(1e101,dimension);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[18] := reason == 4 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,changedLocal,occupied,ids,owners,enabled,nodeIds,positions,rotations,requested=false);
    passed[19] := reason == 1 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,changedLocal,occupied,ids,owners);
    positions[nodes,:] := {-3,1,2};
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,graphAccepted=false);
    passed[20] := reason == 3 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,graphGeneration=2);
    passed[21] := reason == 2 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,graphRevision=3);
    correct := reason == 2 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,graphRevision=5);
    passed[22] := correct and reason == 2 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    positions[nodes,:] := {10,0,0};
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,limit=10.0);
    passed[23] := reason == 6 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    positions[nodes,:] := {-3,1,2}; enabled := fill(false,nodes);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[24] := accepted and projected == 0 and pruned == slots
      and MatrixMagnitude(nextPoint) == 0.0 and MatrixMagnitude(nextLocal) == 0.0 and max(nextOccupied) == 0.0
      and max(abs(nextIds)) == 0 and max(abs(nextOwners)) == 0;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,zeros(slots),ids,owners,enabled,nodeIds,positions,rotations);
    passed[25] := accepted and projected == 0 and pruned == 0
      and MatrixMagnitude(nextPoint) == 0.0 and MatrixMagnitude(nextLocal) == 0.0
      and max(abs(nextIds)) == 0 and max(abs(nextOwners)) == 0;
    enabled := fill(true,nodes);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,limit=0.0);
    passed[26] := reason == 2 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    rotations[nodes,:,:] := fill(1e101,dimension,dimension);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations);
    passed[27] := reason == 4 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    rotations[nodes,:,:] := B;
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,generation=0);
    correct := reason == 2 and Retained(nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned,previous,local,occupied,ids,owners);
    (nextPoint,nextLocal,nextOccupied,nextIds,nextOwners,nextRevision,accepted,reason,projected,pruned) := Apply(previous,local,occupied,ids,owners,enabled,nodeIds,positions,rotations,
      previousRevision=RGBDMapAnchors.identifierLimit,graphRevision=RGBDMapAnchors.identifierLimit);
    passed[28] := correct and not accepted and reason == 2
      and nextRevision == RGBDMapAnchors.identifierLimit and MatrixError(nextPoint,previous) == 0.0;
  end Run;
end RGBDMapAnchorTests;
