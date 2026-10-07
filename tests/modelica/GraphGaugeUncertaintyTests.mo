package GraphGaugeUncertaintyTests
  function Rotation
    input Real v[3]; output Real R[3,3];
  protected Real S[3,3]; Real angle;
  algorithm
    S := {{0,-v[3],v[2]},{v[3],0,-v[1]},{-v[2],v[1],0}}; angle := sqrt(v*v);
    R := identity(3)+sin(angle)/max(angle,1e-100)*S+(1-cos(angle))/max(angle^2,1e-100)*S*S;
  end Rotation;
  function Binding
    output GraphGaugeUncertainty.Binding b;
  algorithm
    b.generation := 2; b.graphRevision := 9; b.catalogPoseRevision := 4;
    b.anchorId := 1; b.anchorEpoch := 10; b.anchorCaptureSequence := 1; b.anchorTime := 1;
    b.currentId := 128; b.currentEpoch := 300; b.currentCaptureSequence := 128; b.currentTime := 3;
    b.referenceId := 32; b.referenceEpoch := 200; b.referenceCaptureSequence := 32; b.referenceTime := 2;
    b.chart := 1; b.sourceRevision := 13; b.factorProvenance := 7; b.anchorBoundProvenance := 11;
  end Binding;
  function Equal
    input GraphGaugeUncertainty.Estimate a; input GraphGaugeUncertainty.Estimate b; output Boolean same;
  algorithm
    same := GraphGaugeUncertainty.SameBinding(a.binding,b.binding);
    for i in 1:2 loop for j in 1:3 loop
      same := same and a.positions[i,j] == b.positions[i,j];
      for k in 1:3 loop same := same and a.rotations[i,j,k] == b.rotations[i,j,k]; end for;
    end for; end for;
    for i in 1:12 loop for j in 1:12 loop same := same and a.covariance[i,j] == b.covariance[i,j]; end for; end for;
  end Equal;
  // Independent central differentiation of composed means. No production B/C/skew.
  function Jacobians
    input Real Ra[3,3]; input Real t[2,3]; input Real Q[2,3,3];
    output Real A[12,6]; output Real D[12,12];
  protected
    Real e[3]; Real plus[3,3]; Real minus[3,3]; Real nominal[3,3]; Real delta[3,3];
    Real dp[3]; Real epsilon=1e-6; Integer offset;
  algorithm
    A := zeros(12,6); D := zeros(12,12);
    for node in 1:2 loop
      offset := 6*(node-1); nominal := Ra*Q[node,:,:];
      for axis in 1:3 loop
        e := zeros(3); e[axis] := epsilon;
        plus := Ra*Rotation(e); minus := Ra*Rotation(-e); dp := (plus*t[node,:]-minus*t[node,:])/(2*epsilon);
        delta := transpose(nominal)*(plus*Q[node,:,:]-minus*Q[node,:,:])/(2*epsilon);
        A[offset+1:offset+3,axis+3] := dp;
        A[offset+4:offset+6,axis+3] := {delta[3,2]-delta[2,3],delta[1,3]-delta[3,1],delta[2,1]-delta[1,2]}/2;
        A[offset+axis,axis] := 1;
        dp := Ra*e/epsilon; D[offset+1:offset+3,offset+axis] := dp;
        delta := transpose(nominal)*(nominal*Rotation(e)-nominal*Rotation(-e))/(2*epsilon);
        D[offset+4:offset+6,offset+axis+3] := {delta[3,2]-delta[2,3],delta[1,3]-delta[3,1],delta[2,1]-delta[1,2]}/2;
      end for;
    end for;
  end Jacobians;
  function Run
    input Real executionTime = 0;
    output Boolean checks[28];
  protected
    GraphGaugeUncertainty.Binding b; GraphGaugeUncertainty.Binding expected;
    GraphGaugeUncertainty.Estimate previous; GraphGaugeUncertainty.Estimate result;
    Real pa[3]; Real Ra[3,3]; Real t[2,3]; Real Q[2,3,3]; Real Pa[6,6]; Real Pr[12,12];
    Real LA[6,6]; Real LR[12,12]; Real JA[12,6]; Real JR[12,12]; Real oracle[12,12];
    Real shared[12,6]; Real residual[12,6]; Real actual[12,12]; Real gapFactor[12,6]; Real gap[12,12];
    Real beta; Boolean requested; Boolean accepted; Boolean shouldAccept; Integer reason; Integer expectedReason;
  algorithm
    checks := fill(false,28);
    for scenario in 1:28 loop
      b := Binding(); expected := b; previous.binding := b;
      previous.positions := {{7,8,9},{-1,-2,-3}};
      for node in 1:2 loop previous.rotations[node,:,:] := fill(12+node,3,3); end for;
      previous.covariance := fill(-77,12,12);
      pa := {10,-20,30}; Ra := Rotation({0.4,-0.3,0.2}); t := {{2,-1,0.5},{-0.7,1.2,2.1}};
      Q[1,:,:] := Rotation({-0.2,0.5,0.1}); Q[2,:,:] := Rotation({0.3,0.1,-0.4});
      LA := zeros(6,6); LR := zeros(12,12);
      for i in 1:6 loop for j in 1:6 loop LA[i,j] := (if i == j then 0.2 else 0)+0.003*i*j; end for; end for;
      for i in 1:12 loop for j in 1:12 loop LR[i,j] := (if i == j then 0.1 else 0)+0.001*i*j; end for; end for;
      Pa := LA*transpose(LA); Pr := LR*transpose(LR); beta := 0.3; requested := true; shouldAccept := true; expectedReason := 0;
      if scenario == 2 then beta := 0.8;
      elseif scenario == 3 then
        b.referenceId := b.anchorId; b.referenceEpoch := b.anchorEpoch; b.referenceTime := b.anchorTime;
        b.referenceCaptureSequence := b.anchorCaptureSequence; expected := b;
        t[2,:] := zeros(3); Q[2,:,:] := identity(3); Pr[7:12,:] := zeros(6,12); Pr[:,7:12] := zeros(12,6);
      elseif scenario == 6 then beta := 0; shouldAccept := false; expectedReason := 3;
      elseif scenario == 7 then beta := 1; shouldAccept := false; expectedReason := 3;
      elseif scenario == 8 then beta := -0.5; shouldAccept := false; expectedReason := 3;
      elseif scenario == 9 then Pa[6,6] := -1; shouldAccept := false; expectedReason := 5;
      elseif scenario == 10 then Pr[12,12] := -1; shouldAccept := false; expectedReason := 5;
      elseif scenario == 11 then Pr[1,12] := 100; Pr[12,1] := 100; shouldAccept := false; expectedReason := 5;
      elseif scenario == 12 then Q[2,3,3] := 2; shouldAccept := false; expectedReason := 4;
      elseif scenario == 13 then Pr[12,12] := 1e101; shouldAccept := false; expectedReason := 5;
      elseif scenario == 14 then b.anchorId := 2; shouldAccept := false; expectedReason := 2;
      elseif scenario == 15 then b.currentCaptureSequence := b.currentCaptureSequence+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 16 then b.chart := 2; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 17 then b.factorProvenance := 0; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 18 then b.sourceRevision := b.sourceRevision+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 19 then b.referenceTime := 4; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 20 then
        b.referenceId := b.anchorId; b.referenceEpoch := b.anchorEpoch; b.referenceTime := b.anchorTime;
        b.referenceCaptureSequence := b.anchorCaptureSequence; expected := b; shouldAccept := false; expectedReason := 6;
      elseif scenario == 21 then beta := 1e-20; shouldAccept := false; expectedReason := 7;
      elseif scenario == 22 then
        requested := false; b.generation := -1; beta := -1; Pa := fill(1e101,6,6); Pr := fill(-1e101,12,12);
        previous.binding.sourceRevision := -77; shouldAccept := false; expectedReason := 1;
      elseif scenario == 23 then
        Ra := identity(3); pa := {1e6,0,0}; shouldAccept := false; expectedReason := 8;
      elseif scenario == 24 then
        Ra := identity(3); Ra[1,1] := 1+4e-7; Q[1,:,:] := Ra; shouldAccept := false; expectedReason := 8;
      elseif scenario == 25 then b.graphRevision := b.graphRevision+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 26 then b.referenceCaptureSequence := b.referenceCaptureSequence+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 27 then b.anchorBoundProvenance := 0; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 28 then b.currentTime := b.currentTime+0.01; shouldAccept := false; expectedReason := 2;
      end if;
      (result,accepted,reason) := GraphGaugeUncertainty.Transport(previous,b,expected,pa,Ra,Pa,t,Q,Pr,beta,requested);
      checks[scenario] := accepted == shouldAccept and reason == expectedReason;
      if shouldAccept then
        (JA,JR) := Jacobians(Ra,t,Q); oracle := JA*Pa*transpose(JA)/beta+JR*Pr*transpose(JR)/(1-beta);
        checks[scenario] := checks[scenario] and max(abs(result.covariance-oracle)) < 2e-7 and GraphGaugeUncertainty.SameBinding(result.binding,b);
        for node in 1:2 loop
          checks[scenario] := checks[scenario] and max(abs(result.positions[node,:]-(pa+Ra*t[node,:]))) < 1e-12
            and max(abs(result.rotations[node,:,:]-Ra*Q[node,:,:])) < 1e-12;
        end for;
        if scenario == 3 then checks[scenario] := checks[scenario] and result.covariance[7,7] > 0 and abs(result.covariance[1,7]) > 0; end if;
        if scenario == 4 or scenario == 5 then
          shared := JR*LR[:,1:6]; residual := JR*LR[:,7:12];
          actual := (JA*LA+(if scenario == 4 then 1 else -1)*shared)*transpose(JA*LA+(if scenario == 4 then 1 else -1)*shared)+residual*transpose(residual);
          gapFactor := sqrt((1-beta)/beta)*JA*LA-(if scenario == 4 then 1 else -1)*sqrt(beta/(1-beta))*shared;
          gap := gapFactor*transpose(gapFactor)+beta/(1-beta)*residual*transpose(residual);
          checks[scenario] := checks[scenario] and max(abs(result.covariance-actual-gap)) < 2e-7;
        end if;
      else checks[scenario] := checks[scenario] and Equal(result,previous);
      end if;
    end for;
  end Run;
  function CloneRun
    input Real executionTime = 0;
    output Boolean checks[9];
  protected
    GraphGaugeUncertainty.Binding b; GraphGaugeUncertainty.Binding expected;
    GraphGaugeUncertainty.Estimate old; GraphGaugeUncertainty.Estimate result;
    Real Pa[6,6]; Real W[6,6]; Real Pr[12,12]; Real Ra[3,3]; Real t[2,3]; Real R[2,3,3];
    Real JA[12,6]; Real JR[12,12]; Real oracle[12,12];
    Boolean accepted; Boolean requested; Boolean shouldAccept; Integer reason; Integer expectedReason;
  algorithm
    for scenario in 1:9 loop
      b := Binding(); b.referenceId := b.currentId; b.referenceEpoch := b.currentEpoch;
      b.referenceTime := b.currentTime; b.referenceCaptureSequence := b.currentCaptureSequence; expected := b;
      old.binding := b; old.positions := fill(7e90,2,3); old.rotations := fill(-8e90,2,3,3); old.covariance := fill(-9e90,12,12);
      Ra := Rotation({0.4,-0.3,0.2}); t[1,:] := {2,-1,0.5}; t[2,:] := t[1,:];
      R[1,:,:] := Rotation({-0.2,0.5,0.1}); R[2,:,:] := R[1,:,:];
      for i in 1:6 loop for j in 1:6 loop W[i,j] := (if i == j then 0.2 else 0)+0.003*i*j; end for; end for;
      Pa := W*transpose(W); Pr[1:6,1:6] := Pa/2;
      Pr[7:12,1:6] := Pr[1:6,1:6]; Pr[1:6,7:12] := Pr[1:6,1:6]; Pr[7:12,7:12] := Pr[1:6,1:6];
      requested := true; shouldAccept := true; expectedReason := 0;
      if scenario == 2 then b.referenceEpoch := b.referenceEpoch-1; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 3 then b.referenceTime := b.referenceTime-0.1; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 4 then b.referenceCaptureSequence := b.referenceCaptureSequence-1; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 5 then t[2,3] := t[2,3]+0.01; shouldAccept := false; expectedReason := 6;
      elseif scenario == 6 then R[2,:,:] := Rotation({0.2,0.3,0.4}); shouldAccept := false; expectedReason := 6;
      elseif scenario == 7 then Pr[7:12,7:12] := Pr[7:12,7:12]+identity(6)*0.01; shouldAccept := false; expectedReason := 6;
      elseif scenario == 8 then requested := false; b.currentId := -1; Pr := fill(-1e99,12,12); shouldAccept := false; expectedReason := 1;
      elseif scenario == 9 then b.currentId := b.anchorId; b.referenceId := b.anchorId;
        b.currentEpoch := b.anchorEpoch; b.referenceEpoch := b.anchorEpoch; b.currentTime := b.anchorTime; b.referenceTime := b.anchorTime;
        b.currentCaptureSequence := b.anchorCaptureSequence; b.referenceCaptureSequence := b.anchorCaptureSequence; expected := b;
        t := zeros(2,3); R[1,:,:] := identity(3); R[2,:,:] := identity(3); Pr := zeros(12,12);
      end if;
      (result,accepted,reason) := GraphGaugeUncertainty.Transport(old,b,expected,{10,-20,30},Ra,Pa,t,R,Pr,0.3,requested);
      checks[scenario] := accepted == shouldAccept and reason == expectedReason;
      if accepted then
        (JA,JR) := Jacobians(Ra,t,R); oracle := JA*Pa*transpose(JA)/0.3+JR*Pr*transpose(JR)/0.7;
        checks[scenario] := checks[scenario] and max(abs(result.covariance-oracle)) < 2e-7;
        for i in 1:3 loop
          checks[scenario] := checks[scenario] and result.positions[1,i] == result.positions[2,i];
          for j in 1:3 loop checks[scenario] := checks[scenario] and result.rotations[1,i,j] == result.rotations[2,i,j]; end for;
        end for;
        for i in 1:6 loop for j in 1:6 loop checks[scenario] := checks[scenario]
          and result.covariance[i,j] == result.covariance[i+6,j] and result.covariance[i,j] == result.covariance[i,j+6]
          and result.covariance[i,j] == result.covariance[i+6,j+6]; end for; end for;
      else checks[scenario] := checks[scenario] and Equal(result,old); end if;
    end for;
  end CloneRun;
end GraphGaugeUncertaintyTests;
