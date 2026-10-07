package RGBDRelativeBodyPoseReference
  function Inputs
    input Real clock;
    output Integer scenario; output Real referenceR[3,3]; output Real referenceP[3];
    output Real R[3,3]; output Real t[3]; output Real B[3,3]; output Real origin[3]; output Real accepted;
  protected
    Real poison;
  algorithm
    scenario:=integer(floor(clock*64))+1; poison:=sin(exp(1000+clock));
    referenceR:=[0,-1,0;1,0,0;0,0,1]; referenceP:={1,-2,0.5};
    R:=diagonal({-1,-1,1}); t:={0.1,-0.2,0};
    B:=[0,0,1;-1,0,0;0,-1,0]; origin:={0.18,-0.09,0.07}; accepted:=1;
    if scenario == 2 then
      referenceR:=[0.48,-0.6,0.64;0.36,0.8,0.48;-0.8,0,0.6];
      R:=[0.6,0,0.8;0,1,0;-0.8,0,0.6]; B:=[0,0,1;-0.6,0.8,0;-0.8,-0.6,0];
    elseif scenario == 3 then accepted:=0; R:=fill(poison,3,3); referenceP:=fill(poison,3);
    elseif scenario == 4 then accepted:=0.5;
    elseif scenario == 5 then referenceR:=diagonal({-1,1,1});
    elseif scenario == 6 then R:=diagonal({-1,1,1});
    elseif scenario == 7 then B:=diagonal({-1,1,1});
    elseif scenario == 8 then referenceP[1]:=1e6+1;
    elseif scenario == 9 then t[1]:=1e6+1;
    elseif scenario == 10 then origin[1]:=1e6+1;
    elseif scenario == 11 then R[1,1]:=poison;
    elseif scenario == 12 then referenceP[1]:=poison;
    elseif scenario == 13 then accepted:=poison;
    elseif scenario == 14 then t[2]:=poison;
    elseif scenario == 16 then referenceR:=identity(3); R:=identity(3); B:=identity(3); origin:=zeros(3); referenceP:={1e6,0,0}; t:={-1e6,0,0};
    elseif scenario == 17 then R:=diagonal({1+2e-7,1,1});
    elseif scenario == 18 then R:=diagonal({1+8e-7,1,1});
    end if;
  end Inputs;

  function Close
    input Real a[:,:]; input Real b[size(a,1),size(a,2)]; output Boolean equal;
  algorithm
    equal:=true;
    for i in 1:size(a,1) loop for j in 1:size(a,2) loop equal:=equal and abs(a[i,j]-b[i,j]) < 2e-13*(1+abs(b[i,j])); end for; end for;
  end Close;
  function CloseVector
    input Real a[:]; input Real b[size(a,1)]; output Boolean equal;
  algorithm
    equal:=true;
    for i in 1:size(a,1) loop equal:=equal and abs(a[i]-b[i]) < 2e-13*(1+abs(b[i])); end for;
  end CloseVector;
end RGBDRelativeBodyPoseReference;

model RGBDRelativeBodyPoseFunctionAcceptance
  output Integer scenario; output Boolean checks[5];
  output Real rawRotation[3,3]; output Real rawPosition[3]; output Real rawValid;
protected
  Real referenceR[3,3]; Real referenceP[3]; Real R[3,3]; Real t[3]; Real B[3,3]; Real origin[3]; Real accepted;
  Boolean wanted;
  RGBDRelativePose oracle(referenceBodyRotation=referenceR,referenceBodyPosition=referenceP,
    currentFromReference=R,currentFromReferenceTranslation=t,opticalToBody=B,cameraOriginBody=origin,registrationAccepted=accepted);
equation
  (scenario,referenceR,referenceP,R,t,B,origin,accepted)=RGBDRelativeBodyPoseReference.Inputs(time);
  (rawValid,rawRotation,rawPosition)=RGBDRelativeBodyPose(referenceR,referenceP,R,t,B,origin,accepted);
  wanted=scenario == 1 or scenario == 2 or scenario == 15 or scenario == 17;
  checks[1]=rawValid == oracle.valid;
  checks[2]=RGBDRelativeBodyPoseReference.Close(rawRotation,oracle.observedBodyRotation);
  checks[3]=RGBDRelativeBodyPoseReference.CloseVector(rawPosition,oracle.observedBodyPosition);
  checks[4]=rawValid == (if wanted then 1 else 0);
  checks[5]=if not wanted then RGBDRelativeBodyPoseReference.Close(rawRotation,identity(3))
    and RGBDRelativeBodyPoseReference.CloseVector(rawPosition,zeros(3))
    else if scenario == 1 or scenario == 15 then
      RGBDRelativeBodyPoseReference.Close(rawRotation,[0,1,0;1,0,0;0,0,-1])
      and RGBDRelativeBodyPoseReference.CloseVector(rawPosition,{1.28,-2,0.84}) else true;
end RGBDRelativeBodyPoseFunctionAcceptance;
