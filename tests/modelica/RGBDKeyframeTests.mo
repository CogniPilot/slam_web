// Full-capacity Modelica semantics controls, independent of the JS transport.
// OMC is a differential test tool only; production execution must use Rumoca.
package RGBDKeyframeTests
  function Measurement
    input Integer id;
    input Integer epoch;
    input Real timestamp;
    output RGBDKeyframes.Frame frame;
  algorithm
    frame := RGBDKeyframes.EmptyFrame();
    frame.id := id; frame.epoch := epoch; frame.imageTime := timestamp;
    frame.count := RGBDKeyframes.featureCapacity;
    // Seven early features and the last slot exercise the complete sparse domain.
    for i in 1:RGBDKeyframes.featureCapacity loop
      if i <= 7 or i == RGBDKeyframes.featureCapacity then
        frame.enabled[i] := true;
        frame.descriptor[i,1] := 1/sqrt(2.0);
        frame.descriptor[i,2] := -1/sqrt(2.0);
        frame.opticalPoint[i,:] := {i/1000.0,0.2,2.0};
        frame.pixels[i,:] := {mod(i,frame.rgbSize[2]),mod(i,frame.rgbSize[1])};
      end if;
    end for;
    frame.histogram[1] := 0.25;
    frame.histogram[RGBDKeyframes.wordCapacity] := 0.75;
    frame.bodyPosition := {id/10.0,2.0,3.0};
    frame.poseCovariance := 0.01*identity(RGBDKeyframes.poseDimension);
  end Measurement;

  function Run
    input Integer initialGeneration = 1;
    output Boolean passed[20];
  protected
    RGBDKeyframes.Catalog previous;
    RGBDKeyframes.Catalog next;
    RGBDKeyframes.Frame candidate;
    RGBDKeyframes.Frame foundFrame;
    Boolean accepted;
    Boolean found;
    Integer slot;
    Integer evicted;
  algorithm
    passed := fill(false,20);
    previous := RGBDKeyframes.Empty(initialGeneration);
    candidate := Measurement(1,0,0.0);
    passed[1] := RGBDKeyframes.ValidCatalog(previous) and RGBDKeyframes.ValidFrame(candidate);
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[2] := accepted and slot == 1 and evicted == 0 and next.nextId == 2
      and RGBDKeyframes.ValidCatalog(next)
      and next.descriptors[1,RGBDKeyframes.featureCapacity,2] == -1/sqrt(2.0)
      and next.opticalPoints[1,RGBDKeyframes.featureCapacity,1] == 0.35
      and next.pixelCoordinates[1,RGBDKeyframes.featureCapacity,1] == 30
      and next.histograms[1,RGBDKeyframes.wordCapacity] == 0.75
      and next.poseCovariances[1,6,6] == 0.01;
    previous := next;
    candidate := Measurement(2,0,1.0);
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[3] := not accepted and slot == 0 and evicted == 0
      and next.nextId == previous.nextId and next.epochs[1] == 0;
    candidate := Measurement(2,1,0.0);
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[4] := not accepted and not next.occupied[2];
    candidate := Measurement(2,1,1.0);
    candidate.rgbCalibration[1] := 0.0;
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[5] := not accepted and next.nextId == 2 and next.rgbCalibrations[1,1] > 0;
    candidate := Measurement(2,1,1.0);
    candidate.poseCovariance[1,2] := 0.02;
    candidate.poseCovariance[2,1] := 0.02;
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[6] := not accepted and next.poseCovariances[1,1,2] == 0;
    candidate := Measurement(2,1,1.0);
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,false);
    passed[7] := not accepted and slot == 0 and next.nextId == 2;
    (foundFrame,found,slot) := RGBDKeyframes.Lookup(previous,2,1);
    passed[8] := not found and slot == 0 and foundFrame.id == 0;

    // Populate all real slots without shrinking the catalog for the tests.
    previous := RGBDKeyframes.Empty();
    previous.nextId := RGBDKeyframes.keyframeCapacity+1;
    previous.lastEpoch := RGBDKeyframes.keyframeCapacity;
    previous.lastTime := RGBDKeyframes.keyframeCapacity;
    for i in 1:RGBDKeyframes.keyframeCapacity loop
      candidate := Measurement(i,i,i);
      previous.generations[i] := candidate.generation;
      previous.ids[i] := candidate.id;
      previous.epochs[i] := candidate.epoch;
      previous.imageTimes[i] := candidate.imageTime;
      previous.counts[i] := candidate.count;
      previous.featureEnabled[i,:] := candidate.enabled;
      previous.descriptors[i,:,:] := candidate.descriptor;
      previous.opticalPoints[i,:,:] := candidate.opticalPoint;
      previous.pixelCoordinates[i,:,:] := candidate.pixels;
      previous.rgbSizes[i,:] := candidate.rgbSize;
      previous.depthSizes[i,:] := candidate.depthSize;
      previous.rgbCalibrations[i,:] := candidate.rgbCalibration;
      previous.depthCalibrations[i,:] := candidate.depthCalibration;
      previous.opticalToBodyRotations[i,:,:] := candidate.opticalToBody;
      previous.cameraOriginsBody[i,:] := candidate.cameraOriginBody;
      previous.disparityNoises[i] := candidate.disparityNoise;
      previous.noiseReferenceFocals[i] := candidate.noiseReferenceFx;
      previous.baselines[i] := candidate.baseline;
      previous.bodyRotations[i,:,:] := candidate.bodyRotation;
      previous.bodyPositions[i,:] := candidate.bodyPosition;
      previous.poseCovariances[i,:,:] := candidate.poseCovariance;
      previous.vocabularyVersions[i] := candidate.vocabularyVersion;
      previous.histograms[i,:] := candidate.histogram;
      previous.occupied[i] := true;
    end for;
    passed[9] := RGBDKeyframes.ValidCatalog(previous);
    candidate := Measurement(RGBDKeyframes.keyframeCapacity+1,
      RGBDKeyframes.keyframeCapacity+1,RGBDKeyframes.keyframeCapacity+1);
    candidate.depthCalibration[1] := 93.0;
    candidate.disparityNoise := 0.12;
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[10] := accepted and slot == 1 and evicted == 1
      and next.ids[1] == RGBDKeyframes.keyframeCapacity+1
      and next.depthCalibrations[1,1] == 93.0 and next.disparityNoises[1] == 0.12
      and next.ids[RGBDKeyframes.keyframeCapacity] == RGBDKeyframes.keyframeCapacity
      and next.nextSlot == 2 and RGBDKeyframes.ValidCatalog(next);
    previous := next;
    (foundFrame,found,slot) := RGBDKeyframes.Lookup(previous,1,1);
    passed[11] := not found and slot == 0;
    (foundFrame,found,slot) := RGBDKeyframes.Lookup(previous,1,RGBDKeyframes.keyframeCapacity+1);
    passed[12] := found and slot == 1 and foundFrame.epoch == RGBDKeyframes.keyframeCapacity+1;
    (next,accepted) := RGBDKeyframes.Reset(previous,2);
    passed[13] := accepted and next.generation == 2 and next.nextId == 1
      and next.lastEpoch == -1 and not next.occupied[RGBDKeyframes.keyframeCapacity]
      and RGBDKeyframes.ValidCatalog(next);
    (next,accepted) := RGBDKeyframes.Reset(previous,1);
    passed[14] := not accepted and next.ids[1] == RGBDKeyframes.keyframeCapacity+1;
    previous.epochs[RGBDKeyframes.keyframeCapacity] := 1;
    passed[15] := not RGBDKeyframes.ValidCatalog(previous);
    previous := next;
    candidate := Measurement(previous.nextId,previous.lastEpoch+1,previous.lastTime+1);
    candidate.vocabularyVersion := 2;
    (next,accepted,slot,evicted) := RGBDKeyframes.Store(previous,candidate,true);
    passed[16] := not accepted and slot == 0 and evicted == 0
      and next.vocabularyVersion == 1 and next.nextId == previous.nextId;
    next := previous;
    next.nextId := -2147483648;
    passed[17] := not RGBDKeyframes.ValidHeader(next);
    next := previous;
    next.ids[1] := -2147483648;
    passed[18] := not RGBDKeyframes.ValidHeader(next);
    next := previous;
    next.vocabularyVersions[1] := 2;
    passed[19] := not RGBDKeyframes.ValidHeader(next);
    (next,accepted) := RGBDKeyframes.Reset(previous,2,3);
    passed[20] := accepted and next.vocabularyVersion == 3
      and next.generation == 2 and RGBDKeyframes.ValidCatalog(next);
  end Run;
end RGBDKeyframeTests;
