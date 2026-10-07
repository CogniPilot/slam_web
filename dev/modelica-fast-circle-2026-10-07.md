# FAST circle sampling: exact math with less work

The full Modelica frontend now reads the sixteen FAST circle samples directly
from grayscale instead of constructing a 7×7 image patch at every candidate
pixel. The center is read once, and a reusable `FastCircleScore` consumes the
sixteen differences. `FastPatchScore` remains available for standalone patch
experiments and delegates to the same scorer. Circle offsets, radius and sample
count live together in `FastCircleStencil`; image extents still come from the
input arrays. No sensor rate, image resolution, feature budget or algorithm
capacity changed.

The ordered 2/4/8/9 comparison tree, tie behavior and score floor are retained.
There is no early rejection threshold or approximation. Grayscale arithmetic
order, borders, ignored alpha and the held-IMU acquisition guard remain the same.
Only `models/FastNativeFrame.mo` changed among the 59 production Modelica files.
The compiler checkout, production Rumoca package and application runtime are
unchanged.

## Numerical qualification

The [comparison receipt](artifacts/modelica-fast-circle/fast-circle-ADteIe/report.json)
passes 27 Modelica grid assertions and compares 829,223 score cells against the
frozen pre-change implementation. Cases include 1×1, 6×5, 7×7, 13×17, 17×13,
90×160, and native 480×848 RGB3/RGBA images. Every finite/non-NaN score matches
raw float64 bits, including negative zero. The poisoned RGB case preserves NaN
classification; NaN payload portability is not asserted. Guarded borders retain
positive zero. Poisoned alpha is ignored, and disabled poisoned images produce
zero scores.

All 23 independent historical patch cases also match their existing expected
raw bits, including signed zeros and threshold-equality arcs. The fixture's
original source identity remains bound to its actual historical source; it is
not relabeled as a fixture generated from the new implementation.

The full native rendered-flight composition then passes all 24 unchanged checks:
13 actual RGB8/Z16 images, 36 measured IMU holds, six visual corrections and six
new references after initialization. All published numerical metrics and frontend
diagnostics equal the prior passing replay. The map still grows from 161 to 884
occupied slots. [Full composition receipt](artifacts/modelica-rendered-flight-slam/rendered-flight-slam-wa1Qyl/report.json).

Two initial comparison-harness failures remain retained: quoted CSV array-column
parsing and missing appended MAT results. The final harness parses quoted names
strictly and writes each score vector to its own MAT file. Neither failure was
a passing numerical result; the final complete raw-bit comparison is required.

## Measured reference cost

An ABBA benchmark runs both implementations in the same generated OpenModelica
C executable. Each invocation scores three changing native RGB images and
accumulates every output cell; all four checksums match exactly. `perf stat`
records task clock, cycles, instructions and cache misses, with no event scaling.
The process runs on two assigned low-priority CPU cores with one OpenMP thread.

| Mean of two runs | Square patch | Direct circle |
| --- | ---: | ---: |
| CPU task time | 10.845 s | 8.570 s |
| Instructions | 141.833 billion | 106.853 billion |
| Cache misses | 79.875 million | 41.520 million |

That is about 1.26× faster, 25% fewer instructions and 48% fewer cache misses
for this reference workload. These are CPU observations on generated OMC C,
not Rumoca WASM or live application throughput.

Inspection of `FastCircleBenchmark_functions.c` confirms the mechanism: the old
pixel loop calls `index_alloc_real_array` to construct the square slice. The new
loop fills its sixteen-element difference buffer and calls `FastCircleScore`
without that slice allocation. At the native grid the old path creates 399,108
square slices per image, logically copying 156,450,336 bytes of patch elements.
The exact allocation/storage behavior of Rumoca still needs its own profiling.

## Browser compiler boundary

Actual browser-worker issuance was attempted using the paired CI compiler
0.10.2/edc9b8ea7b08, WASM SHA256
`5486e3afead83060bbcca4b3c8a37ce53afa3d961fb9f940d31af8a5f7b954d0`.
Both the frozen pre-change and new `FastPatchNativeProbe` sources refuse in typed
WASM emission at an `unimplemented typed operation`; neither issues an artifact.
This is not numerical WASM qualification and is not presented as a new failure
unique to the refactor. The exact sources, provenance and receipts are under
`artifacts/fast-circle-2026-10-07/browser`.

`dev/probe-fast-circle-browser.mjs` is staged to verify the source-issued patch
modules and a separately compiled Modelica score-floor edit once the compiler
can issue them. Its numerical success path has not executed. Full native State,
typed raw sensor ingress and browser SLAM execution remain separate requirements.
The running preview remains the camera/Modelica inertial baseline; this source
optimization does not establish a live-preview speedup or the 10× realtime goal.

The new immutable native source is
`artifacts/fast-circle-2026-10-07/native-source/source.mo`, SHA256
`9d2942fc6d5f97a1bd132f2f8e1d26e759314b70aea1b9d3bd2f779b2515da2c`
(732,408 bytes, 59 files). The earlier f3272ea6 snapshot remains intact for
ongoing compiler blocker reproduction. [Bound review](artifacts/fast-circle-2026-10-07/review.json).

To repeat the independent reference and profiler checks, provide OpenModelica,
Modelica 4.1.0 and `perf`, then run:

```sh
node dev/check-modelica-fast-circle.mjs --profile
SLAM_REFERENCE_SECONDS=300 node dev/check-modelica-rendered-flight-slam.mjs \
  dev/artifacts/modelica-rendered-flight-frames/flight-p2gCED
```

`OMC_BIN` and `PERF_BIN` may select the tools. Large generated binaries, raw score
matrices and temporary compiler data stay under `$HOME/scratch/slam_web`.
