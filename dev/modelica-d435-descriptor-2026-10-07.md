# Native D435 descriptor: browser execution and copying bottleneck

The production Modelica descriptor now compiles and executes at **848x480 RGB3,
350 features and 49 descriptor cells** through Rumoca's Solve IR native WASM
path. The unchanged math passes in Node and a static Chromium worker. Full SLAM
still refuses at the conditional-record definedness error recorded in
[the compiler handoff](rumoca-agent-handoff.md); the published compiler remains
0.10.0. This work does not enable full SLAM in the public demo.

## Exact artifact

The test-only `D435DescriptorFrame` extends `RGBDDescriptorFrame` with
`D435ImageProfile` dimensions, RGB3 and the SDK depth scale. Its composed source
uses the production matching functions unchanged.

| Identity | Value |
| --- | --- |
| Compiler | PR 390 CI run 37684703486, artifact 11511416451 |
| Compiler revision | `7e8ec61d2adf`, merge parents `4afaf0af02dc`, `1f2bf06974c6` |
| Compiler WASM SHA256 | `444f029ee3bc57e47c260f72192288f3d9238d7159f1abda809637bfc816b5ef` |
| Source SHA256 | `1440092c07ed435a80649f1949a2397dfd94b4281e947e83ded5362ba7140d87` |
| Issued module SHA256 | `57b92bd2647728db9a3c325272cc63d890eaa3bcd8cccc20fcb73c1a72e9d79b` |
| Artifact JSON SHA256 | `9fa7e870e9c81bde8cfd07ab49a675c1b31c0db50a0fbd696ac7323a20ddb7b3` |
| Profile | schema73, native-direct-program-f64-v3, four stages |
| Sizes | 41954-byte WASM; 136137502-byte JSON; 676 memory pages |

Compiler preparation took 110.4 s and peaked at 4.67 GiB process-tree RSS.
The JSON contains 1647443 bindings and 1628874 input names; scalar metadata
greatly exceeds the executable and its 44.3 MB linear memory. A preparation
`perf` sample is dominated by V8 marking/GC. This is not suitable cold-start
behavior for a small laptop or phone.

Raw Z16 codes at depthUnits=.001 pass numerically, but current raw image storage
is **f64**. Native U8/U16 input spans and mixed CV-f32/physics-f64 remain separate
unqualified compiler contracts. No GPU-to-WASM transfer is measured here.

## Numerical evidence

- Node: all six tests pass, comprising the independent fixture check and five
  actual WASM groups. All 27 actual cases compare every one of 18551 public
  outputs, retain readonly P and check source/module binding, JSON reload,
  reset/recovery, physical noise scale, raw depth units, poisoned held images,
  zero-weight invalid neighbors, NaN/Infinity, borders and malformed counts.
- Browser: five frames in Chromium 154.0.8037.92 compare all 92755 output values
  and preserve both P and the Boolean input lane. Frames include changed RGB,
  zero active count, poisoned held data and reset recovery. Worker fetches
  ordinary static source/artifact files directly; the test server only serves
  files. The browser test uses no GPU and proves no sensor-rendering behavior.
- Default 90x160 RGBA fixtures and oracle remain exactly equal to their original
  versions, including four invalid-data controls. Their numerical gates were
  preserved while adding the native-size profile.

Browser consumer admission took 8.89 s; warm acquired calls were 41.9-46.0 ms,
held 9.4 ms. Entire browser command: 13.9 s, 2.12 GiB peak process-tree RSS.
The six-test Node command: 69.1 s, 3.68 GiB. Both retain an 8 GiB hard RSS bound
and 16 GiB available-host-memory floor, low priority and two-core affinity.

## Kernel profile and compiler requests

The benchmark reuses fixed inputs, warms the actual production consumer and
measures only `NativeProgram.evaluate`. Every case checks the independent
numerical oracle, repeated output stability and readonly P outside timing.

