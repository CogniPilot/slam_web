// MLS 3.5 permits exact Real equality inside functions. This helper preserves
// IEEE equality: signed zeros compare equal; NaN compares unequal to every value.
function SLAMExactRealEqual
  input Real left;
  input Real right;
  output Boolean equal;
algorithm
  equal := left == right;
end SLAMExactRealEqual;

// An acquisition interval is a held measurement, not an integration substep.
// This bound covers the supported sensor rates without fabricating samples.
function ES15HeldIntervalValid
  input Real h;
  output Boolean valid;
algorithm
  valid := h > 0.0 and h <= 0.2;
end ES15HeldIntervalValid;

function SchmidtPredictCovariance
  input Real covariance[15,15];
  input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6];
  input Real transition[15,15];
  input Real processCovariance[15,15];
  input Real referenceAvailable;
  input Real predictionEnabled;
  output Real accepted;
  output Real nextCovariance[15,15];
  output Real nextCrossCovariance[15,6];
  output Real nextReferenceCovariance[6,6];
protected
  Real raw[15,15]; Real proposed[15,15]; Real proposedCross[15,6];
  Real priorJoint[21,21]; Real proposedJoint[21,21];
  Real currentValid; Real processValid; Real proposedCurrentValid;
  Real priorJointValid; Real proposedJointValid;
  Real finiteTransition[15,15];
algorithm
  raw := transition*covariance*transpose(transition)+processCovariance;
  proposed := 0.5*(raw+transpose(raw));
  proposedCross := transition*crossCovariance;
  priorJoint := cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint := cat(1,cat(2,proposed,proposedCross),
    cat(2,transpose(proposedCross),referenceCovariance));
  currentValid := SLAMCovariancePSDCheck(covariance,1e-12);
  processValid := SLAMCovariancePSDCheck(processCovariance,1e-12);
  proposedCurrentValid := SLAMCovariancePSDCheck(proposed,1e-12);
  priorJointValid := SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid := SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:15 loop
    for j in 1:15 loop
      finiteTransition[i,j] := if abs(transition[i,j]) <= 1e6 then 0.0 else 1.0;
    end for;
  end for;
  accepted := if SLAMExactRealEqual(predictionEnabled,1.0)
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentValid > 0.5 and processValid > 0.5 and proposedCurrentValid > 0.5
    and sum(finiteTransition) < 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5 and proposedJointValid > 0.5))
    then 1.0 else 0.0;
  nextCovariance := if accepted > 0.5 then proposed else covariance;
  nextCrossCovariance := if accepted > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0)
    then proposedCross else crossCovariance;
  nextReferenceCovariance := referenceCovariance;
end SchmidtPredictCovariance;

// Modelica owns numerical subdivision of one unchanged held IMU measurement.
// Each substep uses the current midpoint rotation and propagates the full joint
// covariance. A failed substep rolls back the whole acquisition interval.
function ES15PredictHeldInterval
  input Real position[3]; input Real velocity[3]; input Real rotation[3,3];
  input Real accelBias[3]; input Real gyroBias[3];
  input Real covariance[15,15]; input Real crossCovariance[15,6];
  input Real referenceCovariance[6,6]; input Real referencePosition[3];
  input Real referenceRotation[3,3]; input Real referenceAvailable;
  input Real accel[3]; input Real gyro[3]; input Real gravity[3];
  input Real h; input Real density[12];
  output Real accepted;
  output Real transition[15,15]; output Real processCovariance[15,15];
  output Real nextPosition[3]; output Real nextVelocity[3]; output Real nextRotation[3,3];
  output Real nextCovariance[15,15]; output Real nextCrossCovariance[15,6];
  output Integer substeps;
protected
  constant Integer maximumSubsteps = 64;
  Real rate; Real requestedSteps; Real dt;
  Real force[3]; Real omega[3]; Real middleRotation[3,3];
  Real proposedPosition[3]; Real proposedVelocity[3]; Real proposedRotation[3,3];
  Real F[15,15]; Real G[15,12]; Real Phi[15,15]; Real Q[15,15];
  Real proposedCovariance[15,15]; Real proposedCross[15,6]; Real retainedReference[6,6];
  Real rawNoise[15,15]; Real nominalValid; Real jointAccepted;
  Boolean geometryValid; Boolean densityValid; Boolean running;
