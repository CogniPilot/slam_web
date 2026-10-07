The editable [RGBDLandmarkProjection](../models/RGBDLandmarkProjection.mo) creates world ENU candidate coordinates from all 350 calibrated optical RDF slots. It uses the estimated body pose and supplied camera extrinsics:

`worldPoint = bodyPosition + bodyRotation * (cameraOriginBody + opticalToBody * opticalPoint)`.

The body rotation maps FLU into ENU. Camera points are already lifted by the calibrated frontend; this model never reads RGB pixels, depth images, or ground truth. Camera defaults use RDF→FLU axes and a `{0.18,0,-0.04}` mount, and callers can supply their actual frame extrinsics. Dimensions are named constants.

Modelica checks both rotations for finite entries, orthonormality and determinant +1 within `1e-6`. It requires an accepted pose, an integer-valued active count in 0…350, exact 0/1 eligibility, finite bounded coordinates and positive axial depth. Invalid poses and candidates publish zero coordinates and zero eligibility. Conditional safe values keep masked nonfinite points out of transform arithmetic. Slots retain their original indices, including sparse late slots. `validCount` counts output eligibility; `invalidCount` counts malformed active, nonzero-enabled input candidates. Pose rejection and transformed coordinates exceeding `coordinateLimit` clear outputs without incrementing that input diagnostic.

The [verification record](../dev/modelica-rgbd-landmark-projection-verification.json) separates two outcomes. The review compiler's ordinary `WasmSimulationSession` executes the full 350-slot source against an independent test oracle, including general 6DOF pose, nonidentity extrinsics, lever arm, near-half-turn rotation, sparse slots, count/flag/depth/rotation refusals, recovery, reset, an edited coordinate-limit parameter and JSON source reload. Each completed case checks all 1,404 public output values. Its transport rejects NaN/Infinity before Modelica execution, so those controls establish transport refusal, not numerical execution of the source's nonfinite guards.

The [newer isolated native verification](../dev/modelica-rgbd-landmark-projection-native-verification.json) now executes the unchanged full 350-slot source. Four actual numerical groups cover 40 cases and all 56,160 public output values: general 6DOF, nonidentity extrinsics, sparse late slots, malformed counts and flags, NaN/Infinity source guards, reflections and invalid poses, recovery, reset and source-bound JSON reload. Every case also verifies complete input-byte immutability. The coordinate-limit source edit rejects all 350 points as expected; it changes the bound default parameter payload while retaining identical module code.

The source issues an 845,720-byte native v2 module with 2,150 original assignment stages. Cold artifact preparation took 2.91 seconds in the recorded Node producer run. Exact source, module, artifact, producer-binary and compiler-source hashes are retained in the record.

The same frozen artifacts also [pass in an actual Chromium worker](../dev/modelica-rgbd-landmark-projection-browser-verification.json): 41 cases check all 57,564 outputs against analytic fixtures, including an IndexedDB page-and-worker reload of the edited source and artifact. Input bytes remain unchanged. A 1,000-call measurement averages 0.3554 ms for copying all 1,426 frame inputs, executing Modelica and owning copies of all 1,404 outputs. This is standalone component timing; it excludes compiler preparation, sensors, rendering, mapping and the rest of SLAM. The browser gate consumes precompiled source-issued modules; source compilation has separate Node evidence.

Three earlier native refusals remain recorded. The generic compiler fixes recognize exact terminal scalar stores and original scalar target loads, then prove a fixed coefficient for bare target-load residuals with varying eligibility constants. Complete original prefixes, stores, affine reads and source identities remain required. The first patch passed eight focused controls, all 391 IR tests and strict Clippy; the coefficient extension passed five additional controls, all 396 IR tests and strict Clippy. The final strict snapshot separately matches every owned compiler-file digest. The fixed 20-model MSL canary delta and broader upstream validation remain pending.

This is a standalone candidate projection, with no runtime activation, persistent map, landmark lifecycle, pruning, visual SLAM admission or whole-pipeline speed claim.

Run the ordinary session gate using a review compiler directory and temporary evidence under the local scratch directory:

```sh
mkdir -p "$HOME/scratch/slam_web/tmp/landmark-projection"
TMPDIR="$HOME/scratch/slam_web/tmp" \
RUMOCA_BRANCH_PKG="$RUMOCA_REVIEW_PACKAGE" \
RUMOCA_LANDMARK_EXECUTION=session \
RUMOCA_LANDMARK_REPORT="$HOME/scratch/slam_web/tmp/landmark-projection/report.json" \
node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 4096 \
  --log "$HOME/scratch/slam_web/tmp/landmark-projection/gate.log" -- \
  nice -n 10 taskset -c 10 node node_modules/vitest/vitest.mjs run \
  --config dev/vitest-landmark-projection.config.ts
```

For the native gate, omit `RUMOCA_LANDMARK_EXECUTION` and provide either the compiler package or `RUMOCA_LANDMARK_ARTIFACT_DIRECTORY` containing exact source-issued `baseline.json` and `edited.json`. `RUMOCA_LANDMARK_EXPORT_DIRECTORY` saves newly issued artifacts. The edited source changes `coordinateLimit` from `1e6` to `1.0`; it retains the full slot domain.

Run the optional browser gate with a directory containing the frozen sources (`source.mo`, `edited.mo`) and both artifacts:

```sh
TMPDIR="$HOME/scratch/slam_web/tmp" nix develop path:.#ci --command \
  node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 8192 \
  --log "$HOME/scratch/slam_web/tmp/landmark-projection/browser.log" -- \
  nice -n 10 taskset -c 10 node dev/probe-rgbd-landmark-browser.mjs \
  "$RUMOCA_LANDMARK_ARTIFACT_DIRECTORY" \
  "$HOME/scratch/slam_web/tmp/landmark-projection/browser-report.json"
```
