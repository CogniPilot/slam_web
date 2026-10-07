# D435 FAST format fix and native compiler bottleneck

`D435FastFeatures` now binds its channel count to `D435ImageProfile`, giving
RGB3 instead of the inherited RGBA4 default. Scoring math is unchanged. This
standalone editor wrapper is outside the complete SLAM manifest; the full
59-file graph snapshot and State schema remain unchanged (`5d485ddd`).

The same PR 390 paired compiler used for the descriptor proof reports version
0.10.2, merge revision `7e8ec61d2adf`; compiler WASM SHA256 is
`444f029ee3bc57e47c260f72192288f3d9238d7159f1abda809637bfc816b5ef`.

| Actual probe | Result |
| --- | --- |
| D435 848x480 RGB3 source check | Returns successfully in 0.670 s |
| D435 compile to DAE | 0.658 s; balanced 407048 equations/unknowns; 591500-byte JSON |
| D435 native program preparation | 180 s timeout, 1.08 GiB peak RSS; no artifact |
| 90x160 RGBA diagnostic native preparation | 6.65 s; 21933-byte module, two stages |
| Diagnostic numerical execution | Six frames, all 86400 raster scores bit-exact |
| Diagnostic warm acquired calls | 136-139 ms; held call 28.95 ms |

The full native source SHA256 is
`5b46e4b2f2512a9a5f27b220885fd1f4155d87c98668082f5226fe555a2c3cfc`.
It composes the image profile, unchanged FAST functions and corrected wrapper.
The timeout is beyond ordinary DAE compilation. The last RUNNING preparation
JSON is historical; the bounded runner's terminal exit124 proves it stopped.

The smaller control isolates code generation and execution; it does not replace
native D435 acceptance. Module SHA256:
`e611fef3a2e23adc34c8043d4e2ad3da1f37180e0812e30f974cf9ccf4c51252`.
Its independent sequential FAST-9 oracle uses finite RGB and does not duplicate
the source's shared-window reduction. Exact full-raster checks cover moving
color, ignored NaN alpha, poisoned held RGB, readonly P/Boolean inputs, selection
metadata and reset recovery. Nonfinite active RGB requires a separate ordered
tree reference and is not qualified by this finite oracle.

## Generated code and perf

The control WAT copies the entire 115200-byte grayscale array inside its
14400-iteration grayscale loop and again inside its 12936-iteration patch
loop: **3,149,107,200 bytes per acquired 90x160 frame** from two sites alone.
The patch-loop copy precedes the inner acquisition guard, causing unnecessary
image work on held calls too. This is loop-capture/loop-carried aggregate
copying, separate from the descriptor's readonly depth argument copy.

A verified 10-second evaluate-only `perf` window has 989 cycles:u samples at
99 Hz and zero lost samples: **51.35% in memmove reached from WASM memory.copy,
12.49% in its wrapper**, 17.41% in scoring function 0 and 17.21% in frame
function 2. V8 maps resolve JIT leaf addresses; all samples remain in the
weighted denominator, including 355 with unavailable callchains. Loading,
fixture generation, oracle checks and final hashes are outside this interval.
The full 30-second interval makes 198 repeated, checked evaluations. Shared
host load affects absolute timings; these are kernel diagnostics, not sensor,
browser, GPU or end-to-end SLAM throughput measurements.

The compiler agent accepted these findings in response 37 of
[the shared handoff](rumoca-agent-handoff.md). Its next reusable backend rules
cover borrowed readonly arguments, alias-safe loop captures/updates, invariant
capture hoisting, outer acquisition guards, removal of unnecessary whole-P
copies, and compact compiler-owned metadata. Conditional definedness, inline
fold continuation and lifecycle State carry remain full-SLAM blockers. No app
compiler or host numerical fallback was added; the production pin stays 0.10.0.

## Gate and receipts

`tests/compiler-probes/modelica-d435-fast-native.test.ts` requires a real
480x848 RGB3 artifact and compares every score bit, selection metadata,
readonly inputs, held/reset/recovery behavior, source/module identity and JSON
reload. The independent oracle and actual paired compiler layout checks pass;
the latter verifies RGB3 inputs, output dimensions and balance in the issued
DAE. The three actual native test groups remain unexecuted because preparation
produced no full-size artifact.

```sh
RUMOCA_NATIVE_FAST_ARTIFACT="$artifact" RUMOCA_NATIVE_FAST_SOURCE="$source" \
RUMOCA_NATIVE_FAST_REPORT="$report" \
nix develop --no-update-lock-file path:.#ci -c \
  node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 8192 -- \
  npx vitest run --config dev/vitest-d435-fast-native.config.ts --no-cache
```

Source manifests, bounded resource receipts, numerical controls, complete WAT,
module bytes and profiler bindings are in the ignored diagnostic directory
`dev/artifacts/modelica-d435-fast-2026-10-07/`. Large preparation outputs and
raw traces remain under `$HOME/scratch/slam_web`. All 215 unit tests pass after
replacing slow deep image-array equality with an exact binary comparison;
the original byte coverage and test timeout are unchanged. TypeScript and the
production build pass. The browser source-workspace smoke also passes editing,
diagnostics, download and local reload with the corrected FAST preset (30.4 s,
2.31 GiB peak process-tree RSS). These UI checks do not run visual SLAM.
