// Repository-owned example; not generated from CogniPilot/modelica_models.
// Continuous-time extended Kalman filter for phone or airframe IMU samples.
// Body inputs are any right-handed frame (a phone's x right, y up, z out of
// the screen works directly); world outputs are ENU with z up.
// Error order: world dv, right-local dtheta with R_true = R*Exp(dtheta), body
// gyro bias. Accelerometer bias is not estimated: without position aiding it
// is indistinguishable from tilt.
// Corrections run continuously: the accelerometer as a gravity reference,
// down-weighted while the device accelerates, and zero velocity, weighted by
// how still the device is. Heading is gyro-only, so it drifts slowly.
model PhoneMotionEKF "Attitude and velocity EKF tuned for phone motion sensors"
  pure function Rates "Covariance rate and error-state correction rate"
    input Real P[9,9];
    input Real R[3,3];
    input Real force[3];
    input Real omega[3];
    input Real velocity[3];
    input Real gravity;
    input Real gravityInformation "Gravity weight over noise density squared";
    input Real velocityInformation "Stationarity over noise density squared";
    input Real noise[9] "Process noise density squared, error order";
    output Real dP[9,9];
    output Real dx[9];
  protected
    Real F[9,9];
    Real H[3,9];
    Real information[9,9];
    Real gb[3];
    Real residual[9];
    Real raw[9,9];
  algorithm
    // Predicted gravity reaction in body coordinates: R^T * {0,0,g}.
    gb := gravity*{R[3,1],R[3,2],R[3,3]};
    F := fill(0.0,9,9);
    // dv' = -R*skew(force)*dtheta
    F[1:3,4:6] := -R*[0.0,-force[3],force[2]; force[3],0.0,-force[1]; -force[2],force[1],0.0];
    // dtheta' = -skew(omega)*dtheta - dbg
    F[4:6,4:6] := -[0.0,-omega[3],omega[2]; omega[3],0.0,-omega[1]; -omega[2],omega[1],0.0];
    F[4:6,7:9] := -identity(3);
    // Gravity measurement Jacobian: h = Exp(-dtheta)*gb, so dh/dtheta = skew(gb).
    H := fill(0.0,3,9);
    H[1:3,4:6] := [0.0,-gb[3],gb[2]; gb[3],0.0,-gb[1]; -gb[2],gb[1],0.0];
    information := gravityInformation*transpose(H)*H;
    for i in 1:3 loop
      information[i,i] := information[i,i]+velocityInformation;
    end for;
    residual := gravityInformation*transpose(H)*(force-gb);
    residual[1:3] := residual[1:3]-velocityInformation*velocity;
    raw := F*P+P*transpose(F)-P*information*P;
    for i in 1:9 loop
      raw[i,i] := raw[i,i]+noise[i];
    end for;
    dP := 0.5*(raw+transpose(raw));
    dx := P*residual;
  end Rates;

  parameter Real gravity(unit="m/s2") = 9.81;
  parameter Real accelTimeConstant(unit="s", min=1e-6) = 0.01
    "Accelerometer prefilter; short, because the EKF does the smoothing";
  parameter Real gyroNoise = 0.01
    "Gyro white noise density, rad/s/sqrt(Hz); covers phone sample jitter";
  parameter Real gyroBiasWalk = 2e-4
    "Gyro bias random walk, rad/s2/sqrt(Hz)";
  parameter Real accelNoise = 0.15
    "Accelerometer white noise density in velocity propagation, m/s2/sqrt(Hz)";
  parameter Real gravityNoise = 0.3
    "Gravity-reference noise density, m/s2/sqrt(Hz)";
  parameter Real accelGate(unit="m/s2", min=1e-6) = 0.6
    "Specific-force error from g that halves the gravity correction";
  parameter Real zeroVelocityNoise = 0.25
    "Zero-velocity pseudo-measurement noise density, m/s/sqrt(Hz)";
  parameter Real stationaryAccel(unit="m/s2", min=1e-6) = 0.25
    "Specific-force error from g tolerated while still";
  parameter Real stationaryRate(unit="rad/s", min=1e-6) = 0.08
    "Angular rate tolerated while still";
  parameter Real initialRoll(unit="rad") = 0.0
    "Initial roll; a host may set it from the first accelerometer sample";
  parameter Real initialPitch(unit="rad") = 0.0
    "Initial pitch; a host may set it from the first accelerometer sample";
  parameter Real initialVelocityStd(unit="m/s") = 0.1;
  parameter Real initialAttitudeStd(unit="rad") = 0.1;
  parameter Real initialBiasStd(unit="rad/s") = 0.02;

  input Real accel[3](each unit="m/s2", start={0, 0, 9.81})
    "Specific force in body coordinates";
  input Real gyro[3](each unit="rad/s", each start=0)
    "Angular velocity in body coordinates";

  output Real position[3](each unit="m") "Position in world ENU coordinates";
  output Real velocity[3](each unit="m/s") "Velocity in world ENU coordinates";
  output Real quaternion[4] "Unit quaternion {w,x,y,z}, body to world";
  output Real filteredAccel[3](each unit="m/s2") "Prefiltered specific force";
  output Real filteredGyro[3](each unit="rad/s") "Bias-corrected angular velocity";
  output Real gyroBias[3](each unit="rad/s") "Estimated gyro bias";
  output Real attitudeStd[3](each unit="rad") "Attitude error standard deviations";
  output Real stationarity "1 when still, 0 when moving";
  output Real gravityWeight "1 when the accelerometer reads only gravity";
