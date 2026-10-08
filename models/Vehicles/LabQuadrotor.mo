// Generated from CogniPilot/modelica_models cb132c87a9e00289bbac11642110976248734878; edit the canonical packages there.
// Quadrotor plant pinned in models/upstream/quadrotor/provenance.json.
// Control and rigid-body dependencies: models/Libraries/CogniPilot.
// 6-DOF quadrotor SIL plant model.
//
// Inputs:  4 motor angular velocities [rad/s]
// States:  rigid body pose/velocity plus motor speeds
//
// Internal frame matches the cyecca model: local world Z is Up and body axes
// are Forward-Left-Up. Wrappers can expose NED/FRD values.
//
// Motor layout (ArduPilot Quad-X output order):
//   1: front-right  CCW   2: rear-left   CCW
//   3: front-left   CW    4: rear-right  CW

model QuadrotorSIL
  parameter Real vehicle_mass = 2.0 "Total vehicle mass [kg]";
  parameter Real vehicle_ixx = 0.02166666666666667 "Body inertia xx [kg*m^2]";
  parameter Real vehicle_iyy = 0.02166666666666667 "Body inertia yy [kg*m^2]";
  parameter Real vehicle_izz = 0.04000000000000001 "Body inertia zz [kg*m^2]";

  extends RigidBody.RigidBody6DOF(
    mass = vehicle_mass,
    g = 9.8,
    ixx = vehicle_ixx,
    iyy = vehicle_iyy,
    izz = vehicle_izz,
    p_start = {0, 0, ground_z - leg_z + initial_ground_clearance},
    qnorm_gain = 1.0
  );

  // Aerodynamic and actuator parameters
  parameter Real Ct = 8.54858e-6 "Thrust coefficient [N/(rad/s)^2]";
  parameter Real Cm = 0.016 "Rotor torque/thrust ratio [m]";
  parameter Real arm_length = 0.25 "Arm length [m]";
  parameter Real d = arm_length * 0.7071067811865476 "Effective moment arm [m]";
  parameter Real Cl_p = -0.2 "Rolling moment coefficient per roll rate";
  parameter Real Cm_q = -0.2 "Pitching moment coefficient per pitch rate";
  parameter Real Cn_r = -0.1 "Yawing moment coefficient per yaw rate";
  parameter Real S = 0.1 "Reference area [m^2]";
  parameter Real CdA[3] = {0.06, 0.08, 0.12} "Body-axis drag area [m^2]";
  parameter Real linear_drag[3] = {0.12, 0.12, 0.18} "Low-speed body-axis drag [N/(m/s)]";
  parameter Real rho = 1.225 "Air density [kg/m^3]";
  parameter Real mag_world_ned[3] = {0.21, 0.0, 0.45} "Mag field NED [Gauss]";
  parameter Real R_FRD_FLU[3, 3] = [
    1, 0, 0;
    0, -1, 0;
    0, 0, -1
  ] "Body FLU to body FRD transform";
  parameter Real R_NWU_NED[3, 3] = [
    1, 0, 0;
    0, -1, 0;
    0, 0, -1
  ] "World NED to internal N/W/U transform";

  // Ground contact (spring-damper)
  parameter Real ground_k = 3000 "Ground stiffness per contact point [N/m]";
  parameter Real ground_c = 150 "Ground normal damping per contact point [N*s/m]";
  parameter Real ground_tangent_c = 25 "Ground tangential damping per contact point [N*s/m]";
  parameter Real ground_z = 0.0 "World Z coordinate of the ground collision plane [m]";
  parameter Real initial_ground_clearance = 0.02 "Initial landing-leg clearance above the ground plane [m]";
  parameter Real leg_x = 0.17 "Landing contact X offset from CG [m]";
  parameter Real leg_y = 0.17 "Landing contact Y offset from CG [m]";
  parameter Real leg_z = -0.10 "Landing contact Z offset from CG [m]";

  // Motor first-order response
  parameter Real tau_up = 0.0125 "Motor spin-up time constant [s]";
  parameter Real tau_down = 0.025 "Motor spin-down time constant [s]";
  parameter Real motor_tau_eps = 1.0 "Smooth transition width for asymmetric motor lag [rad/s]";
  parameter Real motor_omega_cmd_max = 1600 "Maximum commanded motor speed [rad/s]";
  parameter Real motor_omega_cmd_eps = 20 "Smooth command saturation width [rad/s]";
  parameter Real motor_moment_map[3, 4] = [
    -d,   d,   d,  -d;
    -d,   d,  -d,   d;
   -Cm, -Cm,  Cm,  Cm
  ] "Motor thrust to body moment map";
  parameter Real rate_damping[3] = {
    4 * S * arm_length * Cl_p,
    4 * S * arm_length * Cm_q,
    4 * S * arm_length * Cn_r
  } "Body rate damping coefficients";

  model Motor
    parameter Real Ct = 8.54858e-6 "Thrust coefficient [N/(rad/s)^2]";
    parameter Real tau_up = 0.0125 "Motor spin-up time constant [s]";
    parameter Real tau_down = 0.025 "Motor spin-down time constant [s]";
    parameter Real tau_inv_mid = 0.5 * (1.0 / tau_up + 1.0 / tau_down) "Mean inverse motor lag [1/s]";
    parameter Real tau_inv_delta = 0.5 * (1.0 / tau_up - 1.0 / tau_down) "Signed inverse motor lag half-range [1/s]";
    parameter Real tau_eps = 1.0 "Smooth transition width for asymmetric lag [rad/s]";
    parameter Real omega_cmd_max = 1600 "Maximum commanded motor speed [rad/s]";
    parameter Real omega_cmd_eps = 20 "Smooth command saturation width [rad/s]";

    input Real omega_cmd(start = 0) "Commanded speed [rad/s]";
    output Real omega(start = 0, fixed = true) "Actual speed [rad/s]";
    output Real thrust "Motor thrust [N]";

  protected
    Real omega_error "Motor speed tracking error [rad/s]";
    Real omega_cmd_nonnegative "Command after smooth lower limit [rad/s]";
    Real omega_cmd_upper_margin "Distance from the smooth lower-limited command to the upper command limit [rad/s]";
    Real omega_cmd_limited "Command after smooth lower and upper limits [rad/s]";
    Real lag_blend "Smooth lag blend";
    Real tau_inv "Smooth inverse lag [1/s]";

  equation
    omega_cmd_nonnegative = 0.5 * (omega_cmd + sqrt(omega_cmd * omega_cmd + omega_cmd_eps * omega_cmd_eps));
    omega_cmd_upper_margin = omega_cmd_max - omega_cmd_nonnegative;
    omega_cmd_limited = omega_cmd_max - 0.5 * (omega_cmd_upper_margin + sqrt(omega_cmd_upper_margin * omega_cmd_upper_margin + omega_cmd_eps * omega_cmd_eps));
    omega_error = omega_cmd_limited - omega;
    lag_blend = omega_error / sqrt(omega_error * omega_error + tau_eps * tau_eps);
    tau_inv = tau_inv_mid + tau_inv_delta * lag_blend;
    der(omega) = tau_inv * omega_error;
    thrust = Ct * omega * omega;
  end Motor;

  input Real omega_cmd[4](start = {0, 0, 0, 0}) "Motor commands [rad/s]";

  output Real position[3](start = p_start) "World position [m]";
  output Real velocity[3](start = v_b_start) "World velocity [m/s]";
  output Real quat[4](start = q_start) "Quaternion w,x,y,z";
  output Real omega_m[4](start = {0, 0, 0, 0}) "Motor actual speeds [rad/s]";
  output Real accel[3](start = {0, 0, 0}) "Body FRD accelerometer [m/s^2] (specific force)";
  output Real gyro[3](start = {0, 0, 0}) "Body FRD gyroscope [rad/s]";
  output Real mag[3](start = {0.21, 0, -0.45}) "Body FRD magnetometer [Gauss]";

