within Examples;
// Generated from CogniPilot/modelica_models 5c4baf0f73c284318ef5c025fb0072badbaedfeb; edit the canonical packages there.
model ResponsiveInertial "Short IMU filters: faster response, less noise rejection"

  extends InertialOnly(
    accelTimeConstant=0.005,
    gyroTimeConstant=0.005);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end ResponsiveInertial;