algorithm
  accepted := 0.0; substeps := 0;
  transition := identity(15); processCovariance := zeros(15,15);
  nextPosition := position; nextVelocity := velocity; nextRotation := rotation;
  nextCovariance := covariance; nextCrossCovariance := crossCovariance;
  rate := sqrt(sum((gyro-gyroBias).^2));
  requestedSteps := max(h/0.02,rate*h/0.1);
  running := ES15HeldIntervalValid(h) and requestedSteps >= 0.0
    and requestedSteps <= maximumSubsteps;
  if running then
    substeps := max(1,integer(ceil(requestedSteps)));
    // Division rounding must not place a substep just beyond either limit.
    if h/substeps > 0.02 or rate*(h/substeps) > 0.1 then substeps := substeps+1; end if;
    running := substeps <= maximumSubsteps;
    if running then
      dt := h/substeps;
      densityValid := true;
      for channel in 1:12 loop
        densityValid := densityValid and density[channel] >= 0.0 and density[channel] <= 1e6;
      end for;
      for step in 1:substeps loop
        if running then
          (force,omega,middleRotation,proposedRotation,proposedPosition,proposedVelocity,nominalValid)
            := ES15NominalPrediction.Predict(nextRotation,nextPosition,nextVelocity,
              accel,gyro,accelBias,gyroBias,gravity,dt);
          (F,G) := ES15Dynamics.Matrices(middleRotation,force,omega);
          // The joint propagator below owns Phi*P*Phi'; compute it only once.
          (Phi,Q) := ES15TransitionNoise(F,G,
            if nominalValid > 0.5 then dt else 0.0,density);
          geometryValid := RGBDProperRotationValue(nextRotation) > 0.5
            and RGBDProperRotationValue(proposedRotation) > 0.5;
          for axis in 1:3 loop
            geometryValid := geometryValid and abs(proposedPosition[axis]) <= 1e6
              and abs(proposedVelocity[axis]) <= 1e6 and abs(accelBias[axis]) <= 2.0
              and abs(gyroBias[axis]) <= 0.3 and abs(gravity[axis]) <= 1e3
              and (SLAMExactRealEqual(referenceAvailable,0.0) or abs(referencePosition[axis]) <= 1e6);
          end for;
          geometryValid := geometryValid and (SLAMExactRealEqual(referenceAvailable,0.0)
            or RGBDProperRotationValue(referenceRotation) > 0.5);
          (jointAccepted,proposedCovariance,proposedCross,retainedReference)
            := SchmidtPredictCovariance(nextCovariance,nextCrossCovariance,referenceCovariance,
              Phi,Q,referenceAvailable,if nominalValid > 0.5 and geometryValid and densityValid then 1.0 else 0.0);
          // The first step preserves the original one-step diagnostics exactly.
          if step == 1 then
            transition := Phi; processCovariance := Q;
          else
            transition := Phi*transition;
            rawNoise := Phi*processCovariance*transpose(Phi)+Q;
            processCovariance := 0.5*(rawNoise+transpose(rawNoise));
          end if;
          running := jointAccepted > 0.5;
          if running then
            nextPosition := proposedPosition; nextVelocity := proposedVelocity; nextRotation := proposedRotation;
            nextCovariance := proposedCovariance; nextCrossCovariance := proposedCross;
          end if;
        end if;
      end for;
    end if;
    if running then
      accepted := 1.0;
    else
      nextPosition := position; nextVelocity := velocity; nextRotation := rotation;
      nextCovariance := covariance; nextCrossCovariance := crossCovariance;
    end if;
  end if;
end ES15PredictHeldInterval;

// Correlated reference lifecycle, composed with the existing ES15/Schmidt models.
// All numerical work is Modelica; the host only retains and copies returned state.
// Current errors: world dp,dv; right-local dtheta; body dba,dbg. Reference: dp,dtheta.
// This source is not yet compiler-admitted or integrated into the production node.
model SchmidtReferencePrediction
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
algorithm
  (accepted,nextCovariance,nextCrossCovariance,nextReferenceCovariance)
    := SchmidtPredictCovariance(covariance,crossCovariance,referenceCovariance,
      transition,processCovariance,referenceAvailable,predictionEnabled);
end SchmidtReferencePrediction;

