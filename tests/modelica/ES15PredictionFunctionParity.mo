// The equation references are frozen copies of the pre-extraction models.
// This model compares all outputs, including refused-step intermediate values.
model ES15PredictionFunctionParity
  constant Integer cases=12;
  parameter Real steps[cases]={1.0/90.0,0,-0.01,0.0200001,0.02,0.01,0.01,1e-9,0.01,0.02,0.01,0.005};
  parameter Real rates[cases,3]={{0,0,0},{1,2,3},{1,2,3},{0,0,0},
    {0,0,5},{0,0,10},{0,0,10.00001},{3,-4,1},{3,-4,1},{3,-4,1},{0,0,1e-6},{200,0,0}};
  parameter Real expectedValid[cases]={1,0,0,0,1,1,0,1,1,0,1,0};
  Integer scenario;
  Real R[3,3]; Real p[3]; Real v[3]; Real a[3]; Real gyro[3];
  Real directForce[3]; Real directOmega[3]; Real directMiddle[3,3]; Real directRotation[3,3];
  Real directPosition[3]; Real directVelocity[3]; Real directValid;
  Real directF[15,15]; Real directG[15,12];
  ES15NominalPrediction adapter(rotation=R,position=p,velocity=v,accel=a,gyro=gyro,
    accel_bias={0.1,-0.2,0.3},gyro_bias={0.01,-0.02,0.03},h=steps[scenario]);
  ES15NominalPredictionEquationReference reference(rotation=R,position=p,velocity=v,accel=a,gyro=gyro,
    accel_bias={0.1,-0.2,0.3},gyro_bias={0.01,-0.02,0.03},h=steps[scenario]);
  ES15Dynamics dynamics(rotation=adapter.middle_rotation,force=adapter.force,omega=adapter.omega);
  ES15DynamicsEquationReference dynamicsReference(rotation=reference.middle_rotation,force=reference.force,omega=reference.omega);
  output Boolean checks[7];

  function Independent
    input Real clock; output Boolean checks[5];
  protected
    Real R[3,3]; Real p[3]; Real v[3]; Real f[3]; Real w[3]; Real middle[3,3];
    Real nextR[3,3]; Real nextP[3]; Real nextV[3]; Real valid;
    Real F[15,15]; Real G[15,12]; Real expectedF[15,15]; Real expectedG[15,12];
    Real axis[3]; Real h; Real theta;
  algorithm
    h:=0.01;theta:=0.3+clock;
    R:=[cos(theta),0,sin(theta);0,1,0;-sin(theta),0,cos(theta)];
    p:={1+clock,-2,0.5};v:={0.2,-0.3,0.4};
    (f,w,middle,nextR,nextP,nextV,valid):=ES15NominalPrediction.Predict(R,p,v,
      transpose(R)*{0,0,9.81},{0,0,0},{0,0,0},{0,0,0},{0,0,-9.81},h);
    checks[1]:=valid==1 and max(abs(nextR-R))<1e-13 and max(abs(nextV-v))<1e-13
      and max(abs(nextP-(p+v*h)))<1e-13;
    (f,w,middle,nextR,nextP,nextV,valid):=ES15NominalPrediction.Predict(identity(3),p,v,
      {2,-1,9.81},{0,0,0},{0,0,0},{0,0,0},{0,0,-9.81},h);
    checks[2]:=valid==1 and max(abs(nextV-(v+{2,-1,0}*h)))<1e-13
      and max(abs(nextP-(p+v*h+0.5*{2,-1,0}*h^2)))<1e-13;
    (f,w,middle,nextR,nextP,nextV,valid):=ES15NominalPrediction.Predict(R,p,v,
      {0,0,0},{0,0,6},{0,0,0},{0,0,0},{0,0,0},h);
    checks[3]:=valid==1 and max(abs(nextR-R*[cos(0.06),-sin(0.06),0;sin(0.06),cos(0.06),0;0,0,1]))<1e-13
      and max(abs(middle-R*[cos(0.03),-sin(0.03),0;sin(0.03),cos(0.03),0;0,0,1]))<1e-13
      and max(abs(nextV-v))<1e-13 and max(abs(nextP-(p+v*h)))<1e-13;
    (F,G):=ES15Dynamics.Matrices(R,{1.2,-2.3,3.4},{0.7,-0.8,0.9});
    expectedF:=fill(0.0,15,15);expectedG:=fill(0.0,15,12);
    for j in 1:3 loop
      axis:=fill(0.0,3);axis[j]:=1;
      expectedF[j,j+3]:=1;
      expectedF[4:6,j+6]:=-R*cross({1.2,-2.3,3.4},axis);
      expectedF[4:6,j+9]:=-R[:,j];
      expectedF[7:9,j+6]:=-cross({0.7,-0.8,0.9},axis);
      expectedF[j+6,j+12]:=-1;
      expectedG[4:6,j]:=-R[:,j];expectedG[j+6,j+3]:=-1;
      expectedG[j+9,j+6]:=1;expectedG[j+12,j+9]:=1;
    end for;
    checks[4]:=max(abs(F-expectedF))<1e-13 and max(abs(G-expectedG))<1e-13;
    // Invalid h still exposes force/omega/midpoint, while published state holds.
    (f,w,middle,nextR,nextP,nextV,valid):=ES15NominalPrediction.Predict(R,p,v,
      {1,2,3},{0,0,1},{0,0,0},{0,0,0},{0,0,0},-0.01);
    checks[5]:=valid==0 and max(abs(nextR-R))==0 and max(abs(nextP-p))==0 and max(abs(nextV-v))==0
      and max(abs(f-{1,2,3}))==0 and max(abs(w-{0,0,1}))==0 and max(abs(middle-R))>0;
  end Independent;
