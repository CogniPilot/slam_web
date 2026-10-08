// Generated from CogniPilot/modelica_models cb132c87a9e00289bbac11642110976248734878; edit the canonical packages there.
// Conditional first-order uncertainty of the UNWEIGHTED point-to-point fit.
// Optical RDF perturbation: delta y = delta t - skew(R*p_ref)*delta theta.
// No correspondence changes, reference-pose uncertainty or cross-pair covariance
// are modeled. See docs/registration-uncertainty.md before filter composition.
function RGBDUncertaintySkew
  input Real v[3];
  output Real S[3,3];
algorithm
  S := {{0.0,-v[3],v[2]},{v[3],0.0,-v[1]},{-v[2],v[1],0.0}};
end RGBDUncertaintySkew;

function RGBDUncertaintyProper
  input Real R[3,3];
  output Boolean valid;
protected
  Real gram[3,3]; Real determinant;
algorithm
  valid := true;
  for a in 1:3 loop
    for b in 1:3 loop
      valid := valid and abs(R[a,b]) <= 1.000001;
    end for;
  end for;
  if valid then
    gram := transpose(R)*R;
    for a in 1:3 loop
      for b in 1:3 loop
        valid := valid and abs(gram[a,b]-(if a == b then 1.0 else 0.0)) <= 1e-6;
      end for;
    end for;
    determinant := R[1,1]*(R[2,2]*R[3,3]-R[2,3]*R[3,2])
      -R[1,2]*(R[2,1]*R[3,3]-R[2,3]*R[3,1])
      +R[1,3]*(R[2,1]*R[3,2]-R[2,2]*R[3,1]);
    valid := valid and abs(determinant-1.0) <= 1e-6;
  end if;
end RGBDUncertaintyProper;

// SPD solve with dimensionless diagonal equilibration, no damping/floor added
// to the matrix. A small or nonfinite pivot is a refusal, not invented noise.
function RGBDUncertaintyInverse6
  input Real A[6,6];
  input Real minimumPivot;
  output Real inverseA[6,6];
  output Boolean valid;
  output Real minimumScaledPivot;
protected
  Real scale[6]; Real L[6,6]; Real v; Real z[6]; Real x[6];
algorithm
  inverseA := zeros(6,6); L := zeros(6,6); scale := ones(6);
  minimumScaledPivot := 1.0; valid := true;
  for i in 1:6 loop
    valid := valid and A[i,i] > 0.0 and A[i,i] <= 1e100;
    scale[i] := sqrt(if A[i,i] > 0.0 and A[i,i] <= 1e100 then A[i,i] else 1.0);
    for j in 1:6 loop
      valid := valid and abs(A[i,j]) <= 1e100
        and abs(A[i,j]-A[j,i]) <= 1e-10*max(1.0,abs(A[i,j]));
    end for;
  end for;
  for i in 1:6 loop
    for j in 1:6 loop
      if j <= i then
        v := if valid then A[i,j]/scale[i]/scale[j] else 0.0;
        for k in 1:6 loop
          v := v-(if k < j then L[i,k]*L[j,k] else 0.0);
        end for;
        if j == i then
          minimumScaledPivot := min(minimumScaledPivot,v);
          valid := valid and v > minimumPivot and v <= 1e100;
          L[i,j] := sqrt(if valid then v else 1.0);
        else
          L[i,j] := if valid then v/L[j,j] else 0.0;
        end if;
      end if;
    end for;
  end for;
  for column in 1:6 loop
    z := zeros(6); x := zeros(6);
    for i in 1:6 loop
      v := if i == column then 1.0/scale[column] else 0.0;
      for k in 1:6 loop
        v := v-(if k < i then L[i,k]*z[k] else 0.0);
      end for;
      z[i] := if valid then v/L[i,i] else 0.0;
    end for;
    for index in 1:6 loop
      v := z[7-index];
      for k in 1:6 loop
        v := v-(if k > 7-index then L[k,7-index]*x[k] else 0.0);
      end for;
      x[7-index] := if valid then v/L[7-index,7-index] else 0.0;
    end for;
    for i in 1:6 loop
      inverseA[i,column] := if valid then x[i]/scale[i] else 0.0;
    end for;
  end for;
  inverseA := if valid then inverseA else zeros(6,6);
end RGBDUncertaintyInverse6;

function RGBDOpticalPointCovariance
  input Real p[3];
  input Real rgbFx; input Real rgbFy;
  input Real localizationSigma; input Real disparitySigma;
  input Real noiseReferenceFx; input Real baseline;
  input Real depthInflation;
  output Real covariance[3,3];
protected
  Real bearing[3]; Real depthSigma;
