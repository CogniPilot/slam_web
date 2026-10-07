package RGBDMapAnchorUncertaintyTests
  function Binding
    output RGBDMapAnchorUncertainty.Binding b;
  algorithm
    b.generation := 2; b.sourceRevision := 13; b.landmarkSlot := 14400;
    b.anchorId := 128; b.anchorSlot := 128; b.anchorEpoch := 200; b.anchorPoseRevision := 7;
    b.rawObservationEpoch := 300; b.rawObservationProvenance := 11; b.localBoundProvenance := 12; b.anchorBoundProvenance := 13;
    b.anchorTime := 2; b.observationTime := 3;
  end Binding;
  function Equal
    input RGBDMapAnchorUncertainty.Estimate a; input RGBDMapAnchorUncertainty.Estimate b; output Boolean same;
  algorithm
    same := RGBDMapAnchorUncertainty.SameBinding(a.binding,b.binding);
    for i in 1:3 loop
      same := same and a.worldPoint[i] == b.worldPoint[i];
      for j in 1:3 loop same := same and a.covariance[i,j] == b.covariance[i,j]; end for;
    end for;
  end Equal;
  function Run
    output Boolean checks[32];
  protected
    RGBDMapAnchorUncertainty.Binding b; RGBDMapAnchorUncertainty.Binding expected;
    RGBDMapAnchorUncertainty.Estimate previous; RGBDMapAnchorUncertainty.Estimate result;
    Real p[3]; Real R[3,3]; Real l[3]; Real Pa[6,6]; Real Pl[3,3]; Real LA[6,6]; Real LL[3,3];
    Real JA[3,6]; Real JL[3,3]; Real e[3]; Real plus[3]; Real minus[3]; Real oracle[3,3];
    Real U[3,6]; Real V[3,6]; Real localLoading[3,6]; Real actual[3,3]; Real gramFactor[3,6]; Real gram[3,3];
    Real beta; Real epsilon=1e-6; Real sign;
    Boolean requested; Boolean accepted; Boolean shouldAccept; Integer reason; Integer expectedReason;
  algorithm
    checks := fill(false,32);
    for scenario in 1:32 loop
      b := Binding(); expected := b; previous.binding := b;
      previous.worldPoint := {-77,88,-99}; previous.covariance := fill(-1e101,3,3);
      p := {10,-20,30}; R := GraphGaugeUncertaintyTests.Rotation({0.4,-0.3,0.2}); l := {2,-1,3};
      for i in 1:6 loop for j in 1:6 loop LA[i,j] := (if i == j then 0.2 else 0)+0.003*i*j; end for; end for;
      for i in 1:3 loop for j in 1:3 loop LL[i,j] := (if i == j then 0.1 else 0)+0.01*i*j; end for; end for;
      Pa := LA*transpose(LA); Pl := LL*transpose(LL); beta := 0.3; requested := true; shouldAccept := true; expectedReason := 0;
      if scenario == 2 then beta := 0.8;
      elseif scenario == 3 then l := {1e-9,-2e-9,3e-9};
      elseif scenario == 4 then Pa := zeros(6,6); Pl := zeros(3,3); l := zeros(3);
      elseif scenario == 7 then beta := 0; shouldAccept := false; expectedReason := 3;
      elseif scenario == 8 then beta := 1; shouldAccept := false; expectedReason := 3;
      elseif scenario == 9 then beta := -0.1; shouldAccept := false; expectedReason := 3;
      elseif scenario == 10 then Pa[6,6] := -1; shouldAccept := false; expectedReason := 5;
      elseif scenario == 11 then Pl[3,3] := -1; shouldAccept := false; expectedReason := 5;
      elseif scenario == 12 then Pl[3,2] := Pl[3,2]+0.1; shouldAccept := false; expectedReason := 5;
      elseif scenario == 13 then R[3,3] := 2; shouldAccept := false; expectedReason := 4;
      elseif scenario == 14 then l[3] := 1e101; shouldAccept := false; expectedReason := 4;
      elseif scenario == 15 then b.generation := b.generation+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 16 then b.sourceRevision := b.sourceRevision+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 17 then b.anchorSlot := 1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 18 then b.anchorPoseRevision := b.anchorPoseRevision+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 19 then b.anchorEpoch := b.anchorEpoch+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 20 then b.rawObservationEpoch := b.rawObservationEpoch+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 21 then b.rawObservationProvenance := b.rawObservationProvenance+1; shouldAccept := false; expectedReason := 2;
      elseif scenario == 22 then b.localBoundProvenance := 0; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 23 then b.anchorBoundProvenance := 0; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 24 then b.observationTime := b.anchorTime; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 25 then
        requested := false; previous.binding.sourceRevision := -77; previous.binding.landmarkSlot := -1;
        b.generation := -1; beta := -1; Pa := fill(1e101,6,6); Pl := fill(-1e101,3,3); shouldAccept := false; expectedReason := 1;
      elseif scenario == 26 then beta := 1e-20; shouldAccept := false; expectedReason := 6;
      elseif scenario == 27 then p := {1e6,0,0}; R := identity(3); shouldAccept := false; expectedReason := 6;
      elseif scenario == 28 then b.landmarkSlot := 14401; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 29 then Pl[3,3] := 1e101; shouldAccept := false; expectedReason := 5;
      elseif scenario == 30 then b.rawObservationEpoch := b.anchorEpoch; b.observationTime := b.anchorTime; expected := b;
      elseif scenario == 31 then b.anchorSlot := 1; expected := b; shouldAccept := false; expectedReason := 2;
      elseif scenario == 32 then b.anchorId := b.anchorId+128; shouldAccept := false; expectedReason := 2;
      end if;
      (result,accepted,reason) := RGBDMapAnchorUncertainty.Transport(previous,b,expected,p,R,Pa,l,Pl,beta,requested);
      checks[scenario] := accepted == shouldAccept and reason == expectedReason;
      if shouldAccept then
        // Central difference of the world point manifold, no production skew/J.
        JA := zeros(3,6); JL := zeros(3,3);
        for axis in 1:3 loop
          e := zeros(3); e[axis] := epsilon;
          plus := R*GraphGaugeUncertaintyTests.Rotation(e)*l; minus := R*GraphGaugeUncertaintyTests.Rotation(-e)*l;
          JA[:,axis+3] := (plus-minus)/(2*epsilon); JA[axis,axis] := 1;
          JL[:,axis] := (R*(l+e)-R*(l-e))/(2*epsilon);
        end for;
        oracle := JA*Pa*transpose(JA)/beta+JL*Pl*transpose(JL)/(1-beta);
        checks[scenario] := checks[scenario] and max(abs(result.covariance-oracle)) < 2e-7
          and max(abs(result.worldPoint-(p+R*l))) < 1e-12 and RGBDMapAnchorUncertainty.SameBinding(result.binding,b);
        if scenario == 5 or scenario == 6 then
          localLoading := zeros(3,6); localLoading[:,1:3] := LL;
          U := JA*LA; V := JL*localLoading; sign := if scenario == 5 then 1 else -1;
          actual := (U+sign*V)*transpose(U+sign*V);
          gramFactor := sqrt((1-beta)/beta)*U-sign*sqrt(beta/(1-beta))*V; gram := gramFactor*transpose(gramFactor);
          checks[scenario] := checks[scenario] and max(abs(result.covariance-actual-gram)) < 2e-7;
        end if;
      else checks[scenario] := checks[scenario] and Equal(result,previous);
      end if;
    end for;
  end Run;
end RGBDMapAnchorUncertaintyTests;
