within Examples;
// Generated from CogniPilot/modelica_models 34c26cb4b3ad6f16a072582115acc68d35178d1f; edit the canonical packages there.
model SmoothedInertial "Long IMU filters: more noise rejection, more delay"

  extends InertialOnly(
    accelTimeConstant=0.12,
    gyroTimeConstant=0.08);

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end SmoothedInertial;
