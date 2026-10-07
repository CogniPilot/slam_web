// Every synchronized camera frame enters here, regardless of keyframe cadence.
model RGBDCatalogFrameStep
  input RGBDKeyframes.Catalog catalog;
  input RGBDGraphMeasurements.State graph;
  input RGBDCatalogMapping.State map;
  input RGBDKeyframes.Frame measurement;
  input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
  input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
  input Boolean requested = true "Gate the whole transaction with the camera acquisition/attempt receipt";
  input Boolean imageFresh = false "Fresh catalog acquisition; does not certify independent Schmidt image noise";
  input Real poseAccepted = 0.0;
  input Integer seeds[RGBDKeyframeRetrieval.proposalCapacity] = fill(7,RGBDKeyframeRetrieval.proposalCapacity);
  input Integer sequentialSeed = 7;
  parameter Real minimumInterval = 0.5; parameter Real maximumInterval = 2.0;
  parameter Real translationThreshold = 0.6; parameter Real rotationThreshold = 0.25;
  parameter Integer minimumFeatures = 12;
  parameter Real maximumWordDistanceSquared = 0.8;
  parameter Integer minimumAssignments = 8;
  parameter Real minimumSimilarity = 0.35; parameter Real minimumAge = 5.0;
  parameter Integer trials = 96; parameter Integer refinements = 4;
  parameter Integer minimumInliers = 12; parameter Real minimumFraction = 0.5;
  parameter Real inlierDistance = 0.08; parameter Real maximumRms = 0.03;
  parameter Real descriptorRatio = 0.8; parameter Real maximumDescriptorDistance = 0.8;
  parameter Real rankTolerance = 1e-8;
  parameter Real localizationSigma = 0.5; parameter Real depthInflation = 1.0; parameter Real minimumPivot = 1e-10;
  parameter Real coordinateLimit = 1e6; parameter Real registrationCoordinateLimit = 100.0;
  parameter Real voxelWidth = 0.25; parameter Real mergeRadius = 0.15;
  parameter Real maximumDistance = 80.0;
  parameter Real tentativeLifetime = 0.5; parameter Real confirmedLifetime = 5.0;
  parameter Real confirmationObservations = 3.0; parameter Real maximumConfidence = 8.0;
  parameter Real maximumTentative = 700.0; parameter Real consistencyTolerance = 1e-6;
  output RGBDCatalogMapping.Result result;
  output RGBDKeyframePolicy.Decision decision;
protected
  Real featureMask[RGBDKeyframes.featureCapacity];
  RGBDLandmarkProjection projection(coordinateLimit=coordinateLimit,
    opticalPoint=measurement.opticalPoint,enabled=featureMask,
    activeCount=measurement.count,poseAccepted=poseAccepted,
    bodyRotation=measurement.bodyRotation,bodyPosition=measurement.bodyPosition,
    opticalToBody=measurement.opticalToBody,cameraOriginBody=measurement.cameraOriginBody);
equation
  for feature in 1:RGBDKeyframes.featureCapacity loop
    featureMask[feature] = if measurement.enabled[feature] then 1.0 else 0.0;
  end for;
algorithm
  (result,decision) := RGBDCatalogFrame.Advance(catalog,graph,map,measurement,vocabulary,vocabularyEnabled,
    projection.worldPoint,projection.landmarkEnabled,imageFresh,poseAccepted,requested,
    minimumInterval,maximumInterval,translationThreshold,rotationThreshold,minimumFeatures,
    seeds,sequentialSeed,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge,
    trials,refinements,minimumInliers,minimumFraction,inlierDistance,maximumRms,descriptorRatio,
    maximumDescriptorDistance,registrationCoordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot,
    coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
    confirmationObservations,maximumConfidence,maximumTentative,consistencyTolerance);
end RGBDCatalogFrameStep;
