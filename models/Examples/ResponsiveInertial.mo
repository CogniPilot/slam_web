within Examples;
// Generated from CogniPilot/modelica_models d2ebf66d3a65164dfdd20e890a7c196330d1b8dd; edit the canonical packages there.
model ResponsiveInertial "Short IMU filters: faster response, less noise rejection"

  extends InertialOnly(
    accelTimeConstant=0.005,
    gyroTimeConstant=0.005);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end ResponsiveInertial;
