// Frozen pre-index Modelica implementation; differential tests only.
// Original source SHA-256: 110ecb3c5ddb053e498268c6cea722a3a9921c10c50b3c3f718df63ec4c7842a
// Exact ordered slot lookup. The first occupied spatial duplicate wins;
// otherwise the first free slot wins. No address or hash collision hides a slot.
function ReferenceLandmarkMapLookup
  input Real points[:,:];
  input Real occupied[:];
  input Real candidate[3];
  input Real voxelWidth;
  input Real mergeRadius;
  input Boolean searchEnabled;
  output Integer duplicate;
  output Integer vacant;
protected
  Real safePoint[3];
  Real difference[3];
  Boolean sameVoxel;
  Boolean present;
algorithm
  duplicate := 0;
  vacant := 0;
  safePoint := zeros(3); difference := zeros(3);
  sameVoxel := false; present := false;
  for slot in 1:size(occupied,1) loop
    present := searchEnabled and occupied[slot] > 0.5;
    vacant := if searchEnabled and occupied[slot] < 0.5 and vacant == 0 then slot else vacant;
    safePoint := if present then points[slot,:] else zeros(3);
    difference := if present then safePoint-candidate else zeros(3);
    sameVoxel := floor(safePoint[1]/voxelWidth) == floor(candidate[1]/voxelWidth)
      and floor(safePoint[2]/voxelWidth) == floor(candidate[2]/voxelWidth)
      and floor(safePoint[3]/voxelWidth) == floor(candidate[3]/voxelWidth);
    duplicate := if present and duplicate == 0 and (sameVoxel
      or difference[1]*difference[1]+difference[2]*difference[2]+difference[3]*difference[3] <= mergeRadius*mergeRadius)
      then slot else duplicate;
  end for;
end ReferenceLandmarkMapLookup;

// Persistent state is explicit: callers retain only accepted next-state outputs.
// All coordinates are in one unchanged world ENU frame. Points come from
// RGBDLandmarkProjection and bodyPosition is estimated, never ground truth.
function ReferenceUpdateLandmarkMap
  input Real previousPoint[:,:];
  input Real previousOccupied[:];
  input Real previousConfidence[:];
  input Real previousLastSeen[:];
  input Real previousLastFrame[:];
  input Real candidatePoint[:,:];
  input Real candidateEnabled[:];
  input Real candidateCount;
  input Real bodyPosition[3];
  input Real poseAccepted;
  input Real previousTime;
  input Real timeNow;
  input Real previousFrame;
  input Real frameNow;
  input Real previousWorldFrame;
  input Real worldFrame;
  input Real resetRequested;
  input Real coordinateLimit;
  input Real voxelWidth;
  input Real mergeRadius;
  input Real maximumDistance;
  input Real tentativeLifetime;
  input Real confirmedLifetime;
  input Real confirmationObservations;
  input Real maximumConfidence;
  input Real maximumTentative;
  output Real point[size(previousOccupied,1),3];
  output Real occupied[size(previousOccupied,1)];
  output Real confidence[size(previousOccupied,1)];
  output Real lastSeen[size(previousOccupied,1)];
  output Real lastFrame[size(previousOccupied,1)];
  output Real confirmed[size(previousOccupied,1)];
  output Real accepted;
  output Real rejectionReason;
  output Real nextTime;
  output Real nextFrame;
  output Real nextWorldFrame;
  output Real occupiedCount;
  output Real confirmedCount;
  output Real tentativeCount;
  output Real insertedCount;
  output Real mergedCount;
  output Real prunedCount;
  output Real droppedCount;
  output Real invalidCandidateCount;
protected
  Boolean configurationValid;
  Boolean stateValid;
  Boolean slotValid;
  Boolean reset;
  Boolean present;
  Boolean keep;
  Boolean candidateValid;
  Boolean insert;
  Boolean merge;
  Real safeCandidate[3];
  Real difference[3];
  Real distanceSquared;
  Real lifetime;
  Real safeVoxelWidth;
  Integer duplicate;
  Integer vacant;
  Integer destination;
