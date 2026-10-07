// Geometry, observation metadata and keyframe-local anchors share one commit.
// This owner consumes a coherent catalog proposal; catalog/filter/graph commits
// must still be coordinated by the enclosing SLAM transaction.
function UpdateAnchoredLandmarkMap
  extends RGBDLandmarkMapInterface;
  input Real previousLocalPoint[size(previousOccupied,1),3];
  input Integer previousAnchorId[size(previousOccupied,1)];
  input Integer previousAnchorSlot[size(previousOccupied,1)];
  input Integer previousGeneration;
  input Boolean nodeEnabled[:]; input Integer nodeId[size(nodeEnabled,1)];
  input Real nodePosition[size(nodeEnabled,1),3]; input Real nodeRotation[size(nodeEnabled,1),3,3];
  input Integer catalogGeneration; input Integer generation;
  input Integer selectedAnchorId; input Integer selectedAnchorSlot;
  input Boolean requested; input Real consistencyTolerance;
  output Real localPoint[size(previousOccupied,1),3];
  output Integer anchorId[size(previousOccupied,1)]; output Integer anchorSlot[size(previousOccupied,1)];
  output Integer nextGeneration;
  output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  Integer insertedFeature[size(previousOccupied,1)];
  Boolean anchorsAccepted;
algorithm
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
  localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
  nextGeneration := previousGeneration;
  accepted := 0.0; rejectionReason := 1.0; mapRejectionReason := 0.0; anchorRejectionReason := 0;
  assignedCount := 0; retainedCount := 0; clearedCount := 0;
  insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0;
  droppedCount := 0.0; invalidCandidateCount := 0.0;
  if requested then
    (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,mapRejectionReason,nextTime,nextFrame,nextWorldFrame,
      occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
      insertedFeature) := UpdateLandmarkMapWithReceipts(
        previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
        candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
        coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
        maximumConfidence,maximumTentative);
    rejectionReason := 2.0;
    if accepted == 1.0 then
      (localPoint,anchorId,anchorSlot,nextGeneration,anchorsAccepted,anchorRejectionReason,
        assignedCount,retainedCount,clearedCount) := AssignLandmarkAnchors(
          previousPoint,previousOccupied,previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,
          point,occupied,insertedFeature,candidatePoint,candidateEnabled,candidateCount,
          nodeEnabled,nodeId,nodePosition,nodeRotation,catalogGeneration,generation,selectedAnchorId,selectedAnchorSlot,
          true,true,resetRequested == 1.0,coordinateLimit,consistencyTolerance);
      accepted := if anchorsAccepted then 1.0 else 0.0;
      rejectionReason := if anchorsAccepted then 0.0 else 3.0;
    end if;
  end if;
  if accepted <> 1.0 then
    // Even a failure discovered at the final landmark rolls back the map's
    // merges, pruning, insertion and clocks, as well as every anchor field.
    point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
    lastSeen := previousLastSeen; lastFrame := previousLastFrame;
    nextTime := previousTime; nextFrame := previousFrame; nextWorldFrame := previousWorldFrame;
    localPoint := previousLocalPoint; anchorId := previousAnchorId; anchorSlot := previousAnchorSlot;
    nextGeneration := previousGeneration;
    insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0;
    droppedCount := 0.0; invalidCandidateCount := 0.0;
    assignedCount := 0; retainedCount := 0; clearedCount := 0;
    // Accepted counts come directly from the map kernel. Recompute only on
    // rollback so diagnostics cannot describe its discarded tentative state.
    occupiedCount := 0.0; confirmedCount := 0.0; tentativeCount := 0.0;
    for slot in 1:size(previousOccupied,1) loop
      confirmed[slot] := if occupied[slot] == 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
      occupiedCount := occupiedCount+(if occupied[slot] == 1.0 then 1.0 else 0.0);
      confirmedCount := confirmedCount+confirmed[slot];
      tentativeCount := tentativeCount+(if occupied[slot] == 1.0 and confirmed[slot] == 0.0 then 1.0 else 0.0);
    end for;
  end if;
