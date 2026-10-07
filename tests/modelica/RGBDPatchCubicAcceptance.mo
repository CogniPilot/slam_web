// Independent analytic image/Jacobian and interpolation-domain controls; no flight oracle.
package RGBDPatchCubicReference
  constant Integer height = 90;
  constant Integer width = 160;
  constant Integer capacity = 350;
  constant Integer patchSize = 49;

  function Texture
    input Real x; input Real y; output Real value;
  algorithm
    value := 0.2+0.00002*x*x+0.00004*y*y+0.00002*x*y+0.0008*x-0.0006*y;
  end Texture;

  function NormalizeOracle
    input Real values[patchSize]; input Real gradient[patchSize,2];
    output Real descriptor[patchSize]; output Real jacobian[patchSize,2]; output Real energy;
  protected
    Real meanValue; Real meanGradient[2]; Real covariance[2]; Real rootEnergy;
  algorithm
    meanValue := 0; meanGradient := zeros(2);
    for slot in 1:patchSize loop
      meanValue := meanValue+values[slot]/patchSize;
      meanGradient := meanGradient+gradient[slot,:]/patchSize;
    end for;
    energy := 0; covariance := zeros(2);
    for slot in 1:patchSize loop
      energy := energy+(values[slot]-meanValue)^2;
      covariance := covariance+(values[slot]-meanValue)*(gradient[slot,:]-meanGradient);
    end for;
    rootEnergy := sqrt(energy);
    for slot in 1:patchSize loop
      descriptor[slot] := (values[slot]-meanValue)/rootEnergy;
      jacobian[slot,:] := (gradient[slot,:]-meanGradient)/rootEnergy-descriptor[slot]*covariance/energy;
    end for;
  end NormalizeOracle;

  function Analytic
    input Real localPixel[2];
    output Real descriptor[patchSize]; output Real jacobian[patchSize,2]; output Real energy;
  protected
    Real values[patchSize]; Real gradient[patchSize,2]; Real x; Real y; Integer slot;
  algorithm
    for row in 1:7 loop
      for column in 1:7 loop
        slot := (row-1)*7+column; x := localPixel[1]+column-4; y := localPixel[2]+row-4;
        values[slot] := Texture(x,y);
        gradient[slot,:] := {0.00004*x+0.00002*y+0.0008,0.00008*y+0.00002*x-0.0006};
      end for;
    end for;
    (descriptor,jacobian,energy) := NormalizeOracle(values,gradient);
  end Analytic;

  function Error
    input Real left[:]; input Real right[size(left,1)]; output Real errorValue;
  algorithm
    errorValue := 0;
    for slot in 1:size(left,1) loop errorValue := max(errorValue,abs(left[slot]-right[slot])); end for;
  end Error;

  function Run
    input Real clock;
    output Boolean checks[44]; output Real raw[10,6];
  protected
    constant Real center[2] = {80,45}; constant Real shift[2] = {0.35,-0.25};
    constant Real epsilon = 1e-5;
    Real gray[height,width]; Real affine[height,width]; Real nonlinear[height,width];
    Real aperture[height,width]; Real poison[height,width]; Real stepImage[height,width];
    Real descriptor[patchSize]; Real jacobian[patchSize,2]; Real energy;
    Real expected[patchSize]; Real expectedJacobian[patchSize,2]; Real expectedEnergy;
    Real reference[patchSize]; Real values[patchSize]; Real gradients[patchSize,2];
    Real plus[patchSize]; Real minus[patchSize]; Real plusJacobian[patchSize,2]; Real minusJacobian[patchSize,2];
    Real plusEnergy; Real minusEnergy; Real point[2]; Real pixel[2]; Real savedPixel[2];
    Real cost; Real eigenvalue; Real savedCost; Real savedEigenvalue; Real errorValue;
    Real nanValue; Real infinity; Real knotErrors[2]; Real continuityErrors[2];
    Real stepValues[7] = {0,-0.0625,0.5,1.0625,1,1,1};
    Real stepGradient[7] = {0,-0.125,1.25,-0.125,0,0,0};
    Boolean valid; Boolean plusValid; Boolean minusValid; Boolean accepted; Boolean savedAccepted;
    Integer reason; Integer iterations; Integer savedReason; Integer savedIterations; Integer slot;
    RGBDPatchTracking.Settings settings;
    Real templates[capacity,patchSize]; Real seeds[capacity,2]; Boolean enabled[capacity];
    Boolean acceptedSet[capacity]; Real pixels[capacity,2]; Integer reasons[capacity];
    Integer iterationSet[capacity]; Real costs[capacity]; Real eigenvalues[capacity]; Boolean opaque;
  algorithm
    checks := fill(false,44); raw := zeros(10,6);
    infinity := exp(1000+clock); nanValue := sin(infinity);
    checks[1] := clock >= 0 and clock <= 0.001 and infinity > 1e300 and not (nanValue <= 0 or nanValue >= 0);
    for row in 1:height loop
      for column in 1:width loop
        gray[row,column] := Texture(column-1-center[1]-shift[1],row-1-center[2]-shift[2]);
        affine[row,column] := 0.8*gray[row,column]+0.07;
        nonlinear[row,column] := 0.4+0.1*sin(0.13*(column-1)+0.07*(row-1))+0.08*cos(0.09*(column-1)-0.17*(row-1));
        aperture[row,column] := 0.3+0.001*(column-1);
        stepImage[row,column] := if column-1 < 80 then 0 else 1;
      end for;
    end for;
    point := center+{0.21,0.32};
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,point,0.001,1);
    (expected,expectedJacobian,expectedEnergy) := Analytic(point-center-shift);
    checks[2] := valid;
    checks[3] := abs(sum(descriptor)) < 1e-10 and abs(descriptor*descriptor-1) < 1e-10;
    checks[4] := Error(descriptor,expected) < 1e-11;
    checks[5] := Error(jacobian[:,1],expectedJacobian[:,1]) < 1e-10 and Error(jacobian[:,2],expectedJacobian[:,2]) < 1e-10;
    checks[6] := abs(energy-expectedEnergy) < 1e-14;
    raw[1,:] := {Error(descriptor,expected),Error(jacobian[:,1],expectedJacobian[:,1]),Error(jacobian[:,2],expectedJacobian[:,2]),energy,expectedEnergy,1};
    for axis in 1:2 loop
      point := center+{0.21,0.32}; point[axis] := point[axis]+epsilon;
      (plusValid,plus,plusJacobian,plusEnergy) := RGBDPatchTracking.Sample(gray,point,0.001,1);
      point[axis] := point[axis]-2*epsilon;
      (minusValid,minus,minusJacobian,minusEnergy) := RGBDPatchTracking.Sample(gray,point,0.001,1);
      errorValue := Error((plus-minus)/(2*epsilon),jacobian[:,axis]);
      checks[6+axis] := plusValid and minusValid and errorValue < 1e-7;
      raw[2,axis] := errorValue;
    end for;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center,0.001,1);
    (expected,expectedJacobian,expectedEnergy) := Analytic(-shift);
    checks[9] := valid and Error(descriptor,expected) < 1e-11
      and Error(jacobian[:,1],expectedJacobian[:,1]) < 1e-10 and Error(jacobian[:,2],expectedJacobian[:,2]) < 1e-10;
    // At knots, an arbitrary non-polynomial image has the raw value and
    // centered-difference raw gradient. This oracle uses no cubic kernel.
    for row in 1:7 loop
      for column in 1:7 loop
        slot := (row-1)*7+column;
        values[slot] := nonlinear[42+row,77+column];
        gradients[slot,:] := {(nonlinear[42+row,78+column]-nonlinear[42+row,76+column])/2,
          (nonlinear[43+row,77+column]-nonlinear[41+row,77+column])/2};
      end for;
    end for;
    (expected,expectedJacobian,expectedEnergy) := NormalizeOracle(values,gradients);
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(nonlinear,center,0.001,1);
    checks[10] := valid and Error(descriptor,expected) < 1e-11
      and Error(jacobian[:,1],expectedJacobian[:,1]) < 1e-10 and Error(jacobian[:,2],expectedJacobian[:,2]) < 1e-10;
    for axis in 1:2 loop
      point := center; point[axis] := point[axis]+epsilon;
      (plusValid,plus,plusJacobian,plusEnergy) := RGBDPatchTracking.Sample(nonlinear,point,0.001,1);
      point[axis] := point[axis]-2*epsilon;
      (minusValid,minus,minusJacobian,minusEnergy) := RGBDPatchTracking.Sample(nonlinear,point,0.001,1);
      continuityErrors[axis] := max(Error(plusJacobian[:,1],minusJacobian[:,1]),Error(plusJacobian[:,2],minusJacobian[:,2]));
      knotErrors[axis] := Error((plus-minus)/(2*epsilon),jacobian[:,axis]);
      checks[10+axis] := plusValid and minusValid and continuityErrors[axis] < 1e-6;
      checks[12+axis] := plusValid and minusValid and knotErrors[axis] < 1e-6;
    end for;
    raw[3,:] := {continuityErrors[1],continuityErrors[2],knotErrors[1],knotErrors[2],energy,expectedEnergy};
    (reference,expectedJacobian,expectedEnergy) := Analytic({0,0});
    settings := RGBDPatchTracking.Settings(interpolationMethod=1,convergenceTolerance=1e-7,maximumIterations=40);
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,center+{clock,0},true,settings);
    savedPixel := pixel;
    checks[15] := accepted and reason == 0;
    checks[16] := Error(pixel,center+shift) < 1e-5;
    checks[17] := cost < 1e-12 and iterations > 1 and iterations <= settings.maximumIterations and eigenvalue > 0;
    raw[4,:] := {if accepted then 1 else 0,reason,pixel[1],pixel[2],cost,eigenvalue};
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(affine,reference,center+{clock,0},true,settings);
    checks[18] := accepted and reason == 0 and Error(pixel,savedPixel) < 1e-5 and cost < 1e-12;
    raw[5,:] := {if accepted then 1 else 0,reason,pixel[1],pixel[2],cost,eigenvalue};
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center+{0.21,0.32},0.001,1);
    (plusValid,plus,plusJacobian,plusEnergy) := RGBDPatchTracking.Sample(affine,center+{0.21,0.32},0.001,1);
    checks[19] := valid and plusValid and Error(descriptor,plus) < 1e-11 and Error(jacobian[:,1],plusJacobian[:,1]) < 1e-10
      and Error(jacobian[:,2],plusJacobian[:,2]) < 1e-10 and abs(plusEnergy-0.64*energy) < 1e-14;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center);
    (plusValid,plus,plusJacobian,plusEnergy) := RGBDPatchTracking.Sample(gray,center,0.001,0);
    checks[20] := valid == plusValid and Error(descriptor,plus) == 0 and Error(jacobian[:,1],plusJacobian[:,1]) == 0
      and Error(jacobian[:,2],plusJacobian[:,2]) == 0 and energy == plusEnergy;
    (savedAccepted,savedPixel,savedReason,savedIterations,savedCost,savedEigenvalue) := RGBDPatchTracking.Track(gray,reference,center);
    settings := RGBDPatchTracking.Settings(interpolationMethod=0);
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,center,true,settings);
    checks[21] := accepted == savedAccepted and Error(pixel,savedPixel) == 0 and reason == savedReason
      and iterations == savedIterations and cost == savedCost and eigenvalue == savedEigenvalue;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center,0.001,2); checks[22] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center,0.001,-1); checks[23] := not valid;
    settings.interpolationMethod := 2;
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,center,true,settings);
    checks[24] := not accepted and reason == 1;
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(fill(nanValue,height,width),fill(nanValue,patchSize),{nanValue,nanValue},false,settings);
    checks[25] := not accepted and reason == 0 and iterations == 0 and cost == 0 and eigenvalue == 0 and pixel[1] == 0 and pixel[2] == 0;
    poison := gray; poison[42,77] := nanValue;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(poison,center,0.001,1); checks[26] := not valid;
    poison[42,77] := -0.01;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(poison,center,0.001,1); checks[27] := not valid;
    poison[42,77] := 1.01;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(poison,center,0.001,1); checks[28] := not valid;
    poison[42,77] := infinity;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(poison,center,0.001,1); checks[29] := not valid;
    poison[42,77] := -infinity;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(poison,center,0.001,1); checks[30] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,{nanValue,45},0.001,1); checks[31] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,{3.99,45},0.001,1); checks[32] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,{width-5,45},0.001,1); checks[33] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,{80,height-5},0.001,1); checks[34] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray[1:10,1:10],{4,4},0.001,1); checks[35] := valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray[1:9,1:10],{4,4},0.001,1); checks[36] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(fill(0.5,height,width),center,0.001,1); checks[37] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center,nanValue,1); checks[38] := not valid;
    settings := RGBDPatchTracking.Settings(interpolationMethod=1,convergenceTolerance=1e-7,maximumIterations=40);
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(aperture,center,0.001,1);
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(aperture,descriptor,center,true,settings);
    checks[39] := valid and not accepted and reason == 4;
    templates := fill(nanValue,capacity,patchSize); seeds := fill(nanValue,capacity,2); enabled := fill(false,capacity);
    templates[capacity,:] := reference; seeds[capacity,:] := center+{clock,0}; enabled[capacity] := true;
    (acceptedSet,pixels,reasons,iterationSet,costs,eigenvalues) := RGBDPatchTracking.TrackSet(gray,templates,seeds,enabled,settings);
    checks[40] := acceptedSet[capacity] and reasons[capacity] == 0 and Error(pixels[capacity,:],center+shift) < 1e-5 and costs[capacity] < 1e-12;
    opaque := true;
    for index in 1:capacity-1 loop
      opaque := opaque and not acceptedSet[index] and reasons[index] == 0 and iterationSet[index] == 0 and costs[index] == 0
        and eigenvalues[index] == 0 and pixels[index,1] == 0 and pixels[index,2] == 0;
    end for;
    checks[41] := opaque;
    for row in 1:7 loop
      for column in 1:7 loop
        slot := (row-1)*7+column; values[slot] := stepValues[column]; gradients[slot,:] := {stepGradient[column],0};
      end for;
    end for;
    (expected,expectedJacobian,expectedEnergy) := NormalizeOracle(values,gradients);
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(stepImage,{80.5,45.5},0.001,1);
    checks[42] := valid and Error(descriptor,expected) < 1e-11;
    checks[43] := abs(energy-expectedEnergy) < 1e-12 and Error(jacobian[:,1],expectedJacobian[:,1]) < 1e-10 and Error(jacobian[:,2],expectedJacobian[:,2]) < 1e-10;
    values := reference; values[49] := nanValue;
    (accepted,pixel,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,values,center,true,settings);
    checks[44] := not accepted and reason == 2;
    raw[6,:] := {energy,expectedEnergy,Error(descriptor,expected),Error(jacobian[:,1],expectedJacobian[:,1]),stepValues[2],stepValues[4]};
    raw[7,:] := {pixels[capacity,1],pixels[capacity,2],costs[capacity],eigenvalues[capacity],iterationSet[capacity],capacity};
    raw[8,:] := {shift[1],shift[2],clock,height,width,patchSize};
    raw[9,:] := {if checks[20] then 1 else 0,if checks[21] then 1 else 0,4,width-5,4,height-5};
    raw[10,:] := {44,1,0,1,10,10};
  end Run;
end RGBDPatchCubicReference;

model RGBDPatchCubicAcceptance
  output Boolean checks[44]; output Real raw[10,6];
algorithm
  (checks,raw) := RGBDPatchCubicReference.Run(time);
end RGBDPatchCubicAcceptance;