protected
  Real p[3](each start=0.0, each fixed=true);
  Real v[3](each start=0.0, each fixed=true);
  Real q[4](start={cos(initialPitch/2)*cos(initialRoll/2), cos(initialPitch/2)*sin(initialRoll/2),
    sin(initialPitch/2)*cos(initialRoll/2), -sin(initialPitch/2)*sin(initialRoll/2)}, each fixed=true);
  Real bg[3](each start=0.0, each fixed=true);
  Real f[3](start=gravity*{-sin(initialPitch), cos(initialPitch)*sin(initialRoll),
    cos(initialPitch)*cos(initialRoll)}, each fixed=true);
  Real P[9,9](start=diagonal(cat(1, fill(initialVelocityStd^2,3), fill(initialAttitudeStd^2,3),
    fill(initialBiasStd^2,3))), each fixed=true);
  Real qn[4];
  Real R[3,3];
  Real omega[3];
  Real forceError;
  Real dP[9,9];
  Real dx[9];
equation
  der(f) = (accel-f)/accelTimeConstant;
  omega = gyro-bg;
  qn = q/sqrt(q*q);
  R = [1-2*(qn[3]^2+qn[4]^2), 2*(qn[2]*qn[3]-qn[1]*qn[4]), 2*(qn[2]*qn[4]+qn[1]*qn[3]);
       2*(qn[2]*qn[3]+qn[1]*qn[4]), 1-2*(qn[2]^2+qn[4]^2), 2*(qn[3]*qn[4]-qn[1]*qn[2]);
       2*(qn[2]*qn[4]-qn[1]*qn[3]), 2*(qn[3]*qn[4]+qn[1]*qn[2]), 1-2*(qn[2]^2+qn[3]^2)];
  forceError = sqrt(f*f)-gravity;
  gravityWeight = 1/(1+(forceError/accelGate)^2);
  stationarity = exp(-(forceError/stationaryAccel)^2-(omega*omega)/stationaryRate^2);
  (dP,dx) = Rates(P,R,f,omega,v,gravity,gravityWeight/gravityNoise^2,
    stationarity/zeroVelocityNoise^2,
    cat(1, fill(accelNoise^2,3), fill(gyroNoise^2,3), fill(gyroBiasWalk^2,3)));
  der(P) = dP;

  der(p) = v;
  der(v) = R*f-{0.0,0.0,gravity}+dx[1:3];
  // Right-local attitude correction enters as an extra body rate; the last
  // term pulls the quaternion back to unit length.
  der(q[1]) = -(q[2]*(omega[1]+dx[4])+q[3]*(omega[2]+dx[5])+q[4]*(omega[3]+dx[6]))/2+(1-q*q)*q[1];
  der(q[2]) = (q[1]*(omega[1]+dx[4])+q[3]*(omega[3]+dx[6])-q[4]*(omega[2]+dx[5]))/2+(1-q*q)*q[2];
  der(q[3]) = (q[1]*(omega[2]+dx[5])-q[2]*(omega[3]+dx[6])+q[4]*(omega[1]+dx[4]))/2+(1-q*q)*q[3];
  der(q[4]) = (q[1]*(omega[3]+dx[6])+q[2]*(omega[2]+dx[5])-q[3]*(omega[1]+dx[4]))/2+(1-q*q)*q[4];
  der(bg) = dx[7:9];

  position = p;
  velocity = v;
  quaternion = qn;
  filteredAccel = f;
  filteredGyro = omega;
  gyroBias = bg;
  attitudeStd = {sqrt(max(P[4,4],0.0)), sqrt(max(P[5,5],0.0)), sqrt(max(P[6,6],0.0))};

  annotation (experiment(StopTime=10, Interval=0.01, Tolerance=1e-8));
end PhoneMotionEKF;
