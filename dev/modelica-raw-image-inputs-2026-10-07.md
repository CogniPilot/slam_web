# Modelica RGB8/Z16 SLAM inputs

[Consolidated qualification receipt](artifacts/modelica-raw-image-inputs/review-2026-10-07.json)
records source hashes, reference/browser gates, resource bounds and limitations.

The authored SLAM graph now accepts native three-channel RGB and raw depth
codes with an explicit `depthUnits` input. D435 entrypoints default to RGB3
and0.001 meters per code. Historical parameterized models retain RGBA4 and
scale1 defaults; saved workspaces continue to own their exact source files.

The scale is forwarded through initialization, individual steps, held-IMU
batches, depth-qualified FAST ranking, descriptors and relative observation.
`RGBDCalibratedPoint` multiplies only the guarded depth samples needed for
calibrated interpolation. It rejects nonpositive/nonfinite scales. No complete
metric depth image or JavaScript pixel conversion was added. All image loop extents
remain derived from input shapes; both RGB and historical RGBA functions read
only the three color channels.

These are Modelica mathematical inputs, still declared Real. Reusable U8/U16
backing storage, writable WASM windows and full typed State issuance remain
Rumoca integration work. The browser's normalized localization consumer still
refuses raw frames. Full browser SLAM and10× realtime are not established.

## Exact compiler delivery

The current59-file snapshot is
[source.mo](artifacts/modelica-raw-image-inputs/native-source-2026-10-07/source.mo),
714307bytes, SHA256
`9cd25ba7c854d61deafa4dd2ce74e8821c1b3aa618b0b5d4d96042301dba5b2a`.
Its adjacent manifest records every authored file. Earlier SHA661cd467 remains
historical evidence and has not been overwritten. The new snapshot and input
contract are recorded in [the shared compiler handoff](rumoca-agent-handoff.md).

## Reference qualification

- [Native initialization](artifacts/modelica-native-frontend/native-initializer-PKyHSP/report.json):
  24 checks across three dynamic848×480 RGB3/Z16 cases, covering fresh capture,
  disabled poisoned images and enabled no-capture. Independent geometry,
  descriptor, map-point, covariance and metadata expectations pass.
- [Raw format/geometry](artifacts/modelica-raw-image-inputs/raw-image-inputs-bD0dTz/report.json):
  72 checks across13×17,17×13 and848×480. RGB3/RGBA scores and descriptors agree;
  multiple scales, harmonic depth interpolation, separate intrinsics,
  discontinuities, zero-weight poison, invalid scales/clipping and held images
  pass. The bounded build/execution completes in8.92s, peak owned RSS204752KiB.
- [Complete graph](artifacts/modelica-full-raw-composition/full-raw-composition-raw-graph-ZEQ1pO/report.json):
  30 checks pass using RGB3/Z16 on the90×160 diagnostic scene, with production
  128-keyframe/256-word/14400-landmark capacities. The scene produces78 matches,
  visual correction, vocabulary/keyframe publication,42 mapped landmarks and
  graph correction. This is a short composition check, not a rendered loop
  closure, long-flight accuracy or browser throughput qualification.
- [Held-IMU success cases](artifacts/modelica-full-raw-intervals/full-raw-intervals-raw-success-1Z8SuN/report.json):
  nine cases pass complete State and display-result parity against sequential
  actual SLAM calls. Independent controls check chronology, one final image,
  held-image behavior and graph-attempt retention. Shared numerical math in
  the parity comparison is explicitly identified in the receipt.
- [Held-IMU refusal cases](artifacts/modelica-full-raw-intervals/full-raw-intervals-raw-refusal-I7tAsO/report.json):
  all17 cases pass, covering invalid chronology/durations, stale images,
  malformed prior state, rejected intervals and complete State rollback.
- [Historical-input regression](artifacts/modelica-full-raw-composition/full-raw-composition-graph-9GziWR/report.json):
  all30 graph checks also pass with RGBA/metric depth defaults.

The native workspace browser test passes with the new59-file source: actual
Rumoca LSP diagnostics/hover, editable dependencies, source download and local
reload are checked. It keeps full execution disabled. The test took19.12s;
35 source-export/workspace/profile/migration unit checks also pass. Logs and
resource receipts use the `modelica-raw-*` names under
`$HOME/scratch/slam_web/profiles/raw-camera-integration-2026-10-07`.

Reference commands require Node and OpenModelica; set `OMC_BIN` when `omc` is
not on PATH. OpenModelica is used only as an independent development reference.
It is not shipped with the site or substituted for Rumoca in the application.

```sh
node dev/check-modelica-native-initializer.mjs --raw
node dev/check-modelica-raw-image-inputs.mjs
node dev/check-modelica-full-raw-composition.mjs raw-graph
node dev/check-modelica-full-raw-intervals.mjs raw-success
node dev/check-modelica-full-raw-intervals.mjs raw-refusal
```

All owned heavy runs use cores6,7, nice15, one OpenMP thread, bounded time/RSS
and a16GiB host available-memory floor. Build outputs and detailed logs live
under `$HOME/scratch/slam_web`.

## Test-oracle slowdown resolved

The initial format fixture compiled but exceeded90-second and240-second
execution limits. An early8-second perf sample observed FAST/array-indexing
costs before the later stall; it did not establish the dominant whole-run
cost. Stage-only instrumentation of a disposable generated executable and
inspection of the generated C identified the later quadratic reduction:

```c
// Emitted inside the loop over every score element:
fabs(real_get(sub_alloc_real_array(_scores, _oldScores), index))
```

OpenModelica rebuilt the complete difference vector for every element of
`max(abs(scores-oldScores))`. The oracle now compares every pair of cells in
one linear Modelica loop. No case, image extent or production algorithm was
removed. The unchanged72 checks then pass in8.92s. Timed-out receipts remain
under `artifacts/modelica-raw-image-inputs`; generated-C diagnostic builds and
perf setup failures are not counted as qualification. The Rumoca agent was
asked to retain coverage for this general reduction pattern; this observation
does not establish the same defect in Rumoca.
