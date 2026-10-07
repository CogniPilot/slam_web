// Test-only independently authored raw inputs; never imported by application code.
package SchmidtCorrectionFunctionCases
  record Raw
    Integer scenario;
    Real position[3]; Real velocity[3]; Real rotation[3,3];
    Real accelBias[3]; Real gyroBias[3]; Real covariance[15,15];
    Real referencePosition[3]; Real referenceRotation[3,3];
    Real referenceCovariance[6,6]; Real crossCovariance[15,6];
    Real opticalToBody[3,3]; Real cameraOriginBody[3];
    Real measuredRotation[3,3]; Real measuredTranslation[3]; Real relativeCovariance[6,6];
    Real measurementEnabled; Real maximumNis; Real maximumAngularInnovation;
    Real q[4]; Real qr[4]; Real qb[4]; Real qm[4];
  end Raw;
  function Exp
    input Real vector[3]; output Real q[4];
  protected Real angle; Real scale;
  algorithm
    angle := sqrt(sum(vector.^2));
    scale := if angle == 0.0 then 0.5 else sin(angle/2.0)/angle;
    q := cat(1,{cos(angle/2.0)},scale*vector);
  end Exp;
  function Product
    input Real a[4]; input Real b[4]; output Real q[4];
  algorithm
    q := {a[1]*b[1]-a[2]*b[2]-a[3]*b[3]-a[4]*b[4],
      a[1]*b[2]+a[2]*b[1]+a[3]*b[4]-a[4]*b[3],
      a[1]*b[3]-a[2]*b[4]+a[3]*b[1]+a[4]*b[2],
      a[1]*b[4]+a[2]*b[3]-a[3]*b[2]+a[4]*b[1]};
  end Product;
  function Matrix
    input Real q[4]; output Real r[3,3];
  algorithm
    r := [1-2*(q[3]^2+q[4]^2),2*(q[2]*q[3]-q[1]*q[4]),2*(q[2]*q[4]+q[1]*q[3]);
      2*(q[2]*q[3]+q[1]*q[4]),1-2*(q[2]^2+q[4]^2),2*(q[3]*q[4]-q[1]*q[2]);
      2*(q[2]*q[4]-q[1]*q[3]),2*(q[3]*q[4]+q[1]*q[2]),1-2*(q[2]^2+q[3]^2)];
  end Matrix;
  function At
    input Real t; output Raw x;
  protected
    Real lower[21,21]; Real joint[21,21]; Real noiseLower[6,6];
    Real currentCamera[4]; Real relative[4]; Real predictedTranslation[3];
    Real direction[21];
  algorithm
    x.scenario := min(20,1+integer(t));
    x.position := {0.5+0.02*sin(t),-0.8,1.2}; x.velocity := {0.1,-0.2,0.3};
    x.accelBias := {0.02,-0.01,0.03}; x.gyroBias := {0.005,-0.002,0.001};
    x.referencePosition := {-0.8,0.4,1.6};
    x.q := Exp({0.35,-0.28,0.17+0.02*sin(t)});
    x.qr := Exp({-0.2,0.31,0.63}); x.qb := Exp({0.7,-0.5,1.1});
    x.cameraOriginBody := {0.23,-0.12,0.07};
    for i in 1:21 loop for j in 1:21 loop
      lower[i,j] := if j > i then 0.0 else if i == j then 0.1*(1.0+i/50.0)
        else 0.004*sin(i*(j+1.0));
    end for; end for;
    joint := lower*transpose(lower);
    for i in 1:6 loop for j in 1:6 loop
      noiseLower[i,j] := if j > i then 0.0 else if i == j then 0.03*(1.0+i/50.0)
        else 0.0012*sin(i*(j+1.0));
    end for; end for;
    x.relativeCovariance := noiseLower*transpose(noiseLower);
    x.measurementEnabled := 1.0; x.maximumNis := 22.46; x.maximumAngularInnovation := 0.35;
    x.rotation := Matrix(x.q); x.referenceRotation := Matrix(x.qr); x.opticalToBody := Matrix(x.qb);
    currentCamera := Product(x.q,x.qb);
    relative := Product({currentCamera[1],-currentCamera[2],-currentCamera[3],-currentCamera[4]},Product(x.qr,x.qb));
    predictedTranslation := transpose(Matrix(currentCamera))*(x.referencePosition+Matrix(x.qr)*x.cameraOriginBody-x.position-Matrix(x.q)*x.cameraOriginBody);
    x.qm := Product(Exp({0.04,-0.02,0.01}),relative);
    x.measuredTranslation := predictedTranslation+{0.06,-0.04,0.02};
    if x.scenario == 2 then
      x.position := zeros(3); x.velocity := zeros(3); x.referencePosition := zeros(3);
      x.accelBias := zeros(3); x.gyroBias := zeros(3); x.cameraOriginBody := zeros(3);
      x.q := {1.0,0.0,0.0,0.0}; x.qr := x.q; x.qb := x.q; x.qm := x.q;
      x.rotation := identity(3); x.referenceRotation := identity(3); x.opticalToBody := identity(3);
      joint := zeros(21,21); for i in 1:21 loop joint[i,i] := if i <= 15 then 0.01 else 0.02; end for;
      x.relativeCovariance := 0.04*identity(6); x.measuredTranslation := zeros(3);
    elseif x.scenario == 3 then
      x.measurementEnabled := 0.0; x.qm := zeros(4); x.measuredTranslation := fill(1e12,3);
      x.relativeCovariance := -identity(6);
    elseif x.scenario == 4 then x.measurementEnabled := 0.5;
    elseif x.scenario == 5 then x.measurementEnabled := 1.000000000000001;
    elseif x.scenario == 6 then x.measuredTranslation := {80.0,-30.0,20.0};
    elseif x.scenario == 7 then x.qm := Product(Exp({0.5,0.0,0.0}),relative);
    elseif x.scenario == 9 then joint[1,16] := 2.0; joint[16,1] := 2.0;
    elseif x.scenario == 10 then joint[16,16] := -0.1;
    elseif x.scenario == 11 then x.relativeCovariance := zeros(6,6);
    elseif x.scenario == 12 then x.relativeCovariance[1,2] := x.relativeCovariance[1,2]+0.1;
    elseif x.scenario == 13 then joint[1,2] := joint[1,2]+0.2;
    elseif x.scenario == 14 then x.accelBias := {3.0,0.0,0.0};
    elseif x.scenario == 15 then x.cameraOriginBody := {11.0,0.0,0.0};
    elseif x.scenario == 16 then x.gyroBias := {0.4,0.0,0.0};
    elseif x.scenario == 17 then x.measurementEnabled := -1.0;
    elseif x.scenario == 18 then x.qm := Product(Exp({1e-9,-2e-9,3e-9}),relative);
    elseif x.scenario == 19 then
      direction := {0.0,0.0,0.0,0.02,0.0,0.0,0.12,-0.1,0.08,0.005,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.1,0.07,-0.1};
      for i in 1:21 loop for j in 1:21 loop joint[i,j] := joint[i,j]+direction[i]*direction[j]; end for; end for;
    elseif x.scenario == 20 then
      for i in 1:3 loop
        joint[i,i] := joint[i,i]+40.0; joint[i+15,i+15] := joint[i+15,i+15]+40.0;
        joint[i,i+15] := joint[i,i+15]+40.0; joint[i+15,i] := joint[i+15,i]+40.0;
      end for;
    end if;
    x.measuredRotation := Matrix(x.qm);
    if x.scenario == 8 then x.measuredRotation := [-1.0,0.0,0.0;0.0,1.0,0.0;0.0,0.0,1.0]; end if;
    x.covariance := joint[1:15,1:15]; x.crossCovariance := joint[1:15,16:21]; x.referenceCovariance := joint[16:21,16:21];
  end At;
