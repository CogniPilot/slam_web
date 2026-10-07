# Correlated reference lifecycle

`models/SchmidtReferenceState.mo` stages a complete 15-current + 6-reference
estimator lifecycle in editable Modelica. The current error order is
`[dp,dv,dtheta,dba,dbg]`, with world-additive position/velocity, body biases and
right-local attitude. The frozen reference error is `[dp_reference,dtheta_reference]`.
It retains all 225 current covariance, 90 current/reference cross-covariance and
36 reference covariance entries. The complete source-issued ordered transaction
has now passed isolated Node and Chromium-worker numerical gates, with its
original full dimensions. It remains separate from the production filter.

The [transaction evidence](../dev/modelica-schmidt-reference-transaction-verification.json)
binds source `f8fe0faa…`, independent fixtures `9afd018e…`, immutable producer
`662903fb…` and the 788,486-byte module `b57eed18…`. Preparation completed in
175.138 seconds with 4,939,460 KiB peak RSS. The Node gate passed four test groups
and skipped four other component-artifact groups; its complete transaction
actually evaluated all 20 step cases. Those skips are not component acceptance.

The executed browser gate carries actual returned nominal, covariance and
image-epoch state through the coherent prediction/capture chain. Replacement,
accepted-observation, outlier and malformed-epoch trials branch from case 14;
case 19 follows the accepted correction from case 16. Across 6,596 carried cells
and 7,876 numerical checks, maximum error was `2.1391083349087125e-12`. Two
page/worker reloads restored source, artifact and complete state from IndexedDB;
reset/replay, read-only inputs for the 20 evaluated cases and stale-source digest
refusal passed. Browser execution took 10.146 seconds with 1,723,816 KiB peak RSS.

This is a precompiled isolated filter transaction. It does not establish browser
source compilation, actual edited-source compilation, live camera/IMU frontend
integration, mapping, loop closure, full SLAM or 10× realtime. Raw source, fixtures,
Solve, module, logs, resources and executed probe/oracle snapshots are preserved
under [the artifact archive](../dev/artifacts/schmidt-reference-transaction/).

## Prediction and reference capture

With independent fresh process noise, the joint prediction is

```
Pcc_next = Phi Pcc Phi^T + Q
Pcr_next = Phi Pcr
Prr_next = Prr
```

`ES15SchmidtPrediction` takes `Phi` and `Q` from the existing midpoint nominal
prediction, ES15 dynamics and covariance-prediction components. It does not
replace cross-covariance with an independence assumption. Reference nominal
position, rotation and reference attitude tangent remain fixed during prediction.
It validates the complete joint covariance when a reference exists, as well as
current/process covariances, finite inputs and proper rotations. Invalid or
zero-dt prediction preserves the incoming state. Unavailable reference buffers
are retained without assigning them a statistical meaning.

At capture the reference nominal equals the current nominal. Let `J` select
the current position and right-local attitude error columns (one-based 1–3 and
7–9). Creation and replacement both use

```
Pcr_next = Pcc J^T
Prr_next = J Pcc J^T
```

Current covariance is unchanged. Both attitude errors initially have the same
body tangent; no heading is invented. The resulting joint covariance is normally
singular, since the reference is a copy of the same uncertain pose. PSD validation
permits that relationship. An invalid replacement preserves the prior reference
nominal, availability and covariance; it does not zero shared uncertainty.

## Single-use raw-image pairs

State correlation does not account for measurement-noise correlation caused by
reusing a frozen RGB/depth image. The proposed initial policy therefore uses
disjoint image pairs: reference frame 0/current frame 1, then a fresh reference
frame 2/current frame 3. It does not recycle corrected current frame 1 as the
next reference.

`SchmidtImagePairGate` owns this policy in Modelica. Its epochs are nonnegative,
integer-valued `Real` identifiers bounded by `2^53-1`; `lastUsedEpoch=-1` is the
initial sentinel. A visual update requires an unused reference newer than the
last consumed image and a current epoch strictly newer than that reference.
Every eligible attempted update consumes the pair, including innovation rejection,
so repeated trials cannot select a favorable result from the same raw noise.
Capture requires a fresh current image newer than all consumed images and the
old reference. Modelica outputs the updated epoch, used flag and last-used epoch.
The host persists these outputs rather than making the eligibility decision.

`ES15SchmidtReferenceStep` orders prediction, optional gated relative correction
and optional fresh reference capture. Same-frame capture after an attempted
correction is refused. A rejected visual update or replacement still permits a
valid IMU prediction to advance. A fresh frame after an earlier consumed pair
may replace the reference even though another correction against that old
reference is refused. Repeated prediction with a frozen reference remains valid;
repeated visual correction against its reused image is blocked.

