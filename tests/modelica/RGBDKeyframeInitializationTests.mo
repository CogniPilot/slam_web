package RGBDKeyframeInitializationTests
  function EqualFrame
    input RGBDKeyframes.Frame first; input RGBDKeyframesInitializationReference.Frame second;
    output Boolean equal;
  algorithm
    equal := first.generation == second.generation and first.id == second.id and first.epoch == second.epoch
      and first.imageTime == second.imageTime and first.count == second.count
      and first.disparityNoise == second.disparityNoise and first.noiseReferenceFx == second.noiseReferenceFx
      and first.baseline == second.baseline and first.vocabularyVersion == second.vocabularyVersion;
    for axis in 1:3 loop
      equal := equal and first.cameraOriginBody[axis] == second.cameraOriginBody[axis]
        and first.bodyPosition[axis] == second.bodyPosition[axis];
      for column in 1:3 loop
        equal := equal and first.opticalToBody[axis,column] == second.opticalToBody[axis,column]
          and first.bodyRotation[axis,column] == second.bodyRotation[axis,column];
      end for;
    end for;
    for axis in 1:2 loop equal := equal and first.rgbSize[axis] == second.rgbSize[axis] and first.depthSize[axis] == second.depthSize[axis]; end for;
    for axis in 1:4 loop equal := equal and first.rgbCalibration[axis] == second.rgbCalibration[axis] and first.depthCalibration[axis] == second.depthCalibration[axis]; end for;
    for row in 1:6 loop
      for column in 1:6 loop equal := equal and first.poseCovariance[row,column] == second.poseCovariance[row,column]; end for;
    end for;
    for feature in 1:RGBDKeyframes.featureCapacity loop
      equal := equal and first.enabled[feature] == second.enabled[feature];
      for sample in 1:RGBDKeyframes.descriptorSize loop equal := equal and first.descriptor[feature,sample] == second.descriptor[feature,sample]; end for;
      for axis in 1:3 loop equal := equal and first.opticalPoint[feature,axis] == second.opticalPoint[feature,axis]; end for;
      for axis in 1:2 loop equal := equal and first.pixels[feature,axis] == second.pixels[feature,axis]; end for;
    end for;
    for word in 1:RGBDKeyframes.wordCapacity loop equal := equal and first.histogram[word] == second.histogram[word]; end for;
  end EqualFrame;

  function Run
    input Integer generation;
    output Boolean passed[3];
    output Integer slotsValidated;
  protected
    RGBDKeyframes.Catalog catalog;
    RGBDKeyframes.Frame actual;
    RGBDKeyframesInitializationReference.Frame expected;
    Integer nextGeneration; Integer vocabularyVersion; Boolean correct;
  algorithm
    assert(generation == 1,"Initialization fixture requires original domains");
    passed := fill(false,3); slotsValidated := 0;
    expected := RGBDKeyframesInitializationReference.EmptyFrame();
    for scenario in 1:3 loop
      nextGeneration := if scenario == 1 then 1 else if scenario == 2 then 2 else RGBDKeyframes.identifierLimit;
      vocabularyVersion := if scenario == 1 then 1 else if scenario == 2 then 7 else RGBDKeyframes.identifierLimit;
      catalog := RGBDKeyframes.Empty(nextGeneration,vocabularyVersion);
      correct := catalog.generation == nextGeneration and catalog.vocabularyVersion == vocabularyVersion
        and catalog.nextId == 1 and catalog.nextSlot == 1 and catalog.lastEpoch == -1 and catalog.lastTime == 0;
      for node in 1:RGBDKeyframes.keyframeCapacity loop
        actual := RGBDKeyframes.ReadSlot(catalog,node);
        correct := correct and not catalog.occupied[node] and EqualFrame(actual,expected);
        slotsValidated := slotsValidated+1;
      end for;
      passed[scenario] := correct;
    end for;
  end Run;
end RGBDKeyframeInitializationTests;
