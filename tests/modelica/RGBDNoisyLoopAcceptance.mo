// Controlled measured-point/descriptor cases, not rendered images or truth inputs.
// Tests retrieval -> geometric verification -> graph admission at full capacities.
package RGBDNoisyLoopReference
  function Reference
    output RGBDKeyframes.Frame result;
  algorithm
    result := RGBDLoopVerificationTests.Reference(false);
    result.rgbSize := {480,848}; result.depthSize := result.rgbSize;
    result.rgbCalibration := {616.9238281571168,625.2213755265124,423.5,239.5};
    result.depthCalibration := {446.80277311912806,432.97146126514167,423.5,239.5};
    result.noiseReferenceFx := result.depthCalibration[1];
    for slot in 1:RGBDKeyframes.featureCapacity loop
      if result.enabled[slot] then
        result.opticalPoint[slot,:] := {0.4*(mod(slot,7)-3),0.3*(mod(div(slot,7),5)-2),6.0+0.2*mod(slot,5)};
        result.pixels[slot,:] := {integer(floor(result.rgbCalibration[3]+result.rgbCalibration[1]*result.opticalPoint[slot,1]/result.opticalPoint[slot,3])),
          integer(floor(result.rgbCalibration[4]+result.rgbCalibration[2]*result.opticalPoint[slot,2]/result.opticalPoint[slot,3]))};
      end if;
    end for;
  end Reference;

  function Catalog
    input RGBDKeyframes.Frame reference;
    output RGBDKeyframes.Catalog result;
  algorithm
    result := RGBDCatalogLoopTests.FullCatalog(false);
    for slot in 1:RGBDKeyframes.keyframeCapacity loop
      result.opticalPoints[slot,:,:] := reference.opticalPoint;
      result.pixelCoordinates[slot,:,:] := reference.pixels;
      result.rgbSizes[slot,:] := reference.rgbSize; result.depthSizes[slot,:] := reference.depthSize;
      result.rgbCalibrations[slot,:] := reference.rgbCalibration;
      result.depthCalibrations[slot,:] := reference.depthCalibration;
      result.noiseReferenceFocals[slot] := reference.noiseReferenceFx;
    end for;
  end Catalog;

  function Current
    input RGBDKeyframes.Frame reference;
    input Real rotation[3,3]; input Real translation[3]; input Integer outliers;
    output RGBDKeyframes.Frame result;
  protected
    Integer partner; Real axialError;
  algorithm
    result := RGBDLoopVerificationTests.Current(reference,rotation,translation,0,false);
    result.id := RGBDKeyframes.keyframeCapacity+1; result.imageTime := 140;
    result.rgbSize := reference.rgbSize; result.depthSize := reference.depthSize;
    result.rgbCalibration := reference.rgbCalibration; result.depthCalibration := reference.depthCalibration;
    result.noiseReferenceFx := reference.noiseReferenceFx;
    for slot in 1:RGBDKeyframes.featureCapacity loop
      if reference.enabled[slot] then
        partner := if slot <= 31 then 32-slot else RGBDKeyframes.featureCapacity-5;
        if slot <= outliers then
          // A mismatched point still belongs to the camera's image domain.
          result.opticalPoint[partner,:] := result.opticalPoint[partner,:]+{0.8,-0.8,0.2};
        end if;
        // Axial depth error follows the optical ray; pixel bearing stays fixed.
        axialError := if mod(slot,2) == 0 then 0.12 else -0.12;
        result.opticalPoint[partner,:] := result.opticalPoint[partner,:]
          *(1.0+axialError/result.opticalPoint[partner,3]);
        result.pixels[partner,:] := {integer(floor(result.rgbCalibration[3]+result.rgbCalibration[1]*result.opticalPoint[partner,1]/result.opticalPoint[partner,3])),
          integer(floor(result.rgbCalibration[4]+result.rgbCalibration[2]*result.opticalPoint[partner,2]/result.opticalPoint[partner,3]))};
      end if;
    end for;
  end Current;

  function Rms
    input RGBDKeyframes.Catalog catalog;
    input RGBDLoopVerification.Proposal proposal;
    output Real rms;
  protected
    Integer a; Integer b; Integer count; Real residual[3]; Real cost;
  algorithm
    a := mod(proposal.referenceId-1,RGBDKeyframes.keyframeCapacity)+1;
    b := mod(proposal.currentId-1,RGBDKeyframes.keyframeCapacity)+1; count := 0; cost := 0;
    for slot in 1:RGBDKeyframes.featureCapacity loop
      if proposal.inliers[slot] then
        residual := proposal.opticalRotation*catalog.opticalPoints[a,slot,:]+proposal.opticalTranslation
          -catalog.opticalPoints[b,proposal.partners[slot],:];
        cost := cost+residual*residual; count := count+1;
      end if;
    end for;
    rms := sqrt(cost/max(1,count));
  end Rms;

  function Run
    input Real clock;
    output Boolean checks[32]; output Real raw[24];
  protected
    RGBDKeyframes.Frame reference; RGBDKeyframes.Frame current;
    RGBDKeyframes.Catalog catalog; RGBDKeyframes.Catalog changed;
    RGBDGraphMeasurements.State graph;
    RGBDCatalogGraphCapture.Result result;
    RGBDLoopVerification.Proposal proposal; RGBDLoopVerification.Proposal legacy;
    Real vocabulary[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize]; Real enabled[RGBDKeyframes.wordCapacity];
    Real rotation[3,3]; Real translation[3];
    Real optimizedPosition[RGBDKeyframes.keyframeCapacity,3];
    Real optimizedRotation[RGBDKeyframes.keyframeCapacity,3,3];
    Real optimizerStatus; Real costBefore; Real costAfter; Real acceptedIterations; Real pcgIterations;
    Real activeNodes; Real activeEdges;
    Integer currentSlot; Integer selected;
    Boolean expected;
  algorithm
    checks := fill(false,32); raw := zeros(24);
    optimizerStatus := 0; costBefore := 0; costAfter := 0; acceptedIterations := 0; activeNodes := 0; activeEdges := 0;
    reference := Reference(); catalog := Catalog(reference); graph := RGBDGraphMeasurementTests.FullState();
    (vocabulary,enabled) := RGBDCatalogLoopTests.Vocabulary(reference);
    rotation := PGExp({0.03,-0.04,0.12}); translation := {0.3,-0.2,0.1};
    for scenario in 1:8 loop
      current := Current(reference,rotation,translation,if scenario == 2 or scenario == 3 then 8 else 0);
      if scenario == 4 then current.descriptor[345,:] := zeros(RGBDKeyframes.descriptorSize);
      elseif scenario == 5 then current.disparityNoise := 0.1;
      end if;
      proposal := RGBDLoopVerification.Verify(reference,current,true,
        minimumFraction=if scenario == 3 then 0.9 else 0.5);
      result := RGBDCatalogGraphCapture.Capture(catalog,current,vocabulary,enabled,graph,scenario <> 8,
        minimumFraction=if scenario == 3 then 0.9 else 0.5);
      raw[(scenario-1)*3+1:(scenario-1)*3+3] := {proposal.rejectionReason,proposal.inlierCount,proposal.rms};
      expected := scenario == 1 or scenario == 2 or scenario == 6 or scenario == 7;
      checks[(scenario-1)*4+1] := clock >= 0 and clock <= 0.001
        and RGBDKeyframes.ValidCatalog(catalog) and RGBDGraphMeasurements.ValidState(catalog,graph)
        and proposal.verified == (expected or scenario == 8);
      if expected then
        checks[(scenario-1)*4+2] := result.accepted and result.rejectionReason == 0
          and result.graphDiagnostics.admittedSequential == 1 and result.graphDiagnostics.admittedLoops == 4
          and result.problem.accepted and result.problem.nodeCount == 128 and result.problem.edgeCount == 256;
        checks[(scenario-1)*4+3] := proposal.inlierCount >= 16 and proposal.rms > 0.03
          and max(abs(proposal.opticalRotation-rotation)) < 0.03
          and max(abs(proposal.opticalTranslation-translation)) < 0.2
          and max(abs(proposal.covariance*proposal.information-identity(6))) < 1e-8;
        checks[(scenario-1)*4+4] := RGBDGraphMeasurements.ValidProposal(result.catalog,result.sequentialDiagnostics)
          and abs(Rms(result.catalog,result.sequentialDiagnostics)-result.sequentialDiagnostics.rms) < 1e-12;
        if scenario == 1 then
          legacy := RGBDLoopVerification.Verify(reference,current,true,calibratedResiduals=false);
          // A fixed gate can fit one half of the two-sided axial noise. It
          // cannot certify the complete physical inlier inventory here.
          checks[4] := checks[4] and (not legacy.verified or legacy.inlierCount < proposal.inlierCount);
          (optimizedPosition,optimizedRotation,optimizerStatus,costBefore,costAfter,
            acceptedIterations,pcgIterations,activeNodes,activeEdges) :=
            OptimizeModelicaPoseGraph(result.problem.positions,result.problem.rotations,result.problem.nodeMask,
              result.problem.edgeMask,result.problem.fromNode,result.problem.toNode,result.problem.measuredTranslation,
              result.problem.measuredRotation,result.problem.information,8,48,8,1e-3,0.5,0.15,1e-6);
          checks[4] := checks[4] and optimizerStatus == 2 and acceptedIterations > 0
            and costAfter >= 0 and costAfter < costBefore and activeNodes == 128 and activeEdges == 256
            and max(abs(optimizedPosition[1,:]-result.problem.positions[1,:])) == 0;
        elseif scenario == 2 then
          for slot in 1:8 loop checks[8] := checks[8] and not proposal.inliers[slot] and proposal.partners[slot] == 0; end for;
        elseif scenario == 6 then
          changed := result.catalog; proposal := result.sequentialDiagnostics;
          currentSlot := mod(proposal.currentId-1,RGBDKeyframes.keyframeCapacity)+1; selected := 0;
          for slot in 1:RGBDKeyframes.featureCapacity loop
            if proposal.inliers[slot] then selected := proposal.partners[slot]; end if;
          end for;
          changed.opticalPoints[currentSlot,selected,1] := changed.opticalPoints[currentSlot,selected,1]+0.5;
          proposal.rms := Rms(changed,proposal);
          checks[24] := checks[24] and not RGBDGraphMeasurements.ValidProposal(changed,proposal)
            and RGBDGraphMeasurements.ValidProposal(changed,proposal,1.0,0.8,calibratedResiduals=false);
        elseif scenario == 7 then
          changed := result.catalog; currentSlot := mod(result.sequentialDiagnostics.currentId-1,RGBDKeyframes.keyframeCapacity)+1;
          changed.noiseReferenceFocals[currentSlot] := 0;
          checks[28] := checks[28] and not RGBDGraphMeasurements.ValidProposal(changed,result.sequentialDiagnostics)
            and not RGBDGraphMeasurements.ValidProposal(result.catalog,result.sequentialDiagnostics,maximumNormalizedSquared=-1);
        end if;
      else
        checks[(scenario-1)*4+2] := not result.accepted and RGBDCatalogGraphTests.EqualCatalog(result.catalog,catalog)
          and RGBDGraphMeasurementTests.EqualState(result.graph,graph);
        checks[(scenario-1)*4+3] := result.storedSlot == 0 and result.evictedId == 0;
        checks[(scenario-1)*4+4] := if scenario == 3 then proposal.rejectionReason == 7
          elseif scenario == 4 then proposal.rejectionReason == 4
          elseif scenario == 5 then proposal.rejectionReason == 5
          else result.rejectionReason == 1 and result.sequentialDiagnostics.nextSeed == 7;
      end if;
    end for;
    raw[19:24] := {costBefore,costAfter,optimizerStatus,acceptedIterations,activeNodes,activeEdges};
  end Run;
end RGBDNoisyLoopReference;

model RGBDNoisyLoopAcceptance
  output Boolean checks[32]; output Real raw[24];
algorithm
  when initial() then
    (checks,raw) := RGBDNoisyLoopReference.Run(time);
  end when;
end RGBDNoisyLoopAcceptance;
