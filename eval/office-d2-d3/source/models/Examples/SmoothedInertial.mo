within Examples;
// Generated from CogniPilot/modelica_models 5c4baf0f73c284318ef5c025fb0072badbaedfeb; edit the canonical packages there.
model SmoothedInertial "Long IMU filters: more noise rejection, more delay"

  extends InertialOnly(
    accelTimeConstant=0.12,
    gyroTimeConstant=0.08);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end SmoothedInertial;
