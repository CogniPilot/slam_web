// A correlated, frozen reference pose is a Schmidt state, not pose truth.
// World-additive p/v; right-local body attitude; current state order p,v,theta,ba,bg.
// Registration maps reference optical points to current optical coordinates.
// Compile with RGBDRelativePose.mo, ES15PoseCorrection.mo and SPD6Solve.mo.
// These components are under numerical review; the production preset is unchanged.
// Sequential validation only: tolerance jitter never enters retained covariance.
// The function owns factor ordering instead of a cyclic equation-form factor graph.
function SLAMCovariancePSDCheck
  input Real covariance[:,:];
  input Real relativeTolerance;
  output Real valid;
protected
  Real scale;
  Real pivot;
  Real diagonalScale;
  Real diagonalSum;
  Real offDiagonalSum;
  Real lower[size(covariance,1),size(covariance,1)];
algorithm
  diagonalScale := 0.0;
  diagonalSum := 0.0;
  offDiagonalSum := 0.0;
  for i in 1:size(covariance,1) loop
    diagonalScale := diagonalScale+abs(covariance[i,i]);
  end for;
  scale := max(1.0,diagonalScale);
  lower := zeros(size(covariance,1),size(covariance,1));
  pivot := 0.0;
  valid := if size(covariance,1) == size(covariance,2) then 1.0 else 0.0;
  for i in 1:size(covariance,1) loop
    for j in 1:size(covariance,1) loop
      offDiagonalSum := 0.0;
      diagonalSum := 0.0;
      // Ordered finite accumulation; no array-valued comprehension temporary.
      for k in 1:size(covariance,1) loop
        offDiagonalSum := offDiagonalSum+(if k < j then lower[i,k]*lower[j,k] else 0.0);
        diagonalSum := diagonalSum+(if k < i then lower[i,k]^2 else 0.0);
      end for;
      if not (abs(covariance[i,j]) <= 1e12 and
          abs(covariance[i,j]-covariance[j,i]) <= relativeTolerance*scale) then
        valid := 0.0;
      end if;
      if j < i then
        lower[i,j] := (covariance[i,j]-offDiagonalSum)
          /max(lower[j,j],1e-150);
      elseif j == i then
        pivot := covariance[i,i]+relativeTolerance*scale
          -diagonalSum;
        if not (pivot > 0.0 and pivot <= 1e12) then valid := 0.0; end if;
        lower[i,j] := sqrt(if pivot > 0.0 then pivot else 1.0);
      end if;
    end for;
  end for;
end SLAMCovariancePSDCheck;

model SLAMCovariancePSD
  parameter Integer dimension = 21;
  parameter Real relativeTolerance = 1e-12;
  input Real covariance[dimension,dimension];
  output Real valid;
equation
  valid = SLAMCovariancePSDCheck(covariance,relativeTolerance);
end SLAMCovariancePSD;

// Signed wxyz coordinates of the existing rotation logarithm. The raw-normalized
// quaternion remains observable even when valid is zero; callers own its fallback.
function SLAMRotationCoordinates
  input Real rotation[3,3];
  output Real vector[3];
  output Real angle;
  output Real valid;
  output Real quaternion[4];
protected
  Real candidate[4];
  Real raw[4];
  Real norm;
  Real sine;
  Real scale;
algorithm
  candidate := {2.0*sqrt(max(0.0,1.0+rotation[1,1]+rotation[2,2]+rotation[3,3])),
    2.0*sqrt(max(0.0,1.0+rotation[1,1]-rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]+rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]-rotation[2,2]+rotation[3,3]))};
  raw := if noEvent(rotation[1,1]+rotation[2,2]+rotation[3,3] > 0.0) then
      {candidate[1]/4.0,(rotation[3,2]-rotation[2,3])/max(candidate[1],1e-12),
       (rotation[1,3]-rotation[3,1])/max(candidate[1],1e-12),
       (rotation[2,1]-rotation[1,2])/max(candidate[1],1e-12)}
    elseif noEvent(rotation[1,1] > rotation[2,2] and rotation[1,1] > rotation[3,3]) then
      {(rotation[3,2]-rotation[2,3])/max(candidate[2],1e-12),candidate[2]/4.0,
       (rotation[1,2]+rotation[2,1])/max(candidate[2],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[2],1e-12)}
    elseif noEvent(rotation[2,2] > rotation[3,3]) then
      {(rotation[1,3]-rotation[3,1])/max(candidate[3],1e-12),
       (rotation[1,2]+rotation[2,1])/max(candidate[3],1e-12),candidate[3]/4.0,
       (rotation[2,3]+rotation[3,2])/max(candidate[3],1e-12)}
    else {(rotation[2,1]-rotation[1,2])/max(candidate[4],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[4],1e-12),
       (rotation[2,3]+rotation[3,2])/max(candidate[4],1e-12),candidate[4]/4.0};
  norm := sqrt(sum(raw.^2));
  quaternion := (if noEvent(raw[1] < 0.0) then -1.0 else 1.0)*raw/max(norm,1e-12);
  sine := sqrt(sum(quaternion[i]^2 for i in 2:4));
  angle := 2.0*atan2(sine,quaternion[1]);
  scale := if noEvent(sine < 1e-8) then 2.0 else angle/max(sine,1e-12);
  valid := RGBDProperRotationValue(rotation);
  for i in 1:3 loop
    vector[i] := if noEvent(valid > 0.5) then scale*quaternion[i+1] else 0.0;
  end for;
