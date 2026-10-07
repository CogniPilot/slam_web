// OMC reference only: complete raw images, retained State, vocabulary query,
// measured loop admission and anchored-map graph correction. No native claim.
package RGBDFastSLAMRawLoopReference
  function Step
    input RGBDGraphProcessing.State previous;
    input Real rgb[90,160,4]; input Real depth[90,160]; input Integer frame;
    output RGBDFastSLAMRawCompositionReference.Outcome result;
  algorithm
    (result.next,result.accepted,result.imageCompleted,result.mappingAccepted,
        result.graphCorrectionAccepted,result.roundoffCertified,result.publicationReason,
        result.ledgerReason,result.vocabularyReason,result.graphReason,result.graphCommitReason,
        result.graphFilterReason,result.covarianceStatus,result.graphCostBefore,result.graphCostAfter,
        result.nextQuaternion,result.selectionValid,result.predictionAccepted,result.initializationAccepted,
        result.observationAccepted,result.captureAccepted,result.matchCount,result.features,result.featureEnabled,
        result.trackingCurrentPixel,result.trackingReferencePixel,result.trackingEnabled) := AdvanceFastSLAM(
      previous=previous,rgb=rgb,depth=depth,
      rgbCalibration=RGBDVisualRelativeReference.referenceRgb,depthCalibration=RGBDVisualRelativeReference.referenceDepth,
      disparityNoise=0.08,noiseReferenceFx=520,baseline=0.05,
      opticalToBody=[0,0,1;-1,0,0;0,-1,0],cameraOriginBody={0.18,-0.09,0.07},
      accel=zeros(3),gyro=zeros(3),gravity=zeros(3),density=fill(0.01,12),
      imageEpoch=frame+1,intervalTime=0.2*frame,h=0.2,
      imageRequested=true,localCaptureRequested=true,requested=true,
      minimumInterval=if frame == 1 or frame == 30 then 0.05 else 0.5,
      maximumInterval=if frame == 1 or frame == 30 then 0.1 else 100,
      translationThreshold=100,rotationThreshold=3.14,
      graphCorrectionRequested=frame == 30);
  end Step;

  function Run
    input Real clock;
    output Boolean checks[24]; output Real raw[24];
  protected
    RGBDGraphProcessing.State state;
    RGBDFastSLAMRawCompositionReference.Outcome initialized;
    RGBDFastSLAMRawCompositionReference.Outcome advanced;
    Real rgb[90,160,4]; Real depth[90,160]; Real unusedPixels[350,2];
    Real P[15,15]; Real R[3,3]; Real p[3];
    Integer acceptedCount; Integer completedCount; Integer mappedCount; Integer predictedCount;
    Integer firstRejected; Integer localCaptures; Integer nodes; Integer edges; Integer loops; Integer sequential;
    Boolean firstLoop;
  algorithm
    checks := fill(true,24); raw := zeros(24);
    acceptedCount := 0; completedCount := 0; mappedCount := 0; predictedCount := 0;
    firstRejected := 0; localCaptures := 0; nodes := 0; edges := 0; loops := 0; sequential := 0; firstLoop := false;
    P := RGBDLocalizationInitializeTests.Covariance(); R := [0,-1,0;1,0,0;0,0,1]; p := {1,-2,0.5};
    state := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(p,zeros(3),R,zeros(3),zeros(3),P),1,1,1,0));
    checks[1] := clock >= 0 and clock <= 0.001 and RGBDGraphProcessing.Valid(state);
    (rgb,depth,unusedPixels) := RGBDFastAdvanceReference.Image(false);
    initialized := RGBDFastSLAMRawCompositionReference.Process(state,rgb,depth,true,false,false);
    checks[2] := initialized.accepted and initialized.imageCompleted and initialized.mappingAccepted
      and initialized.initializationAccepted == 1 and initialized.captureAccepted == 1
      and initialized.predictionAccepted == 0 and initialized.selectionValid == 1;
    checks[3] := RGBDGraphProcessing.Valid(initialized.next)
      and initialized.next.estimator.localization.catalog.nextId == 2
      and initialized.next.estimator.localization.catalog.ids[1] == 1
      and initialized.next.estimator.localization.catalog.epochs[1] == 1
      and initialized.next.estimator.localization.catalog.imageTimes[1] == 0
      and initialized.next.estimator.localization.estimator.referenceEpoch == 1
      and initialized.next.vocabulary.ready and initialized.next.vocabulary.count >= 8;
    state := initialized.next;
    for frame in 1:30 loop
      (rgb,depth,unusedPixels) := RGBDFastAdvanceReference.Image(frame <> 30);
      advanced := Step(state,rgb,depth,frame);
      acceptedCount := acceptedCount+(if advanced.accepted then 1 else 0);
      completedCount := completedCount+(if advanced.imageCompleted then 1 else 0);
      mappedCount := mappedCount+(if advanced.mappingAccepted then 1 else 0);
      predictedCount := predictedCount+integer(advanced.predictionAccepted);
      localCaptures := localCaptures+integer(advanced.captureAccepted);
      if firstRejected == 0 and not advanced.accepted then firstRejected := frame; end if;
      checks[4] := checks[4] and advanced.accepted and advanced.publicationReason == 0 and advanced.ledgerReason == 0;
      checks[5] := checks[5] and advanced.imageCompleted and advanced.mappingAccepted
        and advanced.selectionValid == 1 and advanced.predictionAccepted == 1 and advanced.initializationAccepted == 0;
      checks[6] := checks[6] and advanced.matchCount >= 12
        and RGBDFastSLAMRawCompositionReference.SumMask(advanced.featureEnabled) >= 12;
      checks[7] := checks[7] and RGBDGraphProcessing.Valid(advanced.next);
      checks[8] := checks[8] and advanced.next.estimator.localization.steps == frame+1
        and abs(advanced.next.estimator.localization.predictionTime-0.2*frame) < 1e-12;
      checks[9] := checks[9] and advanced.next.estimator.localization.lastProcessedImageEpoch == frame+1
        and abs(advanced.next.estimator.localization.lastProcessedImageTime-0.2*frame) < 1e-12;
      checks[10] := checks[10] and advanced.next.estimator.localization.catalog.nextId == (if frame == 30 then 4 else 3);
      checks[11] := checks[11] and advanced.next.estimator.localization.catalog.ids[1] == 1
        and advanced.next.estimator.localization.catalog.ids[2] == 2
        and advanced.next.estimator.localization.catalog.epochs[1] == 1
        and advanced.next.estimator.localization.catalog.epochs[2] == 2
        and advanced.next.estimator.localization.catalog.imageTimes[1] == 0
        and advanced.next.estimator.localization.catalog.imageTimes[2] == 0.2;
      checks[12] := checks[12] and advanced.next.captures.lastStep == frame+1
        and advanced.next.captures.catalogNextId == (if frame == 30 then 4 else 3)
        and advanced.next.captures.ids[1] == 1 and advanced.next.captures.ids[2] == 2
        and advanced.next.captures.sequences[1] == 1 and advanced.next.captures.sequences[2] == 2;
      checks[13] := checks[13] and advanced.next.estimator.localization.estimator.referenceAvailable == 1
        and advanced.next.estimator.localization.estimator.referenceEpoch >= 1
        and advanced.next.estimator.localization.estimator.referenceEpoch <= frame+1;
      if advanced.captureAccepted == 1 then
        checks[13] := checks[13] and advanced.next.estimator.localization.estimator.referenceEpoch == frame+1;
      else
        checks[13] := checks[13]
          and advanced.next.estimator.localization.estimator.referenceEpoch == state.estimator.localization.estimator.referenceEpoch
          and RGBDLocalizationInitializeTests.CloseMatrix(advanced.next.estimator.localization.estimator.referenceDescriptor,
            state.estimator.localization.estimator.referenceDescriptor,1e-12)
          and RGBDLocalizationInitializeTests.CloseMatrix(advanced.next.estimator.localization.estimator.referencePoint,
            state.estimator.localization.estimator.referencePoint,1e-12);
      end if;
      checks[14] := checks[14] and RGBDLocalizationInitializeTests.CloseMatrix(
        advanced.next.estimator.localization.catalog.descriptors[1,:,:],initialized.next.estimator.localization.catalog.descriptors[1,:,:],1e-12)
        and RGBDLocalizationInitializeTests.CloseMatrix(advanced.next.estimator.localization.catalog.opticalPoints[1,:,:],
          initialized.next.estimator.localization.catalog.opticalPoints[1,:,:],1e-12);
      checks[15] := checks[15] and (if frame < 30 then not advanced.graphCorrectionAccepted
        and advanced.next.estimator.correctionRevision == 0 else true);
      checks[16] := checks[16] and RGBDFastSLAMRawCompositionReference.MapGeometry(advanced.next);
      checks[17] := checks[17] and abs(advanced.nextQuaternion[1]^2+advanced.nextQuaternion[2]^2
        +advanced.nextQuaternion[3]^2+advanced.nextQuaternion[4]^2-1) < 1e-8;
      // Whole returned owner is carried. No reconstruction of estimator,
      // reference, catalog, vocabulary, map, graph or acquisition ledger.
      state := advanced.next;
    end for;
    for slot in 1:RGBDKeyframes.keyframeCapacity loop
      if state.estimator.localization.catalog.occupied[slot] then nodes := nodes+1; end if;
    end for;
    for slot in 1:RGBDGraphMeasurements.edgeCapacity loop
      if state.estimator.localization.graph.edges[slot].enabled then
        edges := edges+1;
        if state.estimator.localization.graph.edges[slot].kind == 1 then sequential := sequential+1; end if;
        if state.estimator.localization.graph.edges[slot].kind == 2 then
          loops := loops+1;
          if state.estimator.localization.graph.edges[slot].referenceId == 1
            and state.estimator.localization.graph.edges[slot].currentId == 3 then
            firstLoop := state.estimator.localization.graph.edges[slot].referenceEpoch == 1
              and state.estimator.localization.graph.edges[slot].currentEpoch == 31
              and RGBDLocalizationInitializeTests.CloseMatrix(state.estimator.localization.graph.edges[slot].rotation,identity(3),1e-8)
              and RGBDLocalizationInitializeTests.CloseVector(state.estimator.localization.graph.edges[slot].translation,zeros(3),1e-8);
          end if;
        end if;
      end if;
    end for;
    checks[18] := nodes == 3 and state.estimator.localization.catalog.ids[3] == 3
      and state.estimator.localization.catalog.epochs[3] == 31
      and state.estimator.localization.catalog.imageTimes[3] == 6;
    checks[19] := loops >= 1 and firstLoop;
    checks[20] := sequential == 2 and edges >= 3 and state.estimator.localization.graph.revision == 3
      and RGBDGraphMeasurements.ValidState(state.estimator.localization.catalog,state.estimator.localization.graph);
    checks[21] := advanced.graphCorrectionAccepted and advanced.graphReason == 0
      and state.estimator.correctionRevision == 1 and state.estimator.graphRevisionUsed == 3 and state.attempt.graphRevision == 3;
    checks[22] := RGBDFastSLAMRawCompositionReference.MapGeometry(state)
      and RGBDFastSLAMRawCompositionReference.SumMask(state.estimator.localization.map.occupied) > 0;
    checks[23] := advanced.graphCostAfter <= advanced.graphCostBefore;
    checks[24] := acceptedCount == 30 and completedCount == 30 and mappedCount == 30 and predictedCount == 30;
    raw := {if initialized.accepted then 1 else 0,state.estimator.localization.steps,acceptedCount,completedCount,mappedCount,predictedCount,
      firstRejected,localCaptures,state.estimator.localization.catalog.nextId,state.estimator.localization.estimator.referenceEpoch,
      state.estimator.localization.estimator.referenceUsed,state.estimator.localization.estimator.lastUsedEpoch,
      state.estimator.localization.catalog.lastTime,nodes,edges,loops,state.estimator.localization.graph.revision,
      if advanced.graphCorrectionAccepted then 1 else 0,state.estimator.correctionRevision,advanced.graphReason,
      advanced.graphCommitReason,advanced.graphFilterReason,
      RGBDFastSLAMRawCompositionReference.SumMask(state.estimator.localization.map.occupied),advanced.graphCostAfter};
  end Run;
end RGBDFastSLAMRawLoopReference;

model RGBDFastSLAMRawLoopAcceptance
  output Boolean checks[24]; output Real raw[24];
equation
  (checks,raw) = RGBDFastSLAMRawLoopReference.Run(time);
end RGBDFastSLAMRawLoopAcceptance;
