package RGBDBodyEdgeTests
  // Independent checks use transformed physical points and finite differences
  // of the existing graph residual, rather than restating the transport formula.
  function Run
    input Real timeSeed;
    output Boolean checks[21];
  protected
    Real C[3,3]; Real t[3]; Real Ei[3,3]; Real Ej[3,3]; Real li[3]; Real lj[3];
    Real L[6,6]; Real Q[6,6]; Real D[3,3]; Real u[3]; Real J[6,6];
    Real S[6,6]; Real W[6,6]; Boolean valid; Integer reason; Real pivot;
    Real Ri[3,3]; Real Rj[3,3]; Real pi[3]; Real pj[3]; Real qi[3]; Real qj[3];
    Real delta[6]; Real plusC[3,3]; Real minusC[3,3]; Real plusT[3]; Real minusT[3];
    Real perturbedD[3,3]; Real perturbedU[3]; Real unusedJ[6,6];
    Real unusedS[6,6]; Real unusedW[6,6]; Boolean perturbedValid;
    Real plusResidual[6]; Real minusResidual[6]; Real unusedJi[6,6]; Real unusedJj[6,6];
    Real numericJ[6,6]; Boolean residualValid; Real epsilon; Real bad[6,6]; Real badRotation[3,3];
  algorithm
    checks := fill(false,21);
    epsilon := 1e-6;
    L := diagonal({0.04,0.05,0.06,0.008,0.01,0.012});
    L[2,1] := 0.01; L[4,2] := 0.002; L[5,1] := -0.003; L[6,3] := 0.001;
    Q := L*transpose(L);
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),Q,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,1e-10);
    checks[1] := valid and reason == 0 and max(abs(D-identity(3))) < 1e-12
      and max(abs(u)) < 1e-12 and max(abs(J-identity(6))) < 1e-12 and max(abs(S-Q)) < 1e-12;
    for fixture in 1:3 loop
      C := PGExp({0.07*fixture,-0.11*fixture,0.19*fixture});
      t := {0.3*fixture,-0.2,0.1*fixture};
      Ei := if fixture == 1 then identity(3) else PGExp({0.3,-0.2,0.5});
      Ej := if fixture < 3 then Ei else PGExp({-0.4,0.1,-0.3});
      li := if fixture == 1 then zeros(3) else {0.18,0.02,-0.04};
      lj := if fixture < 3 then li else {-0.1,0.03,0.07};
      (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(C,t,Q,Ei,Ej,li,lj,true,100.0,1e-10);
      Ri := PGExp({0.4,-0.2,0.7}); pi := {1.2,-0.6,0.8};
      Rj := Ri*D; pj := pi+Ri*u; qi := {0.8,-0.3,4.2}; qj := C*qi+t;
      checks[1+fixture] := valid and PGProperRotation(D)
        and max(abs((pi+Ri*(li+Ei*qi))-(pj+Rj*(lj+Ej*qj)))) < 1e-10;
      numericJ := zeros(6,6);
      for column in 1:6 loop
        delta := zeros(6); delta[column] := epsilon;
        plusC := PGExp(delta[4:6])*C; minusC := PGExp(-delta[4:6])*C;
        plusT := t+delta[1:3]; minusT := t-delta[1:3];
        (perturbedD,perturbedU,unusedJ,unusedS,unusedW,perturbedValid,reason,pivot) :=
          RGBDOpticalToBodyEdge(plusC,plusT,Q,Ei,Ej,li,lj,true,100.0,1e-10);
        (plusResidual,unusedJi,unusedJj,residualValid) := PGEdge(pi,Ri,pj,Rj,perturbedU,perturbedD);
        checks[1+fixture] := checks[1+fixture] and perturbedValid and residualValid;
        (perturbedD,perturbedU,unusedJ,unusedS,unusedW,perturbedValid,reason,pivot) :=
          RGBDOpticalToBodyEdge(minusC,minusT,Q,Ei,Ej,li,lj,true,100.0,1e-10);
        (minusResidual,unusedJi,unusedJj,residualValid) := PGEdge(pi,Ri,pj,Rj,perturbedU,perturbedD);
        checks[1+fixture] := checks[1+fixture] and perturbedValid and residualValid;
        numericJ[:,column] := (plusResidual-minusResidual)/(2.0*epsilon);
      end for;
      checks[4+fixture] := max(abs(J-numericJ)) < 1e-8;
      checks[7+fixture] := max(abs(S-numericJ*Q*transpose(numericJ))) < 1e-10;
      checks[10+fixture] := max(abs(S*W-identity(6))) < 1e-9
        and max(abs(S-transpose(S))) < 1e-14 and max(abs(W-transpose(W))) < 1e-14;
    end for;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(fill(1e101,3,3),fill(1e101,3),
      fill(1e101,6,6),identity(3),identity(3),zeros(3),zeros(3),false,0.0,0.0);
    checks[14] := not valid and reason == 1 and max(abs(D-identity(3))) == 0.0
      and max(abs(u)) == 0.0 and max(abs(J)) == 0.0 and max(abs(S)) == 0.0 and max(abs(W)) == 0.0;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),Q,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,0.0);
    checks[15] := not valid and reason == 2 and max(abs(S)) == 0.0;
    badRotation := identity(3); badRotation[3,3] := -1.0;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(badRotation,zeros(3),Q,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,1e-10);
    checks[16] := not valid and reason == 3 and max(abs(J)) == 0.0;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),Q,
      identity(3),identity(3),zeros(3),{1e101,0.0,0.0},true,100.0,1e-10);
    checks[17] := not valid and reason == 3 and max(abs(W)) == 0.0;
    bad := identity(6); bad[6,6] := -1.0;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),bad,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,1e-10);
    checks[18] := not valid and reason == 4 and max(abs(S)) == 0.0;
    bad := identity(6); bad[2,1] := 0.1;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),bad,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,1e-10);
    checks[19] := not valid and reason == 4 and max(abs(S)) == 0.0;
    bad := identity(6); bad[1,2] := 0.99999999; bad[2,1] := bad[1,2];
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),bad,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,1e-6);
    checks[20] := not valid and reason == 4 and max(abs(W)) == 0.0;
    bad := identity(6); bad[6,6] := 0.0;
    (D,u,J,S,W,valid,reason,pivot) := RGBDOpticalToBodyEdge(identity(3),zeros(3),bad,
      identity(3),identity(3),zeros(3),zeros(3),true,100.0,1e-10);
    checks[21] := not valid and reason == 4 and max(abs(W)) == 0.0;
  end Run;
end RGBDBodyEdgeTests;
