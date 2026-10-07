// Independent reference fixtures. They never supply a truth pose to a frontend.
package RGBDLocalizationInitializeTests
  constant Integer cases = 28;
  constant Real rgbCalibration[4] = {116.4,105.2,79.5,44.5};
  constant Real depthCalibration[4] = {84.3,74.8,79.5,44.5};
  constant Real rotation[3,3] = {{cos(0.37)*cos(-0.21),
    cos(0.37)*sin(-0.21)*sin(0.13)-sin(0.37)*cos(0.13),
    cos(0.37)*sin(-0.21)*cos(0.13)+sin(0.37)*sin(0.13)},
    {sin(0.37)*cos(-0.21),sin(0.37)*sin(-0.21)*sin(0.13)+cos(0.37)*cos(0.13),
    sin(0.37)*sin(-0.21)*cos(0.13)-cos(0.37)*sin(0.13)},
    {-sin(-0.21),cos(-0.21)*sin(0.13),cos(-0.21)*cos(0.13)}};
  constant Real opticalToBody[3,3] = [0,0,1;-1,0,0;0,-1,0];
  constant Real origin[3] = {0.2,-0.1,0.05};
  constant Real position[3] = {0.5,-0.4,0.8};
  constant Real velocity[3] = {1.1,-0.2,0.3};
  constant Real accelBias[3] = {0.1,-0.05,0.02};
  constant Real gyroBias[3] = {0.02,-0.01,0.015};
  constant Integer selection[6] = {1,2,3,7,8,9};

  // Test-only exhaustive comparisons avoid the reference compiler's quadratic
  // symbolic max-array deduplication. Every original cell and strict tolerance
  // remains observed; nonfinite differences fail their comparison.
  function CloseVector
    input Real actual[:]; input Real expected[:]; input Real tolerance;
    output Boolean close;
  algorithm
    close := size(actual,1) > 0 and size(actual,1) == size(expected,1)
      and tolerance > 0.0 and tolerance <= 1e6;
    if close then
      for cell in 1:size(actual,1) loop
        close := close and abs(actual[cell]-expected[cell]) < tolerance;
      end for;
    end if;
  end CloseVector;

  function CloseMatrix
    input Real actual[:,:]; input Real expected[:,:]; input Real tolerance;
    output Boolean close;
  algorithm
    close := size(actual,1) > 0 and size(actual,2) > 0
      and size(actual,1) == size(expected,1) and size(actual,2) == size(expected,2)
      and tolerance > 0.0 and tolerance <= 1e6;
    if close then
      for row in 1:size(actual,1) loop
        for column in 1:size(actual,2) loop
          close := close and abs(actual[row,column]-expected[row,column]) < tolerance;
        end for;
      end for;
    end if;
  end CloseMatrix;

  function ZeroVector
    input Real actual[:]; input Real tolerance; output Boolean close;
  algorithm
    close := CloseVector(actual,zeros(size(actual,1)),tolerance);
  end ZeroVector;

  function ZeroMatrix
    input Real actual[:,:]; input Real tolerance; output Boolean close;
  algorithm
    close := CloseMatrix(actual,zeros(size(actual,1),size(actual,2)),tolerance);
  end ZeroMatrix;

  function RGB
    input Integer phase; output Real rgb[90,160,4];
  algorithm
    for y in 1:90 loop
      for x in 1:160 loop
        for channel in 1:4 loop
          rgb[y,x,channel] := if channel == 4 then 255 else
            mod(17*(x-1)+3*(y-1)+11*channel+phase,256);
        end for;
      end for;
    end for;
  end RGB;

  function Depth
    input Real shift; output Real depth[90,160];
  algorithm
    for y in 1:90 loop
      for x in 1:160 loop
        // Smooth nonuniform axial-Z surface, not a constant-depth mock.
        depth[y,x] := 2.5+shift+0.004*(x-1)+0.008*(y-1);
      end for;
    end for;
  end Depth;

  function Pixels
    output Real pixels[350,2];
  algorithm
    pixels := fill(-1e101,350,2);
    pixels[1,:] := {50,30}; pixels[37,:] := {83,44}; pixels[350,:] := {110,64};
  end Pixels;

  function Covariance
    output Real P[15,15];
  algorithm
    for row in 1:15 loop
      for column in 1:15 loop
        P[row,column] := (if row == column then 0.01*row else 0)+0.00003*row*column;
      end for;
    end for;
  end Covariance;

  function PriorCross
    input Real P[15,15]; output Real cross[15,6];
  algorithm
    for row in 1:15 loop
      for column in 1:6 loop cross[row,column] := 0.3*P[row,selection[column]]; end for;
    end for;
  end PriorCross;

  function PriorReference
    input Real P[15,15]; output Real reference[6,6];
  algorithm
    for row in 1:6 loop
      for column in 1:6 loop
        reference[row,column] := 0.09*P[selection[row],selection[column]]+(if row == column then 0.02 else 0);
      end for;
    end for;
  end PriorReference;

  function OldDescriptors
    output Real descriptor[350,49];
  algorithm
    descriptor := zeros(350,49);
    for feature in 1:350 loop
      if feature == 1 or feature == 37 or feature == 350 then
        descriptor[feature,1] := 1/sqrt(2.0); descriptor[feature,49] := -1/sqrt(2.0);
      end if;
    end for;
  end OldDescriptors;

  function OldPoints
    output Real point[350,3];
  algorithm
    point := zeros(350,3);
    for feature in 1:350 loop
      if feature == 1 or feature == 37 or feature == 350 then point[feature,:] := {0.001*feature,0.2,2}; end if;
    end for;
  end OldPoints;

  function OldEnabled
    output Real enabled[350];
  algorithm
    enabled := zeros(350); enabled[1] := 1; enabled[37] := 1; enabled[350] := 1;
  end OldEnabled;

  function ExpectedPoint
    input Integer feature; input Real shift; output Real point[3];
  protected
    Real pixel[2]; Real bearing[2]; Real fraction[2]; Real z[4]; Real reciprocal;
    Integer lower[2];
  algorithm
    pixel := if feature == 1 then {50,30} else if feature == 37 then {83,44} else {110,64};
    for axis in 1:2 loop
      bearing[axis] := (pixel[axis]-rgbCalibration[axis+2])*depthCalibration[axis]/rgbCalibration[axis]+depthCalibration[axis+2];
      lower[axis] := integer(floor(bearing[axis])); fraction[axis] := bearing[axis]-lower[axis];
    end for;
    z := {2.5+shift+0.004*lower[1]+0.008*lower[2],
      2.5+shift+0.004*(lower[1]+1)+0.008*lower[2],
      2.5+shift+0.004*lower[1]+0.008*(lower[2]+1),
      2.5+shift+0.004*(lower[1]+1)+0.008*(lower[2]+1)};
    reciprocal := (1-fraction[1])*(1-fraction[2])/z[1]
      +fraction[1]*(1-fraction[2])/z[2]+(1-fraction[1])*fraction[2]/z[3]+fraction[1]*fraction[2]/z[4];
    point := {(pixel[1]-rgbCalibration[3])/rgbCalibration[1]/reciprocal,
      (pixel[2]-rgbCalibration[4])/rgbCalibration[2]/reciprocal,1/reciprocal};
  end ExpectedPoint;

  function ExpectedDescriptor
    input Integer feature; input Integer phase; output Real descriptor[49];
  protected
    Integer x; Integer y; Integer index; Real gray[49]; Real mean; Real length;
  algorithm
    x := if feature == 1 then 50 else if feature == 37 then 83 else 110;
    y := if feature == 1 then 30 else if feature == 37 then 44 else 64;
    for row in 0:6 loop
      for column in 0:6 loop
        index := row*7+column+1;
        // Independent unscaled intensity oracle: common255 scaling cancels.
        gray[index] := (mod(17*(x+column-3)+3*(y+row-3)+11+phase,256)
          +mod(17*(x+column-3)+3*(y+row-3)+22+phase,256)
          +mod(17*(x+column-3)+3*(y+row-3)+33+phase,256))/3;
      end for;
    end for;
    mean := sum(gray)/49; length := sqrt(sum((gray-mean*ones(49)).^2));
    descriptor := (gray-mean*ones(49))/length;
  end ExpectedDescriptor;
end RGBDLocalizationInitializeTests;
