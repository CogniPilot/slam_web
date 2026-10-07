// Projection, full keyframe capture and persistent map ownership share a
// Modelica graph. It is not yet the complete estimator/loop-closure transaction.
model RGBDKeyframeLandmarkStep
  constant Integer imageHeight = 90; constant Integer imageWidth = 160;
  constant Integer mapCapacity = imageHeight*imageWidth;
  constant Integer featureCapacity = 350; constant Integer dimension = 3;
  parameter Real coordinateLimit = 1e6; parameter Real voxelWidth = 0.25;
  parameter Real mergeRadius = 0.15; parameter Real maximumDistance = 80.0;
  parameter Real tentativeLifetime = 0.5; parameter Real confirmedLifetime = 5.0;
  parameter Real confirmationObservations = 3.0; parameter Real maximumConfidence = 8.0;
  parameter Real maximumTentative = 700.0; parameter Real consistencyTolerance = 1e-6;
  input RGBDKeyframes.Catalog previousCatalog;
  input RGBDKeyframes.Frame measurement;
  input Integer imageEpoch = 0; input Integer generation = 1;
  input Boolean captureRequested = true; input Boolean requested = true;
  input Real previousPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Real previousOccupied[mapCapacity] = zeros(mapCapacity);
  input Real previousConfidence[mapCapacity] = zeros(mapCapacity);
  input Real previousLastSeen[mapCapacity] = zeros(mapCapacity);
  input Real previousLastFrame[mapCapacity] = zeros(mapCapacity);
  input Real previousLocalPoint[mapCapacity,dimension] = zeros(mapCapacity,dimension);
  input Integer previousAnchorId[mapCapacity] = fill(0,mapCapacity);
  input Integer previousAnchorSlot[mapCapacity] = fill(0,mapCapacity);
  input Integer previousGeneration = 1; input Integer previousCatalogRevision = 0;
  input Real poseAccepted = 0.0; input Real previousTime = 0.0; input Real timeNow = 0.0;
  input Real previousFrame = 0.0; input Real frameNow = 1.0;
  input Real previousWorldFrame = 0.0; input Real worldFrame = 0.0; input Real resetRequested = 0.0;
  output RGBDKeyframes.Catalog nextCatalog;
  output Real point[mapCapacity,dimension]; output Real occupied[mapCapacity];
  output Real confidence[mapCapacity]; output Real lastSeen[mapCapacity]; output Real lastFrame[mapCapacity];
  output Real confirmed[mapCapacity]; output Real accepted; output Real rejectionReason;
  output Real nextTime; output Real nextFrame; output Real nextWorldFrame;
  output Real occupiedCount; output Real confirmedCount; output Real tentativeCount;
  output Real insertedCount; output Real mergedCount; output Real prunedCount;
  output Real droppedCount; output Real invalidCandidateCount;
  output Real localPoint[mapCapacity,dimension]; output Integer anchorId[mapCapacity];
  output Integer anchorSlot[mapCapacity]; output Integer nextGeneration; output Integer nextCatalogRevision;
  output Boolean captureAccepted; output Integer storedSlot; output Integer evictedId;
  output Integer measurementRejectionReason; output Integer catalogRejectionReason; output Integer correctionReason;
  output Real catalogUpdateRejectionReason; output Real updateRejectionReason;
  output Real mapRejectionReason; output Integer anchorRejectionReason;
  output Integer projectedCount; output Integer evictedCount;
  output Integer assignedCount; output Integer retainedCount; output Integer clearedCount;
protected
  Real featureMask[featureCapacity];
  RGBDLandmarkProjection projection(coordinateLimit=coordinateLimit,
    opticalPoint=measurement.opticalPoint,enabled=featureMask,activeCount=measurement.count,poseAccepted=poseAccepted,
    bodyRotation=measurement.bodyRotation,bodyPosition=measurement.bodyPosition,
    opticalToBody=measurement.opticalToBody,cameraOriginBody=measurement.cameraOriginBody);
equation
  for feature in 1:featureCapacity loop featureMask[feature] = if measurement.enabled[feature] then 1.0 else 0.0; end for;
  (point,occupied,confidence,lastSeen,lastFrame,confirmed,accepted,rejectionReason,nextTime,nextFrame,nextWorldFrame,
    occupiedCount,confirmedCount,tentativeCount,insertedCount,mergedCount,prunedCount,droppedCount,invalidCandidateCount,
    nextCatalog,localPoint,anchorId,anchorSlot,nextGeneration,nextCatalogRevision,captureAccepted,storedSlot,evictedId,
    measurementRejectionReason,catalogRejectionReason,correctionReason,catalogUpdateRejectionReason,
    updateRejectionReason,mapRejectionReason,anchorRejectionReason,projectedCount,evictedCount,
    assignedCount,retainedCount,clearedCount) = UpdateKeyframeLandmarks(
      previousPoint,previousOccupied,previousConfidence,previousLastSeen,previousLastFrame,
      projection.worldPoint,projection.landmarkEnabled,measurement.count,measurement.bodyPosition,poseAccepted,
      previousTime,timeNow,previousFrame,frameNow,previousWorldFrame,worldFrame,resetRequested,
      coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,confirmationObservations,
      maximumConfidence,maximumTentative,previousCatalog,measurement,imageEpoch,generation,captureRequested,requested,
      previousLocalPoint,previousAnchorId,previousAnchorSlot,previousGeneration,previousCatalogRevision,consistencyTolerance);
end RGBDKeyframeLandmarkStep;
