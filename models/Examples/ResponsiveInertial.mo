within Examples;
// Generated from CogniPilot/modelica_models 782a268bd05735e541e61efdf22c5ddf7dab55ff; edit the canonical packages there.
model ResponsiveInertial "Short IMU filters: faster response, less noise rejection"

  extends InertialOnly(
    accelTimeConstant=0.005,
    gyroTimeConstant=0.005);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end ResponsiveInertial;
