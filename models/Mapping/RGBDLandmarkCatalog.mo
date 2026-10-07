// A catalog proposal changes map geometry before the spatial index is built.
// Stable identities prevent an evicted anchor from merging into its successor.
package RGBDLandmarkCatalog
  function Synchronize
    input Real previousPoint[:,3]; input Real previousOccupied[size(previousPoint,1)];
    input Real previousConfidence[size(previousPoint,1)]; input Real previousLastSeen[size(previousPoint,1)];
    input Real previousLastFrame[size(previousPoint,1)];
    input Real previousLocalPoint[size(previousPoint,1),3];
    input Integer previousAnchorId[size(previousPoint,1)]; input Integer previousAnchorSlot[size(previousPoint,1)];
    input Integer previousGeneration; input Integer previousRevision;
    input Boolean previousNodeEnabled[:]; input Integer previousNodeId[size(previousNodeEnabled,1)];
    input Real previousNodePosition[size(previousNodeEnabled,1),3];
    input Real previousNodeRotation[size(previousNodeEnabled,1),3,3];
    input Boolean nodeEnabled[size(previousNodeEnabled,1)]; input Integer nodeId[size(previousNodeEnabled,1)];
    input Real nodePosition[size(previousNodeEnabled,1),3]; input Real nodeRotation[size(previousNodeEnabled,1),3,3];
    input Integer generation; input Integer revision;
    input Boolean catalogAccepted; input Boolean requested; input Boolean reset;
    input Real previousTime; input Real previousFrame;
    input Real maximumConfidence; input Real coordinateLimit; input Real consistencyTolerance;
    output Real point[size(previousPoint,1),3]; output Real occupied[size(previousPoint,1)];
    output Real confidence[size(previousPoint,1)]; output Real lastSeen[size(previousPoint,1)];
    output Real lastFrame[size(previousPoint,1)]; output Real localPoint[size(previousPoint,1),3];
    output Integer anchorId[size(previousPoint,1)]; output Integer anchorSlot[size(previousPoint,1)];
    output Boolean accepted; output Integer rejectionReason; output Integer correctionReason;
    output Integer projectedCount; output Integer evictedCount;
  protected
    Boolean configuration; Boolean changed; Boolean valid; Boolean slotValid;
    Boolean correctionAccepted; Integer owner; Integer unusedRevision;
    Real reconstructed[3];
  algorithm
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    accepted := false; rejectionReason := 1; correctionReason := 0;
    projectedCount := 0; evictedCount := 0;
    if requested then
      configuration := size(previousPoint,1) >= 1 and size(previousPoint,1) <= RGBDMapAnchors.mapCapacity
        and size(previousNodeEnabled,1) >= 1 and size(previousNodeEnabled,1) <= RGBDMapAnchors.keyframeCapacity
        and previousRevision >= 0 and previousRevision <= RGBDMapAnchors.identifierLimit
        and revision >= 0 and revision <= RGBDMapAnchors.identifierLimit
        and generation >= 1 and generation <= RGBDMapAnchors.identifierLimit
        and ((reset and previousGeneration >= 0 and previousGeneration < RGBDMapAnchors.identifierLimit
          and generation == previousGeneration+1 and revision == 0)
          or (not reset and generation == previousGeneration))
        and coordinateLimit > 0 and coordinateLimit <= 1e6
        and consistencyTolerance > 0 and consistencyTolerance <= 0.01
        and maximumConfidence >= 2 and maximumConfidence <= 100 and floor(maximumConfidence) == maximumConfidence
        and (reset or (previousTime >= 0 and previousTime <= 1e9 and previousFrame >= 0
          and previousFrame <= 1e9 and floor(previousFrame) == previousFrame));
      rejectionReason := 2;
      if configuration then
        rejectionReason := 3;
        if catalogAccepted then
          rejectionReason := 4;
          valid := RGBDMapAnchors.ValidNodes(nodeEnabled,nodeId,nodePosition,nodeRotation,coordinateLimit);
          if not reset then
            valid := valid and RGBDMapAnchors.ValidNodes(previousNodeEnabled,previousNodeId,
              previousNodePosition,previousNodeRotation,coordinateLimit);
          end if;
          if valid then
            changed := reset;
            if not reset then
              for node in 1:size(nodeEnabled,1) loop
                changed := changed or nodeEnabled[node] <> previousNodeEnabled[node];
                if nodeEnabled[node] and previousNodeEnabled[node] then
                  changed := changed or nodeId[node] <> previousNodeId[node];
                  for axis in 1:3 loop
                    changed := changed or nodePosition[node,axis] <> previousNodePosition[node,axis];
                    for column in 1:3 loop
                      changed := changed or nodeRotation[node,axis,column] <> previousNodeRotation[node,axis,column];
                    end for;
                  end for;
                end if;
              end for;
              valid := revision == previousRevision+(if changed then 1 else 0);
            end if;
            rejectionReason := 5;
            if valid then
              // Validate the old geometry against the old catalog before
              // reprojection can hide corruption or pruning can erase it.
              if not reset then
                for slot in 1:size(previousPoint,1) loop
                  if previousOccupied[slot] == 1 then
                    owner := previousAnchorSlot[slot];
                    slotValid := owner >= 1 and owner <= size(previousNodeEnabled,1)
                      and previousAnchorId[slot] >= 1 and previousAnchorId[slot] <= RGBDMapAnchors.identifierLimit
                      and previousConfidence[slot] >= 1 and previousConfidence[slot] <= maximumConfidence
                      and floor(previousConfidence[slot]) == previousConfidence[slot]
                      and previousLastSeen[slot] >= 0 and previousLastSeen[slot] <= previousTime
                      and previousLastFrame[slot] >= 1 and previousLastFrame[slot] <= previousFrame
                      and floor(previousLastFrame[slot]) == previousLastFrame[slot];
                    for axis in 1:3 loop
                      slotValid := slotValid and abs(previousPoint[slot,axis]) <= coordinateLimit
                        and abs(previousLocalPoint[slot,axis]) <= coordinateLimit;
                    end for;
                    if slotValid then
                      slotValid := previousNodeEnabled[owner] and previousNodeId[owner] == previousAnchorId[slot];
                      if slotValid then
                        reconstructed := previousNodeRotation[owner,:,:]*previousLocalPoint[slot,:]+previousNodePosition[owner,:];
                        for axis in 1:3 loop
                          slotValid := slotValid and abs(reconstructed[axis]-previousPoint[slot,axis]) <= consistencyTolerance;
                        end for;
                      end if;
                    end if;
                    valid := valid and slotValid;
                  else valid := valid and previousOccupied[slot] == 0; end if;
                end for;
              end if;
              rejectionReason := 6;
              if valid then
                if reset then
                  point := zeros(size(previousPoint,1),3); occupied := zeros(size(previousPoint,1));
                  confidence := zeros(size(previousPoint,1)); lastSeen := zeros(size(previousPoint,1));
                  lastFrame := zeros(size(previousPoint,1)); localPoint := zeros(size(previousPoint,1),3);
                  anchorId := fill(0,size(previousPoint,1)); anchorSlot := fill(0,size(previousPoint,1));
                  accepted := true;
                elseif changed then
                  (point,localPoint,occupied,anchorId,anchorSlot,unusedRevision,correctionAccepted,correctionReason,
                    projectedCount,evictedCount) := RGBDMapAnchors.Reproject(
                      previousPoint,previousLocalPoint,previousOccupied,previousAnchorId,previousAnchorSlot,
                      previousGeneration,previousRevision,nodeEnabled,nodeId,nodePosition,nodeRotation,
                      generation,revision,true,true,coordinateLimit);
                  accepted := correctionAccepted;
                  if accepted then
                    for slot in 1:size(previousPoint,1) loop
                      if occupied[slot] == 0 then
                        confidence[slot] := 0; lastSeen[slot] := 0; lastFrame[slot] := 0;
                      end if;
                    end for;
                  end if;
                else accepted := true; end if;
                rejectionReason := if accepted then 0 else 7;
              end if;
            end if;
          end if;
        end if;
      end if;
    end if;
    if not accepted then
      point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
      lastSeen := previousLastSeen; lastFrame := previousLastFrame;
      localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
      projectedCount := 0; evictedCount := 0;
    end if;
  end Synchronize;
