model RenderedRevisitQuadrotor "Return to the first RGB-D view after six seconds"
  LabQuadrotor vehicle(autopilot=0, indoorTour=0, commandTime=0);
  output Real x = vehicle.x;
  output Real y = vehicle.y;
  output Real z = vehicle.z;
  output Real vx = vehicle.vx;
  output Real vy = vehicle.vy;
  output Real vz = vehicle.vz;
  output Real qw = vehicle.qw;
  output Real qx = vehicle.qx;
  output Real qy = vehicle.qy;
  output Real qz = vehicle.qz;
  output Real p = vehicle.p;
  output Real q = vehicle.q;
  output Real r = vehicle.r;
  output Real imu_ax = vehicle.imu_ax;
  output Real imu_ay = vehicle.imu_ay;
  output Real imu_az = vehicle.imu_az;
  output Real forwardSetpoint = vehicle.forwardSetpoint;
  output Real leftSetpoint = vehicle.leftSetpoint;
  output Real upSetpoint = vehicle.upSetpoint;
  output Real yawSetpoint = vehicle.yawSetpoint;
  output Real propellerAngles[4] = vehicle.propellerAngles;
equation
  vehicle.forward = if noEvent(time < 2) then 1.2 else if noEvent(time < 4) then -1.2 else 0;
  vehicle.left = 0;
  vehicle.up = 0;
  vehicle.yaw = 0;
end RenderedRevisitQuadrotor;