end SLAMRotationCoordinates;

model SLAMRotationLog
  constant Integer spaceDimension = 3;
  constant Integer quaternionDimension = 4;
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  output Real vector[spaceDimension];
  output Real angle;
  output Real valid;
protected
  RGBDProperRotation rotationCheck(rotation=rotation);
  Real candidate[quaternionDimension];
  Real raw[quaternionDimension];
  Real quaternion[quaternionDimension];
  Real norm;
  Real sine;
  Real scale;
equation
  candidate = {2.0*sqrt(max(0.0,1.0+rotation[1,1]+rotation[2,2]+rotation[3,3])),
    2.0*sqrt(max(0.0,1.0+rotation[1,1]-rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]+rotation[2,2]-rotation[3,3])),
    2.0*sqrt(max(0.0,1.0-rotation[1,1]-rotation[2,2]+rotation[3,3]))};
  raw = if noEvent(rotation[1,1]+rotation[2,2]+rotation[3,3] > 0.0) then
      {candidate[1]/4.0,(rotation[3,2]-rotation[2,3])/max(candidate[1],1e-12),
       (rotation[1,3]-rotation[3,1])/max(candidate[1],1e-12),
       (rotation[2,1]-rotation[1,2])/max(candidate[1],1e-12)}
    elseif noEvent(rotation[1,1] > rotation[2,2] and rotation[1,1] > rotation[3,3]) then
      {(rotation[3,2]-rotation[2,3])/max(candidate[2],1e-12),candidate[2]/4.0,
       (rotation[1,2]+rotation[2,1])/max(candidate[2],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[2],1e-12)}
    elseif noEvent(rotation[2,2] > rotation[3,3]) then
      {(rotation[1,3]-rotation[3,1])/max(candidate[3],1e-12),
       (rotation[1,2]+rotation[2,1])/max(candidate[3],1e-12),candidate[3]/4.0,
       (rotation[2,3]+rotation[3,2])/max(candidate[3],1e-12)}
    else {(rotation[2,1]-rotation[1,2])/max(candidate[4],1e-12),
       (rotation[1,3]+rotation[3,1])/max(candidate[4],1e-12),
       (rotation[2,3]+rotation[3,2])/max(candidate[4],1e-12),candidate[4]/4.0};
  norm = sqrt(sum(raw.^2));
  quaternion = (if noEvent(raw[1] < 0.0) then -1.0 else 1.0)*raw/max(norm,1e-12);
  sine = sqrt(sum(quaternion[i]^2 for i in 2:quaternionDimension));
  angle = 2.0*atan2(sine,quaternion[1]);
  scale = if noEvent(sine < 1e-8) then 2.0 else angle/max(sine,1e-12);
  valid = rotationCheck.valid;
  for i in 1:spaceDimension loop
    vector[i] = if noEvent(valid > 0.5) then scale*quaternion[i+1] else 0.0;
  end for;
end SLAMRotationLog;

model SchmidtRelativePoseCorrection
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer augmentedDimension = errorDimension+poseDimension;
  parameter Real maximumNis = 22.46;
  parameter Real maximumAngularInnovation = 0.35;
  input Real position[spaceDimension] = zeros(spaceDimension);
  input Real velocity[spaceDimension] = zeros(spaceDimension);
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real accelBias[spaceDimension] = zeros(spaceDimension);
  input Real gyroBias[spaceDimension] = zeros(spaceDimension);
  input Real covariance[errorDimension,errorDimension] = identity(errorDimension);
  input Real referencePosition[spaceDimension] = zeros(spaceDimension);
  input Real referenceRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real referenceCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real crossCovariance[errorDimension,poseDimension] = zeros(errorDimension,poseDimension);
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real measuredRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real measuredTranslation[spaceDimension] = zeros(spaceDimension);
  // Covariance of independent translation / left-current-optical rotation errors.
  input Real relativeCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real measurementEnabled = 0.0;
  output Real accepted;
  output Real nis;
  output Real innovation[poseDimension];
  output Real measurementJacobian[poseDimension,augmentedDimension];
  output Real innovationCovariance[poseDimension,poseDimension];
  output Real nextPosition[spaceDimension];
  output Real nextVelocity[spaceDimension];
  output Real nextRotation[spaceDimension,spaceDimension];
  output Real nextAccelBias[spaceDimension];
  output Real nextGyroBias[spaceDimension];
  output Real nextCovariance[errorDimension,errorDimension];
  output Real nextCrossCovariance[errorDimension,poseDimension];
  output Real nextReferenceCovariance[poseDimension,poseDimension];
