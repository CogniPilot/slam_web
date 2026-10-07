# Conservative FAST rejection before full scoring

The Modelica RGB-D frontend now avoids full FAST-9 scoring when a necessary
condition proves that the pixel cannot reach the feature selector's rank range.
Every nine-sample arc contains at least two of the four cardinal circle samples.
If neither bright nor dark differences have two cardinal samples reaching a
conservative floor, the expensive comparison tree can be skipped.

`FastCircleCanReachScore` expresses this condition in Modelica. Nonfinite or
enormous differences retain full scoring and its existing domain diagnostics.
`FastFrameScores` has an optional score floor; its default zero preserves all
original scores. Disabled acquisitions still ignore poisoned input. The full
FAST scorer and compatibility patch scorer are unchanged.

The initialization and advance functions pass a floor computed by
`FastSelectionScoreFloor`. It deliberately retains scores slightly below the
raw threshold: the selector sorts rounded ranks and can stop on a subthreshold
entry tied with an admissible entry. Removing that entry could change selection.
The conservative floor is `(floor(threshold*rankScale)-2)/rankScale`, bounded
below by zero. Invalid configuration falls back to full scoring. Both lifecycle
callers use the selector's existing `1e8` rank scale.

This intentionally zeros some internal subthreshold responses. Selected feature
identities, ordering and scores remain unchanged. It does not lower image
resolution, acquisition rates, feature/keyframe/map capacities or the selected
FAST threshold. No host feature math, application compiler or alternative
runtime was added. Three production Modelica files changed.

## Reference and performance evidence

The [independent reference](artifacts/modelica-fast-score-gate/fast-score-gate-lXOmkI/report.json)
passes all 16 assertions, including all 65,536 binary circle patterns in both
signs at three amplitudes: 393,216 comparisons of the necessary condition.
Additional cases cover nonfinite fallback, disabled poisoned images, invalid
floors and eight threshold positions around rounded-rank ties.

Three actual native 848×480 RGB8 camera frames, captured at simulation times
0, 0.2 and 0.4 seconds, compare the preceding full scorer against the new path.
The default unpruned scorer remains equal. The threshold-aware path preserves
all responses at or above its floor; only lower responses can become zero.
All 3,150 selected feature cells match float64 bits, including coordinates,
ordering, scores and unused slots. The small before/after matrix is retained in
`artifacts/fast-score-gate-2026-10-07/features.mat`.

An ABBA `perf stat` benchmark runs both paths in one generated OMC C executable.
Each invocation reads those three camera frames, scores them and selects the
features. Every selected-feature checksum matches exactly. Counters have 100%
event scaling; jobs use two assigned low-priority CPU cores and one OpenMP thread.

| Mean of two runs | Previous full scoring | Conservative gate |
| --- | ---: | ---: |
| CPU task time | 6.353 s | 1.940 s |
| Instructions | 75.734 billion | 19.732 billion |
| Cache misses | 25.945 million | 6.617 million |

That is **3.275× reference frontend throughput**, 73.9% fewer instructions and
74.5% fewer cache misses on these captured frames. It is not browser WASM,
sensor-rendering or complete SLAM throughput. Earlier FAST benchmarks used
different images and workloads; their ratios must not be multiplied into a
claimed end-to-end speedup.

The [complete native RGB-D/IMU flight reference](artifacts/modelica-rendered-flight-slam/rendered-flight-slam-B2x2l2/report.json)
passes all 24 unchanged assertions with 13 GPU-generated RGB8/Z16 frames and
36 measured held IMU intervals. Its complete published CSV is byte-identical to
the preceding passing replay. Six visual corrections and six new references
remain accepted; occupied map slots grow from 161 to 884. This short 0.4-second
reference does not establish long-flight accuracy or rendered loop closure.

The [controlled measurement-loss replay](artifacts/modelica-rendered-flight-slam/rendered-flight-slam-VUAYOg/report.json)
also passes all 32 checks on the current source. Its published CSV bytes match
the preceding loss/recovery reference exactly: zero depth and uniform RGB
temporarily remove visual measurements, prediction continues with held IMU,
the map/reference remain held, duplicate batches roll back, and useful images
recover tracking against the retained reference. These are imposed test faults.

The first reference attempt hit its 8 GiB process-group limit because OMC
expanded the test's fixed-size poisoned RGB fill into 407,040 literal array
constructors, producing an 81 MB C file. That failed receipt is retained under
`artifacts/modelica-fast-score-gate/fast-score-gate-x6d46D`; the original large
C stays in scratch with its digest and location recorded. Compact loops fix
only the test setup. The successful reference took 20.6 seconds and peaked at
0.61 GiB. The full replay took 71.9 seconds and peaked at 1.63 GiB. These are
bounded qualification jobs, not runtime throughput measurements.
The additional loss/recovery replay took 68.9 seconds and peaked at 1.60 GiB.

## Browser WASM qualification and remaining integration

Actual browser-worker compilation with paired CI Rumoca 0.10.2/edc9b8ea7b08
issues the production gate and floor functions through the existing f64-v3
native program ABI. A second Modelica source changes the threshold from 18 to
zero and produces a different WASM module. Both run in Node and a dedicated
Chromium worker: all 224 numerical cases pass, including cardinal rejection,
conservative rank-tie preservation, repeat/reset, readonly inputs and stale
source rejection. [Numerical receipt](artifacts/fast-score-gate-2026-10-07/browser/numerical-report.json).

This test passes sixteen prepackaged differences, using 23 historical patch
fixtures and five independent cardinal/rank-boundary cases. Fixture packaging
and the necessary-condition oracle are development tests; the application
executes none of that mathematics in JavaScript. This qualifies the eligibility
and floor functions, not full raster compilation, typed raw image ingress,
native State carry or full browser SLAM. It does not qualify f32 execution.

The preview still runs camera plus Modelica inertial propagation, with no
qualified feature/full-SLAM activation. Production remains pinned to Rumoca
0.10.0. Full native Reset/Initialize/Step/Intervals issuance, typed raw sensor
ownership, exact carried State and numerical browser execution remain required.
The 10× realtime objective is not achieved.

The new immutable 59-file native source is
`artifacts/fast-score-gate-2026-10-07/native-source/source.mo`, SHA256
`d64434b6120ab5dd0ec133e52220f861223a8d08ed19759b1404512df5ad82f6`
(734,370 bytes). Older source snapshots remain intact for compiler reproduction.
[Bound review](artifacts/fast-score-gate-2026-10-07/review.json).

To repeat the native reference/profiling with OMC, Modelica 4.1.0 and `perf`:

```sh
node dev/check-modelica-fast-score-gate.mjs --profile
SLAM_REFERENCE_SECONDS=300 node dev/check-modelica-rendered-flight-slam.mjs \
  dev/artifacts/modelica-rendered-flight-frames/flight-p2gCED
```

`OMC_BIN` and `PERF_BIN` can select tool paths. To repeat the exact issued WASM
gate qualification, set `CHROMIUM_PATH` as needed and use a fresh scratch copy:

```sh
mkdir -p "$HOME/scratch/slam_web/tmp"
probe_dir=$(mktemp -d "$HOME/scratch/slam_web/tmp/fast-gate-recheck.XXXXXX")
cp dev/artifacts/fast-score-gate-2026-10-07/browser/{baseline,edited}.{mo,artifact.json} "$probe_dir/"
node dev/probe-fast-score-gate-browser.mjs "$probe_dir"
```

Large builds, raw sensor matrices and disposable browser profiles remain under
`$HOME/scratch/slam_web`; durable sources and review evidence stay in the repository.
