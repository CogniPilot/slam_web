// Full350 dynamic function/equation-model differential reference. The original
// equation models remain independent; this file changes inputs, not their math.
package RGBDLandmarkFunctionTests
  constant Integer capacity = 350;
  constant Integer caseCount = 42;
  function Inputs
    input Integer scenario; input Real clock;
    output Real points[capacity,3]; output Real mask[capacity];
    output Real count; output Real accepted; output Real rotation[3,3];
    output Real position[3]; output Real camera[3,3]; output Real origin[3];
  protected
    Real infinity; Real poison;
  algorithm
    infinity := exp(1000.0+clock); poison := sin(infinity);
    for i in 1:capacity loop points[i,:] := {0.001*i,0.002*i,2+0.003*i}; end for;
    mask := fill(1.0,capacity); count := capacity; accepted := 1;
    rotation := [0,-1,0;1,0,0;0,0,1]; position := {2,3,4};
    camera := [0,0,1;-1,0,0;0,-1,0]; origin := {0.18,0,-0.04};
    if scenario == 2 or scenario == 3 or scenario == 41 then
      mask := zeros(capacity);
      for i in 1:capacity loop
        if i == 1 or i == 173 or i == capacity then mask[i] := 1;
        else points[i,:] := {poison,infinity,-infinity}; end if;
      end for;
    end if;
    if scenario == 3 then count := 349;
    elseif scenario == 4 then count := 0;
    elseif scenario == 5 then count := 2.5;
    elseif scenario == 6 then count := -1;
    elseif scenario == 7 then count := 351;
    elseif scenario == 8 then mask[capacity] := 0.5;
    elseif scenario == 9 then mask[capacity] := -1;
    elseif scenario == 10 then mask[capacity] := 2;
    elseif scenario == 11 then mask[capacity] := 0; points[capacity,:] := fill(poison,3);
    elseif scenario == 12 then points[capacity,3] := 0;
    elseif scenario == 13 then points[capacity,3] := -1;
    elseif scenario == 14 then points[capacity,1] := 1e6+1;
    elseif scenario == 15 then accepted := 0;
    elseif scenario == 16 then accepted := 0.5;
    elseif scenario == 17 then accepted := 2;
    elseif scenario == 18 then rotation := diagonal({-1,1,1});
    elseif scenario == 19 then rotation := [1,0.01,0;0,1,0;0,0,1];
    elseif scenario == 20 then rotation[1,1] := 1e101;
    elseif scenario == 21 then camera := diagonal({-1,1,1});
    elseif scenario == 22 then position[1] := 1e6+1;
    elseif scenario == 23 then origin[1] := 1e6+1;
    elseif scenario == 24 then points[capacity,3] := 1e6;
    elseif scenario == 25 then
      rotation := identity(3); camera := identity(3); position := zeros(3); origin := zeros(3);
      points[capacity,:] := {1e6,-1e6,1e6};
    elseif scenario == 26 then rotation[1,1] := poison;
    elseif scenario == 27 then rotation := diagonal({1+2e-7,1,1});
    elseif scenario == 28 then rotation := diagonal({1+8e-7,1,1});
    elseif scenario == 30 then count := 1;
    elseif scenario == 31 then mask[capacity] := -0.0; points[capacity,:] := {infinity,poison,-infinity};
    elseif scenario == 32 then points[capacity,1] := poison;
    elseif scenario == 33 then points[capacity,2] := infinity;
    elseif scenario == 34 then mask[capacity] := poison;
    elseif scenario == 35 then accepted := poison;
    elseif scenario == 36 then position[3] := poison;
    elseif scenario == 37 then origin[2] := poison;
    elseif scenario == 38 then count := poison;
    elseif scenario == 39 then count := infinity;
    elseif scenario == 40 then camera[3,3] := poison;
    elseif scenario == 41 then rotation := [0,1,0;0,0,1;1,0,0];
    elseif scenario == 42 then mask := zeros(capacity); points := fill(poison,capacity,3);
    end if;
  end Inputs;

  function ExactMatrix
    input Real a[:,:]; input Real b[size(a,1),size(a,2)]; output Boolean equal;
  algorithm
    equal := true;
    for i in 1:size(a,1) loop
      for j in 1:size(a,2) loop equal := equal and a[i,j] == b[i,j]; end for;
    end for;
  end ExactMatrix;

  function ExactVector
    input Real a[:]; input Real b[size(a,1)]; output Boolean equal;
  algorithm
    equal := true;
    for i in 1:size(a,1) loop equal := equal and a[i] == b[i]; end for;
  end ExactVector;

  function Independent
    input Integer scenario; input Real points[capacity,3];
    input Real world[capacity,3]; input Real mask[capacity];
    input Real count; input Real invalid; input Real configuration; input Real pose;
    output Boolean checks[5];
  protected
    Real wantedCount; Real wantedInvalid; Boolean wantedConfiguration; Boolean wantedPose;
    Real expected[3];
  algorithm
    wantedConfiguration := not (scenario == 5 or scenario == 6 or scenario == 7 or scenario == 38 or scenario == 39);
    wantedPose := wantedConfiguration and not ((scenario >= 15 and scenario <= 23)
      or scenario == 26 or scenario == 28 or (scenario >= 35 and scenario <= 37) or scenario == 40);
    wantedCount := if not wantedPose then 0 else if scenario == 2 or scenario == 41 then 3
      else if scenario == 3 then 2 else if scenario == 4 or scenario == 42 then 0
      else if scenario == 30 then 1 else if (scenario >= 8 and scenario <= 14) or scenario == 24
        or (scenario >= 31 and scenario <= 34) then 349 else 350;
    // Configuration-invalid optical points are counted even when pose is off.
    wantedInvalid := if scenario == 5 then 2 else if scenario == 7 or scenario == 39 then 350
      else if (scenario >= 8 and scenario <= 10) or (scenario >= 12 and scenario <= 14)
        or (scenario >= 32 and scenario <= 34) then 1 else 0;
    checks[1] := count == wantedCount and invalid == wantedInvalid;
    checks[2] := configuration == (if wantedConfiguration then 1 else 0) and pose == (if wantedPose then 1 else 0);
    checks[3] := true; checks[4] := true; checks[5] := true;
    for i in 1:capacity loop
      // Canonical disabled outputs, including opaque NaN/Inf input padding.
      if mask[i] == 0 then
        for k in 1:3 loop checks[3] := checks[3] and world[i,k] == 0; end for;
      else
        for k in 1:3 loop checks[3] := checks[3] and abs(world[i,k]) <= 1e6; end for;
      end if;
      if scenario == 1 or scenario == 2 or scenario == 3 or scenario == 29 or scenario == 41 then
        if mask[i] == 1 then
          // Hand-derived RDF->FLU then body->world; independent of matrix product.
          expected := if scenario == 41 then {2-points[i,1],3-0.04-points[i,2],4+0.18+points[i,3]}
            else {2+points[i,1],3+0.18+points[i,3],4-0.04-points[i,2]};
          for k in 1:3 loop checks[4] := checks[4] and abs(world[i,k]-expected[k]) < 2e-14; end for;
        end if;
      end if;
    end for;
    if scenario == 25 then checks[5] := ExactVector(world[capacity,:],{1e6,-1e6,1e6}) and mask[capacity] == 1;
    elseif scenario == 24 then checks[5] := mask[capacity] == 0 and invalid == 0;
    elseif scenario == 2 or scenario == 41 then checks[5] := mask[capacity] == 1 and mask[173] == 1;
    elseif scenario == 3 then checks[5] := mask[capacity] == 0 and mask[173] == 1;
    end if;
  end Independent;

  function IndependentLimit
    input Integer scenario; input Real coordinateLimit; input Real inputMask[capacity]; input Real activeCount;
    input Real world[capacity,3]; input Real mask[capacity];
    input Real count; input Real invalid; input Real configuration; input Real pose;
    output Boolean checks[5];
  protected
    Real wantedInvalid; Boolean wantedConfiguration;
  algorithm
    // Every fixture point exceeds limit1 in Z (also the exact-boundary case25).
    // Other tested limits are invalid configurations. None can publish a point.
    wantedInvalid := 0;
    for i in 1:capacity loop
      if i <= activeCount and not (inputMask[i] >= 0 and inputMask[i] <= 0) then
        wantedInvalid := wantedInvalid+1;
      end if;
    end for;
    wantedConfiguration := coordinateLimit == 1 and not (scenario == 5 or scenario == 6
      or scenario == 7 or scenario == 38 or scenario == 39);
    checks[1] := count == 0 and invalid == wantedInvalid;
    checks[2] := configuration == (if wantedConfiguration then 1 else 0)
      and pose == (if coordinateLimit == 1 and scenario == 25 then 1 else 0);
    checks[3] := ExactMatrix(world,zeros(capacity,3));
    checks[4] := ExactVector(mask,zeros(capacity));
    checks[5] := mask[capacity] == 0 and world[capacity,3] == 0;
  end IndependentLimit;
