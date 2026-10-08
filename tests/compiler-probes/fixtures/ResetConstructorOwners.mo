// Diagnostic roots call the authored constructors at their original capacities.
// They isolate issuance owners; none is a replacement SLAM entry point.
model ResetEstimatorOwner
  constant Integer dimension = RGBDKeyframes.dimension;
  constant Integer currentDimension = RGBDLocalizationFrame.currentDimension;
  input Real position[dimension] = zeros(dimension);
  input Real velocity[dimension] = zeros(dimension);
  input Real rotation[dimension,dimension] = identity(dimension);
  input Real accelBias[dimension] = zeros(dimension);
  input Real gyroBias[dimension] = zeros(dimension);
  input Real covariance[currentDimension,currentDimension] = diagonal({0.25,0.25,0.25,
    0.04,0.04,0.04,0.01,0.01,0.01,0.0004,0.0004,0.0004,0.000025,0.000025,0.000025});
  output RGBDLocalizationCatalog.Estimator next;
equation
  next = RGBDLocalizationCatalog.EmptyEstimator(position,velocity,rotation,accelBias,gyroBias,covariance);
end ResetEstimatorOwner;

model ResetFrameOwner
  output RGBDKeyframes.Frame next;
equation
  next = RGBDKeyframes.EmptyFrame();
end ResetFrameOwner;

model ResetGraphOwner
  input Integer generation = 1;
  output RGBDGraphMeasurements.State next;
equation
  next = RGBDGraphMeasurements.Empty(generation);
end ResetGraphOwner;

model ResetMapOwner
  input Integer generation = 1;
  input Real worldFrame = 0;
  output RGBDCatalogMapping.State next;
equation
  next = RGBDCatalogMapping.Empty(generation,worldFrame);
end ResetMapOwner;

model ResetCatalogOwner
  input Integer generation = 1;
  input Integer vocabularyVersion = 1;
  output RGBDKeyframes.Catalog next;
equation
  next = RGBDKeyframes.Empty(generation,vocabularyVersion);
end ResetCatalogOwner;
