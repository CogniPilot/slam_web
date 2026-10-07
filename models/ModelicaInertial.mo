// Stateful nominal inertial navigation, not an error-state Kalman filter.
// Inputs are body FLU specific force (m/s2, including gravity) and gyro (rad/s).
// Quaternion [w,x,y,z] rotates body FLU to world ENU; identity faces east.
// Editable low-pass filters, quaternion kinematics, gravity compensation,
// velocity and position integration use Rumoca's browser WASM simulation session.
// Rumoca owns Solve IR execution and integration; each IMU sample is held over
// its timestamped interval. This demonstration has no RGB-D, magnetic or GNSS
// corrections and is not a visual SLAM estimator.
model ModelicaInertial
  parameter Real gravity = 9.81;
  parameter Real accel_tau = 0.03;
  parameter Real gyro_tau = 0.02;
  parameter Real accel_bias[3] = {0.0,0.0,0.0};
  parameter Real gyro_bias[3] = {0.0,0.0,0.0};
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = {0.0,0.0,0.0};
  output Real position[3];
  output Real velocity[3];
  output Real quaternion[4];
  output Real filteredAccel[3];
  output Real filteredGyro[3];
protected
  Real p[3](start={0.0,0.0,0.0},each fixed=true);
  Real v[3](start={0.0,0.0,0.0},each fixed=true);
  Real q[4](start={1.0,0.0,0.0,0.0},each fixed=true);
  Real a[3](start={0.0,0.0,9.81},each fixed=true);
  Real g[3](start={0.0,0.0,0.0},each fixed=true);
  Real normQ;
  Real worldAccel[3];
equation
  der(a[1]) = (accel[1]-accel_bias[1]-a[1])/accel_tau;
  der(g[1]) = (gyro[1]-gyro_bias[1]-g[1])/gyro_tau;
  der(p[1]) = v[1];
  der(v[1]) = worldAccel[1];
  position[1] = p[1];
  velocity[1] = v[1];
  filteredAccel[1] = a[1];
  filteredGyro[1] = g[1];
  der(a[2]) = (accel[2]-accel_bias[2]-a[2])/accel_tau;
  der(g[2]) = (gyro[2]-gyro_bias[2]-g[2])/gyro_tau;
  der(p[2]) = v[2];
  der(v[2]) = worldAccel[2];
  position[2] = p[2];
  velocity[2] = v[2];
  filteredAccel[2] = a[2];
  filteredGyro[2] = g[2];
  der(a[3]) = (accel[3]-accel_bias[3]-a[3])/accel_tau;
  der(g[3]) = (gyro[3]-gyro_bias[3]-g[3])/gyro_tau;
  der(p[3]) = v[3];
  der(v[3]) = worldAccel[3];
  position[3] = p[3];
  velocity[3] = v[3];
  filteredAccel[3] = a[3];
  filteredGyro[3] = g[3];
  der(q[1]) = -(q[2]*g[1]+q[3]*g[2]+q[4]*g[3])/2;
  der(q[2]) = (q[1]*g[1]+q[3]*g[3]-q[4]*g[2])/2;
  der(q[3]) = (q[1]*g[2]-q[2]*g[3]+q[4]*g[1])/2;
  der(q[4]) = (q[1]*g[3]+q[2]*g[2]-q[3]*g[1])/2;
  normQ = sqrt(q[1]^2+q[2]^2+q[3]^2+q[4]^2);
  quaternion[1] = q[1]/normQ;
  quaternion[2] = q[2]/normQ;
  quaternion[3] = q[3]/normQ;
  quaternion[4] = q[4]/normQ;
  worldAccel[1] = (1-2*(quaternion[3]^2+quaternion[4]^2))*a[1]
    +2*(quaternion[2]*quaternion[3]-quaternion[1]*quaternion[4])*a[2]
    +2*(quaternion[2]*quaternion[4]+quaternion[1]*quaternion[3])*a[3];
  worldAccel[2] = 2*(quaternion[2]*quaternion[3]+quaternion[1]*quaternion[4])*a[1]
    +(1-2*(quaternion[2]^2+quaternion[4]^2))*a[2]
    +2*(quaternion[3]*quaternion[4]-quaternion[1]*quaternion[2])*a[3];
  worldAccel[3] = 2*(quaternion[2]*quaternion[4]-quaternion[1]*quaternion[3])*a[1]
    +2*(quaternion[3]*quaternion[4]+quaternion[1]*quaternion[2])*a[2]
    +(1-2*(quaternion[2]^2+quaternion[3]^2))*a[3]-gravity;
end ModelicaInertial;
