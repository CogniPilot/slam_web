package RGBDCatalogMappingTests
  function EqualMap
    input RGBDCatalogMapping.State a; input RGBDCatalogMapping.State b;
    input Real tolerance = 0.0;
    output Boolean equal;
  algorithm
    equal := a.generation == b.generation and a.catalogRevision == b.catalogRevision and a.imageEpoch == b.imageEpoch
      and a.imageTime == b.imageTime and a.frame == b.frame and a.worldFrame == b.worldFrame;
    for slot in 1:RGBDCatalogMapping.mapCapacity loop
      equal := equal and a.occupied[slot] == b.occupied[slot] and a.confidence[slot] == b.confidence[slot]
        and a.lastSeen[slot] == b.lastSeen[slot] and a.lastFrame[slot] == b.lastFrame[slot]
        and a.anchorId[slot] == b.anchorId[slot] and a.anchorSlot[slot] == b.anchorSlot[slot];
      for axis in 1:3 loop
        equal := equal and abs(a.point[slot,axis]-b.point[slot,axis]) <= tolerance
          and abs(a.localPoint[slot,axis]-b.localPoint[slot,axis]) <= tolerance;
      end for;
    end for;
  end EqualMap;

  function Run
    input Integer trials;
    output Boolean checks[18];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current;
    RGBDCatalogGraphCapture.Result visual;
    RGBDCatalogMapping.State base; RGBDCatalogMapping.State previous; RGBDCatalogMapping.State expected;
    RGBDCatalogMapping.Result result;
    Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize]; Real enabled[RGBDKeyframes.wordCapacity];
    Real candidates[350,3]; Real mask[350]; Real world[350,3]; Real local[350,3];
    Real C[3,3]; Real B[3,3]; Real A[3,3]; Real t[3]; Real p[3]; Real optical[3];
    Integer source; Integer reason; Real width; Real lifetime; Boolean requested; Boolean accepted;
  algorithm
    assert(trials == 96 and RGBDCatalogMapping.mapCapacity == 14400,"Mapping controls retain full14400/350/128/256/96 domains");
    catalog := RGBDCatalogLoopTests.FullCatalog(false); graph := RGBDGraphMeasurementTests.FullState();
    reference := RGBDLoopVerificationTests.Reference(false);
    C := PGExp({0.03,-0.04,0.12}); t := {0.3,-0.2,0.1};
    B := PGExp({-0.6,0.4,-0.3}); A := PGExp({0.1,0.2,-0.1})*[0,0,1;-1,0,0;0,-1,0]; p := {90,70,10};
    current := RGBDLoopVerificationTests.Current(reference,C,t,0,false);
    current.id := 129; current.imageTime := 140; current.epoch := 200;
    (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
    visual := RGBDCatalogGraphCapture.Capture(catalog,current,vocabulary,enabled,graph,true,trials=trials);
    assert(visual.accepted and visual.loopDiagnostics.verifiedCount == 4 and visual.sequentialDiagnostics.verified,
      "The mapper controls require the real connected visual capture to accept");
    world := zeros(350,3); local := zeros(350,3);
    for feature in 1:350 loop
      if current.enabled[feature] then
        source := if feature <= 31 then 32-feature else 350;
        optical := C*reference.opticalPoint[source,:]+t;
        local[feature,:] := A*optical+{-0.08,0.03,0.04};
        world[feature,:] := B*local[feature,:]+p;
      end if;
    end for;
    base := RGBDCatalogMapping.Empty(1,17); base.catalogRevision := 128; base.imageTime := 128; base.frame := 128; base.imageEpoch := 128;
    base.occupied[1] := 1; base.confidence[1] := 3; base.lastSeen[1] := 128; base.lastFrame[1] := 128;
    base.anchorId[1] := 1; base.anchorSlot[1] := 1; base.localPoint[1,:] := {1,2,3};
    base.point[1,:] := reference.bodyRotation*base.localPoint[1,:]+reference.bodyPosition;
    base.occupied[14400] := 1; base.confidence[14400] := 3; base.lastSeen[14400] := 128; base.lastFrame[14400] := 128;
    base.anchorId[14400] := 128; base.anchorSlot[14400] := 128; base.point[14400,:] := world[345,:];
    base.localPoint[14400,:] := transpose(reference.bodyRotation)*(world[345,:]-reference.bodyPosition);
    checks := fill(false,18);
    for scenario in 1:14 loop
      previous := base; candidates := fill(1e101,350,3); mask := zeros(350);
      candidates[1,:] := world[1,:]; mask[1] := 1;
      candidates[345,:] := world[345,:]; mask[345] := 1;
      width := 0.25; lifetime := 1000; requested := true; accepted := scenario == 1 or scenario == 11 or scenario == 12 or scenario == 13;
      reason := 5;
      if scenario == 2 then width := 0;
      elseif scenario == 3 then previous.lastSeen[14400] := 129;
      elseif scenario == 4 then previous.localPoint[14400,1] := previous.localPoint[14400,1]+1;
      elseif scenario == 5 then previous.generation := 2; reason := 3;
      elseif scenario == 6 then previous.catalogRevision := RGBDKeyframes.identifierLimit; reason := 3;
      elseif scenario == 7 then mask[350] := 1; candidates[350,:] := zeros(3); reason := 4;
      elseif scenario == 8 then candidates[345,1] := candidates[345,1]+1; reason := 4;
      elseif scenario == 9 then mask[350] := 0.5; reason := 4;
      elseif scenario == 10 then
        requested := false; reason := 1; previous.point[14400,:] := fill(1e101,3); previous.generation := -1;
        previous.localPoint[2,:] := {7,8,9}; previous.anchorId[2] := -7; previous.confidence[2] := -8;
      elseif scenario == 11 then mask := zeros(350);
      elseif scenario == 12 then lifetime := 5;
      elseif scenario == 13 then previous.confidence[14400] := 2;
      elseif scenario == 14 then previous.imageTime := 141;
      end if;
      result := RGBDCatalogMapping.Capture(catalog,graph,previous,visual,candidates,mask,1.0,requested,
        voxelWidth=width,tentativeLifetime=lifetime,confirmedLifetime=lifetime);
      assert(not accepted or result.accepted,"Expected acceptance scenario="+String(scenario)+" stage="+String(result.rejectionReason)+" catalog="+String(result.diagnostics.catalogRejectionReason)+" update="+String(result.diagnostics.updateRejectionReason)+" map="+String(result.diagnostics.mapRejectionReason)+" anchor="+String(result.diagnostics.anchorRejectionReason));
      checks[scenario] := result.accepted == accepted;
      if accepted then
        expected := RGBDCatalogMapping.Empty(1,17); expected.catalogRevision := 129; expected.imageTime := 140; expected.frame := 129; expected.imageEpoch := 200;
        if scenario <> 12 then
          expected.occupied[14400] := 1; expected.point[14400,:] := world[345,:];
          expected.localPoint[14400,:] := base.localPoint[14400,:]; expected.anchorId[14400] := 128; expected.anchorSlot[14400] := 128;
          expected.confidence[14400] := if scenario == 11 then 3 else if scenario == 13 then 3 else 4;
          expected.lastSeen[14400] := if scenario == 11 then 128 else 140;
          expected.lastFrame[14400] := if scenario == 11 then 128 else 129;
        end if;
        if scenario <> 11 then
          expected.occupied[1] := 1; expected.point[1,:] := world[1,:]; expected.localPoint[1,:] := local[1,:];
          expected.anchorId[1] := 129; expected.anchorSlot[1] := 1; expected.confidence[1] := 1;
          expected.lastSeen[1] := 140; expected.lastFrame[1] := 129;
          if scenario == 12 then
            expected.occupied[2] := 1; expected.point[2,:] := world[345,:]; expected.localPoint[2,:] := local[345,:];
            expected.anchorId[2] := 129; expected.anchorSlot[2] := 1; expected.confidence[2] := 1;
            expected.lastSeen[2] := 140; expected.lastFrame[2] := 129;
          end if;
        end if;
        checks[scenario] := checks[scenario] and result.rejectionReason == 0 and EqualMap(result.map,expected,1e-9)
          and RGBDCatalogGraphTests.EqualCatalog(result.catalog,visual.catalog)
          and RGBDGraphMeasurementTests.EqualState(result.graph,visual.graph)
          and result.problem.accepted and result.diagnostics.evictedCount == 1 and result.diagnostics.projectedCount == 1
          and result.diagnostics.insertedCount == (if scenario == 11 then 0 else if scenario == 12 then 2 else 1)
          and result.diagnostics.mergedCount == (if scenario == 11 or scenario == 12 then 0 else 1)
          and result.diagnostics.prunedCount == (if scenario == 12 then 2 else 1)
          and result.diagnostics.assignedCount == (if scenario == 11 then 0 else if scenario == 12 then 2 else 1)
          and result.diagnostics.retainedCount == (if scenario == 12 then 0 else 1)
          and result.diagnostics.invalidCandidateCount == 0 and result.diagnostics.droppedCount == 0
          and result.diagnostics.occupiedCount == (if scenario == 11 then 1 else 2)
          and result.diagnostics.confirmedCount == (if scenario == 12 then 0 else 1)
          and result.diagnostics.tentativeCount == (if scenario == 11 then 0 else if scenario == 12 then 2 else 1)
          and result.diagnostics.clearedCount == (if scenario == 11 then 14399 else 14398);
      else
        checks[scenario] := checks[scenario] and result.rejectionReason == reason and EqualMap(result.map,previous)
          and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
          and RGBDGraphMeasurementTests.EqualState(result.graph,graph) and not result.problem.accepted;
        if reason == 5 then checks[scenario] := checks[scenario] and result.diagnostics.mapAccepted == 0; end if;
      end if;
    end for;
    for boundary in 1:2 loop
      reference := RGBDLoopVerificationTests.Reference(boundary == 2);
      (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
      if boundary == 1 then
        catalog := RGBDKeyframes.Empty(); graph := RGBDGraphMeasurements.Empty(); current := reference;
        current.id := 1; current.epoch := 1; current.imageTime := 1;
        previous := RGBDCatalogMapping.Empty(1,17);
        local[350,:] := {reference.opticalPoint[350,3]+0.18,-reference.opticalPoint[350,1],-reference.opticalPoint[350,2]-0.04};
        world[350,:] := PGExp({0.2,-0.1,0.7})*local[350,:]+{2,-3,1};
      else
        catalog := RGBDCatalogLoopTests.FullCatalog(true); graph := RGBDGraphMeasurementTests.FullState();
        current := RGBDLoopVerificationTests.Current(reference,C,t,0,true);
        current.id := 129; current.imageTime := 140; current.epoch := 200;
        previous := RGBDCatalogMapping.Empty(1,17); previous.catalogRevision := 128; previous.imageTime := 128; previous.frame := 128; previous.imageEpoch := 128;
        local[350,:] := A*(C*reference.opticalPoint[1,:]+t)+{-0.08,0.03,0.04};
        world[350,:] := B*local[350,:]+p;
      end if;
      visual := RGBDCatalogGraphCapture.Capture(catalog,current,vocabulary,enabled,graph,true,
        maximumWordDistanceSquared=if boundary == 2 then 4.0 else 0.8,trials=trials);
      mask := zeros(350); mask[350] := 1; candidates := fill(1e101,350,3); candidates[350,:] := world[350,:];
      result := RGBDCatalogMapping.Capture(catalog,graph,previous,visual,candidates,mask,1.0,true);
      expected := RGBDCatalogMapping.Empty(1,17); expected.catalogRevision := previous.catalogRevision+1;
      expected.imageTime := current.imageTime; expected.frame := previous.frame+1; expected.imageEpoch := current.epoch;
      expected.point[1,:] := world[350,:]; expected.localPoint[1,:] := local[350,:]; expected.occupied[1] := 1;
      expected.confidence[1] := 1; expected.lastSeen[1] := current.imageTime; expected.lastFrame[1] := previous.frame+1;
      expected.anchorId[1] := current.id; expected.anchorSlot[1] := 1;
      checks[14+boundary] := visual.accepted and result.accepted and EqualMap(result.map,expected,1e-9)
        and RGBDCatalogGraphTests.EqualCatalog(result.catalog,visual.catalog)
        and RGBDGraphMeasurementTests.EqualState(result.graph,visual.graph)
        and result.diagnostics.insertedCount == 1 and result.diagnostics.mergedCount == 0
        and result.diagnostics.assignedCount == 1 and result.diagnostics.retainedCount == 0;
      if boundary == 2 then
        checks[16] := checks[16] and visual.loopDiagnostics.verifiedCount == 4
          and visual.sequentialDiagnostics.inlierCount == 350;
      end if;
    end for;
    previous.imageEpoch := current.epoch;
    result := RGBDCatalogMapping.Capture(catalog,graph,previous,visual,candidates,mask,1.0,true);
    checks[17] := visual.accepted and not result.accepted and result.rejectionReason == 4
      and EqualMap(result.map,previous) and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
      and RGBDGraphMeasurementTests.EqualState(result.graph,graph) and not result.problem.accepted;
    previous.imageEpoch := 128;
    for slot in 1:14400 loop
      previous.occupied[slot] := 1; previous.point[slot,:] := world[350,:];
      previous.localPoint[slot,:] := transpose(reference.bodyRotation)*(world[350,:]-reference.bodyPosition);
      previous.anchorId[slot] := 128; previous.anchorSlot[slot] := 128;
      previous.confidence[slot] := 3; previous.lastSeen[slot] := 128; previous.lastFrame[slot] := 128;
    end for;
    previous.lastSeen[14400] := 129;
    result := RGBDCatalogMapping.Capture(catalog,graph,previous,visual,candidates,mask,1.0,true);
    checks[18] := visual.accepted and not result.accepted and result.rejectionReason == 5
      and EqualMap(result.map,previous) and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
      and RGBDGraphMeasurementTests.EqualState(result.graph,graph) and not result.problem.accepted;
  end Run;
end RGBDCatalogMappingTests;
