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
end RGBDRenderedVisualDiagnostics;
