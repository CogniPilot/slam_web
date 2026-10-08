// Generated from CogniPilot/modelica_models cb132c87a9e00289bbac11642110976248734878; edit the canonical packages there.
// Finite proper rotation gate. Invalid entries never enter matrix arithmetic.
model RGBDLandmarkRotationCheck
  constant Integer dimension = 3;
  constant Real tolerance = 1e-6;
  input Real rotation[dimension,dimension] = identity(dimension);
  output Real valid;
protected
  Real safeRotation[dimension,dimension];
  Real entryChecks[dimension,dimension];
  Real gram[dimension,dimension];
  Real gramChecks[dimension,dimension];
  Real determinant;
equation
  for i in 1:dimension loop
    for j in 1:dimension loop
      entryChecks[i,j] = if noEvent(abs(rotation[i,j]) <= 1.0+tolerance) then 0.0 else 1.0;
      safeRotation[i,j] = if noEvent(entryChecks[i,j] < 0.5) then rotation[i,j] else 0.0;
      gramChecks[i,j] = if noEvent(abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= tolerance) then 0.0 else 1.0;
    end for;
  end for;
  gram = transpose(safeRotation)*safeRotation;
  determinant = safeRotation[1,1]*(safeRotation[2,2]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,2])
    -safeRotation[1,2]*(safeRotation[2,1]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,1])
    +safeRotation[1,3]*(safeRotation[2,1]*safeRotation[3,2]-safeRotation[2,2]*safeRotation[3,1]);
  valid = if noEvent(sum(entryChecks)+sum(gramChecks) < 0.5 and abs(determinant-1.0) <= tolerance) then 1.0 else 0.0;
end RGBDLandmarkRotationCheck;

// Candidate coordinates only: no map persistence, pruning or SLAM lifecycle.
// Points are already calibrated optical RDF (right/down/forward). The supplied
// estimated body pose maps body FLU into world ENU; there is no truth input.
model RGBDLandmarkProjection

  constant Integer featureCapacity = 350;
  constant Integer dimension = 3;
  parameter Real coordinateLimit = 1e6;
  input Real opticalPoint[featureCapacity,dimension];
  input Real enabled[featureCapacity];
  input Real activeCount = 0.0;
  input Real poseAccepted = 0.0;
  input Real bodyRotation[dimension,dimension] = identity(dimension);
  input Real bodyPosition[dimension] = zeros(dimension);
  input Real opticalToBody[dimension,dimension] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[dimension] = {0.18,0.0,-0.04};
  output Real worldPoint[featureCapacity,dimension];
  output Real landmarkEnabled[featureCapacity];
  output Real validCount;
  output Real invalidCount;
  output Real configurationValid;
  output Real poseValid;
protected
  RGBDLandmarkRotationCheck bodyCheck(rotation=bodyRotation);
  RGBDLandmarkRotationCheck cameraCheck(rotation=opticalToBody);
  Real poseChecks[dimension];
  Real pointChecks[featureCapacity,dimension];
  Real pointValid[featureCapacity];
  Real invalidChecks[featureCapacity];
  Real safeOptical[featureCapacity,dimension];
  Real safeBodyRotation[dimension,dimension];
  Real safeOpticalToBody[dimension,dimension];
  Real safeBodyPosition[dimension];
  Real safeCameraOrigin[dimension];
  Real cameraInBody[featureCapacity,dimension];
  Real proposedWorld[featureCapacity,dimension];
  Real outputChecks[featureCapacity,dimension];