protected
  Motor motor[4](
    each Ct = Ct,
    each tau_up = tau_up,
    each tau_down = tau_down,
    each tau_eps = motor_tau_eps,
    each omega_cmd_max = motor_omega_cmd_max,
    each omega_cmd_eps = motor_omega_cmd_eps
  );
  Real F_m[4] "Motor thrusts [N]";
  Real T "Total motor thrust [N]";
  Real M_rotor[3] "Rotor moment in body FLU [N*m]";
  Real M_rate[3] "Rate damping moment in body FLU [N*m]";
  Real V "Airspeed magnitude [m/s]";
  Real drag_b[3] "Body drag force [N]";
  Real mag_world_w[3] "Mag field in internal N/W/U world axes [Gauss]";
  Real mag_b_flu[3] "Mag field in body FLU axes [Gauss]";
  Real leg_h_w[4] "Landing contact world Z positions [m]";
  parameter Real leg_r_b[3, 4] = [
    leg_x, -leg_x, leg_x, -leg_x;
    -leg_y, leg_y, leg_y, -leg_y;
    leg_z, leg_z, leg_z, leg_z
  ] "Landing contact offsets in body FLU [m]";
  Real leg_v_b[3, 4] "Landing contact velocities in body [m/s]";
  Real leg_f_w[3, 4] "Landing contact forces in world [N]";
  Real leg_f_b[3, 4] "Landing contact forces in body [N]";
  Real leg_m_b[3, 4] "Landing contact moments in body [N*m]";
  Real F_ground_b[3] "Total ground force in body FLU [N]";
  Real M_ground_b[3] "Total ground moment in body FLU [N*m]";