protected
  RGBDProperRotation currentCheck(rotation=rotation);
  RGBDProperRotation referenceCheck(rotation=referenceRotation);
  RGBDProperRotation extrinsicsCheck(rotation=opticalToBody);
  RGBDProperRotation measuredCheck(rotation=measuredRotation);
  Real currentCameraTranspose[spaceDimension,spaceDimension];
  Real displacementBody[spaceDimension];
  Real predictedRotation[spaceDimension,spaceDimension];
  Real predictedTranslation[spaceDimension];
  SLAMRotationLog logarithm(rotation=transpose(predictedRotation)*measuredRotation);
  Real skewDisplacement[spaceDimension,spaceDimension];
  Real skewOrigin[spaceDimension,spaceDimension];
  Real skewInnovation[spaceDimension,spaceDimension];
  Real inverseLeft[spaceDimension,spaceDimension];
  Real inverseRight[spaceDimension,spaceDimension];
  Real jacobianCoefficient;
  Real currentTranslationAngle[spaceDimension,spaceDimension];
  Real referenceTranslationAngle[spaceDimension,spaceDimension];
  Real currentRotationAngle[spaceDimension,spaceDimension];
  Real referenceRotationAngle[spaceDimension,spaceDimension];
  Real noiseMap[poseDimension,poseDimension];
  Real noiseRotation[spaceDimension,spaceDimension];
  Real noise[poseDimension,poseDimension];
  Real prior[augmentedDimension,augmentedDimension];
  // The component's default dimension is exactly21. Rebinding it to an equal
  // constant would introduce an unnecessary parameter-initialization owner.
  SLAMCovariancePSD priorCheck(covariance=prior);
  ES15CorrectionSolve noiseCheck(A=relativeCovariance,B=zeros(poseDimension,errorDimension+1));
  Real cross[augmentedDimension,poseDimension];
  Real rhs[poseDimension,errorDimension+1];
  ES15CorrectionSolve solve(A=innovationCovariance,B=rhs);
  Real gain[augmentedDimension,poseDimension];
  Real correction[errorDimension];
  Real residualMap[augmentedDimension,augmentedDimension];
  Real joseph[augmentedDimension,augmentedDimension];
  Real reset[augmentedDimension,augmentedDimension];
  Real resetCovariance[augmentedDimension,augmentedDimension];
  Real injectedRotation[spaceDimension,spaceDimension];
  Real increment[spaceDimension,spaceDimension];
  Real skewCorrection[spaceDimension,spaceDimension];
  Real correctionAngle;
  Real sineCoefficient;
  Real cosineCoefficient;
  Real resetCoefficient;
  Real skewCorrectionSquared[spaceDimension,spaceDimension];
  Real finiteChecks[augmentedDimension,augmentedDimension];
  Real geometryChecks[spaceDimension];
