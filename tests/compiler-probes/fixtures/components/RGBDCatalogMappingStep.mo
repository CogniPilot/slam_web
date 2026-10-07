// One source graph: appearance -> calibrated geometry -> capture/edges -> map.
// These outputs remain proposals for the enclosing inertial/reference owner.
model RGBDCatalogMappingStep
  input RGBDKeyframes.Catalog catalog;
  input RGBDGraphMeasurements.State graph;
  input RGBDCatalogMapping.State map;
  input RGBDKeyframes.Frame measurement;
  input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
  input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
  input Boolean requested = true;
  input Real poseAccepted = 0.0;
  input Integer seeds[RGBDKeyframeRetrieval.proposalCapacity] = fill(7,RGBDKeyframeRetrieval.proposalCapacity);
  input Integer sequentialSeed = 7;
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
protected
  RGBDCatalogGraphCapture.Result visual;
  Real featureMask[RGBDKeyframes.featureCapacity];
  RGBDLandmarkProjection projection(coordinateLimit=coordinateLimit,
    opticalPoint=visual.loopDiagnostics.prepared.opticalPoint,enabled=featureMask,
    activeCount=visual.loopDiagnostics.prepared.count,poseAccepted=poseAccepted,
    bodyRotation=visual.loopDiagnostics.prepared.bodyRotation,bodyPosition=visual.loopDiagnostics.prepared.bodyPosition,
    opticalToBody=visual.loopDiagnostics.prepared.opticalToBody,cameraOriginBody=visual.loopDiagnostics.prepared.cameraOriginBody);
equation
  visual = RGBDCatalogGraphCapture.Capture(catalog,measurement,vocabulary,vocabularyEnabled,graph,
    requested,seeds,sequentialSeed,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge,trials,
    refinements,minimumInliers,minimumFraction,inlierDistance,maximumRms,descriptorRatio,maximumDescriptorDistance,
    registrationCoordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
  for feature in 1:RGBDKeyframes.featureCapacity loop
    featureMask[feature] = if visual.loopDiagnostics.prepared.enabled[feature] then 1.0 else 0.0;
  end for;
  result = RGBDCatalogMapping.Capture(catalog,graph,map,visual,projection.worldPoint,projection.landmarkEnabled,
    poseAccepted,requested,coordinateLimit,voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
    confirmationObservations,maximumConfidence,maximumTentative,consistencyTolerance);
end RGBDCatalogMappingStep;