algorithm
  reset := resetRequested >= 1.0 and resetRequested <= 1.0;
  slotValid := false; present := false; keep := false;
  candidateValid := false; insert := false; merge := false;
  safeCandidate := zeros(3); difference := zeros(3);
  distanceSquared := 0.0; lifetime := 0.0;
  duplicate := 0; vacant := 0; destination := 1;
  confirmed := zeros(size(previousOccupied,1));
  configurationValid := size(previousPoint,1) == size(previousOccupied,1) and size(previousPoint,2) == 3
    and size(previousConfidence,1) == size(previousOccupied,1) and size(previousLastSeen,1) == size(previousOccupied,1)
    and size(previousLastFrame,1) == size(previousOccupied,1) and size(candidatePoint,1) == size(candidateEnabled,1)
    and size(candidatePoint,2) == 3 and size(previousOccupied,1) > 0
    and coordinateLimit > 0.0 and coordinateLimit <= 1e6 and voxelWidth >= 0.001 and voxelWidth <= 10.0
    and mergeRadius >= 0.0 and mergeRadius <= 10.0 and maximumDistance > 0.0 and maximumDistance <= 1e4
    and tentativeLifetime > 0.0 and tentativeLifetime <= 1e4 and confirmedLifetime >= tentativeLifetime and confirmedLifetime <= 1e4
    and confirmationObservations >= 2.0 and confirmationObservations <= maximumConfidence and floor(confirmationObservations) == confirmationObservations
    and maximumConfidence <= 100.0 and floor(maximumConfidence) == maximumConfidence
    and maximumTentative >= 0.0 and maximumTentative <= size(previousOccupied,1) and floor(maximumTentative) == maximumTentative
    and candidateCount >= 0.0 and candidateCount <= size(candidateEnabled,1) and floor(candidateCount) == candidateCount
    and poseAccepted >= 1.0 and poseAccepted <= 1.0
    and abs(bodyPosition[1]) <= coordinateLimit and abs(bodyPosition[2]) <= coordinateLimit and abs(bodyPosition[3]) <= coordinateLimit
    and timeNow >= 0.0 and timeNow <= 1e9
    and worldFrame >= 0.0 and worldFrame <= 1e9 and floor(worldFrame) == worldFrame
    and ((reset and frameNow == 1.0) or (resetRequested >= 0.0 and resetRequested <= 0.0
      and previousTime >= 0.0 and previousTime < timeNow and previousTime <= 1e9
      and previousFrame >= 0.0 and previousFrame < 1e9 and floor(previousFrame) == previousFrame and frameNow == previousFrame+1.0
      and previousWorldFrame == worldFrame));
  stateValid := true;
  for slot in 1:size(previousOccupied,1) loop
    slotValid := previousOccupied[slot] >= 0.0 and previousOccupied[slot] <= 0.0
      or (previousOccupied[slot] >= 1.0 and previousOccupied[slot] <= 1.0
        and abs(previousPoint[slot,1]) <= coordinateLimit and abs(previousPoint[slot,2]) <= coordinateLimit and abs(previousPoint[slot,3]) <= coordinateLimit
        and previousConfidence[slot] >= 1.0 and previousConfidence[slot] <= maximumConfidence and floor(previousConfidence[slot]) == previousConfidence[slot]
        and previousLastSeen[slot] >= 0.0 and previousLastSeen[slot] <= previousTime
        and previousLastFrame[slot] >= 1.0 and previousLastFrame[slot] <= previousFrame and floor(previousLastFrame[slot]) == previousLastFrame[slot]);
    stateValid := stateValid and (reset or slotValid);
  end for;
  accepted := if configurationValid and stateValid then 1.0 else 0.0;
  rejectionReason := if not configurationValid then 1.0 else if not stateValid then 2.0 else 0.0;
  point := previousPoint; occupied := previousOccupied; confidence := previousConfidence;
  lastSeen := previousLastSeen; lastFrame := previousLastFrame;
  nextTime := if accepted > 0.5 then timeNow else previousTime;
  nextFrame := if accepted > 0.5 then frameNow else previousFrame;
  nextWorldFrame := if accepted > 0.5 then worldFrame else previousWorldFrame;
  insertedCount := 0.0; mergedCount := 0.0; prunedCount := 0.0; droppedCount := 0.0; invalidCandidateCount := 0.0;
  tentativeCount := 0.0;
  // Prune before insertion. Empty storage is canonicalized only on acceptance.
  for slot in 1:size(previousOccupied,1) loop
    present := accepted > 0.5 and not reset and previousOccupied[slot] > 0.5;
    difference := if present then previousPoint[slot,:]-bodyPosition else zeros(3);
    distanceSquared := difference[1]*difference[1]+difference[2]*difference[2]+difference[3]*difference[3];
    lifetime := if present and previousConfidence[slot] >= confirmationObservations then confirmedLifetime else tentativeLifetime;
    keep := present and timeNow-previousLastSeen[slot] <= lifetime and distanceSquared <= maximumDistance*maximumDistance;
    prunedCount := prunedCount+(if present and not keep then 1.0 else 0.0);
    point[slot,:] := if accepted > 0.5 and not keep then zeros(3) else point[slot,:];
    occupied[slot] := if accepted > 0.5 then (if keep then 1.0 else 0.0) else occupied[slot];
    confidence[slot] := if accepted > 0.5 and not keep then 0.0 else confidence[slot];
    lastSeen[slot] := if accepted > 0.5 and not keep then 0.0 else lastSeen[slot];
    lastFrame[slot] := if accepted > 0.5 and not keep then 0.0 else lastFrame[slot];
    tentativeCount := tentativeCount+(if keep and confidence[slot] < confirmationObservations then 1.0 else 0.0);
  end for;
  safeVoxelWidth := if accepted > 0.5 then voxelWidth else 1.0;
  // Raster candidate order is stable, including sparse final slots. Repeated
  // candidates in one frame never count as independent confirmation evidence.
  for feature in 1:size(candidateEnabled,1) loop
    candidateValid := accepted > 0.5 and feature <= candidateCount and candidateEnabled[feature] >= 1.0 and candidateEnabled[feature] <= 1.0
      and abs(candidatePoint[feature,1]) <= coordinateLimit and abs(candidatePoint[feature,2]) <= coordinateLimit and abs(candidatePoint[feature,3]) <= coordinateLimit;
    invalidCandidateCount := invalidCandidateCount+(if accepted > 0.5 and feature <= candidateCount
      and not (candidateEnabled[feature] >= 0.0 and candidateEnabled[feature] <= 0.0) and not candidateValid then 1.0 else 0.0);
    safeCandidate := if candidateValid then candidatePoint[feature,:] else zeros(3);
    difference := if candidateValid then safeCandidate-bodyPosition else zeros(3);
    distanceSquared := difference[1]*difference[1]+difference[2]*difference[2]+difference[3]*difference[3];
    candidateValid := candidateValid and distanceSquared <= maximumDistance*maximumDistance;
    (duplicate,vacant) := ReferenceLandmarkMapLookup(point,occupied,safeCandidate,safeVoxelWidth,mergeRadius,candidateValid);
    merge := candidateValid and duplicate > 0;
    insert := candidateValid and duplicate == 0 and vacant > 0 and tentativeCount < maximumTentative;
    destination := if duplicate > 0 then duplicate else if vacant > 0 then vacant else 1;
    tentativeCount := tentativeCount+(if insert then 1.0 else if merge and lastFrame[destination] < frameNow
      and confidence[destination] < confirmationObservations and confidence[destination]+1.0 >= confirmationObservations then -1.0 else 0.0);
    point[destination,:] := if insert then safeCandidate else point[destination,:];
    occupied[destination] := if insert then 1.0 else occupied[destination];
    confidence[destination] := if insert then 1.0 else if merge and lastFrame[destination] < frameNow
      then min(maximumConfidence,confidence[destination]+1.0) else confidence[destination];
    lastSeen[destination] := if insert or merge then timeNow else lastSeen[destination];
    lastFrame[destination] := if insert or merge then frameNow else lastFrame[destination];
    insertedCount := insertedCount+(if insert then 1.0 else 0.0);
    mergedCount := mergedCount+(if merge then 1.0 else 0.0);
    droppedCount := droppedCount+(if candidateValid and not insert and not merge then 1.0 else 0.0);
  end for;
  occupiedCount := 0.0; confirmedCount := 0.0; tentativeCount := 0.0;
  for slot in 1:size(previousOccupied,1) loop
    confirmed[slot] := if occupied[slot] >= 1.0 and occupied[slot] <= 1.0 and confidence[slot] >= confirmationObservations then 1.0 else 0.0;
    occupiedCount := occupiedCount+(if occupied[slot] >= 1.0 and occupied[slot] <= 1.0 then 1.0 else 0.0);
    confirmedCount := confirmedCount+confirmed[slot];
    tentativeCount := tentativeCount+(if occupied[slot] >= 1.0 and occupied[slot] <= 1.0 and confirmed[slot] < 0.5 then 1.0 else 0.0);
  end for;
end ReferenceUpdateLandmarkMap;

