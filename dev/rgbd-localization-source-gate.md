The concrete models are `RGBDInertialLocalizationStep` (full raw image with350 source-selected pixels) and `RGBDFastInertialLocalizationStep` (full14400 FAST/selection feeding that same350-slot transaction). They are localization plus world-coordinate map candidates, not persistent map/loop SLAM. `RGBDInertialSLAM` stays partial. No connected compiler-issued artifact exists yet.

Actual2026-10-05 core preparation now reaches a ToDae refusal in `RGBDLocalizationTracking`: its runtime conditional contains a coordinate loop while its predicate variable is reassigned. The complete frozen18-source graph remains unchanged. See `rumoca-localization-core-handle.json`, `artifacts/rgbd-localization-core-admission/`, and `rumoca-localization-tracking-conditional-review.md`. A separate generic reproduction also reaches that exact refusal (`artifacts/nested-loop-conditional/before-review.json`); no connected numerical case has executed.

The October 6 browser check with the CI package for PR tip `87b5570` instead
reaches the 60-second issuance timeout without an artifact. The earlier
conditional refusal is historical for this package; a timeout does not prove
ToDae completion or native-program admission. A separate diagnostic CPU profile
uses the same unchanged source and time limit, not a relaxed acceptance budget.
Reports, exact merge/compiler identity and self-sample summary:
`artifacts/pr382-87b5570-browser-source-gates/`. Zero connected numerical cases
executed. Retain all acceptance requirements below.

The newer CI package for tip97140341c was also tested in Chromium on October6:
module SHA66338544...ec481c, reported merge56b13d5c7488 with verified PR parent.
The original18-source core still reaches the60-second browser timeout, and
the original indexed map still refuses its bounded While statement in ToDae.
No source artifact or numerical case issued. Exact receipts/resources and
provenance: `artifacts/pr382-9714034-browser-source-gates/`. This supersedes
the older package as the newest tested module, without changing any gate.

The unchanged standalone160×90 FAST source has actually passed Node and Chromium, including full-frame raw-bit expectations, faults, reset and IndexedDB reload (`artifacts/native-stage-outlining/full-original-numerical/`). This qualifies the detector artifact only, not connected localization, browser compilation/editing, the full selection wrapper, persistent map or loop closure.

Export the exact source in the source list/order shared with the test fixture:

```sh
node dev/export-rgbd-localization-source.mjs "$HOME/scratch/slam_web/tmp/rgbd-localization-source"
```

Use Rumoca's public browser producer through the application-side probe,
under the existing resource guardian. The earlier env-gated compiler inventory
harness was removed from the compiler repository and is historical evidence;
do not rely on it as an acceptance gate. Set `RUMOCA_COMPILER_DIR` to the exact
qualified full-web module directory and `CHROMIUM_PATH` to the installed
browser if needed. First issue the core; after numerical acceptance issue the
full wrapper. Keep source capacities and limits unchanged.

```sh
node dev/rumoca-bounded-run.mjs --seconds 90 --rss-mib 8192 --available-mib 16384 \
  --log "$HOME/scratch/slam_web/tmp/rgbd-localization-source/core-issuance.log" -- \
  node dev/issue-native-program-browser.mjs "$RUMOCA_COMPILER_DIR" \
  "$HOME/scratch/slam_web/tmp/rgbd-localization-source/source.mo" \
  RGBDInertialLocalizationStep \
  "$HOME/scratch/slam_web/tmp/rgbd-localization-source/core-native.json" \
  "$HOME/scratch/slam_web/tmp/rgbd-localization-source/core-issuance-report.json"
```

Use the same source with `RGBDFastInertialLocalizationStep` and separate
`full-native.json`/issuance-report paths. The helper refuses existing outputs;
choose fresh paths for each module/source/model attempt. It compiles inside an
actual browser worker and admits the original wire artifact through
`NativeProgram`; it performs no independent numerical fixture. Retain exact
source/module provenance, refusal and resource records. If no artifact issues,
numerical cases remain zero. Do not substitute the core for wrapper acceptance.

The staged actual core numerical gate is:

```sh
RUMOCA_LOCALIZATION_SOURCE="$HOME/scratch/slam_web/tmp/rgbd-localization-source/source.mo" \
RUMOCA_LOCALIZATION_ARTIFACT="$HOME/scratch/slam_web/tmp/rgbd-localization-source/core-native.json" \
RUMOCA_LOCALIZATION_REPORT="$HOME/scratch/slam_web/tmp/rgbd-localization-source/core-numeric-report.json" \
node node_modules/vitest/vitest.mjs run --config dev/vitest-rgbd-localization.config.ts
```

