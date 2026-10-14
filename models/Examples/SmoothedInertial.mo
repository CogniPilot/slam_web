within Examples;
// Generated from CogniPilot/modelica_models d2ebf66d3a65164dfdd20e890a7c196330d1b8dd; edit the canonical packages there.
model SmoothedInertial "Long IMU filters: more noise rejection, more delay"

  extends InertialOnly(
    accelTimeConstant=0.12,
    gyroTimeConstant=0.08);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end SmoothedInertial;