// Pure capture counterpart of the unchanged equation model below.
// Keep the shared rotation gates, PSD checks and selection contractions identical.
pure function SchmidtCaptureReference
  input Real position[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real covariance[currentDimension,currentDimension];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real crossCovariance[currentDimension,referenceDimension];
  input Real referenceCovariance[referenceDimension,referenceDimension];
  input Real referenceAvailable = 0.0;
  input Real captureRequested = 0.0;
  input Real currentValid = 1.0;
  output Real accepted;
  output Real rejected;
  output Real nextReferenceAvailable;
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextCovariance[currentDimension,currentDimension];
  output Real nextCrossCovariance[currentDimension,referenceDimension];
  output Real nextReferenceCovariance[referenceDimension,referenceDimension];
protected
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  Real currentRotationValid; Real referenceRotationValid;
  Real selection[referenceDimension,currentDimension];
  Real proposedCross[currentDimension,referenceDimension];
  Real proposedReference[referenceDimension,referenceDimension];
  Real priorJoint[21,21];
  Real proposedJoint[21,21];
  Real currentCovarianceValid;
  Real priorJointValid;
  Real proposedJointValid;
  Real currentPositionChecks[3];
  Real referencePositionChecks[3];
algorithm
  currentRotationValid := RGBDProperRotationValue(rotation);
  referenceRotationValid := RGBDProperRotationValue(referenceRotation);
  // Reference nominal equals current nominal at capture, so both right-local
  // attitude errors share exactly the same body tangent; no guessed heading.
  selection := cat(1,cat(2,identity(3),zeros(3,12)),
    cat(2,zeros(3,6),identity(3),zeros(3,6)));
  proposedCross := covariance*transpose(selection);
  proposedReference := selection*proposedCross;
  priorJoint := cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint := cat(1,cat(2,covariance,proposedCross),
    cat(2,transpose(proposedCross),proposedReference));
  currentCovarianceValid := SLAMCovariancePSDCheck(covariance,1e-12);
  priorJointValid := SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid := SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:3 loop
    currentPositionChecks[i] := if noEvent(abs(position[i]) <= 1e6) then 0.0 else 1.0;
    referencePositionChecks[i] := if noEvent(abs(referencePosition[i]) <= 1e6) then 0.0 else 1.0;
  end for;
  accepted := if noEvent(SLAMExactRealEqual(captureRequested,1.0) and SLAMExactRealEqual(currentValid,1.0)
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentRotationValid > 0.5 and sum(currentPositionChecks) < 0.5
    and currentCovarianceValid > 0.5 and proposedJointValid > 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5
      and referenceRotationValid > 0.5 and sum(referencePositionChecks) < 0.5)))
    then 1.0 else 0.0;
  rejected := if noEvent(SLAMExactRealEqual(captureRequested,0.0) or accepted > 0.5) then 0.0 else 1.0;
  nextReferenceAvailable := if noEvent(accepted > 0.5) then 1.0 else referenceAvailable;
  nextReferencePosition := if noEvent(accepted > 0.5) then position else referencePosition;
  nextReferenceRotation := if noEvent(accepted > 0.5) then rotation else referenceRotation;
  nextCovariance := covariance;
  nextCrossCovariance := if noEvent(accepted > 0.5) then proposedCross else crossCovariance;
  nextReferenceCovariance := if noEvent(accepted > 0.5) then proposedReference else referenceCovariance;
end SchmidtCaptureReference;

model SchmidtReferenceCapture
  constant Integer currentDimension = 15;
  constant Integer referenceDimension = 6;
  input Real position[3] = zeros(3);
  input Real rotation[3,3] = identity(3);
  input Real covariance[currentDimension,currentDimension];
  input Real referencePosition[3] = zeros(3);
  input Real referenceRotation[3,3] = identity(3);
  input Real crossCovariance[currentDimension,referenceDimension];
  input Real referenceCovariance[referenceDimension,referenceDimension];
  input Real referenceAvailable = 0.0;
  input Real captureRequested = 0.0;
  input Real currentValid = 1.0;
  output Real accepted;
  output Real rejected;
  output Real nextReferenceAvailable;
  output Real nextReferencePosition[3];
  output Real nextReferenceRotation[3,3];
  output Real nextCovariance[currentDimension,currentDimension];
  output Real nextCrossCovariance[currentDimension,referenceDimension];
  output Real nextReferenceCovariance[referenceDimension,referenceDimension];
