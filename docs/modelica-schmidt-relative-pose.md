# Correlated relative-pose correction

`models/Estimation/Inertial/SchmidtRelativePoseCorrection.mo` proposes a correction of the current
15-state inertial estimate while retaining a six-state reference pose as a
Schmidt state. It does not treat that reference as pose truth. The current error
order is `[dp,dv,dtheta,dba,dbg]`; the augmented order appends
`[dp_reference,dtheta_reference]`. Positions are additive in world axes and
attitudes are right-local: `R_true = R Exp(dtheta)`.

The host must retain and propagate the **complete** current/reference
cross-covariance. Supplying independent reference covariance for a correlated
keyframe is a different, generally inconsistent statistical model. This
component does not derive that covariance, propagate it through IMU prediction,
create references, correct map frames, or establish registration independence.
Repeated use of reused RGB/depth measurements also creates temporal correlation
that this single-measurement model does not eliminate.

## Observation and Jacobian

Let `B` map optical RDF axes to body axes, `o` be the camera origin in body axes,
and `(Rc,pc)`, `(Rr,pr)` be current/reference body poses. Registration supplies
`x_current_optical = Z x_reference_optical + t_measured`. Prediction is

```
A = B^T Rc^T
d = Rc^T (pr-pc+Rr o)
U = B^T Rc^T Rr B
t = B^T (d-o)
r = [t_measured-t; Log(U^T Z)]
```

This is a product of an optical translation residual and an SO(3) logarithm,
not the full SE(3) logarithm. With `[v]x` denoting the cross-product matrix,
`H = -dr/d(error)` has translation blocks

```
H_pc = -A             H_theta_c = B^T [d]x
H_pr =  A             H_theta_r = -A Rr [o]x
```

and angular blocks

```
H_theta_c = -Jl^-1(r_angle) U^T B^T
H_theta_r =  Jl^-1(r_angle) B^T
```

All velocity/bias columns are zero. Their corrections can still be nonzero
through genuine prior cross-correlation. These signs follow from perturbing
`U`: current right-local perturbations left-multiply it by
`Exp(-B^T dtheta_c)`, while reference perturbations right-multiply it by
`Exp(B^T dtheta_r)`.

`relativeCovariance` is ordered `[translation; left-current-optical rotation]`:
`Z_measured = Exp(noise_angle) Z`. Its residual-noise map is
`N = diag(I, Jr^-1(r_angle) Z^T)`. Translation/rotation cross terms are retained.
Using a covariance expressed in another tangent without transforming it is
incorrect.

## Schmidt update

The model builds the complete symmetric 21×21 prior from its 15×15, 15×6 and
6×6 inputs. With `V=N relativeCovariance N^T`, it computes
`S=H P H^T+V` and `K=[(P H^T)_current S^-1; 0]`. The reference nominal state and
reference covariance remain unchanged; its uncertainty and cross-correlation
still enter the innovation covariance and current gain.

The covariance uses the full Joseph expression
`(I-KH) P (I-KH)^T + K V K^T`. Current attitude injection is
`Rc_next=Rc Exp(correction_theta)`; only that tangent is reset with the exact
right Jacobian `Jr(correction_theta)`. The reset also transforms current/reference
cross-covariance. Reference attitude remains in its retained right-local basis.

The prior validation permits PSD covariance with a small scale-relative test
jitter; that jitter is never added to returned covariance. Measurement noise
and innovation solve must be strictly positive definite. Invalid geometry,
covariance, disabled measurements, excessive NIS or angular innovation return
the supplied nominal state and covariance unchanged. This is a proposed update,
not a persistent filter or an absolute covariance observation.

## Verification boundary

The complete source-issued component now passes 35 independent cases in an
actual Chromium dedicated worker: 18 accepted observations and 17 rejected
observations. The browser gate checks 25,311 scalar values, immutable inputs,
rejection recovery, exact reset replay, stale-source refusal and IndexedDB
source/artifact/input persistence across page and worker reload. It retains
all 225 current covariance, 90 cross-covariance and 36 reference covariance
cells. [Browser evidence](../dev/modelica-schmidt-browser-verification.json).
This executes a precompiled artifact; compilation in the browser and persistent
filter integration remain separate requirements. The initial browser launch
failed because its temporary socket path exceeded the Unix limit; shortening
the HOME-derived Scratch temporary path fixed launch without changing source,
module, fixtures or numerical checks. The successful review was restricted to
one CPU at nice 15 and is not a throughput benchmark.

`tests/compiler-probes/schmidt-relative-fixtures.ts` independently composes
Hamilton quaternions, projects optical landmarks, differentiates all 21 state
columns and six noise columns, solves with partial-pivot Gaussian elimination,
and differentiates the injection reset. It does not copy the model's Cholesky
or analytic Jacobian implementation and is never imported by the application.
The common-position test adds the same random world translation to current and
reference states with the corresponding cross-covariance. Relative `S` and
gain stay unchanged, and 40 m² of common uncertainty remains in the posterior.
Removing the cross-correlation demonstrates the erroneous covariance collapse.

The optional full-state source-issued numerical gate is enabled by
`RUMOCA_SCHMIDT_RELATIVE_ARTIFACT`; it checks all 15+6 dimensions, rotated/lateral
mounts, correlated covariance, model rejection/state preservation, parameter
immutability, recovery, reset, JSON reload and stale-source refusal. Absence of
an artifact is an explicit skipped gate, not numerical acceptance. Exact native
preparation attempts and their failures are recorded in
`dev/modelica-schmidt-relative-verification.json`.

The final complete source **passed Node WebAssembly execution** for 35 cases:
18 accepted corrections and 17 rejections. The 21-state manifold Jacobian agrees
with finite differences to `2.62e-10`; the returned covariance agrees with the
independent Joseph/reset oracle to `1.06e-9`. The common-position fixture retains
`40.001218 m²` from a `40.0016 m²` prior; incorrectly dropping the reference
cross-correlation instead produces `20.001867 m²`. The source-issued module is
140,530 bytes. Preparation took 158.319 seconds under a bounded diagnostic run
with a 3,993,368 KiB peak; this is not a whole-pipeline throughput claim.

Three app-level composition fixes preserve the full mathematical workload:
explicit Jacobian/gain/reset blocks avoid unselected invalid indices; the full
21×21 PSD check uses sequential factor ordering and finite For accumulation;
and an equal `21 -> 21` child parameter modification is omitted so it does not
create an unnecessary initialization transaction. Original projection,
initialization and unsupported typed-Map refusals are retained as evidence.
The numerical artifact and complete independent browser fixtures are bundled
under `dev/artifacts/schmidt-relative-pose/`. Browser worker/persistence
acceptance and connection to the production filter are separate gates.

The convention and reset derivation follow Joan Solà's
[Quaternion kinematics for the error-state Kalman filter](https://arxiv.org/abs/1711.02508).
Keeping nuisance-state gain zero while preserving cross-correlation follows
the Schmidt formulation described by Geneva et al. in
[An Efficient Schmidt-EKF for 3D Visual-Inertial SLAM](https://arxiv.org/abs/1903.08636).
Those references do not establish that this application component or its
unconnected frontend is a complete, observable visual-inertial SLAM system.
