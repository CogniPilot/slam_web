// Independent ranking/geometry expectations. Native and transposed small grids
// use identical authored math; no image resizing or host numerical oracle.
package RGBDDepthQualifiedSelectionReference
  function Run
    input Integer imageSize[2]; input Real clock;
    output Boolean checks[18]; output Real metrics[8];
  protected
    Real depth[imageSize[1],imageSize[2]];
    Real scores[imageSize[1]*imageSize[2]];
    Real qualified[imageSize[1]*imageSize[2]];
    Real selected[2,3]; Real count; Real status;
    Real rgbCalibration[4]; Real depthCalibration[4]; Real poison;
    Integer nearIndex; Integer farIndex;
  algorithm
    checks := fill(false,18); metrics := zeros(8);
    nearIndex := 4*imageSize[2]+5;
    farIndex := (imageSize[1]-4)*imageSize[2]+imageSize[2]-3;
    poison := sin(exp(1000+clock));
    rgbCalibration := {8,8,8,6}; depthCalibration := rgbCalibration;
    depth := fill(4.0,imageSize[1],imageSize[2]);
    scores := zeros(size(scores,1)); scores[nearIndex] := 30+clock; scores[farIndex] := 100+clock;
    depth[imageSize[1]-3,imageSize[2]-3] := 10;
    (selected,count,status) := SelectRasterFeatures(scores,imageSize[2],imageSize[1],2,3,
      {18,0,1e8,3,1,1,3,3},false,true);
    checks[1] := status == 1 and count == 1
      and selected[1,1] == imageSize[2]-4 and selected[1,2] == imageSize[1]-4;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    (selected,count,status) := SelectRasterFeatures(qualified,imageSize[2],imageSize[1],2,3,
      {18,0,1e8,3,1,1,3,3},false,true);
    checks[2] := qualified[farIndex] == 0 and qualified[nearIndex] == scores[nearIndex];
    checks[3] := status == 1 and count == 1 and selected[1,1] == 4 and selected[1,2] == 4;
    metrics[1:3] := selected[1,:]; metrics[4] := count;

    // (4,4) in RGB maps to (6,5) in depth with these separate optics.
    scores := zeros(size(scores,1)); scores[nearIndex] := 30+clock;
    depth := zeros(imageSize[1],imageSize[2]); depth[6,7] := 4;
    depthCalibration := {4,4,8,6};
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[4] := qualified[nearIndex] == 30+clock;
    checks[5] := depth[5,5] == 0 and sum(qualified) == 30+clock;

    // Fractional calibration crosses a real discontinuity: reject interpolation.
    depthCalibration := {8,8,8.5,6};
    depth := fill(4.0,imageSize[1],imageSize[2]); depth[5,5] := 2; depth[5,6] := 8;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[6] := sum(qualified) == 0;
    depth[5,5] := 4; depth[5,6] := 4.01;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[7] := qualified[nearIndex] == 30+clock;

    // Zero-weight neighbours are never read, including poison at the far edges.
    depthCalibration := rgbCalibration;
    depth := fill(poison,imageSize[1],imageSize[2]); depth[5,5] := 4;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[8] := qualified[nearIndex] == 30+clock;
    scores := zeros(size(scores,1)); scores[farIndex] := 42+clock;
    depth[imageSize[1]-3,imageSize[2]-3] := 4;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[9] := qualified[farIndex] == 42+clock and sum(qualified) == 42+clock;
    metrics[5] := qualified[farIndex];

    scores := fill(poison,size(scores,1));
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05,false);
    checks[10] := sum(abs(qualified)) == 0;
    scores := zeros(size(scores,1));
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[11] := sum(abs(qualified)) == 0;

    // Invalid scores remain invalid, so qualification cannot hide bad inputs.
    scores[nearIndex] := poison;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    (selected,count,status) := SelectRasterFeatures(qualified,imageSize[2],imageSize[1],2,3,
      {18,0,1e8,3,1,1,3,3},false,true);
    checks[12] := status == 0 and count == 0;
    scores[nearIndex] := 1e10;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[13] := qualified[nearIndex] == 1e10;
    (selected,count,status) := SelectRasterFeatures(qualified,imageSize[2],imageSize[1],2,3,
      {18,0,1e8,3,1,1,3,3},false,true);
    checks[14] := status == 0 and count == 0;
    scores[nearIndex] := 30+clock;
    for caseId in 1:3 loop
      depth[5,5] := if caseId == 1 then 0 else if caseId == 2 then 0.28 else 9.95;
      qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
      checks[14+caseId] := qualified[nearIndex] == 0;
    end for;
    depth[5,5] := 4; rgbCalibration[1] := 0;
    qualified := RGBDDepthQualifiedScores(depth,scores,rgbCalibration,depthCalibration,0.28,10,0.08,400,0.05);
    checks[18] := qualified[nearIndex] == 0;
    metrics[6:8] := {imageSize[1],imageSize[2],size(qualified,1)};
  end Run;
  function RunAll
    input Real clock;
    output Boolean checks[3,18]; output Real metrics[3,8];
  protected
    Boolean rowChecks[18]; Real rowMetrics[8]; Integer imageSize[2];
  algorithm
    for caseId in 1:3 loop
      imageSize := if caseId == 1 then {13,17} else if caseId == 2 then {17,13} else {480,848};
      (rowChecks,rowMetrics) := Run(imageSize,clock);
      for column in 1:18 loop checks[caseId,column] := rowChecks[column]; end for;
      for column in 1:8 loop metrics[caseId,column] := rowMetrics[column]; end for;
    end for;
  end RunAll;
end RGBDDepthQualifiedSelectionReference;

model RGBDDepthQualifiedSelectionAcceptance
  output Boolean checks[3,18]; output Real metrics[3,8];
algorithm
  when initial() then
    (checks,metrics) := RGBDDepthQualifiedSelectionReference.RunAll(time);
  end when;
end RGBDDepthQualifiedSelectionAcceptance;
