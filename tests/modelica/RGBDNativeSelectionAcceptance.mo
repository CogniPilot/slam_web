// Native-sized raster qualification, without exposing full-raster output
// equations. All selection and independent expected values are Modelica.
package RGBDNativeSelectionReference
  constant Integer imageHeight = 480;
  constant Integer imageWidth = 848;
  constant Integer pixelCount = imageHeight*imageWidth;
  constant Integer featureCapacity = 350;
  constant Integer caseCount = 10;

  function ExpectedPeak
    input Integer row;
    input Real clock;
    output Real feature[3];
  algorithm
    // Equal-score peaks are separated by seven pixels. The last peak exercises
    // both far image edges, beyond the old 160-by-90 reference domain.
    feature := if row < featureCapacity then
      {200+7*mod(row-1,25),100+7*div(row-1,25),40+clock}
      else {844,476,40+clock};
  end ExpectedPeak;

  function Run
    input Real clock;
    output Boolean checks[caseCount*4];
    output Real metrics[caseCount,8];
    output Real selected[featureCapacity,3];
  protected
    Real scores[pixelCount];
    Real compact[featureCapacity,3];
    Real original[pixelCount,3];
    Real expected[featureCapacity,3];
    Real peak[3];
    Real settings[8];
    Real count; Real valid; Real originalCount; Real originalValid;
    Real expectedCount; Real expectedValid; Real expectedOriginalCount;
    Real expectedOriginalValid; Real nanValue;
    Integer cap; Integer index; Integer expectedMismatches;
    Integer originalMismatches; Integer paddingMismatches;
    Boolean enabled; Boolean compactMatchesOriginal;
  algorithm
    checks := fill(false,caseCount*4);
    metrics := zeros(caseCount,8);
    selected := zeros(featureCapacity,3);
    nanValue := sin(exp(1000+clock));
    for caseId in 1:caseCount loop
      scores := zeros(pixelCount);
      settings := {18,0,1e8,3,350,1,3,3};
      enabled := true;
      cap := if caseId == 1 then 1 else if caseId == 2 then 240 else 350;
      settings[5] := cap;
      expected := zeros(featureCapacity,3);
      expectedCount := 0; expectedValid := 1;
      if caseId <= 5 then
        for row in 1:featureCapacity loop
          peak := ExpectedPeak(row,clock);
          index := integer(peak[2])*imageWidth+integer(peak[1])+1;
          scores[index] := peak[3];
        end for;
        if caseId <= 3 then
          expectedCount := cap;
          for row in 1:cap loop expected[row,:] := ExpectedPeak(row,clock); end for;
        elseif caseId == 4 then
          scores := fill(nanValue,pixelCount);
          enabled := false;
        else
          settings[5] := featureCapacity+1;
          expectedValid := 0;
        end if;
      elseif caseId == 6 then
        settings[5] := 2.5; expectedValid := 0;
      elseif caseId == 7 then
        // Domain validation covers even an excluded border pixel.
        scores[1] := nanValue; expectedValid := 0;
      elseif caseId == 8 then
        scores[1] := 1e10; expectedValid := 0;
      elseif caseId == 9 then
        settings[3] := 1;
        scores[300*imageWidth+500+1] := 100.51;
        scores[100*imageWidth+200+1] := 100.5;
        scores[470*imageWidth+840+1] := 100.125;
        scores[470*imageWidth+841+1] := 100.375;
        scores[476*imageWidth+844+1] := 100.49;
        // 100.5 rounds to even100. Raster ties precede raw-score differences;
        // (840,470) suppresses (841,470), despite its smaller raw score.
        expectedCount := 4;
        expected[1,:] := {500,300,100.51};
        expected[2,:] := {200,100,100.5};
        expected[3,:] := {840,470,100.125};
        expected[4,:] := {844,476,100.49};
      else
        settings[1] := 18.5; settings[3] := 1; settings[4] := 0;
        scores[200*imageWidth+400+1] := 18.49;
        scores[200*imageWidth+410+1] := 18.5;
        // Both ranks are18. The earlier below-threshold raw score terminates
        // traversal before the later threshold-equal score, as originally.
      end if;
      (compact,count,valid) := SelectRasterFeatures(scores,imageWidth,imageHeight,
        featureCapacity,3,settings,false,enabled);
      (original,originalCount,originalValid) := SelectRasterFeatures(scores,imageWidth,imageHeight,
        pixelCount,3,settings,false,enabled);
      expectedOriginalCount := if caseId == 5 then featureCapacity else expectedCount;
      expectedOriginalValid := if caseId == 5 then 1 else expectedValid;
      expectedMismatches := 0; originalMismatches := 0; paddingMismatches := 0;
      compactMatchesOriginal := true;
      for row in 1:featureCapacity loop
        peak := if caseId == 5 then ExpectedPeak(row,clock) else expected[row,:];
        for column in 1:3 loop
          if not (compact[row,column] <= expected[row,column]
              and expected[row,column] <= compact[row,column]) then
            expectedMismatches := expectedMismatches+1;
          end if;
          if not (original[row,column] <= peak[column]
              and peak[column] <= original[row,column]) then
            originalMismatches := originalMismatches+1;
          end if;
          compactMatchesOriginal := compactMatchesOriginal
            and compact[row,column] <= original[row,column]
            and original[row,column] <= compact[row,column];
        end for;
      end for;
      for row in featureCapacity+1:pixelCount loop
        for column in 1:3 loop
          if not (original[row,column] <= 0 and original[row,column] >= 0) then
            paddingMismatches := paddingMismatches+1;
          end if;
        end for;
      end for;
      checks[(caseId-1)*4+1] := clock >= 0 and clock <= 0.001
        and count == expectedCount and valid == expectedValid;
      checks[(caseId-1)*4+2] := expectedMismatches == 0;
      checks[(caseId-1)*4+3] := originalCount == expectedOriginalCount
        and originalValid == expectedOriginalValid and originalMismatches == 0
        and (caseId == 5 or compactMatchesOriginal and count == originalCount and valid == originalValid);
      checks[(caseId-1)*4+4] := paddingMismatches == 0
        and (caseId <> 4 or not (nanValue <= 0 or nanValue >= 0));
      metrics[caseId,:] := {caseId,settings[5],count,valid,originalCount,originalValid,
        expectedMismatches+originalMismatches,paddingMismatches};
      if caseId == 3 then selected := compact; end if;
    end for;
  end Run;
end RGBDNativeSelectionReference;

model RGBDNativeSelectionAcceptance
  output Boolean checks[40];
  output Real metrics[10,8];
  output Real selected[350,3];
equation
  (checks,metrics,selected) = RGBDNativeSelectionReference.Run(time);
end RGBDNativeSelectionAcceptance;
