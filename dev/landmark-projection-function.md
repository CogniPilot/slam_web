# Pure landmark projection

`models/RGBDLandmarkProjection.mo` appends `RGBDLandmarkRotationValid` and
`RGBDProjectLandmarks`. The existing equation models are unchanged: their original
5,276-byte prefix matches the archived initializer preimage with SHA-256
`98fe255ff54004d5bc76f7c68cf4c93da2d0a8be45fac9cac52beec3fbe5e412`.

The projection function takes `opticalPoint[:,3]`, dependent `enabled[n]`, Real
`activeCount` and `poseAccepted`, body rotation/position, optical-to-body rotation,
camera origin in body coordinates, and `coordinateLimit` (default `1e6`). It
returns `worldPoint[n,3]`, `landmarkEnabled[n]`, `validCount`, `invalidCount`,
`configurationValid`, and `poseValid`, all Real. Its pose convention is optical
RDF to body FLU to estimated world ENU; it has no truth input.

The function preserves the equation model's exact Real-domain count/mask checks,
the finite proper-rotation gate with tolerance `1e-6`, and coordinate bounds at
both input and output. Disabled/unavailable points never enter the transforms.
`invalidCount` counts nonzero masks within the supplied domain whose optical
point fails its gate; it does not count pose failure or transformed-output bounds
failure for an otherwise valid optical point. Fractional/negative/oversized
counts invalidate configuration, with invalid counts still following that
original per-slot rule. Outputs refused by any gate are canonical zeros.

`tests/modelica/RGBDLandmarkFunctionAcceptance.mo` exercises the full350 domain
with42 time-varying cases, including sparse slot350, recovery, rotation tolerance,
all count/mask gates, NaN/Infinity padding and active payloads, calibrated optical
transforms, output bounds, and coordinate-limit variants. It compares every
1,050 world coordinate and350 masks exactly against the original equation model;
independent expectations check geometry, counts, finite outputs, and canonical
refusals. Four additional standalone equation-model comparisons cover coordinate
limits `0`, `-1`, `1e6+1`, and `1`. The first reference attempt reached an OMC C generator
defect in the test-only indexed tuple receivers `extraMask[j,:]`; it produced no
numerical result (92.883s, peak2,186,304KiB). The fixture now uses named whole-array
tuple receivers inside comparison models, with all numerical expressions and
domains retained. That combined five-oracle fixture then exceeded120s during C
compilation, both at the default `-Os` (peak3,221,212KiB) and explicit `-O0`
(peak3,001,520KiB). Those attempts produced no numerical result. The final harness
executes each independent full350 oracle model serially instead of flattening
all five instances together, and uses `-O0` for reference C compilation. Every
variant retains all42 cases and exact full-array comparisons; no production
source or numerical criterion changed.

Run `OMC_BIN=... node dev/check-modelica-landmark-function.mjs` for the default.
Set `LANDMARK_REFERENCE_MODEL` separately to `RGBDLandmarkZeroLimitAcceptance`,
`RGBDLandmarkNegativeLimitAcceptance`, `RGBDLandmarkLargeLimitAcceptance`, or
`RGBDLandmarkSmallLimitAcceptance` for each additional variant. It uses owned
`$HOME/scratch/slam_web/tmp`, CPUs12/13, nice15, OMP1, a120s/8GiB process-group cap,
and16GiB host reserve. Each receipt retains source hashes/bookends, MOS, log,
resources, and strict CSV validation. This is an independent OMC reference of the
projection function only; it is not connected-initializer, Rumoca WASM, browser,
or full-SLAM qualification.

All five references passed42/42 scenarios each (12 checks per scenario and375
strict CSV rows per variant). Every complete1,050-coordinate/350-mask differential
comparison is exact; independent transformed-world comparisons use tolerance
`2e-14`. All production/test/runner source bookends match their frozen preimages.

| Coordinate limit | Receipt suffix | Seconds | Peak RSS KiB |
| --- | --- | ---: | ---: |
| `1e6` | `acSqyg` | 33.488 | 1,068,928 |
| `0` | `k0jDl8` | 32.486 | 1,041,880 |
| `-1` | `i6WT3u` | 33.866 | 1,052,792 |
| `1e6+1` | `nI7rTc` | 33.437 | 1,052,572 |
| `1` | `8fox7H` | 33.823 | 1,115,804 |

Receipts live in
`dev/artifacts/modelica-landmark-function-semantics/landmark-function-semantics-<suffix>/report.json`.
`dev/landmark-projection-function-verification.json` aggregates the actual five
passes, all three incomplete precursor receipts, original-model prefix proof,
and current source checks. `manifest.sha256` beside the receipt directories
hashes all61 durable evidence files. The production file remains
`6eb353f1dffdcb54f373ed3ab6e60700dbd097759445edf21e0ceaf702c260d7`.
