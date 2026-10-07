# FAST scoring with fewer temporary arrays

The production Modelica FAST scorer now consumes each arc's final comparison
stages immediately. Six arrays used once per element become five scalar
temporaries and the running output score. The shared 2/4 comparison windows
remain arrays. This keeps the existing ordered 2/4/8/9 tree, strict comparisons,
tie behavior, signed zeros and nonfinite behavior. Image dimensions, sensor
rates, resolution and algorithm capacities are unchanged.

Only `models/FastNativeFrame.mo` changes among the 59 production Modelica files.
No application compiler, numerical host fallback or external compiler-tree edit
was introduced. This follows the earlier direct-circle sampling optimization;
the benchmark below compares against that immediately preceding implementation.

## Independent reference and profiler evidence

The [comparison receipt](artifacts/modelica-fast-circle/fast-circle-GxuN5H/report.json)
passes all 27 assertions, all 23 independent historical patch goldens and 829,223
score-cell comparisons across native 480×848 RGB/RGBA, tiny, transposed and
historical grids. Every non-NaN result matches float64 bits, including negative
zero. NaN classification matches; cross-implementation NaN payload identity is
not an acceptance condition. Guarded borders preserve positive zero, poisoned
alpha is ignored, and disabled poisoned images remain opaque.

An ABBA `perf stat` run compares both implementations in the same OpenModelica
C executable, scoring three changing native images per invocation. Each result
checksum is exactly equal. Hardware counters have 100% event scaling.

| Mean of two runs | Previous circle scorer | Scalar final stages |
| --- | ---: | ---: |
| CPU task time | 8.693 s | 5.962 s |
| Instructions | 106.850 billion | 73.155 billion |
| Cache misses | 38.432 million | 22.388 million |

This is 1.458× reference frontend throughput, 31.5% fewer instructions and 41.7%
fewer cache misses. It does not measure Rumoca WASM or live application speed.
Generated C confirms the allocation mechanism: `FastCircleScore` has five
`alloc_real_array` sites versus eleven in the frozen preceding scorer. The six
removed arrays contained 97 float64 elements per scoring call; this is source
storage accounting, not measured peak memory or runtime byte-copy traffic.

The [full rendered-flight replay](artifacts/modelica-rendered-flight-slam/rendered-flight-slam-EHhwGI/report.json)
also passes all 24 unchanged checks. It uses 13 actual native RGB8/Z16 frames and
36 measured held IMU intervals. Every published metric and frontend diagnostic
equals the preceding passing replay: six visual corrections and six new
references, with occupied map slots growing from 161 to 884. This remains a
0.4-second reference flight, not long-flight accuracy or rendered loop-closure
acceptance. The bounded OMC job took 95.1 seconds and peaked at 1.48 GiB on two
assigned low-priority cores. The isolated ABBA run supports the performance
claim; comparing unrelated full-replay wall times does not.

## Actual Rumoca browser WASM component

The complete current FAST source, with a small public model calling its
`FastCircleScore`, compiled in an actual dedicated browser worker using paired
CI Rumoca 0.10.2/edc9b8ea7b08. A second source changes the initial score floor
from zero to one and compiles independently. The two emitted WASM modules have
different digests and use the existing `native-direct-program-f64-v3` ABI.

Both modules execute in Node and a dedicated Chromium worker. All 184 raw-bit
checks pass: 23 independent historical patch goldens, twice around reset, for
both source variants in both runtimes. Inputs remain unchanged and stale source
identities are refused. [Numerical receipt](artifacts/fast-score-storage-2026-10-07/browser/numerical-report.json).

This component receives sixteen prepackaged circle-minus-center differences.
The development fixture derives them from historical patch bytes using
independent FAST circle coordinates; it never regenerates expected score bits.
That packaging is test-only. The application does not perform circle gathering
or score arithmetic in JavaScript. The actual production scorer function is
unchanged in the baseline compilation source.

This qualification excludes full-image grayscale/gathering, raw GPU image
ingress, feature selection, native State carry and full SLAM. The preceding
7×7 patch issuance failure on this CI package remains retained; compiling the
scorer directly does not resolve that compiler gap. Production remains pinned
to Rumoca 0.10.0 and the live preview remains camera plus Modelica inertial
propagation. There is no qualified live-preview speedup or 10× full-SLAM result.

Exact sources, artifacts, compiler identities and logs are under
`artifacts/fast-score-storage-2026-10-07/browser`. The current immutable full
native graph is `artifacts/fast-score-storage-2026-10-07/native-source/source.mo`,
SHA256 `ac7583efe89fef0af08a807ccc966bd4390fe2ce904de23b0d8e1f6a05dd7d43`
(732,261 bytes, 59 files). Older snapshots are retained for the compiler agent's
existing reproduction work. [Bound review](artifacts/fast-score-storage-2026-10-07/review.json).

With OpenModelica, Modelica 4.1.0 and `perf` available:

```sh
SLAM_FAST_BASELINE=circle node dev/check-modelica-fast-circle.mjs --profile
SLAM_REFERENCE_SECONDS=300 node dev/check-modelica-rendered-flight-slam.mjs \
  dev/artifacts/modelica-rendered-flight-frames/flight-p2gCED
```

`OMC_BIN` and `PERF_BIN` can select the tools. To repeat the numerical component
check on its exact issued modules, set `CHROMIUM_PATH` as needed and run:

```sh
mkdir -p "$HOME/scratch/slam_web/tmp"
probe_dir=$(mktemp -d "$HOME/scratch/slam_web/tmp/fast-circle-recheck.XXXXXX")
cp dev/artifacts/fast-score-storage-2026-10-07/browser/{baseline,edited}.{mo,artifact.json} "$probe_dir/"
node dev/probe-fast-circle-browser.mjs "$probe_dir" differences
```

Large binaries, raw matrices, compiler data and disposable browser profiles
remain under `$HOME/scratch/slam_web`. Durable source and review evidence stay
in the repository.
