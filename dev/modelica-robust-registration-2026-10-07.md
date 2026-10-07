# Robust pose fitting in WASM: numerical acceptance and copy bottleneck

The production `FitRigidPointPairsRobust` now issues and executes with the
PR 390 paired Rumoca package, version 0.10.2 / revision `7e8ec61d2adf`.
The wrapper retains all 350 pair slots, 64 consensus hypotheses, four refinement
passes and covariance-based residual certification. Production math and the
application's compiler pin are unchanged. This is a component qualification;
complete browser SLAM still awaits compiler admission and runtime integration.

Preparation takes 2.30 seconds, about 561 MiB peak process-tree RSS. The actual
schema73 f64-v3 executable is 221365 bytes, with 377 public Real outputs and
compiler-issued Integer/Boolean input lanes. Its source snapshot SHA256 is
`97776c421c33b8b175e090004693abe318df3c6945e0974821df1148d6336694`;
module SHA256 is
`1d6ae4d732de24c0021ac2623889d91e3f0a4ffdc42d97b49a2eba5f1e2ceb06`.

## Numerical evidence

The native gate passes 28 cases; a static Chromium worker passes 29, including
artifact reload. Independent analytic geometry checks dense and sparse points,
planar walls, exact transforms and moving correspondences. Covariance residuals
are independently certified using a matrix inverse rather than the Modelica
Cholesky implementation. Exact-fit eigen gaps use a closed-form 3x3 spectrum
rather than the production 4x4 Jacobi solver.

- Full350 consensus retains 329 correct pairs and rejects 21 moving pairs.
- Sparse consensus retains eight of ten pairs, including late array slots.
- Calibrated axial noise passes with RMS above the metric gate; lateral
  outliers are still rejected. Excessive required consensus refuses the pose.
- Disabled NaNs are ignored; malformed coordinates, masks, covariance, counts,
  fractions and typed hypothesis budgets refuse safely.
- Both typed and Real input bytes remain unchanged. Reset, recovery, JSON
  reload and stale-source refusal pass.
- A typed one-hypothesis budget refuses a deliberately contaminated first
  sample; restoring 64 hypotheses recovers the eight correct correspondences.

No JavaScript registration algorithm substitutes for the compiled Modelica.
JavaScript generates fixtures and checks results only. The browser probe serves
static files and executes in a worker; it does not exercise sensor ingress or
the complete SLAM worker.

## Performance finding

Original-module warm medians are roughly 118 ms for a clean full350 frame,
156 ms for consensus with 21 outliers and 117–120 ms for empty/invalid controls.
These are CPU WASM component timings under shared host load, not simulation
throughput or a GPU benchmark.

An actual ten-second `perf` window lies strictly inside a checked evaluation-only
interval, verified against Linux monotonic timestamps with `perf --clockid mono`.
It has 990 samples, zero lost samples: 57.29% of weighted leaf cycles are in
memmove called by the WASM copy wrapper, with another 3.53% in the wrapper.
All leaf periods remain in the denominator, including 382 samples without an
available callchain.

Instrumentation preserves every original call and `memory.copy`, then checks
all 377 output cells bit-for-bit and both input lanes against the original:

| Input | Copy calls | Logical copied bytes per evaluation |
| --- | ---: | ---: |
| Clean full350 | 2250598 | 9177280920 |
| Full350 with 21 outliers | 3375211 | 9267276272 |
| Empty active domain | 2214900 | 9174192520 |
| Invalid zero hypothesis budget | 2215906 | 9174247224 |

One site in function14 copies the entire 8400-byte source-point matrix
1075200 times in every case: **9031680000 logical bytes**, including clean,
empty and invalid inputs. Its adjacent 72-byte capture executes equally often.
The count is `1024 × 350 × 3`: native finite-envelope work survives outside the
source's consensus and active-iteration guards. Actual hypothesis fit calls
remain correctly conditional: 64 with outliers and zero in the clean/empty
controls. These are logical copy widths, not measured physical DRAM traffic
or instrumented runtime timings.

This extends the existing compiler request for alias-safe readonly captures
and lazy dynamic domains. Changing Modelica capacities, weakening rejection
gates or implementing the estimator in JavaScript would hide the problem.

## Reproduce

Prepare the exact production math plus
`tests/compiler-probes/fixtures/RGBDRobustRegistrationFrame.mo` with
`dev/probe-native-program.mjs`. The source concatenation includes an extra
newline between the two files. Then execute the numerical gate:

```sh
RUMOCA_ROBUST_ARTIFACT="$artifact" nix develop --no-update-lock-file .#ci --command \
  node dev/rumoca-bounded-run.mjs --seconds 150 --rss-mib 8192 -- \
  npx vitest run --config dev/vitest-robust-registration-native.config.ts
```

`probe-native-robust-browser.mjs` and `probe-native-robust-performance.mjs` take
artifact, exact source and report paths. `observe-native-robust-copies.mjs`
takes artifact, exact source and an output directory; its module is diagnostic
only. Detailed receipts and source preimages are under
`dev/artifacts/modelica-robust-native-2026-10-07/`; large artifacts and raw
profiles remain under `$HOME/scratch/slam_web`.
