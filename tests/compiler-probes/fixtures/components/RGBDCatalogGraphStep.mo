// Appearance retrieval and calibrated geometric verification in one Modelica
// graph. Per-candidate seeds keep verification independent and replayable.
model RGBDCatalogGraphStep
  parameter Real maximumWordDistanceSquared = 0.8;
  parameter Integer minimumAssignments = 8;
  parameter Real minimumSimilarity = 0.35;
  parameter Real minimumAge = 5.0;
  parameter Integer trials = 96; parameter Integer refinements = 4;
  parameter Integer minimumInliers = 12; parameter Real minimumFraction = 0.5;
  parameter Real inlierDistance = 0.08; parameter Real maximumRms = 0.03;
  parameter Real descriptorRatio = 0.8; parameter Real maximumDescriptorDistance = 0.8;
  parameter Real coordinateLimit = 100.0; parameter Real rankTolerance = 1e-8;
  parameter Real localizationSigma = 0.5; parameter Real depthInflation = 1.0; parameter Real minimumPivot = 1e-10;
  input RGBDKeyframes.Catalog catalog;
  input RGBDGraphMeasurements.State graph;
  input Integer sequentialSeed = 7;
  input RGBDKeyframes.Frame measurement;
  input Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
  input Real vocabularyEnabled[RGBDKeyframes.wordCapacity];
  input Boolean requested = true;
  input Integer seeds[RGBDKeyframeRetrieval.proposalCapacity] = fill(7,RGBDKeyframeRetrieval.proposalCapacity);
  output RGBDCatalogGraphCapture.Result result;
equation
  result = RGBDCatalogGraphCapture.Capture(catalog,measurement,vocabulary,vocabularyEnabled,graph,
    requested,seeds,sequentialSeed,maximumWordDistanceSquared,minimumAssignments,minimumSimilarity,minimumAge,trials,
    refinements,minimumInliers,minimumFraction,inlierDistance,maximumRms,descriptorRatio,maximumDescriptorDistance,
    coordinateLimit,rankTolerance,localizationSigma,depthInflation,minimumPivot);
end RGBDCatalogGraphStep;
