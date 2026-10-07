// One held-IMU prediction followed by an optional pose observation.
// Compile with ES15NominalPrediction, ES15Dynamics, ES15CovariancePrediction,
// SPD6Solve and ES15PoseCorrection. Every matrix operation and solve is Modelica.
// Prior rotation must be SO(3), covariance SPD, and all inputs finite.
// The caller retains the returned state and subdivides longer/high-rate frames
// to h <= 20 ms and |gyro - gyro_bias|*h <= 0.1 rad.
// This filter core consumes a measured map-frame pose, not ground truth. It
// does not implement RGB-D registration, a map, relocalization or loop closure.
model ES15FilterStep
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer noiseDimension = 12;
  constant Integer poseDimension = 6;
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real position[spaceDimension] = zeros(spaceDimension);
  input Real velocity[spaceDimension] = zeros(spaceDimension);
  input Real accel_bias[spaceDimension] = zeros(spaceDimension);
  input Real gyro_bias[spaceDimension] = zeros(spaceDimension);
  input Real covariance[errorDimension,errorDimension];
  input Real accel[spaceDimension] = {0.0,0.0,9.81};
  input Real gyro[spaceDimension] = zeros(spaceDimension);
  input Real gravity[spaceDimension] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[noiseDimension] = {0.06,0.06,0.06,0.006,0.006,0.006,
    0.002,0.002,0.002,0.0002,0.0002,0.0002};
  // Exactly zero disables correction; exactly one requests a measured pose.
  input Real observation_enabled = 0.0;
  input Real observed_rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real observed_position[spaceDimension] = zeros(spaceDimension);
  input Real observation_covariance[poseDimension,poseDimension];
  input Real accepted_count = 0.0;
  input Real rejected_count = 0.0;
  input Real last_nis = 0.0;
  output Real prediction_valid;
  output Real observation_accepted;
  output Real observation_rejected;
  output Real next_position[spaceDimension];
  output Real next_velocity[spaceDimension];
  output Real next_rotation[spaceDimension,spaceDimension];
  output Real next_accel_bias[spaceDimension];
  output Real next_gyro_bias[spaceDimension];
  output Real next_covariance[errorDimension,errorDimension];
  output Real next_accepted_count;
  output Real next_rejected_count;
  output Real next_last_nis;
protected
  parameter Real finiteLimit = 1.7976931348623157e308;
  Real density_checks[noiseDimension];
  Real position_checks[spaceDimension];
  Real velocity_checks[spaceDimension];
  Real rotation_checks[spaceDimension,spaceDimension];
  Real covariance_checks[errorDimension,errorDimension];
  Real requested;
  ES15NominalPrediction nominal(rotation=rotation,position=position,
    velocity=velocity,accel=accel,gyro=gyro,accel_bias=accel_bias,
    gyro_bias=gyro_bias,gravity=gravity,h=h);
  ES15Dynamics dynamics(rotation=nominal.middle_rotation,
    force=nominal.force,omega=nominal.omega);
  ES15CovariancePrediction propagation(F=dynamics.F,G=dynamics.G,P=covariance,
    dt=if noEvent(nominal.valid > 0.5) then h else 0.0,density=density);
  ES15CorrectionSolve observationCheck(A=observation_covariance,
    B=zeros(poseDimension,errorDimension+1));
  ES15CorrectionSolve innovationSolve(A=correction.innovation_covariance,
    B=correction.solve_rhs);
  ES15PoseCorrection correction(rotation=nominal.next_rotation,
    position=nominal.next_position,velocity=nominal.next_velocity,
    accel_bias=accel_bias,gyro_bias=gyro_bias,covariance=propagation.predicted,
    observed_rotation=observed_rotation,observed_position=observed_position,
    observation_covariance=observation_covariance,solved=innovationSolve.X,
    solve_valid=innovationSolve.valid,
    observation_covariance_valid=if noEvent(requested > 0.5 and prediction_valid > 0.5)
      then observationCheck.valid else 0.0,
    accepted_count=accepted_count,rejected_count=rejected_count,last_nis=last_nis);
equation
  // finiteLimit comparisons reject both infinities and NaNs in proposed values.
  for i in 1:noiseDimension loop
    density_checks[i] = if noEvent(density[i] >= 0.0 and density[i] <= finiteLimit) then 0.0 else 1.0;
  end for;
  for i in 1:spaceDimension loop
    position_checks[i] = if noEvent(abs(nominal.next_position[i]) <= finiteLimit) then 0.0 else 1.0;
    velocity_checks[i] = if noEvent(abs(nominal.next_velocity[i]) <= finiteLimit) then 0.0 else 1.0;
    for j in 1:spaceDimension loop
      rotation_checks[i,j] = if noEvent(abs(nominal.next_rotation[i,j]) <= finiteLimit) then 0.0 else 1.0;
    end for;
  end for;
  for i in 1:errorDimension loop
    for j in 1:errorDimension loop
      covariance_checks[i,j] = if noEvent(abs(propagation.predicted[i,j]) <= finiteLimit) then 0.0 else 1.0;
    end for;
  end for;
  prediction_valid = if noEvent(nominal.valid > 0.5
    and sum(density_checks) < 0.5 and sum(position_checks)+sum(velocity_checks) < 0.5
    and sum(rotation_checks) < 0.5 and sum(covariance_checks) < 0.5) then 1.0 else 0.0;
  requested = if noEvent(observation_enabled >= 1.0 and observation_enabled <= 1.0) then 1.0 else 0.0;
  observation_accepted = if noEvent(prediction_valid > 0.5 and requested > 0.5
    and correction.accepted > 0.5) then 1.0 else 0.0;
  observation_rejected = if noEvent(prediction_valid > 0.5
    and not (observation_enabled >= 0.0 and observation_enabled <= 0.0)
    and observation_accepted < 0.5) then 1.0 else 0.0;
  next_position = if noEvent(prediction_valid < 0.5) then position
    else if noEvent(observation_accepted > 0.5) then correction.next_position else nominal.next_position;
  next_velocity = if noEvent(prediction_valid < 0.5) then velocity
    else if noEvent(observation_accepted > 0.5) then correction.next_velocity else nominal.next_velocity;
  next_rotation = if noEvent(prediction_valid < 0.5) then rotation
    else if noEvent(observation_accepted > 0.5) then correction.next_rotation else nominal.next_rotation;
  next_covariance = if noEvent(prediction_valid < 0.5) then covariance
    else if noEvent(observation_accepted > 0.5) then correction.next_covariance else propagation.predicted;
  next_accel_bias = if noEvent(observation_accepted > 0.5) then correction.next_accel_bias else accel_bias;
  next_gyro_bias = if noEvent(observation_accepted > 0.5) then correction.next_gyro_bias else gyro_bias;
  next_accepted_count = accepted_count+observation_accepted;
  next_rejected_count = rejected_count+observation_rejected;
  next_last_nis = if noEvent(prediction_valid > 0.5 and requested > 0.5)
    then correction.next_last_nis else last_nis;
end ES15FilterStep;
