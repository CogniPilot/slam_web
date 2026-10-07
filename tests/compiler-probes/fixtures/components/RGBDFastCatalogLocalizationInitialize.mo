// One time-zero initialization invocation, then optional catalog/map publication.
// Retained graph proposals are correlated with localization; no graph correction is performed.
model RGBDFastCatalogLocalizationInitialize
  extends RGBDLocalizationCatalogInterface(h=0.0,intervalTime=0.0);
protected
  Boolean transactionAllowed; Boolean imageOn;
  RGBDLocalizationCatalog.Estimator proposed;
  RGBDKeyframes.Frame measurement;
  Boolean frameAccepted; Integer frameRejectionReason;
  RGBDLocalizationOrientation orientation(rotation=result.next.estimator.rotation);
  RGBDFastInertialLocalizationInitialize localization(
    imageTime=intervalTime,initializationRequested=if transactionAllowed then 1.0 else 0.0,
    selectedFeatureLimit=selectedFeatureLimit,absoluteThreshold=absoluteThreshold,
    rgb=rgb,
    depth=depth,
    rgbCalibration=rgbCalibration,
    depthCalibration=depthCalibration,
    disparityNoise=disparityNoise,
    noiseReferenceFx=noiseReferenceFx,
    baseline=baseline,
    opticalToBody=opticalToBody,
    cameraOriginBody=cameraOriginBody,
    accel=accel,
    gyro=gyro,
    gravity=gravity,
    density=density,
    position=previous.estimator.position,
    velocity=previous.estimator.velocity,
    rotation=previous.estimator.rotation,
    accelBias=previous.estimator.accelBias,
    gyroBias=previous.estimator.gyroBias,
    covariance=previous.estimator.covariance,
    crossCovariance=previous.estimator.crossCovariance,
    referenceCovariance=previous.estimator.referenceCovariance,
    referencePosition=previous.estimator.referencePosition,
    referenceRotation=previous.estimator.referenceRotation,
    referenceAvailable=previous.estimator.referenceAvailable,
    referenceEpoch=previous.estimator.referenceEpoch,
    referenceUsed=previous.estimator.referenceUsed,
    lastUsedEpoch=previous.estimator.lastUsedEpoch,
    referenceDescriptor=previous.estimator.referenceDescriptor,
    referencePoint=previous.estimator.referencePoint,
    referenceEnabled=previous.estimator.referenceEnabled,
    referencePixels=previous.estimator.referencePixels,
    referenceCount=previous.estimator.referenceCount,
    referenceRgbCalibration=previous.estimator.referenceRgbCalibration,
    referenceDepthCalibration=previous.estimator.referenceDepthCalibration,
    referenceNoiseReferenceFx=previous.estimator.referenceNoiseReferenceFx,
    referenceDisparityNoise=previous.estimator.referenceDisparityNoise,
    referenceBaseline=previous.estimator.referenceBaseline,
    referenceOpticalToBody=previous.estimator.referenceOpticalToBody,
    referenceCameraOriginBody=previous.estimator.referenceCameraOriginBody,
    currentEpoch=imageEpoch,h=h,
    frameEnabled=if imageOn then 1.0 else 0.0,
    imageCaptureRequested=if imageOn and localCaptureRequested then 1.0 else 0.0);
