package RGBDTrackingGeometryTests
  constant Integer featureCapacity = 350;
  constant Integer scenarioCount = 32;

  function Run
    input Real clock;
    output Boolean checks[scenarioCount];
  protected
    Real index[featureCapacity];
    Real currentPixels[featureCapacity,2]; Real oldPixels[featureCapacity,2];
    Real currentEnabled[featureCapacity]; Real oldEnabled[featureCapacity];
    Real current[featureCapacity,2]; Real reference[featureCapacity,2];
    Real enabled[featureCapacity];
    Real expectedCurrent[featureCapacity,2]; Real expectedReference[featureCapacity,2];
    Real expectedEnabled[featureCapacity];
    Real frozenCurrent[featureCapacity,2]; Real frozenReference[featureCapacity,2];
    Real frozenEnabled[featureCapacity];
    Integer imageSize[2];
    Boolean firstAccepted; Boolean lastAccepted; Boolean same;
  algorithm
    assert(clock >= 0.0,"The actual runtime clock is nonnegative");
    checks := fill(false,scenarioCount);
    for scenario in 1:scenarioCount loop
      // Only two sparse references are enabled, including the last slot.
      // All unselected payloads deliberately exceed every valid image domain.
      index := fill(-1e101,featureCapacity);
      currentPixels := fill(1e101,featureCapacity,2);
      oldPixels := fill(-1e101,featureCapacity,2);
      currentEnabled := zeros(featureCapacity); oldEnabled := zeros(featureCapacity);
      index[1] := 2; index[featureCapacity] := featureCapacity;
      currentEnabled[2] := 1; currentEnabled[featureCapacity] := 1;
      oldEnabled[1] := 1; oldEnabled[featureCapacity] := 1;
      oldPixels[1,:] := {0,0}; currentPixels[2,:] := {1,2};
      oldPixels[featureCapacity,:] := {847,479};
      currentPixels[featureCapacity,:] := {846,478};
      imageSize := {480,848}; firstAccepted := true; lastAccepted := true;

      if scenario == 2 then oldPixels[featureCapacity,1] := 848; lastAccepted := false;
      elseif scenario == 3 then oldPixels[featureCapacity,2] := 480; lastAccepted := false;
      elseif scenario == 4 then currentPixels[featureCapacity,1] := 848; lastAccepted := false;
      elseif scenario == 5 then currentPixels[featureCapacity,2] := 480; lastAccepted := false;
      elseif scenario == 6 then oldPixels[featureCapacity,1] := -1; lastAccepted := false;
      elseif scenario == 7 then oldPixels[featureCapacity,2] := 0.25; lastAccepted := false;
      elseif scenario == 8 then currentPixels[featureCapacity,1] := 0.5; lastAccepted := false;
      elseif scenario == 9 then currentPixels[featureCapacity,2] := -1; lastAccepted := false;
      elseif scenario == 10 then index[featureCapacity] := 0; lastAccepted := false;
      elseif scenario == 11 then index[featureCapacity] := featureCapacity+1; lastAccepted := false;
      elseif scenario == 12 then index[featureCapacity] := 1.5; lastAccepted := false;
      elseif scenario == 13 then index[featureCapacity] := -1; lastAccepted := false;
      elseif scenario == 14 then
        oldEnabled[featureCapacity] := 0; index[featureCapacity] := 1e101;
        oldPixels[featureCapacity,:] := fill(-1e101,2); lastAccepted := false;
      elseif scenario == 15 then
        currentEnabled[featureCapacity] := 0;
        currentPixels[featureCapacity,:] := fill(1e101,2); lastAccepted := false;
      elseif scenario == 16 then oldEnabled[featureCapacity] := 0.5; lastAccepted := false;
      elseif scenario == 17 then currentEnabled[featureCapacity] := 0.5; lastAccepted := false;
      elseif scenario == 18 then imageSize := {0,848}; firstAccepted := false; lastAccepted := false;
      elseif scenario == 19 then imageSize := {-1,848}; firstAccepted := false; lastAccepted := false;
      elseif scenario == 20 then imageSize := {480,0}; firstAccepted := false; lastAccepted := false;
      elseif scenario == 21 then imageSize := {480,-5}; firstAccepted := false; lastAccepted := false;
      elseif scenario == 22 then
        imageSize := {3,7}; oldPixels[featureCapacity,:] := {6,2};
        currentPixels[featureCapacity,:] := {5,1};
      elseif scenario == 23 then
        imageSize := {7,3}; oldPixels[featureCapacity,:] := {2,6};
        currentPixels[featureCapacity,:] := {1,5};
      elseif scenario == 24 then
        imageSize := {1,1}; currentPixels[2,:] := {0,0};
        oldPixels[featureCapacity,:] := {0,0}; currentPixels[featureCapacity,:] := {0,0};
      elseif scenario >= 25 then
        imageSize := {90,160}; oldPixels[featureCapacity,:] := {159,89};
        currentPixels[featureCapacity,:] := {158,88};
        if scenario == 26 then oldPixels[featureCapacity,1] := 160; lastAccepted := false;
        elseif scenario == 27 then currentPixels[featureCapacity,2] := 90; lastAccepted := false;
        elseif scenario == 28 then index[featureCapacity] := 350.5; lastAccepted := false;
        elseif scenario == 29 then oldPixels[featureCapacity,2] := 88.5; lastAccepted := false;
        elseif scenario == 30 then
          oldEnabled[featureCapacity] := 0; index[featureCapacity] := -1e101;
          oldPixels[featureCapacity,:] := fill(1e101,2); lastAccepted := false;
        elseif scenario == 31 then
          currentEnabled[featureCapacity] := 0.25;
          currentPixels[featureCapacity,:] := fill(-1e101,2); lastAccepted := false;
        elseif scenario == 32 then
          // Dense reverse correspondence exercises every source/output slot.
          for feature in 1:featureCapacity loop
            index[feature] := featureCapacity+1-feature;
            oldEnabled[feature] := 1; currentEnabled[feature] := 1;
            oldPixels[feature,:] := {mod(feature,160),mod(feature,90)};
            currentPixels[feature,:] := {mod(feature+13,160),mod(feature+17,90)};
          end for;
        end if;
      end if;

      expectedCurrent := zeros(featureCapacity,2);
      expectedReference := zeros(featureCapacity,2); expectedEnabled := zeros(featureCapacity);
      if scenario == 32 then
        for feature in 1:featureCapacity loop
          expectedEnabled[feature] := 1;
          expectedReference[feature,:] := {mod(feature,160),mod(feature,90)};
          expectedCurrent[feature,:] := {mod(featureCapacity+1-feature+13,160),
            mod(featureCapacity+1-feature+17,90)};
        end for;
      else
        if firstAccepted then
          expectedCurrent[1,:] := currentPixels[2,:];
          expectedReference[1,:] := oldPixels[1,:]; expectedEnabled[1] := 1;
        end if;
        if lastAccepted then
          expectedCurrent[featureCapacity,:] := currentPixels[featureCapacity,:];
          expectedReference[featureCapacity,:] := oldPixels[featureCapacity,:];
          expectedEnabled[featureCapacity] := 1;
        end if;
      end if;
      (current,reference,enabled) := RGBDLocalizationTracking(index,currentPixels,oldPixels,
        oldEnabled,currentEnabled,imageSize);
      same := true;
      for feature in 1:featureCapacity loop
        same := same and SLAMExactRealEqual(enabled[feature],expectedEnabled[feature]);
        for coordinate in 1:2 loop
          same := same and SLAMExactRealEqual(current[feature,coordinate],expectedCurrent[feature,coordinate])
            and SLAMExactRealEqual(reference[feature,coordinate],expectedReference[feature,coordinate]);
        end for;
      end for;
      if scenario >= 25 then
        (frozenCurrent,frozenReference,frozenEnabled) := RGBDLocalizationTrackingFrozen(index,
          currentPixels,oldPixels,oldEnabled,currentEnabled);
        for feature in 1:featureCapacity loop
          same := same and SLAMExactRealEqual(enabled[feature],frozenEnabled[feature]);
          for coordinate in 1:2 loop
            same := same and SLAMExactRealEqual(current[feature,coordinate],frozenCurrent[feature,coordinate])
              and SLAMExactRealEqual(reference[feature,coordinate],frozenReference[feature,coordinate]);
          end for;
        end for;
      end if;
      checks[scenario] := same;
    end for;
  end Run;
end RGBDTrackingGeometryTests;

model RGBDTrackingGeometryAcceptance
  output Boolean checks[RGBDTrackingGeometryTests.scenarioCount];
equation
  checks = RGBDTrackingGeometryTests.Run(time);
end RGBDTrackingGeometryAcceptance;
