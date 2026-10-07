# Graph pose correction in Modelica

`SchmidtGraphPoseCorrection.Correct` is a staged source-owned correction of the
current15-state estimate and its retained6-state reference. It consumes
`GraphGaugeUncertainty.Estimate`, including the full12D covariance and shared
anchor uncertainty. Production still runs the inertial example. Browser issuance,
whole-session integration and complete SLAM are not established here.

The full21/12 correction passes54 independent reference controls; the full12/6
gauge transport passes37, including exact same-capture selection. The current numeric-source-revision receipts are linked
from [correction evidence](../dev/artifacts/modelica-graph-pose-correction-semantics/README.md)
and [gauge evidence](../dev/artifacts/modelica-graph-gauge-uncertainty-semantics/README.md).
The oracles use a separate pivoted solve and finite differences of the actual
rotation maps. These are controlled-component reference results. Actual browser
preparation of the gauge component still refuses a Rumoca record-constructor
owner; no browser numerical result or full graph execution is implied.

The package retains all current nominal components, the reference nominal and
all15x15,15x6,6x6 covariance blocks. Exact generation/source/capture identities,
reference birth and acquisition times bind the proposal to the represented
states. Prediction time must equal the graph current-image time. A graph pose
from an earlier image cannot correct a later propagated state through this API.
The outer session must supply a retained clone or replay owner for delayed work.

For rotation innovation `z=Log(R_prior^T R_graph)`, the prior-error Jacobian is
the inverse left SO(3) Jacobian and graph-noise transport uses the inverse right
Jacobian. Position errors are additive ENU; both attitude errors are body
right-local. Near-pi rotations refuse. These conventions follow the local
perturbation and Jacobian definitions in [Sola's original
derivation](https://arxiv.org/html/1711.02508v1). The tests must differentiate the
actual manifold maps independently rather than reuse these production helpers.

Graph and prior errors may have unknown cross-correlation because both reuse
images. For explicit `0<weight<1`, the gain solves
`S=H*(P/weight)*H^T+Q/(1-weight)` and `K=(P/weight)*H^T*S^-1`.
An equilibrated SPD12 Cholesky solve carries22 right-hand sides, checks residuals
and refuses nonpositive pivots; no damping or retained covariance jitter is added.
The complete covariance bound is
`(I-KH)*(P/weight)*(I-KH)^T+K*(Q/(1-weight))*K^T`.
The unknown-cross bound is conditional on valid input error bounds and a valid
local linearization. It does not certify correspondence selection, nonlinear
registration bias or the optimizer's covariance.

The full gain can change velocity and body biases through the prior cross terms.
An explicit experimental constraint zeros only their gain rows; the complete
covariance calculation remains, including changed cross terms and increased
uncertainty. Both attitude corrections inject on the right, and the full21D
covariance is transported by both right Jacobians. Pcc/Pcr/Prr are extracted from
one symmetric result. The package never replaces cross covariance with zero or
restores old blocks after updating the mean.

Without a retained reference, only the graph current-pose marginal is consumed.
Six neutral solver rows have zero H/K action; their unit covariance is internal
padding, not a physical reference observation or retained uncertainty. All
unavailable reference mean/covariance buffers remain exactly as supplied. The
available-reference branch validates the full joint21D prior, including singular
PSD clones; it does not require a strictly positive21D prior. The innovation
system must still be SPD. Final pose, velocity, bias and covariance domains are
checked before the complete numerical state commits.

Disabled calls and every refusal return the complete incoming numerical State.
A fresh correctly bound graph proposal consumes a separate Attempt before policy
or numerical checks. The returned attempt remains consumed on numerical refusal;
the enclosing session must persist it separately from numerical rollback. Stale
bindings, repeated graph revisions, reused factor-provenance tokens and malformed
attempt histories refuse before attempting fusion. A fresh generation starts with
an explicit matching generation and zero revision/provenance. Pose correction
does not change image epochs, reference-used flags, last-used epochs or capture
birth tokens. These tokens and numeric source revisions are caller identity
assertions; the compiler/session still must verify the exact source digest and
raw-factor provenance at artifact loading and whole-state publication. Numeric
source revisions use the same convention as the localization/catalog State.

Reasons:0 accepted,1 disabled,2 binding/replay/history,3 policy,4 nominal domain,
5 prior/graph covariance,6 innovation/log chart,7 SPD solve,8 NIS/correction size,
9 injected nominal domain,10 reset covariance. There is no production fallback.

The full128/256 optimizer now passes20 reference controls and the separate
atomic graph-pose/filter/map commit passes30 controlled-proposal checks, including
all14400 landmark reprojections and late rollback. Corrected poses survive
subsequent mapping through an explicit PoseView owner; raw captures stay immutable.
These reference gates do not issue or integrate a browser program.

The [outer processing owner](modelica-slam-processing.md) now connects the actual
optimizer, captured-anchor bound, typed selection and atomic commit in31 passing
reference controls. Ordinary publication/bootstrap pass12+3 controls including
corrected-pose retention and anchor eviction;15 additional controls cover
owned vocabulary learning, persistence and rollback. Strict covariance convergence,
raw-camera public-model execution and whole-state browser
initialization/stepping/restore remain unqualified.
See [the remaining correction design](../dev/graph-estimator-correction-design.md).