algorithm
  bearing := {p[1]/p[3],p[2]/p[3],1.0};
  // No reduction by interpolation neighbor count: correlated disparity bound.
  depthSigma := depthInflation*p[3]*p[3]*disparitySigma/noiseReferenceFx/baseline;
  for a in 1:3 loop
    for b in 1:3 loop
      covariance[a,b] := bearing[a]*bearing[b]*depthSigma*depthSigma;
    end for;
  end for;
  covariance[1,1] := covariance[1,1]+(p[3]*localizationSigma/rgbFx)^2;
  covariance[2,2] := covariance[2,2]+(p[3]*localizationSigma/rgbFy)^2;
end RGBDOpticalPointCovariance;

function RGBDRegistrationSandwich

  input Real referencePoint[:,:]; input Real currentPoint[:,:];
  input Real pairEnabled[:]; input Real activeCount; input Real registrationAccepted;
  input Real currentFromReference[3,3]; input Real translation[3];
  input Real referenceBodyRotation[3,3]; input Real opticalToBody[3,3];
  input Real cameraOriginBody[3];
  input Real referenceRgbFocal[2]; input Real currentRgbFocal[2];
  input Real referenceNoiseFx; input Real currentNoiseFx; input Real baseline;
  input Real localizationSigma; input Real disparitySigma; input Real depthInflation;
  input Real coordinateLimit; input Real minimumPivot;
  output Real valid; output Real rejectionReason;
  output Real validCount; output Real invalidCount;
  output Real relativeCovariance[6,6]; output Real observationCovariance[6,6];
  output Real normalMatrix[6,6]; output Real noiseMatrix[6,6];
  output Real observationJacobian[6,6]; output Real minimumScaledPivot;
protected
  Boolean configuration; Boolean pose; Boolean pointValid; Boolean hValid; Boolean cValid;
  Real q[3]; Real J[3,6]; Real Sigma[3,3]; Real Cref[3,3]; Real Ccur[3,3];
  Real Hinv[6,6]; Real unusedInverse[6,6]; Real unusedPivot;
  Real cameraRotation[3,3]; Real arm[3]; Real skewArm[3,3]; Real rotationBlock[3,3];
  Real candidateRelative[6,6]; Real candidateObservation[6,6];