equation
  scenario=min(cases,1+integer(time));
  R=[cos(time),-sin(time),0;sin(time),cos(time),0;0,0,1]*[1,0,0;0,cos(0.3),-sin(0.3);0,sin(0.3),cos(0.3)];
  p={time,-time^2,0.2};v={0.3+time,-0.2,0.5};a={1+time,-2+time^2,9.4};
  gyro=rates[scenario,:]+{0.01,-0.02,0.03};
algorithm
    (directForce,directOmega,directMiddle,directRotation,
      directPosition,directVelocity,directValid):=ES15NominalPrediction.Predict(
      R,p,v,a,gyro,{0.1,-0.2,0.3},{0.01,-0.02,0.03},{0,0,-9.81},steps[scenario]);
    (directF,directG):=ES15Dynamics.Matrices(directMiddle,directForce,directOmega);
    checks[1]:=max(abs(reference.force-directForce))<1e-13
      and max(abs(reference.omega-directOmega))<1e-13
      and max(abs(reference.middle_rotation-directMiddle))<1e-13
      and max(abs(reference.next_rotation-directRotation))<1e-13
      and max(abs(reference.next_position-directPosition))<1e-13
      and max(abs(reference.next_velocity-directVelocity))<1e-13
      and reference.valid==directValid
      and max(abs(adapter.force-reference.force))<1e-13
      and max(abs(adapter.omega-reference.omega))<1e-13
      and max(abs(adapter.middle_rotation-reference.middle_rotation))<1e-13
      and max(abs(adapter.next_rotation-reference.next_rotation))<1e-13
      and max(abs(adapter.next_position-reference.next_position))<1e-13
      and max(abs(adapter.next_velocity-reference.next_velocity))<1e-13
      and adapter.valid==reference.valid
      and max(abs(dynamicsReference.F-directF))<1e-13
      and max(abs(dynamicsReference.G-directG))<1e-13
      and max(abs(dynamics.F-dynamicsReference.F))<1e-13
      and max(abs(dynamics.G-dynamicsReference.G))<1e-13;
  checks[2]:=abs(directValid-expectedValid[scenario])<0.5;
  checks[3:7]:=Independent(time);
end ES15PredictionFunctionParity;