Without an artifact it runs one independent oracle group and skips all three actual tests. The oracle derives calibrated descriptors, identity point registration/noise, nilpotent process covariance through independent four-node factor quadrature, and correlated Schmidt correction through finite-difference Jacobians/dense solves. Actual tests check first capture, all17150 reference descriptor cells, sparse-domain covariance blocks225/90/36, held-interval retention, accepted correction/consumed images, same-frame replacement refusal, fresh replacement, rejected image/count/step, quaternion/covariance viewer fields, late-slot map candidates, readonly P, reset and saved artifact/state reload. These tests do not substitute for original full-raster source acceptance, general moving6DOF trajectory or complete graph/map gates.

The dedicated config includes only `modelica-rgbd-localization.test.ts`. Run the moving and session gates separately with the compiler-probe config; a green dedicated command does not cover them:

```sh
RUMOCA_LOCALIZATION_SOURCE="$HOME/scratch/slam_web/tmp/rgbd-localization-source/source.mo" \
RUMOCA_LOCALIZATION_ARTIFACT="$HOME/scratch/slam_web/tmp/rgbd-localization-source/core-native.json" \
RUMOCA_MOVING_LOCALIZATION_REPORT="$HOME/scratch/slam_web/tmp/rgbd-localization-source/moving-report.json" \
node node_modules/vitest/vitest.mjs run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-rgbd-moving-localization.test.ts
```

Require three actual core numerical cases and one actual moving case in the respective reports. The moving case proves a calibrated six-axis visual innovation, covariance and image-reference transaction; its stationary IMU prior is not a physically consistent flight trajectory.

The session gate expects an artifact directory containing the exact `source.mo` and `native.json`. Issue the core directly as `native.json`, or create a naming-only alias to the same `core-native.json`; neither changes its model or producer. Then run:

```sh
RUMOCA_LOCALIZATION_ARTIFACT_DIRECTORY="$HOME/scratch/slam_web/tmp/rgbd-localization-source" \
node node_modules/vitest/vitest.mjs run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-localization-session.test.ts
```

Require all four session tests to execute. They cover invalid-image prediction and interval rollback, rather than accepted moving-image execution through the actual browser worker/client. Browser transport still needs its own source-issued acceptance gate.

There is a separate fourth actual test, skipped without `RUMOCA_FULL_LOCALIZATION_ARTIFACT`. It consumes the independently retained four original90×160 FAST fixtures, compares all14400 `detector.scores`, uses the independent stable-sort/NMS oracle to check source-selected pixels/scores, then verifies all350 descriptor/point/mask slots and first-reference commit. Set `RUMOCA_FULL_LOCALIZATION_REPORT` for its separate report. Its artifact must name `RGBDFastInertialLocalizationStep`; the core artifact cannot satisfy this test. With neither artifact, all four actual tests are skipped.

Initial state is source-owned: level estimated origin, zero velocity/bias, fixed gravity and explicit tunable diagonal prior variances. Source bindings provide cold reference covariances/images and named D435 calibration. A caller can override initial estimated pose/covariance deliberately; neither ground truth nor an independent absolute reference is an input. Every `next*` state field must commit together. Shape/finite/source checks on saved state belong to transport; numerical covariance/pose validation stays Modelica.

On each held IMU interval pass the measured accel/gyro and `h`. Set `frameEnabled=0`, `imageCaptureRequested=0` before the final interval. On the final interval set `frameEnabled=1`, pass its raw images/calibration, and the monotonically assigned image `currentEpoch`. The core supports `0<h<=0.02` only. A30Hz held interval is explicitly unsupported until a Modelica-owned substep is proved; the adapter must refuse instead of subdividing in TypeScript. A requested but unusable image does not replace the reference; a valid IMU prediction can still commit.

The image snapshot commits solely on `captureAccepted`: descriptor, point, enabled, pixels, count, RGB/depth calibration, physical noise-reference fx, sigma, baseline, optical→body rotation and lever arm. Correlated reference nominal/covariance/epoch fields commit in the same transaction. A relative pair uses the old snapshot and current frame, consumes both image noises even when innovation is rejected, and cannot capture that same consumed current image. A later fresh frame may replace a used reference. Runtime changes to the rigid extrinsic/common pair noise model disable reuse and can seed a new reference. The per-pair covariance model retains its documented independence/correlation limitations.

Viewer fields are source outputs: `nextPosition`, normalized `nextQuaternion` in[w,x,y,z], `positionCovariance`, `attitudeCovariance`, `features`+`featureEnabled`, `trackingCurrentPixel`/`trackingReferencePixel`+`trackingEnabled`, and `mapCandidatePoint`+`mapCandidateEnabled`. `confidence` is the binary accepted relative correction indicator, not a probability. `referenceEpoch` identifies the old tracking reference; `nextReferenceEpoch` identifies the retained snapshot after the transaction. The host transfers masks/rows and coordinates; it does not derive a quaternion or perform numerical registration/filtering.

The raw input shape is90×160×4 Real RGB and90×160 Real axial depth. This is the currently admitted representation contract, not proof of packed-U8 ingress or Float32 CV. Native input-storage/precision work remains separate. Raw alpha is preserved and ignored by the source frontend.