equation
  configurationValid = if noEvent(activeCount >= 0.0 and activeCount <= featureCapacity
    and floor(activeCount) <= activeCount and floor(activeCount) >= activeCount
    and coordinateLimit > 0.0 and coordinateLimit <= 1e6) then 1.0 else 0.0;
  for k in 1:dimension loop
    poseChecks[k] = if noEvent(abs(bodyPosition[k]) <= coordinateLimit
      and abs(cameraOriginBody[k]) <= coordinateLimit) then 0.0 else 1.0;
  end for;
  poseValid = if noEvent(configurationValid > 0.5 and poseAccepted >= 1.0 and poseAccepted <= 1.0
    and bodyCheck.valid > 0.5 and cameraCheck.valid > 0.5 and sum(poseChecks) < 0.5) then 1.0 else 0.0;
  safeBodyRotation = if noEvent(poseValid > 0.5) then bodyRotation else identity(dimension);
  safeOpticalToBody = if noEvent(poseValid > 0.5) then opticalToBody else identity(dimension);
  safeBodyPosition = if noEvent(poseValid > 0.5) then bodyPosition else zeros(dimension);
  safeCameraOrigin = if noEvent(poseValid > 0.5) then cameraOriginBody else zeros(dimension);
  for i in 1:featureCapacity loop
    for k in 1:dimension loop
      pointChecks[i,k] = if noEvent(abs(opticalPoint[i,k]) <= coordinateLimit) then 0.0 else 1.0;
      safeOptical[i,k] = if noEvent(poseValid > 0.5 and pointValid[i] > 0.5) then opticalPoint[i,k] else 0.0;
      outputChecks[i,k] = if noEvent(abs(proposedWorld[i,k]) <= coordinateLimit) then 0.0 else 1.0;
      worldPoint[i,k] = if noEvent(landmarkEnabled[i] > 0.5) then proposedWorld[i,k] else 0.0;
    end for;
    pointValid[i] = if noEvent(configurationValid > 0.5 and i <= activeCount
      and enabled[i] >= 1.0 and enabled[i] <= 1.0 and sum(pointChecks[i,:]) < 0.5
      and opticalPoint[i,3] > 0.0) then 1.0 else 0.0;
    cameraInBody[i,:] = safeOpticalToBody*safeOptical[i,:]+safeCameraOrigin;
    proposedWorld[i,:] = safeBodyRotation*cameraInBody[i,:]+safeBodyPosition;
    landmarkEnabled[i] = if noEvent(poseValid > 0.5 and pointValid[i] > 0.5
      and sum(outputChecks[i,:]) < 0.5) then 1.0 else 0.0;
    invalidChecks[i] = if noEvent(i <= activeCount and not (enabled[i] >= 0.0 and enabled[i] <= 0.0)
      and pointValid[i] < 0.5) then 1.0 else 0.0;
  end for;
  validCount = sum(landmarkEnabled);
  invalidCount = sum(invalidChecks);
end RGBDLandmarkProjection;

// Pure ordered equivalent of the equation rotation gate above. Invalid entries
// are replaced before Gram/determinant arithmetic; its tolerance is unchanged.
function RGBDLandmarkRotationValid
  input Real rotation[3,3];
  output Real valid;
protected
  constant Real tolerance = 1e-6;
  Real safeRotation[3,3]; Real gram[3,3]; Real determinant;
  Real entryCount; Real gramCount;
algorithm
  safeRotation := zeros(3,3); entryCount := 0.0; gramCount := 0.0;
  for i in 1:3 loop
    for j in 1:3 loop
      if abs(rotation[i,j]) <= 1.0+tolerance then
        safeRotation[i,j] := rotation[i,j];
      else
        entryCount := entryCount+1.0;
      end if;
    end for;
  end for;
  gram := transpose(safeRotation)*safeRotation;
  for i in 1:3 loop
    for j in 1:3 loop
      if not (abs(gram[i,j]-(if i == j then 1.0 else 0.0)) <= tolerance) then
        gramCount := gramCount+1.0;
      end if;
    end for;
  end for;
  determinant := safeRotation[1,1]*(safeRotation[2,2]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,2])
    -safeRotation[1,2]*(safeRotation[2,1]*safeRotation[3,3]-safeRotation[2,3]*safeRotation[3,1])
    +safeRotation[1,3]*(safeRotation[2,1]*safeRotation[3,2]-safeRotation[2,2]*safeRotation[3,1]);
  valid := if entryCount+gramCount < 0.5 and abs(determinant-1.0) <= tolerance then 1.0 else 0.0;