end SchmidtCorrectionFunctionCases;

function SchmidtInvalidPolicyChecks
  input SchmidtCorrectionFunctionCases.Raw x;
  output Boolean checks[6];
protected
  constant Integer spaceDimension=3; constant Integer errorDimension=15;
  constant Integer poseDimension=6; constant Integer augmentedDimension=21;
  Real accepted;
  Real nis;
  Real innovation[poseDimension];
  Real measurementJacobian[poseDimension,augmentedDimension];
  Real innovationCovariance[poseDimension,poseDimension];
  Real nextPosition[spaceDimension];
  Real nextVelocity[spaceDimension];
  Real nextRotation[spaceDimension,spaceDimension];
  Real nextAccelBias[spaceDimension];
  Real nextGyroBias[spaceDimension];
  Real nextCovariance[errorDimension,errorDimension];
  Real nextCrossCovariance[errorDimension,poseDimension];
  Real nextReferenceCovariance[poseDimension,poseDimension];
  Real maxNis; Real maxAngle;
algorithm
  for c in 1:6 loop
    maxNis := if c == 1 then 0.0 else if c == 2 then -1.0 else if c == 3 then 1000001.0 else 22.46;
    maxAngle := if c == 4 then 0.0 else if c == 5 then -1.0 else if c == 6 then 1.000001 else 0.35;
    (accepted,nis,innovation,measurementJacobian,innovationCovariance,nextPosition,nextVelocity,nextRotation,nextAccelBias,nextGyroBias,nextCovariance,nextCrossCovariance,nextReferenceCovariance) := SchmidtCorrectRelativePose(x.position,x.velocity,x.rotation,x.accelBias,x.gyroBias,x.covariance,x.referencePosition,x.referenceRotation,x.referenceCovariance,x.crossCovariance,x.opticalToBody,x.cameraOriginBody,x.measuredRotation,x.measuredTranslation,x.relativeCovariance,x.measurementEnabled,maxNis,maxAngle);
    checks[c] := accepted == 0.0 and max(abs(nextPosition-x.position)) == 0.0
      and max(abs(nextVelocity-x.velocity)) == 0.0 and max(abs(nextRotation-x.rotation)) == 0.0
      and max(abs(nextAccelBias-x.accelBias)) == 0.0 and max(abs(nextGyroBias-x.gyroBias)) == 0.0
      and max(abs(nextCovariance-x.covariance)) == 0.0 and max(abs(nextCrossCovariance-x.crossCovariance)) == 0.0
      and max(abs(nextReferenceCovariance-x.referenceCovariance)) == 0.0;
  end for;
