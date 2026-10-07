package RGBDKeyframePolicyTests
  function Run
    input Real clock; output Boolean checks[30];
  protected
    RGBDKeyframes.Catalog full; RGBDKeyframes.Catalog catalog; RGBDKeyframes.Catalog snapshot; RGBDKeyframes.Catalog next;
    RGBDKeyframes.Frame base; RGBDKeyframes.Frame frame; RGBDKeyframes.Frame frameSnapshot;
    RGBDKeyframePolicy.Decision decision;
    Boolean expectedValid; Boolean expectedCapture; Boolean requested; Boolean fresh; Boolean accepted; Boolean correct;
    Integer expectedReason; Integer minimumFeatures; Integer slot; Integer evicted;
    Real poseAccepted; Real minimumInterval; Real maximumInterval; Real translationThreshold;
  algorithm
    full := RGBDCatalogLoopTests.FullCatalog(false); base := RGBDLoopVerificationTests.Reference(false);
    base.id := 129; base.epoch := 129; base.imageTime := 128.6+clock;
    checks := fill(false,30);
    for scenario in 1:28 loop
      catalog := full; frame := base; frame.bodyPosition := catalog.bodyPositions[128,:];
      expectedValid := true; expectedCapture := false; expectedReason := 7;
      requested := true; fresh := true; poseAccepted := 1; minimumFeatures := 12;
      minimumInterval := 0.5; maximumInterval := 2; translationThreshold := 0.6;
      if scenario == 1 then
        catalog := RGBDKeyframes.Empty(); frame.id := 1; frame.epoch := 0; frame.imageTime := 0;
        expectedCapture := true; expectedReason := 0;
      elseif scenario == 2 then
        frame.imageTime := 128.49; frame.bodyPosition[1] := frame.bodyPosition[1]+5; expectedReason := 6;
      elseif scenario == 3 then frame.bodyPosition[1] := frame.bodyPosition[1]+0.599;
      elseif scenario == 4 then frame.bodyPosition[1] := frame.bodyPosition[1]+0.6; expectedCapture := true; expectedReason := 0;
      elseif scenario == 5 then frame.bodyRotation := frame.bodyRotation*PGExp({0,0,0.249});
      elseif scenario == 6 then frame.bodyRotation := frame.bodyRotation*PGExp({0,0,0.251}); expectedCapture := true; expectedReason := 0;
      elseif scenario == 7 then frame.imageTime := 130; expectedCapture := true; expectedReason := 0;
      elseif scenario == 8 then fresh := false; expectedReason := 8;
      elseif scenario == 9 then poseAccepted := 0; expectedReason := 4;
      elseif scenario == 10 then
        for feature in 1:350 loop frame.enabled[feature] := feature <= 10 or feature == 350; end for;
        expectedReason := 5;
      elseif scenario == 11 then frame.count := 349; expectedValid := false; expectedReason := 3;
      elseif scenario == 12 then frame.opticalPoint[350,3] := 0; expectedValid := false; expectedReason := 3;
      elseif scenario == 13 then frame.opticalPoint[350,1] := 1e101; expectedValid := false; expectedReason := 3;
      elseif scenario == 14 then frame.generation := 2; expectedValid := false; expectedReason := 3;
      elseif scenario == 15 then frame.id := 130; expectedValid := false; expectedReason := 3;
      elseif scenario == 16 then frame.epoch := 128; expectedValid := false; expectedReason := 3;
      elseif scenario == 17 then frame.vocabularyVersion := 2; expectedValid := false; expectedReason := 3;
      elseif scenario == 18 then frame.imageTime := 128; expectedValid := false; expectedReason := 3;
      elseif scenario == 19 then
        requested := false; catalog.nextId := -1; catalog.nextSlot := -7; frame.count := -1;
        frame.bodyRotation := fill(1e101,3,3); frame.opticalPoint := fill(-1e101,350,3);
        expectedValid := false; expectedReason := 1;
      elseif scenario == 20 then minimumFeatures := 7; expectedValid := false; expectedReason := 2;
      elseif scenario == 21 then frame.bodyRotation[1,1] := 1e101; expectedValid := false; expectedReason := 3;
      elseif scenario == 22 then catalog.bodyRotations[128,1,1] := 1e101; expectedValid := false; expectedReason := 3;
      elseif scenario == 23 then
        frame.enabled[350] := false; frame.count := 349; frame.opticalPoint[350,:] := fill(-1e101,3);
        frame.descriptor[350,:] := fill(1e101,49); frame.imageTime := 130;
        expectedCapture := true; expectedReason := 0;
      elseif scenario == 24 then poseAccepted := 0.5; expectedReason := 4;
      elseif scenario == 25 then translationThreshold := 0; expectedCapture := true; expectedReason := 0;
      elseif scenario == 26 then maximumInterval := 0.49; expectedValid := false; expectedReason := 2;
      elseif scenario == 27 then
        for feature in 1:350 loop frame.enabled[feature] := true; frame.opticalPoint[feature,:] := {0.1,0.2,2}; end for;
        frame.imageTime := 130; expectedCapture := true; expectedReason := 0;
      elseif scenario == 28 then frame.bodyPosition[3] := 1e101; expectedValid := false; expectedReason := 3;
      end if;
      snapshot := catalog; frameSnapshot := frame;
      decision := RGBDKeyframePolicy.Select(catalog,frame,fresh,poseAccepted,requested,minimumInterval,maximumInterval,
        translationThreshold,0.25,minimumFeatures);
      correct := decision.valid == expectedValid and decision.captureRequested == expectedCapture and decision.reason == expectedReason
        and RGBDKeyframeRetrievalTests.EqualFrame(frame,frameSnapshot)
        and RGBDKeyframeLandmarkTests.EqualCatalog(catalog,snapshot);
      if scenario == 1 or scenario == 4 or scenario == 6 or scenario == 7 then correct := correct and decision.enabledCount == 32; end if;
      if scenario == 19 then correct := correct and decision.enabledCount == 0 and decision.elapsed == 0
        and decision.translationSquared == 0 and decision.rotationCosine == 1; end if;
      if scenario == 23 then correct := correct and decision.enabledCount == 31; end if;
      if scenario == 27 then correct := correct and decision.enabledCount == 350; end if;
      checks[scenario] := correct;
    end for;
    // Camera observations remain90Hz. Motion cannot defeat the0.5-second floor.
    correct := true; frame := base; frame.bodyPosition := full.bodyPositions[128,:]+{5,0,0};
    for tick in 1:180 loop
      frame.epoch := 128+tick; frame.imageTime := 128+tick/90.0;
      decision := RGBDKeyframePolicy.Select(full,frame,true,1,true);
      correct := correct and decision.valid and decision.captureRequested == (tick >= 45)
        and decision.reason == (if tick < 45 then 6 else 0);
    end for;
    checks[29] := correct;
    // Actual Store transitions, full128 retained nodes, two-second stationary captures.
    catalog := RGBDKeyframes.Empty(); correct := true;
    for capture in 1:129 loop
      frame := RGBDLoopVerificationTests.Reference(false); frame.id := capture;
      frame.epoch := (capture-1)*180; frame.imageTime := (capture-1)*2.0;
      decision := RGBDKeyframePolicy.Select(catalog,frame,true,1,true);
      (next,accepted,slot,evicted) := RGBDKeyframes.Store(catalog,frame,decision.captureRequested);
      correct := correct and decision.valid and decision.captureRequested and accepted
        and slot == mod(capture-1,128)+1 and evicted == (if capture <= 128 then 0 else 1);
      catalog := next;
    end for;
    checks[30] := correct and RGBDKeyframes.ValidCatalog(catalog) and catalog.nextId == 130 and catalog.nextSlot == 2
      and catalog.lastTime == 256 and catalog.ids[2] == 2 and catalog.ids[1] == 129
      and catalog.lastTime-catalog.imageTimes[2] == 254 and catalog.lastEpoch-catalog.epochs[2] == 22860;
  end Run;
end RGBDKeyframePolicyTests;
