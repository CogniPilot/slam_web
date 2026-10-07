# Full-capacity matcher WASM: correct results, excessive loop copies

The unchanged production `RGBDFeatureMatching` now prepares in 2.57 seconds
with the PR 390 paired compiler (`7e8ec61d2adf`, version 0.10.2). Its schema73
f64-v3 module is 50346 bytes, SHA256
`cdbe661e28c02e76eb3dfe2615385e037db22acb1643a985723e6d581115da3f`.
Both descriptor inputs retain 350×49 cells. The production source SHA256 is
`7fd92ae9fe18248ebe1a2460505a61b796bf62bf388a06bc45709f7909736448`.

The existing native numerical gate passes all 18 cases, comparing all 3504
outputs against an independent reciprocal-matching oracle. Cases include dense
permutations, prediction gates, sparse late slots, ambiguous and duplicate
descriptors, malformed counts, inactive/active NaNs, invalid geometry,
reset and recovery. Public inputs remain byte-identical. A separately compiled
Modelica ratio edit from 0.8 to 0.49 changes the analytic fixture's accepted
count from one to zero after JSON reload; stale source is refused. Parameter
defaults change even though executable module bytes are identical.

A static Chromium worker passes nine cases, checking 31536 output cells,
read-only inputs, reset, the recompiled ratio edit and JSON reload. Its cold
module admission takes 140–193 ms across two runs; evaluations take
0.82–1.12 seconds.
This is actual browser WASM component execution, not full browser SLAM or
GPU sensor ingress. The production compiler pin and Modelica math are unchanged.

## The remaining cost

An evaluate-only `perf` recording has 989 cycles:u samples and no lost samples.
Weighted leaf attribution puts 88.40% in memmove from the matcher, 1.25% in the
WASM copy wrapper and 10.15% in matcher function4. All samples are included;
retained V8 maps resolve JIT frames. The 30-second checked kernel interval
executes 32 evaluations in 30.87 seconds under shared host load.

Diagnostic instrumentation retains every original call and `memory.copy`.
Original and observed modules produce bit-identical complete outputs and
preserve inputs in all three cases:

| Full-capacity input | Copy calls | Logical copied bytes per evaluation |
| --- | ---: | ---: |
| Dense 350-feature pair | 2086780 | 38779490848 |
| Zero current candidates | 1356283 | 36734099248 |
| Invalid reference count | 1356283 | 36734099248 |

Two sites each copy a complete 137200-byte descriptor matrix 122500 times,
including empty/invalid inputs: 33.614 GB together. The Modelica source loops
over the actual active lists; the native finite envelope still executes these
captures before excluding inactive iterations. Several nearest-neighbor arrays
also copy in every envelope iteration. These are logical instruction widths,
not measured DRAM traffic or an instrumented timing result.

The ten static call sites do **not** mean ten matcher executions: observed
function4 entries equal one in every case. Existing multi-output reuse works.
The compiler request concerns alias-safe loop captures and genuinely lazy
dynamic domains, not another multi-output cache. It extends the accepted
descriptor/FAST copy request in [the shared handoff](rumoca-agent-handoff.md).

## Reproduce

The diagnostic tools use a real compiler-issued artifact and exact source:

```sh
nix develop --no-update-lock-file .#ci --command \
  node dev/rumoca-bounded-run.mjs --seconds 150 --rss-mib 8192 -- \
  node dev/probe-native-matcher-performance.mjs "$artifact" "$source" "$report"
```

`observe-native-matcher-copies.mjs` takes artifact, source and output directory.
`probe-native-matcher-browser.mjs` additionally takes the edited artifact and
source before its report path. Both are test diagnostics; neither emits or
optimizes a production executable. Detailed snapshots, numerical reports,
copy counts, generated WAT and resource receipts remain in
`dev/artifacts/modelica-matcher-2026-10-07/`; large artifacts and raw profiles
remain under `$HOME/scratch/slam_web`.
