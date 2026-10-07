// Test-only exhaustive VALUE comparator, not a production serializer or native ABI.
// Every declared field and array cell, including inactive padding, is observed.
// Positive tolerance required. Integer/Boolean comparison is exact; Real values
// use ordered equality or strict absolute tolerance, with both-NaN equivalence.
// Infinity signs are preserved; signed zeros compare equal. NaN payload bits and
// opaque binary/compiler padding have no Modelica value identity here.
package RGBDCompleteStateComparison
  function RealEqual
    input Real left; input Real right; input Real tolerance;
    output Boolean equal;
  algorithm
    equal := tolerance > 0 and ((left <= right and right <= left)
      or abs(left-right) < tolerance
      or (not (left <= 0 or left >= 0) and not (right <= 0 or right >= 0)));
  end RealEqual;

  function BooleanVector
    input Boolean left[:]; input Boolean right[:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1);
    if size(left,1) == size(right,1) then
      for index1 in 1:size(left,1) loop
        cellEqual := left[index1] == right[index1];
        equal := cellEqual and equal;
      end for;
    end if;
  end BooleanVector;

  function BooleanMatrix
    input Boolean left[:,:]; input Boolean right[:,:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1) and size(left,2) == size(right,2);
    if size(left,1) == size(right,1) and size(left,2) == size(right,2) then
      for index1 in 1:size(left,1) loop
        for index2 in 1:size(left,2) loop
          cellEqual := left[index1,index2] == right[index1,index2];
          equal := cellEqual and equal;
        end for;
      end for;
    end if;
  end BooleanMatrix;

  function IntegerVector
    input Integer left[:]; input Integer right[:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1);
    if size(left,1) == size(right,1) then
      for index1 in 1:size(left,1) loop
        cellEqual := left[index1] == right[index1];
        equal := cellEqual and equal;
      end for;
    end if;
  end IntegerVector;

  function IntegerMatrix
    input Integer left[:,:]; input Integer right[:,:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1) and size(left,2) == size(right,2);
    if size(left,1) == size(right,1) and size(left,2) == size(right,2) then
      for index1 in 1:size(left,1) loop
        for index2 in 1:size(left,2) loop
          cellEqual := left[index1,index2] == right[index1,index2];
          equal := cellEqual and equal;
        end for;
      end for;
    end if;
  end IntegerMatrix;

  function IntegerTensor
    input Integer left[:,:,:]; input Integer right[:,:,:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1) and size(left,2) == size(right,2) and size(left,3) == size(right,3);
    if size(left,1) == size(right,1) and size(left,2) == size(right,2) and size(left,3) == size(right,3) then
      for index1 in 1:size(left,1) loop
        for index2 in 1:size(left,2) loop
          for index3 in 1:size(left,3) loop
            cellEqual := left[index1,index2,index3] == right[index1,index2,index3];
            equal := cellEqual and equal;
          end for;
        end for;
      end for;
    end if;
  end IntegerTensor;

  function RealVector
    input Real left[:]; input Real right[:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1);
    if size(left,1) == size(right,1) then
      for index1 in 1:size(left,1) loop
        cellEqual := RealEqual(left[index1],right[index1],tolerance);
        equal := cellEqual and equal;
      end for;
    end if;
  end RealVector;

  function RealMatrix
    input Real left[:,:]; input Real right[:,:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1) and size(left,2) == size(right,2);
    if size(left,1) == size(right,1) and size(left,2) == size(right,2) then
      for index1 in 1:size(left,1) loop
        for index2 in 1:size(left,2) loop
          cellEqual := RealEqual(left[index1,index2],right[index1,index2],tolerance);
          equal := cellEqual and equal;
        end for;
      end for;
    end if;
  end RealMatrix;

  function RealTensor
    input Real left[:,:,:]; input Real right[:,:,:]; input Real tolerance;
    output Boolean equal;
  protected Boolean cellEqual;
  algorithm
    equal := tolerance > 0 and size(left,1) == size(right,1) and size(left,2) == size(right,2) and size(left,3) == size(right,3);
    if size(left,1) == size(right,1) and size(left,2) == size(right,2) and size(left,3) == size(right,3) then
      for index1 in 1:size(left,1) loop
        for index2 in 1:size(left,2) loop
          for index3 in 1:size(left,3) loop
            cellEqual := RealEqual(left[index1,index2,index3],right[index1,index2,index3],tolerance);
            equal := cellEqual and equal;
          end for;
        end for;
      end for;
    end if;
  end RealTensor;

  function EqualLocalizationEstimator
    input RGBDLocalizationCatalog.Estimator left; input RGBDLocalizationCatalog.Estimator right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDLocalizationCatalog.Estimator.position
    fieldEqual := RealVector(left.position,right.position,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.velocity
    fieldEqual := RealVector(left.velocity,right.velocity,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.rotation
    fieldEqual := RealMatrix(left.rotation,right.rotation,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.accelBias
    fieldEqual := RealVector(left.accelBias,right.accelBias,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.gyroBias
    fieldEqual := RealVector(left.gyroBias,right.gyroBias,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.covariance
    fieldEqual := RealMatrix(left.covariance,right.covariance,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.crossCovariance
    fieldEqual := RealMatrix(left.crossCovariance,right.crossCovariance,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceCovariance
    fieldEqual := RealMatrix(left.referenceCovariance,right.referenceCovariance,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referencePosition
    fieldEqual := RealVector(left.referencePosition,right.referencePosition,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceRotation
    fieldEqual := RealMatrix(left.referenceRotation,right.referenceRotation,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceAvailable
    fieldEqual := RealEqual(left.referenceAvailable,right.referenceAvailable,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceEpoch
    fieldEqual := RealEqual(left.referenceEpoch,right.referenceEpoch,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceUsed
    fieldEqual := RealEqual(left.referenceUsed,right.referenceUsed,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.lastUsedEpoch
    fieldEqual := RealEqual(left.lastUsedEpoch,right.lastUsedEpoch,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceDescriptor
    fieldEqual := RealMatrix(left.referenceDescriptor,right.referenceDescriptor,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referencePoint
    fieldEqual := RealMatrix(left.referencePoint,right.referencePoint,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceEnabled
    fieldEqual := RealVector(left.referenceEnabled,right.referenceEnabled,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referencePixels
    fieldEqual := RealMatrix(left.referencePixels,right.referencePixels,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceCount
    fieldEqual := RealEqual(left.referenceCount,right.referenceCount,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceRgbCalibration
    fieldEqual := RealVector(left.referenceRgbCalibration,right.referenceRgbCalibration,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceDepthCalibration
    fieldEqual := RealVector(left.referenceDepthCalibration,right.referenceDepthCalibration,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceNoiseReferenceFx
    fieldEqual := RealEqual(left.referenceNoiseReferenceFx,right.referenceNoiseReferenceFx,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceDisparityNoise
    fieldEqual := RealEqual(left.referenceDisparityNoise,right.referenceDisparityNoise,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceBaseline
    fieldEqual := RealEqual(left.referenceBaseline,right.referenceBaseline,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceOpticalToBody
    fieldEqual := RealMatrix(left.referenceOpticalToBody,right.referenceOpticalToBody,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.Estimator.referenceCameraOriginBody
    fieldEqual := RealVector(left.referenceCameraOriginBody,right.referenceCameraOriginBody,tolerance);
    equal := fieldEqual and equal;
  end EqualLocalizationEstimator;

  function EqualCatalog
    input RGBDKeyframes.Catalog left; input RGBDKeyframes.Catalog right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDKeyframes.Catalog.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.vocabularyVersion
    fieldEqual := left.vocabularyVersion == right.vocabularyVersion;
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.nextId
    fieldEqual := left.nextId == right.nextId;
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.nextSlot
    fieldEqual := left.nextSlot == right.nextSlot;
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.lastEpoch
    fieldEqual := left.lastEpoch == right.lastEpoch;
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.lastTime
    fieldEqual := RealEqual(left.lastTime,right.lastTime,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.occupied
    fieldEqual := BooleanVector(left.occupied,right.occupied,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.generations
    fieldEqual := IntegerVector(left.generations,right.generations,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.ids
    fieldEqual := IntegerVector(left.ids,right.ids,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.epochs
    fieldEqual := IntegerVector(left.epochs,right.epochs,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.imageTimes
    fieldEqual := RealVector(left.imageTimes,right.imageTimes,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.counts
    fieldEqual := IntegerVector(left.counts,right.counts,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.featureEnabled
    fieldEqual := BooleanMatrix(left.featureEnabled,right.featureEnabled,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.descriptors
    fieldEqual := RealTensor(left.descriptors,right.descriptors,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.opticalPoints
    fieldEqual := RealTensor(left.opticalPoints,right.opticalPoints,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.pixelCoordinates
    fieldEqual := IntegerTensor(left.pixelCoordinates,right.pixelCoordinates,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.rgbSizes
    fieldEqual := IntegerMatrix(left.rgbSizes,right.rgbSizes,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.depthSizes
    fieldEqual := IntegerMatrix(left.depthSizes,right.depthSizes,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.rgbCalibrations
    fieldEqual := RealMatrix(left.rgbCalibrations,right.rgbCalibrations,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.depthCalibrations
    fieldEqual := RealMatrix(left.depthCalibrations,right.depthCalibrations,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.opticalToBodyRotations
    fieldEqual := RealTensor(left.opticalToBodyRotations,right.opticalToBodyRotations,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.cameraOriginsBody
    fieldEqual := RealMatrix(left.cameraOriginsBody,right.cameraOriginsBody,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.disparityNoises
    fieldEqual := RealVector(left.disparityNoises,right.disparityNoises,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.noiseReferenceFocals
    fieldEqual := RealVector(left.noiseReferenceFocals,right.noiseReferenceFocals,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.baselines
    fieldEqual := RealVector(left.baselines,right.baselines,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.bodyRotations
    fieldEqual := RealTensor(left.bodyRotations,right.bodyRotations,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.bodyPositions
    fieldEqual := RealMatrix(left.bodyPositions,right.bodyPositions,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.poseCovariances
    fieldEqual := RealTensor(left.poseCovariances,right.poseCovariances,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.vocabularyVersions
    fieldEqual := IntegerVector(left.vocabularyVersions,right.vocabularyVersions,tolerance);
    equal := fieldEqual and equal;
    // RGBDKeyframes.Catalog.histograms
    fieldEqual := RealMatrix(left.histograms,right.histograms,tolerance);
    equal := fieldEqual and equal;
  end EqualCatalog;

  function EqualGraphEdge
    input RGBDGraphMeasurements.Edge left; input RGBDGraphMeasurements.Edge right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphMeasurements.Edge.enabled
    fieldEqual := left.enabled == right.enabled;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.id
    fieldEqual := left.id == right.id;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.kind
    fieldEqual := left.kind == right.kind;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.referenceId
    fieldEqual := left.referenceId == right.referenceId;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.currentId
    fieldEqual := left.currentId == right.currentId;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.referenceSlot
    fieldEqual := left.referenceSlot == right.referenceSlot;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.currentSlot
    fieldEqual := left.currentSlot == right.currentSlot;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.referenceEpoch
    fieldEqual := left.referenceEpoch == right.referenceEpoch;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.currentEpoch
    fieldEqual := left.currentEpoch == right.currentEpoch;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.rotation
    fieldEqual := RealMatrix(left.rotation,right.rotation,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.translation
    fieldEqual := RealVector(left.translation,right.translation,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.covariance
    fieldEqual := RealMatrix(left.covariance,right.covariance,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.Edge.information
    fieldEqual := RealMatrix(left.information,right.information,tolerance);
    equal := fieldEqual and equal;
  end EqualGraphEdge;

  function EqualGraphState
    input RGBDGraphMeasurements.State left; input RGBDGraphMeasurements.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphMeasurements.State.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.State.revision
    fieldEqual := left.revision == right.revision;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.State.lastCaptureId
    fieldEqual := left.lastCaptureId == right.lastCaptureId;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.State.nextEdgeId
    fieldEqual := left.nextEdgeId == right.nextEdgeId;
    equal := fieldEqual and equal;
    // RGBDGraphMeasurements.State.edges
    for index in 1:RGBDGraphMeasurements.edgeCapacity loop
      fieldEqual := EqualGraphEdge(left.edges[index],right.edges[index],tolerance);
      equal := fieldEqual and equal;
    end for;
  end EqualGraphState;

  function EqualMappingState
    input RGBDCatalogMapping.State left; input RGBDCatalogMapping.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDCatalogMapping.State.point
    fieldEqual := RealMatrix(left.point,right.point,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.occupied
    fieldEqual := RealVector(left.occupied,right.occupied,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.confidence
    fieldEqual := RealVector(left.confidence,right.confidence,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.lastSeen
    fieldEqual := RealVector(left.lastSeen,right.lastSeen,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.lastFrame
    fieldEqual := RealVector(left.lastFrame,right.lastFrame,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.localPoint
    fieldEqual := RealMatrix(left.localPoint,right.localPoint,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.anchorId
    fieldEqual := IntegerVector(left.anchorId,right.anchorId,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.anchorSlot
    fieldEqual := IntegerVector(left.anchorSlot,right.anchorSlot,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.catalogRevision
    fieldEqual := left.catalogRevision == right.catalogRevision;
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.imageTime
    fieldEqual := RealEqual(left.imageTime,right.imageTime,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.imageEpoch
    fieldEqual := left.imageEpoch == right.imageEpoch;
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.frame
    fieldEqual := RealEqual(left.frame,right.frame,tolerance);
    equal := fieldEqual and equal;
    // RGBDCatalogMapping.State.worldFrame
    fieldEqual := RealEqual(left.worldFrame,right.worldFrame,tolerance);
    equal := fieldEqual and equal;
  end EqualMappingState;

  function EqualReferenceBirth
    input RGBDLocalizationCatalog.ReferenceBirth left; input RGBDLocalizationCatalog.ReferenceBirth right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDLocalizationCatalog.ReferenceBirth.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.ReferenceBirth.epoch
    fieldEqual := left.epoch == right.epoch;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.ReferenceBirth.sequence
    fieldEqual := left.sequence == right.sequence;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.ReferenceBirth.catalogId
    fieldEqual := left.catalogId == right.catalogId;
    equal := fieldEqual and equal;
  end EqualReferenceBirth;

  function EqualLocalizationState
    input RGBDLocalizationCatalog.State left; input RGBDLocalizationCatalog.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDLocalizationCatalog.State.estimator
    fieldEqual := EqualLocalizationEstimator(left.estimator,right.estimator,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.catalog
    fieldEqual := EqualCatalog(left.catalog,right.catalog,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.graph
    fieldEqual := EqualGraphState(left.graph,right.graph,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.map
    fieldEqual := EqualMappingState(left.map,right.map,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.sourceRevision
    fieldEqual := left.sourceRevision == right.sourceRevision;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.initialized
    fieldEqual := left.initialized == right.initialized;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.predictionTime
    fieldEqual := RealEqual(left.predictionTime,right.predictionTime,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.steps
    fieldEqual := left.steps == right.steps;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.lastProcessedImageEpoch
    fieldEqual := left.lastProcessedImageEpoch == right.lastProcessedImageEpoch;
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.lastProcessedImageTime
    fieldEqual := RealEqual(left.lastProcessedImageTime,right.lastProcessedImageTime,tolerance);
    equal := fieldEqual and equal;
    // RGBDLocalizationCatalog.State.referenceBirth
    fieldEqual := EqualReferenceBirth(left.referenceBirth,right.referenceBirth,tolerance);
    equal := fieldEqual and equal;
  end EqualLocalizationState;

  function EqualPoseView
    input RGBDGraphEstimatorCommit.PoseView left; input RGBDGraphEstimatorCommit.PoseView right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphEstimatorCommit.PoseView.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.sourceRevision
    fieldEqual := left.sourceRevision == right.sourceRevision;
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.revision
    fieldEqual := left.revision == right.revision;
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.catalogNextId
    fieldEqual := left.catalogNextId == right.catalogNextId;
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.enabled
    fieldEqual := BooleanVector(left.enabled,right.enabled,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.ids
    fieldEqual := IntegerVector(left.ids,right.ids,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.positions
    fieldEqual := RealMatrix(left.positions,right.positions,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.PoseView.rotations
    fieldEqual := RealTensor(left.rotations,right.rotations,tolerance);
    equal := fieldEqual and equal;
  end EqualPoseView;

  function EqualGraphEstimatorState
    input RGBDGraphEstimatorCommit.State left; input RGBDGraphEstimatorCommit.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphEstimatorCommit.State.localization
    fieldEqual := EqualLocalizationState(left.localization,right.localization,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.State.poses
    fieldEqual := EqualPoseView(left.poses,right.poses,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.State.correctionRevision
    fieldEqual := left.correctionRevision == right.correctionRevision;
    equal := fieldEqual and equal;
    // RGBDGraphEstimatorCommit.State.graphRevisionUsed
    fieldEqual := left.graphRevisionUsed == right.graphRevisionUsed;
    equal := fieldEqual and equal;
  end EqualGraphEstimatorState;

  function EqualVocabulary
    input RGBDVisualVocabulary.State left; input RGBDVisualVocabulary.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDVisualVocabulary.State.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDVisualVocabulary.State.sourceRevision
    fieldEqual := left.sourceRevision == right.sourceRevision;
    equal := fieldEqual and equal;
    // RGBDVisualVocabulary.State.version
    fieldEqual := left.version == right.version;
    equal := fieldEqual and equal;
    // RGBDVisualVocabulary.State.words
    fieldEqual := RealMatrix(left.words,right.words,tolerance);
    equal := fieldEqual and equal;
    // RGBDVisualVocabulary.State.enabled
    fieldEqual := RealVector(left.enabled,right.enabled,tolerance);
    equal := fieldEqual and equal;
    // RGBDVisualVocabulary.State.count
    fieldEqual := left.count == right.count;
    equal := fieldEqual and equal;
    // RGBDVisualVocabulary.State.ready
    fieldEqual := left.ready == right.ready;
    equal := fieldEqual and equal;
  end EqualVocabulary;

  function EqualCaptureLedger
    input RGBDGraphCaptureLedger.State left; input RGBDGraphCaptureLedger.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphCaptureLedger.State.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.sourceRevision
    fieldEqual := left.sourceRevision == right.sourceRevision;
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.catalogNextId
    fieldEqual := left.catalogNextId == right.catalogNextId;
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.lastStep
    fieldEqual := left.lastStep == right.lastStep;
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.ids
    fieldEqual := IntegerVector(left.ids,right.ids,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.epochs
    fieldEqual := IntegerVector(left.epochs,right.epochs,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.sequences
    fieldEqual := IntegerVector(left.sequences,right.sequences,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphCaptureLedger.State.times
    fieldEqual := RealVector(left.times,right.times,tolerance);
    equal := fieldEqual and equal;
  end EqualCaptureLedger;

  function EqualAttempt
    input SchmidtGraphPoseCorrection.Attempt left; input SchmidtGraphPoseCorrection.Attempt right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // SchmidtGraphPoseCorrection.Attempt.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // SchmidtGraphPoseCorrection.Attempt.graphRevision
    fieldEqual := left.graphRevision == right.graphRevision;
    equal := fieldEqual and equal;
    // SchmidtGraphPoseCorrection.Attempt.factorProvenance
    fieldEqual := left.factorProvenance == right.factorProvenance;
    equal := fieldEqual and equal;
  end EqualAttempt;

  function EqualAnchorBinding
    input RGBDGraphAnchorBound.Binding left; input RGBDGraphAnchorBound.Binding right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphAnchorBound.Binding.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.sourceRevision
    fieldEqual := left.sourceRevision == right.sourceRevision;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.id
    fieldEqual := left.id == right.id;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.slot
    fieldEqual := left.slot == right.slot;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.epoch
    fieldEqual := left.epoch == right.epoch;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.sequence
    fieldEqual := left.sequence == right.sequence;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.catalogPoseRevision
    fieldEqual := left.catalogPoseRevision == right.catalogPoseRevision;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.provenance
    fieldEqual := left.provenance == right.provenance;
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Binding.imageTime
    fieldEqual := RealEqual(left.imageTime,right.imageTime,tolerance);
    equal := fieldEqual and equal;
  end EqualAnchorBinding;

  function EqualAnchorEstimate
    input RGBDGraphAnchorBound.Estimate left; input RGBDGraphAnchorBound.Estimate right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphAnchorBound.Estimate.binding
    fieldEqual := EqualAnchorBinding(left.binding,right.binding,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Estimate.position
    fieldEqual := RealVector(left.position,right.position,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Estimate.rotation
    fieldEqual := RealMatrix(left.rotation,right.rotation,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphAnchorBound.Estimate.bound
    fieldEqual := RealMatrix(left.bound,right.bound,tolerance);
    equal := fieldEqual and equal;
  end EqualAnchorEstimate;

  function EqualGaugeBinding
    input GraphGaugeUncertainty.Binding left; input GraphGaugeUncertainty.Binding right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // GraphGaugeUncertainty.Binding.generation
    fieldEqual := left.generation == right.generation;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.graphRevision
    fieldEqual := left.graphRevision == right.graphRevision;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.catalogPoseRevision
    fieldEqual := left.catalogPoseRevision == right.catalogPoseRevision;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.anchorId
    fieldEqual := left.anchorId == right.anchorId;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.anchorEpoch
    fieldEqual := left.anchorEpoch == right.anchorEpoch;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.anchorCaptureSequence
    fieldEqual := left.anchorCaptureSequence == right.anchorCaptureSequence;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.currentId
    fieldEqual := left.currentId == right.currentId;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.currentEpoch
    fieldEqual := left.currentEpoch == right.currentEpoch;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.currentCaptureSequence
    fieldEqual := left.currentCaptureSequence == right.currentCaptureSequence;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.referenceId
    fieldEqual := left.referenceId == right.referenceId;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.referenceEpoch
    fieldEqual := left.referenceEpoch == right.referenceEpoch;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.referenceCaptureSequence
    fieldEqual := left.referenceCaptureSequence == right.referenceCaptureSequence;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.chart
    fieldEqual := left.chart == right.chart;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.anchorTime
    fieldEqual := RealEqual(left.anchorTime,right.anchorTime,tolerance);
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.currentTime
    fieldEqual := RealEqual(left.currentTime,right.currentTime,tolerance);
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.referenceTime
    fieldEqual := RealEqual(left.referenceTime,right.referenceTime,tolerance);
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.sourceRevision
    fieldEqual := left.sourceRevision == right.sourceRevision;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.factorProvenance
    fieldEqual := left.factorProvenance == right.factorProvenance;
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Binding.anchorBoundProvenance
    fieldEqual := left.anchorBoundProvenance == right.anchorBoundProvenance;
    equal := fieldEqual and equal;
  end EqualGaugeBinding;

  function EqualGaugeEstimate
    input GraphGaugeUncertainty.Estimate left; input GraphGaugeUncertainty.Estimate right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // GraphGaugeUncertainty.Estimate.binding
    fieldEqual := EqualGaugeBinding(left.binding,right.binding,tolerance);
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Estimate.positions
    fieldEqual := RealMatrix(left.positions,right.positions,tolerance);
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Estimate.rotations
    fieldEqual := RealTensor(left.rotations,right.rotations,tolerance);
    equal := fieldEqual and equal;
    // GraphGaugeUncertainty.Estimate.covariance
    fieldEqual := RealMatrix(left.covariance,right.covariance,tolerance);
    equal := fieldEqual and equal;
  end EqualGaugeEstimate;

  function Equal
    input RGBDGraphProcessing.State left; input RGBDGraphProcessing.State right; input Real tolerance;
    output Boolean equal;
  protected Boolean fieldEqual;
  algorithm
    equal := tolerance > 0;
    // RGBDGraphProcessing.State.estimator
    fieldEqual := EqualGraphEstimatorState(left.estimator,right.estimator,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphProcessing.State.vocabulary
    fieldEqual := EqualVocabulary(left.vocabulary,right.vocabulary,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphProcessing.State.captures
    fieldEqual := EqualCaptureLedger(left.captures,right.captures,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphProcessing.State.attempt
    fieldEqual := EqualAttempt(left.attempt,right.attempt,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphProcessing.State.anchor
    fieldEqual := EqualAnchorEstimate(left.anchor,right.anchor,tolerance);
    equal := fieldEqual and equal;
    // RGBDGraphProcessing.State.selected
    fieldEqual := EqualGaugeEstimate(left.selected,right.selected,tolerance);
    equal := fieldEqual and equal;
  end Equal;
end RGBDCompleteStateComparison;
