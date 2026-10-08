package RGBDRenderedRefusalHeldReference
  function Run
    input Real clock;
    output Boolean checks[17];
  protected
    RGBDGraphProcessing.State previous;
    RGBDGraphProcessing.State predicted;
    RGBDGraphProcessing.State completed;
    RGBDGraphProcessing.State changed;
  algorithm
    previous := RGBDGraphProcessing.Empty(RGBDLocalizationCatalog.Empty(
      RGBDLocalizationCatalog.EmptyEstimator(zeros(3),zeros(3),identity(3),zeros(3),zeros(3),identity(15)),1,1,1,0));
    previous.estimator.localization.estimator.referenceAvailable := 1;
    previous.estimator.localization.estimator.referenceEpoch := 1;
    predicted := previous;
    predicted.estimator.localization.predictionTime := 0.2;
    completed := predicted;
    completed.estimator.localization.lastProcessedImageEpoch := 2;
    completed.estimator.localization.lastProcessedImageTime := 0.2;
    checks[1] := clock >= 0 and clock <= 0.001
      and RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,completed,2,0.2,0);
    for mutation in 2:12 loop
      changed := completed;
      if mutation == 2 then
        changed.estimator.localization.lastProcessedImageEpoch := 3;
      elseif mutation == 3 then
        changed.estimator.localization.lastProcessedImageTime := 0.3;
      elseif mutation == 4 then
        changed.estimator.localization.estimator.position[3] := 1;
      elseif mutation == 5 then
        changed.estimator.localization.estimator.covariance[15,15] := 2;
      elseif mutation == 6 then
        changed.estimator.localization.estimator.referenceDescriptor[RGBDKeyframes.featureCapacity,RGBDKeyframes.descriptorSize] := 1;
      elseif mutation == 7 then
        changed.estimator.localization.map.point[RGBDKeyframes.featureCapacity,3] := 1;
      elseif mutation == 8 then
        changed.estimator.localization.catalog.nextId := 2;
      elseif mutation == 9 then
        changed.estimator.localization.graph.revision := 1;
      elseif mutation == 10 then
        changed.vocabulary.words[RGBDKeyframes.wordCapacity,RGBDKeyframes.descriptorSize] := 1;
      elseif mutation == 11 then
        changed.captures.lastStep := 1;
      else
        changed.estimator.poses.revision := 1;
      end if;
      checks[mutation] := not RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,changed,2,0.2,0);
    end for;
    changed := completed;
    changed.estimator.localization.estimator.lastUsedEpoch := 2;
    changed.estimator.localization.estimator.referenceUsed := 1;
    checks[13] := RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,changed,2,0.2,1);
    checks[14] := not RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,completed,2,0.2,1);
    checks[15] := not RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,changed,2,0.2,0);
    previous.estimator.localization.estimator.referenceUsed := 1;
    predicted.estimator.localization.estimator.referenceUsed := 1;
    completed.estimator.localization.estimator.referenceUsed := 1;
    checks[16] := RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,completed,2,0.2,1);
    checks[17] := not RGBDRenderedFlightSLAMReference.RefusalHeld(previous,predicted,changed,2,0.2,1);
  end Run;
end RGBDRenderedRefusalHeldReference;

model RGBDRenderedRefusalHeldAcceptance
  output Boolean checks[17];
algorithm
  when initial() then
    checks := RGBDRenderedRefusalHeldReference.Run(time);
  end when;
end RGBDRenderedRefusalHeldAcceptance;