This conservative policy prevents image reuse within these transactions. It does
not establish independence of temporal sensor noise, geometric registration
errors, feature selection or map-based measurements. Reference admission must
also be tied to actual usable frame geometry when composing the frontend.

## Independent verification and component gates

The test-only oracle represents the full joint covariance as a Gram matrix of
shared latent factors. Prediction appends independent process factors; capture
selects current pose factor rows. A common 60 m² world-position uncertainty
remains in current, reference and cross blocks through twelve predictions and
replacement. A dense LDL test independently checks the complete 21×21 PSD
matrix, including the singular captured state. Physical stationary held-IMU
fixtures use a nilpotent dynamics exponential and four-node process-noise factor
quadrature, distinct from the Modelica component's three-node covariance formula.
Correction/capture ordering uses the existing independent quaternion,
finite-difference and Joseph/reset oracle; no expected values come from model outputs.

The latest run of `tests/compiler-probes/modelica-schmidt-reference.test.ts`
passed its three independent fixture/oracle tests and the actual complete-step
WASM gate. Four separate component-artifact gates remained skipped. The
source-bound fixture JSON contains every input and named expected output for five
model selectors; nonfinite inputs use `NaN`, `Infinity` or `-Infinity` strings.
The [earlier fixture-only evidence](../dev/modelica-schmidt-reference-verification.json)
remains historical; the accepted complete-step execution is recorded separately
in the transaction evidence above. Source edits, native preparation, module
execution and browser persistence are distinct acceptance stages.

The combined source concatenates, without separators, `RGBDRelativePose.mo`,
`SPD6Solve.mo`, `ES15PoseCorrection.mo`, `SchmidtRelativePoseCorrection.mo`,
`ES15NominalPrediction.mo`, `ES15Dynamics.mo`, `ES15CovariancePrediction.mo` and
`SchmidtReferenceState.mo`, in that order. Artifact environment variables are
`RUMOCA_SCHMIDT_REFERENCE_PREDICTION_ARTIFACT`,
`RUMOCA_SCHMIDT_REFERENCE_CAPTURE_ARTIFACT`,
`RUMOCA_ES15_SCHMIDT_PREDICTION_ARTIFACT`, `RUMOCA_ES15_SCHMIDT_STEP_ARTIFACT` and
`RUMOCA_IMAGE_PAIR_GATE_ARTIFACT`. `RUMOCA_SCHMIDT_REFERENCE_FIXTURES` writes the
independent fixtures used by the native/browser comparisons.

### Historical refusals before compact-call support

The following records precede the accepted transaction above and remain retained
unchanged.

The first full ordered-step native attempt stopped during resolution with MLS
§3.5: exact `Real` equality is not allowed outside functions. It produced no
Solve or WASM artifact and executed no numerical cases. The original source,
fixtures, immutable producer identity and refusal are preserved. The latest
TypeScript check passes after the separately owned ABI-guard test repair; its
earlier unrelated failure remains in the evidence. This early language refusal
does not establish any later compiler or numerical capability.

The repair places exact equality in `SLAMExactRealEqual`, whose function body
uses `left == right`, and replaces only the illegal model-level equalities.
The original and repaired independent expected fixture groups are identical.
The repaired full ordered step then passed resolution and reached construction
of the native assignment schedule, where its family certificate was refused:
`native family contains unsupported or effectful scalar operations`. Preparation
ended after 178.768 seconds with a 4,938,824 KiB peak. It issued neither a Solve
inventory artifact nor an executable module and ran zero numerical cases.

The original diagnostic printed only ScalarPrograms and attempted module
issuance before saving Solve. A separately checked test-only capture now saves
the complete checked Solve before issuance, then prints compact family
operations and issued-call provenance. Its two focused controls and strict
11-package checks pass; the initial diagnostic build failure is preserved.

One further unchanged-source capture ended with the same certificate refusal
after 175.302 seconds, with a 4,938,764 KiB peak. It retained the complete Solve,
including 1,163 scalar programs and 170 compact Map families. Source-order
admission identifies Map 133, operation 27: a primal `PureCall`, owner 38, for
`SLAMExactRealEqual(referenceAvailable,0.0)`. It takes two scalar Real arguments
and returns one scalar Boolean. The domain is `i=1:3`; its output rows
9944–9946 own Y cells 6741–6743. The issued call's source identity is the exact
decimal string `11643697360139376299`, at bytes 53930–53972 of the concatenated
source. The family's narrower span points to its binder `i`, so the call-owner
span supplies the useful source expression.

