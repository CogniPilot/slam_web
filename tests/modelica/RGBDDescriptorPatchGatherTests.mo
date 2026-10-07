// Numerical reference comparison only; not a compiler or browser SLAM gate.
// The runner wraps the frozen/current authored sources in separate packages.
package RGBDDescriptorPatchGatherTests
  function CompareFinite
    input Real rgb[:,:,:]; input Real depth[size(rgb,1),size(rgb,2)];
    input Real pixels[:,2]; input Real activeCount; input Boolean imageEnabled;
    input Real depthUnits = 1.0;
    output Boolean checks[3];
    output Real mismatch[3] "First differing public element, reference, current";
    output Real baselineEnabled[size(pixels,1)];
  protected
    Real calibration[4]; Real first[size(pixels,1),49]; Real second[size(pixels,1),49];
    Real firstPoint[size(pixels,1),3]; Real secondPoint[size(pixels,1),3];
    Real firstEnabled[size(pixels,1)]; Real secondEnabled[size(pixels,1)];
    Real firstInvalid; Real secondInvalid; Real a[1+size(pixels,1)*53]; Real b[1+size(pixels,1)*53];
  algorithm
    calibration := {100.0,110.0,(size(rgb,2)-1)/2.0,(size(rgb,1)-1)/2.0};
    (first,firstPoint,firstEnabled,firstInvalid) := RGBDDenseReference.DescribeRGBDFrame(
      rgb,depth,pixels,activeCount,calibration,calibration,0.08,84.3,0.05,
      0.28,10.0,1e-6,imageEnabled,depthUnits=depthUnits);
    (second,secondPoint,secondEnabled,secondInvalid) := RGBDPatchGather.DescribeRGBDFrame(
      rgb,depth,pixels,activeCount,calibration,calibration,0.08,84.3,0.05,
      0.28,10.0,1e-6,imageEnabled,depthUnits=depthUnits);
    a := Flatten(first,firstPoint,firstEnabled,firstInvalid);
    b := Flatten(second,secondPoint,secondEnabled,secondInvalid);
    baselineEnabled := firstEnabled;
    checks := fill(true,3); mismatch := zeros(3);
    for i in 1:size(a,1) loop
      if a[i] <> b[i] and mismatch[1] == 0.0 then mismatch := {i,a[i],b[i]}; end if;
      checks[1] := checks[1] and a[i] == b[i];
      checks[2] := checks[2] and abs(a[i]) <= 1e250 and abs(b[i]) <= 1e250;
      // Equality plus this zero-sign check proves exact finite f64 values.
      if a[i] == 0.0 and b[i] == 0.0 then
        checks[3] := checks[3] and atan2(a[i],-1.0) == atan2(b[i],-1.0);
      end if;
    end for;
  end CompareFinite;

  function Flatten
    input Real descriptor[:,:]; input Real point[size(descriptor,1),3];
    input Real enabled[size(descriptor,1)]; input Real invalidCount;
    output Real values[1+size(descriptor,1)*(1+3+size(descriptor,2))];
  protected
    Integer cursor;
  algorithm
    values[1] := invalidCount; cursor := 2;
    for feature in 1:size(descriptor,1) loop
      values[cursor] := enabled[feature]; cursor := cursor+1;
      values[cursor:cursor+2] := point[feature,:]; cursor := cursor+3;
      values[cursor:cursor+size(descriptor,2)-1] := descriptor[feature,:];
      cursor := cursor+size(descriptor,2);
    end for;
  end Flatten;

  impure function Run
    input String fixtureFile; input String resultFile;
    input Integer height; input Integer width; input Integer channels;
    input Integer capacity; input Integer scenarios;
    output Boolean written;
  protected
    Real packed[height,width*channels]; Real rgb[height,width,channels];
    Real depth[height,width]; Real pixels[capacity,2]; Real settings[1,3];
    Real descriptor[capacity,49]; Real point[capacity,3]; Real enabled[capacity]; Real invalidCount;
    Real results[2*scenarios,1+capacity*53]; Real calibration[4];
  algorithm
    calibration := {100.0,110.0,(width-1)/2.0,(height-1)/2.0};
    for scenario in 1:scenarios loop
      packed := Modelica.Utilities.Streams.readRealMatrix(fixtureFile,"rgb_"+String(scenario),height,width*channels,false);
      depth := Modelica.Utilities.Streams.readRealMatrix(fixtureFile,"depth_"+String(scenario),height,width,false);
      pixels := Modelica.Utilities.Streams.readRealMatrix(fixtureFile,"pixels_"+String(scenario),capacity,2,false);
      settings := Modelica.Utilities.Streams.readRealMatrix(fixtureFile,"settings_"+String(scenario),1,3,false);
      for y in 1:height loop
        for x in 1:width loop
          rgb[y,x,:] := packed[y,(x-1)*channels+1:x*channels];
        end for;
      end for;
      (descriptor,point,enabled,invalidCount) := RGBDDenseReference.DescribeRGBDFrame(
        rgb,depth,pixels,settings[1,1],calibration,calibration,0.08,84.3,0.05,
        0.28,10.0,1e-6,settings[1,2] == 1.0,depthUnits=settings[1,3]);
      results[2*scenario-1,:] := Flatten(descriptor,point,enabled,invalidCount);
      (descriptor,point,enabled,invalidCount) := RGBDPatchGather.DescribeRGBDFrame(
        rgb,depth,pixels,settings[1,1],calibration,calibration,0.08,84.3,0.05,
        0.28,10.0,1e-6,settings[1,2] == 1.0,depthUnits=settings[1,3]);
      results[2*scenario,:] := Flatten(descriptor,point,enabled,invalidCount);
    end for;
    written := Modelica.Utilities.Streams.writeRealMatrix(resultFile,"results",results,false);
  end Run;
end RGBDDescriptorPatchGatherTests;