protected
  RGBDProperRotation currentRotationCheck(rotation=rotation);
  RGBDProperRotation referenceRotationCheck(rotation=referenceRotation);
  Real selection[referenceDimension,currentDimension];
  Real proposedCross[currentDimension,referenceDimension];
  Real proposedReference[referenceDimension,referenceDimension];
  Real priorJoint[21,21];
  Real proposedJoint[21,21];
  Real currentCovarianceValid;
  Real priorJointValid;
  Real proposedJointValid;
  Real currentPositionChecks[3];
  Real referencePositionChecks[3];
equation
  // Reference nominal equals current nominal at capture, so both right-local
  // attitude errors share exactly the same body tangent; no guessed heading.
  selection = cat(1,cat(2,identity(3),zeros(3,12)),
    cat(2,zeros(3,6),identity(3),zeros(3,6)));
  proposedCross = covariance*transpose(selection);
  proposedReference = selection*proposedCross;
  priorJoint = cat(1,cat(2,covariance,crossCovariance),
    cat(2,transpose(crossCovariance),referenceCovariance));
  proposedJoint = cat(1,cat(2,covariance,proposedCross),
    cat(2,transpose(proposedCross),proposedReference));
  currentCovarianceValid = SLAMCovariancePSDCheck(covariance,1e-12);
  priorJointValid = SLAMCovariancePSDCheck(priorJoint,1e-12);
  proposedJointValid = SLAMCovariancePSDCheck(proposedJoint,1e-12);
  for i in 1:3 loop
    currentPositionChecks[i] = if noEvent(abs(position[i]) <= 1e6) then 0.0 else 1.0;
    referencePositionChecks[i] = if noEvent(abs(referencePosition[i]) <= 1e6) then 0.0 else 1.0;
  end for;
  accepted = if noEvent(SLAMExactRealEqual(captureRequested,1.0) and SLAMExactRealEqual(currentValid,1.0)
    and (SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and currentRotationCheck.valid > 0.5 and sum(currentPositionChecks) < 0.5
    and currentCovarianceValid > 0.5 and proposedJointValid > 0.5
    and (SLAMExactRealEqual(referenceAvailable,0.0) or (priorJointValid > 0.5
      and referenceRotationCheck.valid > 0.5 and sum(referencePositionChecks) < 0.5)))
    then 1.0 else 0.0;
  rejected = if noEvent(SLAMExactRealEqual(captureRequested,0.0) or accepted > 0.5) then 0.0 else 1.0;
  nextReferenceAvailable = if noEvent(accepted > 0.5) then 1.0 else referenceAvailable;
  nextReferencePosition = if noEvent(accepted > 0.5) then position else referencePosition;
  nextReferenceRotation = if noEvent(accepted > 0.5) then rotation else referenceRotation;
  nextCovariance = covariance;
  nextCrossCovariance = if noEvent(accepted > 0.5) then proposedCross else crossCovariance;
  nextReferenceCovariance = if noEvent(accepted > 0.5) then proposedReference else referenceCovariance;
end SchmidtReferenceCapture;

// Predict a complete current/reference state using the actual ES15 transition.
model ES15SchmidtPrediction
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
  output Integer substeps "Numerical substeps within this unchanged held measurement";
algorithm
  (accepted,transition,processCovariance,nextPosition,nextVelocity,nextRotation,
    nextCovariance,nextCrossCovariance,substeps) := ES15PredictHeldInterval(
      position,velocity,rotation,accelBias,gyroBias,covariance,crossCovariance,
      referenceCovariance,referencePosition,referenceRotation,referenceAvailable,
      accel,gyro,gravity,h,density);
  nextAccelBias := accelBias;
  nextGyroBias := gyroBias;
  nextReferenceCovariance := referenceCovariance;
  nextReferencePosition := referencePosition;
  nextReferenceRotation := referenceRotation;
  nextReferenceAvailable := referenceAvailable;
end ES15SchmidtPrediction;

// Raw-image reuse policy: no image may participate in two visual updates.
// Epochs are exact nonnegative integer-valued Real IDs, <=2^53-1; -1 is the
// last-used sentinel. This gate caches no measurement or numerical result.
// Pure image-ledger eligibility counterpart of the unchanged equation model below.
pure function SchmidtImagePairEligibility
  input Real referenceAvailable = 0.0;
  input Real referenceUsed = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real lastUsedEpoch = -1.0;
  output Real valid;
  output Real eligible;
  output Real captureFresh;
algorithm
  valid := if noEvent((SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and (SLAMExactRealEqual(referenceUsed,0.0) or SLAMExactRealEqual(referenceUsed,1.0))
    and currentEpoch >= 0.0 and currentEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(currentEpoch,floor(currentEpoch))
    and lastUsedEpoch >= -1.0 and lastUsedEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(lastUsedEpoch,floor(lastUsedEpoch))
    and (SLAMExactRealEqual(referenceAvailable,0.0) and SLAMExactRealEqual(referenceUsed,0.0)
      or SLAMExactRealEqual(referenceAvailable,1.0) and referenceEpoch >= 0.0
        and referenceEpoch <= 9007199254740991.0 and SLAMExactRealEqual(referenceEpoch,floor(referenceEpoch))
        and (SLAMExactRealEqual(referenceUsed,0.0) and referenceEpoch > lastUsedEpoch
          or SLAMExactRealEqual(referenceUsed,1.0) and referenceEpoch <= lastUsedEpoch))) then 1.0 else 0.0;
  eligible := if noEvent(valid > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0)
    and SLAMExactRealEqual(referenceUsed,0.0) and currentEpoch > referenceEpoch) then 1.0 else 0.0;
  captureFresh := if noEvent(valid > 0.5 and currentEpoch > lastUsedEpoch
    and (SLAMExactRealEqual(referenceAvailable,0.0) or currentEpoch > referenceEpoch)) then 1.0 else 0.0;
end SchmidtImagePairEligibility;

model SchmidtImagePairGate
  input Real referenceAvailable = 0.0;
  input Real referenceUsed = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real lastUsedEpoch = -1.0;
  output Real valid;
  output Real eligible;
  output Real captureFresh;
equation
  valid = if noEvent((SLAMExactRealEqual(referenceAvailable,0.0) or SLAMExactRealEqual(referenceAvailable,1.0))
    and (SLAMExactRealEqual(referenceUsed,0.0) or SLAMExactRealEqual(referenceUsed,1.0))
    and currentEpoch >= 0.0 and currentEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(currentEpoch,floor(currentEpoch))
    and lastUsedEpoch >= -1.0 and lastUsedEpoch <= 9007199254740991.0
    and SLAMExactRealEqual(lastUsedEpoch,floor(lastUsedEpoch))
    and (SLAMExactRealEqual(referenceAvailable,0.0) and SLAMExactRealEqual(referenceUsed,0.0)
      or SLAMExactRealEqual(referenceAvailable,1.0) and referenceEpoch >= 0.0
        and referenceEpoch <= 9007199254740991.0 and SLAMExactRealEqual(referenceEpoch,floor(referenceEpoch))
        and (SLAMExactRealEqual(referenceUsed,0.0) and referenceEpoch > lastUsedEpoch
          or SLAMExactRealEqual(referenceUsed,1.0) and referenceEpoch <= lastUsedEpoch))) then 1.0 else 0.0;
  eligible = if noEvent(valid > 0.5 and SLAMExactRealEqual(referenceAvailable,1.0)
    and SLAMExactRealEqual(referenceUsed,0.0) and currentEpoch > referenceEpoch) then 1.0 else 0.0;
  captureFresh = if noEvent(valid > 0.5 and currentEpoch > lastUsedEpoch
    and (SLAMExactRealEqual(referenceAvailable,0.0) or currentEpoch > referenceEpoch)) then 1.0 else 0.0;
end SchmidtImagePairGate;

// One complete ordering transaction: IMU -> relative correction -> reference capture.
// Each rejected substep preserves its incoming state. A valid IMU prediction
// still advances when a visual observation or reference replacement is rejected.
// The host persists these outputs together; it never rebuilds covariance blocks.
model ES15SchmidtReferenceStep
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
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real measuredRotation[3,3] = identity(3);
  input Real measuredTranslation[3] = zeros(3);
  input Real relativeCovariance[6,6] = identity(6);
  input Real measurementEnabled = 0.0;
  input Real captureRequested = 0.0;
  input Real referenceEpoch = 0.0;
  input Real currentEpoch = 0.0;
  input Real referenceUsed = 0.0;
  input Real lastUsedEpoch = -1.0;
  output Real predictionAccepted;
  output Real observationAccepted;
  output Real observationRejected;
  output Real captureAccepted;
  output Real captureRejected;
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
  output Real nextReferenceEpoch;
  output Real nextReferenceUsed;
  output Real nextLastUsedEpoch;
  output Real imagePairEligible;
  output Real imageReuseRejected;
protected
  SchmidtImagePairGate imageGate(referenceAvailable=referenceAvailable,referenceUsed=referenceUsed,
    referenceEpoch=referenceEpoch,currentEpoch=currentEpoch,lastUsedEpoch=lastUsedEpoch);
  Real pairAttempted;
  Real usedEpochAfterAttempt;
  ES15SchmidtPrediction prediction(position=position,velocity=velocity,rotation=rotation,
    accelBias=accelBias,gyroBias=gyroBias,covariance=covariance,crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,referencePosition=referencePosition,
    referenceRotation=referenceRotation,referenceAvailable=referenceAvailable,
    accel=accel,gyro=gyro,gravity=gravity,h=h,density=density);
  SchmidtRelativePoseCorrection correction(position=prediction.nextPosition,
    velocity=prediction.nextVelocity,rotation=prediction.nextRotation,
    accelBias=accelBias,gyroBias=gyroBias,covariance=prediction.nextCovariance,
    crossCovariance=prediction.nextCrossCovariance,referenceCovariance=referenceCovariance,
    referencePosition=referencePosition,referenceRotation=referenceRotation,
    opticalToBody=opticalToBody,cameraOriginBody=cameraOriginBody,
    measuredRotation=measuredRotation,measuredTranslation=measuredTranslation,
    relativeCovariance=relativeCovariance,
    measurementEnabled=if noEvent(prediction.accepted > 0.5 and imageGate.eligible > 0.5)
      then measurementEnabled else 0.0);
  SchmidtReferenceCapture capture(position=correction.nextPosition,rotation=correction.nextRotation,
    covariance=correction.nextCovariance,crossCovariance=correction.nextCrossCovariance,
    referenceCovariance=correction.nextReferenceCovariance,
    referencePosition=referencePosition,referenceRotation=referenceRotation,
    referenceAvailable=referenceAvailable,captureRequested=captureRequested,
    currentValid=if noEvent(prediction.accepted > 0.5 and imageGate.captureFresh > 0.5
      and currentEpoch > usedEpochAfterAttempt) then 1.0 else 0.0);
equation
  // Consume an eligible evaluated pair even when its innovation is rejected.
  // This prevents conditioning on repeated trials of the same raw sensor noise.
  pairAttempted = if noEvent(prediction.accepted > 0.5 and imageGate.eligible > 0.5
    and SLAMExactRealEqual(measurementEnabled,1.0)) then 1.0 else 0.0;
  usedEpochAfterAttempt = if noEvent(pairAttempted > 0.5) then currentEpoch else lastUsedEpoch;
  imagePairEligible = imageGate.eligible;
  imageReuseRejected = if noEvent(prediction.accepted > 0.5 and SLAMExactRealEqual(measurementEnabled,1.0)
    and imageGate.eligible < 0.5) then 1.0 else 0.0;
  nextReferenceEpoch = if noEvent(capture.accepted > 0.5) then currentEpoch else referenceEpoch;
  nextReferenceUsed = if noEvent(capture.accepted > 0.5) then 0.0
    else if noEvent(pairAttempted > 0.5) then 1.0 else referenceUsed;
  nextLastUsedEpoch = usedEpochAfterAttempt;
  predictionAccepted = prediction.accepted;
  observationAccepted = correction.accepted;
  observationRejected = if noEvent(prediction.accepted > 0.5
    and not (SLAMExactRealEqual(measurementEnabled,0.0)) and correction.accepted < 0.5) then 1.0 else 0.0;
  captureAccepted = capture.accepted;
  captureRejected = capture.rejected;
  nextPosition = correction.nextPosition;
  nextVelocity = correction.nextVelocity;
  nextRotation = correction.nextRotation;
  nextAccelBias = correction.nextAccelBias;
  nextGyroBias = correction.nextGyroBias;
  nextCovariance = capture.nextCovariance;
  nextCrossCovariance = capture.nextCrossCovariance;
  nextReferenceCovariance = capture.nextReferenceCovariance;
  nextReferencePosition = capture.nextReferencePosition;
  nextReferenceRotation = capture.nextReferenceRotation;
  nextReferenceAvailable = capture.nextReferenceAvailable;
end ES15SchmidtReferenceStep;