end UpdateAnchoredLandmarkMap;

model RGBDAnchoredLandmarkMap
  constant Integer imageHeight = 90; constant Integer imageWidth = 160;
  constant Integer mapCapacity = imageHeight*imageWidth;
  constant Integer featureCapacity = 350; constant Integer keyframeCapacity = 128;
  constant Integer dimension = 3;
  parameter Real coordinateLimit = 1e6; parameter Real voxelWidth = 0.25;
  parameter Real mergeRadius = 0.15; parameter Real maximumDistance = 80.0;
  parameter Real tentativeLifetime = 0.5; parameter Real confirmedLifetime = 5.0;
  parameter Real confirmationObservations = 3.0; parameter Real maximumConfidence = 8.0;
  parameter Real maximumTentative = 700.0; parameter Real consistencyTolerance = 1e-6;
  input Real previousPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Real previousOccupied[mapCapacity] = zeros(mapCapacity);
  input Real previousConfidence[mapCapacity] = zeros(mapCapacity);
  input Real previousLastSeen[mapCapacity] = zeros(mapCapacity);
  input Real previousLastFrame[mapCapacity] = zeros(mapCapacity);
  input Real candidatePoint[featureCapacity,dimension] = zeros(featureCapacity,dimension);
  input Real candidateEnabled[featureCapacity] = zeros(featureCapacity); input Real candidateCount = 0.0;
  input Real bodyPosition[dimension] = zeros(dimension); input Real poseAccepted = 1.0;
  input Real previousTime = 0.0; input Real timeNow = 0.0;
  input Real previousFrame = 0.0; input Real frameNow = 1.0;
  input Real previousWorldFrame = 0.0; input Real worldFrame = 0.0; input Real resetRequested = 0.0;
  input Real previousLocalPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Integer previousAnchorId[mapCapacity] = fill(0,mapCapacity);
  input Integer previousAnchorSlot[mapCapacity] = fill(0,mapCapacity); input Integer previousGeneration = 1;
  input Boolean nodeEnabled[keyframeCapacity] = fill(false,keyframeCapacity);
  input Integer nodeId[keyframeCapacity] = fill(0,keyframeCapacity);
  input Real nodePosition[keyframeCapacity,dimension] = zeros(keyframeCapacity,dimension);
  input Real nodeRotation[keyframeCapacity,dimension,dimension] = zeros(keyframeCapacity,dimension,dimension);
  input Integer catalogGeneration = 1; input Integer generation = 1;
  input Integer selectedAnchorId = 0; input Integer selectedAnchorSlot = 0; input Boolean requested = true;
  output Real point[mapCapacity,dimension]; output Real occupied[mapCapacity];
  output Real confidence[mapCapacity]; output Real lastSeen[mapCapacity]; output Real lastFrame[mapCapacity];
  output Real confirmed[mapCapacity]; output Real accepted; output Real rejectionReason;
  output Real nextTime; output Real nextFrame; output Real nextWorldFrame;
  output Real occupiedCount; output Real confirmedCount; output Real tentativeCount;
  output Real insertedCount; output Real mergedCount; output Real prunedCount;
  output Real droppedCount; output Real invalidCandidateCount;
  output Real localPoint[mapCapacity,dimension]; output Integer anchorId[mapCapacity];
  output Integer anchorSlot[mapCapacity]; output Integer nextGeneration;
  output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
equation
  (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,rejectionReason,nextTime,nextFrame,nextWorldFrame,
    occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
    localPoint,anchorId,anchorSlot,nextGeneration,mapRejectionReason,anchorRejectionReason,
    assignedCount,retainedCount,clearedCount) = UpdateAnchoredLandmarkMap(
      previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,candidatePoint,candidateEnabled,
      candidateCount,bodyPosition,poseAccepted,previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
      coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
      maximumConfidence,maximumTentative,previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,
      nodeEnabled,nodeId,nodePosition,nodeRotation,catalogGeneration,generation,selectedAnchorId,selectedAnchorSlot,
      requested,consistencyTolerance);
end RGBDAnchoredLandmarkMap;
