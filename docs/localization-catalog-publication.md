# Modelica localization and mapping publication

The authored composition now exists, but is staged. Production still runs the
explicit inertial-only preset. No source-issued full browser pipeline, loop
correction or10x throughput is established here.

`RGBDFastCatalogLocalizationInitialize` invokes the time-zero initializer once;
it contains no IMU prediction. `RGBDFastCatalogLocalizationStep` invokes the
positive-duration FAST/localization pipeline once. Both pass the exact feature
domain, pose and covariance through `RGBDLocalizationFrame.Build`, then publish
through `RGBDLocalizationCatalog.Publish`. They share
`RGBDLocalizationCatalogInterface`: raw90x160 images, actual calibration and
IMU data, one complete carried State, acquisition identity/time, vocabulary and
source parameters. Image dimensions and feature/descriptor capacities are named
constants. No application-side descriptor, projection, registration, covariance
or catalog math was added.

## Complete state and publication

State retains current position/velocity/rotation/body biases, all15x15 current,
15x6 cross and6x6 reference covariance, reference nominal and raw350x49 image
snapshot, calibration/extrinsics/noise, reference epoch/use ledger,128 keyframes,
256 raw measured graph edges,14400 anchored landmarks, generation/source revision,
prediction timestamp, completed camera-attempt identity/time and reference birth.
`predictionTime` is a carried timestamp, distinct from the Modelica built-in
simulation variable `time`.

The full current covariance and, when available, complete correlated21-state
covariance must pass the existing PSD check. A reference clone is singular PSD;
publication neither requires SPD21 nor adds covariance jitter. Nominal bounds
match the existing localization producers. Reference capture must clone all
cross/reference covariance from the selected current pose indices and issue an
exact birth epoch/sequence. Otherwise its mean, marginal covariance and enabled
raw snapshot are immutable; publication retains opaque inactive/unavailable
snapshot cells from their previous owner.

The birth sequence is the accepted processing-step identity at creation
(`previous.steps+1`), rather than the number of reference replacements. This is
the same sequence domain used for current-state graph binding. A reference born
at step1 and replaced after step199 receives birth sequence200, preserving a
meaningful identity when processing continues between captures. The controlled
publication gate now retains its original18 cases plus this explicit regression.
Its current19-check receipt is
`dev/artifacts/modelica-localization-catalog-semantics/localization-catalog-semantics-rbuMbz/`.

An accepted prediction commits its entire estimator and evaluated-pair ledger
even if optional frame building, registration or map admission refuses. A
completed image also advances a separate acquisition receipt, preventing retry
of that image after optional mapping refusal. Raw-image consumption and catalog
storage are distinct: storing a filter-used image is allowed once, but is not
an independent estimator measurement. A rejected producer holds the whole
previous State. Backend faults and multi-interval batch rollback still require
the compiler/host transaction contract; these pure-function checks do not prove
those behaviors.

Reference birth gets a catalog ID only when that same image is actually stored.
Local references captured between keyframes retain catalogId0; a guessed latest
keyframe ID is never substituted. Candidate world points come from the same
localization invocation's calibrated projection. Publish checks the exact
frame identity, pose and all36 pose-covariance cells before optional mapping.
Capture-only retrieval and registration remain inside the existing capture
branch; noncapture images still update/prune the anchored map.

## Clock and computational guards

Initialization requires a fresh generation at exact time0. Positive-duration
steps require a contiguous interval with0<h<=0.02; no fake negative start,
epsilon camera time or zero-duration prediction is used to bootstrap. Replay
images disable the frontend under the acquisition receipt while a legitimate
later IMU interval may still propagate. Publication rechecks chronology and
source identity domains. A future Modelica substep/batch owner is required for
larger held intervals; the host must not invent numerical subdivisions.

`FastNativeFrame.enabled` defaults true and guards grayscale reads and patch
score calls. The FAST wrappers bind it to actual frame enablement, so held-IMU
intervals without camera acquisition do not request full patch scoring. This is
a source-level guard; its numerical reference and actual WASM branch/performance
qualification are separate. Feature-selection and publication validation costs
remain to profile in the complete issued program.

## Evidence and next gates

The controlled Publish proposal gate executes the actual catalog/map branch at
full350/49/15+6/128/256/14400 capacities and96 registration hypotheses. It checks
complete state equality, consumed-image storage, optional map refusal, exact
birth binding, clone/correlation/lifecycle refusals, initialization and replay.
See `dev/artifacts/modelica-localization-catalog-semantics/`. These estimator
proposals are independently constructed controls; they are not outputs from a
live localization producer. The core initializer and disabled-FAST reference
gates remain unqualified: bounded full-dimension preparation attempts produced
no numerical results. Their failure receipts are retained separately; FAST's
five source-structure checks do not establish numerical or runtime acceptance.

The initial full45-file reference model check hit the8GiB owned-process cap;
the prior reserved-time field failure and memory-limit receipt are preserved in
`dev/artifacts/modelica-localization-catalog-composition-check/`. The frozen
45-file public step source255f0676...fd3136 reaches the actual browser compiler
but fails Typecheck on lexical estimator/map array dimensions through nested
State/Result records, with the published c016732d5b50 module. This is a compiler
qualification case, not browser numerical acceptance; later source edits have
separate export hashes. Frozen source, manifests and bounded resources remain
preserved rather than relabeled as current success.

The current guarded45-file source6ce70462...96ef was also checked against the
newer published0.10.2/c1e129971676 WASM. It still refuses the same nested record
dimensions at Typecheck, without issuing an executable. Exact source/module
hashes and the browser receipt are in
`dev/artifacts/pr382-4b42587c-browser-source-gates/`.

Export exact current authored source with
`node dev/export-rgbd-localization-catalog-source.mjs`; large outputs default to
`$HOME/scratch/slam_web/tmp`. Rumoca alone owns compilation. The separate
compiler agent watches `dev/rumoca-agent-handoff.md` for exact qualification
cases; no application-side compiler workaround was introduced.

Remaining required gates include actual full frontend-to-publication execution,
initialization-to-moving-image tracking, multi-interval atomicity, restore/reset,
source edits and compiler-issued browser ABI admission. Full SLAM additionally
requires the nonlinear optimizer, joint graph uncertainty/gauge transport,
correlated current/reference correction, map correction, tracking-loss recovery
and measured end-to-end performance described in
`dev/graph-estimator-correction-design.md`. The current composition retains raw
graph proposals; it does not apply them as corrections.
