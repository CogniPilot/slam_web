model RotationCoordinatesFunction
  input Real rotation[3,3];
  output Real vector[3];
  output Real angle;
  output Real valid;
  output Real quaternion[4];
equation
  (vector,angle,valid,quaternion) = SLAMRotationCoordinates(rotation);
end RotationCoordinatesFunction;

// Reference subclass only exposes the unchanged model's protected quaternion.
model SLAMRotationLogReference
  extends SLAMRotationLog;
  output Real observedQuaternion[4];
equation
  observedQuaternion = quaternion;
end SLAMRotationLogReference;

function RotationCoordinatesFixture
  input Real axis[3];
  input Real angle;
  output Real rotation[3,3];
protected
  Real unit[3];
  Real skew[3,3];
algorithm
  unit := axis/sqrt(sum(axis.^2));
  skew := [0.0,-unit[3],unit[2];unit[3],0.0,-unit[1];-unit[2],unit[1],0.0];
  rotation := identity(3)+sin(angle)*skew+(1.0-cos(angle))*(skew*skew);
end RotationCoordinatesFixture;

model SLAMRotationCoordinatesTests
  constant Real pi = 3.14159265358979323846;
  output Real rotations[16,3,3];
  output Real actualVector[16,3];
  output Real actualAngle[16];
  output Real actualValid[16];
  output Real actualQuaternion[16,4];
  output Real referenceVector[16,3];
  output Real referenceAngle[16];
  output Real referenceValid[16];
  output Real referenceQuaternion[16,4];
protected
  SLAMRotationLogReference reference[16](rotation=rotations);
  RotationCoordinatesFunction actual[16](rotation=rotations);
algorithm
  rotations[1,:,:] := RotationCoordinatesFixture({1.0,0.0,0.0},0.7+0.2*sin(time))
    *RotationCoordinatesFixture({0.0,1.0,0.0},-0.8+0.1*cos(2*time))
    *RotationCoordinatesFixture({0.0,0.0,1.0},0.4+0.3*sin(3*time));
  rotations[2,:,:] := RotationCoordinatesFixture({1.0,0.0,0.0},pi-1e-8*(1.0+time));
  rotations[3,:,:] := RotationCoordinatesFixture({0.0,1.0,0.0},pi);
  rotations[4,:,:] := RotationCoordinatesFixture({0.0,0.0,1.0},pi+1e-8*(1.0+time));
  rotations[5,:,:] := RotationCoordinatesFixture({1.0,2.0,-3.0},pi-1e-10);
  rotations[6,:,:] := RotationCoordinatesFixture({-2.0,1.0,3.0},1e-10*(1.0+time));
  rotations[7,:,:] := identity(3);
  rotations[8,:,:] := RotationCoordinatesFixture({1.0,0.0,0.0},-0.8+0.1*sin(time));
  rotations[9,:,:] := RotationCoordinatesFixture({0.0,1.0,0.0},0.9+0.2*cos(time));
  rotations[10,:,:] := RotationCoordinatesFixture({0.0,0.0,1.0},-1.2+0.1*time);
  rotations[11,:,:] := RotationCoordinatesFixture({1.0,-4.0,2.0},0.5+0.2*time);
  rotations[12,:,:] := RotationCoordinatesFixture({-3.0,2.0,1.0},pi+0.2+0.1*time);
  rotations[13,:,:] := [-1.0,0.0,0.0;0.0,1.0,0.0;0.0,0.0,1.0];
  rotations[14,:,:] := zeros(3,3);
  rotations[15,:,:] := 1.001*identity(3);
  rotations[16,:,:] := [1.0,0.01*(1.0+time),0.0;0.0,1.0,0.0;0.0,0.0,1.0];
equation
  for c in 1:16 loop
    actualVector[c,:] = actual[c].vector;
    actualAngle[c] = actual[c].angle;
    actualValid[c] = actual[c].valid;
    actualQuaternion[c,:] = actual[c].quaternion;
    referenceVector[c,:] = reference[c].vector;
    referenceAngle[c] = reference[c].angle;
    referenceValid[c] = reference[c].valid;
    referenceQuaternion[c,:] = reference[c].observedQuaternion;
  end for;
end SLAMRotationCoordinatesTests;