| Active features | Image acquired | Median, 30 warm calls |
| --- | --- | --- |
| 350 | yes | 43.86 ms |
| 1 | yes | 41.82 ms |
| 0 | yes | 42.08 ms |
| 350 | no | 10.09 ms |

A separate 30-second evaluation interval completes 681 calls. `perf` records
10 seconds wholly inside that interval, confirmed by its live phase marker
before and after recording: 998 cycles:u samples at 99 Hz, zero lost samples.
Weighted leaf cycles: **77.33% in native memmove called by WASM memory.copy**;
14.79% in WASM function 6, 4.15% in function 5, 1.56% in function 1 and 1.03%
in function 4. V8 perf maps resolve JIT addresses; all samples remain in the
denominator, including the 215 with unavailable callchains. Preparation, input
generation, independent oracles and final hashes are outside this interval.

The issued WAT identifies a 3256320-byte `memory.copy` immediately before
`RGBDCalibratedPoint` (`call 4`) inside the descriptor's 350-slot loop. This
copies the **whole depth image for each feature**, including inactive slots:
1,139,712,000 bytes per acquired frame from this site alone. The transactional
entry also copies the 13031080-byte P block into scratch. Full-resolution input
marshalling adds other copies and loops. The profile explains why reducing
active features barely changes execution time.

The compiler handoff requests readonly array argument views with correct
lifetimes/aliasing, compact compiler-owned array metadata, and elimination of
unnecessary argument marshalling while preserving fault transactions and input
immutability. No app-side compiler, hand-written pointer kernel or rewritten
WASM is used. Removing copies has not yet been implemented or timed. These
results establish neither full SLAM throughput nor the 10x realtime goal.

## Reproduce

Use the existing Nix CI environment. Keep artifacts and perf traces in
`$HOME/scratch/slam_web`. Compose `RGBDFeatureMatching.mo`,
`D435ImageProfile.mo` and `tests/compiler-probes/fixtures/D435DescriptorFrame.mo`
in that order; `dev/probe-native-program.mjs` issues the artifact for model
`D435DescriptorFrame`. The source manifest and receipts are retained in
`dev/artifacts/modelica-d435-descriptor-2026-10-07/` (ignored diagnostic evidence).

With `artifact`, `source` and `report` pointing to the issued files:

```sh
RUMOCA_NATIVE_DESCRIPTOR_PROFILE=d435-native \
RUMOCA_NATIVE_DESCRIPTOR_ARTIFACT="$artifact" \
RUMOCA_NATIVE_DESCRIPTOR_SOURCE="$source" \
nix develop --no-update-lock-file path:.#ci -c \
  node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 8192 -- \
  npx vitest run --config dev/vitest-rgbd-descriptor-native.config.ts --no-cache

nix develop --no-update-lock-file path:.#ci -c \
  node dev/rumoca-bounded-run.mjs --seconds 120 --rss-mib 8192 -- \
  nice -n 15 taskset -c 6,7 node dev/probe-native-descriptor-performance.mjs \
  "$artifact" "$source" "$report"

nix develop --no-update-lock-file path:.#ci -c \
  node dev/rumoca-bounded-run.mjs --seconds 120 --rss-mib 8192 -- \
  nice -n 15 taskset -c 8,9 node dev/probe-native-descriptor-browser.mjs \
  "$artifact" "$source" "$report"
```

For `perf`, retain V8 maps with `--perf-basic-prof` and
`--perf-basic-prof-path="$HOME/scratch/slam_web/profiles/<run>"`. Attach only
to the verified PID from the performance probe's `.ready.json` marker; record
10 seconds, then require that the same marker/PID is still live. This excludes
loading and post-run verification from kernel attribution.

TypeScript, all 215 unit tests and the default descriptor oracle check pass.
The numerical hook timeout is now explicitly 60 s for the large issued artifact;
numerical tolerances, dimensions, cases, source binding and outer resource
bounds are unchanged. No production runtime or algorithm source changed.
