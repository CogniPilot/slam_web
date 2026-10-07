// Frozen equation-model baseline; model identifiers only renamed.
model SchmidtReferencePredictionReference
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  input Real covariance[currentDimension,currentDimension];
  input Real crossCovariance[currentDimension,referenceDimension];
  input Real referenceCovariance[referenceDimension,referenceDimension];
  input Real transition[currentDimension,currentDimension] = identity(currentDimension);
  input Real processCovariance[currentDimension,currentDimension] = zeros(currentDimension,currentDimension);
  input Real referenceAvailable = 0.0;
  input Real predictionEnabled = 1.0;
  output Real accepted;
  output Real nextCovariance[currentDimension,currentDimension];
  output Real nextCrossCovariance[currentDimension,referenceDimension];
  output Real nextReferenceCovariance[referenceDimension,referenceDimension];
protected
  Real raw[currentDimension,currentDimension];
  Real proposed[currentDimension,currentDimension];
  Real proposedCross[currentDimension,referenceDimension];
  Real priorJoint[21,21];
  Real proposedJoint[21,21];
  Real currentValid;
  Real processValid;
  Real proposedCurrentValid;
  Real priorJointValid;
  Real proposedJointValid;
  Real finiteTransition[currentDimension,currentDimension];
equation
  // Fresh process noise is independent of both prior states. State correlation
  // is retained in every cross entry; no independence assumption between poses.
  raw = transition*covariance*transpose(transition)+processCovariance;
  proposed = 0.5*(raw+transpose(raw));
  proposedCross = transition*crossCovariance;
  priorJoint = cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint = cat(1,cat(2,proposed,proposedCross),
    cat(2,transpose(proposedCross),referenceCovariance));
  currentValid = SLAMCovariancePSDCheck(covariance,1e-12);
  processValid = SLAMCovariancePSDCheck(processCovariance,1e-12);
  proposedCurrentValid = SLAMCovariancePSDCheck(proposed,1e-12);
  priorJointValid = SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid = SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:currentDimension loop
    for j in 1:currentDimension loop
      finiteTransition[i,j] = if noEvent(abs(transition[i,j]) <= 1e6) then 0.0 else 1.0;
    end for;
  end for;
  accepted = if noEvent(predictionEnabled >= 1.0 and predictionEnabled <= 1.0
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentValid > 0.5 and processValid > 0.5 and proposedCurrentValid > 0.5
    and sum(finiteTransition) < 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5 and proposedJointValid > 0.5)))
    then 1.0 else 0.0;
  nextCovariance = if noEvent(accepted > 0.5) then proposed else covariance;
  // With no reference these buffers are unavailable, not invented covariance.
  nextCrossCovariance = if noEvent(accepted > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0))
    then proposedCross else crossCovariance;
  nextReferenceCovariance = referenceCovariance;
end SchmidtReferencePredictionReference;

model ES15SchmidtPredictionReference
  input Real position[3] = zeros(3);
  input Real velocity[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real accelBias[3] = zeros(3);
  input Real gyroBias[3] = zeros(3);
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real referenceAvailable = 0.0;
  input Real accel[3] = {0.0,0.0,9.81};
  input Real gyro[3] = zeros(3);
  input Real gravity[3] = {0.0,0.0,-9.81};
  input Real h = 1.0/90.0;
  input Real density[12] = {0.06,0.06,0.06,0.006,0.006,0.006,0.002,0.002,0.002,0.0002,0.0002,0.0002};
  output Real accepted;
  output Real transition[15,15];
  output Real processCovariance[15,15];
  output Real nextPosition[3];
  output Real nextVelocity[3];
  output Real nextRotation[3,3];
  output Real nextAccelBias[3];
  output Real nextGyroBias[3];
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextReferenceAvailable;
protected
  RGBDProperRotation currentCheck(rotation=rotation);
  RGBDProperRotation referenceCheck(rotation=referenceRotation);
  RGBDProperRotation proposedCheck(rotation=nominal.next_rotation);
  ES15NominalPrediction nominal(rotation=rotation,position=position,velocity=velocity,
    accel=accel,gyro=gyro,accel_bias=accelBias,gyro_bias=gyroBias,gravity=gravity,h=h);
  ES15Dynamics dynamics(rotation=nominal.middle_rotation,force=nominal.force,omega=nominal.omega);
  ES15CovariancePrediction propagation(F=dynamics.F,G=dynamics.G,P=covariance,
    dt=if noEvent(nominal.valid > 0.5) then h else 0.0,density=density);
  SchmidtReferencePredictionReference joint(covariance=covariance,crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,transition=propagation.Phi,
    processCovariance=propagation.Q,referenceAvailable=referenceAvailable,
    predictionEnabled=nominalValid);
  Real nominalValid;
  Real densityChecks[12];
  Real geometryChecks[3];
equation
  for i in 1:12 loop
    densityChecks[i] = if noEvent(density[i] >= 0.0 and density[i] <= 1e6) then 0.0 else 1.0;
  end for;
  for i in 1:3 loop
    geometryChecks[i] = if noEvent(abs(nominal.next_position[i]) <= 1e6
      and abs(nominal.next_velocity[i]) <= 1e6 and abs(accelBias[i]) <= 2.0
      and abs(gyroBias[i]) <= 0.3 and abs(gravity[i]) <= 1e3
      and (SLAMExactRealEqual(referenceAvailable,0.0) or abs(referencePosition[i]) <= 1e6)) then 0.0 else 1.0;
  end for;
  nominalValid = if noEvent(nominal.valid > 0.5 and currentCheck.valid > 0.5
    and proposedCheck.valid > 0.5 and sum(densityChecks)+sum(geometryChecks) < 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or referenceCheck.valid > 0.5)) then 1.0 else 0.0;
  accepted = joint.accepted;
  transition = propagation.Phi;
  processCovariance = propagation.Q;
  nextPosition = if noEvent(accepted > 0.5) then nominal.next_position else position;
  nextVelocity = if noEvent(accepted > 0.5) then nominal.next_velocity else velocity;
  nextRotation = if noEvent(accepted > 0.5) then nominal.next_rotation else rotation;
  nextAccelBias = accelBias;
  nextGyroBias = gyroBias;
  nextCovariance = joint.nextCovariance;
  nextCrossCovariance = joint.nextCrossCovariance;
  nextReferenceCovariance = referenceCovariance;
  nextReferencePosition = referencePosition;
  nextReferenceRotation = referenceRotation;
  nextReferenceAvailable = referenceAvailable;
end ES15SchmidtPredictionReference;
