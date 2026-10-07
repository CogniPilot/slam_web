package RGBDCatalogObservationTests
  function EmptyProblem
    input RGBDGraphMeasurements.Problem problem;
    output Boolean empty;
  algorithm
    empty := not problem.accepted and problem.nodeCount == 0 and problem.edgeCount == 0 and problem.correlationInflation == 1;
    for node in 1:128 loop
      empty := empty and problem.nodeId[node] == 0 and problem.catalogSlot[node] == 0 and problem.nodeMask[node] == 0;
      for axis in 1:3 loop
        empty := empty and problem.positions[node,axis] == 0;
        for column in 1:3 loop empty := empty and problem.rotations[node,axis,column] == (if axis == column then 1 else 0); end for;
      end for;
    end for;
    for edge in 1:256 loop
      empty := empty and problem.edgeMask[edge] == 0 and problem.fromNode[edge] == 0 and problem.toNode[edge] == 0;
      for axis in 1:3 loop
        empty := empty and problem.measuredTranslation[edge,axis] == 0;
        for column in 1:3 loop empty := empty and problem.measuredRotation[edge,axis,column] == (if axis == column then 1 else 0); end for;
      end for;
      for row in 1:6 loop
        for column in 1:6 loop empty := empty and problem.information[edge,row,column] == 0; end for;
      end for;
    end for;
  end EmptyProblem;

  function Measurement
    input Boolean dense;
    output RGBDKeyframes.Frame frame;
    output Real world[350,3];
  algorithm
    frame := RGBDKeyframes.EmptyFrame(); frame.id := 129; frame.epoch := 200; frame.imageTime := 140; frame.count := 350;
    frame.bodyRotation := [0,-1,0;1,0,0;0,0,1]; frame.bodyPosition := {2,3,4};
    frame.opticalToBody := [0,0,1;-1,0,0;0,-1,0]; frame.cameraOriginBody := {0.18,0,-0.04};
    // None of these capture-only payloads may gate a noncapture observation.
    frame.descriptor := fill(1e101,350,49); frame.histogram := fill(1e101,256);
    frame.rgbCalibration := fill(-1.0,4); frame.poseCovariance := fill(-1.0,6,6);
    frame.opticalPoint := fill(1e101,350,3); world := zeros(350,3);
    for feature in 1:350 loop
      frame.enabled[feature] := dense or feature == 1 or feature == 350;
      if frame.enabled[feature] then
        frame.opticalPoint[feature,:] := if dense then {(mod(feature-1,25)-12)*0.6,(div(feature-1,25)-7)*0.6,2}
          else {(mod(feature,7)-3)*0.22,(div(feature,7)-2)*0.18,2+mod(feature,5)*0.11};
        // Independent known RDF -> body FLU -> world with quarter-turn body yaw.
        world[feature,:] := {frame.opticalPoint[feature,1]+2,frame.opticalPoint[feature,3]+3.18,3.96-frame.opticalPoint[feature,2]};
      end if;
    end for;
  end Measurement;

  function Run
    input Integer slots; input Integer features; input Integer nodes; input Integer edges;
    output Boolean checks[18];
  protected
    RGBDKeyframes.Catalog catalog; RGBDKeyframes.Catalog originalCatalog;
    RGBDGraphMeasurements.State graph; RGBDGraphMeasurements.State originalGraph;
    RGBDCatalogMapping.State previous; RGBDCatalogMapping.State expected;
    RGBDCatalogMapping.Result result; RGBDCatalogMapping.Result first;
    RGBDKeyframes.Frame measurement; RGBDKeyframes.Frame reference;
    Real world[350,3]; Real candidate[350,3]; Real mask[350]; Real lifetime; Real width;
    Boolean accepted; Boolean requested; Integer reason; Integer destination;
  algorithm
    assert(slots == 14400 and features == 350 and nodes == 128 and edges == 256,
      "Observation acceptance requires complete14400/350/128/256 domains");
    originalCatalog := RGBDCatalogLoopTests.FullCatalog(false); originalGraph := RGBDGraphMeasurementTests.FullState();
    reference := RGBDLoopVerificationTests.Reference(false); checks := fill(false,18);
    for scenario in 1:18 loop
      catalog := originalCatalog; graph := originalGraph;
      (measurement,world) := Measurement(scenario == 4);
      candidate := fill(1e101,350,3); mask := zeros(350);
      for feature in 1:350 loop
        if measurement.enabled[feature] then candidate[feature,:] := world[feature,:]; mask[feature] := 1; end if;
      end for;
      previous := RGBDCatalogMapping.Empty(1,17); previous.catalogRevision := 128;
      previous.imageTime := 128; previous.frame := 128; previous.imageEpoch := 128;
      previous.point[14400,:] := world[1,:]; previous.occupied[14400] := 1; previous.confidence[14400] := 2;
      previous.lastSeen[14400] := 128; previous.lastFrame[14400] := 128;
      previous.anchorId[14400] := 64; previous.anchorSlot[14400] := 64;
      previous.localPoint[14400,:] := transpose(reference.bodyRotation)*(world[1,:]-reference.bodyPosition);
      requested := true; lifetime := 1000; width := 0.25; reason := 3;
      accepted := scenario <= 5 or scenario == 17 or scenario == 18;
      if scenario == 2 then
        measurement.count := 1; measurement.enabled[350] := false; mask[350] := 0;
      elseif scenario == 3 then
        measurement.count := 0; measurement.enabled := fill(false,350); mask := zeros(350); lifetime := 5;
      elseif scenario == 5 then
        measurement.count := 2; measurement.enabled := fill(false,350); measurement.enabled[1] := true; measurement.enabled[2] := true;
        measurement.opticalPoint[2,:] := measurement.opticalPoint[1,:]; mask := zeros(350); mask[1] := 1; mask[2] := 1;
        candidate[2,:] := world[1,:];
      elseif scenario == 6 then previous.imageEpoch := 200; previous.frame := 129; previous.imageTime := 139;
      elseif scenario == 7 then previous.imageEpoch := 201; previous.frame := 129; previous.imageTime := 139;
      elseif scenario == 8 then graph.generation := 2;
      elseif scenario == 9 then graph.lastCaptureId := 127;
      elseif scenario == 10 then catalog.nextSlot := -1;
      elseif scenario == 11 then
        previous.localPoint[14400,1] := previous.localPoint[14400,1]+1; reason := 5;
      elseif scenario == 12 then candidate[350,1] := candidate[350,1]+1; reason := 4;
      elseif scenario == 13 then
        requested := false; reason := 1; previous.point[14400,:] := fill(1e101,3);
        previous.localPoint[2,:] := {7,8,9}; previous.anchorId[2] := -7; previous.confidence[2] := -8;
        previous.generation := -1; graph.edges[256].translation := fill(1e101,3); catalog.nextSlot := -1;
      elseif scenario == 14 then measurement.generation := 2; reason := 4;
      elseif scenario == 15 then previous.lastSeen[14400] := 129; reason := 5;
      elseif scenario == 16 then width := 0; reason := 5;
      elseif scenario == 17 then mask := zeros(350);
      elseif scenario == 18 then
        measurement.count := 1; measurement.enabled[350] := false; mask[350] := 0;
      end if;
      if scenario == 18 then
        first := RGBDCatalogObservation.Update(catalog,graph,previous,measurement,candidate,mask,1.0,true,
          tentativeLifetime=lifetime,confirmedLifetime=lifetime);
        assert(first.accepted,"First observation in gap sequence must accept");
        previous := first.map; measurement.epoch := 901; measurement.imageTime := 141;
      end if;
      result := RGBDCatalogObservation.Update(catalog,graph,previous,measurement,candidate,mask,1.0,requested,
        voxelWidth=width,tentativeLifetime=lifetime,confirmedLifetime=lifetime);
      checks[scenario] := result.accepted == accepted
        and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
        and RGBDGraphMeasurementTests.EqualState(result.graph,graph) and EmptyProblem(result.problem);
      if accepted then
        expected := RGBDCatalogMapping.Empty(1,17); expected.catalogRevision := 128;
        expected.imageTime := measurement.imageTime; expected.imageEpoch := measurement.epoch; expected.frame := previous.frame+1;
        if scenario <> 3 then
          expected.point[14400,:] := previous.point[14400,:]; expected.localPoint[14400,:] := previous.localPoint[14400,:];
          expected.occupied[14400] := 1; expected.confidence[14400] := if scenario == 17 then 2 else if scenario == 18 then 4 else 3;
          expected.anchorId[14400] := 64; expected.anchorSlot[14400] := 64;
          expected.lastSeen[14400] := if scenario == 17 then 128 else measurement.imageTime;
          expected.lastFrame[14400] := if scenario == 17 then 128 else previous.frame+1;
          if scenario == 1 then
            expected.point[1,:] := world[350,:]; expected.localPoint[1,:] := transpose(reference.bodyRotation)*(world[350,:]-reference.bodyPosition);
            expected.occupied[1] := 1; expected.confidence[1] := 1; expected.lastSeen[1] := 140; expected.lastFrame[1] := 129;
            expected.anchorId[1] := 128; expected.anchorSlot[1] := 128;
          elseif scenario == 4 then
            for feature in 2:350 loop
              destination := feature-1;
              expected.point[destination,:] := world[feature,:];
              expected.localPoint[destination,:] := transpose(reference.bodyRotation)*(world[feature,:]-reference.bodyPosition);
              expected.occupied[destination] := 1; expected.confidence[destination] := 1;
              expected.lastSeen[destination] := 140; expected.lastFrame[destination] := 129;
              expected.anchorId[destination] := 128; expected.anchorSlot[destination] := 128;
            end for;
          end if;
        end if;
        checks[scenario] := checks[scenario] and result.rejectionReason == 0
          and RGBDCatalogMappingTests.EqualMap(result.map,expected,1e-9)
          and result.diagnostics.insertedCount == (if scenario == 1 then 1 else if scenario == 4 then 349 else 0)
          and result.diagnostics.mergedCount == (if scenario == 3 or scenario == 17 then 0 else if scenario == 5 then 2 else 1)
          and result.diagnostics.prunedCount == (if scenario == 3 then 1 else 0)
          and result.diagnostics.evictedCount == 0 and result.diagnostics.projectedCount == 0
          and result.diagnostics.assignedCount == (if scenario == 1 then 1 else if scenario == 4 then 349 else 0)
          and result.diagnostics.retainedCount == (if scenario == 3 then 0 else 1)
          and result.diagnostics.invalidCandidateCount == 0 and result.diagnostics.droppedCount == 0;
      else
        checks[scenario] := checks[scenario] and result.rejectionReason == reason
          and RGBDCatalogMappingTests.EqualMap(result.map,previous);
      end if;
    end for;
  end Run;
end RGBDCatalogObservationTests;
