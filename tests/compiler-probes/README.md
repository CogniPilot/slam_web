# Modelica compiler capability probes

`modelica-rgbd-observation.test.ts` exercises calibrated RGB-to-depth bearings,
inverse-depth interpolation, active-neighbor invalidation, depth discontinuity
and noise gates, camera extrinsics, ties-to-even descriptor centers, and 7×7
normalized RGB descriptors. It is a migration component, not a production node.
The pinned compiler panics on its reduction occurrence. The rebuilt review
compiler `e3be35ab6e85` passes all sixteen observation fixtures in 1.19 seconds,
including changed calibration, invalid observations and recovery. Algebraic
frame gates explicitly use Modelica `noEvent`, since they do not locate ODE
events. Batch execution and production worker integration remain pending.

An earlier version using ordinary event-producing comparisons exposed a
separate host lifecycle bug: after disabling then re-enabling the disparity
noise term, the input changed while the threshold retained its disabled value.
A minimal ordinary-comparison input-event regression reproduces that defect;
the reviewed `94cff417cec6` package repairs that lifecycle and passes the
changed-input regression. The production pin remains unchanged.

To test a reviewed upstream package without changing the application's pin:

```sh
RUMOCA_BRANCH_PKG=/path/to/review/package timeout 90s \
  nix develop path:.#ci -c npx vitest run \
  --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-rgbd-observation.test.ts
```

## Registration eigensolver

`modelica-eigen6.test.ts` is the acceptance gate for the bounded Modelica
Jacobi eigensolver needed by rank-aware registration. It checks known spectra,
orthogonality, matrix reconstruction and a three-dimensional planar nullspace.
The current review compiler's full session preparation/execution entry point
exceeds the 90-second external watchdog before assertions; it is unverified.
The complete matrix and sweep count remain intact.

## Full covariance

`modelica-covariance.test.ts` specifies the numerical acceptance criterion for
the complete 15-state Modelica covariance prediction: independent continuous
Lyapunov solutions, process-noise cross-coupling, symmetry and positive quadratic
forms. It uses the full state dimension and retains the current filter's cubic
transition and three-node Gauss-Legendre noise quadrature.

Execution on the **production pin remains unverified**. The pinned Rumoca 0.10.0 browser compiler panics
while certifying the generic reduction source. Expanding the fixed contractions
into equivalent Modelica terms gets further, but a cold session preparation did
not complete within a three-minute bounded run (approximately 1.36 GB RSS).
No numerical assertions ran in that probe. The model is not a production node.

The earlier rebuilt `slam-cv-performance` compiler at `e3be35ab6e85` was
tested in an actual browser through
[rumoca-filter-kernels.spec.ts](../browser/rumoca-filter-kernels.spec.ts), using
the unchanged generic nested-reduction source from its upstream fixture.
The generic SPD6 first-row empty reduction passes all numerical checks, but
full covariance session preparation still exceeds the separate 240-second
bound, reaching approximately 1.29 GB renderer RSS before assertions run.
That established the preparation bottleneck; native compile/balance tests
alone did not establish executable full covariance.

The fresh full-web package at `94cff417cec6` now passes the unchanged browser
gate for full generic covariance: all 675 transition/covariance/noise entries,
independent continuous Lyapunov references, cross-coupling, symmetry and positive
quadratic forms. Cold preparation takes 45.8 seconds; the three calls take
189–227 ms on a single CPU under shared load. This is numerical acceptance,
not fast execution or full SLAM integration. The generic SPD6 gate also passes.
The production compiler pin remains unchanged.

`modelica-pose-correction.test.ts` passes the same reviewed package with 29
observation cases: full Modelica 6×16 solve composition, all 225 Joseph/posterior
entries, all 15 correlated corrections, innovation/attitude/bias gates, rejected
updates retaining exact prior state/covariance, quaternion branches and recovery.
The independent oracle is JavaScript; no new Python implementation is involved.
The combined two tests take 46.8 seconds on one CPU.

`modelica-native-artifact.test.ts` verifies the new portable stage loader against
actual compiler output, including exact array values, source edits, JSON
save/reload, defaults/reset and bounded memory. It requires `RUMOCA_BRANCH_PKG`.

## Complete depth-noise frame