end RGBDLandmarkFunctionTests;

model RGBDLandmarkFunctionAcceptance
  parameter Real coordinateLimit = 1e6;
  output Integer scenario;
  output Boolean checks[12];
protected
  constant Integer n = RGBDLandmarkFunctionTests.capacity;
  Real points[n,3]; Real mask[n]; Real count; Real accepted;
  Real rotation[3,3]; Real position[3]; Real camera[3,3]; Real origin[3];
  Real world[n,3]; Real projected[n]; Real validCount; Real invalidCount; Real configValid; Real poseValid;
  RGBDLandmarkProjection oracle(coordinateLimit=coordinateLimit,opticalPoint=points,enabled=mask,activeCount=count,poseAccepted=accepted,
    bodyRotation=rotation,bodyPosition=position,opticalToBody=camera,cameraOriginBody=origin);
  RGBDLandmarkRotationCheck rotationOracle(rotation=rotation);
  RGBDLandmarkRotationCheck cameraOracle(rotation=camera);
equation
  scenario = integer(floor(time*64))+1;
  (points,mask,count,accepted,rotation,position,camera,origin) = RGBDLandmarkFunctionTests.Inputs(scenario,time);
  (world,projected,validCount,invalidCount,configValid,poseValid) =
    RGBDProjectLandmarks(points,mask,count,accepted,rotation,position,camera,origin,coordinateLimit);
  checks[1] = RGBDLandmarkFunctionTests.ExactMatrix(world,oracle.worldPoint);
  checks[2] = RGBDLandmarkFunctionTests.ExactVector(projected,oracle.landmarkEnabled);
  checks[3] = validCount == oracle.validCount and invalidCount == oracle.invalidCount;
  checks[4] = configValid == oracle.configurationValid and poseValid == oracle.poseValid;
  checks[5] = RGBDLandmarkRotationValid(rotation) == rotationOracle.valid;
  checks[6] = RGBDLandmarkRotationValid(camera) == cameraOracle.valid;
  checks[7:11] = if coordinateLimit == 1e6 then
    RGBDLandmarkFunctionTests.Independent(scenario,points,world,projected,validCount,invalidCount,configValid,poseValid)
    else RGBDLandmarkFunctionTests.IndependentLimit(scenario,coordinateLimit,mask,count,world,projected,validCount,invalidCount,configValid,poseValid);
  checks[12] = if scenario == 27 then RGBDLandmarkRotationValid(rotation) == 1
    else if scenario == 28 then RGBDLandmarkRotationValid(rotation) == 0 else true;
end RGBDLandmarkFunctionAcceptance;

model RGBDLandmarkZeroLimitAcceptance
  extends RGBDLandmarkFunctionAcceptance(coordinateLimit=0);
end RGBDLandmarkZeroLimitAcceptance;
model RGBDLandmarkNegativeLimitAcceptance
  extends RGBDLandmarkFunctionAcceptance(coordinateLimit=-1);
end RGBDLandmarkNegativeLimitAcceptance;
model RGBDLandmarkLargeLimitAcceptance
  extends RGBDLandmarkFunctionAcceptance(coordinateLimit=1e6+1);
end RGBDLandmarkLargeLimitAcceptance;
model RGBDLandmarkSmallLimitAcceptance
  extends RGBDLandmarkFunctionAcceptance(coordinateLimit=1);
end RGBDLandmarkSmallLimitAcceptance;
