# Adjacent-cardinal FAST gate qualification

The complete native flight reference was profiled with Linux perf before this
change. FAST accounts for 57.61% of sampled inclusive reference CPU cost;
descriptor preparation accounts for 2.15%. Generic OpenModelica array indexing
is also expensive. This is an -O0 independent native reference, not Rumoca WASM,
GPU time or full-browser throughput. The profile replay reproduces the complete
published CSV bytes, loses no samples and changes no source. Raw perf data stays
in scratch; [the receipt](artifacts/modelica-flight-hotspots/slam-reference-hotspots-FmmPRh/report.json)
retains source, binary, data and output bindings.

Every nine-sample FAST arc contains two adjacent cardinal samples, including
the cyclic wraparound pair. The preceding gate admitted any same-sign pair;
opposite-only pairs now reject before full scoring. Nonfinite and enormous
samples conservatively retain full scoring. The full scorer, conservative
rounded-rank floor, feature selector, rates, image dimensions and capacities
are unchanged. This changes only FastCircleCanReachScore in FastNativeFrame.mo.

[The matched reference](artifacts/modelica-fast-score-gate/fast-score-gate-zt4Jz8/report.json)
passes 16assertions and 393216 exhaustive binary-pattern comparisons. All 3150
selected feature cells match bit for bit on three captured 848×480 RGB8 frames.
ABBA runs in the same binary measure 1.11693× scoring-plus-selection reference
CPU throughput: 10.47% less task-clock, 13.27% fewer instructions and 13.44% fewer
cache misses than the preceding cardinal gate. Every run produces the same
checksum. This ratio is not multiplied by earlier results or claimed for the
live browser.

The actual paired CI Rumoca 0.10.2/edc9b8ea7b08 browser compiler separately
issues the exact current production functions and a Modelica threshold 18 to 0
edit. All 872 numerical checks pass across Node and a dedicated Chromium worker,
including all 81 ternary cardinal patterns, wraparound, rank ties, reset, readonly
inputs and stale-source rejection. This component consumes 16 differences; it
does not qualify native raw-camera ingress, full-frame execution, exact State
carry or f32 code generation. [Issued sources and receipts](artifacts/fast-adjacent-gate-2026-10-07/browser)
retain the executed consumer/probe preimages.

The complete rendered-flight reference passes 24 checks and the controlled
sensor-loss/recovery reference passes 32 checks. Their entire published CSV files
are byte-identical to their preceding passing replays. The latter preserves
prediction, covariance growth, held reference/map, duplicate-batch rollback and
visual recovery after controlled depth/RGB faults. Neither short reference
establishes long-flight accuracy or a rendered loop closure.

[The bound review](artifacts/fast-adjacent-gate-2026-10-07/review.json) and its
review.mjs verify exact current-source hashes, feature bits, unchanged scorer,
full replay outputs and actual issued WASM artifacts. The immutable 59-file
native composition is source.mo under native-source in the same directory:
SHA256 21703ff86c566c96dc510a0a609de3ed33138a243b9d7eadad2e9033bcf80604.
No app compiler, host numerical fallback, compiler-tree edit or production pin
change was introduced. Full browser SLAM and 10× realtime remain pending.
