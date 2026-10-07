# Persistent Modelica SLAM processing

The staged `RGBDFastSLAMReset`, `RGBDFastSLAMInitialize` and `RGBDFastSLAMStep`
models take raw sensor inputs and carry one `RGBDGraphProcessing.State`.

The staged host now has [binary same-artifact memory checkpoints](native-program-memory-checkpoints.md),
verified through IndexedDB and a fresh worker after page reload. Complete State
transfer between these entrypoints still needs Rumoca-issued typed record
layout and input/carry metadata; byte checkpoints do not provide that recurrence.

`dev/export-rgbd-slam-source.mjs` and the opt-in browser assembler share one
manifest of56 authored dependencies, joined verbatim. The browser assembler
preserves per-file editor overrides and records exact source identities.
Its21 transport controls pass; an actual static Chromium build also assembled
the complete source and a policy edit successfully. This is source transport,
not compilation or numerical execution.
It performs no lowering, code generation or numerical processing; Rumoca owns
compilation. Production still runs the separately labeled inertial example.
The [source workspace](modelica-slam-source-workspace.md) now exposes those
files in the browser editor with complete local project persistence and
companion-aware Rumoca language services. Its static-browser UI acceptance
does not promote the staged numerical models to executable SLAM.

The state retains the learned appearance vocabulary, localization/filter, immutable capture catalog and graph,
anchored map, separate corrected PoseView, capture-birth ledger, consumed graph
attempt, and last accepted anchor/selected-bound receipts. Restore must carry
this complete source-bound state. Reconstructing poses from raw captures or
calling Reset would erase accepted graph corrections and attempt history.
Custom reset seeds require valid estimator rotation/covariance/mean domains.
The fresh constructor checks them immediately; separate executable controls
confirm valid seeds accept and invalid covariance/rotation seeds reject at the
production assertion.

No dictionary is supplied by the caller. Ordinary publication learns words from
fresh, exactly bound accepted image descriptors. Accepted localization can
retain partial learning while catalog/map/histograms hold. Once sufficient
measured descriptors freeze the dictionary, that same transaction can store
the first histogram. Later frames never retrain or replace word identities.
The dictionary shares generation, source revision and vocabulary version with
the catalog and commits atomically with the entire State. Restore carries words
and histograms together; separately mixing same-version payloads is unsupported.

Initialize executes the actual image initialization and ordinary publication at
time0. Step executes the actual image/IMU localization producer and publication,
then requests graph correction only after an accepted stored keyframe. Ordinary
images preserve surviving corrected means. Ring capture changes only its new
slot and increments the pose revision. Capture sequences come from actual
accepted processing steps, independently of catalog IDs and camera epochs.
The displayed quaternion comes from the final filter after graph processing.

Graph correction executes the real optimizer with a corrected warm start,
relinearizes the actual measured graph for its selected uncertainty, derives a
captured-anchor error bound, transports the full selected12D bound, and atomically
updates the full21-state filter and landmark geometry. Raw measured edges,
descriptors, capture poses and image-use receipts stay immutable. A late filter
or map refusal holds numerical state while preserving the consumed attempt.

Reference evidence now includes the
[31-control actual graph composition](../dev/artifacts/modelica-graph-processing-semantics/README.md)
and [12-control ordinary publication,3-control bootstrap and15-control learning/persistence](../dev/artifacts/modelica-localization-processing-semantics/README.md).
These execute full-capacity production functions on controlled mathematical
fixtures; they do not execute the complete raw-camera public model.
The graph composition was rerun against the updated covariance source:
`dev/artifacts/modelica-graph-processing-semantics/graph-processing-semantics-GtsBSk/`
passes all31 controls, with current/frozen source hashes and raw CSV independently
reviewed. The ordinary publication/bootstrap/learning receipts predate this
covariance change and remain evidence for their frozen source versions.

