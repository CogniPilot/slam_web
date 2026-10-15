within Examples;
// Generated from CogniPilot/modelica_models 748bd0cafe8a201acb9e132b49bac7243a5e5aba; edit the canonical packages there.
model SmoothedInertial "Long IMU filters: more noise rejection, more delay"

  extends InertialOnly(
    accelTimeConstant=0.12,
    gyroTimeConstant=0.08);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end SmoothedInertial;
