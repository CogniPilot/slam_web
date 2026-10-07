package ES15HeldIntervalTests
  function Inputs
    input Integer scenario;
    output Real position[3]; output Real velocity[3]; output Real rotation[3,3];
    output Real accelBias[3]; output Real gyroBias[3];
    output Real covariance[15,15]; output Real crossCovariance[15,6];
    output Real referenceCovariance[6,6]; output Real referencePosition[3];
    output Real referenceRotation[3,3]; output Real referenceAvailable;
    output Real accel[3]; output Real gyro[3]; output Real gravity[3];
    output Real h; output Real density[12];
  protected
    Integer selected;
  algorithm
    position := {1.0,-2.0,3.0}; velocity := {0.2,-0.3,0.4}; rotation := identity(3);
    accelBias := zeros(3); gyroBias := zeros(3); covariance := identity(15)*0.1;
    crossCovariance := zeros(15,6); referenceCovariance := zeros(6,6);
    referencePosition := position; referenceRotation := rotation; referenceAvailable := 1.0;
    // Exact singular pose clone: all21 joint dimensions and15x6 entries matter.
    for column in 1:6 loop
      selected := if column <= 3 then column else column+3;
      crossCovariance[selected,column] := 0.1;
      referenceCovariance[column,column] := 0.1;
    end for;
    accel := zeros(3); gyro := zeros(3); gravity := {1.0,-2.0,3.0};
    h := 1.0/90.0;
    density := {0.06,0.07,0.08,0.006,0.007,0.008,0.002,0.003,0.004,0.0002,0.0003,0.0004};
    if scenario == 2 then accel := {0.3,-0.4,9.81}; gyro := {0.1,-0.2,0.3};
    elseif scenario == 3 then h := 0.02;
    elseif scenario == 4 then h := 1.0/30.0;
    elseif scenario == 5 then h := 1.0/15.0;
    elseif scenario == 6 then h := 0.2;
    elseif scenario == 7 then h := 0.02; gyro := {0.0,0.0,12.0}; gravity := zeros(3);
    elseif scenario == 8 then h := 1.0/30.0; gyro := {0.0,0.0,30.0}; gravity := zeros(3);
    elseif scenario == 9 then h := 0.0;
    elseif scenario == 10 then h := -0.01;
    elseif scenario == 11 then h := 0.200000001;
    elseif scenario == 12 then covariance[15,15] := -1.0;
    elseif scenario == 13 then crossCovariance[15,6] := 2.0;
    elseif scenario == 14 then
      referenceAvailable := 0.0; crossCovariance := fill(1e20,15,6);
      referenceCovariance := fill(-1e20,6,6); referenceRotation := zeros(3,3);
      referencePosition := fill(1e20,3); h := 1.0/30.0;
    elseif scenario == 15 then rotation[3,3] := -1.0;
    elseif scenario == 16 then accelBias[2] := 2.001;
    elseif scenario == 17 then density[12] := -0.01;
    elseif scenario == 18 then
      h := 1.0/30.0; position := {999999.9,0.0,0.0}; velocity := {5.0,0.0,0.0}; gravity := zeros(3);
    elseif scenario == 19 then h := 0.2; gyro := {0.0,0.0,1000.0}; gravity := zeros(3);
    elseif scenario == 20 then h := 0.2; gyro := {0.0,0.0,32.0}; gravity := zeros(3);
    elseif scenario == 21 then referenceRotation[1,1] := 0.0;
    elseif scenario == 22 then referenceAvailable := 0.5;
    elseif scenario == 23 then h := 1.0/180.0;
    elseif scenario == 24 then h := 1.0/60.0;
    end if;
  end Inputs;

  function Check
    input Integer scenario; input Real accepted;
    input Real transition[15,15]; input Real noise[15,15];
    input Real nextPosition[3]; input Real nextVelocity[3]; input Real nextRotation[3,3];
    input Real nextCovariance[15,15]; input Real nextCross[15,6]; input Integer substeps;
    output Boolean checks[12];
  protected
    Real position[3]; Real velocity[3]; Real rotation[3,3]; Real accelBias[3]; Real gyroBias[3];
    Real covariance[15,15]; Real crossCovariance[15,6]; Real referenceCovariance[6,6];
    Real referencePosition[3]; Real referenceRotation[3,3]; Real referenceAvailable;
    Real accel[3]; Real gyro[3]; Real gravity[3]; Real h; Real density[12];
    Real expectedPhi[15,15]; Real expectedNoise[15,15]; Real expectedCovariance[15,15];
    Real expectedPosition[3]; Real expectedVelocity[3]; Real expectedRotation[3,3];
    Real a; Real b; Real c; Real d; Boolean accepts; Boolean analytic;
    Integer expectedSteps;
  algorithm
    (position,velocity,rotation,accelBias,gyroBias,covariance,crossCovariance,
      referenceCovariance,referencePosition,referenceRotation,referenceAvailable,
      accel,gyro,gravity,h,density) := Inputs(scenario);
    checks := fill(true,12);
    accepts := scenario <= 8 or scenario == 14 or scenario == 20 or scenario >= 23;
    analytic := accepts and scenario <> 2 and scenario <> 7 and scenario <> 8 and scenario <> 20;
    expectedSteps := if scenario == 4 or scenario == 14 then 2 else if scenario == 5 then 4
      else if scenario == 6 or scenario == 8 then 10 else if scenario == 7 then 3
      else if scenario == 20 then 64 else 1;
    checks[1] := accepted == (if accepts then 1.0 else 0.0);
    checks[2] := not accepts or substeps == expectedSteps;
    checks[3] := if accepts then h/substeps <= 0.02
      and sqrt(sum(gyro.^2))*h/substeps <= 0.100000000000001 else true;
    checks[4] := accepts or (max(abs(nextPosition-position)) == 0.0
      and max(abs(nextVelocity-velocity)) == 0.0 and max(abs(nextRotation-rotation)) == 0.0
      and max(abs(nextCovariance-covariance)) == 0.0 and max(abs(nextCross-crossCovariance)) == 0.0);
    checks[5] := not accepts or (SLAMCovariancePSDCheck(nextCovariance,1e-12) > 0.5
      and (referenceAvailable == 0.0 or SLAMCovariancePSDCheck(cat(1,cat(2,nextCovariance,nextCross),
        cat(2,transpose(nextCross),referenceCovariance)),1e-12) > 0.5));
    checks[6] := not accepts or RGBDProperRotationValue(nextRotation) > 0.5;
    expectedPhi := identity(15); expectedNoise := zeros(15,15);
    if analytic then
      // Closed-form constant-force-zero dynamics and integrated white-noise
      // moments; independent of the production cubic/quadrature implementation.
      for axis in 1:3 loop
        a := density[axis]^2; b := density[axis+6]^2;
        c := density[axis+3]^2; d := density[axis+9]^2;
        expectedPhi[axis,axis+3] := h;
        expectedPhi[axis,axis+9] := -h^2/2;
        expectedPhi[axis+3,axis+9] := -h;
        expectedPhi[axis+6,axis+12] := -h;
        expectedNoise[axis,axis] := a*h^3/3+b*h^5/20;
        expectedNoise[axis,axis+3] := a*h^2/2+b*h^4/8;
        expectedNoise[axis+3,axis] := expectedNoise[axis,axis+3];
        expectedNoise[axis,axis+9] := -b*h^3/6;
        expectedNoise[axis+9,axis] := expectedNoise[axis,axis+9];
        expectedNoise[axis+3,axis+3] := a*h+b*h^3/3;
        expectedNoise[axis+3,axis+9] := -b*h^2/2;
        expectedNoise[axis+9,axis+3] := expectedNoise[axis+3,axis+9];
        expectedNoise[axis+9,axis+9] := b*h;
        expectedNoise[axis+6,axis+6] := c*h+d*h^3/3;
        expectedNoise[axis+6,axis+12] := -d*h^2/2;
        expectedNoise[axis+12,axis+6] := expectedNoise[axis+6,axis+12];
        expectedNoise[axis+12,axis+12] := d*h;
      end for;
      expectedPosition := position+velocity*h+0.5*gravity*h^2;
      expectedVelocity := velocity+gravity*h;
      expectedCovariance := expectedPhi*covariance*transpose(expectedPhi)+expectedNoise;
      checks[7] := max(abs(transition-expectedPhi)) < 2e-13 and max(abs(noise-expectedNoise)) < 2e-13;
      checks[8] := max(abs(nextPosition-expectedPosition)) < 2e-13
        and max(abs(nextVelocity-expectedVelocity)) < 2e-13 and max(abs(nextRotation-rotation)) < 2e-13;
      checks[9] := max(abs(nextCovariance-expectedCovariance)) < 2e-13;
      checks[10] := if referenceAvailable == 1.0 then max(abs(nextCross-expectedPhi*crossCovariance)) < 2e-13
        else max(abs(nextCross-crossCovariance)) == 0.0;
    end if;
    if scenario == 7 or scenario == 8 or scenario == 20 then
      expectedRotation := [cos(gyro[3]*h),-sin(gyro[3]*h),0.0;sin(gyro[3]*h),cos(gyro[3]*h),0.0;0.0,0.0,1.0];
      checks[11] := max(abs(nextRotation-expectedRotation)) < 2e-13
        and max(abs(nextPosition-position-velocity*h)) < 2e-13
        and max(abs(nextVelocity-velocity)) < 2e-13;
    end if;
    // Scenario18 completes its first substep before a position limit refuses
    // the second: every output state must roll back, including both P blocks.
    checks[12] := scenario <> 18 or (substeps == 2 and accepted == 0.0 and checks[4]);
  end Check;