The exact pre-slot-guard55-file source SHA256
`4296d4a68d8977f3d47d12fdf432b1d95378ac2cdf1c4f65a13e8ce8a0730d5b`
was attempted in an actual browser compiler worker using PR382 head59f8c5e2's
published package, API0.10.2/revision04a6d4cf351d. It failed Typecheck on the
same lexical nested-record dimensions (`currentDimension`, `referenceDimension`,
`mapCapacity`, `dimension`), after2621.5ms. No executable was issued. Exact
source, manifest, compiler hashes, log and resources are preserved in
`dev/artifacts/pr382-59f8c5e2-slam-source/`. The slot-guard source is separately
frozen under `$HOME/scratch/slam_web/tmp/rgbd-slam-graph-processing-slot-guard/`,
SHA256 `c9692814c80127cd47f166dae874ef68435c8ebe5f592a74822243cfbac65069`.
No compiler pin or production runtime was promoted. The newer56-file owned
vocabulary source is frozen in `dev/artifacts/modelica-owned-vocabulary-source/`,
SHA256 `97c6ec3462afa7500956268fe0b8ef7fd2277b05188235f835b3af50ddcb406b`.
It has not been compiled with a newly fixed Rumoca package yet.

The paired full-information covariance preconditioner now passes11 operator
controls and all19 original strict covariance controls, including a separate
run using the actual default48-iteration parameter. The tested full-domain
fixtures reach1e-10 residual in42–46 iterations. These are reference numerical
results, not a general iteration guarantee or browser throughput measurement.
See the [current covariance evidence](../dev/artifacts/modelica-graph-covariance-semantics/README.md).

The updated56-file source is separately frozen in
`dev/artifacts/modelica-slam-browser-source/source-9jPloF/`, SHA256
`0b9ca166e55ffb00a0168e1724b1e18040434d0785172930997e48f0cf0d9ff0`.
The earlier source snapshots remain historical compiler reproductions.

The matcher subsequently gained ordered active-slot lists. Full350-slot input
validation and all outputs are preserved, while pair traversal visits only valid
slots (zero pairs on an empty current domain). All24 exact-output parity scenarios
and the29-check downstream loop-proposal reference gate pass. The current56-file
source is frozen in `dev/artifacts/modelica-matching-active-domain/full-slam-source/`,
SHA256 `9125e280df114716b125300371fcd5db5b968f8d3dc4e99b2015debea0d3eecf`.
See the [matching evidence](../dev/artifacts/modelica-matching-active-domain/README.md).
The preceding source snapshots and their complete-closure receipts remain
historical; this change does not claim a newly issued Rumoca artifact or skip
the whole image pipeline on IMU-only calls.

FAST and RGB-D grayscale/descriptor work now have Modelica array-function
acquisition guards, and selection skips score/heap work between acquisitions.
Full-size function reference tests and debugger disabled/enabled controls pass;
whole-model reference attempts still exceed preparation bounds. The current
56-file snapshot is `dev/artifacts/modelica-image-acquisition-guard/full-slam-source/`,
SHA256 `14fa1fe995332b516d712891e6e20fa72d2a364179c656c4510a2dadc11b8862`.
Shipped WASM parses it, establishing syntax only. See the
[image acquisition evidence](../dev/artifacts/modelica-image-acquisition-guard/README.md)
for exact scopes and retained failures. Matching validation, registration and
uncertainty were outside a single image-clock function boundary in that snapshot.

The newer ordered localization functions now compose raw acquisition,
registration, uncertainty, inertial prediction, full Schmidt correction,
reference ownership and map-candidate projection in Modelica. The public core
and FAST Step models forward to those functions. The core reference passes
16 scenarios/all57 outputs with independent expected values. FAST composition
passes14 scenarios, including actual FAST initialization and raw-pixel motion
on three depth planes; its full filter-output comparison depends on the
separately qualified core. These are individually seeded cases, not a complete
carried browser trajectory. All public adapter declarations and bindings have
been reviewed, but numerical execution of the public wrappers remains separate.
See [ordered localization evidence](../dev/artifacts/modelica-ordered-localization/README.md).

That historical56-file source is frozen at
`dev/artifacts/modelica-ordered-localization/full-slam-source/source.mo`, SHA256
`1d964bb30971f57775dab109cd0df1e91bfaf167a17022fd9167c7fa5c225d14`.
Published Rumoca syntax admission and fresh static-browser workspace/LSP/save/
reload checks pass. Complete typechecking, compiler-issued typed State carry,
worker execution and full browser SLAM are still unqualified.

