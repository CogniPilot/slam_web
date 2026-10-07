// Controlled accepted-proposal publication tests; not execution of localization/frontend.
package RGBDLocalizationCatalogTests
  function Captured
    input RGBDLocalizationCatalog.Estimator estimator; input RGBDKeyframes.Frame frame;
    output RGBDLocalizationCatalog.Estimator result;
  protected Integer selected;
  algorithm
    result := estimator; result.referenceAvailable := 1; result.referenceEpoch := frame.epoch; result.referenceUsed := 0;
    result.referencePosition := estimator.position; result.referenceRotation := estimator.rotation;
    for row in 1:15 loop
      for column in 1:6 loop
        selected := if column <= 3 then column else column+3;
        result.crossCovariance[row,column] := estimator.covariance[row,selected];
      end for;
    end for;
    for row in 1:6 loop
      for column in 1:6 loop
        result.referenceCovariance[row,column] := estimator.covariance[if row <= 3 then row else row+3,if column <= 3 then column else column+3];
      end for;
    end for;
    result.referenceCount := frame.count; result.referenceDescriptor := frame.descriptor; result.referencePoint := frame.opticalPoint;
    result.referencePixels := frame.pixels; result.referenceEnabled := zeros(350);
    for feature in 1:350 loop result.referenceEnabled[feature] := if frame.enabled[feature] then 1 else 0; end for;
    result.referenceRgbCalibration := frame.rgbCalibration; result.referenceDepthCalibration := frame.depthCalibration;
    result.referenceNoiseReferenceFx := frame.noiseReferenceFx; result.referenceDisparityNoise := frame.disparityNoise;
    result.referenceBaseline := frame.baseline; result.referenceOpticalToBody := frame.opticalToBody; result.referenceCameraOriginBody := frame.cameraOriginBody;
  end Captured;

  function EqualEstimator
    input RGBDLocalizationCatalog.Estimator a; input RGBDLocalizationCatalog.Estimator b; output Boolean equal;
  algorithm
    equal := a.referenceAvailable == b.referenceAvailable and a.referenceEpoch == b.referenceEpoch and a.referenceUsed == b.referenceUsed
      and a.lastUsedEpoch == b.lastUsedEpoch and a.referenceCount == b.referenceCount and a.referenceNoiseReferenceFx == b.referenceNoiseReferenceFx
      and a.referenceDisparityNoise == b.referenceDisparityNoise and a.referenceBaseline == b.referenceBaseline;
    for axis in 1:3 loop
      equal := equal and a.position[axis] == b.position[axis] and a.velocity[axis] == b.velocity[axis]
        and a.accelBias[axis] == b.accelBias[axis] and a.gyroBias[axis] == b.gyroBias[axis]
        and a.referencePosition[axis] == b.referencePosition[axis] and a.referenceCameraOriginBody[axis] == b.referenceCameraOriginBody[axis];
      for column in 1:3 loop equal := equal and a.rotation[axis,column] == b.rotation[axis,column]
        and a.referenceRotation[axis,column] == b.referenceRotation[axis,column]
        and a.referenceOpticalToBody[axis,column] == b.referenceOpticalToBody[axis,column]; end for;
    end for;
    for row in 1:15 loop
      for column in 1:15 loop equal := equal and a.covariance[row,column] == b.covariance[row,column]; end for;
      for column in 1:6 loop equal := equal and a.crossCovariance[row,column] == b.crossCovariance[row,column]; end for;
    end for;
    for row in 1:6 loop for column in 1:6 loop equal := equal and a.referenceCovariance[row,column] == b.referenceCovariance[row,column]; end for; end for;
    for coordinate in 1:4 loop equal := equal and a.referenceRgbCalibration[coordinate] == b.referenceRgbCalibration[coordinate]
      and a.referenceDepthCalibration[coordinate] == b.referenceDepthCalibration[coordinate]; end for;
    for feature in 1:350 loop
      equal := equal and a.referenceEnabled[feature] == b.referenceEnabled[feature];
      for coordinate in 1:49 loop equal := equal and a.referenceDescriptor[feature,coordinate] == b.referenceDescriptor[feature,coordinate]; end for;
      for coordinate in 1:3 loop equal := equal and a.referencePoint[feature,coordinate] == b.referencePoint[feature,coordinate]; end for;
      for coordinate in 1:2 loop equal := equal and a.referencePixels[feature,coordinate] == b.referencePixels[feature,coordinate]; end for;
    end for;
  end EqualEstimator;

  function EqualState
    input RGBDLocalizationCatalog.State a; input RGBDLocalizationCatalog.State b; output Boolean equal;
  algorithm
    equal := EqualEstimator(a.estimator,b.estimator) and RGBDCatalogGraphTests.EqualCatalog(a.catalog,b.catalog)
      and RGBDGraphMeasurementTests.EqualState(a.graph,b.graph) and RGBDCatalogMappingTests.EqualMap(a.map,b.map)
      and a.generation == b.generation and a.sourceRevision == b.sourceRevision and a.initialized == b.initialized
      and a.predictionTime == b.predictionTime and a.steps == b.steps and a.lastProcessedImageEpoch == b.lastProcessedImageEpoch
      and a.lastProcessedImageTime == b.lastProcessedImageTime and a.referenceBirth.generation == b.referenceBirth.generation
      and a.referenceBirth.epoch == b.referenceBirth.epoch and a.referenceBirth.sequence == b.referenceBirth.sequence
      and a.referenceBirth.catalogId == b.referenceBirth.catalogId;
  end EqualState;

  function HeldIntervals
    input RGBDLocalizationCatalog.State previous;
    input RGBDLocalizationCatalog.Estimator initializingEstimator;
    output Boolean checks[5];
  protected
    RGBDLocalizationCatalog.State initialState; RGBDLocalizationCatalog.State expected;
    RGBDLocalizationCatalog.Estimator proposed;
    RGBDLocalizationCatalog.Result result;
    RGBDKeyframes.Frame noImage;
    Real h; Real timestamp;
  algorithm
    checks:=fill(false,5);
    checks[1]:=RGBDLocalizationCatalog.ValidHeader(previous)
      and RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime+1.0/30.0,1.0/30.0,false,true)
      and RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime+0.2,0.2,false,true)
      and not RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime,0.0,false,true)
      and not RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime+0.200001,0.200001,false,true)
      and not RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime+0.04,1.0/30.0,false,true)
      and not RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime-0.01,-0.01,false,true)
      and not RGBDLocalizationCatalog.CanAdvance(previous,previous.predictionTime+1.0/30.0,1.0/30.0,false,false);
    initialState:=RGBDLocalizationCatalog.Empty(initializingEstimator,previous.generation,previous.sourceRevision,
      previous.generation,previous.sourceRevision);
    checks[2]:=RGBDLocalizationCatalog.CanAdvance(initialState,0.0,0.0,true,true)
      and not RGBDLocalizationCatalog.CanAdvance(initialState,0.0,1.0/30.0,true,true)
      and not RGBDLocalizationCatalog.CanAdvance(initialState,1.0/30.0,0.0,true,true)
      and not RGBDLocalizationCatalog.CanAdvance(initialState,0.0,0.0,false,true)
      and not RGBDLocalizationCatalog.CanAdvance(previous,0.0,0.0,true,true);
    proposed:=previous.estimator;
    proposed.position:=proposed.position+{0.01,-0.02,0.03};
    proposed.velocity:=proposed.velocity+{0.02,0.01,-0.01};
    for i in 1:15 loop proposed.covariance[i,i]:=proposed.covariance[i,i]+0.01; end for;
    proposed.crossCovariance:=0.99*proposed.crossCovariance;
    noImage:=RGBDKeyframes.EmptyFrame();
    for scenario in 1:3 loop
      h:=if scenario==1 then 1.0/30.0 elseif scenario==2 then 0.2 else 0.200001;
      timestamp:=previous.predictionTime+h;
      result:=RGBDLocalizationCatalog.Publish(previous,proposed,noImage,1.0,0.0,0.0,
        false,previous.lastProcessedImageEpoch,timestamp,h,false,false,1,true,
        zeros(350,3),zeros(350),zeros(256,49),zeros(256));
      expected:=previous;
      if scenario<=2 then
        expected.estimator:=proposed; expected.predictionTime:=timestamp; expected.steps:=previous.steps+1;
        checks[scenario+2]:=result.accepted and result.rejectionReason==0;
      else
        checks[5]:=not result.accepted and result.rejectionReason==3;
      end if;
      // Equality visits every estimator, catalog, graph and map cell plus the
      // processing/capture ledgers. No-image publication must hold those owners.
      checks[scenario+2]:=checks[scenario+2] and not result.imageCompleted and not result.mappingAccepted
        and RGBDCatalogObservationTests.EmptyProblem(result.problem) and EqualState(result.next,expected);
    end for;
  end HeldIntervals;

  function Run
    input Integer trials; input Real clock=0.0; output Boolean checks[24];
  protected
    RGBDLocalizationCatalog.Estimator priorEstimator; RGBDLocalizationCatalog.Estimator proposed; RGBDLocalizationCatalog.Estimator predicted;
    RGBDLocalizationCatalog.State base; RGBDLocalizationCatalog.State previous; RGBDLocalizationCatalog.State expected;
    RGBDLocalizationCatalog.Result result; RGBDCatalogGraphCapture.Result visual;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame measurement;
    Real covariance[15,15]; Real vocabulary[256,49]; Real enabled[256]; Real candidates[350,3]; Real mask[350]; Real local[3]; Real world[3];
    Real h; Real timestamp; Real producerAccepted; Real observationAccepted; Real captureAccepted;
    Boolean imageOn; Boolean initializing; Boolean frameAccepted; Boolean requested; Boolean accepts;
    Integer epoch; Integer expectedReason; Integer frameReason;
  algorithm
    assert(trials == 96 and RGBDKeyframes.featureCapacity == 350 and RGBDKeyframes.keyframeCapacity == 128
      and RGBDGraphMeasurements.edgeCapacity == 256 and RGBDCatalogMapping.mapCapacity == 14400,
      "Publish controls retain full350/49/15+6/128/256/14400/96 domains");
    reference := RGBDLoopVerificationTests.Reference(false);
    for row in 1:15 loop for column in 1:15 loop covariance[row,column] := (if row == column then 0.02*row else 0)+0.0001*row*column; end for; end for;
    priorEstimator := RGBDLocalizationCatalog.EmptyEstimator(reference.bodyPosition,{0.1,0.2,0.3},reference.bodyRotation,{0.01,0.02,0.03},{0.001,0.002,0.003},covariance);
    reference.epoch := 128; priorEstimator.lastUsedEpoch := 127; priorEstimator := Captured(priorEstimator,reference);
    base := RGBDLocalizationCatalog.Empty(priorEstimator,1,17,1,17); base.initialized := true; base.predictionTime := 140; base.steps := 199;
    base.lastProcessedImageEpoch := 199; base.lastProcessedImageTime := 140;
    base.catalog := RGBDCatalogLoopTests.FullCatalog(false); base.graph := RGBDGraphMeasurementTests.FullState();
    base.map.catalogRevision := 128; base.map.frame := 199; base.map.imageEpoch := 199; base.map.imageTime := 140;
    base.referenceBirth.epoch := 128; base.referenceBirth.sequence := 1; base.referenceBirth.catalogId := 128;
    predicted := priorEstimator; predicted.position := priorEstimator.position+{0.001,-0.002,0.003}; predicted.velocity := {1,2,3};
    predicted.accelBias := {0.02,0.03,0.04}; predicted.gyroBias := {0.002,0.003,0.004};
    for row in 1:15 loop
      predicted.covariance[row,row] := covariance[row,row]+0.01;
      for column in 1:6 loop predicted.crossCovariance[row,column] := 0.99*priorEstimator.crossCovariance[row,column]; end for;
    end for;
    predicted.lastUsedEpoch := 200; predicted.referenceUsed := 1;
    (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference); checks := fill(false,24);
    for scenario in 1:18 loop
      previous := base; proposed := predicted; h := 1.0/90+clock*0.001; timestamp := 140+h; epoch := 200;
      producerAccepted := 1; observationAccepted := 1; captureAccepted := 0; imageOn := true; initializing := false;
      frameAccepted := true; frameReason := 0; requested := true; accepts := true; expectedReason := 0;
      measurement := reference; measurement.id := 129; measurement.epoch := epoch; measurement.imageTime := timestamp; measurement.histogram := zeros(256);
      measurement.bodyPosition := proposed.position; measurement.bodyRotation := proposed.rotation;
      for row in 1:6 loop for column in 1:6 loop measurement.poseCovariance[row,column] := proposed.covariance[if row <= 3 then row else row+3,if column <= 3 then column else column+3]; end for; end for;
      if scenario == 2 then observationAccepted := 0;
      elseif scenario == 3 then measurement.poseCovariance[1,4] := measurement.poseCovariance[1,4]+0.1;
      elseif scenario == 4 then
        previous.map.occupied[14400] := 1; previous.map.point[14400,:] := {5,6,7}; previous.map.localPoint[14400,:] := {1,2,3};
        previous.map.anchorId[14400] := 128; previous.map.anchorSlot[14400] := 128; previous.map.confidence[14400] := 3;
        previous.map.lastSeen[14400] := 141; previous.map.lastFrame[14400] := 199;
      elseif scenario == 5 then
        previous.predictionTime := 128; previous.lastProcessedImageTime := 128; previous.map.imageTime := 128;
        timestamp := 128+h; measurement.imageTime := timestamp; observationAccepted := 0; captureAccepted := 1;
        proposed.lastUsedEpoch := 127; proposed := Captured(proposed,measurement);
      elseif scenario == 6 then proposed.lastUsedEpoch := 199; accepts := false; expectedReason := 6;
      elseif scenario == 7 then
        observationAccepted := 0; captureAccepted := 1; proposed.lastUsedEpoch := 127; proposed := Captured(proposed,measurement);
        proposed.crossCovariance := zeros(15,6); proposed.referenceCovariance := identity(6); accepts := false; expectedReason := 6;
      elseif scenario == 8 then proposed.referencePosition[1] := proposed.referencePosition[1]+0.1; accepts := false; expectedReason := 6;
      elseif scenario == 9 then proposed.crossCovariance[15,6] := 1000; accepts := false; expectedReason := 5;
      elseif scenario == 10 then producerAccepted := 0; accepts := false; expectedReason := 4;
      elseif scenario == 11 then epoch := 199; measurement.epoch := 199; accepts := false; expectedReason := 3;
      elseif scenario == 12 then
        imageOn := false; observationAccepted := 0; proposed.lastUsedEpoch := priorEstimator.lastUsedEpoch; proposed.referenceUsed := priorEstimator.referenceUsed;
        measurement := RGBDKeyframes.EmptyFrame(); frameAccepted := false; frameReason := 1;
      elseif scenario == 13 then
        requested := false; previous.generation := -7; previous.catalog.nextId := -1; previous.map.point[14400,:] := fill(1e101,3);
        proposed.covariance := fill(-1e101,15,15); accepts := false; expectedReason := 1;
      elseif scenario == 14 or scenario == 15 then
        priorEstimator := RGBDLocalizationCatalog.EmptyEstimator(reference.bodyPosition,{0.1,0.2,0.3},reference.bodyRotation,
          {0.01,0.02,0.03},{0.001,0.002,0.003},covariance);
        previous := RGBDLocalizationCatalog.Empty(priorEstimator,1,17,1,17); epoch := 0; timestamp := 0; h := 0; initializing := true;
        observationAccepted := 0; captureAccepted := 1; measurement.id := 1; measurement.epoch := 0; measurement.imageTime := 0;
        measurement.bodyPosition := priorEstimator.position; measurement.bodyRotation := priorEstimator.rotation;
        for row in 1:6 loop for column in 1:6 loop measurement.poseCovariance[row,column] := covariance[if row <= 3 then row else row+3,if column <= 3 then column else column+3]; end for; end for;
        proposed := Captured(priorEstimator,measurement);
        if scenario == 15 then frameAccepted := false; frameReason := 3; end if;
      elseif scenario == 16 then
        imageOn := false; observationAccepted := 0; frameAccepted := false; frameReason := 1;
        proposed.velocity := {10001,0,0}; proposed.lastUsedEpoch := base.estimator.lastUsedEpoch; proposed.referenceUsed := base.estimator.referenceUsed;
        measurement := RGBDKeyframes.EmptyFrame();
      elseif scenario == 17 then proposed.accelBias[1] := 2.001; accepts := false; expectedReason := 5;
      elseif scenario == 18 then proposed.gyroBias[1] := 0.301; accepts := false; expectedReason := 5;
      end if;
      local := {measurement.opticalPoint[350,3]+0.18,-measurement.opticalPoint[350,1],-measurement.opticalPoint[350,2]-0.04};
      world := proposed.rotation*local+proposed.position;
      candidates := fill(1e101,350,3); candidates[350,:] := world; mask := zeros(350); mask[350] := 1;
      result := RGBDLocalizationCatalog.Publish(previous,proposed,measurement,producerAccepted,observationAccepted,captureAccepted,
        imageOn,epoch,timestamp,h,initializing,frameAccepted,frameReason,requested,candidates,mask,vocabulary,enabled);
      expected := previous;
      if accepts then
        expected.estimator := proposed; expected.initialized := true; expected.predictionTime := timestamp; expected.steps := previous.steps+1;
        if imageOn then expected.lastProcessedImageEpoch := epoch; expected.lastProcessedImageTime := timestamp; end if;
        if captureAccepted == 1 then expected.referenceBirth.epoch := epoch; expected.referenceBirth.sequence := previous.steps+1; expected.referenceBirth.catalogId := 0; end if;
      end if;
      if scenario == 1 or scenario == 14 then
        visual := RGBDCatalogGraphCapture.Capture(previous.catalog,measurement,vocabulary,enabled,previous.graph,true,trials=trials);
        expected.catalog := visual.catalog; expected.graph := visual.graph; expected.map := RGBDCatalogMapping.Empty(1,17);
        expected.map.catalogRevision := previous.map.catalogRevision+1; expected.map.frame := previous.map.frame+1;
        expected.map.imageEpoch := epoch; expected.map.imageTime := timestamp; expected.map.occupied[1] := 1; expected.map.confidence[1] := 1;
        expected.map.point[1,:] := world; expected.map.localPoint[1,:] := local; expected.map.anchorId[1] := measurement.id;
        expected.map.anchorSlot[1] := 1; expected.map.lastSeen[1] := timestamp; expected.map.lastFrame[1] := previous.map.frame+1;
        if scenario == 14 then expected.referenceBirth.catalogId := 1; end if;
        checks[scenario] := visual.accepted and result.mappingAccepted and result.problem.accepted
          and result.mapDiagnostics.insertedCount == 1 and result.mapDiagnostics.mergedCount == 0;
      elseif scenario == 5 then
        expected.map.frame := previous.map.frame+1; expected.map.imageEpoch := epoch; expected.map.imageTime := timestamp;
        expected.map.occupied[1] := 1; expected.map.point[1,:] := world;
        expected.map.localPoint[1,:] := transpose(reference.bodyRotation)*(world-reference.bodyPosition);
        expected.map.anchorId[1] := 128; expected.map.anchorSlot[1] := 128; expected.map.confidence[1] := 1;
        expected.map.lastSeen[1] := timestamp; expected.map.lastFrame[1] := previous.map.frame+1;
        checks[scenario] := result.mappingAccepted and not result.decision.captureRequested and expected.referenceBirth.catalogId == 0;
      else checks[scenario] := not result.mappingAccepted and RGBDCatalogObservationTests.EmptyProblem(result.problem);
      end if;
      // Full equality with numerical tolerance only for independent anchor arithmetic.
      checks[scenario] := checks[scenario] and result.accepted == accepts and result.rejectionReason == expectedReason
        and result.imageCompleted == (accepts and imageOn) and EqualEstimator(result.next.estimator,expected.estimator)
        and RGBDCatalogGraphTests.EqualCatalog(result.next.catalog,expected.catalog)
        and RGBDGraphMeasurementTests.EqualState(result.next.graph,expected.graph)
        and RGBDCatalogMappingTests.EqualMap(result.next.map,expected.map,if scenario == 1 or scenario == 5 or scenario == 14 then 1e-9 else 0)
        and result.next.generation == expected.generation and result.next.sourceRevision == expected.sourceRevision
        and result.next.initialized == expected.initialized and result.next.predictionTime == expected.predictionTime and result.next.steps == expected.steps
        and result.next.lastProcessedImageEpoch == expected.lastProcessedImageEpoch and result.next.lastProcessedImageTime == expected.lastProcessedImageTime
        and result.next.referenceBirth.generation == expected.referenceBirth.generation and result.next.referenceBirth.epoch == expected.referenceBirth.epoch
        and result.next.referenceBirth.sequence == expected.referenceBirth.sequence and result.next.referenceBirth.catalogId == expected.referenceBirth.catalogId;
      if scenario == 3 then checks[scenario] := checks[scenario] and result.frameRejectionReason == 8; end if;
      if scenario == 5 then
        // A reference born at step1 survives199 accepted processing steps.
        // Its replacement is born at step200, not replacement-counter2.
        checks[19] := result.accepted and result.next.steps == 200
          and result.next.referenceBirth.sequence == 200
          and previous.referenceBirth.sequence == 1;
      end if;
      if scenario == 15 then checks[scenario] := checks[scenario] and result.frameRejectionReason == 3 and result.next.referenceBirth.catalogId == 0; end if;
    end for;
    checks[20:24]:=HeldIntervals(base,priorEstimator);
  end Run;
end RGBDLocalizationCatalogTests;
