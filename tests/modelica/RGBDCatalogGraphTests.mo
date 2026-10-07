package RGBDCatalogGraphTests
  function EqualCatalog
    input RGBDKeyframes.Catalog a; input RGBDKeyframes.Catalog b;
    output Boolean equal;
  algorithm
    equal := a.generation == b.generation and a.vocabularyVersion == b.vocabularyVersion
      and a.nextId == b.nextId and a.nextSlot == b.nextSlot and a.lastEpoch == b.lastEpoch and a.lastTime == b.lastTime;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.occupied[axis1]==b.occupied[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.generations[axis1]==b.generations[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.ids[axis1]==b.ids[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.epochs[axis1]==b.epochs[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.imageTimes[axis1]==b.imageTimes[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.counts[axis1]==b.counts[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.featureCapacity loop
            equal := equal and a.featureEnabled[axis1,axis2]==b.featureEnabled[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.featureCapacity loop
            for axis3 in 1:RGBDKeyframes.descriptorSize loop
                equal := equal and a.descriptors[axis1,axis2,axis3]==b.descriptors[axis1,axis2,axis3];
            end for;
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.featureCapacity loop
            for axis3 in 1:RGBDKeyframes.dimension loop
                equal := equal and a.opticalPoints[axis1,axis2,axis3]==b.opticalPoints[axis1,axis2,axis3];
            end for;
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.featureCapacity loop
            for axis3 in 1:2 loop
                equal := equal and a.pixelCoordinates[axis1,axis2,axis3]==b.pixelCoordinates[axis1,axis2,axis3];
            end for;
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:2 loop
            equal := equal and a.rgbSizes[axis1,axis2]==b.rgbSizes[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:2 loop
            equal := equal and a.depthSizes[axis1,axis2]==b.depthSizes[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:4 loop
            equal := equal and a.rgbCalibrations[axis1,axis2]==b.rgbCalibrations[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:4 loop
            equal := equal and a.depthCalibrations[axis1,axis2]==b.depthCalibrations[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.dimension loop
            for axis3 in 1:RGBDKeyframes.dimension loop
                equal := equal and a.opticalToBodyRotations[axis1,axis2,axis3]==b.opticalToBodyRotations[axis1,axis2,axis3];
            end for;
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.dimension loop
            equal := equal and a.cameraOriginsBody[axis1,axis2]==b.cameraOriginsBody[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.disparityNoises[axis1]==b.disparityNoises[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.noiseReferenceFocals[axis1]==b.noiseReferenceFocals[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.baselines[axis1]==b.baselines[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.dimension loop
            for axis3 in 1:RGBDKeyframes.dimension loop
                equal := equal and a.bodyRotations[axis1,axis2,axis3]==b.bodyRotations[axis1,axis2,axis3];
            end for;
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.dimension loop
            equal := equal and a.bodyPositions[axis1,axis2]==b.bodyPositions[axis1,axis2];
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.poseDimension loop
            for axis3 in 1:RGBDKeyframes.poseDimension loop
                equal := equal and a.poseCovariances[axis1,axis2,axis3]==b.poseCovariances[axis1,axis2,axis3];
            end for;
        end for;
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        equal := equal and a.vocabularyVersions[axis1]==b.vocabularyVersions[axis1];
    end for;
    for axis1 in 1:RGBDKeyframes.keyframeCapacity loop
        for axis2 in 1:RGBDKeyframes.wordCapacity loop
            equal := equal and a.histograms[axis1,axis2]==b.histograms[axis1,axis2];
        end for;
    end for;
  end EqualCatalog;

  function Run
    input Integer trials;
    output Boolean checks[10];
  protected
    RGBDKeyframes.Catalog catalog; RGBDGraphMeasurements.State graph;
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current;
    RGBDCatalogGraphCapture.Result result;
    Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize];
    Real enabled[RGBDKeyframes.wordCapacity];
    Real C[3,3]; Real t[3]; Boolean expected;
  algorithm
    assert(trials == 96,"Joined capture uses all 96 hypotheses");
    checks := fill(false,10); C := PGExp({0.03,-0.04,0.12}); t := {0.3,-0.2,0.1};
    for scenario in 1:10 loop
      catalog := RGBDCatalogLoopTests.FullCatalog(scenario == 10);
      graph := RGBDGraphMeasurementTests.FullState();
      reference := RGBDLoopVerificationTests.Reference(scenario == 10);
      (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
      current := RGBDLoopVerificationTests.Current(reference,C,t,0,scenario == 10);
      current.id := 129; current.imageTime := 140;
      expected := scenario == 1 or scenario == 9 or scenario == 10;
      if scenario == 2 then graph.nextEdgeId := RGBDKeyframes.identifierLimit;
      elseif scenario == 3 then catalog.bodyPositions[2,1] := 1e101;
      elseif scenario == 4 then catalog.descriptors[128,:,:] := zeros(350,49);
      elseif scenario == 5 then current.generation := 2;
      elseif scenario == 6 then current.epoch := catalog.lastEpoch;
      elseif scenario == 7 then current.imageTime := catalog.lastTime;
      elseif scenario == 8 then graph.edges[127].enabled := false;
      elseif scenario == 9 then
        catalog := RGBDKeyframes.Empty(); graph := RGBDGraphMeasurements.Empty();
        current := reference; current.id := 1; current.epoch := 1; current.imageTime := 1;
      end if;
      result := RGBDCatalogGraphCapture.Capture(catalog,current,vocabulary,enabled,graph,true,
        maximumWordDistanceSquared=if scenario == 10 then 4.0 else 0.8,trials=trials);
      checks[scenario] := result.accepted == expected;
      if expected then
        checks[scenario] := checks[scenario] and result.problem.accepted
          and RGBDGraphMeasurements.ValidState(result.catalog,result.graph)
          and result.catalog.nextId == catalog.nextId+1 and result.graph.revision == graph.revision+1
          and result.graph.lastCaptureId == current.id;
        if scenario == 9 then
          checks[scenario] := checks[scenario] and not result.sequentialDiagnostics.verified
            and result.problem.nodeCount == 1 and result.problem.edgeCount == 0;
        else
          checks[scenario] := checks[scenario] and result.sequentialDiagnostics.verified
            and result.sequentialDiagnostics.referenceId == 128 and result.sequentialDiagnostics.currentId == 129
            and max(abs(result.sequentialDiagnostics.opticalRotation-C)) < 1e-9
            and max(abs(result.sequentialDiagnostics.opticalTranslation-t)) < 1e-9
            and result.loopDiagnostics.verifiedCount == 4 and result.graphDiagnostics.admittedSequential == 1
            and result.graphDiagnostics.admittedLoops == 4 and result.evictedId == 1
            and result.problem.nodeCount == 128 and result.problem.nodeId[1] == 2
            and result.problem.nodeId[128] == 129;
        end if;
      else
        checks[scenario] := checks[scenario] and EqualCatalog(result.catalog,catalog)
          and RGBDGraphMeasurementTests.EqualState(result.graph,graph)
          and not result.problem.accepted and result.storedSlot == 0 and result.evictedId == 0;
        if scenario == 2 then
          checks[scenario] := checks[scenario] and result.rejectionReason == 4 and result.graphDiagnostics.rejectionReason == 6;
        elseif scenario == 3 then
          checks[scenario] := checks[scenario] and result.rejectionReason == 5 and result.graphDiagnostics.accepted;
        elseif scenario == 4 then
          checks[scenario] := checks[scenario] and result.rejectionReason == 4 and result.graphDiagnostics.rejectionReason == 4
            and not result.sequentialDiagnostics.verified and result.loopDiagnostics.verifiedCount == 4;
        elseif scenario == 8 then
          checks[scenario] := checks[scenario] and result.rejectionReason == 4 and result.graphDiagnostics.rejectionReason == 3;
        else
          checks[scenario] := checks[scenario] and result.rejectionReason == 2;
        end if;
      end if;
    end for;
  end Run;
end RGBDCatalogGraphTests;
