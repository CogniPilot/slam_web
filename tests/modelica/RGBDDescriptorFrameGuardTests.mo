package RGBDDescriptorFrameGuardTests
  constant Integer imageHeight = 90; constant Integer imageWidth = 160;
  constant Integer featureCapacity = 350; constant Integer descriptorSize = 49;

  // The original model's grayscale equations expressed as a reference function.
  // It is a baseline for the extraction, not a second descriptor algorithm.
  function Reference
    input Real rgb[imageHeight,imageWidth,4]; input Real depth[imageHeight,imageWidth];
    input Real pixels[featureCapacity,2]; input Real activeCount;
    input Real rgbCalibration[4]; input Real depthCalibration[4];
    input Real disparityNoise; input Real noiseReferenceFx; input Real baseline;
    input Real nearDepth; input Real farDepth; input Real minimumContrast;
    output Real descriptor[featureCapacity,descriptorSize]; output Real point[featureCapacity,3];
    output Real enabled[featureCapacity]; output Real invalidCount;
  protected
    constant Integer colorChannelCount = 3;
    Real gray[imageHeight,imageWidth];
  algorithm
    for y in 1:imageHeight loop
      for x in 1:imageWidth loop
        gray[y,x] := if rgb[y,x,1] >= 0.0 and rgb[y,x,1] <= 255.0 and rgb[y,x,2] >= 0.0 and rgb[y,x,2] <= 255.0 and rgb[y,x,3] >= 0.0 and rgb[y,x,3] <= 255.0
          then (rgb[y,x,1]+rgb[y,x,2]+rgb[y,x,3])/(colorChannelCount*255.0) else -1.0;
      end for;
    end for;
    (descriptor,point,enabled,invalidCount) := DescribeRGBDFeatures(gray,depth,pixels,activeCount,
      rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,nearDepth,farDepth,minimumContrast);
  end Reference;

  function Check
    input Integer scenario;
    output Boolean checks[8];
  protected
    Real rgb[imageHeight,imageWidth,4]; Real depth[imageHeight,imageWidth];
    Real pixels[featureCapacity,2]; Real rgbCalibration[4]; Real depthCalibration[4];
    Real activeCount; Real disparityNoise; Real noiseReferenceFx; Real baseline;
    Real nearDepth; Real farDepth; Real minimumContrast;
    Real descriptor[featureCapacity,descriptorSize]; Real point[featureCapacity,3];
    Real enabled[featureCapacity]; Real invalidCount;
    Real expectedDescriptor[featureCapacity,descriptorSize]; Real expectedPoint[featureCapacity,3];
    Real expectedEnabled[featureCapacity]; Real expectedInvalid;
    Real oracle[descriptorSize]; Real optical[3];
    Integer phase; Boolean imageEnabled; Integer selected;
  algorithm
    imageEnabled := scenario <> 1 and scenario <> 3 and scenario <> 5;
    phase := if scenario == 4 then 0 else if scenario == 2 then 0 else 27;
    rgb := RGBDLocalizationInitializeTests.RGB(phase);
    depth := RGBDLocalizationInitializeTests.Depth(0.0);
    pixels := RGBDLocalizationInitializeTests.Pixels();
    rgbCalibration := RGBDLocalizationInitializeTests.rgbCalibration;
    depthCalibration := RGBDLocalizationInitializeTests.depthCalibration;
    activeCount := 350; disparityNoise := 0.08;
    noiseReferenceFx := 848/(2*tan(87*3.141592653589793/360)); baseline := 0.05;
    nearDepth := 0.28; farDepth := 10.0; minimumContrast := 1e-6;
    for y in 1:imageHeight loop
      for x in 1:imageWidth loop
        // Enabled and disabled phases both poison alpha. It is never intensity.
        rgb[y,x,4] := if mod(x+y,2) == 0 then 1e250 else -1e250;
      end for;
    end for;
    if not imageEnabled then
      // Disabled processing must ignore every malformed image/feature/setting.
      rgb := fill(-1e200,imageHeight,imageWidth,4); depth := fill(1e200,imageHeight,imageWidth);
      pixels := fill(1e200,featureCapacity,2); activeCount := 1e200;
      rgbCalibration := fill(-1e200,4); depthCalibration := fill(1e200,4);
      disparityNoise := -1e200; noiseReferenceFx := -1e200; baseline := -1e200;
      nearDepth := -1e200; farDepth := -1e200; minimumContrast := -1e200;
    elseif scenario == 6 then
      // Same dense domain, every selected slot contains a real measurement.
      for slot in 1:featureCapacity loop pixels[slot,:] := {10+mod(slot*7,140),10+mod(slot*11,70)}; end for;
    elseif scenario == 7 then activeCount := 0.0;
    elseif scenario == 8 then activeCount := 3.5;
    elseif scenario == 9 then rgb[31,51,1] := -1.0;
    elseif scenario == 10 then depth := zeros(imageHeight,imageWidth);
    elseif scenario == 11 then rgbCalibration[1] := 0.0;
    elseif scenario == 12 then depthCalibration[2] := -1.0;
    elseif scenario == 13 then minimumContrast := 2.0;
    elseif scenario == 14 then pixels[350,:] := {2.0,2.0};
    elseif scenario == 15 then rgb := fill(100.0,imageHeight,imageWidth,4);
    elseif scenario == 16 then rgb[90,160,2] := 1e200;
    end if;
    // Omit the optional flag on the last control to verify default behavior.
    if scenario == 16 then
      (descriptor,point,enabled,invalidCount) := DescribeRGBDFrame(rgb,depth,pixels,activeCount,
        rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,
        nearDepth,farDepth,minimumContrast);
    else
      (descriptor,point,enabled,invalidCount) := DescribeRGBDFrame(rgb,depth,pixels,activeCount,
        rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,
        nearDepth,farDepth,minimumContrast,imageEnabled);
    end if;
    if imageEnabled then
      (expectedDescriptor,expectedPoint,expectedEnabled,expectedInvalid) := Reference(rgb,depth,pixels,activeCount,
        rgbCalibration,depthCalibration,disparityNoise,noiseReferenceFx,baseline,
        nearDepth,farDepth,minimumContrast);
    else
      expectedDescriptor := zeros(featureCapacity,descriptorSize); expectedPoint := zeros(featureCapacity,3);
      expectedEnabled := zeros(featureCapacity); expectedInvalid := 0.0;
    end if;
    checks := fill(true,8);
    checks[1] := invalidCount == expectedInvalid;
    for slot in 1:featureCapacity loop
      checks[2] := checks[2] and enabled[slot] == expectedEnabled[slot];
      for sample in 1:descriptorSize loop
        checks[3] := checks[3] and descriptor[slot,sample] == expectedDescriptor[slot,sample];
      end for;
      for coordinate in 1:3 loop
        checks[4] := checks[4] and point[slot,coordinate] == expectedPoint[slot,coordinate];
      end for;
    end for;
    if scenario == 2 or scenario == 4 or scenario == 16 then
      checks[5] := sum(enabled) == 3 and invalidCount == 347;
      for member in 1:3 loop
        selected := if member == 1 then 1 else if member == 2 then 37 else 350;
        oracle := RGBDLocalizationInitializeTests.ExpectedDescriptor(selected,phase);
        optical := RGBDLocalizationInitializeTests.ExpectedPoint(selected,0.0);
        for sample in 1:descriptorSize loop
          checks[6] := checks[6] and abs(descriptor[selected,sample]-oracle[sample]) <= 1e-12;
        end for;
        for coordinate in 1:3 loop
          checks[7] := checks[7] and abs(point[selected,coordinate]-optical[coordinate]) <= 1e-12;
        end for;
      end for;
    elseif scenario == 6 then
      checks[5] := sum(enabled) == 350 and invalidCount == 0.0;
    elseif not imageEnabled or scenario == 7 then
      checks[5] := sum(enabled) == 0 and invalidCount == 0.0;
    end if;
    checks[8] := scenario >= 1 and scenario <= 16;
  end Check;
end RGBDDescriptorFrameGuardTests;

model RGBDDescriptorFrameGuardAcceptance
  output Integer scenario;
  output Boolean checks[8];
equation
  scenario = min(16,integer(floor(time))+1);
  checks = RGBDDescriptorFrameGuardTests.Check(scenario);
end RGBDDescriptorFrameGuardAcceptance;
