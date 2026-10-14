within Examples;
// Generated from CogniPilot/modelica_models 782a268bd05735e541e61efdf22c5ddf7dab55ff; edit the canonical packages there.
model SmoothedInertial "Long IMU filters: more noise rejection, more delay"

  extends InertialOnly(
    accelTimeConstant=0.12,
    gyroTimeConstant=0.08);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end SmoothedInertial;