equation
  transactionAllowed = RGBDLocalizationCatalog.CanAdvance(previous,intervalTime,h,true,requested);
  imageOn = transactionAllowed and imageRequested
    and RGBDLocalizationCatalog.ImageFresh(previous,imageEpoch,intervalTime);
  proposed.position = localization.nextPosition;
  proposed.velocity = localization.nextVelocity;
  proposed.rotation = localization.nextRotation;
  proposed.accelBias = localization.nextAccelBias;
  proposed.gyroBias = localization.nextGyroBias;
  proposed.covariance = localization.nextCovariance;
  proposed.crossCovariance = localization.nextCrossCovariance;
  proposed.referenceCovariance = localization.nextReferenceCovariance;
  proposed.referencePosition = localization.nextReferencePosition;
  proposed.referenceRotation = localization.nextReferenceRotation;
  proposed.referenceAvailable = localization.nextReferenceAvailable;
  proposed.referenceEpoch = localization.nextReferenceEpoch;
  proposed.referenceUsed = localization.nextReferenceUsed;
  proposed.lastUsedEpoch = localization.nextLastUsedEpoch;
  proposed.referenceDescriptor = localization.nextReferenceDescriptor;
  proposed.referencePoint = localization.nextReferencePoint;
  proposed.referenceEnabled = localization.nextReferenceEnabled;
  proposed.referencePixels = localization.nextReferencePixels;
  proposed.referenceCount = localization.nextReferenceCount;
  proposed.referenceRgbCalibration = localization.nextReferenceRgbCalibration;
  proposed.referenceDepthCalibration = localization.nextReferenceDepthCalibration;
  proposed.referenceNoiseReferenceFx = localization.nextReferenceNoiseReferenceFx;
  proposed.referenceDisparityNoise = localization.nextReferenceDisparityNoise;
  proposed.referenceBaseline = localization.nextReferenceBaseline;
  proposed.referenceOpticalToBody = localization.nextReferenceOpticalToBody;
  proposed.referenceCameraOriginBody = localization.nextReferenceCameraOriginBody;
  (measurement,frameAccepted,frameRejectionReason) = RGBDLocalizationFrame.Build(
    previous.generation,previous.catalog.nextId,imageEpoch,imageEpoch,intervalTime,
    localization.currentCount,localization.currentDescriptor,localization.currentPoint,
    localization.currentEnabled,localization.features[:,1:2],{imageHeight,imageWidth},{imageHeight,imageWidth},
    rgbCalibration,depthCalibration,opticalToBody,cameraOriginBody,disparityNoise,noiseReferenceFx,baseline,
    proposed.position,proposed.rotation,proposed.covariance,previous.catalog.vocabularyVersion,
    if localization.frameValid > 0.5 and (localization.observationAccepted > 0.5
      or localization.captureAccepted > 0.5) then 1.0 else 0.0,
    imageOn and localization.initializationAccepted > 0.5);
  result = RGBDLocalizationCatalog.Publish(previous,proposed,measurement,
    localization.initializationAccepted,
    localization.observationAccepted,localization.captureAccepted,imageOn,imageEpoch,intervalTime,h,
    true,frameAccepted,frameRejectionReason,transactionAllowed,
    localization.mapCandidatePoint,localization.mapCandidateEnabled,vocabulary,vocabularyEnabled,
    minimumInterval,maximumInterval,translationThreshold,rotationThreshold,minimumFeatures,
    voxelWidth,mergeRadius,maximumDistance,tentativeLifetime,confirmedLifetime,
    confirmationObservations,maximumConfidence,maximumTentative);
  nextQuaternion = orientation.unitQuaternion;
  selectionValid = localization.selectionValid;
  predictionAccepted = 0.0;
  initializationAccepted = if result.accepted then localization.initializationAccepted else 0.0;
  observationAccepted = if result.accepted then localization.observationAccepted else 0.0;
  captureAccepted = if result.accepted then localization.captureAccepted else 0.0;
  matchCount = if result.imageCompleted then localization.matchCount else 0.0;
  features = if result.imageCompleted then localization.features else zeros(featureCapacity,3);
  featureEnabled = if result.imageCompleted then localization.featureEnabled else zeros(featureCapacity);
  trackingCurrentPixel = if result.imageCompleted then localization.trackingCurrentPixel else zeros(featureCapacity,2);
  trackingReferencePixel = if result.imageCompleted then localization.trackingReferencePixel else zeros(featureCapacity,2);
  trackingEnabled = if result.imageCompleted then localization.trackingEnabled else zeros(featureCapacity);
end RGBDFastCatalogLocalizationInitialize;
