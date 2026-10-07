package RGBDGraphAnchorBoundTests
  function Rotation
    input Real a[3]; output Real R[3,3];
  protected Real cx; Real sx; Real cy; Real sy; Real cz; Real sz;
  algorithm
    cx:=cos(a[1]);sx:=sin(a[1]);cy:=cos(a[2]);sy:=sin(a[2]);cz:=cos(a[3]);sz:=sin(a[3]);
    R:={{cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx},
      {sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx},{-sy,cy*sx,cy*cx}};
  end Rotation;
  function Log
    input Real R[3,3]; output Real a[3];
  protected Real angle; Real scale;
  algorithm
    angle:=acos(min(1.0,max(-1.0,(sum(R[i,i] for i in 1:3)-1.0)/2)));
    scale:=if angle<1e-7 then 0.5+angle^2/12 else angle/(2*sin(angle));
    a:=scale*{R[3,2]-R[2,3],R[1,3]-R[3,1],R[2,1]-R[1,2]};
  end Log;
  function Equal
    input RGBDGraphAnchorBound.Estimate a; input RGBDGraphAnchorBound.Estimate b;
    output Boolean same;
  algorithm
    same:=a.binding.generation==b.binding.generation and a.binding.sourceRevision==b.binding.sourceRevision
      and a.binding.id==b.binding.id and a.binding.slot==b.binding.slot and a.binding.epoch==b.binding.epoch
      and a.binding.sequence==b.binding.sequence and a.binding.catalogPoseRevision==b.binding.catalogPoseRevision
      and a.binding.provenance==b.binding.provenance and a.binding.imageTime==b.binding.imageTime
      and max(abs(a.position-b.position))==0 and max(abs(a.rotation-b.rotation))==0
      and max(abs(a.bound-b.bound))==0;
  end Equal;
  function Run
    input Real clock;
    output Boolean checks[25];
  protected
    RGBDKeyframes.Catalog catalog;
    RGBDGraphCaptureLedger.State ledger;
    RGBDGraphAnchorBound.Estimate previous; RGBDGraphAnchorBound.Estimate result;
    Real position[3]; Real R[3,3]; Real weight; Real maxAngle; Real J[6,6]; Real offset[6];
    Real plus[3]; Real minus[3]; Real perturb[3]; Real expected[6,6];
    Real error[6]; Real projected[6]; Real gram[6]; Real actual[6];
    Real epsilon; Real scale; Boolean wanted; Boolean requested; Boolean accepted;
    Integer reason; Integer slot; Integer id; Integer sourceRevision; Integer step; Integer revision; Integer provenance;
  algorithm
    checks:=fill(false,25); epsilon:=1e-6;
    for scenario in 1:25 loop
      catalog:=RGBDGraphCaptureLedgerTests.Catalog(if scenario==4 then 130 else 129);
      ledger:=RGBDGraphCaptureLedger.Empty(3,17); ledger.catalogNextId:=catalog.nextId; ledger.lastStep:=400;
      for k in 1:128 loop
        ledger.ids[k]:=catalog.ids[k];ledger.epochs[k]:=catalog.epochs[k];ledger.times[k]:=catalog.imageTimes[k];
        ledger.sequences[k]:=2*catalog.ids[k]+7;
        catalog.bodyPositions[k,:]:={0.02*catalog.ids[k],0.01*catalog.ids[k],-0.015*catalog.ids[k]};
        catalog.bodyRotations[k,:,:]:=Rotation({0.004*catalog.ids[k],0.002*catalog.ids[k],-0.003*catalog.ids[k]});
        for row in 1:6 loop for column in 1:6 loop
          catalog.poseCovariances[k,row,column]:=(if row==column then 0.01*row else 0)+0.0002*min(row,column)*max(row,column);
        end for;end for;
      end for;
      id:=max(1,catalog.nextId-128);slot:=mod(id-1,128)+1;
      position:=catalog.bodyPositions[slot,:]+{0.15,-0.08,0.04};
      R:=catalog.bodyRotations[slot,:,:]*Rotation({-0.02,0.03,0.01});
      weight:=if scenario==3 then 0.2 else 0.5;maxAngle:=0.35;
      sourceRevision:=17;step:=400;revision:=12;provenance:=37+integer(floor(clock));requested:=true;wanted:=scenario<=6;
      previous:=RGBDGraphAnchorBound.Empty(8,11);previous.position:={2,3,4};previous.bound:=identity(6)*7;
      if scenario==1 then position:=catalog.bodyPositions[slot,:];R:=catalog.bodyRotations[slot,:,:];
      elseif scenario==5 or scenario==6 then
        error:=(if scenario==5 then 1 else -1)*{0.02,-0.01,0.03,0.001,-0.002,0.003};
        catalog.poseCovariances[slot,:,:]:=outerProduct(error,error);
      elseif scenario==7 then ledger.sequences[slot]:=-1;
      elseif scenario==8 then sourceRevision:=18;
      elseif scenario==9 then step:=399;
      elseif scenario==10 then revision:=-1;
      elseif scenario==11 then provenance:=0;
      elseif scenario==12 then weight:=0;
      elseif scenario==13 then R[1,1]:=2;
      elseif scenario==14 then catalog.bodyRotations[slot,3,3]:=2;
      elseif scenario==15 then catalog.poseCovariances[slot,6,6]:=-1;
      elseif scenario==16 then position:=catalog.bodyPositions[slot,:]+{5.001,0,0};
      elseif scenario==17 then R:=catalog.bodyRotations[slot,:,:]*Rotation({0.36,0,0});
      elseif scenario==18 then requested:=false;previous.bound[6,6]:=1e100;catalog.nextId:=-1;R:=fill(1e100,3,3);
      elseif scenario==19 then catalog:=RGBDKeyframes.Empty(3,1);ledger:=RGBDGraphCaptureLedger.Empty(3,17);step:=0;
      elseif scenario==20 then position[3]:=1e100;
      elseif scenario==21 then weight:=1e-16;
      elseif scenario==22 then catalog.poseCovariances[slot,1,6]:=1;
      elseif scenario==23 then catalog.bodyPositions[slot,3]:=1e100;
      elseif scenario==24 then maxAngle:=0.36;
      elseif scenario==25 then weight:=1;
      end if;
      (result,accepted,reason):=RGBDGraphAnchorBound.FromCapture(previous,catalog,ledger,sourceRevision,step,revision,
        position,R,provenance,weight,5,maxAngle,requested);
      checks[scenario]:=accepted==wanted and (if wanted then reason==0 else reason>0 and Equal(result,previous));
      if wanted then
        J:=identity(6);offset[1:3]:=catalog.bodyPositions[slot,:]-position;
        offset[4:6]:=Log(transpose(R)*catalog.bodyRotations[slot,:,:]);
        for axis in 1:3 loop
          perturb:=zeros(3);perturb[axis]:=epsilon;
          plus:=Log(transpose(R)*catalog.bodyRotations[slot,:,:]*Rotation(perturb));
          minus:=Log(transpose(R)*catalog.bodyRotations[slot,:,:]*Rotation(-perturb));
          J[4:6,axis+3]:=(plus-minus)/(2*epsilon);
        end for;
        expected:=if scenario==1 then catalog.poseCovariances[slot,:,:]
          else J*catalog.poseCovariances[slot,:,:]*transpose(J)/weight+outerProduct(offset,offset)/(1-weight);
        scale:=max(1,max(abs(expected)));
        checks[scenario]:=checks[scenario] and max(abs(result.bound-expected))<1e-8*scale
          and max(abs(result.position-position))==0 and max(abs(result.rotation-R))==0
          and result.binding.id==id and result.binding.slot==slot and result.binding.epoch==catalog.epochs[slot]
          and result.binding.sequence==ledger.sequences[slot] and result.binding.catalogPoseRevision==revision
          and result.binding.sourceRevision==17 and result.binding.provenance==provenance
          and result.binding.imageTime==catalog.imageTimes[slot];
        if scenario==1 then checks[scenario]:=checks[scenario] and max(abs(result.bound-catalog.poseCovariances[slot,:,:]))==0;end if;
        if scenario==5 or scenario==6 then
          projected:=J*error;actual:=offset+projected;
          gram:=sqrt((1-weight)/weight)*projected-sqrt(weight/(1-weight))*offset;
          checks[scenario]:=checks[scenario] and max(abs(result.bound-outerProduct(actual,actual)-outerProduct(gram,gram)))<1e-8;
        end if;
      end if;
    end for;
  end Run;
end RGBDGraphAnchorBoundTests;
