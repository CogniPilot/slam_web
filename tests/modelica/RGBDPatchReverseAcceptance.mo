// Known analytic translations and explicit wrong correspondences; no flight oracle.
package RGBDPatchReverseReference
  constant Integer height = 90; constant Integer width = 160;
  constant Real center[2] = {80,45}; constant Real shift[2] = {0.35,-0.25};

  function Texture
    input Real x; input Real y; output Real value;
  algorithm
    value := 0.2+0.00002*x*x+0.00004*y*y+0.00002*x*y+0.0008*x-0.0006*y;
  end Texture;

  function Run
    input Real clock;
    output Boolean checks[20]; output Real raw[5,6];
  protected
    Real reference[height,width]; Real current[height,width]; Real affine[height,width];
    Real poison[height,width]; Real aperture[height,width];
    Real descriptor[RGBDPatchTracking.patchSize]; Real jacobian[RGBDPatchTracking.patchSize,2]; Real energy;
    Real pixel[2]; Real returned[2]; Real cycle; Real ssd; Real eigenvalue;
    Real infinity; Real nanValue;
    Boolean valid; Boolean forwardAccepted; Boolean accepted; Boolean reverseAccepted;
    Integer reason; Integer reverseReason; Integer iterations; Integer forwardReason;
    RGBDPatchTracking.Settings settings; RGBDPatchTracking.Diagnostics diagnostics;
  algorithm
    checks := fill(false,20); raw := zeros(5,6);
    infinity := exp(1000+clock); nanValue := sin(infinity);
    checks[1] := clock >= 0 and clock <= 0.001 and infinity > 1e300 and not (nanValue <= 0 or nanValue >= 0);
    for row in 1:height loop
      for column in 1:width loop
        reference[row,column] := Texture(column-1-center[1],row-1-center[2]);
        current[row,column] := Texture(column-1-center[1]-shift[1],row-1-center[2]-shift[2]);
        affine[row,column] := 0.8*current[row,column]+0.07;
        aperture[row,column] := 0.3+0.001*(column-1);
      end for;
    end for;
    poison := fill(nanValue,height,width);
    // The analytic coordinate assertion is tighter than the production .001
    // pixel stopping tolerance, so this accuracy control requests a tighter solve.
    settings := RGBDPatchTracking.Settings(interpolationMethod=1,convergenceTolerance=1e-7,maximumIterations=40);
    (valid,descriptor,jacobian,energy) := RGBDPatchTracking.Sample(reference,center,0.001,1);
    (forwardAccepted,pixel,forwardReason,iterations,ssd,eigenvalue) := RGBDPatchTracking.Track(current,descriptor,center,true,settings);
    checks[2] := valid and forwardAccepted and sqrt((pixel-center-shift)*(pixel-center-shift)) < 1e-6;
    raw[5,:] := {if forwardAccepted then 1 else 0,forwardReason,pixel[1],pixel[2],
      sqrt((pixel-center-shift)*(pixel-center-shift)),ssd};
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current,center,pixel,forwardAccepted,settings);
    checks[3] := accepted and reason == 0 and reverseAccepted and reverseReason == 0;
    checks[4] := cycle < 1e-6 and sqrt((returned-center)*(returned-center)) < 1e-6;
    raw[1,:] := {if accepted then 1 else 0,reason,returned[1],returned[2],cycle,ssd};
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,affine,center,center+shift,true,settings);
    checks[5] := accepted and reverseAccepted and cycle < 1e-6;
    raw[2,:] := {if accepted then 1 else 0,reason,returned[1],returned[2],cycle,ssd};
    // An intentionally wrong correspondence can have an excellent reverse
    // photometric fit, but must fail the independent pixel-cycle limit.
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current,center,center+shift+{0.35,0},true,settings);
    checks[6] := not accepted and reason == 4 and reverseAccepted and reverseReason == 0;
    checks[7] := abs(cycle-0.35) < 1e-6 and sqrt((returned-center-{0.35,0})*(returned-center-{0.35,0})) < 1e-6;
    raw[3,:] := {if accepted then 1 else 0,reason,returned[1],returned[2],cycle,ssd};
    settings.minimumContrast := infinity;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(poison,poison,{nanValue,infinity},{nanValue,infinity},false,settings,nanValue);
    checks[8] := not accepted and reason == 0 and not reverseAccepted and reverseReason == 0 and iterations == 0
      and sum(abs(returned)) == 0 and cycle == 0 and ssd == 0 and eigenvalue == 0 and not diagnostics.evaluated;
    settings := RGBDPatchTracking.Settings(interpolationMethod=1);
    for index in 1:3 loop
      (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
        := RGBDPatchTracking.CheckReverse(reference,poison,center,center,true,settings,
          if index == 1 then 0 else if index == 2 then nanValue else infinity);
      checks[8+index] := not accepted and reason == 1 and not reverseAccepted and iterations == 0 and not diagnostics.evaluated;
    end for;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current,{nanValue,45},center,true,settings);
    checks[12] := not accepted and reason == 1 and not reverseAccepted;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current[1:height-1,:],center,center,true,settings);
    checks[13] := not accepted and reason == 1 and not reverseAccepted;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current,center,{3.9,45},true,settings);
    checks[14] := not accepted and reason == 2 and not reverseAccepted;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,poison,center,center,true,settings);
    checks[15] := not accepted and reason == 2 and not reverseAccepted;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(poison,current,center,center+shift,true,settings);
    checks[16] := not accepted and reason == 3 and not reverseAccepted and reverseReason == 3;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(aperture,current,center,center+shift,true,settings);
    checks[17] := not accepted and reason == 3 and not reverseAccepted and reverseReason == 4;
    settings.interpolationMethod := 3;
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current,center,center,true,settings);
    checks[18] := not accepted and reason == 2 and not reverseAccepted;
    settings := RGBDPatchTracking.Settings(interpolationMethod=1,maximumIterations=0);
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,current,center,center,true,settings);
    checks[19] := not accepted and reason == 3 and not reverseAccepted and reverseReason == 1;
    settings := RGBDPatchTracking.Settings();
    (accepted,reason,returned,cycle,reverseAccepted,reverseReason,iterations,ssd,eigenvalue,diagnostics)
      := RGBDPatchTracking.CheckReverse(reference,reference,center,center,true,settings);
    checks[20] := accepted and reverseAccepted and cycle == 0 and ssd == 0;
    raw[4,:] := {if accepted then 1 else 0,reason,returned[1],returned[2],cycle,ssd};
  end Run;
end RGBDPatchReverseReference;

model RGBDPatchReverseAcceptance
  output Boolean checks[20]; output Real raw[5,6];
equation
  (checks,raw) = RGBDPatchReverseReference.Run(time);
end RGBDPatchReverseAcceptance;
