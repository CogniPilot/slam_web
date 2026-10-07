// Test-only native reference file IO. This is not a production input/ABI or WASM loader.
package RGBDRenderedFrameInput
  constant Integer imageHeight = 90;
  constant Integer imageWidth = 160;
  constant Integer channelCount = 4;

  impure function Read
    input String fileName;
    input Integer frameIndex;
    input Integer imageSize[2] = {imageHeight,imageWidth};
    input Integer channels = channelCount;
    output Real rgb[imageSize[1],imageSize[2],channels];
    output Real depth[imageSize[1],imageSize[2]];
  protected
    String rgbName; String depthName;
    Integer rgbSize[2]; Integer depthSize[2];
    Real packedRgb[imageSize[1],imageSize[2]*channels];
  algorithm
    assert(frameIndex >= 1,"Rendered frame index must be positive");
    assert(channels == 3 or channels == 4,"Rendered RGB requires three or four channels");
    rgbName := "rgb_"+String(frameIndex);
    depthName := "depth_"+String(frameIndex);
    rgbSize := Modelica.Utilities.Streams.readMatrixSize(fileName,rgbName);
    depthSize := Modelica.Utilities.Streams.readMatrixSize(fileName,depthName);
    assert(rgbSize[1] == imageSize[1] and rgbSize[2] == imageSize[2]*channels,
      "Rendered RGB matrix must match the requested height and packed channel width");
    assert(depthSize[1] == imageSize[1] and depthSize[2] == imageSize[2],
      "Rendered depth matrix must match the requested image grid");
    packedRgb := Modelica.Utilities.Streams.readRealMatrix(fileName,rgbName,imageSize[1],imageSize[2]*channels,false);
    depth := Modelica.Utilities.Streams.readRealMatrix(fileName,depthName,imageSize[1],imageSize[2],false);
    for row in 1:size(rgb,1) loop
      for column in 1:size(rgb,2) loop
        for channel in 1:channels loop
          rgb[row,column,channel] := packedRgb[row,(column-1)*channels+channel];
        end for;
      end for;
    end for;
  end Read;

  // Independent arithmetic oracle for the runner's raw f32 sentinel generator.
  function ExpectedDepth
    input Integer frameIndex; input Integer row; input Integer column;
    output Real value;
  protected
    Integer linear; Integer kind;
  algorithm
    linear := (row-1)*imageWidth+column;
    kind := mod(linear+frameIndex,8);
    value := if kind == 0 then 0.0 else if kind == 1 then -1.5
      else if kind == 2 then 0.03125*mod(linear*7+frameIndex*11,1024)
      else if kind == 3 then -0.015625*mod(linear*3+frameIndex*17,512)
      else if kind == 4 then 2.0^(-149)
      else if kind == 5 then 16777216.0
      else if kind == 6 then 13421773.0/134217728.0 else 16777215.0;
  end ExpectedDepth;

  impure function CheckFrame
    input String fileName; input Integer frameIndex; input Real clock;
    output Boolean checks[4]; output Real raw[4];
  protected
    Real rgb[imageHeight,imageWidth,channelCount]; Real depth[imageHeight,imageWidth];
    Real expected; Boolean rgbEqual; Boolean depthEqual; Boolean cellEqual;
    Integer rgbCells; Integer depthCells; Integer rgbSum;
  algorithm
    (rgb,depth) := Read(fileName,frameIndex);
    rgbEqual := true; depthEqual := true; rgbCells := 0; depthCells := 0; rgbSum := 0;
    for row in 1:imageHeight loop
      for column in 1:imageWidth loop
        for channel in 1:channelCount loop
          expected := mod(frameIndex*37+row*13+column*7+channel*61,256);
          cellEqual := rgb[row,column,channel] <= expected and expected <= rgb[row,column,channel];
          rgbEqual := cellEqual and rgbEqual;
          rgbCells := rgbCells+1;
          rgbSum := rgbSum+integer(expected);
        end for;
        if frameIndex == 3 and row == 1 and column == 1 then
          cellEqual := not (depth[row,column] <= 0 or depth[row,column] >= 0);
        elseif frameIndex == 3 and row == 1 and column == 2 then
          cellEqual := depth[row,column] > 1e300;
        elseif frameIndex == 3 and row == 1 and column == 3 then
          cellEqual := depth[row,column] < -1e300;
        elseif frameIndex == 3 and row == 1 and column == 4 then
          cellEqual := depth[row,column] <= 0 and depth[row,column] >= 0 and atan2(depth[row,column],-1.0) < 0;
        else
          expected := ExpectedDepth(frameIndex,row,column);
          cellEqual := depth[row,column] <= expected and expected <= depth[row,column];
        end if;
        depthEqual := cellEqual and depthEqual;
        depthCells := depthCells+1;
      end for;
    end for;
    checks := {rgbEqual,depthEqual,rgbCells == imageHeight*imageWidth*channelCount
      and depthCells == imageHeight*imageWidth,clock >= 0 and clock <= 0.001};
    raw := {rgbCells,depthCells,frameIndex,rgbSum};
  end CheckFrame;

  impure function CheckFinite
    input String fileName; input Real clock;
    output Boolean checks[2,4]; output Real raw[2,4];
  protected
    Boolean frameChecks[4]; Real frameRaw[4];
  algorithm
    for frame in 1:2 loop
      (frameChecks,frameRaw) := CheckFrame(fileName,frame,clock);
      for item in 1:4 loop checks[frame,item] := frameChecks[item]; raw[frame,item] := frameRaw[item]; end for;
    end for;
  end CheckFinite;
end RGBDRenderedFrameInput;

model RGBDRenderedFrameInputFiniteAcceptance
  parameter String fileName = "rendered-sentinel.mat";
  output Boolean checks[2,4]; output Real raw[2,4];
algorithm
  (checks,raw) := RGBDRenderedFrameInput.CheckFinite(fileName,time);
end RGBDRenderedFrameInputFiniteAcceptance;

model RGBDRenderedFrameInputNonfiniteAcceptance
  parameter String fileName = "rendered-sentinel.mat";
  output Boolean checks[4]; output Real raw[4];
algorithm
  (checks,raw) := RGBDRenderedFrameInput.CheckFrame(fileName,3,time);
end RGBDRenderedFrameInputNonfiniteAcceptance;