end SchmidtInvalidPolicyChecks;

model SchmidtCorrectionFunctionParity
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer augmentedDimension = errorDimension+poseDimension;
  SchmidtCorrectionFunctionCases.Raw raw;
  output Boolean policyChecks[6];
  output Real solveActual[6,16]; output Real solveReference[6,16];
  output Real solveActualValid; output Real solveReferenceValid;
  Real solveB[6,16];
  output Real actualAccepted;
  output Real referenceAccepted;
  output Real actualNis;
  output Real referenceNis;
  output Real actualInnovation[poseDimension];
  output Real referenceInnovation[poseDimension];
  output Real actualMeasurementJacobian[poseDimension,augmentedDimension];
  output Real referenceMeasurementJacobian[poseDimension,augmentedDimension];
  output Real actualInnovationCovariance[poseDimension,poseDimension];
  output Real referenceInnovationCovariance[poseDimension,poseDimension];
  output Real actualNextPosition[spaceDimension];
  output Real referenceNextPosition[spaceDimension];
  output Real actualNextVelocity[spaceDimension];
  output Real referenceNextVelocity[spaceDimension];
  output Real actualNextRotation[spaceDimension,spaceDimension];
  output Real referenceNextRotation[spaceDimension,spaceDimension];
  output Real actualNextAccelBias[spaceDimension];
  output Real referenceNextAccelBias[spaceDimension];
  output Real actualNextGyroBias[spaceDimension];
  output Real referenceNextGyroBias[spaceDimension];
  output Real actualNextCovariance[errorDimension,errorDimension];
  output Real referenceNextCovariance[errorDimension,errorDimension];
  output Real actualNextCrossCovariance[errorDimension,poseDimension];
  output Real referenceNextCrossCovariance[errorDimension,poseDimension];
  output Real actualNextReferenceCovariance[poseDimension,poseDimension];
  output Real referenceNextReferenceCovariance[poseDimension,poseDimension];
protected
  ES15CorrectionSolve solveReferenceModel(A=raw.relativeCovariance,B=solveB);
  SchmidtRelativePoseCorrection reference(position=raw.position,velocity=raw.velocity,rotation=raw.rotation,accelBias=raw.accelBias,gyroBias=raw.gyroBias,covariance=raw.covariance,referencePosition=raw.referencePosition,referenceRotation=raw.referenceRotation,referenceCovariance=raw.referenceCovariance,crossCovariance=raw.crossCovariance,opticalToBody=raw.opticalToBody,cameraOriginBody=raw.cameraOriginBody,measuredRotation=raw.measuredRotation,measuredTranslation=raw.measuredTranslation,relativeCovariance=raw.relativeCovariance,measurementEnabled=raw.measurementEnabled);