equation
  motor.omega_cmd = omega_cmd;
  omega_m = motor.omega;
  F_m = motor.thrust;
  T = F_m[1] + F_m[2] + F_m[3] + F_m[4];

  V = sqrt(v_b[1] * v_b[1] + v_b[2] * v_b[2] + v_b[3] * v_b[3] + 1e-12);
  drag_b = -0.5 * rho * V * (CdA .* v_b) - linear_drag .* v_b;

  M_rotor = motor_moment_map * F_m;
  M_rate = rate_damping .* omega;

  for i in 1:4 loop
    leg_v_b[:, i] = v_b + cross(omega, leg_r_b[:, i]);
    leg_h_w[i] = p[3] + R[3, :] * leg_r_b[:, i];
    leg_f_w[1, i] = if leg_h_w[i] < ground_z then -ground_tangent_c * (R[1, :] * leg_v_b[:, i]) else 0;
    leg_f_w[2, i] = if leg_h_w[i] < ground_z then -ground_tangent_c * (R[2, :] * leg_v_b[:, i]) else 0;
    leg_f_w[3, i] = if leg_h_w[i] < ground_z then max(0, ground_k * (ground_z - leg_h_w[i]) - ground_c * (R[3, :] * leg_v_b[:, i])) else 0;
    leg_m_b[:, i] = cross(leg_r_b[:, i], leg_f_b[:, i]);
  end for;

  leg_f_b = transpose(R) * leg_f_w;

  F_ground_b = leg_f_b * {1, 1, 1, 1};
  M_ground_b = leg_m_b * {1, 1, 1, 1};

  M_b = M_rotor + M_rate + M_ground_b;
  F_b = F_ground_b + drag_b + {0, 0, T};

  accel = R_FRD_FLU * a_b;
  gyro = R_FRD_FLU * omega;
  mag_world_w = R_NWU_NED * mag_world_ned;
  mag_b_flu = transpose(R) * mag_world_w;
  mag = R_FRD_FLU * mag_b_flu;

  position = p;
  velocity = v_w;
  quat = q;

end QuadrotorSIL;

