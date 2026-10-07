// Reference checks use the unchanged full-scan lookup, not another hash table.
package RGBDSpatialIndexTests
  constant Integer capacity = 14400;
  constant Integer featureCapacity = 350;
  constant Real width = 0.25;

  function EmptyHeads
    input Integer head[:];
    output Boolean empty;
  algorithm
    empty := true;
    for bucket in 1:size(head,1) loop
      empty := empty and head[bucket] == 0;
    end for;
  end EmptyHeads;

  function Run
    input Real maskedBackground = 0.0 "Disabled storage is not a measurement";
    input Integer slotCount = capacity "Runtime extent; acceptance uses all 14400 slots";
    input Integer bucketCount = RGBDSpatialIndex.defaultBucketCount;
    output Boolean passed[18];
    output Integer indexedVisits;
    output Integer referenceIterations;
  protected
    Real point[slotCount,3];
    Real occupied[slotCount];
    Integer head[bucketCount];
    Integer collisionHead[128];
    Integer link[slotCount];
    Integer cell[slotCount,3];
    Integer freeNext[slotCount];
    Integer firstFree;
    Integer duplicate;
    Integer referenceDuplicate;
    Integer vacant;
    Integer visited;
    Integer bucket;
    Integer querySlot;
    Integer candidateCell[3];
    Boolean valid;
    Boolean built;
    Boolean linear;
    Real candidate[3];
  algorithm
    passed := fill(false,18);
    indexedVisits := 0;
    referenceIterations := 0;
    point := fill(maskedBackground,slotCount,3);
    occupied := zeros(slotCount);
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    passed[1] := built and firstFree == 1 and freeNext[1] == 2
      and freeNext[slotCount] == 0 and EmptyHeads(head);
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{0,0,0},width,0.15,true);
    passed[2] := valid and duplicate == 0 and visited == 0 and not linear;

    // All real slots are populated. Query all 350 feature positions, including
    // the final map slot, against independent ascending full-scan semantics.
    for slot in 1:slotCount loop
      point[slot,:] := {mod(slot-1,120)*0.5,div(slot-1,120)*0.5,2.0};
      occupied[slot] := 1.0;
    end for;
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    passed[3] := built and firstFree == 0;
    passed[4] := true;
    for feature in 1:featureCapacity loop
      querySlot := if feature == featureCapacity then slotCount else mod(feature*41,slotCount)+1;
      candidate := point[querySlot,:]+{0.01,0.01,0};
      (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
        point,occupied,head,link,cell,candidate,width,0.15,true);
      (referenceDuplicate,vacant) := ReferenceLandmarkMapLookup(point,occupied,candidate,width,0.15,true);
      passed[4] := passed[4] and valid and not linear and duplicate == referenceDuplicate
        and duplicate == querySlot and vacant == 0;
      indexedVisits := indexedVisits+visited;
      referenceIterations := referenceIterations+slotCount;
    end for;
    passed[5] := indexedVisits < referenceIterations/10;
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{0,0,0},0.0,0.15,false);
    passed[6] := valid and duplicate == 0 and visited == 0;

    // All three retained anchors deliberately collide in a 128-bucket table.
    // The target is at the last real slot, behind two nonmatching keys.
    point := fill(maskedBackground,slotCount,3);
    occupied := zeros(slotCount);
    point[1,:] := {0,0,2};
    point[2,:] := {32,0,2};
    point[slotCount,:] := {64,0,2};
    occupied[1] := 1.0;
    occupied[2] := 1.0;
    occupied[slotCount] := 1.0;
    (collisionHead,link,cell,freeNext,firstFree,built) :=
      RGBDSpatialIndex.Build(point,occupied,width,128);
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,collisionHead,link,cell,{64.01,0.01,2},width,0.15,true);
    passed[7] := built and valid and not linear and duplicate == slotCount
      and visited >= 3 and firstFree == 3;
    (candidateCell,valid) := RGBDSpatialIndex.Cell({64.01,0.01,2},width);
    bucket := RGBDSpatialIndex.Bucket(candidateCell,128);
    link[slotCount] := 1;
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,collisionHead,link,cell,{64.01,0.01,2},width,0.15,true);
    passed[8] := not valid and duplicate == 0;
    link[slotCount] := 0;
    collisionHead[bucket] := slotCount+1;
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,collisionHead,link,cell,{64.01,0.01,2},width,0.15,true);
    passed[9] := not valid and duplicate == 0;

    // Radius matching crosses a cell boundary; same-cell matching also retains
    // its original behavior even if the Euclidean separation exceeds radius.
    point := fill(maskedBackground,slotCount,3);
    occupied := zeros(slotCount);
    point[1,:] := {-0.265625,0,2};
    point[slotCount,:] := {-0.01,0.24,2.24};
    occupied[1] := 1.0;
    occupied[slotCount] := 1.0;
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{-0.234375,0,2},width,0.03125,true);
    (referenceDuplicate,vacant) := ReferenceLandmarkMapLookup(point,occupied,{-0.234375,0,2},width,0.03125,true);
    passed[10] := built and valid and duplicate == 1 and duplicate == referenceDuplicate;
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{-0.249,0.01,2.01},width,0.0,true);
    passed[11] := valid and duplicate == slotCount;

    // A higher-numbered same-cell anchor must not hide a lower-numbered radius
    // match in another bucket, even if the same-cell bucket is traversed first.
    point[1,:] := {0.001,0.001,2};
    point[slotCount,:] := {-0.249,-0.249,2};
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{-0.001,-0.001,2},width,0.15,true);
    passed[12] := built and valid and duplicate == 1;
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{0,0,2},width,10.0,true);
    passed[13] := valid and linear and duplicate == 1 and visited == 2;

    // Rebuilding after pruning recycles the lowest available slot; inserting
    // into local index storage makes the new anchor visible immediately.
    occupied[1] := 0.0;
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    passed[14] := built and firstFree == 1 and freeNext[firstFree] == 2;
    point[1,:] := {20,20,2};
    occupied[1] := 1.0;
    (cell[1,:],valid) := RGBDSpatialIndex.Cell(point[1,:],width);
    bucket := RGBDSpatialIndex.Bucket(cell[1,:],size(head,1));
    link[1] := head[bucket];
    head[bucket] := 1;
    firstFree := freeNext[1];
    (duplicate,valid,visited,linear) := RGBDSpatialIndex.Find(
      point,occupied,head,link,cell,{20.01,20.01,2},width,0.15,true);
    passed[15] := valid and duplicate == 1 and firstFree == 2;
    occupied[slotCount] := 0.5;
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    passed[16] := not built and firstFree == 0 and EmptyHeads(head);
    occupied[slotCount] := 1.0;
    point[slotCount,1] := RGBDSpatialIndex.coordinateLimit+1.0;
    (head,link,cell,freeNext,firstFree,built) := RGBDSpatialIndex.Build(point,occupied,width,bucketCount);
    passed[17] := not built and firstFree == 0 and EmptyHeads(head);
    (candidateCell,valid) := RGBDSpatialIndex.Cell({-1e6,1e6,0},0.001);
    bucket := RGBDSpatialIndex.Bucket(candidateCell,RGBDSpatialIndex.maximumBucketCount);
    passed[18] := valid and candidateCell[1] == -1000000000
      and candidateCell[2] == 1000000000 and bucket >= 1
      and bucket <= RGBDSpatialIndex.maximumBucketCount;
  end Run;
end RGBDSpatialIndexTests;