end ES15HeldIntervalTests;

model ES15HeldIntervalAcceptance
  Integer scenario;
  Real position[3]; Real velocity[3]; Real rotation[3,3]; Real accelBias[3]; Real gyroBias[3];
  Real covariance[15,15]; Real crossCovariance[15,6]; Real referenceCovariance[6,6];
  Real referencePosition[3]; Real referenceRotation[3,3]; Real referenceAvailable;
  Real accel[3]; Real gyro[3]; Real gravity[3]; Real h; Real density[12];
  output Boolean checks[16];
  ES15SchmidtPrediction actual(position=position,velocity=velocity,rotation=rotation,
    accelBias=accelBias,gyroBias=gyroBias,covariance=covariance,crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,referencePosition=referencePosition,
    referenceRotation=referenceRotation,referenceAvailable=referenceAvailable,
    accel=accel,gyro=gyro,gravity=gravity,h=h,density=density);
  ES15SchmidtPredictionReference reference(position=position,velocity=velocity,rotation=rotation,
    accelBias=accelBias,gyroBias=gyroBias,covariance=covariance,crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,referencePosition=referencePosition,
    referenceRotation=referenceRotation,referenceAvailable=referenceAvailable,
    accel=accel,gyro=gyro,gravity=gravity,h=h,density=density);