// Application references and ENU/FLU interface around the upstream controllers.
model LabQuadrotor

  constant Integer motorCount = 4;
  constant Real frameHalf = 0.7071067811865476;
  constant Real worldToEnu[3,3] = {{0,-1,0},{1,0,0},{0,0,1}};
  constant Real spinDirection[motorCount] = {1,1,-1,-1};
  parameter Real mass = 2.0;
  parameter Real gravity = 9.81;
  parameter Real Ix = 0.02166666666666667;
  parameter Real Iy = 0.02166666666666667;
  parameter Real Iz = 0.04000000000000001;
  parameter Real arm = 0.25;
  parameter Real k_thrust = 8.54858e-6;
  parameter Real k_torque = 0.016;
  parameter Real initialHeight = 1.5;
  parameter Real controlPeriod = 0.01 "Position integral sample period s";
  parameter Real rateGain[3] = {20,20,10};
  parameter Real maximumMoment[3] = {2.6,2.6,0.30};
  parameter Real maximumMotorSpeed = 1100 "Rotor speed at full command rad/s";
  input Real forward(start=0) "Body forward velocity setpoint m/s";
  input Real left(start=0) "Body left velocity setpoint m/s";
  input Real up(start=0) "World vertical velocity setpoint m/s";
  input Real yaw(start=0) "Yaw rate setpoint rad/s";
  input Real autopilot = 0.0;
  input Real indoorTour = 0.0;
  input Real commandTime = 0.0 "Held start-of-frame simulation timestamp";
  input Real positionMode = 0.0 "1 selects an explicit trajectory reference";
  input Real targetPosition[3] = {0,0,initialHeight} "World ENU position m";
  input Real targetVelocity[3] = zeros(3) "World ENU velocity m/s";
  input Real targetAcceleration[3] = zeros(3) "World ENU acceleration m/s2";
  input Real targetHeading = 0.0 "World ENU heading rad";
  output Real forwardSetpoint; output Real leftSetpoint;
  output Real upSetpoint; output Real yawSetpoint;
  output Real x; output Real y; output Real z;
  output Real vx; output Real vy; output Real vz;
  output Real qw; output Real qx; output Real qy; output Real qz;
  output Real p; output Real q; output Real r;
  output Real imu_ax; output Real imu_ay; output Real imu_az;
  output Real omega_m[motorCount] "Actual plant rotor speeds rad/s";
  output Real propellerAngles[motorCount](each start=0.0,each fixed=true)
    "Unwrapped actual rotor angle; CCW motors 1/2 positive, CW motors 3/4 negative";
  output Real positionSetpoint[3];
  output Real velocitySetpoint[3];
  output Real angularVelocitySetpoint[3];
  output Real motorCommand[motorCount] "Normalized allocated motor commands";
protected
  QuadrotorSIL vehicle(
    vehicle_mass=mass,vehicle_ixx=Ix,vehicle_iyy=Iy,vehicle_izz=Iz,g=gravity,
    arm_length=arm,Ct=k_thrust,Cm=k_torque,
    initial_ground_clearance=initialHeight-0.10,
    q_start={frameHalf,0,0,-frameHalf});
  Real command[4];
  Real position[3]; Real velocity[3]; Real quaternion[4]; Real orientation[3,3];
  Control.Multirotor.LogLinear.Controller controller(
    samplePeriod=controlPeriod,mass=mass,gravity=gravity,thrustTrim=mass*gravity);
  Real pathPosition[3](start={0,0,initialHeight},each fixed=true);
  Real pathHeading(start=0, fixed=true);
  Real pathVelocity[3];
  Real headingSetpoint;
  Real unboundedMoment[3]; Real desiredMoment[3];
  parameter Real momentArm = arm*0.7071067811865476;
  parameter Real wrenchToRotorThrust[motorCount,4] = {
    {0.25,-1/(4*momentArm),-1/(4*momentArm),-1/(4*k_torque)},
    {0.25, 1/(4*momentArm), 1/(4*momentArm),-1/(4*k_torque)},
    {0.25, 1/(4*momentArm),-1/(4*momentArm), 1/(4*k_torque)},
    {0.25,-1/(4*momentArm), 1/(4*momentArm), 1/(4*k_torque)}};
