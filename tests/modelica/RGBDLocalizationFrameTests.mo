package RGBDLocalizationFrameTests
  function Run
    input Real clock; output Boolean checks[30];
  protected
    RGBDKeyframes.Frame frame; RGBDKeyframes.Frame expected; RGBDKeyframes.Frame defaults;
    Real descriptor[350,49]; Real point[350,3]; Real mask[350]; Real pixels[350,2];
    Real P[15,15]; Real covariance[15,15]; Real rgbCalibration[4]; Real R[3,3]; Real position[3];
    Integer generation; Integer id; Integer epoch; Integer expectedReason; Integer actualReason; Integer rowIndex; Integer columnIndex;
    Real coreEpoch; Real timestamp; Real count; Real poseAccepted;
    Boolean requested; Boolean accepted; Boolean wanted;
  algorithm
    assert(RGBDKeyframes.featureCapacity == 350 and RGBDKeyframes.descriptorSize == 49
      and RGBDLocalizationFrame.currentDimension == 15,"The source bridge retains full350/49/15 domains");
    defaults := RGBDKeyframes.EmptyFrame();
    for row in 1:15 loop
      for column in 1:15 loop
        // Independent SPD diagonal plus rankone, with everyposecrossblock nonzero.
        covariance[row,column] := (if row == column then 0.02*row else 0)+0.0001*row*column;
      end for;
    end for;
    checks := fill(false,30);
    for scenario in 1:30 loop
      descriptor := fill(1e101,350,49); point := fill(-1e101,350,3); pixels := fill(1e101,350,2);
      mask := zeros(350); mask[1] := 1; mask[350] := 1;
      for feature in 1:350 loop
        if feature == 1 or feature == 350 then
          descriptor[feature,:] := zeros(49); descriptor[feature,1] := 1/sqrt(2.0); descriptor[feature,49] := -1/sqrt(2.0);
          point[feature,:] := {0.001*feature,0.2,2.0}; pixels[feature,:] := {mod(feature,160),mod(feature,90)};
        end if;
      end for;
      generation := 1; id := 129; epoch := 200; coreEpoch := 200; timestamp := 140+clock; count := 350;
      P := covariance; rgbCalibration := defaults.rgbCalibration;
      R := {{0,-1,0},{1,0,0},{0,0,1}}; position := {2,-3,1}; poseAccepted := 1; requested := true;
      wanted := true; expectedReason := 0;
      if scenario == 2 then
        count := 2; mask[350] := 0; mask[2] := 1; descriptor[2,:] := descriptor[1,:]; point[2,:] := point[1,:]; pixels[2,:] := {159,89};
      elseif scenario == 3 then count := 0; mask := zeros(350);
      elseif scenario == 4 then count := 1; mask[350] := 0;
      elseif scenario == 5 then count := 2.5; wanted := false; expectedReason := 3;
      elseif scenario == 6 then count := -1; wanted := false; expectedReason := 3;
      elseif scenario == 7 then count := 351; wanted := false; expectedReason := 3;
      elseif scenario == 8 then mask[350] := 0.5; wanted := false; expectedReason := 3;
      elseif scenario == 9 then count := 2; wanted := false; expectedReason := 3;
      elseif scenario == 10 then pixels[1,1] := 0.5; wanted := false; expectedReason := 7;
      elseif scenario == 11 then pixels[350,1] := 160; wanted := false; expectedReason := 7;
      elseif scenario == 12 then pixels[1,2] := -1; wanted := false; expectedReason := 7;
      elseif scenario == 13 then epoch := 1000000000; coreEpoch := 1000000000;
      elseif scenario == 14 then epoch := 1000000001; coreEpoch := 1000000001; wanted := false; expectedReason := 2;
      elseif scenario == 15 then coreEpoch := 200.5; wanted := false; expectedReason := 2;
      elseif scenario == 16 then coreEpoch := 199; wanted := false; expectedReason := 2;
      elseif scenario == 17 then generation := 0; wanted := false; expectedReason := 2;
      elseif scenario == 18 then id := 1000000000; wanted := false; expectedReason := 2;
      elseif scenario == 19 then timestamp := -1; wanted := false; expectedReason := 2;
      elseif scenario == 20 then rgbCalibration[1] := 0; wanted := false; expectedReason := 4;
      elseif scenario == 21 then poseAccepted := 0.5; wanted := false; expectedReason := 5;
      elseif scenario == 22 then R := {{-1,0,0},{0,1,0},{0,0,1}}; wanted := false; expectedReason := 5;
      elseif scenario == 23 then P[1,7] := P[1,7]+0.1; wanted := false; expectedReason := 6;
      elseif scenario == 24 then P[9,9] := -1; wanted := false; expectedReason := 6;
      elseif scenario == 25 then point[350,3] := 0; wanted := false; expectedReason := 7;
      elseif scenario == 26 then descriptor[350,49] := 0; wanted := false; expectedReason := 7;
      elseif scenario == 27 then descriptor[1,:] := fill(1.0/7,49); wanted := false; expectedReason := 7;
      elseif scenario == 28 then
        requested := false; generation := -3; id := -7; epoch := -9; coreEpoch := 1e101; count := 1e101;
        mask := fill(0.5,350); pixels := fill(-1e101,350,2); descriptor := fill(1e101,350,49); point := fill(1e101,350,3);
        rgbCalibration := fill(-1,4); R := fill(1e101,3,3); position := fill(1e101,3); P := fill(-1e101,15,15);
        wanted := false; expectedReason := 1;
      elseif scenario == 29 then
        // Producer owns all nonselected covariance validation. Poison unused entries.
        for row in 1:15 loop
          for column in 1:15 loop
            if not ((row <= 3 or (row >= 7 and row <= 9)) and (column <= 3 or (column >= 7 and column <= 9))) then
              P[row,column] := -1e101;
            end if;
          end for;
        end for;
      elseif scenario == 30 then
        mask[350] := 0; count := 350; descriptor[350,:] := fill(1e101,49); point[350,:] := fill(-1e101,3); pixels[350,:] := fill(-1e101,2);
      end if;
      (frame,accepted,actualReason) := RGBDLocalizationFrame.Build(generation,id,epoch,coreEpoch,timestamp,count,
        descriptor,point,mask,pixels,defaults.rgbSize,defaults.depthSize,rgbCalibration,defaults.depthCalibration,
        defaults.opticalToBody,defaults.cameraOriginBody,defaults.disparityNoise,defaults.noiseReferenceFx,defaults.baseline,
        position,R,P,1,poseAccepted,requested);
      expected := defaults;
      if wanted then
        expected.generation := generation; expected.id := id; expected.epoch := epoch; expected.imageTime := timestamp;
        expected.count := integer(count); expected.rgbCalibration := rgbCalibration; expected.bodyPosition := position; expected.bodyRotation := R;
        for row in 1:6 loop
          rowIndex := if row <= 3 then row else row+3;
          for column in 1:6 loop
            columnIndex := if column <= 3 then column else column+3;
            expected.poseCovariance[row,column] := covariance[rowIndex,columnIndex];
          end for;
        end for;
        for feature in 1:350 loop
          if mask[feature] == 1 then
            expected.enabled[feature] := true; expected.descriptor[feature,:] := descriptor[feature,:]; expected.opticalPoint[feature,:] := point[feature,:];
            for coordinate in 1:2 loop expected.pixels[feature,coordinate] := integer(pixels[feature,coordinate]); end for;
          end if;
        end for;
      end if;
      checks[scenario] := accepted == wanted and actualReason == expectedReason and RGBDKeyframeRetrievalTests.EqualFrame(frame,expected) and max(abs(frame.histogram)) == 0;
    end for;
  end Run;
end RGBDLocalizationFrameTests;
