// Independent raw-camera format/geometry expectations. Array extents come from
// each case; production functions perform all scoring and metric sampling.
package RGBDRawImageInputsReference
  // Observe every cell without a temporary vector expression inside max().
  // OMC's generated reduction rebuilt (left-right) once per output element.
  function EqualScores
    input Real left[:]; input Real right[size(left,1)];
    output Boolean equal;
  algorithm
    equal := true;
    for index in 1:size(left,1) loop
      equal := (left[index] <= right[index] and right[index] <= left[index]) and equal;
    end for;
  end EqualScores;

  function Run
    input Integer imageSize[2]; input Real clock;
    output Boolean checks[24]; output Real metrics[6];
  protected
    Real rgb[imageSize[1],imageSize[2],3]; Real rgba[imageSize[1],imageSize[2],4];
    Real codes[imageSize[1],imageSize[2]]; Real meters[imageSize[1],imageSize[2]];
    Real scores[size(codes,1)*size(codes,2)]; Real oldScores[size(scores,1)];
    Real qualified[size(scores,1)]; Real oldQualified[size(scores,1)];
    Real pixels[2,2]; Real calibration[4]; Real point[3]; Boolean valid;
    Real descriptor[2,49]; Real oldDescriptor[2,49]; Real points[2,3]; Real oldPoints[2,3];
    Real enabled[2]; Real oldEnabled[2]; Real invalid; Real oldInvalid;
    Real expectedDepth; Real poison;
  algorithm
    checks := fill(false,24); metrics := zeros(6);
    poison := sin(exp(1000+clock));
    rgb := zeros(imageSize[1],imageSize[2],3);
    rgba := fill(poison,imageSize[1],imageSize[2],4);
    pixels := [4,4;imageSize[2]-4,imageSize[1]-4];
    for feature in 1:size(pixels,1) loop
      rgb[integer(pixels[feature,2])+1,integer(pixels[feature,1])+1,:] := fill(255.0,3);
    end for;
    rgba[:,:,1:3] := rgb;
    codes := fill(4000.0,imageSize[1],imageSize[2]); meters := fill(4.0,imageSize[1],imageSize[2]);
    calibration := {8,8,4,4};
    scores := FastFrameScores(rgb);
    oldScores := FastFrameScores(rgba);
    checks[1] := EqualScores(scores,oldScores);
    checks[2] := max(scores) == 255 and sum(scores) == 510;
    qualified := RGBDDepthQualifiedScores(codes,scores,calibration,calibration,0.28,10,0.08,400,0.05,depthUnits=0.001);
    oldQualified := RGBDDepthQualifiedScores(meters,scores,calibration,calibration,0.28,10,0.08,400,0.05);
    checks[3] := EqualScores(qualified,oldQualified) and sum(qualified) == 510;
    (descriptor,points,enabled,invalid) := DescribeRGBDFrame(rgb,codes,pixels,2,
      calibration,calibration,0.08,400,0.05,0.28,10,1e-6,depthUnits=0.001);
    (oldDescriptor,oldPoints,oldEnabled,oldInvalid) := DescribeRGBDFrame(rgba,meters,pixels,2,
      calibration,calibration,0.08,400,0.05,0.28,10,1e-6);
    checks[4] := max(abs(descriptor-oldDescriptor)) == 0 and max(abs(points-oldPoints)) == 0;
    checks[5] := sum(enabled) == 2 and invalid == 0 and sum(oldEnabled) == 2 and oldInvalid == 0;
    checks[6] := abs(descriptor[1,25]-sqrt(48.0/49.0)) < 1e-12
      and abs(descriptor[1,1]+1.0/sqrt(49.0*48.0)) < 1e-12;
    checks[7] := max(abs(points[1,:]-{0,0,4})) < 1e-12;
    checks[8] := max(abs(points[2,:]-{(imageSize[2]-8)/2.0,(imageSize[1]-8)/2.0,4})) < 1e-12;

    codes := fill(2000.0,imageSize[1],imageSize[2]);
    (point,valid) := RGBDCalibratedPoint(codes,{4,4},true,calibration,calibration,0.28,10,0.08,400,0.05,0.002);
    checks[9] := valid and max(abs(point-{0,0,4})) == 0;
    codes := fill(4096.0,imageSize[1],imageSize[2]);
    (point,valid) := RGBDCalibratedPoint(codes,{4,4},true,calibration,calibration,0.28,10,0.08,400,0.05,1.0/1024.0);
    checks[10] := valid and point[3] == 4;

    // Inverse-depth interpolation occurs after metric conversion, before the
    // existing depth-edge test. Independent harmonic expectation uses meters.
    codes := fill(4000.0,imageSize[1],imageSize[2]); codes[5,6] := 4016;
    expectedDepth := 1.0/(0.75/4.0+0.25/4.016);
    (point,valid) := RGBDCalibratedPoint(codes,{4.25,4},true,calibration,calibration,0.28,10,0.08,400,0.05,0.001);
    checks[11] := valid and abs(point[3]-expectedDepth) < 1e-12;
    checks[12] := abs(point[1]-0.25*expectedDepth/8) < 1e-12 and point[2] == 0;
    codes[5,6] := 8000;
    (point,valid) := RGBDCalibratedPoint(codes,{4.25,4},true,calibration,calibration,0.28,10,0.08,400,0.05,0.001);
    checks[13] := not valid and sum(abs(point)) == 0;

    // Separate RGB/depth optical calibration; no registered-depth assumption.
    codes := zeros(imageSize[1],imageSize[2]); codes[6,7] := 4000;
    (point,valid) := RGBDCalibratedPoint(codes,{4,4},true,{8,8,8,6},{4,4,8,6},0.28,10,0.08,400,0.05,0.001);
    checks[14] := valid and max(abs(point-{-2,-1,4})) < 1e-12;
    codes := fill(poison,imageSize[1],imageSize[2]); codes[5,5] := 4000;
    (point,valid) := RGBDCalibratedPoint(codes,{4,4},true,calibration,calibration,0.28,10,0.08,400,0.05,0.001);
    checks[15] := valid and point[3] == 4;
    for caseId in 1:4 loop
      (point,valid) := RGBDCalibratedPoint(codes,{4,4},true,calibration,calibration,0.28,10,0.08,400,0.05,
        if caseId == 1 then 0 else if caseId == 2 then -0.001 else if caseId == 3 then poison else 1e101);
      checks[15+caseId] := not valid and sum(abs(point)) == 0;
    end for;
    for caseId in 1:3 loop
      codes[5,5] := if caseId == 1 then 0 else if caseId == 2 then 65535 else 280;
      (point,valid) := RGBDCalibratedPoint(codes,{4,4},true,calibration,calibration,0.28,10,0.08,400,0.05,0.001);
      checks[19+caseId] := not valid and sum(abs(point)) == 0;
    end for;
    rgb := fill(poison,imageSize[1],imageSize[2],3);
    scores := FastFrameScores(rgb,false);
    qualified := RGBDDepthQualifiedScores(codes,fill(poison,size(scores,1)),calibration,calibration,
      0.28,10,0.08,400,0.05,false,depthUnits=poison);
    checks[23] := sum(abs(scores))+sum(abs(qualified)) == 0;
    (descriptor,points,enabled,invalid) := DescribeRGBDFrame(rgb,codes,pixels,2,
      calibration,calibration,0.08,400,0.05,0.28,10,1e-6,false,depthUnits=poison);
    checks[24] := sum(abs(descriptor))+sum(abs(points))+sum(abs(enabled))+abs(invalid) == 0;
    metrics := {imageSize[1],imageSize[2],size(scores,1),expectedDepth,oldPoints[2,3],oldDescriptor[1,25]};
  end Run;

  function RunAll
    input Real clock; output Boolean checks[3,24]; output Real metrics[3,6];
  protected
    Integer imageSize[2]; Boolean rowChecks[24]; Real rowMetrics[6];
  algorithm
    for caseId in 1:3 loop
      imageSize := if caseId == 1 then {13,17} else if caseId == 2 then {17,13} else {480,848};
      (rowChecks,rowMetrics) := Run(imageSize,clock);
      checks[caseId,:] := rowChecks; metrics[caseId,:] := rowMetrics;
    end for;
  end RunAll;
end RGBDRawImageInputsReference;

model RGBDRawImageInputsAcceptance
  output Boolean checks[3,24]; output Real metrics[3,6];
algorithm
  when initial() then
    (checks,metrics) := RGBDRawImageInputsReference.RunAll(time);
  end when;
end RGBDRawImageInputsAcceptance;
