`RGBDOpticalToBodyEdge` converts a verified optical registration and its
first-order covariance into the body-frame product residual used by
`ModelicaPoseGraph`. It does not match features, verify a retrieved loop,
admit an edge, or make reused image noises independent.

The registration convention is `q_current = C*q_reference + t`, with covariance
ordered as independent translation increment `dt` followed by left optical
angle increment `dtheta`: `C_perturbed = Exp(dtheta)*C`, `t_perturbed = t+dt`.
This is the convention of `RGBDRegistrationSandwich`.

Let `Ei`, `Ej` map optical coordinates to reference/current body coordinates,
and `li`, `lj` be the camera origins in those bodies. The graph measurements are

```text
A = Ei * transpose(C)
D = A * transpose(Ej)
arm = t + transpose(Ej)*lj
u = li - A*arm
```

Here `D` maps current body coordinates into reference body coordinates and `u`
is the current body origin expressed in the reference body. The graph residual
is `[transpose(Ri)*(pj-pi)-u, Log(transpose(D)*transpose(Ri)*Rj)]`. At the nominal
measurement, its Jacobian with respect to optical measurement noise is

```text
J = [ A, A*skew(arm) ]
    [ 0, Ej          ]
```

The residual covariance is `J*opticalCovariance*transpose(J)`; its checked SPD
inverse is the graph information matrix. This transport preserves translation/
angle cross-covariance and includes the current camera lever arm. A general
coupled SE(3) adjoint formula would use a different perturbation/residual chart.
The reference lever arm affects the nominal translation but cancels from this
measurement-noise Jacobian.

The source rejects malformed configuration, rotations, origins and covariance.
No covariance damping or floor converts a singular measurement into an accepted
constraint. Only accepted roundoff asymmetry is averaged. Invalid/disabled
measurements return identity rotation and zero translation/Jacobian/covariance/
information; consumers must gate on `valid`. Rejection reasons are 1 disabled,
2 configuration, 3 geometry, 4 optical covariance, 5 transported covariance.

All 21 test-only OMC controls passed: physical point consistency with different
extrinsics/lever arms, finite differences of all 36 Jacobian entries through
`PGEdge`, covariance congruence with a correlated optical covariance, information
inverse/symmetry, and invalid/disabled refusals. Evidence is in
`dev/artifacts/modelica-body-relative-edge-semantics/`. This proves component
semantics, not Rumoca WASM execution or full SLAM.

The actual October 6 browser producer for PR tip `87b5570` refuses this model
with `native assignments reject states, initialization equations, events,
clocks, and external tables`. A separate public `compile` diagnostic using the
same WASM shows a balanced 123-equation model, no event roots/actions, clocks,
initialization equations or previous values, and one always-active discrete
owner for the Boolean `valid` and Integer `rejectionReason` outputs. Native
profile admission for stateless typed values needs compiler qualification;
the application has not replaced these outputs with floating-point flags.
Exact source/probe/module bindings and diagnostic receipts are in
`dev/artifacts/pr382-87b5570-browser-source-gates/`.
