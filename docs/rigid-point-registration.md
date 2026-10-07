# Modelica matched-point rigid registration

[RigidPointRegistration.mo](../models/Math/RigidPointRegistration.mo) fits a proper rigid transform from matched source points to target points. Its default capacity is the complete 160×90 image domain, 14,400 pairs. It consumes matched geometry, without pose truth. Correspondence matching, temporal pose composition, error-state correction and mapping remain separate work; this component is not full visual odometry or SLAM.

The editable Modelica function makes three ordered passes over the complete input arrays: validity and centroids, centered source/cross-covariance, then fitted residuals. Horn's symmetric 4×4 quaternion matrix supplies the rotation through a normalized, bounded 24-sweep cyclic Jacobi function. Translation is target centroid minus rotated source centroid. The public convention is `targetPoint = rotation * sourcePoint + translation`.

Inputs are `sourcePoint[capacity,3]`, `targetPoint[capacity,3]`, `pairEnabled[capacity]` and `activeCount`. The count must be finite, integral and within `0..capacity`; it is never clipped. A flag of exactly zero disables a pair. A flag of exactly one requests a pair with all six coordinates bounded by the editable `coordinateLimit`, default `1e6`. Invalid active flags or requested coordinates reject the observation. Disabled coordinates stay out of arithmetic through conditional Modelica control flow. Parameters also expose `rankTolerance`, default `1e-8`, and `maximumRms`, default `0.02` in the input coordinate unit.

Outputs include `rotation[3,3]`, `translation[3]`, both centroids, valid/invalid counts, source covariance rank, fitted squared cost, RMS, the Horn eigenvalue gap, `accepted` and `rejectionReason`. Non-collinear planar geometry is admissible at rank two; collinear or coincident geometry is refused. Degenerate dominant eigenvectors, an unconverged eigensolver and excessive fitted RMS also refuse the observation. Every refusal returns identity rotation and zero translation. Diagnostic cost describes the candidate fit, without publishing it as an accepted pose.

| Reason | Meaning |
| --- | --- |
| 0 | Accepted |
| 1 | Invalid count, shape or parameter domain |
| 2 | Invalid active correspondence |
| 3 | Fewer than three valid pairs |
| 4 | Source rank below two or degenerate Horn eigenvalue gap |
| 5 | Jacobi off-diagonal residual exceeds the convergence bound |
| 6 | Fitted RMS exceeds the configured gate or is nonfinite |

The [actual-WASM probe](../tests/compiler-probes/modelica-rigid-point-registration.test.ts) contains independent analytic Rodrigues transforms and complete-image fixtures with known covariance and residuals. It checks all 14,400 correspondences, plane/line/coincident geometry, near-half-turn rotation, proper rotation under reflection, finite noisy residuals, invalid/masked last pairs, count domains, recovery, reset/replay and an edited Modelica residual threshold. Its 12-pair control is separate numerical evidence and cannot establish complete-image admission. Ordinary `WasmSimulationSession` execution and compiler-issued native program admission are separate probe modes.

The [verification record](../dev/modelica-rigid-point-registration-verification.json) currently marks the compact function revision **pending actual WASM acceptance**. The original full-domain equation reduction layout failed in Flatten with a WASM stack overflow in `simplify_zero_sized_reductions`, before creating a simulation session. Its exact source hash, failing stack owner and bounded-process measurement are retained in the record. The compact revision preserves the algorithm and pair order in Modelica; numerical execution and native profile support remain to be demonstrated. There is no host registration fallback and no full-SLAM or performance claim.

Run an explicit reviewed-package probe with `RUMOCA_BRANCH_PKG` set to that package directory, `RUMOCA_REGISTRATION_REPORT` set to an output JSON path, and `RUMOCA_REGISTRATION_MODE` set to `compile`, `full`, `control` or `native`. Use the existing compiler-probe Vitest configuration and a separately bounded process for each mode; full numerical acceptance always uses the unchanged 14,400-capacity model.
