model RGBDRobustRegistrationFrame
  constant Integer featureCapacity = 350;
  input Real sourcePoint[featureCapacity,3];
  input Real targetPoint[featureCapacity,3];
  input Real pairEnabled[featureCapacity];
  input Real activeCount = featureCapacity;
  input Real coordinateLimit = 1e6;
  input Real rankTolerance = 1e-8;
  input Real maximumRms = 0.02;
  input Integer maximumHypotheses = 64;
  input Real minimumConsensusFraction = 0.5;
  input Boolean useCovariance = true;
  input Real sourceCovariance[featureCapacity,3,3];
  input Real targetCovariance[featureCapacity,3,3];
  input Real maximumNormalizedSquared = 9.0;
  input Real covarianceMinimumPivot = 1e-10;
  output Real accepted;
  output Real rejectionReason;
  output Real rotation[3,3];
  output Real translation[3];
  output Real validCount;
  output Real invalidCount;
  output Real rank;
  output Real cost;
  output Real rms;
  output Real eigenGap;
  output Real sourceCentroid[3];
  output Real targetCentroid[3];
  output Real finalInlierMask[featureCapacity];
  output Real rejectedCount;
equation
  (accepted,rejectionReason,rotation,translation,validCount,invalidCount,
    rank,cost,rms,eigenGap,sourceCentroid,targetCentroid,finalInlierMask,rejectedCount) =
    FitRigidPointPairsRobust(sourcePoint,targetPoint,pairEnabled,activeCount,
      coordinateLimit,rankTolerance,maximumRms,maximumHypotheses,minimumConsensusFraction,
      useCovariance=useCovariance,sourceCovariance=sourceCovariance,
      targetCovariance=targetCovariance,maximumNormalizedSquared=maximumNormalizedSquared,
      covarianceMinimumPivot=covarianceMinimumPivot);
end RGBDRobustRegistrationFrame;