The compact native family certificate's operation whitelist in
`rumoca-ir-solve/src/refresh/native_assignment.rs` rejects this operation.
All preceding compact families use permitted operations; no other compact
family contains an unsupported prefix operation. This identifies the missing
compact-call certificate, without establishing that adding one would complete
the full model. At that historical frontier, the executable remained absent and zero ordered-step
numerical cases ran. Complete raw inventory, logs, source and compiler closure are retained
in [the diagnostic evidence](../dev/artifacts/schmidt-reference-family-inventory/manifest.json).
That diagnostic capture itself performed no model rewrite, reduced dimensions,
admission change or additional preparation. The later generic compact-call gate
and successful transaction are recorded separately above.

No ground truth or host numerical fallback enters these Modelica components.
Keyframe selection, map reanchoring, verified loop closure and graph covariance
handling remain separate integration requirements.

## Persistent transaction driver

[ModelicaSchmidtSession](../src/modelica-schmidt-session.ts) is a separate
integration prerequisite, with actual-WASM Node checks recorded in
[the session evidence](../dev/modelica-schmidt-session-verification.json).
It retains every returned nominal/reference field, all 351 covariance cells,
reference availability, image epochs and reuse state, plus all seven transaction
flags. Calibration, gravity and noise density are copied configuration; restore
requires the same calibration/configuration as the session's initial baseline.
Snapshots are defensive copies and source-bound JSON data.

`advance` consumes the measured intervals checked by `imuIntervals` with
`h <= .02`. It never subdivides or interpolates samples. Frames must be monotonic
and contiguous with retained time. Only the last measured interval receives a
relative observation or capture request; actual Modelica outputs supply each
following interval. Fractional finite camera epochs reach Modelica's rejection
gate. A prediction rejection or execution exception rolls back the whole native
memory and retained state; the host performs no covariance or pose mathematics.

The three focused tests evaluate the unchanged accepted artifact against the
19 positive-duration transaction fixtures, including real carry, correction
branches and continuation. Fixture zero is explicitly a host zero-duration
transport rejection; its separate actual-model behavior remains covered by the
20-case transaction gate above. Tests also cover multiple measured intervals,
input immutability, later injected execution failure, actual Modelica prediction
rejection, recovery, reset, source/calibration refusal and JSON restoration.
Reset returns to the baseline passed to `create`; a session recreated from a
saved snapshot therefore resets to that restored baseline.

The NEW session class now also passes an [actual dedicated Chromium-worker
gate](../dev/modelica-schmidt-session-browser-verification.json), separate from
the earlier direct-NativeProgram transaction probe. It checks the 19
positive-duration fixture cases plus explicit zero-duration transport refusal,
with 8,271 numerical checks and maximum error `2.1391083349087125e-12`. Two
page/worker reloads restore the source, artifact, baseline and retained state
from IndexedDB. A measured two-interval batch exactly matches the same samples
executed individually with observation/capture only on the final interval.
Reset, source/config refusal, 27 read-only native calls, later injected execution
failure rollback and actual prediction-rejection recovery pass. The bounded
browser gate took 11.428 seconds with 1,730,916 KiB peak RSS; this is verification
wall time, not a filter performance measurement. Whole-project TypeScript also
passes against the final test assertions. Executed probe/session snapshots and
the exact-hash consumer bundle are archived.

The driver remains separate from production presets. This browser proof executes
an archived precompiled module; it performs no browser source compilation or
actual edited-source compilation. Live frontend, mapping, loop closure and
realtime performance remain separate work.

The [verified driver copy optimization](../dev/modelica-schmidt-session-optimization-verification.json)
retains the same full module and state. Successful output cells are validated
and copied once per interval; one owned candidate copy per frame and a reusable
whole-memory checkpoint replace redundant internal clones. External snapshot,
source/config, transport and epoch/flag checks remain, and changed native memory
still requires re-instantiation. Five actual-WASM tests and the dedicated browser
controls pass, including rollback after a prior committed capture and defensive
snapshot/config isolation; final whole-project TypeScript passes.

A same-process old/new ABBA/BAAB comparison warmed each path for 300 calls and
measured 400 calls per path on identical measured IMU/reference trajectories.
Mean complete-driver time fell from 1.31359 ms to 1.15071 ms, a 12.4% reduction;
116,788 state-cell comparisons and flags matched bitwise. This is an isolated
persistent-driver result on shared-host CPU14 at nice15. It does not measure
sensors, rendering, mapping, full SLAM or 10× realtime. The original driver and
its earlier evidence remain archived separately.
