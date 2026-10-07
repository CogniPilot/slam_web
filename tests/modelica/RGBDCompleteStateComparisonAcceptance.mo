// Independent mutation controls for the test-only full State value comparator.
// No production producer/serializer/ABI. One actual fresh State and one mutable
// copy; each field is changed, compared, restored and compared before the next.
package RGBDCompleteStateComparisonReference
  constant Integer mutationCount = 176;
  constant Integer policyCount = 30;
  function Run
    input Real clock;
    output Boolean checks[mutationCount,2]; output Boolean policies[policyCount]; output Real raw[4];
  protected
    RGBDGraphProcessing.State original; RGBDGraphProcessing.State changed;
    Real savedReal; Integer savedInteger; Boolean savedBoolean;
    Integer detected; Integer restored;
    Real infinity; Real negativeInfinity; Real nanValue; Real positiveZero; Real negativeZero;
    Real anchorSaved; Real selectedSaved; Integer integerSaved; Boolean booleanSaved;
    Integer integerHigh; Integer integerNext;
  algorithm
    original := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator({0.7,-1.2,2.3},{0.1,-0.2,0.3},[0,-1,0;1,0,0;0,0,1],zeros(3),zeros(3),
        diagonal({0.25,0.25,0.25,0.04,0.04,0.04,0.01,0.01,0.01,0.0004,0.0004,0.0004,0.000025,0.000025,0.000025})),7,11,13,0));
    changed := original;
    checks := fill(false,mutationCount,2); policies := fill(false,policyCount);
    detected := 0; restored := 0; savedReal := 0; savedInteger := 0; savedBoolean := false;
    for field in 1:mutationCount loop
      if field == 1 then
        // RGBDLocalizationCatalog.Estimator.position
        savedReal := changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 2 then
        // RGBDLocalizationCatalog.Estimator.velocity
        savedReal := changed.estimator.localization.estimator.velocity[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.velocity[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 3 then
        // RGBDLocalizationCatalog.Estimator.rotation
        savedReal := changed.estimator.localization.estimator.rotation[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.rotation[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 4 then
        // RGBDLocalizationCatalog.Estimator.accelBias
        savedReal := changed.estimator.localization.estimator.accelBias[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.accelBias[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 5 then
        // RGBDLocalizationCatalog.Estimator.gyroBias
        savedReal := changed.estimator.localization.estimator.gyroBias[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.gyroBias[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 6 then
        // RGBDLocalizationCatalog.Estimator.covariance
        savedReal := changed.estimator.localization.estimator.covariance[RGBDLocalizationCatalog.currentDimension,RGBDLocalizationCatalog.currentDimension];
        changed.estimator.localization.estimator.covariance[RGBDLocalizationCatalog.currentDimension,RGBDLocalizationCatalog.currentDimension] := savedReal + 1.0;
      elseif field == 7 then
        // RGBDLocalizationCatalog.Estimator.crossCovariance
        savedReal := changed.estimator.localization.estimator.crossCovariance[RGBDLocalizationCatalog.currentDimension,RGBDLocalizationCatalog.referenceDimension];
        changed.estimator.localization.estimator.crossCovariance[RGBDLocalizationCatalog.currentDimension,RGBDLocalizationCatalog.referenceDimension] := savedReal + 1.0;
      elseif field == 8 then
        // RGBDLocalizationCatalog.Estimator.referenceCovariance
        savedReal := changed.estimator.localization.estimator.referenceCovariance[RGBDLocalizationCatalog.referenceDimension,RGBDLocalizationCatalog.referenceDimension];
        changed.estimator.localization.estimator.referenceCovariance[RGBDLocalizationCatalog.referenceDimension,RGBDLocalizationCatalog.referenceDimension] := savedReal + 1.0;
      elseif field == 9 then
        // RGBDLocalizationCatalog.Estimator.referencePosition
        savedReal := changed.estimator.localization.estimator.referencePosition[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.referencePosition[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 10 then
        // RGBDLocalizationCatalog.Estimator.referenceRotation
        savedReal := changed.estimator.localization.estimator.referenceRotation[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.referenceRotation[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 11 then
        // RGBDLocalizationCatalog.Estimator.referenceAvailable
        savedReal := changed.estimator.localization.estimator.referenceAvailable;
        changed.estimator.localization.estimator.referenceAvailable := savedReal + 1.0;
      elseif field == 12 then
        // RGBDLocalizationCatalog.Estimator.referenceEpoch
        savedReal := changed.estimator.localization.estimator.referenceEpoch;
        changed.estimator.localization.estimator.referenceEpoch := savedReal + 1.0;
      elseif field == 13 then
        // RGBDLocalizationCatalog.Estimator.referenceUsed
        savedReal := changed.estimator.localization.estimator.referenceUsed;
        changed.estimator.localization.estimator.referenceUsed := savedReal + 1.0;
      elseif field == 14 then
        // RGBDLocalizationCatalog.Estimator.lastUsedEpoch
        savedReal := changed.estimator.localization.estimator.lastUsedEpoch;
        changed.estimator.localization.estimator.lastUsedEpoch := savedReal + 1.0;
      elseif field == 15 then
        // RGBDLocalizationCatalog.Estimator.referenceDescriptor
        savedReal := changed.estimator.localization.estimator.referenceDescriptor[RGBDLocalizationCatalog.featureCapacity,RGBDLocalizationCatalog.descriptorSize];
        changed.estimator.localization.estimator.referenceDescriptor[RGBDLocalizationCatalog.featureCapacity,RGBDLocalizationCatalog.descriptorSize] := savedReal + 1.0;
      elseif field == 16 then
        // RGBDLocalizationCatalog.Estimator.referencePoint
        savedReal := changed.estimator.localization.estimator.referencePoint[RGBDLocalizationCatalog.featureCapacity,RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.referencePoint[RGBDLocalizationCatalog.featureCapacity,RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 17 then
        // RGBDLocalizationCatalog.Estimator.referenceEnabled
        savedReal := changed.estimator.localization.estimator.referenceEnabled[RGBDLocalizationCatalog.featureCapacity];
        changed.estimator.localization.estimator.referenceEnabled[RGBDLocalizationCatalog.featureCapacity] := savedReal + 1.0;
      elseif field == 18 then
        // RGBDLocalizationCatalog.Estimator.referencePixels
        savedReal := changed.estimator.localization.estimator.referencePixels[RGBDLocalizationCatalog.featureCapacity,2];
        changed.estimator.localization.estimator.referencePixels[RGBDLocalizationCatalog.featureCapacity,2] := savedReal + 1.0;
      elseif field == 19 then
        // RGBDLocalizationCatalog.Estimator.referenceCount
        savedReal := changed.estimator.localization.estimator.referenceCount;
        changed.estimator.localization.estimator.referenceCount := savedReal + 1.0;
      elseif field == 20 then
        // RGBDLocalizationCatalog.Estimator.referenceRgbCalibration
        savedReal := changed.estimator.localization.estimator.referenceRgbCalibration[4];
        changed.estimator.localization.estimator.referenceRgbCalibration[4] := savedReal + 1.0;
      elseif field == 21 then
        // RGBDLocalizationCatalog.Estimator.referenceDepthCalibration
        savedReal := changed.estimator.localization.estimator.referenceDepthCalibration[4];
        changed.estimator.localization.estimator.referenceDepthCalibration[4] := savedReal + 1.0;
      elseif field == 22 then
        // RGBDLocalizationCatalog.Estimator.referenceNoiseReferenceFx
        savedReal := changed.estimator.localization.estimator.referenceNoiseReferenceFx;
        changed.estimator.localization.estimator.referenceNoiseReferenceFx := savedReal + 1.0;
      elseif field == 23 then
        // RGBDLocalizationCatalog.Estimator.referenceDisparityNoise
        savedReal := changed.estimator.localization.estimator.referenceDisparityNoise;
        changed.estimator.localization.estimator.referenceDisparityNoise := savedReal + 1.0;
      elseif field == 24 then
        // RGBDLocalizationCatalog.Estimator.referenceBaseline
        savedReal := changed.estimator.localization.estimator.referenceBaseline;
        changed.estimator.localization.estimator.referenceBaseline := savedReal + 1.0;
      elseif field == 25 then
        // RGBDLocalizationCatalog.Estimator.referenceOpticalToBody
        savedReal := changed.estimator.localization.estimator.referenceOpticalToBody[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.referenceOpticalToBody[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 26 then
        // RGBDLocalizationCatalog.Estimator.referenceCameraOriginBody
        savedReal := changed.estimator.localization.estimator.referenceCameraOriginBody[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.referenceCameraOriginBody[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 27 then
        // RGBDKeyframes.Catalog.generation
        savedInteger := changed.estimator.localization.catalog.generation;
        changed.estimator.localization.catalog.generation := savedInteger + 1;
      elseif field == 28 then
        // RGBDKeyframes.Catalog.vocabularyVersion
        savedInteger := changed.estimator.localization.catalog.vocabularyVersion;
        changed.estimator.localization.catalog.vocabularyVersion := savedInteger + 1;
      elseif field == 29 then
        // RGBDKeyframes.Catalog.nextId
        savedInteger := changed.estimator.localization.catalog.nextId;
        changed.estimator.localization.catalog.nextId := savedInteger + 1;
      elseif field == 30 then
        // RGBDKeyframes.Catalog.nextSlot
        savedInteger := changed.estimator.localization.catalog.nextSlot;
        changed.estimator.localization.catalog.nextSlot := savedInteger + 1;
      elseif field == 31 then
        // RGBDKeyframes.Catalog.lastEpoch
        savedInteger := changed.estimator.localization.catalog.lastEpoch;
        changed.estimator.localization.catalog.lastEpoch := savedInteger + 1;
      elseif field == 32 then
        // RGBDKeyframes.Catalog.lastTime
        savedReal := changed.estimator.localization.catalog.lastTime;
        changed.estimator.localization.catalog.lastTime := savedReal + 1.0;
      elseif field == 33 then
        // RGBDKeyframes.Catalog.occupied
        savedBoolean := changed.estimator.localization.catalog.occupied[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.occupied[RGBDKeyframes.keyframeCapacity] := not savedBoolean;
      elseif field == 34 then
        // RGBDKeyframes.Catalog.generations
        savedInteger := changed.estimator.localization.catalog.generations[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.generations[RGBDKeyframes.keyframeCapacity] := savedInteger + 1;
      elseif field == 35 then
        // RGBDKeyframes.Catalog.ids
        savedInteger := changed.estimator.localization.catalog.ids[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.ids[RGBDKeyframes.keyframeCapacity] := savedInteger + 1;
      elseif field == 36 then
        // RGBDKeyframes.Catalog.epochs
        savedInteger := changed.estimator.localization.catalog.epochs[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.epochs[RGBDKeyframes.keyframeCapacity] := savedInteger + 1;
      elseif field == 37 then
        // RGBDKeyframes.Catalog.imageTimes
        savedReal := changed.estimator.localization.catalog.imageTimes[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.imageTimes[RGBDKeyframes.keyframeCapacity] := savedReal + 1.0;
      elseif field == 38 then
        // RGBDKeyframes.Catalog.counts
        savedInteger := changed.estimator.localization.catalog.counts[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.counts[RGBDKeyframes.keyframeCapacity] := savedInteger + 1;
      elseif field == 39 then
        // RGBDKeyframes.Catalog.featureEnabled
        savedBoolean := changed.estimator.localization.catalog.featureEnabled[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity];
        changed.estimator.localization.catalog.featureEnabled[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity] := not savedBoolean;
      elseif field == 40 then
        // RGBDKeyframes.Catalog.descriptors
        savedReal := changed.estimator.localization.catalog.descriptors[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize];
        changed.estimator.localization.catalog.descriptors[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize] := savedReal + 1.0;
      elseif field == 41 then
        // RGBDKeyframes.Catalog.opticalPoints
        savedReal := changed.estimator.localization.catalog.opticalPoints[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension];
        changed.estimator.localization.catalog.opticalPoints[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension] := savedReal + 1.0;
      elseif field == 42 then
        // RGBDKeyframes.Catalog.pixelCoordinates
        savedInteger := changed.estimator.localization.catalog.pixelCoordinates[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,2];
        changed.estimator.localization.catalog.pixelCoordinates[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,2] := savedInteger + 1;
      elseif field == 43 then
        // RGBDKeyframes.Catalog.rgbSizes
        savedInteger := changed.estimator.localization.catalog.rgbSizes[RGBDKeyframes.keyframeCapacity,2];
        changed.estimator.localization.catalog.rgbSizes[RGBDKeyframes.keyframeCapacity,2] := savedInteger + 1;
      elseif field == 44 then
        // RGBDKeyframes.Catalog.depthSizes
        savedInteger := changed.estimator.localization.catalog.depthSizes[RGBDKeyframes.keyframeCapacity,2];
        changed.estimator.localization.catalog.depthSizes[RGBDKeyframes.keyframeCapacity,2] := savedInteger + 1;
      elseif field == 45 then
        // RGBDKeyframes.Catalog.rgbCalibrations
        savedReal := changed.estimator.localization.catalog.rgbCalibrations[RGBDKeyframes.keyframeCapacity,4];
        changed.estimator.localization.catalog.rgbCalibrations[RGBDKeyframes.keyframeCapacity,4] := savedReal + 1.0;
      elseif field == 46 then
        // RGBDKeyframes.Catalog.depthCalibrations
        savedReal := changed.estimator.localization.catalog.depthCalibrations[RGBDKeyframes.keyframeCapacity,4];
        changed.estimator.localization.catalog.depthCalibrations[RGBDKeyframes.keyframeCapacity,4] := savedReal + 1.0;
      elseif field == 47 then
        // RGBDKeyframes.Catalog.opticalToBodyRotations
        savedReal := changed.estimator.localization.catalog.opticalToBodyRotations[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension,RGBDKeyframes.dimension];
        changed.estimator.localization.catalog.opticalToBodyRotations[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension,RGBDKeyframes.dimension] := savedReal + 1.0;
      elseif field == 48 then
        // RGBDKeyframes.Catalog.cameraOriginsBody
        savedReal := changed.estimator.localization.catalog.cameraOriginsBody[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension];
        changed.estimator.localization.catalog.cameraOriginsBody[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension] := savedReal + 1.0;
      elseif field == 49 then
        // RGBDKeyframes.Catalog.disparityNoises
        savedReal := changed.estimator.localization.catalog.disparityNoises[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.disparityNoises[RGBDKeyframes.keyframeCapacity] := savedReal + 1.0;
      elseif field == 50 then
        // RGBDKeyframes.Catalog.noiseReferenceFocals
        savedReal := changed.estimator.localization.catalog.noiseReferenceFocals[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.noiseReferenceFocals[RGBDKeyframes.keyframeCapacity] := savedReal + 1.0;
      elseif field == 51 then
        // RGBDKeyframes.Catalog.baselines
        savedReal := changed.estimator.localization.catalog.baselines[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.baselines[RGBDKeyframes.keyframeCapacity] := savedReal + 1.0;
      elseif field == 52 then
        // RGBDKeyframes.Catalog.bodyRotations
        savedReal := changed.estimator.localization.catalog.bodyRotations[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension,RGBDKeyframes.dimension];
        changed.estimator.localization.catalog.bodyRotations[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension,RGBDKeyframes.dimension] := savedReal + 1.0;
      elseif field == 53 then
        // RGBDKeyframes.Catalog.bodyPositions
        savedReal := changed.estimator.localization.catalog.bodyPositions[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension];
        changed.estimator.localization.catalog.bodyPositions[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension] := savedReal + 1.0;
      elseif field == 54 then
        // RGBDKeyframes.Catalog.poseCovariances
        savedReal := changed.estimator.localization.catalog.poseCovariances[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.poseDimension,RGBDKeyframes.poseDimension];
        changed.estimator.localization.catalog.poseCovariances[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.poseDimension,RGBDKeyframes.poseDimension] := savedReal + 1.0;
      elseif field == 55 then
        // RGBDKeyframes.Catalog.vocabularyVersions
        savedInteger := changed.estimator.localization.catalog.vocabularyVersions[RGBDKeyframes.keyframeCapacity];
        changed.estimator.localization.catalog.vocabularyVersions[RGBDKeyframes.keyframeCapacity] := savedInteger + 1;
      elseif field == 56 then
        // RGBDKeyframes.Catalog.histograms
        savedReal := changed.estimator.localization.catalog.histograms[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity];
        changed.estimator.localization.catalog.histograms[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity] := savedReal + 1.0;
      elseif field == 57 then
        // RGBDGraphMeasurements.Edge.enabled
        savedBoolean := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].enabled;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].enabled := not savedBoolean;
      elseif field == 58 then
        // RGBDGraphMeasurements.Edge.id
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].id;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].id := savedInteger + 1;
      elseif field == 59 then
        // RGBDGraphMeasurements.Edge.kind
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].kind;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].kind := savedInteger + 1;
      elseif field == 60 then
        // RGBDGraphMeasurements.Edge.referenceId
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceId;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceId := savedInteger + 1;
      elseif field == 61 then
        // RGBDGraphMeasurements.Edge.currentId
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentId;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentId := savedInteger + 1;
      elseif field == 62 then
        // RGBDGraphMeasurements.Edge.referenceSlot
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceSlot;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceSlot := savedInteger + 1;
      elseif field == 63 then
        // RGBDGraphMeasurements.Edge.currentSlot
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentSlot;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentSlot := savedInteger + 1;
      elseif field == 64 then
        // RGBDGraphMeasurements.Edge.referenceEpoch
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceEpoch;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceEpoch := savedInteger + 1;
      elseif field == 65 then
        // RGBDGraphMeasurements.Edge.currentEpoch
        savedInteger := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentEpoch;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentEpoch := savedInteger + 1;
      elseif field == 66 then
        // RGBDGraphMeasurements.Edge.rotation
        savedReal := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].rotation[RGBDGraphMeasurements.dimension,RGBDGraphMeasurements.dimension];
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].rotation[RGBDGraphMeasurements.dimension,RGBDGraphMeasurements.dimension] := savedReal + 1.0;
      elseif field == 67 then
        // RGBDGraphMeasurements.Edge.translation
        savedReal := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].translation[RGBDGraphMeasurements.dimension];
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].translation[RGBDGraphMeasurements.dimension] := savedReal + 1.0;
      elseif field == 68 then
        // RGBDGraphMeasurements.Edge.covariance
        savedReal := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].covariance[RGBDGraphMeasurements.poseDimension,RGBDGraphMeasurements.poseDimension];
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].covariance[RGBDGraphMeasurements.poseDimension,RGBDGraphMeasurements.poseDimension] := savedReal + 1.0;
      elseif field == 69 then
        // RGBDGraphMeasurements.Edge.information
        savedReal := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].information[RGBDGraphMeasurements.poseDimension,RGBDGraphMeasurements.poseDimension];
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].information[RGBDGraphMeasurements.poseDimension,RGBDGraphMeasurements.poseDimension] := savedReal + 1.0;
      elseif field == 70 then
        // RGBDGraphMeasurements.State.generation
        savedInteger := changed.estimator.localization.graph.generation;
        changed.estimator.localization.graph.generation := savedInteger + 1;
      elseif field == 71 then
        // RGBDGraphMeasurements.State.revision
        savedInteger := changed.estimator.localization.graph.revision;
        changed.estimator.localization.graph.revision := savedInteger + 1;
      elseif field == 72 then
        // RGBDGraphMeasurements.State.lastCaptureId
        savedInteger := changed.estimator.localization.graph.lastCaptureId;
        changed.estimator.localization.graph.lastCaptureId := savedInteger + 1;
      elseif field == 73 then
        // RGBDGraphMeasurements.State.nextEdgeId
        savedInteger := changed.estimator.localization.graph.nextEdgeId;
        changed.estimator.localization.graph.nextEdgeId := savedInteger + 1;
      elseif field == 74 then
        // RGBDGraphMeasurements.State.edges
        savedBoolean := changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].enabled;
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].enabled := not savedBoolean;
      elseif field == 75 then
        // RGBDCatalogMapping.State.point
        savedReal := changed.estimator.localization.map.point[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension];
        changed.estimator.localization.map.point[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension] := savedReal + 1.0;
      elseif field == 76 then
        // RGBDCatalogMapping.State.occupied
        savedReal := changed.estimator.localization.map.occupied[RGBDCatalogMapping.mapCapacity];
        changed.estimator.localization.map.occupied[RGBDCatalogMapping.mapCapacity] := savedReal + 1.0;
      elseif field == 77 then
        // RGBDCatalogMapping.State.confidence
        savedReal := changed.estimator.localization.map.confidence[RGBDCatalogMapping.mapCapacity];
        changed.estimator.localization.map.confidence[RGBDCatalogMapping.mapCapacity] := savedReal + 1.0;
      elseif field == 78 then
        // RGBDCatalogMapping.State.lastSeen
        savedReal := changed.estimator.localization.map.lastSeen[RGBDCatalogMapping.mapCapacity];
        changed.estimator.localization.map.lastSeen[RGBDCatalogMapping.mapCapacity] := savedReal + 1.0;
      elseif field == 79 then
        // RGBDCatalogMapping.State.lastFrame
        savedReal := changed.estimator.localization.map.lastFrame[RGBDCatalogMapping.mapCapacity];
        changed.estimator.localization.map.lastFrame[RGBDCatalogMapping.mapCapacity] := savedReal + 1.0;
      elseif field == 80 then
        // RGBDCatalogMapping.State.localPoint
        savedReal := changed.estimator.localization.map.localPoint[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension];
        changed.estimator.localization.map.localPoint[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension] := savedReal + 1.0;
      elseif field == 81 then
        // RGBDCatalogMapping.State.anchorId
        savedInteger := changed.estimator.localization.map.anchorId[RGBDCatalogMapping.mapCapacity];
        changed.estimator.localization.map.anchorId[RGBDCatalogMapping.mapCapacity] := savedInteger + 1;
      elseif field == 82 then
        // RGBDCatalogMapping.State.anchorSlot
        savedInteger := changed.estimator.localization.map.anchorSlot[RGBDCatalogMapping.mapCapacity];
        changed.estimator.localization.map.anchorSlot[RGBDCatalogMapping.mapCapacity] := savedInteger + 1;
      elseif field == 83 then
        // RGBDCatalogMapping.State.generation
        savedInteger := changed.estimator.localization.map.generation;
        changed.estimator.localization.map.generation := savedInteger + 1;
      elseif field == 84 then
        // RGBDCatalogMapping.State.catalogRevision
        savedInteger := changed.estimator.localization.map.catalogRevision;
        changed.estimator.localization.map.catalogRevision := savedInteger + 1;
      elseif field == 85 then
        // RGBDCatalogMapping.State.imageTime
        savedReal := changed.estimator.localization.map.imageTime;
        changed.estimator.localization.map.imageTime := savedReal + 1.0;
      elseif field == 86 then
        // RGBDCatalogMapping.State.imageEpoch
        savedInteger := changed.estimator.localization.map.imageEpoch;
        changed.estimator.localization.map.imageEpoch := savedInteger + 1;
      elseif field == 87 then
        // RGBDCatalogMapping.State.frame
        savedReal := changed.estimator.localization.map.frame;
        changed.estimator.localization.map.frame := savedReal + 1.0;
      elseif field == 88 then
        // RGBDCatalogMapping.State.worldFrame
        savedReal := changed.estimator.localization.map.worldFrame;
        changed.estimator.localization.map.worldFrame := savedReal + 1.0;
      elseif field == 89 then
        // RGBDLocalizationCatalog.ReferenceBirth.generation
        savedInteger := changed.estimator.localization.referenceBirth.generation;
        changed.estimator.localization.referenceBirth.generation := savedInteger + 1;
      elseif field == 90 then
        // RGBDLocalizationCatalog.ReferenceBirth.epoch
        savedInteger := changed.estimator.localization.referenceBirth.epoch;
        changed.estimator.localization.referenceBirth.epoch := savedInteger + 1;
      elseif field == 91 then
        // RGBDLocalizationCatalog.ReferenceBirth.sequence
        savedInteger := changed.estimator.localization.referenceBirth.sequence;
        changed.estimator.localization.referenceBirth.sequence := savedInteger + 1;
      elseif field == 92 then
        // RGBDLocalizationCatalog.ReferenceBirth.catalogId
        savedInteger := changed.estimator.localization.referenceBirth.catalogId;
        changed.estimator.localization.referenceBirth.catalogId := savedInteger + 1;
      elseif field == 93 then
        // RGBDLocalizationCatalog.State.estimator
        savedReal := changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 94 then
        // RGBDLocalizationCatalog.State.catalog
        savedInteger := changed.estimator.localization.catalog.generation;
        changed.estimator.localization.catalog.generation := savedInteger + 1;
      elseif field == 95 then
        // RGBDLocalizationCatalog.State.graph
        savedInteger := changed.estimator.localization.graph.generation;
        changed.estimator.localization.graph.generation := savedInteger + 1;
      elseif field == 96 then
        // RGBDLocalizationCatalog.State.map
        savedReal := changed.estimator.localization.map.point[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension];
        changed.estimator.localization.map.point[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension] := savedReal + 1.0;
      elseif field == 97 then
        // RGBDLocalizationCatalog.State.generation
        savedInteger := changed.estimator.localization.generation;
        changed.estimator.localization.generation := savedInteger + 1;
      elseif field == 98 then
        // RGBDLocalizationCatalog.State.sourceRevision
        savedInteger := changed.estimator.localization.sourceRevision;
        changed.estimator.localization.sourceRevision := savedInteger + 1;
      elseif field == 99 then
        // RGBDLocalizationCatalog.State.initialized
        savedBoolean := changed.estimator.localization.initialized;
        changed.estimator.localization.initialized := not savedBoolean;
      elseif field == 100 then
        // RGBDLocalizationCatalog.State.predictionTime
        savedReal := changed.estimator.localization.predictionTime;
        changed.estimator.localization.predictionTime := savedReal + 1.0;
      elseif field == 101 then
        // RGBDLocalizationCatalog.State.steps
        savedInteger := changed.estimator.localization.steps;
        changed.estimator.localization.steps := savedInteger + 1;
      elseif field == 102 then
        // RGBDLocalizationCatalog.State.lastProcessedImageEpoch
        savedInteger := changed.estimator.localization.lastProcessedImageEpoch;
        changed.estimator.localization.lastProcessedImageEpoch := savedInteger + 1;
      elseif field == 103 then
        // RGBDLocalizationCatalog.State.lastProcessedImageTime
        savedReal := changed.estimator.localization.lastProcessedImageTime;
        changed.estimator.localization.lastProcessedImageTime := savedReal + 1.0;
      elseif field == 104 then
        // RGBDLocalizationCatalog.State.referenceBirth
        savedInteger := changed.estimator.localization.referenceBirth.generation;
        changed.estimator.localization.referenceBirth.generation := savedInteger + 1;
      elseif field == 105 then
        // RGBDGraphEstimatorCommit.PoseView.generation
        savedInteger := changed.estimator.poses.generation;
        changed.estimator.poses.generation := savedInteger + 1;
      elseif field == 106 then
        // RGBDGraphEstimatorCommit.PoseView.sourceRevision
        savedInteger := changed.estimator.poses.sourceRevision;
        changed.estimator.poses.sourceRevision := savedInteger + 1;
      elseif field == 107 then
        // RGBDGraphEstimatorCommit.PoseView.revision
        savedInteger := changed.estimator.poses.revision;
        changed.estimator.poses.revision := savedInteger + 1;
      elseif field == 108 then
        // RGBDGraphEstimatorCommit.PoseView.catalogNextId
        savedInteger := changed.estimator.poses.catalogNextId;
        changed.estimator.poses.catalogNextId := savedInteger + 1;
      elseif field == 109 then
        // RGBDGraphEstimatorCommit.PoseView.enabled
        savedBoolean := changed.estimator.poses.enabled[RGBDGraphEstimatorCommit.nodeCapacity];
        changed.estimator.poses.enabled[RGBDGraphEstimatorCommit.nodeCapacity] := not savedBoolean;
      elseif field == 110 then
        // RGBDGraphEstimatorCommit.PoseView.ids
        savedInteger := changed.estimator.poses.ids[RGBDGraphEstimatorCommit.nodeCapacity];
        changed.estimator.poses.ids[RGBDGraphEstimatorCommit.nodeCapacity] := savedInteger + 1;
      elseif field == 111 then
        // RGBDGraphEstimatorCommit.PoseView.positions
        savedReal := changed.estimator.poses.positions[RGBDGraphEstimatorCommit.nodeCapacity,RGBDGraphEstimatorCommit.dimension];
        changed.estimator.poses.positions[RGBDGraphEstimatorCommit.nodeCapacity,RGBDGraphEstimatorCommit.dimension] := savedReal + 1.0;
      elseif field == 112 then
        // RGBDGraphEstimatorCommit.PoseView.rotations
        savedReal := changed.estimator.poses.rotations[RGBDGraphEstimatorCommit.nodeCapacity,RGBDGraphEstimatorCommit.dimension,RGBDGraphEstimatorCommit.dimension];
        changed.estimator.poses.rotations[RGBDGraphEstimatorCommit.nodeCapacity,RGBDGraphEstimatorCommit.dimension,RGBDGraphEstimatorCommit.dimension] := savedReal + 1.0;
      elseif field == 113 then
        // RGBDGraphEstimatorCommit.State.localization
        savedReal := changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 114 then
        // RGBDGraphEstimatorCommit.State.poses
        savedInteger := changed.estimator.poses.generation;
        changed.estimator.poses.generation := savedInteger + 1;
      elseif field == 115 then
        // RGBDGraphEstimatorCommit.State.correctionRevision
        savedInteger := changed.estimator.correctionRevision;
        changed.estimator.correctionRevision := savedInteger + 1;
      elseif field == 116 then
        // RGBDGraphEstimatorCommit.State.graphRevisionUsed
        savedInteger := changed.estimator.graphRevisionUsed;
        changed.estimator.graphRevisionUsed := savedInteger + 1;
      elseif field == 117 then
        // RGBDVisualVocabulary.State.generation
        savedInteger := changed.vocabulary.generation;
        changed.vocabulary.generation := savedInteger + 1;
      elseif field == 118 then
        // RGBDVisualVocabulary.State.sourceRevision
        savedInteger := changed.vocabulary.sourceRevision;
        changed.vocabulary.sourceRevision := savedInteger + 1;
      elseif field == 119 then
        // RGBDVisualVocabulary.State.version
        savedInteger := changed.vocabulary.version;
        changed.vocabulary.version := savedInteger + 1;
      elseif field == 120 then
        // RGBDVisualVocabulary.State.words
        savedReal := changed.vocabulary.words[RGBDVisualVocabulary.vocabularyCapacity,RGBDVisualVocabulary.descriptorSize];
        changed.vocabulary.words[RGBDVisualVocabulary.vocabularyCapacity,RGBDVisualVocabulary.descriptorSize] := savedReal + 1.0;
      elseif field == 121 then
        // RGBDVisualVocabulary.State.enabled
        savedReal := changed.vocabulary.enabled[RGBDVisualVocabulary.vocabularyCapacity];
        changed.vocabulary.enabled[RGBDVisualVocabulary.vocabularyCapacity] := savedReal + 1.0;
      elseif field == 122 then
        // RGBDVisualVocabulary.State.count
        savedInteger := changed.vocabulary.count;
        changed.vocabulary.count := savedInteger + 1;
      elseif field == 123 then
        // RGBDVisualVocabulary.State.ready
        savedBoolean := changed.vocabulary.ready;
        changed.vocabulary.ready := not savedBoolean;
      elseif field == 124 then
        // RGBDGraphCaptureLedger.State.generation
        savedInteger := changed.captures.generation;
        changed.captures.generation := savedInteger + 1;
      elseif field == 125 then
        // RGBDGraphCaptureLedger.State.sourceRevision
        savedInteger := changed.captures.sourceRevision;
        changed.captures.sourceRevision := savedInteger + 1;
      elseif field == 126 then
        // RGBDGraphCaptureLedger.State.catalogNextId
        savedInteger := changed.captures.catalogNextId;
        changed.captures.catalogNextId := savedInteger + 1;
      elseif field == 127 then
        // RGBDGraphCaptureLedger.State.lastStep
        savedInteger := changed.captures.lastStep;
        changed.captures.lastStep := savedInteger + 1;
      elseif field == 128 then
        // RGBDGraphCaptureLedger.State.ids
        savedInteger := changed.captures.ids[RGBDGraphCaptureLedger.capacity];
        changed.captures.ids[RGBDGraphCaptureLedger.capacity] := savedInteger + 1;
      elseif field == 129 then
        // RGBDGraphCaptureLedger.State.epochs
        savedInteger := changed.captures.epochs[RGBDGraphCaptureLedger.capacity];
        changed.captures.epochs[RGBDGraphCaptureLedger.capacity] := savedInteger + 1;
      elseif field == 130 then
        // RGBDGraphCaptureLedger.State.sequences
        savedInteger := changed.captures.sequences[RGBDGraphCaptureLedger.capacity];
        changed.captures.sequences[RGBDGraphCaptureLedger.capacity] := savedInteger + 1;
      elseif field == 131 then
        // RGBDGraphCaptureLedger.State.times
        savedReal := changed.captures.times[RGBDGraphCaptureLedger.capacity];
        changed.captures.times[RGBDGraphCaptureLedger.capacity] := savedReal + 1.0;
      elseif field == 132 then
        // SchmidtGraphPoseCorrection.Attempt.generation
        savedInteger := changed.attempt.generation;
        changed.attempt.generation := savedInteger + 1;
      elseif field == 133 then
        // SchmidtGraphPoseCorrection.Attempt.graphRevision
        savedInteger := changed.attempt.graphRevision;
        changed.attempt.graphRevision := savedInteger + 1;
      elseif field == 134 then
        // SchmidtGraphPoseCorrection.Attempt.factorProvenance
        savedInteger := changed.attempt.factorProvenance;
        changed.attempt.factorProvenance := savedInteger + 1;
      elseif field == 135 then
        // RGBDGraphAnchorBound.Binding.generation
        savedInteger := changed.anchor.binding.generation;
        changed.anchor.binding.generation := savedInteger + 1;
      elseif field == 136 then
        // RGBDGraphAnchorBound.Binding.sourceRevision
        savedInteger := changed.anchor.binding.sourceRevision;
        changed.anchor.binding.sourceRevision := savedInteger + 1;
      elseif field == 137 then
        // RGBDGraphAnchorBound.Binding.id
        savedInteger := changed.anchor.binding.id;
        changed.anchor.binding.id := savedInteger + 1;
      elseif field == 138 then
        // RGBDGraphAnchorBound.Binding.slot
        savedInteger := changed.anchor.binding.slot;
        changed.anchor.binding.slot := savedInteger + 1;
      elseif field == 139 then
        // RGBDGraphAnchorBound.Binding.epoch
        savedInteger := changed.anchor.binding.epoch;
        changed.anchor.binding.epoch := savedInteger + 1;
      elseif field == 140 then
        // RGBDGraphAnchorBound.Binding.sequence
        savedInteger := changed.anchor.binding.sequence;
        changed.anchor.binding.sequence := savedInteger + 1;
      elseif field == 141 then
        // RGBDGraphAnchorBound.Binding.catalogPoseRevision
        savedInteger := changed.anchor.binding.catalogPoseRevision;
        changed.anchor.binding.catalogPoseRevision := savedInteger + 1;
      elseif field == 142 then
        // RGBDGraphAnchorBound.Binding.provenance
        savedInteger := changed.anchor.binding.provenance;
        changed.anchor.binding.provenance := savedInteger + 1;
      elseif field == 143 then
        // RGBDGraphAnchorBound.Binding.imageTime
        savedReal := changed.anchor.binding.imageTime;
        changed.anchor.binding.imageTime := savedReal + 1.0;
      elseif field == 144 then
        // RGBDGraphAnchorBound.Estimate.binding
        savedInteger := changed.anchor.binding.generation;
        changed.anchor.binding.generation := savedInteger + 1;
      elseif field == 145 then
        // RGBDGraphAnchorBound.Estimate.position
        savedReal := changed.anchor.position[RGBDGraphAnchorBound.dimension];
        changed.anchor.position[RGBDGraphAnchorBound.dimension] := savedReal + 1.0;
      elseif field == 146 then
        // RGBDGraphAnchorBound.Estimate.rotation
        savedReal := changed.anchor.rotation[RGBDGraphAnchorBound.dimension,RGBDGraphAnchorBound.dimension];
        changed.anchor.rotation[RGBDGraphAnchorBound.dimension,RGBDGraphAnchorBound.dimension] := savedReal + 1.0;
      elseif field == 147 then
        // RGBDGraphAnchorBound.Estimate.bound
        savedReal := changed.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension];
        changed.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension] := savedReal + 1.0;
      elseif field == 148 then
        // GraphGaugeUncertainty.Binding.generation
        savedInteger := changed.selected.binding.generation;
        changed.selected.binding.generation := savedInteger + 1;
      elseif field == 149 then
        // GraphGaugeUncertainty.Binding.graphRevision
        savedInteger := changed.selected.binding.graphRevision;
        changed.selected.binding.graphRevision := savedInteger + 1;
      elseif field == 150 then
        // GraphGaugeUncertainty.Binding.catalogPoseRevision
        savedInteger := changed.selected.binding.catalogPoseRevision;
        changed.selected.binding.catalogPoseRevision := savedInteger + 1;
      elseif field == 151 then
        // GraphGaugeUncertainty.Binding.anchorId
        savedInteger := changed.selected.binding.anchorId;
        changed.selected.binding.anchorId := savedInteger + 1;
      elseif field == 152 then
        // GraphGaugeUncertainty.Binding.anchorEpoch
        savedInteger := changed.selected.binding.anchorEpoch;
        changed.selected.binding.anchorEpoch := savedInteger + 1;
      elseif field == 153 then
        // GraphGaugeUncertainty.Binding.anchorCaptureSequence
        savedInteger := changed.selected.binding.anchorCaptureSequence;
        changed.selected.binding.anchorCaptureSequence := savedInteger + 1;
      elseif field == 154 then
        // GraphGaugeUncertainty.Binding.currentId
        savedInteger := changed.selected.binding.currentId;
        changed.selected.binding.currentId := savedInteger + 1;
      elseif field == 155 then
        // GraphGaugeUncertainty.Binding.currentEpoch
        savedInteger := changed.selected.binding.currentEpoch;
        changed.selected.binding.currentEpoch := savedInteger + 1;
      elseif field == 156 then
        // GraphGaugeUncertainty.Binding.currentCaptureSequence
        savedInteger := changed.selected.binding.currentCaptureSequence;
        changed.selected.binding.currentCaptureSequence := savedInteger + 1;
      elseif field == 157 then
        // GraphGaugeUncertainty.Binding.referenceId
        savedInteger := changed.selected.binding.referenceId;
        changed.selected.binding.referenceId := savedInteger + 1;
      elseif field == 158 then
        // GraphGaugeUncertainty.Binding.referenceEpoch
        savedInteger := changed.selected.binding.referenceEpoch;
        changed.selected.binding.referenceEpoch := savedInteger + 1;
      elseif field == 159 then
        // GraphGaugeUncertainty.Binding.referenceCaptureSequence
        savedInteger := changed.selected.binding.referenceCaptureSequence;
        changed.selected.binding.referenceCaptureSequence := savedInteger + 1;
      elseif field == 160 then
        // GraphGaugeUncertainty.Binding.chart
        savedInteger := changed.selected.binding.chart;
        changed.selected.binding.chart := savedInteger + 1;
      elseif field == 161 then
        // GraphGaugeUncertainty.Binding.anchorTime
        savedReal := changed.selected.binding.anchorTime;
        changed.selected.binding.anchorTime := savedReal + 1.0;
      elseif field == 162 then
        // GraphGaugeUncertainty.Binding.currentTime
        savedReal := changed.selected.binding.currentTime;
        changed.selected.binding.currentTime := savedReal + 1.0;
      elseif field == 163 then
        // GraphGaugeUncertainty.Binding.referenceTime
        savedReal := changed.selected.binding.referenceTime;
        changed.selected.binding.referenceTime := savedReal + 1.0;
      elseif field == 164 then
        // GraphGaugeUncertainty.Binding.sourceRevision
        savedInteger := changed.selected.binding.sourceRevision;
        changed.selected.binding.sourceRevision := savedInteger + 1;
      elseif field == 165 then
        // GraphGaugeUncertainty.Binding.factorProvenance
        savedInteger := changed.selected.binding.factorProvenance;
        changed.selected.binding.factorProvenance := savedInteger + 1;
      elseif field == 166 then
        // GraphGaugeUncertainty.Binding.anchorBoundProvenance
        savedInteger := changed.selected.binding.anchorBoundProvenance;
        changed.selected.binding.anchorBoundProvenance := savedInteger + 1;
      elseif field == 167 then
        // GraphGaugeUncertainty.Estimate.binding
        savedInteger := changed.selected.binding.generation;
        changed.selected.binding.generation := savedInteger + 1;
      elseif field == 168 then
        // GraphGaugeUncertainty.Estimate.positions
        savedReal := changed.selected.positions[2,3];
        changed.selected.positions[2,3] := savedReal + 1.0;
      elseif field == 169 then
        // GraphGaugeUncertainty.Estimate.rotations
        savedReal := changed.selected.rotations[2,3,3];
        changed.selected.rotations[2,3,3] := savedReal + 1.0;
      elseif field == 170 then
        // GraphGaugeUncertainty.Estimate.covariance
        savedReal := changed.selected.covariance[12,12];
        changed.selected.covariance[12,12] := savedReal + 1.0;
      elseif field == 171 then
        // RGBDGraphProcessing.State.estimator
        savedReal := changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension];
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal + 1.0;
      elseif field == 172 then
        // RGBDGraphProcessing.State.vocabulary
        savedInteger := changed.vocabulary.generation;
        changed.vocabulary.generation := savedInteger + 1;
      elseif field == 173 then
        // RGBDGraphProcessing.State.captures
        savedInteger := changed.captures.generation;
        changed.captures.generation := savedInteger + 1;
      elseif field == 174 then
        // RGBDGraphProcessing.State.attempt
        savedInteger := changed.attempt.generation;
        changed.attempt.generation := savedInteger + 1;
      elseif field == 175 then
        // RGBDGraphProcessing.State.anchor
        savedInteger := changed.anchor.binding.generation;
        changed.anchor.binding.generation := savedInteger + 1;
      elseif field == 176 then
        // RGBDGraphProcessing.State.selected
        savedInteger := changed.selected.binding.generation;
        changed.selected.binding.generation := savedInteger + 1;
      end if;
      checks[field,1] := not RGBDCompleteStateComparison.Equal(original,changed,1e-12);
      if field == 1 then
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 2 then
        changed.estimator.localization.estimator.velocity[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 3 then
        changed.estimator.localization.estimator.rotation[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 4 then
        changed.estimator.localization.estimator.accelBias[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 5 then
        changed.estimator.localization.estimator.gyroBias[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 6 then
        changed.estimator.localization.estimator.covariance[RGBDLocalizationCatalog.currentDimension,RGBDLocalizationCatalog.currentDimension] := savedReal;
      elseif field == 7 then
        changed.estimator.localization.estimator.crossCovariance[RGBDLocalizationCatalog.currentDimension,RGBDLocalizationCatalog.referenceDimension] := savedReal;
      elseif field == 8 then
        changed.estimator.localization.estimator.referenceCovariance[RGBDLocalizationCatalog.referenceDimension,RGBDLocalizationCatalog.referenceDimension] := savedReal;
      elseif field == 9 then
        changed.estimator.localization.estimator.referencePosition[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 10 then
        changed.estimator.localization.estimator.referenceRotation[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 11 then
        changed.estimator.localization.estimator.referenceAvailable := savedReal;
      elseif field == 12 then
        changed.estimator.localization.estimator.referenceEpoch := savedReal;
      elseif field == 13 then
        changed.estimator.localization.estimator.referenceUsed := savedReal;
      elseif field == 14 then
        changed.estimator.localization.estimator.lastUsedEpoch := savedReal;
      elseif field == 15 then
        changed.estimator.localization.estimator.referenceDescriptor[RGBDLocalizationCatalog.featureCapacity,RGBDLocalizationCatalog.descriptorSize] := savedReal;
      elseif field == 16 then
        changed.estimator.localization.estimator.referencePoint[RGBDLocalizationCatalog.featureCapacity,RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 17 then
        changed.estimator.localization.estimator.referenceEnabled[RGBDLocalizationCatalog.featureCapacity] := savedReal;
      elseif field == 18 then
        changed.estimator.localization.estimator.referencePixels[RGBDLocalizationCatalog.featureCapacity,2] := savedReal;
      elseif field == 19 then
        changed.estimator.localization.estimator.referenceCount := savedReal;
      elseif field == 20 then
        changed.estimator.localization.estimator.referenceRgbCalibration[4] := savedReal;
      elseif field == 21 then
        changed.estimator.localization.estimator.referenceDepthCalibration[4] := savedReal;
      elseif field == 22 then
        changed.estimator.localization.estimator.referenceNoiseReferenceFx := savedReal;
      elseif field == 23 then
        changed.estimator.localization.estimator.referenceDisparityNoise := savedReal;
      elseif field == 24 then
        changed.estimator.localization.estimator.referenceBaseline := savedReal;
      elseif field == 25 then
        changed.estimator.localization.estimator.referenceOpticalToBody[RGBDLocalizationCatalog.dimension,RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 26 then
        changed.estimator.localization.estimator.referenceCameraOriginBody[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 27 then
        changed.estimator.localization.catalog.generation := savedInteger;
      elseif field == 28 then
        changed.estimator.localization.catalog.vocabularyVersion := savedInteger;
      elseif field == 29 then
        changed.estimator.localization.catalog.nextId := savedInteger;
      elseif field == 30 then
        changed.estimator.localization.catalog.nextSlot := savedInteger;
      elseif field == 31 then
        changed.estimator.localization.catalog.lastEpoch := savedInteger;
      elseif field == 32 then
        changed.estimator.localization.catalog.lastTime := savedReal;
      elseif field == 33 then
        changed.estimator.localization.catalog.occupied[RGBDKeyframes.keyframeCapacity] := savedBoolean;
      elseif field == 34 then
        changed.estimator.localization.catalog.generations[RGBDKeyframes.keyframeCapacity] := savedInteger;
      elseif field == 35 then
        changed.estimator.localization.catalog.ids[RGBDKeyframes.keyframeCapacity] := savedInteger;
      elseif field == 36 then
        changed.estimator.localization.catalog.epochs[RGBDKeyframes.keyframeCapacity] := savedInteger;
      elseif field == 37 then
        changed.estimator.localization.catalog.imageTimes[RGBDKeyframes.keyframeCapacity] := savedReal;
      elseif field == 38 then
        changed.estimator.localization.catalog.counts[RGBDKeyframes.keyframeCapacity] := savedInteger;
      elseif field == 39 then
        changed.estimator.localization.catalog.featureEnabled[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity] := savedBoolean;
      elseif field == 40 then
        changed.estimator.localization.catalog.descriptors[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize] := savedReal;
      elseif field == 41 then
        changed.estimator.localization.catalog.opticalPoints[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,RGBDKeyframes.dimension] := savedReal;
      elseif field == 42 then
        changed.estimator.localization.catalog.pixelCoordinates[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.featureCapacity,2] := savedInteger;
      elseif field == 43 then
        changed.estimator.localization.catalog.rgbSizes[RGBDKeyframes.keyframeCapacity,2] := savedInteger;
      elseif field == 44 then
        changed.estimator.localization.catalog.depthSizes[RGBDKeyframes.keyframeCapacity,2] := savedInteger;
      elseif field == 45 then
        changed.estimator.localization.catalog.rgbCalibrations[RGBDKeyframes.keyframeCapacity,4] := savedReal;
      elseif field == 46 then
        changed.estimator.localization.catalog.depthCalibrations[RGBDKeyframes.keyframeCapacity,4] := savedReal;
      elseif field == 47 then
        changed.estimator.localization.catalog.opticalToBodyRotations[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension,RGBDKeyframes.dimension] := savedReal;
      elseif field == 48 then
        changed.estimator.localization.catalog.cameraOriginsBody[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension] := savedReal;
      elseif field == 49 then
        changed.estimator.localization.catalog.disparityNoises[RGBDKeyframes.keyframeCapacity] := savedReal;
      elseif field == 50 then
        changed.estimator.localization.catalog.noiseReferenceFocals[RGBDKeyframes.keyframeCapacity] := savedReal;
      elseif field == 51 then
        changed.estimator.localization.catalog.baselines[RGBDKeyframes.keyframeCapacity] := savedReal;
      elseif field == 52 then
        changed.estimator.localization.catalog.bodyRotations[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension,RGBDKeyframes.dimension] := savedReal;
      elseif field == 53 then
        changed.estimator.localization.catalog.bodyPositions[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.dimension] := savedReal;
      elseif field == 54 then
        changed.estimator.localization.catalog.poseCovariances[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.poseDimension,RGBDKeyframes.poseDimension] := savedReal;
      elseif field == 55 then
        changed.estimator.localization.catalog.vocabularyVersions[RGBDKeyframes.keyframeCapacity] := savedInteger;
      elseif field == 56 then
        changed.estimator.localization.catalog.histograms[RGBDKeyframes.keyframeCapacity,RGBDKeyframes.wordCapacity] := savedReal;
      elseif field == 57 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].enabled := savedBoolean;
      elseif field == 58 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].id := savedInteger;
      elseif field == 59 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].kind := savedInteger;
      elseif field == 60 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceId := savedInteger;
      elseif field == 61 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentId := savedInteger;
      elseif field == 62 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceSlot := savedInteger;
      elseif field == 63 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentSlot := savedInteger;
      elseif field == 64 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].referenceEpoch := savedInteger;
      elseif field == 65 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].currentEpoch := savedInteger;
      elseif field == 66 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].rotation[RGBDGraphMeasurements.dimension,RGBDGraphMeasurements.dimension] := savedReal;
      elseif field == 67 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].translation[RGBDGraphMeasurements.dimension] := savedReal;
      elseif field == 68 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].covariance[RGBDGraphMeasurements.poseDimension,RGBDGraphMeasurements.poseDimension] := savedReal;
      elseif field == 69 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].information[RGBDGraphMeasurements.poseDimension,RGBDGraphMeasurements.poseDimension] := savedReal;
      elseif field == 70 then
        changed.estimator.localization.graph.generation := savedInteger;
      elseif field == 71 then
        changed.estimator.localization.graph.revision := savedInteger;
      elseif field == 72 then
        changed.estimator.localization.graph.lastCaptureId := savedInteger;
      elseif field == 73 then
        changed.estimator.localization.graph.nextEdgeId := savedInteger;
      elseif field == 74 then
        changed.estimator.localization.graph.edges[RGBDGraphMeasurements.edgeCapacity].enabled := savedBoolean;
      elseif field == 75 then
        changed.estimator.localization.map.point[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension] := savedReal;
      elseif field == 76 then
        changed.estimator.localization.map.occupied[RGBDCatalogMapping.mapCapacity] := savedReal;
      elseif field == 77 then
        changed.estimator.localization.map.confidence[RGBDCatalogMapping.mapCapacity] := savedReal;
      elseif field == 78 then
        changed.estimator.localization.map.lastSeen[RGBDCatalogMapping.mapCapacity] := savedReal;
      elseif field == 79 then
        changed.estimator.localization.map.lastFrame[RGBDCatalogMapping.mapCapacity] := savedReal;
      elseif field == 80 then
        changed.estimator.localization.map.localPoint[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension] := savedReal;
      elseif field == 81 then
        changed.estimator.localization.map.anchorId[RGBDCatalogMapping.mapCapacity] := savedInteger;
      elseif field == 82 then
        changed.estimator.localization.map.anchorSlot[RGBDCatalogMapping.mapCapacity] := savedInteger;
      elseif field == 83 then
        changed.estimator.localization.map.generation := savedInteger;
      elseif field == 84 then
        changed.estimator.localization.map.catalogRevision := savedInteger;
      elseif field == 85 then
        changed.estimator.localization.map.imageTime := savedReal;
      elseif field == 86 then
        changed.estimator.localization.map.imageEpoch := savedInteger;
      elseif field == 87 then
        changed.estimator.localization.map.frame := savedReal;
      elseif field == 88 then
        changed.estimator.localization.map.worldFrame := savedReal;
      elseif field == 89 then
        changed.estimator.localization.referenceBirth.generation := savedInteger;
      elseif field == 90 then
        changed.estimator.localization.referenceBirth.epoch := savedInteger;
      elseif field == 91 then
        changed.estimator.localization.referenceBirth.sequence := savedInteger;
      elseif field == 92 then
        changed.estimator.localization.referenceBirth.catalogId := savedInteger;
      elseif field == 93 then
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 94 then
        changed.estimator.localization.catalog.generation := savedInteger;
      elseif field == 95 then
        changed.estimator.localization.graph.generation := savedInteger;
      elseif field == 96 then
        changed.estimator.localization.map.point[RGBDCatalogMapping.mapCapacity,RGBDCatalogMapping.dimension] := savedReal;
      elseif field == 97 then
        changed.estimator.localization.generation := savedInteger;
      elseif field == 98 then
        changed.estimator.localization.sourceRevision := savedInteger;
      elseif field == 99 then
        changed.estimator.localization.initialized := savedBoolean;
      elseif field == 100 then
        changed.estimator.localization.predictionTime := savedReal;
      elseif field == 101 then
        changed.estimator.localization.steps := savedInteger;
      elseif field == 102 then
        changed.estimator.localization.lastProcessedImageEpoch := savedInteger;
      elseif field == 103 then
        changed.estimator.localization.lastProcessedImageTime := savedReal;
      elseif field == 104 then
        changed.estimator.localization.referenceBirth.generation := savedInteger;
      elseif field == 105 then
        changed.estimator.poses.generation := savedInteger;
      elseif field == 106 then
        changed.estimator.poses.sourceRevision := savedInteger;
      elseif field == 107 then
        changed.estimator.poses.revision := savedInteger;
      elseif field == 108 then
        changed.estimator.poses.catalogNextId := savedInteger;
      elseif field == 109 then
        changed.estimator.poses.enabled[RGBDGraphEstimatorCommit.nodeCapacity] := savedBoolean;
      elseif field == 110 then
        changed.estimator.poses.ids[RGBDGraphEstimatorCommit.nodeCapacity] := savedInteger;
      elseif field == 111 then
        changed.estimator.poses.positions[RGBDGraphEstimatorCommit.nodeCapacity,RGBDGraphEstimatorCommit.dimension] := savedReal;
      elseif field == 112 then
        changed.estimator.poses.rotations[RGBDGraphEstimatorCommit.nodeCapacity,RGBDGraphEstimatorCommit.dimension,RGBDGraphEstimatorCommit.dimension] := savedReal;
      elseif field == 113 then
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 114 then
        changed.estimator.poses.generation := savedInteger;
      elseif field == 115 then
        changed.estimator.correctionRevision := savedInteger;
      elseif field == 116 then
        changed.estimator.graphRevisionUsed := savedInteger;
      elseif field == 117 then
        changed.vocabulary.generation := savedInteger;
      elseif field == 118 then
        changed.vocabulary.sourceRevision := savedInteger;
      elseif field == 119 then
        changed.vocabulary.version := savedInteger;
      elseif field == 120 then
        changed.vocabulary.words[RGBDVisualVocabulary.vocabularyCapacity,RGBDVisualVocabulary.descriptorSize] := savedReal;
      elseif field == 121 then
        changed.vocabulary.enabled[RGBDVisualVocabulary.vocabularyCapacity] := savedReal;
      elseif field == 122 then
        changed.vocabulary.count := savedInteger;
      elseif field == 123 then
        changed.vocabulary.ready := savedBoolean;
      elseif field == 124 then
        changed.captures.generation := savedInteger;
      elseif field == 125 then
        changed.captures.sourceRevision := savedInteger;
      elseif field == 126 then
        changed.captures.catalogNextId := savedInteger;
      elseif field == 127 then
        changed.captures.lastStep := savedInteger;
      elseif field == 128 then
        changed.captures.ids[RGBDGraphCaptureLedger.capacity] := savedInteger;
      elseif field == 129 then
        changed.captures.epochs[RGBDGraphCaptureLedger.capacity] := savedInteger;
      elseif field == 130 then
        changed.captures.sequences[RGBDGraphCaptureLedger.capacity] := savedInteger;
      elseif field == 131 then
        changed.captures.times[RGBDGraphCaptureLedger.capacity] := savedReal;
      elseif field == 132 then
        changed.attempt.generation := savedInteger;
      elseif field == 133 then
        changed.attempt.graphRevision := savedInteger;
      elseif field == 134 then
        changed.attempt.factorProvenance := savedInteger;
      elseif field == 135 then
        changed.anchor.binding.generation := savedInteger;
      elseif field == 136 then
        changed.anchor.binding.sourceRevision := savedInteger;
      elseif field == 137 then
        changed.anchor.binding.id := savedInteger;
      elseif field == 138 then
        changed.anchor.binding.slot := savedInteger;
      elseif field == 139 then
        changed.anchor.binding.epoch := savedInteger;
      elseif field == 140 then
        changed.anchor.binding.sequence := savedInteger;
      elseif field == 141 then
        changed.anchor.binding.catalogPoseRevision := savedInteger;
      elseif field == 142 then
        changed.anchor.binding.provenance := savedInteger;
      elseif field == 143 then
        changed.anchor.binding.imageTime := savedReal;
      elseif field == 144 then
        changed.anchor.binding.generation := savedInteger;
      elseif field == 145 then
        changed.anchor.position[RGBDGraphAnchorBound.dimension] := savedReal;
      elseif field == 146 then
        changed.anchor.rotation[RGBDGraphAnchorBound.dimension,RGBDGraphAnchorBound.dimension] := savedReal;
      elseif field == 147 then
        changed.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension] := savedReal;
      elseif field == 148 then
        changed.selected.binding.generation := savedInteger;
      elseif field == 149 then
        changed.selected.binding.graphRevision := savedInteger;
      elseif field == 150 then
        changed.selected.binding.catalogPoseRevision := savedInteger;
      elseif field == 151 then
        changed.selected.binding.anchorId := savedInteger;
      elseif field == 152 then
        changed.selected.binding.anchorEpoch := savedInteger;
      elseif field == 153 then
        changed.selected.binding.anchorCaptureSequence := savedInteger;
      elseif field == 154 then
        changed.selected.binding.currentId := savedInteger;
      elseif field == 155 then
        changed.selected.binding.currentEpoch := savedInteger;
      elseif field == 156 then
        changed.selected.binding.currentCaptureSequence := savedInteger;
      elseif field == 157 then
        changed.selected.binding.referenceId := savedInteger;
      elseif field == 158 then
        changed.selected.binding.referenceEpoch := savedInteger;
      elseif field == 159 then
        changed.selected.binding.referenceCaptureSequence := savedInteger;
      elseif field == 160 then
        changed.selected.binding.chart := savedInteger;
      elseif field == 161 then
        changed.selected.binding.anchorTime := savedReal;
      elseif field == 162 then
        changed.selected.binding.currentTime := savedReal;
      elseif field == 163 then
        changed.selected.binding.referenceTime := savedReal;
      elseif field == 164 then
        changed.selected.binding.sourceRevision := savedInteger;
      elseif field == 165 then
        changed.selected.binding.factorProvenance := savedInteger;
      elseif field == 166 then
        changed.selected.binding.anchorBoundProvenance := savedInteger;
      elseif field == 167 then
        changed.selected.binding.generation := savedInteger;
      elseif field == 168 then
        changed.selected.positions[2,3] := savedReal;
      elseif field == 169 then
        changed.selected.rotations[2,3,3] := savedReal;
      elseif field == 170 then
        changed.selected.covariance[12,12] := savedReal;
      elseif field == 171 then
        changed.estimator.localization.estimator.position[RGBDLocalizationCatalog.dimension] := savedReal;
      elseif field == 172 then
        changed.vocabulary.generation := savedInteger;
      elseif field == 173 then
        changed.captures.generation := savedInteger;
      elseif field == 174 then
        changed.attempt.generation := savedInteger;
      elseif field == 175 then
        changed.anchor.binding.generation := savedInteger;
      elseif field == 176 then
        changed.selected.binding.generation := savedInteger;
      end if;
      checks[field,2] := RGBDCompleteStateComparison.Equal(original,changed,1e-12);
      detected := detected+(if checks[field,1] then 1 else 0);
      restored := restored+(if checks[field,2] then 1 else 0);
    end for;
    policies[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(original)
      and RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    policies[2] := not RGBDCompleteStateComparison.Equal(original,changed,0);
    policies[3] := not RGBDCompleteStateComparison.Equal(original,changed,-1);
    policies[4] := RGBDCompleteStateComparison.RealEqual(0,0.0625,0.125);
    policies[5] := not RGBDCompleteStateComparison.RealEqual(0,0.125,0.125);
    policies[6] := not RGBDCompleteStateComparison.RealEqual(0,0.25,0.125);
    policies[7] := RGBDCompleteStateComparison.RealEqual(1e150,1e150,1e-12);
    // Runtime overflow followed by sin(infinity), not infinity-infinity:
    // OMC simplifies the latter algebraically even when the operand is dynamic.
    infinity := exp(1000+clock); negativeInfinity := -infinity;
    nanValue := sin(infinity); positiveZero := 1.0/infinity; negativeZero := -1.0/infinity;
    policies[8] := infinity > 1e300 and negativeInfinity < -1e300
      and not (nanValue <= 0 or nanValue >= 0);
    policies[9] := RGBDCompleteStateComparison.RealEqual(nanValue,nanValue,1e-12);
    policies[10] := not RGBDCompleteStateComparison.RealEqual(nanValue,0,1e-12);
    policies[11] := not RGBDCompleteStateComparison.RealEqual(0,nanValue,1e-12);
    policies[12] := RGBDCompleteStateComparison.RealEqual(infinity,infinity,1e-12);
    policies[13] := RGBDCompleteStateComparison.RealEqual(negativeInfinity,negativeInfinity,1e-12);
    policies[14] := not RGBDCompleteStateComparison.RealEqual(infinity,negativeInfinity,1e-12);
    policies[15] := not RGBDCompleteStateComparison.RealEqual(infinity,1e300,1e-12);
    policies[16] := not RGBDCompleteStateComparison.RealEqual(negativeInfinity,-1e300,1e-12);
    policies[17] := positiveZero <= 0 and positiveZero >= 0 and negativeZero <= 0 and negativeZero >= 0
      and atan2(positiveZero,-1) > 0 and atan2(negativeZero,-1) < 0;
    policies[18] := RGBDCompleteStateComparison.RealEqual(positiveZero,negativeZero,1e-12);
    anchorSaved := original.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension];
    original.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension] := nanValue;
    changed.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension] := nanValue;
    policies[19] := RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    original.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension] := anchorSaved;
    policies[20] := not RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    changed.anchor.bound[RGBDGraphAnchorBound.poseDimension,RGBDGraphAnchorBound.poseDimension] := anchorSaved;
    policies[21] := RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    selectedSaved := original.selected.covariance[GraphGaugeUncertainty.selectedDimension,GraphGaugeUncertainty.selectedDimension];
    original.selected.covariance[GraphGaugeUncertainty.selectedDimension,GraphGaugeUncertainty.selectedDimension] := infinity;
    changed.selected.covariance[GraphGaugeUncertainty.selectedDimension,GraphGaugeUncertainty.selectedDimension] := infinity;
    policies[22] := RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    changed.selected.covariance[GraphGaugeUncertainty.selectedDimension,GraphGaugeUncertainty.selectedDimension] := negativeInfinity;
    policies[23] := not RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    original.selected.covariance[GraphGaugeUncertainty.selectedDimension,GraphGaugeUncertainty.selectedDimension] := selectedSaved;
    changed.selected.covariance[GraphGaugeUncertainty.selectedDimension,GraphGaugeUncertainty.selectedDimension] := selectedSaved;
    policies[24] := RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    integerSaved := original.selected.binding.factorProvenance;
    integerHigh := 9007199254740992; integerNext := 9007199254740993;
    original.selected.binding.factorProvenance := integerHigh;
    changed.selected.binding.factorProvenance := integerNext;
    policies[25] := integerNext-integerHigh == 1 and not RGBDCompleteStateComparison.Equal(original,changed,100);
    changed.selected.binding.factorProvenance := integerHigh;
    policies[26] := RGBDCompleteStateComparison.Equal(original,changed,100);
    original.selected.binding.factorProvenance := integerSaved; changed.selected.binding.factorProvenance := integerSaved;
    policies[27] := RGBDCompleteStateComparison.Equal(original,changed,1e-12);
    booleanSaved := changed.vocabulary.ready; changed.vocabulary.ready := not booleanSaved;
    policies[28] := not RGBDCompleteStateComparison.Equal(original,changed,100);
    changed.vocabulary.ready := booleanSaved;
    policies[29] := RGBDCompleteStateComparison.Equal(original,changed,100);
    policies[30] := not RGBDCompleteStateComparison.RealEqual(0,0,nanValue);
    raw := {mutationCount,17,detected,restored};
  end Run;
end RGBDCompleteStateComparisonReference;

model RGBDCompleteStateComparisonAcceptance
  output Boolean checks[176,2]; output Boolean policies[30]; output Real raw[4];
equation
  (checks,policies,raw) = RGBDCompleteStateComparisonReference.Run(time);
end RGBDCompleteStateComparisonAcceptance;