equation
  currentCameraTranspose = transpose(opticalToBody)*transpose(rotation);
  displacementBody = transpose(rotation)*(referencePosition-position+referenceRotation*cameraOriginBody);
  predictedRotation = currentCameraTranspose*referenceRotation*opticalToBody;
  predictedTranslation = transpose(opticalToBody)*(displacementBody-cameraOriginBody);
  innovation = cat(1,measuredTranslation-predictedTranslation,logarithm.vector);
  skewDisplacement = [0.0,-displacementBody[3],displacementBody[2];displacementBody[3],0.0,-displacementBody[1];-displacementBody[2],displacementBody[1],0.0];
  skewOrigin = [0.0,-cameraOriginBody[3],cameraOriginBody[2];cameraOriginBody[3],0.0,-cameraOriginBody[1];-cameraOriginBody[2],cameraOriginBody[1],0.0];
  skewInnovation = [0.0,-innovation[6],innovation[5];innovation[6],0.0,-innovation[4];-innovation[5],innovation[4],0.0];
  jacobianCoefficient = if noEvent(logarithm.angle < 1e-4) then
      1.0/12.0+logarithm.angle^2/720.0
    else (1.0-0.5*logarithm.angle*cos(0.5*logarithm.angle)/max(sin(0.5*logarithm.angle),1e-12))/max(logarithm.angle^2,1e-12);
  inverseLeft = identity(spaceDimension)-0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  inverseRight = identity(spaceDimension)+0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  currentTranslationAngle = transpose(opticalToBody)*skewDisplacement;
  referenceTranslationAngle = -currentCameraTranspose*referenceRotation*skewOrigin;
  currentRotationAngle = -inverseLeft*transpose(predictedRotation)*transpose(opticalToBody);
  referenceRotationAngle = inverseLeft*transpose(opticalToBody);
  noiseRotation = inverseRight*transpose(measuredRotation);
  // Explicit blocks keep every coordinate valid even during structural projection.
  // H = -d(innovation)/d(error); columns are p,v,theta,ba,bg,p_ref,theta_ref.
  measurementJacobian = cat(1,
    cat(2,-currentCameraTranspose,zeros(3,3),currentTranslationAngle,
      zeros(3,6),currentCameraTranspose,referenceTranslationAngle),
    cat(2,zeros(3,6),currentRotationAngle,zeros(3,9),referenceRotationAngle));
  noiseMap = cat(1,cat(2,identity(3),zeros(3,3)),
    cat(2,zeros(3,3),noiseRotation));
  prior = cat(1,cat(2,covariance,crossCovariance),cat(2,transpose(crossCovariance),referenceCovariance));
  cross = prior*transpose(measurementJacobian);
  noise = noiseMap*relativeCovariance*transpose(noiseMap);
  innovationCovariance = measurementJacobian*cross+noise;
  for i in 1:poseDimension loop
    for j in 1:errorDimension loop
      rhs[i,j] = cross[j,i];
    end for;
    rhs[i,errorDimension+1] = innovation[i];
  end for;
  // Schmidt gain: reference uncertainty enters S, but reference gain is zero.
  gain = cat(1,transpose(solve.X[:,1:errorDimension]),zeros(poseDimension,poseDimension));
  correction = gain[1:errorDimension,:]*innovation;
  nis = sum(innovation[i]*solve.X[i,errorDimension+1] for i in 1:poseDimension);
  residualMap = identity(augmentedDimension)-gain*measurementJacobian;
  joseph = residualMap*prior*transpose(residualMap)+gain*noise*transpose(gain);
  skewCorrection = [0.0,-correction[9],correction[8];correction[9],0.0,-correction[7];-correction[8],correction[7],0.0];
  correctionAngle = sqrt(sum(correction[i]^2 for i in 7:9));
  sineCoefficient = if noEvent(correctionAngle < 1e-7) then 1.0 else sin(correctionAngle)/max(correctionAngle,1e-12);
  cosineCoefficient = if noEvent(correctionAngle < 1e-7) then 0.5 else (1.0-cos(correctionAngle))/max(correctionAngle^2,1e-12);
  resetCoefficient = if noEvent(correctionAngle < 1e-6) then 1.0/6.0 else (correctionAngle-sin(correctionAngle))/max(correctionAngle^3,1e-18);
  skewCorrectionSquared = skewCorrection*skewCorrection;
  increment = identity(spaceDimension)+sineCoefficient*skewCorrection+cosineCoefficient*skewCorrectionSquared;
  injectedRotation = rotation*increment;
  // Only current right-local attitude is reset; frozen reference tangent is unchanged.
  reset = cat(1,
    cat(2,identity(6),zeros(6,15)),
    cat(2,zeros(3,6),identity(3)-cosineCoefficient*skewCorrection
      +resetCoefficient*skewCorrectionSquared,zeros(3,12)),
    cat(2,zeros(12,9),identity(12)));
  resetCovariance = reset*joseph*transpose(reset);
  for i in 1:augmentedDimension loop
    for j in 1:augmentedDimension loop
      finiteChecks[i,j] = if noEvent(abs(resetCovariance[i,j]) <= 1e12) then 0.0 else 1.0;
    end for;
  end for;
  for i in 1:spaceDimension loop
    geometryChecks[i] = if noEvent(abs(position[i]) <= 1e6 and abs(referencePosition[i]) <= 1e6
      and abs(velocity[i]) <= 1e6 and abs(cameraOriginBody[i]) <= 10.0
      and abs(measuredTranslation[i]) <= 1e6 and abs(correction[i]) <= 1e6
      and abs(correction[i+3]) <= 1e6
      and abs(accelBias[i]+correction[i+9]) <= 2.0
      and abs(gyroBias[i]+correction[i+12]) <= 0.3) then 0.0 else 1.0;
  end for;
  accepted = if noEvent(measurementEnabled >= 1.0 and measurementEnabled <= 1.0
    and maximumNis > 0.0 and maximumNis <= 1e6
    and maximumAngularInnovation > 0.0 and maximumAngularInnovation <= 1.0
    and currentCheck.valid > 0.5 and referenceCheck.valid > 0.5
    and extrinsicsCheck.valid > 0.5 and measuredCheck.valid > 0.5 and logarithm.valid > 0.5
    and priorCheck.valid > 0.5 and noiseCheck.valid > 0.5 and solve.valid > 0.5
    and nis >= 0.0 and nis <= maximumNis and logarithm.angle <= maximumAngularInnovation
    and sum(finiteChecks) < 0.5 and sum(geometryChecks) < 0.5) then 1.0 else 0.0;
  nextPosition = if noEvent(accepted > 0.5) then position+correction[1:3] else position;
  nextVelocity = if noEvent(accepted > 0.5) then velocity+correction[4:6] else velocity;
  nextRotation = if noEvent(accepted > 0.5) then injectedRotation else rotation;
  nextAccelBias = if noEvent(accepted > 0.5) then accelBias+correction[10:12] else accelBias;
  nextGyroBias = if noEvent(accepted > 0.5) then gyroBias+correction[13:15] else gyroBias;
  for i in 1:errorDimension loop
    for j in 1:errorDimension loop
      nextCovariance[i,j] = if noEvent(accepted > 0.5) then
        0.5*(resetCovariance[i,j]+resetCovariance[j,i]) else covariance[i,j];
    end for;
    for j in 1:poseDimension loop
      nextCrossCovariance[i,j] = if noEvent(accepted > 0.5) then
        resetCovariance[i,errorDimension+j] else crossCovariance[i,j];
    end for;
  end for;
  // Schmidt gain/reset leave this block and the retained reference pose unchanged.
  nextReferenceCovariance = referenceCovariance;
end SchmidtRelativePoseCorrection;

