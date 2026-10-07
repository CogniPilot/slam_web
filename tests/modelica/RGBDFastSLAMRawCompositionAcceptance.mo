// Actual raw producer -> vocabulary/catalog/map -> optional graph correction.
// This tests Modelica composition and ownership, not browser/WASM admission.
package RGBDFastSLAMRawCompositionReference
  constant Integer featureCapacity = RGBDKeyframes.featureCapacity;
  constant Integer dimension = RGBDKeyframes.dimension;
  record Outcome
    RGBDGraphProcessing.State next;
    Boolean accepted; Boolean imageCompleted; Boolean mappingAccepted;
    Boolean graphCorrectionAccepted; Boolean roundoffCertified;
    Integer publicationReason; Integer ledgerReason; Integer vocabularyReason; Integer graphReason;
    Integer graphCommitReason; Integer graphFilterReason; Integer covarianceStatus;
    Real graphCostBefore; Real graphCostAfter; Real nextQuaternion[4];
    Real selectionValid; Real predictionAccepted; Real initializationAccepted;
    Real observationAccepted; Real captureAccepted; Real matchCount;
    Real features[featureCapacity,dimension]; Real featureEnabled[featureCapacity];
    Real trackingCurrentPixel[featureCapacity,2]; Real trackingReferencePixel[featureCapacity,2];
    Real trackingEnabled[featureCapacity];
  end Outcome;

  function Process
    input RGBDGraphProcessing.State previous;
    input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
    input Boolean initializing; input Boolean forceCapture; input Boolean graphRequested;
    input Real depthUnits = 1.0;
    output Outcome result;
  algorithm
    if initializing then
      (result.next,result.accepted,result.imageCompleted,result.mappingAccepted,
        result.graphCorrectionAccepted,result.roundoffCertified,result.publicationReason,
        result.ledgerReason,result.vocabularyReason,result.graphReason,result.graphCommitReason,
        result.graphFilterReason,result.covarianceStatus,result.graphCostBefore,result.graphCostAfter,
        result.nextQuaternion,result.selectionValid,result.predictionAccepted,result.initializationAccepted,
        result.observationAccepted,result.captureAccepted,result.matchCount,result.features,result.featureEnabled,
        result.trackingCurrentPixel,result.trackingReferencePixel,result.trackingEnabled) := InitializeFastSLAM(
          previous=previous,rgb=rgb,depth=depth,depthUnits=depthUnits,
          rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
          disparityNoise=0.08,noiseReferenceFx=500,baseline=0.05,
          opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
          accel=zeros(3),gyro=zeros(3),gravity=zeros(3),density=fill(0.01,12),
          imageEpoch=1,intervalTime=0,h=0,graphCorrectionRequested=graphRequested);
    else
      (result.next,result.accepted,result.imageCompleted,result.mappingAccepted,
        result.graphCorrectionAccepted,result.roundoffCertified,result.publicationReason,
        result.ledgerReason,result.vocabularyReason,result.graphReason,result.graphCommitReason,
        result.graphFilterReason,result.covarianceStatus,result.graphCostBefore,result.graphCostAfter,
        result.nextQuaternion,result.selectionValid,result.predictionAccepted,result.initializationAccepted,
        result.observationAccepted,result.captureAccepted,result.matchCount,result.features,result.featureEnabled,
        result.trackingCurrentPixel,result.trackingReferencePixel,result.trackingEnabled) := AdvanceFastSLAM(
          previous=previous,rgb=rgb,depth=depth,depthUnits=depthUnits,
          rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
          disparityNoise=0.08,noiseReferenceFx=520,baseline=0.05,
          opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
          accel=zeros(3),gyro=zeros(3),gravity=zeros(3),density=fill(0.01,12),
          imageEpoch=2,intervalTime=0.2,h=0.2,graphCorrectionRequested=graphRequested,
          minimumInterval=if forceCapture then 0.05 else 0.5,
          maximumInterval=if forceCapture then 0.1 else 2.0);
    end if;
  end Process;

  // Test-only full-domain reduction. Keep the ordered numeric sum explicit:
  // OMC can otherwise expand sum(map.occupied) into a 14,399-deep binary tree.
  function SumMask
    input Real values[:];
    output Real total;
  algorithm
    total := 0.0;
    for index in 1:size(values,1) loop
      total := total+values[index];
    end for;
  end SumMask;

  function MapGeometry
    input RGBDGraphProcessing.State state; output Boolean valid;
  protected Integer slot; Real expected[3];
  algorithm
    valid := true;
    for point in 1:RGBDMapAnchors.mapCapacity loop
      if state.estimator.localization.map.occupied[point] == 1 then
        slot := state.estimator.localization.map.anchorSlot[point];
        valid := valid and slot >= 1 and slot <= RGBDKeyframes.keyframeCapacity;
        if slot >= 1 and slot <= RGBDKeyframes.keyframeCapacity then
          valid := valid and state.estimator.poses.enabled[slot]
            and state.estimator.poses.ids[slot] == state.estimator.localization.map.anchorId[point];
          expected := state.estimator.poses.positions[slot,:]+state.estimator.poses.rotations[slot,:,:]
            *state.estimator.localization.map.localPoint[point,:];
          for axis in 1:3 loop
            valid := valid and abs(expected[axis]-state.estimator.localization.map.point[point,axis]) < 1e-8;
          end for;
        end if;
      end if;
    end for;
  end MapGeometry;

  function Run
    input Integer phase;
    input Real clock "Reference harness clock; acquisition times remain explicit";
    input Boolean rawCamera = false;
    output Boolean checks[30]; output Real raw[24];
  protected
    RGBDGraphProcessing.State fresh;
    Outcome initialized; Outcome advanced;
    Real rgb[90,160,if rawCamera then 3 else 4]; Real depth[90,160]; Real unusedPixels[350,2];
    Real P[15,15]; Real R[3,3]; Real p[3];
    Integer occupied;
  algorithm
    checks := fill(true,30); raw := zeros(24);
    P := RGBDLocalizationInitializeTests.Covariance(); R := [0,-1,0;1,0,0;0,0,1]; p := {1,-2,0.5};
    fresh := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(p,{-0.29,0.01,0.01},R,zeros(3),zeros(3),P),1,1,1,0));
    checks[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(fresh);
    (rgb,depth,unusedPixels) := RGBDFastAdvanceReference.Image(false,if rawCamera then 3 else 4,if rawCamera then 0.001 else 1.0);
    initialized := Process(fresh,rgb,depth,true,false,false,if rawCamera then 0.001 else 1.0);
    checks[2] := initialized.accepted and initialized.publicationReason == 0;
    checks[3] := initialized.imageCompleted and initialized.mappingAccepted;
    checks[4] := initialized.selectionValid == 1 and initialized.initializationAccepted == 1
      and initialized.captureAccepted == 1 and initialized.predictionAccepted == 0
      and initialized.observationAccepted == 0 and initialized.matchCount == 0;
    checks[5] := RGBDGraphProcessing.Valid(initialized.next) and initialized.next.estimator.localization.initialized
      and initialized.next.estimator.localization.predictionTime == 0
      and initialized.next.estimator.localization.steps == 1
      and initialized.next.estimator.localization.lastProcessedImageEpoch == 1
      and initialized.next.estimator.localization.lastProcessedImageTime == 0;
    checks[6] := initialized.next.estimator.localization.estimator.referenceCount >= 12
      and initialized.next.estimator.localization.estimator.referenceAvailable == 1
      and initialized.next.estimator.localization.estimator.referenceEpoch == 1
      and initialized.next.estimator.localization.estimator.referenceUsed == 0
      and initialized.next.estimator.localization.estimator.lastUsedEpoch == -1;
    checks[7] := initialized.next.vocabulary.ready and initialized.next.vocabulary.count >= 8
      and initialized.next.vocabulary.generation == 1 and initialized.next.vocabulary.sourceRevision == 1;
    checks[8] := initialized.next.estimator.localization.catalog.nextId == 2
      and initialized.next.estimator.localization.catalog.occupied[1]
      and initialized.next.estimator.localization.catalog.epochs[1] == 1
      and initialized.next.estimator.localization.catalog.counts[1] == initialized.next.estimator.localization.estimator.referenceCount;
    checks[9] := RGBDLocalizationInitializeTests.CloseMatrix(initialized.next.estimator.localization.catalog.descriptors[1,:,:],
      initialized.next.estimator.localization.estimator.referenceDescriptor,1e-12)
      and RGBDLocalizationInitializeTests.CloseMatrix(initialized.next.estimator.localization.catalog.opticalPoints[1,:,:],
        initialized.next.estimator.localization.estimator.referencePoint,1e-12);
    checks[10] := initialized.next.captures.catalogNextId == 2 and initialized.next.captures.lastStep == 1
      and initialized.next.captures.ids[1] == 1 and initialized.next.captures.epochs[1] == 1
      and initialized.next.captures.sequences[1] == 1 and initialized.next.estimator.poses.ids[1] == 1;
    checks[11] := MapGeometry(initialized.next) and SumMask(initialized.next.estimator.localization.map.occupied) > 0
      and initialized.next.estimator.localization.map.imageEpoch == 1;
    checks[12] := RGBDLocalizationInitializeTests.CloseVector(initialized.nextQuaternion,
      RGBDLocalizationAdvanceReference.Quaternion(R),1e-12)
      and RGBDLocalizationInitializeTests.CloseVector(initialized.next.estimator.localization.estimator.position,p,1e-12);
    raw[1:12] := {if initialized.accepted then 1 else 0,if initialized.imageCompleted then 1 else 0,
      if initialized.mappingAccepted then 1 else 0,initialized.initializationAccepted,initialized.captureAccepted,
      SumMask(initialized.featureEnabled),initialized.next.vocabulary.count,initialized.next.estimator.localization.catalog.nextId,
      SumMask(initialized.next.estimator.localization.map.occupied),initialized.publicationReason,initialized.ledgerReason,initialized.vocabularyReason};
    if phase >= 2 then
      (rgb,depth,unusedPixels) := RGBDFastAdvanceReference.Image(true,if rawCamera then 3 else 4,if rawCamera then 0.001 else 1.0);
      advanced := Process(initialized.next,rgb,depth,false,phase >= 3,phase >= 3,if rawCamera then 0.001 else 1.0);
      checks[13] := advanced.accepted and advanced.imageCompleted and advanced.predictionAccepted == 1
        and advanced.initializationAccepted == 0 and advanced.observationAccepted == 1
        and advanced.captureAccepted == 0 and advanced.matchCount >= 12;
      checks[14] := RGBDGraphProcessing.Valid(advanced.next) and advanced.next.estimator.localization.steps == 2
        and advanced.next.estimator.localization.predictionTime == 0.2
        and advanced.next.estimator.localization.lastProcessedImageEpoch == 2
        and advanced.next.estimator.localization.estimator.referenceUsed == 1
        and advanced.next.estimator.localization.estimator.lastUsedEpoch == 2
        and advanced.next.estimator.localization.estimator.referenceEpoch == 1;
      checks[15] := RGBDLocalizationInitializeTests.CloseMatrix(advanced.next.estimator.localization.catalog.descriptors[1,:,:],
        initialized.next.estimator.localization.catalog.descriptors[1,:,:],1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(advanced.next.estimator.localization.catalog.opticalPoints[1,:,:],
          initialized.next.estimator.localization.catalog.opticalPoints[1,:,:],1e-12)
        and RGBDLocalizationInitializeTests.CloseVector(advanced.next.estimator.localization.catalog.bodyPositions[1,:],p,1e-12);
      checks[16] := advanced.next.vocabulary.count == initialized.next.vocabulary.count
        and RGBDLocalizationInitializeTests.CloseMatrix(advanced.next.vocabulary.words,initialized.next.vocabulary.words,1e-12);
      checks[17] := MapGeometry(advanced.next);
      checks[18] := RGBDLocalizationInitializeTests.CloseVector(advanced.nextQuaternion,
        RGBDLocalizationAdvanceReference.Quaternion(advanced.next.estimator.localization.estimator.rotation),1e-10);
      checks[19] := advanced.mappingAccepted and advanced.next.estimator.localization.map.imageEpoch == 2;
      checks[20] := advanced.next.captures.lastStep == 2 and advanced.next.captures.sequences[1] == 1
        and advanced.next.captures.epochs[1] == 1;
      checks[21] := SumMask(advanced.featureEnabled) >= 12 and SumMask(advanced.trackingEnabled) >= 12;
      checks[22] := advanced.publicationReason == 0 and advanced.ledgerReason == 0;
      checks[23] := if phase == 2 then advanced.next.estimator.localization.catalog.nextId == 2 else true;
      checks[24] := if phase == 2 then advanced.next.estimator.localization.graph.revision
        == initialized.next.estimator.localization.graph.revision else true;
      checks[25] := if phase == 2 then not advanced.graphCorrectionAccepted
        and advanced.next.attempt.graphRevision == initialized.next.attempt.graphRevision else true;
      checks[26] := if phase == 2 then advanced.next.estimator.correctionRevision == 0 else true;
      if phase >= 3 then
        checks[27] := advanced.next.estimator.localization.catalog.nextId == 3
          and advanced.next.estimator.localization.graph.revision == 2
          and advanced.next.estimator.localization.graph.edges[1].enabled
          and advanced.next.estimator.localization.graph.edges[1].kind == 1
          and advanced.next.estimator.localization.graph.edges[1].referenceEpoch == 1
          and advanced.next.estimator.localization.graph.edges[1].currentEpoch == 2;
        checks[28] := RGBDLocalizationInitializeTests.CloseMatrix(
          advanced.next.estimator.localization.graph.edges[1].rotation,identity(3),1e-8)
          and RGBDLocalizationInitializeTests.CloseVector(
            advanced.next.estimator.localization.graph.edges[1].translation,{0,0.06,0},1e-8);
        checks[29] := advanced.graphCorrectionAccepted and advanced.next.estimator.correctionRevision == 1
          and advanced.next.estimator.graphRevisionUsed == 2 and advanced.next.attempt.graphRevision == 2;
        checks[30] := advanced.graphReason == 0 and advanced.graphCostAfter <= advanced.graphCostBefore;
      end if;
      raw[13:24] := {if advanced.accepted then 1 else 0,if advanced.imageCompleted then 1 else 0,
        if advanced.mappingAccepted then 1 else 0,advanced.observationAccepted,advanced.captureAccepted,advanced.matchCount,
        SumMask(advanced.next.estimator.localization.map.occupied),advanced.next.estimator.localization.catalog.nextId,
        advanced.next.estimator.localization.graph.revision,if advanced.graphCorrectionAccepted then 1 else 0,
        advanced.graphReason,advanced.graphCostAfter};
    end if;
  end Run;

  function InitializeChecks
    input Real clock;
    output Boolean checks[12]; output Real raw[24];
  protected Boolean allChecks[30];
  algorithm
    (allChecks,raw) := Run(1,clock);
    for i in 1:12 loop checks[i] := allChecks[i]; end for;
  end InitializeChecks;

  function StepChecks
    input Real clock;
    output Boolean checks[26]; output Real raw[24];
  protected Boolean allChecks[30];
  algorithm
    (allChecks,raw) := Run(2,clock);
    for i in 1:26 loop checks[i] := allChecks[i]; end for;
  end StepChecks;
end RGBDFastSLAMRawCompositionReference;

model RGBDFastSLAMRawInitializeAcceptance
  output Boolean checks[12]; output Real raw[24];
equation
  (checks,raw) = RGBDFastSLAMRawCompositionReference.InitializeChecks(time);
end RGBDFastSLAMRawInitializeAcceptance;

model RGBDFastSLAMRawStepAcceptance
  output Boolean checks[26]; output Real raw[24];
equation
  (checks,raw) = RGBDFastSLAMRawCompositionReference.StepChecks(time);
end RGBDFastSLAMRawStepAcceptance;

model RGBDFastSLAMRawGraphAcceptance
  output Boolean checks[30]; output Real raw[24];
equation
  (checks,raw) = RGBDFastSLAMRawCompositionReference.Run(3,time);
end RGBDFastSLAMRawGraphAcceptance;

model RGBDFastSLAMZ16GraphAcceptance
  output Boolean checks[30]; output Real raw[24];
equation
  (checks,raw) = RGBDFastSLAMRawCompositionReference.Run(3,time,true);
end RGBDFastSLAMZ16GraphAcceptance;