end RGBDLandmarkCatalog;

function UpdateCatalogLandmarkMap
  extends RGBDLandmarkMapInterface;
  input Real previousLocalPoint[size(previousOccupied,1),3];
  input Integer previousAnchorId[size(previousOccupied,1)]; input Integer previousAnchorSlot[size(previousOccupied,1)];
  input Integer previousGeneration; input Integer previousCatalogRevision;
  input Boolean previousNodeEnabled[:]; input Integer previousNodeId[size(previousNodeEnabled,1)];
  input Real previousNodePosition[size(previousNodeEnabled,1),3];
  input Real previousNodeRotation[size(previousNodeEnabled,1),3,3];
  input Boolean nodeEnabled[size(previousNodeEnabled,1)]; input Integer nodeId[size(previousNodeEnabled,1)];
  input Real nodePosition[size(previousNodeEnabled,1),3]; input Real nodeRotation[size(previousNodeEnabled,1),3,3];
  input Integer catalogGeneration; input Integer catalogRevision;
  input Integer selectedAnchorId; input Integer selectedAnchorSlot;
  input Boolean catalogAccepted; input Boolean requested; input Real consistencyTolerance;
  input Integer previousPoseRevision = previousCatalogRevision;
  input Integer poseRevision = catalogRevision;
  output Real localPoint[size(previousOccupied,1),3];
  output Integer anchorId[size(previousOccupied,1)]; output Integer anchorSlot[size(previousOccupied,1)];
  output Integer nextGeneration; output Integer nextCatalogRevision;
  output Integer catalogRejectionReason; output Integer correctionReason;
  output Real updateRejectionReason; output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer projectedCount; output Integer evictedCount;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  Real preparedPoint[size(previousOccupied,1),3]; Real preparedOccupied[size(previousOccupied,1)];
  Real preparedConfidence[size(previousOccupied,1)]; Real preparedLastSeen[size(previousOccupied,1)];
  Real preparedLastFrame[size(previousOccupied,1)]; Real preparedLocal[size(previousOccupied,1),3];
  Integer preparedId[size(previousOccupied,1)]; Integer preparedSlot[size(previousOccupied,1)]; Boolean prepared;
