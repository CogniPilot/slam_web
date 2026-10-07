# Catalog copy and capture diagnosis

Generated OpenModelica C from the existing extended-flight reference confirms
that `RGBDCatalogFrame.Advance` constructs a complete `policyCatalog`, copies
every field, then overwrites its body positions and rotations before calling
`RGBDKeyframePolicy.Select`. The copy includes the 128×350×49 descriptor tensor:
2,195,200 f64 values, or 17,561,600 bytes, before other catalog arrays. This is
generated-code evidence of a native reference cost, not evidence about Rumoca's
issued WASM or an allocation/count measurement.

Reanalysis of the existing hash-bound perf callchains gives:

| Inclusive stack group | Samples | Sampled cycle periods |
| --- | ---: | ---: |
| Any catalog copy | 37 | 3.4407% |
| Catalog copy inside `RGBDCatalogFrame.Advance` | 3 | 0.2839% |
| `RGBDCatalogFrame.Advance`, including children | 12 | 0.8998% |
| Keyframe policy | 0 | No sampled hit |

These overlapping groups are not additive. Zero hits do not establish zero
cost. The ten-second profile contains 1,366 samples and 31,876,882,239 total
periods; both totals match the original receipt. It includes independent
reference validation. This is **not a new recording**, a measurement of the
latest descriptor edit, or a browser/throughput result. The previous result
that independent scoring dominates and generic OMC indexing accounts for
56.42% of self cycles remains unchanged.

The evidence puts this particular policy copy below the larger execution
bottlenecks in the observed reference. The application policy and admission
rules are therefore unchanged. Reusable compiler liveness/copy elimination
would be useful after full native issuance and detector runtime work, rather
than a new application-specific lowering or an unqualified policy rewrite.

Source and generated-code evidence:

- `models/Mapping/RGBDCatalogFrame.mo`: functional pose-view replacement.
- `models/LoopClosure/RGBDKeyframePolicy.mo`: header/measurement validation and
  motion/cadence decision. `RGBDKeyframes.ValidHeader` does not inspect pose or
  descriptor arrays; the policy reads the supplied latest pose separately.
- Existing generated C under
  `$HOME/scratch/slam_web/tmp/rendered-flight-slam-pA2y6r/`:
  `RGBDRenderedFlightExtendedGridAcceptance_functions.c`, lines 27466–27487,
  constructs/copies the policy catalog. Its SHA-256 is
  `382e6a23f0127798a3ba79739f76f3020e0848a19b4f4e3eb1c3dbdd441604c9`.
  The adjacent `records.c`, lines 185–218, copies every catalog array;
  SHA-256 `87b80e63525372261819a7c1163cd2ba4ae83221040f2a3d092651047256b86e`.
- Original profile: `artifacts/modelica-extended-flight-2026-10-07/profile.json`.
  Its raw callchains remain under the receipt's HOME-relative scratch path;
  SHA-256 `66a6f45a7673c0fd303ff3d02140906f9aaace5a8c33a814fe9856018b58af0c`.
- Additional attribution:
  `artifacts/modelica-keyframe-pose-view-2026-10-07/copy-profile.json`.

An attempt to evaluate the unchanged policy on a full empty catalog directly
through OpenModelica scripting did not return a decision within a 30-second
bound with a 4 GiB virtual-memory cap. It terminated with status 124 and no
result. No reduced catalog or increased limit was substituted, and no policy
numerical pass is claimed from that attempt.

The application instead extended the optional reference failure trace through
frame binding, production landmark projection and map admission. This closes a
diagnostic gap where a graph capture could accept while subsequent mapping
refused. Parsing, equation balance and receipt-decoder checks pass; full native
replay remains unexecuted because scratch builds are unavailable in this
session. Full browser SLAM and 10× realtime remain unqualified.
