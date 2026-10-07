// Test-only enabled visual frontend replay; never changes a production proposal.
// pixels/activeCount MUST be the actual full FAST selected-input inventory.
// Public features are masked after description and cannot reconstruct that input.
package RGBDRenderedVisualDiagnostics
  function EnabledCount
    input Real enabled[:]; output Real count;
  algorithm
    count := 0.0;
    for feature in 1:size(enabled,1) loop
      if enabled[feature] > 0.5 then count := count+1.0; end if;
    end for;
  end EnabledCount;

  function Evaluate
    input RGBDGraphProcessing.State previous;
    input Real rgb[:,:,:];
    input Real depth[size(rgb,1),size(rgb,2)];
    input Real pixels[featureCapacity,2]; input Real activeCount;
    input Real calibration[14]; input Real opticalToBody[dimension,dimension];
    input Real depthUnits = 1.0;
    output Real diagnostics[16];
    output Real matchedPairs[featureCapacity,7] "reference XYZ, current XYZ, sparse pair mask";
  protected
    constant Integer featureCapacity = 350;
    constant Integer descriptorSize = 49; constant Integer dimension = 3;
    constant Integer poseDimension = 6;
    RGBDLocalizationCatalog.Estimator reference;
    Boolean sameGeometry; Real usableReferenceCount;
    Real observedBodyRotation[dimension,dimension]; Real observedBodyPosition[dimension];
    Real valid; Real matchCount; Real registrationRms; Real registrationRejectionReason;
    Real currentIndex[featureCapacity]; Real currentDescriptor[featureCapacity,descriptorSize];
    Real currentPoint[featureCapacity,dimension]; Real currentEnabled[featureCapacity];
    Real currentFromReference[dimension,dimension]; Real currentFromReferenceTranslation[dimension];
    Real relativeCovariance[poseDimension,poseDimension]; Real conditionalObservationCovariance[poseDimension,poseDimension];
    Real relativeValid; Real uncertaintyRejectionReason; Real uncertaintyValidCount; Real uncertaintyInvalidCount;
    Real descriptionInvalidCount; Real matchingConfigurationValid; Real invalidReference; Real invalidCurrent;
    Real pairEnabled[featureCapacity]; Real registrationAccepted; Real registrationValidCount;
    Real registrationInvalidCount; Real registrationRank; Real uncertaintyValid;
  algorithm
    reference := previous.estimator.localization.estimator;
    sameGeometry := SLAMExactRealEqual(reference.referenceBaseline,calibration[7])
      and SLAMExactRealEqual(reference.referenceDisparityNoise,calibration[8]);
    for axis in 1:dimension loop
      sameGeometry := sameGeometry and SLAMExactRealEqual(reference.referenceCameraOriginBody[axis],calibration[9+axis]);
      for column in 1:dimension loop
        sameGeometry := sameGeometry and SLAMExactRealEqual(reference.referenceOpticalToBody[axis,column],opticalToBody[axis,column]);
      end for;
    end for;
    usableReferenceCount := if SLAMExactRealEqual(reference.referenceAvailable,1.0) and sameGeometry then reference.referenceCount else 0.0;
    (observedBodyRotation,observedBodyPosition,valid,matchCount,registrationRms,registrationRejectionReason,
      currentIndex,currentDescriptor,currentPoint,currentEnabled,currentFromReference,currentFromReferenceTranslation,
      relativeCovariance,conditionalObservationCovariance,relativeValid,uncertaintyRejectionReason,
      uncertaintyValidCount,uncertaintyInvalidCount,descriptionInvalidCount,matchingConfigurationValid,
      invalidReference,invalidCurrent,pairEnabled,registrationAccepted,registrationValidCount,
      registrationInvalidCount,registrationRank,uncertaintyValid) := ObserveRGBDRelativeFrame(
      rgb=rgb,depth=depth,pixels=pixels,activeCount=activeCount,
      rgbCalibration={calibration[5],calibration[6],calibration[3],calibration[4]},depthCalibration=calibration[1:4],noiseReferenceFx=calibration[9],
      referenceDescriptor=reference.referenceDescriptor,referencePoint=reference.referencePoint,
      referenceEnabled=reference.referenceEnabled,referenceCount=usableReferenceCount,
      referenceRgbFocal={reference.referenceRgbCalibration[1],reference.referenceRgbCalibration[2]},
      referenceNoiseReferenceFx=reference.referenceNoiseReferenceFx,imageEnabled=true,
      disparityNoise=calibration[8],baseline=calibration[7],referenceBodyRotation=reference.referenceRotation,
      referenceBodyPosition=reference.referencePosition,opticalToBody=opticalToBody,cameraOriginBody=calibration[10:12],depthUnits=depthUnits);
    // valid is the frontend pose validity after matching-configuration admission;
    // relativeValid also requires the independent uncertainty owner to admit.
    diagnostics := {registrationAccepted,registrationRejectionReason,registrationRms,registrationRank,
      relativeValid,uncertaintyRejectionReason,uncertaintyValid,matchCount,descriptionInvalidCount,
      EnabledCount(currentEnabled),matchingConfigurationValid,invalidReference,invalidCurrent,
      registrationValidCount,registrationInvalidCount,valid};
    matchedPairs := zeros(featureCapacity,7);
    for pair in 1:featureCapacity loop
      if pairEnabled[pair] == 1.0 and currentIndex[pair] >= 1.0 and currentIndex[pair] <= featureCapacity then
        matchedPairs[pair,1:3] := reference.referencePoint[pair,:];
        matchedPairs[pair,4:6] := currentPoint[integer(currentIndex[pair]),:];
        matchedPairs[pair,7] := 1.0;
      end if;
    end for;
  end Evaluate;

  function CaptureFailure
    input RGBDGraphProcessing.State previous;
    input RGBDLocalizationCatalog.Estimator estimated "Accepted current producer, before any graph correction";
    input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
    input Real pixels[RGBDKeyframes.featureCapacity,2]; input Real activeCount;
    input Real calibration[14]; input Real opticalToBody[3,3];
    input Integer epoch; input Real imageTime;
    input Real producerFlags[2] "Actual observationAccepted and captureAccepted receipts";
    input Real depthUnits = 1.0;
    output Real stages[26] "Frame/policy/graph receipts, projected candidates, mapping admission/reasons, frame binding";
  protected
    Real descriptor[RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize];
    Real point[RGBDKeyframes.featureCapacity,3]; Real enabled[RGBDKeyframes.featureCapacity];
    Real invalidCount; Boolean frameAccepted; Boolean frameBound; Integer frameReason;
    Real candidatePoint[RGBDKeyframes.featureCapacity,3];
    Real candidateEnabled[RGBDKeyframes.featureCapacity];
    Real projectedCount; Real projectionInvalidCount; Real projectionConfiguration; Real projectionPose;
    RGBDKeyframes.Frame measurement; RGBDKeyframes.Catalog policyCatalog;
    RGBDKeyframePolicy.Decision decision; RGBDCatalogGraphCapture.Result visual;
    RGBDCatalogMapping.Result mapped;
  algorithm
    // Diagnostic replay only: reuse the production descriptor, frame, policy
    // capture, projection and map owners. Never publish any diagnostic proposal.
    stages := zeros(size(stages,1));
    (descriptor,point,enabled,invalidCount) := DescribeRGBDFrame(rgb,depth,pixels,activeCount,
      {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
      calibration[8],calibration[9],calibration[7],0.28,10.0,1e-6,depthUnits=depthUnits);
    (measurement,frameAccepted,frameReason) := RGBDLocalizationFrame.Build(
      previous.estimator.localization.generation,previous.estimator.localization.catalog.nextId,
      epoch,epoch,imageTime,activeCount,descriptor,point,enabled,pixels,
      {size(rgb,1),size(rgb,2)},{size(depth,1),size(depth,2)},
      {calibration[5],calibration[6],calibration[3],calibration[4]},calibration[1:4],
      opticalToBody,calibration[10:12],calibration[8],calibration[9],calibration[7],
      estimated.position,estimated.rotation,estimated.covariance,
      previous.estimator.localization.catalog.vocabularyVersion,
      if producerFlags[1] > 0.5 or producerFlags[2] > 0.5 then 1.0 else 0.0,true);
    stages[1:2] := {if frameAccepted then 1.0 else 0.0,frameReason};
    frameBound := RGBDLocalizationCatalog.FrameBound(previous.estimator.localization,
      estimated,measurement,epoch,imageTime,producerFlags[1],producerFlags[2],frameAccepted);
    stages[26] := if frameBound then 1.0 else 0.0;
    if frameBound then
      policyCatalog := previous.estimator.localization.catalog;
      policyCatalog.bodyPositions := previous.estimator.poses.positions;
      policyCatalog.bodyRotations := previous.estimator.poses.rotations;
      decision := RGBDKeyframePolicy.Select(policyCatalog,measurement,true,1.0,true);
      stages[3:5] := {if decision.valid then 1.0 else 0.0,
        if decision.captureRequested then 1.0 else 0.0,decision.reason};
      if decision.valid and decision.captureRequested then
        visual := RGBDCatalogGraphCapture.Capture(previous.estimator.localization.catalog,
          measurement,previous.vocabulary.words,previous.vocabulary.enabled,
          previous.estimator.localization.graph,true);
        stages[6:12] := {if visual.accepted then 1.0 else 0.0,visual.rejectionReason,
          visual.loopDiagnostics.retrievalRejectionReason,visual.sequentialDiagnostics.rejectionReason,
          visual.graphDiagnostics.rejectionReason,visual.sequentialDiagnostics.matchedCount,
          visual.sequentialDiagnostics.inlierCount};
        if visual.accepted then
          (candidatePoint,candidateEnabled,projectedCount,projectionInvalidCount,
            projectionConfiguration,projectionPose) := RGBDProjectLandmarks(
              point,enabled,activeCount,1.0,estimated.rotation,estimated.position,
              opticalToBody,calibration[10:12]);
          stages[13:16] := {projectionConfiguration,projectionPose,projectedCount,projectionInvalidCount};
          mapped := RGBDCatalogMapping.Capture(previous.estimator.localization.catalog,
            previous.estimator.localization.graph,previous.estimator.localization.map,
            visual,candidatePoint,candidateEnabled,1.0,true,
            previousNodePosition=previous.estimator.poses.positions,
            previousNodeRotation=previous.estimator.poses.rotations,
            previousPoseRevision=previous.estimator.poses.revision);
          stages[17:25] := {if mapped.accepted then 1.0 else 0.0,mapped.rejectionReason,
            mapped.diagnostics.catalogUpdateRejectionReason,mapped.diagnostics.catalogRejectionReason,
            mapped.diagnostics.correctionReason,mapped.diagnostics.updateRejectionReason,
            mapped.diagnostics.mapRejectionReason,mapped.diagnostics.anchorRejectionReason,
            mapped.diagnostics.invalidCandidateCount};
        end if;
      end if;
    end if;
  end CaptureFailure;
end RGBDRenderedVisualDiagnostics;