// Exact ES15CorrectionSolve (SPD6Solve with pivot_floor=0) algorithm form.
// All original row formulas and RHS solve association are retained.
function SchmidtCorrectionSolve
  input Real pivot_floor = 0.0;
  input Real symmetry_absolute = 1e-12;
  input Real symmetry_relative = 1e-8;
  input Real A[poseDimension,poseDimension] = identity(poseDimension);
  input Real B[poseDimension,rhsDimension] = fill(0.0,poseDimension,rhsDimension);
  output Real X[poseDimension,rhsDimension];
  output Real valid;
protected
  constant Integer poseDimension = 6;
  constant Integer rhsDimension = 16;
  Real L[poseDimension,poseDimension]; Real pivot[poseDimension]; Real Z[poseDimension,rhsDimension]; Real solution[poseDimension,rhsDimension];
  Real symmetryChecks[poseDimension,poseDimension]; Real symmetry_errors;
algorithm
  for i in 1:poseDimension loop
    for j in 1:poseDimension loop
      symmetryChecks[i,j] := if noEvent(abs(A[i,j]-A[j,i]) <=
        symmetry_absolute+symmetry_relative*abs(A[j,i])) then 0.0 else 1.0;
    end for;
  end for;
  symmetry_errors := sum(symmetryChecks[i,j] for i in 1:poseDimension, j in 1:poseDimension);
  pivot[1] := A[1,1]-(0.0);
  L[1,1] := sqrt(if noEvent(pivot[1] > pivot_floor) then pivot[1] else 1.0);
  L[1,2] := 0.0;
  L[1,3] := 0.0;
  L[1,4] := 0.0;
  L[1,5] := 0.0;
  L[1,6] := 0.0;
  L[2,1] := (A[2,1]-(0.0))/L[1,1];
  pivot[2] := A[2,2]-(L[2,1]*L[2,1]);
  L[2,2] := sqrt(if noEvent(pivot[2] > pivot_floor) then pivot[2] else 1.0);
  L[2,3] := 0.0;
  L[2,4] := 0.0;
  L[2,5] := 0.0;
  L[2,6] := 0.0;
  L[3,1] := (A[3,1]-(0.0))/L[1,1];
  L[3,2] := (A[3,2]-(L[3,1]*L[2,1]))/L[2,2];
  pivot[3] := A[3,3]-(L[3,1]*L[3,1]+L[3,2]*L[3,2]);
  L[3,3] := sqrt(if noEvent(pivot[3] > pivot_floor) then pivot[3] else 1.0);
  L[3,4] := 0.0;
  L[3,5] := 0.0;
  L[3,6] := 0.0;
  L[4,1] := (A[4,1]-(0.0))/L[1,1];
  L[4,2] := (A[4,2]-(L[4,1]*L[2,1]))/L[2,2];
  L[4,3] := (A[4,3]-(L[4,1]*L[3,1]+L[4,2]*L[3,2]))/L[3,3];
  pivot[4] := A[4,4]-(L[4,1]*L[4,1]+L[4,2]*L[4,2]+L[4,3]*L[4,3]);
  L[4,4] := sqrt(if noEvent(pivot[4] > pivot_floor) then pivot[4] else 1.0);
  L[4,5] := 0.0;
  L[4,6] := 0.0;
  L[5,1] := (A[5,1]-(0.0))/L[1,1];
  L[5,2] := (A[5,2]-(L[5,1]*L[2,1]))/L[2,2];
  L[5,3] := (A[5,3]-(L[5,1]*L[3,1]+L[5,2]*L[3,2]))/L[3,3];
  L[5,4] := (A[5,4]-(L[5,1]*L[4,1]+L[5,2]*L[4,2]+L[5,3]*L[4,3]))/L[4,4];
  pivot[5] := A[5,5]-(L[5,1]*L[5,1]+L[5,2]*L[5,2]+L[5,3]*L[5,3]+L[5,4]*L[5,4]);
  L[5,5] := sqrt(if noEvent(pivot[5] > pivot_floor) then pivot[5] else 1.0);
  L[5,6] := 0.0;
  L[6,1] := (A[6,1]-(0.0))/L[1,1];
  L[6,2] := (A[6,2]-(L[6,1]*L[2,1]))/L[2,2];
  L[6,3] := (A[6,3]-(L[6,1]*L[3,1]+L[6,2]*L[3,2]))/L[3,3];
  L[6,4] := (A[6,4]-(L[6,1]*L[4,1]+L[6,2]*L[4,2]+L[6,3]*L[4,3]))/L[4,4];
  L[6,5] := (A[6,5]-(L[6,1]*L[5,1]+L[6,2]*L[5,2]+L[6,3]*L[5,3]+L[6,4]*L[5,4]))/L[5,5];
  pivot[6] := A[6,6]-(L[6,1]*L[6,1]+L[6,2]*L[6,2]+L[6,3]*L[6,3]+L[6,4]*L[6,4]+L[6,5]*L[6,5]);
  L[6,6] := sqrt(if noEvent(pivot[6] > pivot_floor) then pivot[6] else 1.0);
  valid := if noEvent(symmetry_errors < 0.5 and
    pivot[1] > pivot_floor and pivot[2] > pivot_floor and pivot[3] > pivot_floor and pivot[4] > pivot_floor and pivot[5] > pivot_floor and pivot[6] > pivot_floor) then 1.0 else 0.0;
  for column in 1:rhsDimension loop
    Z[1,column] := (B[1,column]-(0.0))/L[1,1];
    Z[2,column] := (B[2,column]-(L[2,1]*Z[1,column]))/L[2,2];
    Z[3,column] := (B[3,column]-(L[3,1]*Z[1,column]+L[3,2]*Z[2,column]))/L[3,3];
    Z[4,column] := (B[4,column]-(L[4,1]*Z[1,column]+L[4,2]*Z[2,column]+L[4,3]*Z[3,column]))/L[4,4];
    Z[5,column] := (B[5,column]-(L[5,1]*Z[1,column]+L[5,2]*Z[2,column]+L[5,3]*Z[3,column]+L[5,4]*Z[4,column]))/L[5,5];
    Z[6,column] := (B[6,column]-(L[6,1]*Z[1,column]+L[6,2]*Z[2,column]+L[6,3]*Z[3,column]+L[6,4]*Z[4,column]+L[6,5]*Z[5,column]))/L[6,6];
    solution[6,column] := (Z[6,column]-(0.0))/L[6,6];
    solution[5,column] := (Z[5,column]-(L[6,5]*solution[6,column]))/L[5,5];
    solution[4,column] := (Z[4,column]-(L[5,4]*solution[5,column]+L[6,4]*solution[6,column]))/L[4,4];
    solution[3,column] := (Z[3,column]-(L[4,3]*solution[4,column]+L[5,3]*solution[5,column]+L[6,3]*solution[6,column]))/L[3,3];
    solution[2,column] := (Z[2,column]-(L[3,2]*solution[3,column]+L[4,2]*solution[4,column]+L[5,2]*solution[5,column]+L[6,2]*solution[6,column]))/L[2,2];
    solution[1,column] := (Z[1,column]-(L[2,1]*solution[2,column]+L[3,1]*solution[3,column]+L[4,1]*solution[4,column]+L[5,1]*solution[5,column]+L[6,1]*solution[6,column]))/L[1,1];
    for i in 1:poseDimension loop
      X[i,column] := if noEvent(valid > 0.5) then solution[i,column] else 0.0;
    end for;
  end for;