algorithm
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
  nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
  nextGeneration := previousGeneration; nextCatalogRevision := previousCatalogRevision;
  accepted := 0; rejectionReason := 1; updateRejectionReason := 0; mapRejectionReason := 0; anchorRejectionReason := 0;
  projectedCount := 0; evictedCount := 0; assignedCount := 0; retainedCount := 0; clearedCount := 0;
  insertedCount := 0; mergedCount := 0; prunedCount := 0; droppedCount := 0; invalidCandidateCount := 0;
  (preparedPoint,preparedOccupied,preparedConfidence,preparedLastSeen,preparedLastFrame,
    preparedLocal,preparedId,preparedSlot,prepared,catalogRejectionReason,correctionReason,projectedCount,evictedCount) :=
    RGBDLandmarkCatalog.Synchronize(previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,
      previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,previousPoseRevision,
      previousNodeEnabled,previousNodeId,previousNodePosition,previousNodeRotation,
      nodeEnabled,nodeId,nodePosition,nodeRotation,catalogGeneration,poseRevision,catalogAccepted,requested,
      resetRequested == 1.0,previousTime,previousFrame,maximumConfidence,coordinateLimit,consistencyTolerance);
  if requested then
    rejectionReason := 2;
    if prepared then
      (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,updateRejectionReason,nextTime,nextFrame,nextWorldFrame,
        occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
        localPoint,anchorId,anchorSlot,nextGeneration,mapRejectionReason,anchorRejectionReason,assignedCount,retainedCount,clearedCount) :=
        UpdateAnchoredLandmarkMap(preparedPoint,preparedOccupied,preparedConfidence,preparedLastSeen,preparedLastFrame,
          candidatePoint,candidateEnabled,candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,
          previousWorldFrame,worldFrame,resetRequested,coordinateLimit,voxelWidth,mergeRadius,maximumDistance,
          tentativeLifetime,confirmedLifetime,confirmationObservations,maximumConfidence,maximumTentative,
          preparedLocal,preparedId,preparedSlot,previousGeneration,nodeEnabled,nodeId,nodePosition,nodeRotation,
          catalogGeneration,catalogGeneration,selectedAnchorId,selectedAnchorSlot,true,consistencyTolerance);
      rejectionReason := if accepted == 1.0 then 0 else 3;
      if accepted == 1.0 then
        nextCatalogRevision := catalogRevision;
        prunedCount := prunedCount+evictedCount;
      end if;
    end if;
  end if;
  if accepted <> 1.0 then
    // A later map/anchor failure must undo catalog eviction and reprojection,
    // not merely hold the already prepared geometry.
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
    nextGeneration := previousGeneration; nextCatalogRevision := previousCatalogRevision;
    projectedCount := 0; evictedCount := 0; assignedCount := 0; retainedCount := 0; clearedCount := 0;
    insertedCount := 0; mergedCount := 0; prunedCount := 0; droppedCount := 0; invalidCandidateCount := 0;
    occupiedCount := 0; confirmedCount := 0; tentativeCount := 0;
    for slot in 1:size(previousOccupied,1) loop
      confirmed[slot] := if occupied[slot] == 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
      occupiedCount := occupiedCount+(if occupied[slot] == 1.0 then 1.0 else 0.0);
      confirmedCount := confirmedCount+confirmed[slot];
      tentativeCount := tentativeCount+(if occupied[slot] == 1.0 and confirmed[slot] == 0.0 then 1.0 else 0.0);
    end for;
  end if;
end UpdateCatalogLandmarkMap;
