// Independent polynomial image/brightness/Jacobian controls; no SLAM state or oracle input.
package RGBDPatchTrackingReference
  constant Integer height = 90;
  constant Integer width = 160;
  constant Integer capacity = 350;
  constant Integer patchSize = RGBDPatchTracking.patchSize;

  function Texture
    input Real x; input Real y;
    output Real value;
  algorithm
    value := 0.2+0.00002*x*x+0.00004*y*y+0.00002*x*y+0.0008*x-0.0006*y;
  end Texture;

  function Reference
    output Real descriptor[patchSize];
  protected
    Real values[patchSize]; Real centered[patchSize]; Integer slot;
  algorithm
    for row in 1:7 loop
      for column in 1:7 loop
        slot := (row-1)*7+column;
        values[slot] := Texture(column-4,row-4);
      end for;
    end for;
    centered := values-fill(sum(values)/patchSize,patchSize);
    descriptor := centered/sqrt(centered*centered);
  end Reference;

  function Run
    input Real clock;
    output Boolean checks[36]; output Real raw[8,6];
  protected
    constant Real shift[2] = {0.35,-0.25}; constant Real center[2] = {80,45};
    constant Real epsilon = 1e-5;
    Real gray[height,width]; Real affine[height,width]; Real aperture[height,width];
    Real poison[height,width]; Real reference[patchSize]; Real badReference[patchSize];
    Real descriptor[patchSize]; Real jacobian[patchSize,2]; Real energy;
    Real plus[patchSize]; Real minus[patchSize]; Real ignoredJacobian[patchSize,2]; Real ignoredEnergy;
    Real point[2]; Real firstPoint[2]; Real seed[2]; Real cost; Real eigenvalue; Real errorValue;
    Real nanValue; Boolean valid; Boolean plusValid; Boolean minusValid; Boolean accepted;
    Integer reason; Integer iterations;
    RGBDPatchTracking.Settings settings;
    RGBDPatchTracking.Diagnostics diagnostics;
    Boolean originalAccepted; Integer originalReason; Integer originalIterations;
    Real originalCost; Real originalEigenvalue;
    Real templates[capacity,patchSize]; Real seeds[capacity,2]; Boolean enabled[capacity];
    Boolean acceptedSet[capacity]; Real pixels[capacity,2]; Integer reasons[capacity];
    Integer iterationSet[capacity]; Real costs[capacity]; Real eigenvalues[capacity];
    Boolean paddingOpaque;
  algorithm
    checks := fill(false,36); raw := zeros(8,6); reference := Reference();
    nanValue := sin(exp(1000+clock));
    settings := RGBDPatchTracking.Settings(convergenceTolerance=1e-7,maximumIterations=40);
    seed := center+{clock,0};
    for row in 1:height loop
      for column in 1:width loop
        gray[row,column] := Texture(column-1-center[1]-shift[1],row-1-center[2]-shift[2]);
        affine[row,column] := 0.8*gray[row,column]+0.07;
        aperture[row,column] := 0.3+0.001*(column-1);
      end for;
    end for;
    checks[1] := clock >= 0 and clock <= 0.001 and not (nanValue <= 0 or nanValue >= 0);
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center+{0.21,0.32});
    checks[2] := valid;
    checks[3] := abs(sum(descriptor)) < 1e-10 and abs(descriptor*descriptor-1) < 1e-10;
    for axis in 1:2 loop
      point := center+{0.21,0.32}; point[axis] := point[axis]+epsilon;
      (plusValid,plus,ignoredJacobian,ignoredEnergy) := RGBDPatchTracking.Sample(gray,point);
      point[axis] := point[axis]-2*epsilon;
      (minusValid,minus,ignoredJacobian,ignoredEnergy) := RGBDPatchTracking.Sample(gray,point);
      errorValue := 0;
      for sample in 1:patchSize loop
        errorValue := max(errorValue,abs((plus[sample]-minus[sample])/(2*epsilon)-jacobian[sample,axis]));
      end for;
      checks[3+axis] := plusValid and minusValid and errorValue < 1e-7;
      raw[axis,1] := errorValue;
    end for;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,seed,true,settings);
    firstPoint := point; raw[3,:] := {if accepted then 1 else 0,reason,point[1],point[2],cost,eigenvalue};
    originalAccepted := accepted; originalReason := reason; originalIterations := iterations;
    originalCost := cost; originalEigenvalue := eigenvalue;
    (accepted,point,reason,iterations,cost,eigenvalue,diagnostics)
      := RGBDPatchTracking.TrackDetailed(gray,reference,seed,true,settings);
    checks[6] := accepted and reason == 0 and accepted == originalAccepted and reason == originalReason
      and iterations == originalIterations and cost == originalCost and eigenvalue == originalEigenvalue
      and point[1] == firstPoint[1] and point[2] == firstPoint[2] and diagnostics.stopDetail == 1
      and diagnostics.evaluated and diagnostics.lastEvaluatedPixel[1] == point[1]
      and diagnostics.lastEvaluatedPixel[2] == point[2] and diagnostics.lastRawStepNorm <= settings.convergenceTolerance;
    checks[7] := abs(point[1]-center[1]-shift[1]) < 1e-5;
    checks[8] := abs(point[2]-center[2]-shift[2]) < 1e-5;
    checks[9] := cost < 1e-12 and iterations > 1 and iterations <= settings.maximumIterations;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(affine,reference,seed,true,settings);
    raw[4,:] := {if accepted then 1 else 0,reason,point[1],point[2],cost,eigenvalue};
    checks[10] := accepted and reason == 0;
    checks[11] := abs(point[1]-firstPoint[1]) < 1e-5 and abs(point[2]-firstPoint[2]) < 1e-5;
    checks[12] := cost < 1e-12;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(aperture,center);
    checks[13] := valid;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(aperture,descriptor,seed,true,settings);
    checks[14] := not accepted and reason == 4;
    poison := gray; poison[46,81] := nanValue;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(poison,reference,seed,true,settings);
    checks[15] := not accepted and reason == 3;
    badReference := reference; badReference[49] := nanValue;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,badReference,seed,true,settings);
    checks[16] := not accepted and reason == 2;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,zeros(patchSize),seed,true,settings);
    checks[17] := not accepted and reason == 2;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,{nanValue,45},true,settings);
    checks[18] := not accepted and reason == 3;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,{2.99,45},true,settings);
    checks[19] := not accepted and reason == 3;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,{width-4,45},true,settings);
    checks[20] := not accepted and reason == 3;
    settings.searchRadius := 0.1; settings.maximumStep := 0.05;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,seed,true,settings);
    raw[5,:] := {if accepted then 1 else 0,reason,point[1],point[2],cost,eigenvalue};
    checks[21] := not accepted and (reason == 5 or reason == 6);
    settings := RGBDPatchTracking.Settings(maximumIterations=0);
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,seed,true,settings);
    checks[22] := not accepted and reason == 1;
    settings := RGBDPatchTracking.Settings(maximumSsd=nanValue);
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,seed,true,settings);
    checks[23] := not accepted and reason == 1;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(poison,badReference,{nanValue,nanValue},false,settings);
    checks[24] := not accepted and reason == 0 and iterations == 0 and cost == 0 and point[1] == 0 and point[2] == 0;
    (accepted,point,reason,iterations,cost,eigenvalue,diagnostics)
      := RGBDPatchTracking.TrackDetailed(poison,badReference,{nanValue,nanValue},false,settings);
    checks[24] := checks[24] and not accepted and reason == 0 and diagnostics.stopDetail == 0
      and not diagnostics.evaluated and not diagnostics.acceptedTrial and not diagnostics.stepValid
      and diagnostics.initialSsd == 0 and diagnostics.lastRawStepNorm == 0
      and diagnostics.lastEvaluatedPixel[1] == 0 and diagnostics.lastEvaluatedPixel[2] == 0;
    settings := RGBDPatchTracking.Settings(convergenceTolerance=1e-7,maximumIterations=40);
    templates := fill(nanValue,capacity,patchSize); seeds := fill(nanValue,capacity,2); enabled := fill(false,capacity);
    templates[capacity,:] := reference; seeds[capacity,:] := seed; enabled[capacity] := true;
    (acceptedSet,pixels,reasons,iterationSet,costs,eigenvalues) := RGBDPatchTracking.TrackSet(gray,templates,seeds,enabled,settings);
    checks[25] := acceptedSet[capacity] and reasons[capacity] == 0;
    checks[26] := abs(pixels[capacity,1]-center[1]-shift[1]) < 1e-5
      and abs(pixels[capacity,2]-center[2]-shift[2]) < 1e-5;
    paddingOpaque := true;
    for slot in 1:capacity-1 loop
      paddingOpaque := paddingOpaque and not acceptedSet[slot] and reasons[slot] == 0
        and iterationSet[slot] == 0 and costs[slot] == 0 and eigenvalues[slot] == 0
        and pixels[slot,1] == 0 and pixels[slot,2] == 0;
    end for;
    checks[27] := paddingOpaque;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(fill(0.5,height,width),center);
    checks[28] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(fill(0.5,height,width),center,1e-300);
    checks[28] := checks[28] and not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,center,nanValue);
    checks[29] := not valid;
    settings.maximumIterations := 1;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,seed,true,settings);
    checks[30] := not accepted and reason == 6 and iterations == 1;
    (accepted,point,reason,iterations,cost,eigenvalue,diagnostics)
      := RGBDPatchTracking.TrackDetailed(gray,reference,seed,true,settings);
    checks[30] := checks[30] and not accepted and reason == 6 and diagnostics.stopDetail == 9
      and diagnostics.evaluated and diagnostics.acceptedTrial
      and diagnostics.lastEvaluatedPixel[1] == seed[1] and diagnostics.lastEvaluatedPixel[2] == seed[2]
      and (diagnostics.lastAcceptedTrialPixel[1] <> seed[1] or diagnostics.lastAcceptedTrialPixel[2] <> seed[2]);
    settings := RGBDPatchTracking.Settings(convergenceTolerance=1e-7,maximumIterations=40);
    // This even perturbation is orthogonal to the polynomial patch and its
    // translation derivatives: GN is stationary, but the SSD must still refuse.
    for row in 1:7 loop
      for column in 1:7 loop
        badReference[(row-1)*7+column] := reference[(row-1)*7+column]
          +0.01*(2*(column-4)^2-(row-4)^2-4);
      end for;
    end for;
    badReference := badReference/sqrt(badReference*badReference);
    settings.maximumSsd := 1e-12;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,badReference,center+shift,true,settings);
    checks[31] := not accepted and reason == 7 and cost > settings.maximumSsd;
    raw[6,:] := {if accepted then 1 else 0,reason,point[1],point[2],cost,eigenvalue};
    settings := RGBDPatchTracking.Settings(convergenceTolerance=1e-7,maximumIterations=40);
    settings.minimumEigenvalue := 0.99;
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,reference,seed,true,settings);
    checks[32] := not accepted and reason == 4;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,{80,2.99});
    checks[33] := not valid;
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(gray,{80,height-4});
    checks[34] := not valid;
    badReference := reference+fill(0.01,patchSize);
    (accepted,point,reason,iterations,cost,eigenvalue) := RGBDPatchTracking.Track(gray,badReference,seed,true,settings);
    checks[35] := not accepted and reason == 2;
    checks[36] := acceptedSet[capacity] and costs[capacity] < 1e-12 and eigenvalues[capacity] > 0;
    raw[7,:] := {pixels[capacity,1],pixels[capacity,2],costs[capacity],eigenvalues[capacity],iterationSet[capacity],capacity};
    raw[8,:] := {shift[1],shift[2],clock,height,width,patchSize};
  end Run;
end RGBDPatchTrackingReference;

model RGBDPatchTrackingAcceptance
  output Boolean checks[36]; output Real raw[8,6];
algorithm
  (checks,raw) := RGBDPatchTrackingReference.Run(time);
end RGBDPatchTrackingAcceptance;