equation
  scenario = min(24,integer(floor(time))+1);
  (position,velocity,rotation,accelBias,gyroBias,covariance,crossCovariance,
    referenceCovariance,referencePosition,referenceRotation,referenceAvailable,
    accel,gyro,gravity,h,density) = ES15HeldIntervalTests.Inputs(scenario);
algorithm
  checks[1:12] := ES15HeldIntervalTests.Check(scenario,actual.accepted,actual.transition,
    actual.processCovariance,actual.nextPosition,actual.nextVelocity,actual.nextRotation,
    actual.nextCovariance,actual.nextCrossCovariance,actual.substeps);
  // Actual frozen equation-model reference on every former single-step case.
  checks[13] := noEvent(if h > 0.0 and h <= 0.02 and sqrt(sum(gyro.^2))*h <= 0.1
    then abs(actual.accepted-reference.accepted) < 0.5
      and max(abs(actual.nextPosition-reference.nextPosition)) < 2e-13
      and max(abs(actual.nextVelocity-reference.nextVelocity)) < 2e-13
      and max(abs(actual.nextRotation-reference.nextRotation)) < 2e-13 else true);
  checks[14] := noEvent(if h > 0.0 and h <= 0.02 and sqrt(sum(gyro.^2))*h <= 0.1
    then max(abs(actual.nextCovariance-reference.nextCovariance)) < 2e-13
      and max(abs(actual.nextCrossCovariance-reference.nextCrossCovariance)) < 2e-13
      and max(abs(actual.transition-reference.transition)) < 2e-13
      and max(abs(actual.processCovariance-reference.processCovariance)) < 2e-13 else true);
  checks[15] := noEvent(max(abs(actual.nextAccelBias-accelBias)) <= 0.0 and max(abs(actual.nextGyroBias-gyroBias)) <= 0.0
    and max(abs(actual.nextReferenceCovariance-referenceCovariance)) <= 0.0
    and max(abs(actual.nextReferencePosition-referencePosition)) <= 0.0
    and max(abs(actual.nextReferenceRotation-referenceRotation)) <= 0.0
    and actual.nextReferenceAvailable >= referenceAvailable and actual.nextReferenceAvailable <= referenceAvailable);
  checks[16] := noEvent(ES15HeldIntervalValid(h) == (h > 0.0 and h <= 0.2));
end ES15HeldIntervalAcceptance;