algorithm
  valid := 0.0; validCount := 0.0; invalidCount := 0.0;
  normalMatrix := zeros(6,6); noiseMatrix := zeros(6,6);
  relativeCovariance := zeros(6,6); observationCovariance := zeros(6,6);
  observationJacobian := zeros(6,6); minimumScaledPivot := 0.0;
  configuration := activeCount >= 0.0 and activeCount <= size(pairEnabled,1)
    and floor(activeCount) == activeCount and size(referencePoint,1) == size(pairEnabled,1)
    and size(currentPoint,1) == size(pairEnabled,1) and size(referencePoint,2) == 3 and size(currentPoint,2) == 3
    and baseline > 0.0 and baseline <= 1.0 and localizationSigma > 0.0 and localizationSigma <= 10.0
    and disparitySigma > 0.0 and disparitySigma <= 10.0 and depthInflation >= 1.0 and depthInflation <= 100.0
    and referenceNoiseFx > 0.0 and referenceNoiseFx <= 1e6 and currentNoiseFx > 0.0 and currentNoiseFx <= 1e6
    and coordinateLimit > 0.0 and coordinateLimit <= 1e4 and minimumPivot > 0.0 and minimumPivot < 1.0;
  for k in 1:2 loop
    configuration := configuration and referenceRgbFocal[k] > 0.0 and referenceRgbFocal[k] <= 1e6
      and currentRgbFocal[k] > 0.0 and currentRgbFocal[k] <= 1e6;
  end for;
  pose := registrationAccepted == 1.0 and RGBDUncertaintyProper(currentFromReference)
    and RGBDUncertaintyProper(referenceBodyRotation) and RGBDUncertaintyProper(opticalToBody);
  for k in 1:3 loop
    pose := pose and abs(translation[k]) <= coordinateLimit and abs(cameraOriginBody[k]) <= coordinateLimit;
  end for;
  for i in 1:size(pairEnabled,1) loop
    pointValid := configuration and i <= activeCount and pairEnabled[i] == 1.0;
    for k in 1:3 loop
      pointValid := pointValid and abs(referencePoint[i,k]) <= coordinateLimit and abs(currentPoint[i,k]) <= coordinateLimit;
    end for;
    pointValid := pointValid and referencePoint[i,3] > 0.0 and currentPoint[i,3] > 0.0;
    invalidCount := invalidCount+(if i <= activeCount and pairEnabled[i] <> 0.0 and not pointValid then 1.0 else 0.0);
    validCount := validCount+(if pointValid then 1.0 else 0.0);
    if pointValid and pose then
      q := currentFromReference*referencePoint[i,:];
      J := zeros(3,6);
      J[:,1:3] := identity(3); J[:,4:6] := -RGBDUncertaintySkew(q);
      Cref := RGBDOpticalPointCovariance(referencePoint[i,:],referenceRgbFocal[1],referenceRgbFocal[2],
        localizationSigma,disparitySigma,referenceNoiseFx,baseline,depthInflation);
      Ccur := RGBDOpticalPointCovariance(currentPoint[i,:],currentRgbFocal[1],currentRgbFocal[2],
        localizationSigma,disparitySigma,currentNoiseFx,baseline,depthInflation);
      Sigma := Ccur+currentFromReference*Cref*transpose(currentFromReference);
      normalMatrix := normalMatrix+transpose(J)*J;
      noiseMatrix := noiseMatrix+transpose(J)*Sigma*J;
    end if;
  end for;
  (Hinv,hValid,minimumScaledPivot) := RGBDUncertaintyInverse6(normalMatrix,minimumPivot);
  candidateRelative := Hinv*noiseMatrix*transpose(Hinv);
  cameraRotation := if pose then referenceBodyRotation*opticalToBody*transpose(currentFromReference) else identity(3);
  arm := if pose then translation+transpose(opticalToBody)*cameraOriginBody else zeros(3);
  skewArm := RGBDUncertaintySkew(arm); rotationBlock := -cameraRotation*skewArm;
  for a in 1:3 loop
    for b in 1:3 loop
      observationJacobian[a,b] := -cameraRotation[a,b];
      observationJacobian[a,b+3] := rotationBlock[a,b];
      observationJacobian[a+3,b+3] := if pose then -opticalToBody[a,b] else 0.0;
    end for;
  end for;
  candidateObservation := observationJacobian*candidateRelative*transpose(observationJacobian);
  (unusedInverse,cValid,unusedPivot) := RGBDUncertaintyInverse6(candidateObservation,minimumPivot);
  rejectionReason := if not configuration then 1.0 else if not pose then 2.0 else if invalidCount > 0.0 then 3.0
    else if validCount < 3.0 then 4.0 else if not hValid then 5.0 else if not cValid then 6.0 else 0.0;
  valid := if rejectionReason == 0.0 then 1.0 else 0.0;
  relativeCovariance := if valid > 0.5 then candidateRelative else zeros(6,6);
  observationCovariance := if valid > 0.5 then candidateObservation else zeros(6,6);
end RGBDRegistrationSandwich;

model RGBDRegistrationUncertainty

  parameter Integer capacity = 350;
  parameter Real coordinateLimit = 100.0;
  parameter Real minimumPivot = 1e-10;
  parameter Real localizationSigma = 0.5;
  parameter Real disparitySigma = 0.1;
  parameter Real depthInflation = 1.0;
  input Real referencePoint[capacity,3] = zeros(capacity,3);
  input Real currentPoint[capacity,3] = zeros(capacity,3);
  input Real pairEnabled[capacity] = zeros(capacity);
  input Real activeCount = 0.0;
  input Real registrationAccepted = 0.0;
  input Real currentFromReference[3,3] = identity(3);
  input Real translation[3] = zeros(3);
  input Real referenceBodyRotation[3,3] = identity(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real referenceRgbFocal[2] = {116.4,116.4};
  input Real currentRgbFocal[2] = {116.4,116.4};
  input Real referenceNoiseFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real currentNoiseFx = 848.0/(2.0*tan(87.0*3.141592653589793/360.0));
  input Real baseline = 0.05;
  output Real valid; output Real rejectionReason; output Real validCount; output Real invalidCount;
  output Real relativeCovariance[6,6]; output Real observationCovariance[6,6];
  output Real normalMatrix[6,6]; output Real noiseMatrix[6,6];
  output Real observationJacobian[6,6]; output Real minimumScaledPivot;
equation
  (valid,rejectionReason,validCount,invalidCount,relativeCovariance,observationCovariance,
    normalMatrix,noiseMatrix,observationJacobian,minimumScaledPivot) = RGBDRegistrationSandwich(
    referencePoint,currentPoint,pairEnabled,activeCount,registrationAccepted,currentFromReference,translation,
    referenceBodyRotation,opticalToBody,cameraOriginBody,referenceRgbFocal,currentRgbFocal,
    referenceNoiseFx,currentNoiseFx,baseline,localizationSigma,disparitySigma,depthInflation,coordinateLimit,minimumPivot);
end RGBDRegistrationUncertainty;