end RGBDLandmarkRotationValid;

// Source-owned reusable projection; the unchanged equation model is its oracle.
// Counts and masks retain the model's exact Real-domain checks. Disabled or
// unavailable point payloads never enter transforms. World-output overflow is
// excluded from validCount but is not an optical-input invalidCount event.
function RGBDProjectLandmarks

  input Real opticalPoint[:,3];
  input Real enabled[size(opticalPoint,1)];
  input Real activeCount = 0.0;
  input Real poseAccepted = 0.0;
  input Real bodyRotation[3,3] = identity(3);
  input Real bodyPosition[3] = zeros(3);
  input Real opticalToBody[3,3] = [0.0,0.0,1.0;-1.0,0.0,0.0;0.0,-1.0,0.0];
  input Real cameraOriginBody[3] = {0.18,0.0,-0.04};
  input Real coordinateLimit = 1e6;
  output Real worldPoint[size(opticalPoint,1),3];
  output Real landmarkEnabled[size(opticalPoint,1)];
  output Real validCount;
  output Real invalidCount;
  output Real configurationValid;
  output Real poseValid;
protected
  Real bodyValid; Real cameraValid; Real poseChecks;
  Real pointChecks; Real pointValid; Real outputChecks;
  Real cameraInBody[3]; Real proposedWorld[3];
algorithm
  worldPoint := zeros(size(opticalPoint,1),3);
  landmarkEnabled := zeros(size(opticalPoint,1)); validCount := 0.0; invalidCount := 0.0;
  configurationValid := if activeCount >= 0.0 and activeCount <= size(opticalPoint,1)
    and floor(activeCount) <= activeCount and floor(activeCount) >= activeCount
    and coordinateLimit > 0.0 and coordinateLimit <= 1e6 then 1.0 else 0.0;
  bodyValid := RGBDLandmarkRotationValid(bodyRotation);
  cameraValid := RGBDLandmarkRotationValid(opticalToBody);
  poseChecks := 0.0;
  for k in 1:3 loop
    if not (abs(bodyPosition[k]) <= coordinateLimit and abs(cameraOriginBody[k]) <= coordinateLimit) then
      poseChecks := poseChecks+1.0;
    end if;
  end for;
  poseValid := if configurationValid > 0.5 and poseAccepted >= 1.0 and poseAccepted <= 1.0
    and bodyValid > 0.5 and cameraValid > 0.5 and poseChecks < 0.5 then 1.0 else 0.0;
  pointChecks := 0.0; pointValid := 0.0; outputChecks := 0.0;
  cameraInBody := zeros(3); proposedWorld := zeros(3);
  for i in 1:size(opticalPoint,1) loop
    pointChecks := 0.0;
    for k in 1:3 loop
      if not (abs(opticalPoint[i,k]) <= coordinateLimit) then pointChecks := pointChecks+1.0; end if;
    end for;
    pointValid := if configurationValid > 0.5 and i <= activeCount
      and enabled[i] >= 1.0 and enabled[i] <= 1.0 and pointChecks < 0.5
      and opticalPoint[i,3] > 0.0 then 1.0 else 0.0;
    if i <= activeCount and not (enabled[i] >= 0.0 and enabled[i] <= 0.0)
      and pointValid < 0.5 then invalidCount := invalidCount+1.0; end if;
    if poseValid > 0.5 and pointValid > 0.5 then
      cameraInBody := opticalToBody*opticalPoint[i,:]+cameraOriginBody;
      proposedWorld := bodyRotation*cameraInBody+bodyPosition;
      outputChecks := 0.0;
      for k in 1:3 loop
        if not (abs(proposedWorld[k]) <= coordinateLimit) then outputChecks := outputChecks+1.0; end if;
      end for;
      if outputChecks < 0.5 then
        worldPoint[i,:] := proposedWorld; landmarkEnabled[i] := 1.0; validCount := validCount+1.0;
      end if;
    end if;
  end for;
end RGBDProjectLandmarks;
