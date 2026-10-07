package SchmidtGraphPoseCorrectionTests
  function Log
    input Real R[3,3]; output Real v[3];
  protected Real a; Real s; Real w[3];
  algorithm
    w := {R[3,2]-R[2,3],R[1,3]-R[3,1],R[2,1]-R[1,2]};
    s := sqrt(w*w)/2; a := atan2(s,(R[1,1]+R[2,2]+R[3,3]-1)/2);
    v := if s < 1e-12 then w/2 else a/(2*s)*w;
  end Log;
  // Independent Gaussian elimination with partial pivoting (not Cholesky).
  function PivotSolve
    input Real matrix[12,12]; input Real rhs[12,22]; output Real solution[12,22];
  protected Real A[12,12]; Real B[12,22]; Real rowA[12]; Real rowB[22]; Real factor; Integer pivot;
  algorithm
    A := matrix; B := rhs;
    for k in 1:12 loop
      pivot := k;
      for row in k+1:12 loop if abs(A[row,k]) > abs(A[pivot,k]) then pivot := row; end if; end for;
      rowA := A[k,:]; A[k,:] := A[pivot,:]; A[pivot,:] := rowA;
      rowB := B[k,:]; B[k,:] := B[pivot,:]; B[pivot,:] := rowB;
      for row in k+1:12 loop
        factor := A[row,k]/A[k,k];
        for col in k:12 loop A[row,col] := A[row,col]-factor*A[k,col]; end for;
        B[row,:] := B[row,:]-factor*B[k,:];
      end for;
    end for;
    solution := zeros(12,22);
    for reverse in 1:12 loop
      for col in 1:22 loop
        factor := B[13-reverse,col];
        for j in 14-reverse:12 loop factor := factor-A[13-reverse,j]*solution[j,col]; end for;
        solution[13-reverse,col] := factor/A[13-reverse,13-reverse];
      end for;
    end for;
  end PivotSolve;
  function Equal
    input SchmidtGraphPoseCorrection.State a; input SchmidtGraphPoseCorrection.State b; output Boolean equal;
  algorithm
    equal := a.referenceAvailable == b.referenceAvailable and a.referenceUsed == b.referenceUsed
      and a.generation == b.generation and a.sourceRevision == b.sourceRevision and a.currentId == b.currentId
      and a.currentEpoch == b.currentEpoch and a.currentCaptureSequence == b.currentCaptureSequence
      and a.referenceId == b.referenceId and a.referenceEpoch == b.referenceEpoch and a.referenceCaptureSequence == b.referenceCaptureSequence
      and a.lastUsedEpoch == b.lastUsedEpoch and a.predictionTime == b.predictionTime and a.referenceTime == b.referenceTime;
    for i in 1:3 loop
      equal := equal and a.position[i] == b.position[i] and a.velocity[i] == b.velocity[i]
        and a.accelBias[i] == b.accelBias[i] and a.gyroBias[i] == b.gyroBias[i] and a.referencePosition[i] == b.referencePosition[i];
      for j in 1:3 loop equal := equal and a.rotation[i,j] == b.rotation[i,j] and a.referenceRotation[i,j] == b.referenceRotation[i,j]; end for;
    end for;
    for i in 1:15 loop
      for j in 1:15 loop equal := equal and a.covariance[i,j] == b.covariance[i,j]; end for;
      for j in 1:6 loop equal := equal and a.crossCovariance[i,j] == b.crossCovariance[i,j]; end for;
    end for;
    for i in 1:6 loop for j in 1:6 loop equal := equal and a.referenceCovariance[i,j] == b.referenceCovariance[i,j]; end for; end for;
  end Equal;
  function Oracle
    input SchmidtGraphPoseCorrection.State previous; input GraphGaugeUncertainty.Estimate graph;
    input Real weight; input Boolean constrained;
    output SchmidtGraphPoseCorrection.State expected;
    output Real H[12,21]; output Real Q[12,12]; output Real K[21,12]; output Real delta[21];
    output Real before[21,21]; output Real reset[21,21]; output Real nis; output Real D[12,12];
  protected
    Real P[21,21]; Real z[12]; Real e[3]; Real R[3,3]; Real priorR[3,3];
    Real plus[3]; Real minus[3]; Real chart[3,3]; Real d[3];
    Real C[21,12]; Real S[12,12]; Real rhs[12,22]; Real solved[12,22]; Real A[21,21]; Real result[21,21];
    Real epsilon=1e-6; Integer count; Integer offset; Integer stateOffset; Integer index;
  algorithm
    P := zeros(21,21); P[1:15,1:15] := previous.covariance;
    if previous.referenceAvailable then
      P[1:15,16:21] := previous.crossCovariance; P[16:21,1:15] := transpose(previous.crossCovariance); P[16:21,16:21] := previous.referenceCovariance;
    end if;
    H := zeros(12,21); D := zeros(12,12); z := zeros(12); count := if previous.referenceAvailable and graph.binding.currentId <> graph.binding.referenceId then 2 else 1;
    for node in 1:count loop
      offset := 6*(node-1); stateOffset := if node == 1 then 0 else 15;
      priorR := if node == 1 then previous.rotation else previous.referenceRotation;
      R := transpose(priorR)*graph.rotations[node,:,:];
      z[offset+1:offset+3] := graph.positions[node,:]-(if node == 1 then previous.position else previous.referencePosition);
      z[offset+4:offset+6] := Log(R);
      for axis in 1:3 loop
        H[offset+axis,stateOffset+axis] := 1; D[offset+axis,offset+axis] := 1;
        e := zeros(3); e[axis] := epsilon;
        plus := Log(GraphGaugeUncertaintyTests.Rotation(-e)*R); minus := Log(GraphGaugeUncertaintyTests.Rotation(e)*R);
        index := if node == 1 then 6+axis else 18+axis;
        H[offset+4:offset+6,index] := -(plus-minus)/(2*epsilon);
        plus := Log(R*GraphGaugeUncertaintyTests.Rotation(e)); minus := Log(R*GraphGaugeUncertaintyTests.Rotation(-e));
        D[offset+4:offset+6,offset+axis+3] := (plus-minus)/(2*epsilon);
      end for;
    end for;
    Q := zeros(12,12);
    if previous.referenceAvailable and graph.binding.currentId <> graph.binding.referenceId then Q := D*graph.covariance*transpose(D);
    else Q[1:6,1:6] := D[1:6,1:6]*graph.covariance[1:6,1:6]*transpose(D[1:6,1:6]); Q[7:12,7:12] := identity(6);
    end if;
    C := P*transpose(H)/weight; S := H*C+Q/(1-weight); rhs[:,1:21] := transpose(C); rhs[:,22] := z;
    solved := PivotSolve(S,rhs); K := transpose(solved[:,1:21]);
    if constrained then K[4:6,:] := zeros(3,12); K[10:15,:] := zeros(6,12); end if;
    delta := K*z; nis := z*solved[:,22]; A := identity(21)-K*H;
    before := A*P*transpose(A)/weight+K*Q*transpose(K)/(1-weight); reset := identity(21);
    for node in 1:(if previous.referenceAvailable then 2 else 1) loop
      index := if node == 1 then 6 else 18; d := delta[index+1:index+3];
      for axis in 1:3 loop
        e := zeros(3); e[axis] := epsilon;
        plus := Log(GraphGaugeUncertaintyTests.Rotation(-d)*GraphGaugeUncertaintyTests.Rotation(d+e));
        minus := Log(GraphGaugeUncertaintyTests.Rotation(-d)*GraphGaugeUncertaintyTests.Rotation(d-e));
        reset[index+1:index+3,index+axis] := (plus-minus)/(2*epsilon);
      end for;
    end for;
    result := reset*before*transpose(reset); result := (result+transpose(result))/2;
    expected := previous; expected.position := previous.position+delta[1:3]; expected.velocity := previous.velocity+delta[4:6];
    expected.rotation := previous.rotation*GraphGaugeUncertaintyTests.Rotation(delta[7:9]);
    expected.accelBias := previous.accelBias+delta[10:12]; expected.gyroBias := previous.gyroBias+delta[13:15]; expected.covariance := result[1:15,1:15];
    if previous.referenceAvailable then
      expected.referencePosition := previous.referencePosition+delta[16:18]; expected.referenceRotation := previous.referenceRotation*GraphGaugeUncertaintyTests.Rotation(delta[19:21]);
      expected.crossCovariance := result[1:15,16:21]; expected.referenceCovariance := result[16:21,16:21];
    end if;
  end Oracle;
  function Run
    input Real executionTime = 0;
    output Boolean checks[37];
  protected
    SchmidtGraphPoseCorrection.State previous; SchmidtGraphPoseCorrection.State expected;
    SchmidtGraphPoseCorrection.Policy policy; SchmidtGraphPoseCorrection.Attempt attempt;
    SchmidtGraphPoseCorrection.Result result; SchmidtGraphPoseCorrection.Result retry;
    GraphGaugeUncertainty.Estimate graph; GraphGaugeUncertainty.Binding binding;
    Real L[21,21]; Real P[21,21]; Real M[12,12]; Real H[12,21]; Real Q[12,12]; Real K[21,12];
    Real delta[21]; Real before[21,21]; Real reset[21,21]; Real nis; Real error;
    Real D[12,12]; Real latent[12,21]; Real U[21,21]; Real V[21,21];
    Real actual[21,21]; Real gramFactor[21,21]; Real gram[21,21]; Real retained[21,21]; Real sign;
    Boolean requested; Boolean shouldAccept; Boolean shouldAttempt; Integer reason; Integer index;
  algorithm
    checks := fill(false,37);
    for scenario in 1:37 loop
      binding := GraphGaugeUncertaintyTests.Binding(); graph.binding := binding;
      previous.position := {1,2,3}; previous.velocity := {0.4,-0.3,0.2}; previous.rotation := GraphGaugeUncertaintyTests.Rotation({0.2,-0.3,0.1});
      previous.accelBias := {0.01,0.02,0.03}; previous.gyroBias := {0.001,0.002,0.003};
      previous.referencePosition := {-1,1,2}; previous.referenceRotation := GraphGaugeUncertaintyTests.Rotation({-0.1,0.4,0.2});
      previous.referenceAvailable := true; previous.referenceUsed := true;
      previous.generation := binding.generation; previous.sourceRevision := binding.sourceRevision;
      previous.currentId := binding.currentId; previous.currentEpoch := binding.currentEpoch; previous.currentCaptureSequence := binding.currentCaptureSequence;
      previous.referenceId := binding.referenceId; previous.referenceEpoch := binding.referenceEpoch; previous.referenceCaptureSequence := binding.referenceCaptureSequence;
      previous.lastUsedEpoch := 250; previous.predictionTime := binding.currentTime; previous.referenceTime := binding.referenceTime;
      L := zeros(21,21); M := zeros(12,12);
      for i in 1:21 loop for j in 1:21 loop L[i,j] := (if i == j then 0.2 else 0)+0.0003*i*j; end for; end for;
      for i in 1:12 loop for j in 1:12 loop M[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
      P := L*transpose(L); previous.covariance := P[1:15,1:15]; previous.crossCovariance := P[1:15,16:21]; previous.referenceCovariance := P[16:21,16:21];
      graph.positions[1,:] := previous.position+{0.1,-0.08,0.06}; graph.positions[2,:] := previous.referencePosition+{-0.07,0.04,0.08};
      graph.rotations[1,:,:] := previous.rotation*GraphGaugeUncertaintyTests.Rotation({0.06,-0.04,0.03});
      graph.rotations[2,:,:] := previous.referenceRotation*GraphGaugeUncertaintyTests.Rotation({-0.03,0.02,0.05}); graph.covariance := M*transpose(M);
      policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := 0.4;
      attempt.generation := binding.generation; attempt.graphRevision := 0; attempt.factorProvenance := 0;
      requested := true; shouldAccept := true; shouldAttempt := true; reason := 0;
      if scenario == 2 then policy.constrainVelocityAndBias := true;
      elseif scenario == 3 then
        for i in 1:15 loop for j in 1:6 loop
          index := if j <= 3 then j else j+3; previous.crossCovariance[i,j] := previous.covariance[i,index];
        end for; end for;
        for i in 1:6 loop for j in 1:6 loop previous.referenceCovariance[i,j] := previous.covariance[if i <= 3 then i else i+3,if j <= 3 then j else j+3]; end for; end for;
      elseif scenario == 4 then
        previous.referenceAvailable := false; previous.referenceUsed := false; previous.referencePosition := fill(1e101,3); previous.referenceRotation := fill(-1e101,3,3);
        previous.crossCovariance := fill(1e101,15,6); previous.referenceCovariance := fill(-1e101,6,6);
        previous.referenceId := -7; previous.referenceEpoch := -8; previous.referenceCaptureSequence := -9; previous.referenceTime := -1;
        previous.lastUsedEpoch := -99; graph.positions[2,:] := fill(1e101,3); graph.rotations[2,:,:] := fill(-1e101,3,3);
        graph.covariance[7:12,:] := fill(1e101,6,12); graph.covariance[:,7:12] := fill(-1e101,12,6);
      elseif scenario == 5 then policy.weight := 0; shouldAccept := false; reason := 3;
      elseif scenario == 6 then policy.weight := 1; shouldAccept := false; reason := 3;
      elseif scenario == 7 then
        requested := false; previous.generation := -1; previous.covariance := fill(-1e101,15,15); graph.covariance := fill(1e101,12,12);
        shouldAccept := false; shouldAttempt := false; reason := 1;
      elseif scenario == 8 then previous.predictionTime := previous.predictionTime+0.01; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 9 then previous.sourceRevision := previous.sourceRevision+1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 10 then previous.referenceCaptureSequence := previous.referenceCaptureSequence+1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 11 then attempt.graphRevision := binding.graphRevision; attempt.factorProvenance := binding.factorProvenance; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 12 then policy.maximumPositionInnovation := 0.001; shouldAccept := false; reason := 6;
      elseif scenario == 13 then graph.rotations[2,:,:] := previous.referenceRotation*GraphGaugeUncertaintyTests.Rotation({3.1412,0,0}); shouldAccept := false; reason := 6;
      elseif scenario == 14 then previous.covariance := zeros(15,15); previous.crossCovariance := zeros(15,6); previous.referenceCovariance := zeros(6,6); graph.covariance := zeros(12,12); shouldAccept := false; reason := 7;
      elseif scenario == 15 then policy.maximumNis := 1e-10; shouldAccept := false; reason := 8;
      elseif scenario == 16 then previous.accelBias[1] := 2.01; shouldAccept := false; reason := 4;
      elseif scenario == 17 then previous.gyroBias[3] := 0.301; shouldAccept := false; reason := 4;
      elseif scenario == 18 then previous.accelBias[1] := 2; shouldAccept := false; reason := 9;
      elseif scenario == 19 then previous.crossCovariance[15,6] := 100; shouldAccept := false; reason := 5;
      elseif scenario == 20 then graph.binding.anchorBoundProvenance := graph.binding.anchorBoundProvenance+1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 21 then policy.weight := 0.8;
      elseif scenario == 22 then policy.constrainVelocityAndBias := true; policy.weight := 0.7;
      elseif scenario == 23 then policy.maximumAngularCorrection := 1e-10; shouldAccept := false; reason := 8;
      elseif scenario == 24 then graph.covariance[12,12] := -1; shouldAccept := false; reason := 5;
      elseif scenario == 25 then previous.covariance[15,14] := previous.covariance[15,14]+0.1; shouldAccept := false; reason := 5;
      elseif scenario == 26 then previous.rotation[3,3] := 2; shouldAccept := false; reason := 4;
      elseif scenario == 27 then previous.lastUsedEpoch := previous.currentEpoch+1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 28 then previous.currentCaptureSequence := previous.currentCaptureSequence+1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 29 then attempt.graphRevision := binding.graphRevision-1; attempt.factorProvenance := binding.factorProvenance; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 30 then attempt.graphRevision := binding.graphRevision-1; attempt.factorProvenance := binding.factorProvenance-1;
      elseif scenario == 31 then previous.referenceUsed := false; previous.lastUsedEpoch := -1;
      elseif scenario == 32 then previous.lastUsedEpoch := previous.referenceEpoch-1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 33 then previous.referenceUsed := false; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 34 then attempt.factorProvenance := 1; shouldAccept := false; shouldAttempt := false; reason := 2;
      elseif scenario == 35 then previous.referenceAvailable := false; shouldAccept := false; shouldAttempt := false; reason := 2;
      end if;
      result := SchmidtGraphPoseCorrection.Correct(previous,graph,binding,attempt,policy,requested);
      checks[scenario] := result.accepted == shouldAccept and result.reason == reason and result.attempted == shouldAttempt
        and result.nextAttempt.generation == attempt.generation
        and result.nextAttempt.graphRevision == (if shouldAttempt then binding.graphRevision else attempt.graphRevision)
        and result.nextAttempt.factorProvenance == (if shouldAttempt then binding.factorProvenance else attempt.factorProvenance);
      if shouldAccept then
        (expected,H,Q,K,delta,before,reset,nis,D) := Oracle(previous,graph,policy.weight,policy.constrainVelocityAndBias);
        error := max(abs(result.next.covariance-expected.covariance));
        checks[scenario] := checks[scenario] and error < 2e-7 and max(abs(result.measurementJacobian-H)) < 2e-8
          and max(abs(result.noise-Q)) < 2e-8 and max(abs(result.gain-K)) < 2e-7
          and max(abs(result.correction-delta)) < 2e-8 and abs(result.nis-nis) < 2e-8
          and max(abs(result.covarianceBeforeReset-before)) < 2e-7 and max(abs(result.resetJacobian-reset)) < 2e-8
          and max(abs(result.next.position-expected.position)) < 2e-8 and max(abs(result.next.velocity-expected.velocity)) < 2e-8
          and max(abs(result.next.accelBias-expected.accelBias)) < 2e-8 and max(abs(result.next.gyroBias-expected.gyroBias)) < 2e-8
          and max(abs(result.next.rotation-expected.rotation)) < 2e-8;
        if previous.referenceAvailable then
          checks[scenario] := checks[scenario] and max(abs(result.next.crossCovariance-expected.crossCovariance)) < 2e-7
            and max(abs(result.next.referenceCovariance-expected.referenceCovariance)) < 2e-7
            and max(abs(result.next.referencePosition-expected.referencePosition)) < 2e-8
            and max(abs(result.next.referenceRotation-expected.referenceRotation)) < 2e-8;
        else
          checks[scenario] := checks[scenario] and max(abs(result.next.crossCovariance-previous.crossCovariance)) == 0
            and max(abs(result.next.referenceCovariance-previous.referenceCovariance)) == 0
            and max(abs(result.next.referencePosition-previous.referencePosition)) == 0
            and max(abs(result.next.referenceRotation-previous.referenceRotation)) == 0;
        end if;
        // Every lifecycle field stays frozen even when both reference means move.
        expected := result.next; expected.position := previous.position; expected.velocity := previous.velocity; expected.rotation := previous.rotation;
        expected.accelBias := previous.accelBias; expected.gyroBias := previous.gyroBias; expected.covariance := previous.covariance;
        expected.crossCovariance := previous.crossCovariance; expected.referenceCovariance := previous.referenceCovariance;
        expected.referencePosition := previous.referencePosition; expected.referenceRotation := previous.referenceRotation;
        checks[scenario] := checks[scenario] and Equal(expected,previous);
        if scenario == 1 then for i in 1:21 loop checks[scenario] := checks[scenario] and abs(result.correction[i]) > 1e-9; end for; end if;
        if policy.constrainVelocityAndBias then
          checks[scenario] := checks[scenario] and max(abs(result.next.velocity-previous.velocity)) == 0
            and max(abs(result.next.accelBias-previous.accelBias)) == 0 and max(abs(result.next.gyroBias-previous.gyroBias)) == 0
            and max(abs(result.next.crossCovariance-previous.crossCovariance)) > 1e-5;
        end if;
        if scenario == 36 or scenario == 37 then
          // Perfect signed shared-latent graph/prior cross-correlation. The
          // covariance gap is independently a Gram matrix before AND after
          // both right-local resets, without assuming independent estimates.
          latent := zeros(12,21); latent[:,1:12] := D*M;
          U := (identity(21)-K*H)*L; V := K*latent; sign := if scenario == 36 then 1 else -1;
          actual := (U-sign*V)*transpose(U-sign*V);
          gramFactor := sqrt((1-policy.weight)/policy.weight)*U+sign*sqrt(policy.weight/(1-policy.weight))*V;
          gram := gramFactor*transpose(gramFactor);
          retained := zeros(21,21); retained[1:15,1:15] := result.next.covariance;
          retained[1:15,16:21] := result.next.crossCovariance; retained[16:21,1:15] := transpose(result.next.crossCovariance);
          retained[16:21,16:21] := result.next.referenceCovariance;
          checks[scenario] := checks[scenario] and max(abs(result.covarianceBeforeReset-actual-gram)) < 2e-7
            and max(abs(retained-reset*actual*transpose(reset)-reset*gram*transpose(reset))) < 2e-7;
        end if;
      else checks[scenario] := checks[scenario] and Equal(result.next,previous);
      end if;
      if scenario == 12 then
        policy := SchmidtGraphPoseCorrection.DefaultPolicy();
        retry := SchmidtGraphPoseCorrection.Correct(previous,graph,binding,result.nextAttempt,policy,true);
        checks[scenario] := checks[scenario] and not retry.accepted and not retry.attempted and retry.reason == 2 and Equal(retry.next,previous);
      end if;
    end for;
  end Run;
  function CloneState
    output SchmidtGraphPoseCorrection.State previous;
  protected Real L[15,15]; Integer indices[6] = {1,2,3,7,8,9}; GraphGaugeUncertainty.Binding b;
  algorithm
    b := GraphGaugeUncertaintyTests.Binding();
    previous.position := {1,2,3}; previous.velocity := {0.4,-0.3,0.2}; previous.rotation := GraphGaugeUncertaintyTests.Rotation({0.2,-0.3,0.1});
    previous.accelBias := {0.01,0.02,0.03}; previous.gyroBias := {0.001,0.002,0.003};
    previous.referencePosition := previous.position; previous.referenceRotation := previous.rotation;
    for i in 1:15 loop for j in 1:15 loop L[i,j] := (if i == j then 0.2 else 0)+0.0003*i*j; end for; end for;
    previous.covariance := L*transpose(L);
    for i in 1:15 loop for j in 1:6 loop previous.crossCovariance[i,j] := previous.covariance[i,indices[j]]; end for; end for;
    for i in 1:6 loop for j in 1:6 loop previous.referenceCovariance[i,j] := previous.covariance[indices[i],indices[j]]; end for; end for;
    previous.referenceAvailable := true; previous.referenceUsed := false; previous.lastUsedEpoch := -1;
    previous.generation := b.generation; previous.sourceRevision := b.sourceRevision;
    previous.currentId := b.currentId; previous.currentEpoch := b.currentEpoch; previous.currentCaptureSequence := b.currentCaptureSequence;
    previous.referenceId := b.currentId; previous.referenceEpoch := b.currentEpoch; previous.referenceCaptureSequence := b.currentCaptureSequence;
    previous.predictionTime := b.currentTime; previous.referenceTime := b.currentTime;
  end CloneState;
  function CloneGraph
    input SchmidtGraphPoseCorrection.State previous; output GraphGaugeUncertainty.Estimate graph;
  protected Real L[6,6]; Real Q[6,6];
  algorithm
    graph.binding := GraphGaugeUncertaintyTests.Binding();
    graph.binding.referenceId := graph.binding.currentId; graph.binding.referenceEpoch := graph.binding.currentEpoch;
    graph.binding.referenceTime := graph.binding.currentTime; graph.binding.referenceCaptureSequence := graph.binding.currentCaptureSequence;
    graph.positions[1,:] := previous.position+{0.1,-0.08,0.06}; graph.positions[2,:] := graph.positions[1,:];
    graph.rotations[1,:,:] := previous.rotation*GraphGaugeUncertaintyTests.Rotation({0.06,-0.04,0.03}); graph.rotations[2,:,:] := graph.rotations[1,:,:];
    for i in 1:6 loop for j in 1:6 loop L[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
    Q := L*transpose(L); graph.covariance[1:6,1:6] := Q; graph.covariance[1:6,7:12] := Q;
    graph.covariance[7:12,1:6] := Q; graph.covariance[7:12,7:12] := Q;
  end CloneGraph;
  function CloneRun
    input Real executionTime = 0;
    output Boolean checks[17];
  protected
    SchmidtGraphPoseCorrection.State previous; SchmidtGraphPoseCorrection.State expected;
    GraphGaugeUncertainty.Estimate graph; GraphGaugeUncertainty.Binding binding;
    SchmidtGraphPoseCorrection.Attempt attempt; SchmidtGraphPoseCorrection.Policy policy;
    SchmidtGraphPoseCorrection.Result result; SchmidtGraphPoseCorrection.Result retry;
    Real H[12,21]; Real Q[12,12]; Real K[21,12]; Real delta[21]; Real before[21,21]; Real reset[21,21]; Real nis; Real D[12,12];
    Real L[21,21]; Real M[6,6]; Real latent[12,21]; Real U[21,21]; Real V[21,21];
    Real actual[21,21]; Real gram[21,21]; Real factor[21,21]; Real retained[21,21]; Real sign;
    Boolean accepted; Boolean attempted; Boolean requested; Integer reason; Integer indices[6] = {1,2,3,7,8,9};
  algorithm
    for scenario in 1:17 loop
      previous := CloneState(); graph := CloneGraph(previous); binding := graph.binding;
      attempt.generation := previous.generation; attempt.graphRevision := 0; attempt.factorProvenance := 0;
      policy := SchmidtGraphPoseCorrection.DefaultPolicy(); policy.weight := 0.4;
      accepted := true; attempted := true; requested := true; reason := 0;
      if scenario == 2 then policy.constrainVelocityAndBias := true;
      elseif scenario == 3 then graph.binding.referenceEpoch := graph.binding.referenceEpoch-1; binding := graph.binding; accepted := false; attempted := false; reason := 2;
      elseif scenario == 4 then graph.binding.referenceTime := graph.binding.referenceTime-0.1; binding := graph.binding; accepted := false; attempted := false; reason := 2;
      elseif scenario == 5 then graph.binding.referenceCaptureSequence := graph.binding.referenceCaptureSequence-1; binding := graph.binding; accepted := false; attempted := false; reason := 2;
      elseif scenario == 6 then graph.positions[2,1] := graph.positions[2,1]+0.01; accepted := false; reason := 5;
      elseif scenario == 7 then graph.rotations[2,:,:] := GraphGaugeUncertaintyTests.Rotation({0.3,0.2,0.1}); accepted := false; reason := 5;
      elseif scenario == 8 then graph.covariance[7:12,7:12] := graph.covariance[7:12,7:12]+identity(6)*0.01; accepted := false; reason := 5;
      elseif scenario == 9 then previous.referencePosition[1] := previous.referencePosition[1]+0.01; accepted := false; reason := 5;
      elseif scenario == 10 then previous.referenceCovariance := previous.referenceCovariance+identity(6)*0.01; accepted := false; reason := 5;
      elseif scenario == 11 then previous.referenceAvailable := false; accepted := false; attempted := false; reason := 2;
      elseif scenario == 12 then requested := false; previous.covariance := fill(-1e99,15,15); accepted := false; attempted := false; reason := 1;
      elseif scenario == 13 then policy.weight := 0; accepted := false; reason := 3;
      elseif scenario == 14 then policy.maximumNis := 1e-12; accepted := false; reason := 8;
      elseif scenario == 15 then policy.weight := 0.8;
      end if;
      result := SchmidtGraphPoseCorrection.Correct(previous,graph,binding,attempt,policy,requested);
      checks[scenario] := result.accepted == accepted and result.attempted == attempted and result.reason == reason;
      if accepted then
        (expected,H,Q,K,delta,before,reset,nis,D) := Oracle(previous,graph,policy.weight,policy.constrainVelocityAndBias);
        checks[scenario] := checks[scenario] and max(abs(result.measurementJacobian-H)) < 2e-8 and max(abs(result.noise-Q)) < 2e-8
          and max(abs(result.gain-K)) < 2e-7 and max(abs(result.correction-delta)) < 2e-8
          and max(abs(result.covarianceBeforeReset-before)) < 2e-7 and max(abs(result.resetJacobian-reset)) < 2e-8
          and abs(result.nis-nis) < 2e-8 and max(abs(result.next.covariance-expected.covariance)) < 2e-7
          and max(abs(result.next.crossCovariance-expected.crossCovariance)) < 2e-7 and max(abs(result.next.referenceCovariance-expected.referenceCovariance)) < 2e-7
          and max(abs(result.next.position-expected.position)) < 2e-8 and max(abs(result.next.velocity-expected.velocity)) < 2e-8
          and max(abs(result.next.rotation-expected.rotation)) < 2e-8 and max(abs(result.next.accelBias-expected.accelBias)) < 2e-8
          and max(abs(result.next.gyroBias-expected.gyroBias)) < 2e-8 and max(abs(result.next.referencePosition-expected.referencePosition)) < 2e-8
          and max(abs(result.next.referenceRotation-expected.referenceRotation)) < 2e-8
          and max(abs(result.measurementJacobian[7:12,:])) == 0 and max(abs(result.gain[:,7:12])) == 0;
        for i in 1:3 loop
          checks[scenario] := checks[scenario] and result.next.referencePosition[i] == result.next.position[i];
          for j in 1:3 loop checks[scenario] := checks[scenario] and result.next.referenceRotation[i,j] == result.next.rotation[i,j]; end for;
        end for;
        for i in 1:15 loop for j in 1:6 loop checks[scenario] := checks[scenario] and result.next.crossCovariance[i,j] == result.next.covariance[i,indices[j]]; end for; end for;
        for i in 1:6 loop for j in 1:6 loop checks[scenario] := checks[scenario] and result.next.referenceCovariance[i,j] == result.next.covariance[indices[i],indices[j]]; end for; end for;
        if scenario == 1 then for i in 1:21 loop checks[scenario] := checks[scenario] and abs(result.correction[i]) > 1e-9; end for; end if;
        if scenario == 16 or scenario == 17 then
          L := zeros(21,21); M := zeros(6,6);
          for i in 1:15 loop for j in 1:15 loop L[i,j] := (if i == j then 0.2 else 0)+0.0003*i*j; end for; end for;
          for i in 1:6 loop L[i+15,:] := L[indices[i],:]; end for;
          for i in 1:6 loop for j in 1:6 loop M[i,j] := (if i == j then 0.3 else 0)+0.001*i*j; end for; end for;
          latent := zeros(12,21); latent[1:6,1:6] := D[1:6,1:6]*M;
          U := (identity(21)-K*H)*L; V := K*latent; sign := if scenario == 16 then 1 else -1;
          actual := (U-sign*V)*transpose(U-sign*V);
          factor := sqrt((1-policy.weight)/policy.weight)*U+sign*sqrt(policy.weight/(1-policy.weight))*V;
          gram := factor*transpose(factor);
          retained[1:15,1:15] := result.next.covariance; retained[1:15,16:21] := result.next.crossCovariance;
          retained[16:21,1:15] := transpose(result.next.crossCovariance); retained[16:21,16:21] := result.next.referenceCovariance;
          checks[scenario] := checks[scenario] and max(abs(result.covarianceBeforeReset-actual-gram)) < 2e-7
            and max(abs(retained-reset*(actual+gram)*transpose(reset))) < 2e-7;
        end if;
        retry := SchmidtGraphPoseCorrection.Correct(previous,graph,binding,result.nextAttempt,policy,true);
        checks[scenario] := checks[scenario] and not retry.accepted and not retry.attempted and Equal(retry.next,previous);
      else checks[scenario] := checks[scenario] and Equal(result.next,previous); end if;
    end for;
  end CloneRun;
end SchmidtGraphPoseCorrectionTests;