equation
  raw = SchmidtCorrectionFunctionCases.At(time);
  policyChecks = SchmidtInvalidPolicyChecks(raw);
  for i in 1:6 loop for j in 1:16 loop solveB[i,j] = sin(i+2*j+time)+0.01*i*j; end for; end for;
  (solveActual,solveActualValid) = SchmidtCorrectionSolve(A=raw.relativeCovariance,B=solveB);
  solveReference = solveReferenceModel.X; solveReferenceValid = solveReferenceModel.valid;
  (actualAccepted,actualNis,actualInnovation,actualMeasurementJacobian,actualInnovationCovariance,actualNextPosition,actualNextVelocity,actualNextRotation,actualNextAccelBias,actualNextGyroBias,actualNextCovariance,actualNextCrossCovariance,actualNextReferenceCovariance) = SchmidtCorrectRelativePose(raw.position,raw.velocity,raw.rotation,raw.accelBias,raw.gyroBias,raw.covariance,raw.referencePosition,raw.referenceRotation,raw.referenceCovariance,raw.crossCovariance,raw.opticalToBody,raw.cameraOriginBody,raw.measuredRotation,raw.measuredTranslation,raw.relativeCovariance,raw.measurementEnabled,raw.maximumNis,raw.maximumAngularInnovation);
  referenceAccepted = reference.accepted;
  referenceNis = reference.nis;
  referenceInnovation = reference.innovation;
  referenceMeasurementJacobian = reference.measurementJacobian;
  referenceInnovationCovariance = reference.innovationCovariance;
  referenceNextPosition = reference.nextPosition;
  referenceNextVelocity = reference.nextVelocity;
  referenceNextRotation = reference.nextRotation;
  referenceNextAccelBias = reference.nextAccelBias;
  referenceNextGyroBias = reference.nextGyroBias;
  referenceNextCovariance = reference.nextCovariance;
  referenceNextCrossCovariance = reference.nextCrossCovariance;
  referenceNextReferenceCovariance = reference.nextReferenceCovariance;
end SchmidtCorrectionFunctionParity;

// Separate explicit function-only acceptance; original-model parity is not measured.
model SchmidtCorrectionFunctionOnly
  constant Integer spaceDimension = 3;
  constant Integer errorDimension = 15;
  constant Integer poseDimension = 2*spaceDimension;
  constant Integer augmentedDimension = errorDimension+poseDimension;
  SchmidtCorrectionFunctionCases.Raw raw;
  output Boolean policyChecks[6];
  output Real solveActual[6,16]; output Real solveReference[6,16];
  output Real solveActualValid; output Real solveReferenceValid;
  Real solveB[6,16];
  output Real actualAccepted;
  output Real actualNis;
  output Real actualInnovation[poseDimension];
  output Real actualMeasurementJacobian[poseDimension,augmentedDimension];
  output Real actualInnovationCovariance[poseDimension,poseDimension];
  output Real actualNextPosition[spaceDimension];
  output Real actualNextVelocity[spaceDimension];
  output Real actualNextRotation[spaceDimension,spaceDimension];
  output Real actualNextAccelBias[spaceDimension];
  output Real actualNextGyroBias[spaceDimension];
  output Real actualNextCovariance[errorDimension,errorDimension];
  output Real actualNextCrossCovariance[errorDimension,poseDimension];
  output Real actualNextReferenceCovariance[poseDimension,poseDimension];
protected
  ES15CorrectionSolve solveReferenceModel(A=raw.relativeCovariance,B=solveB);
equation
  raw = SchmidtCorrectionFunctionCases.At(time);
  policyChecks = SchmidtInvalidPolicyChecks(raw);
  for i in 1:6 loop for j in 1:16 loop solveB[i,j] = sin(i+2*j+time)+0.01*i*j; end for; end for;
  (solveActual,solveActualValid) = SchmidtCorrectionSolve(A=raw.relativeCovariance,B=solveB);
  solveReference = solveReferenceModel.X; solveReferenceValid = solveReferenceModel.valid;
  (actualAccepted,actualNis,actualInnovation,actualMeasurementJacobian,actualInnovationCovariance,actualNextPosition,actualNextVelocity,actualNextRotation,actualNextAccelBias,actualNextGyroBias,actualNextCovariance,actualNextCrossCovariance,actualNextReferenceCovariance) = SchmidtCorrectRelativePose(raw.position,raw.velocity,raw.rotation,raw.accelBias,raw.gyroBias,raw.covariance,raw.referencePosition,raw.referenceRotation,raw.referenceCovariance,raw.crossCovariance,raw.opticalToBody,raw.cameraOriginBody,raw.measuredRotation,raw.measuredTranslation,raw.relativeCovariance,raw.measurementEnabled,raw.maximumNis,raw.maximumAngularInnovation);
end SchmidtCorrectionFunctionOnly;