The newer full lifecycle `InitializeFastSLAM` and `AdvanceFastSLAM` functions
now pass raw-image reference initialization, visual correction/map publication,
and a second catalog capture with measured odometry and actual graph correction.
Both public lifecycle models are thin39-input/27-output identity adapters;
their qualified function bodies are unchanged. This combined gate retains full
capacities, with78 active features and42 map points. It checks anchor/view/map
consistency, not independent truth-map accuracy, and covers fresh initialization
plus one subsequent frame. The separate seven-call carried FAST gate exercises
reference capture, blank loss/recovery and stale epochs below this outer layer.
See [raw composition evidence](../dev/artifacts/modelica-full-raw-composition/README.md).

A subsequent six-second controlled revisit passes30 complete-State advances,
retains three catalog keyframes, verifies a geometric bag-of-words loop to the
first capture, and accepts graph correction with consistent anchored mapping.
The intermediate frames reuse a shifted view before returning to the original;
this is not a city-flight accuracy benchmark. See
[raw loop evidence](../dev/artifacts/modelica-full-raw-loop/full-raw-loop-FqegCy/README.md).

The earlier exact56-file source, before rendered-image consensus fitting, is
`dev/artifacts/modelica-full-raw-composition/full-slam-source/source.mo`, SHA256
`616a974af8e575e2143cb97285c23e76b107736151e4ed6d37714bd37b95c7ec`.
Syntax/invalid-control and fresh static browser workspace checks pass. The
published compiler and active inertial runtime remain unchanged; full typed
State carry and browser SLAM execution remain pending.

Source-owned `AdvanceFastSLAMIntervals` now batches up to36 held-IMU intervals
and processes the camera image only at the final endpoint.26 full-capacity
reference cases pass complete-State/all-output sequential parity, chronology,
stale-image and whole-State rollback controls. An optional graph refusal retains
its consumed attempt receipt. The full-State comparison oracle is separately
mutation-tested over all176 reachable fields. These are OMC reference gates,
not browser execution or independent filter/trajectory accuracy; see
`dev/artifacts/modelica-full-raw-intervals/README.md`.
The optional `--intervals` exporter provides57 exact authored files without
changing the existing56-file saved workspace. Its earlier frozen source is SHA256
`f5566afc83d44f99e25a9a31f43eabad9690889716d4abaa80ca0c7f69579423`;
published syntax parsing passes, but typed SolveIR/WASM issuance remains pending.

Actual Three.js city RGB-D now passes a separate four-image OMC reference
replay through full initialization and held-IMU transactions. The first visual
pair accepts 23 candidates. Subsequent unweighted fits originally refused with
RMS 0.02749 m; bounded Modelica consensus retains 18 of 20 candidates and refits
to RMS 0.00790 m under the unchanged 0.02 m limit. Accepted uncertainty and tracking
share the certified inlier mask. Clean-fit parity, sparse 350-slot outlier recovery
and invalid-input controls pass a separate 24-check gate. Both failed city
receipts remain retained; see
[rendered-city evidence](../dev/artifacts/modelica-rendered-city-slam/README.md).
These four kinematic views exercise local tracking and anchored mapping, not
flight dynamics, long-duration accuracy, default street-center initialization or
city loop closure. Oracle poses remain separate evaluation data.
The current 57-file compiler-review export is
`dev/artifacts/modelica-rendered-city-slam/full-slam-source/source.mo`, SHA256
`31e8367d013356b924b0f2f2798e1fc22bbe31bab17e4f20dea5d987d2af4ae6`.

Remaining work includes full camera/initializer/public-model numerical
execution in Rumoca, source-bound browser state
transport/reset/reload, tracking/relocalization/loop trajectories, and measured
GPU/worker/WASM throughput. Independent vocabulary math passes43 controls;
its persistent publication now passes the additional controls above. The earlier
full equation-model initializer exceeded reference preparation limits,
including a120-second attempt with documented backend partial function
evaluation disabled. The ordered initializer and connected FAST initializer
functions have separate full-domain passing numerical receipts; those do not
qualify the public model or Rumoca WASM execution. The retained public-model
refusals have no numerical results.
Map geometry is not an independent filter measurement or landmark uncertainty
estimate. Full browser SLAM and10x realtime remain unqualified.