`modelica-depth-frame.test.ts` executes the complete 14,400-pixel
`models/SensorDepthFrame.mo`, with independent checks of all depth values and
conditional draw counts across 90 changing frames. Its two independent output
equations use separate retained loops; their expressions and dimensions match
the original sensor source exactly. Reviewed94 issues two certified compact
native families (675/381 bytes), rather than scalar-expanded image programs.
Signed zero, dropout boundaries, zero radial draws, changed calibration,
defaults/reset and JSON reload pass. An actual recompiled source edit changes
dropout and consumed draws across the complete frame.

Preparation costs 57.7 seconds and 3.6 GiB peak RSS; mean stage execution with
target copies is 0.60 ms. These measurements exclude random-stream generation,
GPU acquisition, worker transfer and SLAM. The new source is not integrated in
the preview; production Rumoca remains unchanged. The durable component proof
is [modelica-depth-frame-verification.json](../../dev/modelica-depth-frame-verification.json).

```sh
RUMOCA_BRANCH_PKG=/path/to/review/package nix develop path:.#ci -c \
  node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 8192 -- \
  npx vitest run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-depth-frame.test.ts
```

The two preparations use separate compiler source identities. Optional
`RUMOCA_DEPTH_ARTIFACT` and `RUMOCA_DEPTH_EDITED_ARTIFACT` paths can replay saved
actual compiler outputs without preparing them again; source/module digests
are still checked. The verification record distinguishes saved-artifact runs
from new preparation. This gate stays separate from production-node tests.

## Single compiled program

The [full-size pose-graph probes](../../dev/modelica-pose-graph-storage-2026-10-07.md)
execute the production iteration kernel in native and static browser-worker
tests, including all128 poses/all256 constraints and independent geometry.
Validation passes separately. The complete optimizer still refuses its scratch
layout; the tests do not replace that guarded composition or prove full SLAM.

The production [full350 robust pose fit](../../dev/modelica-robust-registration-2026-10-07.md)
passes actual native and static browser-worker covariance/consensus gates,
including moving correspondences, planar walls, typed input controls and reload.
Profiling exposes repeated whole-point-array captures in inactive native loop
envelopes. This remains component evidence, not full browser SLAM.

The current full-resolution descriptor check is documented in
[Native D435 descriptor](../../dev/modelica-d435-descriptor-2026-10-07.md):
actual 848x480 RGB3/350-feature WASM passes numerical checks in Node and a
static browser worker. Its kernel profile identifies repeated whole-image
argument copies. This component proof does not admit complete SLAM or change
the production compiler pin; the original capability gate below remains separate.

The [D435 FAST gate](../../dev/modelica-d435-fast-2026-10-07.md) verifies the
native preset's RGB3 DAE layout. Full-size native issuance still times out;
the smaller diagnostic module exposes whole-grayscale-image loop copies.
Its strict full-size numerical gate awaits a real compiler-issued artifact.

The unchanged [full350 matcher](../../dev/modelica-matcher-2026-10-07.md) now
passes actual native and static browser-worker numerical gates, including a
recompiled Modelica ratio edit and JSON reload. Runtime profiling identifies
whole-descriptor matrix captures inside the native loop envelope, even with
zero current candidates. This remains a component qualification; complete
SLAM and fast execution are not established.

`modelica-native-program.test.ts` is staged for RUM-011. It requires the new
official `prepare_native_program` API, and compares a single WASM executable
against the older compiler-issued stage modules for every Y bit in a 160×90
mixed scalar/array model. It preserves all 43,200 RGB inputs and 28,803 output /
intermediate scalars, changed inputs/time, an independent per-pixel oracle,
source edits, JSON reload, reset, private metadata ownership and ABI/hash
refusals. Its browser consumer makes one call and does not schedule stages or
copy their intermediate outputs.

Only TypeScript checks have passed for this staged consumer/probe. No actual
compiler package with the new API has been tested yet; it is not activated in
the application. This full-frame stateless program is a capability fixture,
not a complete SLAM pipeline. Stateful integration and bounded function loops
remain separate requirements. Older packages explicitly fail the missing-API
gate instead of supplying a host implementation.

Run just this capability gate after building the reviewed upstream package:

```sh
RUMOCA_BRANCH_PKG=/path/to/review/package nix develop path:.#ci -c \
  node dev/rumoca-bounded-run.mjs --seconds 120 --rss-mib 8192 -- \
  npx vitest run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-native-program.test.ts
```

Run separately from the production-node suite, with an external time bound:

```sh
timeout 180s nix develop path:.#ci -c npx vitest run \
  --config tests/compiler-probes/vitest.config.ts
```

The default suite checks the working ES15 F/G and SPD6 components. Passing that
suite does not prove complete Modelica covariance propagation or full SLAM.