end SchmidtCorrectionSolve;

// Pure full15+6 Schmidt correction. Rejection preserves the complete input state;
// diagnostic arithmetic and all original gates remain observable on rejection.
function SchmidtCorrectRelativePose
  input Real position[spaceDimension] = zeros(spaceDimension);
  input Real velocity[spaceDimension] = zeros(spaceDimension);
  input Real rotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real accelBias[spaceDimension] = zeros(spaceDimension);
  input Real gyroBias[spaceDimension] = zeros(spaceDimension);
  input Real covariance[errorDimension,errorDimension] = identity(errorDimension);
  input Real referencePosition[spaceDimension] = zeros(spaceDimension);
  input Real referenceRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real referenceCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real crossCovariance[errorDimension,poseDimension] = zeros(errorDimension,poseDimension);
  input Real opticalToBody[spaceDimension,spaceDimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[spaceDimension] = {0.18,0.0,-0.04};
  input Real measuredRotation[spaceDimension,spaceDimension] = identity(spaceDimension);
  input Real measuredTranslation[spaceDimension] = zeros(spaceDimension);
  input Real relativeCovariance[poseDimension,poseDimension] = identity(poseDimension);
  input Real measurementEnabled = 0.0;
  input Real maximumNis = 22.46;
  input Real maximumAngularInnovation = 0.35;
  output Real accepted;
  output Real nis;
  output Real innovation[poseDimension];
  output Real measurementJacobian[poseDimension,augmentedDimension];
  output Real innovationCovariance[poseDimension,poseDimension];
  output Real nextPosition[spaceDimension];
  output Real nextVelocity[spaceDimension];
  output Real nextRotation[spaceDimension,spaceDimension];
  output Real nextAccelBias[spaceDimension];
  output Real nextGyroBias[spaceDimension];
  output Real nextCovariance[errorDimension,errorDimension];
  output Real nextCrossCovariance[errorDimension,poseDimension];
  output Real nextReferenceCovariance[poseDimension,poseDimension];
protected
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer augmentedDimension = errorDimension+poseDimension;
  Real currentCameraTranspose[spaceDimension,spaceDimension];
  Real displacementBody[spaceDimension];
  Real predictedRotation[spaceDimension,spaceDimension];
  Real predictedTranslation[spaceDimension];
  Real logarithmVector[spaceDimension]; Real logarithmAngle; Real logarithmValid; Real logarithmQuaternion[4];
  Real skewDisplacement[spaceDimension,spaceDimension];
  Real skewOrigin[spaceDimension,spaceDimension];
  Real skewInnovation[spaceDimension,spaceDimension];
  Real inverseLeft[spaceDimension,spaceDimension];
  Real inverseRight[spaceDimension,spaceDimension];
  Real jacobianCoefficient;
  Real currentTranslationAngle[spaceDimension,spaceDimension];
  Real referenceTranslationAngle[spaceDimension,spaceDimension];
  Real currentRotationAngle[spaceDimension,spaceDimension];
  Real referenceRotationAngle[spaceDimension,spaceDimension];
  Real noiseMap[poseDimension,poseDimension];
  Real noiseRotation[spaceDimension,spaceDimension];
  Real noise[poseDimension,poseDimension];
  Real prior[augmentedDimension,augmentedDimension];
  // The component's default dimension is exactly21. Rebinding it to an equal
  // constant would introduce an unnecessary parameter-initialization owner.
  Real priorCheckValid;
  Real noiseCheckValid; Real noiseSolution[poseDimension,errorDimension+1];
  Real cross[augmentedDimension,poseDimension];
  Real rhs[poseDimension,errorDimension+1];
  Real solveValid; Real solved[poseDimension,errorDimension+1];
  Real gain[augmentedDimension,poseDimension];
  Real correction[errorDimension];
  Real residualMap[augmentedDimension,augmentedDimension];
  Real joseph[augmentedDimension,augmentedDimension];
  Real reset[augmentedDimension,augmentedDimension];
  Real resetCovariance[augmentedDimension,augmentedDimension];
  Real injectedRotation[spaceDimension,spaceDimension];
  Real increment[spaceDimension,spaceDimension];
  Real skewCorrection[spaceDimension,spaceDimension];
  Real correctionAngle;
  Real sineCoefficient;
  Real cosineCoefficient;
  Real resetCoefficient;
  Real skewCorrectionSquared[spaceDimension,spaceDimension];
  Real finiteChecks[augmentedDimension,augmentedDimension];
  Real geometryChecks[spaceDimension];
  Real currentValid; Real referenceValid; Real extrinsicsValid; Real measuredValid;
algorithm
  currentValid := RGBDProperRotationValue(rotation);
  referenceValid := RGBDProperRotationValue(referenceRotation);
  extrinsicsValid := RGBDProperRotationValue(opticalToBody);
  measuredValid := RGBDProperRotationValue(measuredRotation);
  (noiseSolution,noiseCheckValid) := SchmidtCorrectionSolve(A=relativeCovariance,B=zeros(poseDimension,errorDimension+1));
  currentCameraTranspose := transpose(opticalToBody)*transpose(rotation);
  displacementBody := transpose(rotation)*(referencePosition-position+referenceRotation*cameraOriginBody);
  predictedRotation := currentCameraTranspose*referenceRotation*opticalToBody;
  predictedTranslation := transpose(opticalToBody)*(displacementBody-cameraOriginBody);
  (logarithmVector,logarithmAngle,logarithmValid,logarithmQuaternion) := SLAMRotationCoordinates(transpose(predictedRotation)*measuredRotation);
  innovation := cat(1,measuredTranslation-predictedTranslation,logarithmVector);
  skewDisplacement := [0.0,-displacementBody[3],displacementBody[2];displacementBody[3],0.0,-displacementBody[1];-displacementBody[2],displacementBody[1],0.0];
  skewOrigin := [0.0,-cameraOriginBody[3],cameraOriginBody[2];cameraOriginBody[3],0.0,-cameraOriginBody[1];-cameraOriginBody[2],cameraOriginBody[1],0.0];
  skewInnovation := [0.0,-innovation[6],innovation[5];innovation[6],0.0,-innovation[4];-innovation[5],innovation[4],0.0];
  jacobianCoefficient := if noEvent(logarithmAngle < 1e-4) then
      1.0/12.0+logarithmAngle^2/720.0
    else (1.0-0.5*logarithmAngle*cos(0.5*logarithmAngle)/max(sin(0.5*logarithmAngle),1e-12))/max(logarithmAngle^2,1e-12);
  inverseLeft := identity(spaceDimension)-0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  inverseRight := identity(spaceDimension)+0.5*skewInnovation+jacobianCoefficient*(skewInnovation*skewInnovation);
  currentTranslationAngle := transpose(opticalToBody)*skewDisplacement;
  referenceTranslationAngle := -currentCameraTranspose*referenceRotation*skewOrigin;
  currentRotationAngle := -inverseLeft*transpose(predictedRotation)*transpose(opticalToBody);
  referenceRotationAngle := inverseLeft*transpose(opticalToBody);
  noiseRotation := inverseRight*transpose(measuredRotation);
  // Explicit blocks keep every coordinate valid even during structural projection.
  // H := -d(innovation)/d(error); columns are p,v,theta,ba,bg,p_ref,theta_ref.
  measurementJacobian := cat(1,
    cat(2,-currentCameraTranspose,zeros(3,3),currentTranslationAngle,
      zeros(3,6),currentCameraTranspose,referenceTranslationAngle),
    cat(2,zeros(3,6),currentRotationAngle,zeros(3,9),referenceRotationAngle));
  noiseMap := cat(1,cat(2,identity(3),zeros(3,3)),
    cat(2,zeros(3,3),noiseRotation));
  prior := cat(1,cat(2,covariance,crossCovariance),cat(2,transpose(crossCovariance),referenceCovariance));
  priorCheckValid := SLAMCovariancePSDCheck(prior,1e-12);
  cross := prior*transpose(measurementJacobian);
  noise := noiseMap*relativeCovariance*transpose(noiseMap);
  innovationCovariance := measurementJacobian*cross+noise;
  for i in 1:poseDimension loop
    for j in 1:errorDimension loop
      rhs[i,j] := cross[j,i];
    end for;
    rhs[i,errorDimension+1] := innovation[i];
  end for;
  (solved,solveValid) := SchmidtCorrectionSolve(A=innovationCovariance,B=rhs);
  // Schmidt gain: reference uncertainty enters S, but reference gain is zero.
  gain := cat(1,transpose(solved[:,1:errorDimension]),zeros(poseDimension,poseDimension));
  correction := gain[1:errorDimension,:]*innovation;
  nis := sum(innovation[i]*solved[i,errorDimension+1] for i in 1:poseDimension);
  residualMap := identity(augmentedDimension)-gain*measurementJacobian;
  joseph := residualMap*prior*transpose(residualMap)+gain*noise*transpose(gain);
  skewCorrection := [0.0,-correction[9],correction[8];correction[9],0.0,-correction[7];-correction[8],correction[7],0.0];
  correctionAngle := sqrt(sum(correction[i]^2 for i in 7:9));
  sineCoefficient := if noEvent(correctionAngle < 1e-7) then 1.0 else sin(correctionAngle)/max(correctionAngle,1e-12);
  cosineCoefficient := if noEvent(correctionAngle < 1e-7) then 0.5 else (1.0-cos(correctionAngle))/max(correctionAngle^2,1e-12);
  resetCoefficient := if noEvent(correctionAngle < 1e-6) then 1.0/6.0 else (correctionAngle-sin(correctionAngle))/max(correctionAngle^3,1e-18);
  skewCorrectionSquared := skewCorrection*skewCorrection;
  increment := identity(spaceDimension)+sineCoefficient*skewCorrection+cosineCoefficient*skewCorrectionSquared;
  injectedRotation := rotation*increment;
  // Only current right-local attitude is reset; frozen reference tangent is unchanged.
  reset := cat(1,
    cat(2,identity(6),zeros(6,15)),
    cat(2,zeros(3,6),identity(3)-cosineCoefficient*skewCorrection
      +resetCoefficient*skewCorrectionSquared,zeros(3,12)),
    cat(2,zeros(12,9),identity(12)));
  resetCovariance := reset*joseph*transpose(reset);
  for i in 1:augmentedDimension loop
    for j in 1:augmentedDimension loop
      finiteChecks[i,j] := if noEvent(abs(resetCovariance[i,j]) <= 1e12) then 0.0 else 1.0;
    end for;
  end for;
  for i in 1:spaceDimension loop
    geometryChecks[i] := if noEvent(abs(position[i]) <= 1e6 and abs(referencePosition[i]) <= 1e6
      and abs(velocity[i]) <= 1e6 and abs(cameraOriginBody[i]) <= 10.0
      and abs(measuredTranslation[i]) <= 1e6 and abs(correction[i]) <= 1e6
      and abs(correction[i+3]) <= 1e6
      and abs(accelBias[i]+correction[i+9]) <= 2.0
      and abs(gyroBias[i]+correction[i+12]) <= 0.3) then 0.0 else 1.0;
  end for;
  accepted := if noEvent(measurementEnabled >= 1.0 and measurementEnabled <= 1.0
    and maximumNis > 0.0 and maximumNis <= 1e6
    and maximumAngularInnovation > 0.0 and maximumAngularInnovation <= 1.0
    and currentValid > 0.5 and referenceValid > 0.5
    and extrinsicsValid > 0.5 and measuredValid > 0.5 and logarithmValid > 0.5
    and priorCheckValid > 0.5 and noiseCheckValid > 0.5 and solveValid > 0.5
    and nis >= 0.0 and nis <= maximumNis and logarithmAngle <= maximumAngularInnovation
    and sum(finiteChecks) < 0.5 and sum(geometryChecks) < 0.5) then 1.0 else 0.0;
  nextPosition := if noEvent(accepted > 0.5) then position+correction[1:3] else position;
  nextVelocity := if noEvent(accepted > 0.5) then velocity+correction[4:6] else velocity;
  nextRotation := if noEvent(accepted > 0.5) then injectedRotation else rotation;
  nextAccelBias := if noEvent(accepted > 0.5) then accelBias+correction[10:12] else accelBias;
  nextGyroBias := if noEvent(accepted > 0.5) then gyroBias+correction[13:15] else gyroBias;
  for i in 1:errorDimension loop
    for j in 1:errorDimension loop
      nextCovariance[i,j] := if noEvent(accepted > 0.5) then
        0.5*(resetCovariance[i,j]+resetCovariance[j,i]) else covariance[i,j];
    end for;
    for j in 1:poseDimension loop
      nextCrossCovariance[i,j] := if noEvent(accepted > 0.5) then
        resetCovariance[i,errorDimension+j] else crossCovariance[i,j];
    end for;
  end for;
  // Schmidt gain/reset leave this block and the retained reference pose unchanged.
  nextReferenceCovariance := referenceCovariance;
end SchmidtCorrectRelativePose;
