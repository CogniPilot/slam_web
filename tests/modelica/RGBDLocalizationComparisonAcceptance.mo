// Independent helper controls; no initializer/domain reduction or host oracle.
package RGBDLocalizationComparisonTests
  function Run
    input Real clock; output Boolean checks[14];
  protected
    Real a[350,49]; Real b[350,49]; Real vector[350]; Real infinity; Real nanValue;
    Real small[2,2]; Real changed[2,2];
  algorithm
    checks := fill(false,14); a := zeros(350,49); b := a; vector := zeros(350);
    small := [0.0,0.25;-0.25,0.5]; changed := small;
    checks[1] := RGBDLocalizationInitializeTests.CloseMatrix(a,b,0.125);
    b[350,49] := 0.125;
    checks[2] := not RGBDLocalizationInitializeTests.CloseMatrix(a,b,0.125);
    b[350,49] := 0.0625;
    checks[3] := RGBDLocalizationInitializeTests.CloseMatrix(a,b,0.125);
    checks[4] := not RGBDLocalizationInitializeTests.CloseMatrix(a,zeros(349,49),0.125);
    vector[350] := -0.125;
    checks[5] := not RGBDLocalizationInitializeTests.ZeroVector(vector,0.125);
    vector[350] := -0.0625;
    checks[6] := RGBDLocalizationInitializeTests.ZeroVector(vector,0.125);
    checks[7] := not RGBDLocalizationInitializeTests.CloseVector(vector,zeros(349),0.125);
    checks[8] := not RGBDLocalizationInitializeTests.CloseMatrix(a,b,0.0);
    // Independent original reduction over four cells, away from the observed
    // large symbolic expansion; binary fractions make boundary checks exact.
    changed[2,2] := changed[2,2]+0.125;
    checks[9] := RGBDLocalizationInitializeTests.CloseMatrix(small,changed,0.125)
      == (max(abs(small-changed)) < 0.125);
    checks[10] := RGBDLocalizationInitializeTests.CloseMatrix(small,changed,0.25)
      == (max(abs(small-changed)) < 0.25);
    // Runtime IEEE overflow and invalid sine; never a static invalid
    // literal or an external C substitute for the Modelica comparison helpers.
    // The reference compiler rewrites x-x to zero even when x is infinite;
    // sin(infinity) keeps this fault injection genuinely nonfinite at runtime.
    infinity := exp(1000.0+clock); nanValue := sin(infinity);
    b[350,49] := infinity;
    checks[11] := not RGBDLocalizationInitializeTests.CloseMatrix(a,b,0.125);
    b[350,49] := nanValue;
    checks[12] := not RGBDLocalizationInitializeTests.CloseMatrix(a,b,0.125);
    vector[350] := nanValue;
    checks[13] := not RGBDLocalizationInitializeTests.ZeroVector(vector,0.125);
    checks[14] := not RGBDLocalizationInitializeTests.ZeroMatrix(b,0.125);
  end Run;
end RGBDLocalizationComparisonTests;

model RGBDLocalizationComparisonAcceptance
  output Boolean checks[14];
equation
  checks = RGBDLocalizationComparisonTests.Run(time);
end RGBDLocalizationComparisonAcceptance;
