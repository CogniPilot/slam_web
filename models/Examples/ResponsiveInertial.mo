within Examples;
// Generated from CogniPilot/modelica_models 748bd0cafe8a201acb9e132b49bac7243a5e5aba; edit the canonical packages there.
model ResponsiveInertial "Short IMU filters: faster response, less noise rejection"

  extends InertialOnly(
    accelTimeConstant=0.005,
    gyroTimeConstant=0.005);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end ResponsiveInertial;
