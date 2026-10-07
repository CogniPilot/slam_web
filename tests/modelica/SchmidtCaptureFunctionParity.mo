// Live unchanged equation models are the reference, not another helper call.
model SchmidtCaptureFunctionParity
  constant Integer captureCases=18;
  parameter Real expectedAccepted[captureCases]={1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1};
  parameter Real pairCases[20,8]={
    {0,0,-100,0,-1,1,0,1},{1,0,5,6,4,1,1,1},{1,1,5,6,5,1,0,1},
    {1,0,5,5,4,1,0,0},{1,1,5,5,5,1,0,0},{0.5,0,5,6,4,0,0,0},
    {1,0.5,5,6,4,0,0,0},{1,0,5,0.5,4,0,0,0},{1,0,5,-1,4,0,0,0},
    {1,0,5,6,-0.5,0,0,0},{1,0,5.5,6,4,0,0,0},{1,0,5,6,5,0,0,0},
    {1,1,5,6,4,0,0,0},{0,1,5,6,4,0,0,0},
    {1,0,9007199254740990,9007199254740991,9007199254740989,1,1,1},
    {1,0,5,9007199254740992,4,0,0,0},{1,0,5,6,9007199254740992,0,0,0},
    {1,0,9007199254740992,6,4,0,0,0},{1,0,5,6,4,1,1,1},{0,0,1e101,9,8,1,0,1}};
  constant Integer poseIndices[6]={1,2,3,7,8,9};
  Integer captureScenario; Integer pairScenario;
  Real position[3]; Real rotation[3,3]; Real covariance[15,15];
  Real referencePosition[3]; Real referenceRotation[3,3];
  Real crossCovariance[15,6]; Real referenceCovariance[6,6];
  Real referenceAvailable; Real captureRequested; Real currentValid;
  Real accepted; Real rejected; Real nextReferenceAvailable;
  Real nextReferencePosition[3]; Real nextReferenceRotation[3,3];
  Real nextCovariance[15,15]; Real nextCrossCovariance[15,6]; Real nextReferenceCovariance[6,6];
  Real pairValid; Real pairEligible; Real pairFresh;
  SchmidtReferenceCapture reference(position=position,rotation=rotation,covariance=covariance,
    referencePosition=referencePosition,referenceRotation=referenceRotation,crossCovariance=crossCovariance,
    referenceCovariance=referenceCovariance,referenceAvailable=referenceAvailable,
    captureRequested=captureRequested,currentValid=currentValid);
  SchmidtImagePairGate pairReference(referenceAvailable=pairCases[pairScenario,1],referenceUsed=pairCases[pairScenario,2],
    referenceEpoch=pairCases[pairScenario,3],currentEpoch=pairCases[pairScenario,4],lastUsedEpoch=pairCases[pairScenario,5]);
  output Boolean checks[4];
equation
  captureScenario=min(captureCases,1+integer(time));pairScenario=min(20,1+integer(time));
  position={if captureScenario==13 then 1000001 elseif captureScenario==18 then 1000000 else 1+time,-2+0.1*time,0.3};
  rotation=if captureScenario==5 then 2*identity(3) else
    [cos(time),-sin(time),0;sin(time),cos(time),0;0,0,1]*[cos(0.3),0,sin(0.3);0,1,0;-sin(0.3),0,cos(0.3)];
  referencePosition=if captureScenario==1 or captureScenario==12 or captureScenario==16 then {1000001,2,3} else {2,-3,0.5};
  referenceRotation=if captureScenario==1 or captureScenario==8 or captureScenario==16 then 2*identity(3)
    else [1,0,0;0,cos(0.2),-sin(0.2);0,sin(0.2),cos(0.2)];
  referenceAvailable=if captureScenario==1 or captureScenario==14 or captureScenario==16 then 0 elseif captureScenario==9 then 0.5 else 1;
  captureRequested=if captureScenario==3 or captureScenario==16 then 0 elseif captureScenario==10 then 0.5 else 1;
  currentValid=if captureScenario==4 then 0 elseif captureScenario==11 then 0.5 else 1;
  for i in 1:15 loop
    for j in 1:15 loop
      covariance[i,j]=if captureScenario==6 and i==15 and j==15 then -1
        else (if i==j then 0.05*i else 0)+0.0001*i*j*(1+0.1*time)
          +(if captureScenario==17 and i==15 and j==1 then 0.001 else 0);
    end for;
    for j in 1:6 loop
      crossCovariance[i,j]=if captureScenario==1 or captureScenario==7 or captureScenario==16 then 1000 else 0.0001*i*j;
    end for;
  end for;
  for i in 1:6 loop for j in 1:6 loop
    referenceCovariance[i,j]=if captureScenario==1 or captureScenario==16 then (if i==j then -1 else 0)
      else (if i==j then 2.0+0.1*i else 0)+0.0002*i*j;
  end for; end for;
algorithm
  (accepted,rejected,nextReferenceAvailable,nextReferencePosition,nextReferenceRotation,
    nextCovariance,nextCrossCovariance,nextReferenceCovariance):=SchmidtCaptureReference(
    position,rotation,covariance,referencePosition,referenceRotation,crossCovariance,referenceCovariance,
    referenceAvailable,captureRequested,currentValid);
  checks[1]:=accepted==reference.accepted and rejected==reference.rejected
    and nextReferenceAvailable==reference.nextReferenceAvailable
    and max(abs(nextReferencePosition-reference.nextReferencePosition))<1e-13
    and max(abs(nextReferenceRotation-reference.nextReferenceRotation))<1e-13
    and max(abs(nextCovariance-reference.nextCovariance))<1e-13
    and max(abs(nextCrossCovariance-reference.nextCrossCovariance))<1e-13
    and max(abs(nextReferenceCovariance-reference.nextReferenceCovariance))<1e-13;
  checks[2]:=accepted==expectedAccepted[captureScenario]
    and rejected==(if captureRequested==0 or expectedAccepted[captureScenario]==1 then 0 else 1);
  checks[3]:=max(abs(nextCovariance-covariance))==0;
  if expectedAccepted[captureScenario]==1 then
    checks[3]:=checks[3] and nextReferenceAvailable==1
      and max(abs(nextReferencePosition-position))==0 and max(abs(nextReferenceRotation-rotation))==0;
    for i in 1:15 loop for j in 1:6 loop
      checks[3]:=checks[3] and abs(nextCrossCovariance[i,j]-covariance[i,poseIndices[j]])<1e-13;
    end for; end for;
    for i in 1:6 loop for j in 1:6 loop
      checks[3]:=checks[3] and abs(nextReferenceCovariance[i,j]-covariance[poseIndices[i],poseIndices[j]])<1e-13;
    end for; end for;
  else
    checks[3]:=checks[3] and nextReferenceAvailable==referenceAvailable
      and max(abs(nextReferencePosition-referencePosition))==0 and max(abs(nextReferenceRotation-referenceRotation))==0
      and max(abs(nextCrossCovariance-crossCovariance))==0 and max(abs(nextReferenceCovariance-referenceCovariance))==0;
  end if;
  (pairValid,pairEligible,pairFresh):=SchmidtImagePairEligibility(pairCases[pairScenario,1],pairCases[pairScenario,2],
    pairCases[pairScenario,3],pairCases[pairScenario,4],pairCases[pairScenario,5]);
  checks[4]:=pairValid==pairReference.valid and pairEligible==pairReference.eligible and pairFresh==pairReference.captureFresh
    and pairValid==pairCases[pairScenario,6] and pairEligible==pairCases[pairScenario,7] and pairFresh==pairCases[pairScenario,8];
end SchmidtCaptureFunctionParity;