equation
  // Modelica owns both tours. commandTime is held for a complete lockstep
  // interval, preserving the acquisition-boundary command timing.
  command = if noEvent(autopilot > 0.5) then {
    if noEvent(indoorTour > 0.5) then
      (if noEvent(commandTime < 40.0) then 1.1 else if noEvent(commandTime < 50.0) then 0.0
       else if noEvent(commandTime < 90.0) then -1.1 else 0.0) else 0.6,
    0.0,
    if noEvent(indoorTour > 0.5) then 0.0 else 0.06*sin(commandTime*0.3),
    if noEvent(indoorTour > 0.5 or commandTime < 2.0) then 0.0 else 0.4
  } else {forward,left,up,yaw};
  forwardSetpoint=command[1]; leftSetpoint=command[2];
  upSetpoint=command[3]; yawSetpoint=command[4];

  position = worldToEnu*vehicle.position;
  velocity = worldToEnu*vehicle.velocity;
  orientation = worldToEnu*vehicle.R;
  quaternion = frameHalf*{
    vehicle.quat[1]-vehicle.quat[4],vehicle.quat[2]-vehicle.quat[3],
    vehicle.quat[3]+vehicle.quat[2],vehicle.quat[4]+vehicle.quat[1]};
  x=position[1]; y=position[2]; z=position[3];
  vx=velocity[1]; vy=velocity[2]; vz=velocity[3];
  qw=quaternion[1]; qx=quaternion[2]; qy=quaternion[3]; qz=quaternion[4];
  p=vehicle.omega[1]; q=vehicle.omega[2]; r=vehicle.omega[3];
  // Keep the existing FLU IMU contract, rather than the plant's FRD aliases.
  imu_ax=vehicle.a_b[1]; imu_ay=vehicle.a_b[2]; imu_az=vehicle.a_b[3];
  omega_m=vehicle.omega_m;

  pathVelocity = {
    cos(pathHeading)*command[1]-sin(pathHeading)*command[2],
    sin(pathHeading)*command[1]+cos(pathHeading)*command[2],command[3]};
  der(pathPosition) = pathVelocity;
  der(pathHeading) = command[4];
  positionSetpoint = if noEvent(positionMode > 0.5) then targetPosition else pathPosition;
  velocitySetpoint = if noEvent(positionMode > 0.5) then targetVelocity else pathVelocity;
  headingSetpoint = if noEvent(positionMode > 0.5) then targetHeading else pathHeading;

  controller.positionWorld = position;
  controller.velocityWorld = velocity;
  controller.quaternionWorldBody = quaternion;
  controller.positionReferenceWorld = positionSetpoint;
  controller.velocityReferenceWorld = velocitySetpoint;
  controller.accelerationReferenceWorld = if noEvent(positionMode > 0.5) then targetAcceleration else zeros(3);
  controller.headingQuaternionReference = {cos(headingSetpoint/2),0,0,sin(headingSetpoint/2)};
  controller.resetIntegral = false;
  angularVelocitySetpoint = controller.angularVelocitySetpoint;
  unboundedMoment = Control.Multirotor.RateLoop.bodyMoment(
    angularVelocitySetpoint,vehicle.omega,{Ix,Iy,Iz},rateGain);
  desiredMoment = {min(maximumMoment[axis],max(-maximumMoment[axis],unboundedMoment[axis])) for axis in 1:3};
  motorCommand = Control.Multirotor.Allocation.rotorCommands(
    motorCount,controller.thrust,desiredMoment,wrenchToRotorThrust,
    fill(k_thrust,motorCount),fill(maximumMotorSpeed,motorCount));
  vehicle.omega_cmd = maximumMotorSpeed*motorCommand;
  for motor in 1:motorCount loop
    der(propellerAngles[motor])=spinDirection[motor]*vehicle.omega_m[motor];
  end for;
end LabQuadrotor;
