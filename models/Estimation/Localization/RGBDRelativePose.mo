// Generated from CogniPilot/modelica_models cb132c87a9e00289bbac11642110976248734878; edit the canonical packages there.
// Finite proper rotation gate shared by models and held-IMU functions.
function RGBDProperRotationValue
  input Real rotation[3,3] = identity(3);
  output Real valid;
protected
  constant Integer dimension = 3;
  constant Real tolerance = 1e-6;
  Real gram[dimension,dimension];
  Real checks[dimension,dimension];
  Real determinant;
algorithm
  gram := transpose(rotation)*rotation;
  determinant := rotation[1,1]*(rotation[2,2]*rotation[3,3]-rotation[2,3]*rotation[3,2])
    - rotation[1,2]*(rotation[2,1]*rotation[3,3]-rotation[2,3]*rotation[3,1])
    + rotation[1,3]*(rotation[2,1]*rotation[3,2]-rotation[2,2]*rotation[3,1]);
  for i in 1:dimension loop
    for j in 1:dimension loop
      checks[i,j] := if abs(rotation[i,j]) <= 1.0+tolerance
        and abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= tolerance then 0.0 else 1.0;
    end for;
  end for;
  valid := if sum(checks) < 0.5 and abs(determinant-1.0) <= tolerance then 1.0 else 0.0;
end RGBDProperRotationValue;

model RGBDProperRotation

  constant Integer dimension = 3;
  input Real rotation[dimension,dimension] = identity(dimension);
  constant Real tolerance = 1e-6;
  output Real valid;
equation
  valid = RGBDProperRotationValue(rotation);
end RGBDProperRotation;

// Convert accepted camera-frame registration to a map-frame BODY observation.
// The reference pose is the retained estimator/keyframe pose, never truth.
// Registration convention: currentPoint = currentFromReference * referencePoint
// + currentFromReferenceTranslation. Both point clouds use optical RDF axes.
// Camera extrinsics map optical coordinates into body FLU coordinates.
// This component composes a measurement; it does not estimate covariance,
// persist keyframes, reject dynamic objects, or implement loop closure.
model RGBDRelativePose

  constant Integer dimension = 3;
  input Real referenceBodyRotation[dimension,dimension] = identity(dimension);
  input Real referenceBodyPosition[dimension] = zeros(dimension);
  input Real currentFromReference[dimension,dimension] = identity(dimension);
  input Real currentFromReferenceTranslation[dimension] = zeros(dimension);
  input Real opticalToBody[dimension,dimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[dimension] = {0.18,0.0,-0.04};
  input Real registrationAccepted = 0.0;
  output Real valid;
  output Real observedBodyRotation[dimension,dimension];
  output Real observedBodyPosition[dimension];
protected
  parameter Real coordinateLimit = 1e6;
  RGBDProperRotation referenceCheck(rotation=referenceBodyRotation);
  RGBDProperRotation registrationCheck(rotation=currentFromReference);
  RGBDProperRotation extrinsicsCheck(rotation=opticalToBody);
  Real positionChecks[dimension];
  Real referenceCameraRotation[dimension,dimension];
  Real referenceCameraPosition[dimension];
  Real currentCameraRotation[dimension,dimension];
  Real currentCameraPosition[dimension];
  Real proposedBodyRotation[dimension,dimension];
  Real proposedBodyPosition[dimension];
equation
  referenceCameraRotation = referenceBodyRotation*opticalToBody;
  referenceCameraPosition = referenceBodyPosition+referenceBodyRotation*cameraOriginBody;
  currentCameraRotation = referenceCameraRotation*transpose(currentFromReference);
  currentCameraPosition = referenceCameraPosition-currentCameraRotation*currentFromReferenceTranslation;
  proposedBodyRotation = currentCameraRotation*transpose(opticalToBody);
  proposedBodyPosition = currentCameraPosition-proposedBodyRotation*cameraOriginBody;
  for i in 1:dimension loop
    positionChecks[i] = if noEvent(abs(referenceBodyPosition[i]) <= coordinateLimit
      and abs(currentFromReferenceTranslation[i]) <= coordinateLimit
      and abs(cameraOriginBody[i]) <= coordinateLimit
      and abs(proposedBodyPosition[i]) <= coordinateLimit) then 0.0 else 1.0;
  end for;
  valid = if noEvent(registrationAccepted >= 1.0 and registrationAccepted <= 1.0
    and referenceCheck.valid > 0.5 and registrationCheck.valid > 0.5
    and extrinsicsCheck.valid > 0.5 and sum(positionChecks) < 0.5) then 1.0 else 0.0;
  observedBodyRotation = if noEvent(valid > 0.5) then proposedBodyRotation else identity(dimension);
  observedBodyPosition = if noEvent(valid > 0.5) then proposedBodyPosition else zeros(dimension);
end RGBDRelativePose;

// Ordered callable equivalent of the unchanged equation model above.
// This preserves its optical reference->current transform and covariance chart.
function RGBDRelativeBodyPose

  input Real referenceBodyRotation[3,3] = identity(3);
  input Real referenceBodyPosition[3] = zeros(3);
  input Real currentFromReference[3,3] = identity(3);
  input Real currentFromReferenceTranslation[3] = zeros(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real registrationAccepted = 0.0;
  output Real valid;
  output Real observedBodyRotation[3,3];
  output Real observedBodyPosition[3];
protected
  constant Real coordinateLimit = 1e6;
  Real referenceCameraRotation[3,3]; Real referenceCameraPosition[3];
  Real currentCameraRotation[3,3]; Real currentCameraPosition[3];
  Real proposedBodyRotation[3,3]; Real proposedBodyPosition[3];
  Real positionChecks;
algorithm
  referenceCameraRotation := referenceBodyRotation*opticalToBody;
  referenceCameraPosition := referenceBodyPosition+referenceBodyRotation*cameraOriginBody;
  currentCameraRotation := referenceCameraRotation*transpose(currentFromReference);
  currentCameraPosition := referenceCameraPosition-currentCameraRotation*currentFromReferenceTranslation;
  proposedBodyRotation := currentCameraRotation*transpose(opticalToBody);
  proposedBodyPosition := currentCameraPosition-proposedBodyRotation*cameraOriginBody;
  positionChecks := 0.0;
  for i in 1:3 loop
    if not (abs(referenceBodyPosition[i]) <= coordinateLimit
      and abs(currentFromReferenceTranslation[i]) <= coordinateLimit
      and abs(cameraOriginBody[i]) <= coordinateLimit
      and abs(proposedBodyPosition[i]) <= coordinateLimit) then
      positionChecks := positionChecks+1.0;
    end if;
  end for;
  valid := if registrationAccepted >= 1.0 and registrationAccepted <= 1.0
    and RGBDProperRotationValue(referenceBodyRotation) > 0.5
    and RGBDProperRotationValue(currentFromReference) > 0.5
    and RGBDProperRotationValue(opticalToBody) > 0.5 and positionChecks < 0.5 then 1.0 else 0.0;
  observedBodyRotation := if valid > 0.5 then proposedBodyRotation else identity(3);
  observedBodyPosition := if valid > 0.5 then proposedBodyPosition else zeros(3);
end RGBDRelativeBodyPose;
