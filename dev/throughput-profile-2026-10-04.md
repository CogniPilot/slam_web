# Throughput investigation, 2026-10-04

The measured all-sensor browser workload is still below real time. Static
sensor-geometry batching gave a **3.90%** gain in one same-bundle ABBA comparison.
A subsequent packed-readback comparison improved throughput from **0.4389× to
0.4911×**, an observed **11.90%** gain. Packed synchronous readback is now the
default after the final hardware gates. These are separate comparison campaigns;
their gains must not be multiplied into a claimed total improvement. Full visual
SLAM is not active in this workload; the production compiler pin is unchanged.

A subsequent normal-priority preview run, using all available CPUs and no CPU,
native-perf, GPU-timer or tracing instrumentation, measured **0.6229×**. This
characterizes the selected default on the shared host; it is not a matched
before/after result or a clean-machine maximum.

The same preview bundle also measures **2.639×** with economical graphics and
15/5/90/10 Hz camera/LiDAR/IMU/GPS. Cars, people and the depth cloud stay enabled;
150 synchronized camera frames, 50 scans, 900 IMU and 100 GPS samples arrive in
ten simulation seconds, with zero errors. This short warmed run demonstrates
the available lower-rate configuration, not an equal-work compiler gain.
The high-quality 90 Hz camera result remains the separate 0.6229× baseline.
See `dev/economical-user-preview-performance-verification.json`.

## Measurements and their scope

| Measurement | Result | Scope |
| --- | --- | --- |
| Normal preview, selected packed readback | 0.6229×; sensor 7.094 ms, physics 4.682 ms, detector 3.212 ms | Normal priority, unrestricted CPUs, no sampling; high Main Street, actors and cloud, 90/20/90/10 Hz, unchanged available plant/INS/Harris workload |
| Controlled all-sensor comparison, selected packed readback | 0.4911×; sensor stage 9.745 ms/camera frame | Two-core profiled ABBA; high Main Street, cars and people, paired RGB/depth 90 Hz, raw depth cloud, 64×1024 LiDAR 20 Hz, IMU 90 Hz, GPS 10 Hz; actual plant, inertial estimator and Harris detector |
| Actual isolated physics session | 2.500 ms/camera frame; `advance_to` 83.1% of measured endpoint processing | Pinned compiler, 900 camera frames/1000 exact sensor-clock endpoints, unchanged plant and solver; excludes GPU, worker RPC and scene rendering |
| Actual dedicated Chromium physics worker | 3.432 ms/camera frame; `advance_to` 83.2% | Same source and production compiler; 900 camera frames/1000 endpoints, 2329 worker CPU samples; excludes GPU/scene and whole-pipeline transport |
| Compiled full-14400-point registration | Mean 9.206 ms, p95 9.267 ms; 86.85% of native samples in generated WASM function 3 | Independent component, 100 warm calls and 1630 measured calls; excludes input copies, sensors, matching, filter, rendering and compilation |

These component timings come from different experiments. They must not be
summed into a claimed decomposition of the all-sensor browser result. The GPU
comparison uses the same workload and bundles for both conditions and checks
the exact count of every sensor event. Hardware reports the RTX 3090 through
ANGLE/WebGL2. The comparison used two CPU cores on a shared machine; it is
not a measurement of unrestricted machine throughput.

The separate unrestricted run delivered 900 consecutive camera captures,
200 LiDAR, 900 IMU and 100 GPS samples in 10 seconds of simulation time,
with zero errors. Sixteen complete viewer windows average 30.032 Hz, ranging
29.510–30.497 Hz; the maximum window p95 interval is 54.4 ms. Average viewer
FPS near 30 does not establish a steady 33.3 ms frame interval. An unrelated
external compiler build was active on the shared host.

The camera alone requires 900 complete captures per wall-clock second at the
90 Hz / 10× target: a **1.111 ms average budget per camera frame**, with the
other sensor events and processing also fitting into that budget. This makes
the magnitude of the remaining work explicit.

## Where the time goes

### GPU capture and readback

The browser CPU profile repeatedly enters `getBufferSubData` and `readPixels`.
Those API calls include blocked time; a CPU sampling stack by itself cannot
distinguish GPU completion, browser IPC and thread scheduling. A follow-up
diagnostic joined Chromium worker metadata to the actual sensor thread and
used native `perf`, GPU timer queries and per-thread scheduler accounting.

In that diagnostic, three copies took about **5.644, 2.455 and 1.180 ms per
camera capture**. Measured GPU RGB and depth passes were about **0.710 and
0.457 ms**, and a LiDAR face about **0.588 ms**. At least 1863 ms of the
3373 ms aggregate copy-call wall time could not be active CPU on that sensor
thread. This establishes a substantial stall, but does not uniquely identify
its cause. The instrumented run is not a throughput comparison: timer queries,
tracing, native perf and JIT mapping add overhead.

The retained candidate packs transfers into one PBO and uses one host copy,
with byte-preserving scatter into the existing buffers. All four output buffers
match exactly at three actor poses, including mixed-format signed-zero/NaN
payload controls. Four same-bundle ABBA runs gave 0.4389× versus 0.4911× and
reduced sensor wall time by 22.61%; both candidate runs beat both controls.
Final build, 14 unit controls and seven hardware browser controls passed.
Three.js asynchronous readback was already tried and was slower in
this workload (0.3388× versus 0.4333×); asynchronous APIs are not automatically
a throughput improvement.

### Physics execution

The pinned physics session spends 1.870 ms per sensor-clock endpoint in
`advance_to`, versus 0.0525 ms setting inputs and 0.2447 ms serializing state.
The snapshot materializes 269 values/~9.9 KB although the browser needs 25.
Reducing snapshot transport is a secondary opportunity; the dominant target
is numerical execution.

A dedicated Chromium worker repeats the finding: advance 2.571 ms,
state serialization 0.335 ms and extraction 0.100 ms per endpoint, with
3.432 ms per camera frame. This is browser execution of the unchanged pinned
plant, not a prediction from Node timings.

Native perf collected 439 samples with zero lost samples. The stripped compiler
WASM's hot function 23 contains a 32-way tagged dispatch, while function 32
contains vector growth/initialization. These instructions are consistent with
interpreter dispatch and allocation; stripped function numbers alone do not
establish exact Rust source attribution.

Inspection found the wasm32 simulation backend currently selects no native
execution backend, although `rumoca-exec-wasm` already provides an execution
runtime sharing Rust/WASM memory. A generic checked adapter is being developed
on `slam-native-functions`; the numerical plant, adaptive solver, tolerances,
events and refresh order must remain unchanged. The first adapter now passes
349,162 browser comparisons against the interpreter, including edited-source,
reset and rollback controls. It demonstrates no matched physics speedup:
only about 0.425% of the separately profiled advance window is inside generated
kernels, and no complete exact assignment sequence is admitted. Compiling those
sequences is the next measured target. This review compiler is not the preview
pin; see `dev/modelica-physics-critical-path-verification.json`.

The exact LabQuadrotor Solve inventory has 21 states, Y=262, P=192 and 241
refresh blocks. Its derivative graph contains a 3×3 linear solve that the
portable emitter currently declines. Other unsupported shapes include pure
calls and some tensor writes. The initial adapter can accelerate admitted
scalar refresh rows, with explicit fallback elsewhere. It cannot honestly be
called a fully compiled physics graph until those operations are admitted and
actual browser coverage is measured.

### Generated registration code

Native perf collected 1498 samples with zero lost samples, followed by JIT
injection and annotation of the actual TurboFan-generated function. The
profile places **86.85%** in function 3, **6.41%** in function 4, and **1.67%**
in V8's memory-copy wrapper. Several of the hottest annotated instructions
are scratch-memory stores and bit moves. This supports investigating the
emitter's temporary storage; it does not prove a memory-bandwidth limit.

The earlier exact scalar-cell emitter change reduced this same component
from 13.218 to 9.277 ms (1.425×), with bit-identical outputs. The new profile
reproduces approximately 9.2 ms. A subsequent candidate should retain scalar
temporaries in WASM locals within an exact checked program region, while
preserving required stores, aliases, failure order and public-output
transactions. This candidate is not implemented or measured yet. Floating
point reduction order and precision must not change silently.

A smaller storage experiment replaces 233 adjacent `i64.reinterpret_f64` /
`i64.store` pairs with direct `f64.store`, keeping cell addresses and widths.
Six alternating blocks per binary measured **9.340 versus 8.927 ms** (1.0462×).
The original binary and both round-tripped variants agree on complete Y bytes,
statuses and immutable P for 16 listed cases with poisoned scratch. This is a
post-emission diagnostic, **not a compiler-issued candidate**. A corresponding
typed numeric emitter change has been implemented and passes all 63 typed-call
Wasmi controls, including raw IEEE payloads and late-fault recovery. A fresh
compiler-issued module from the unchanged full14400 source subsequently measured
**9.531 versus 8.667 ms** (1.0996×), over six alternating blocks of 100 calls per
module, with every output bit equal and immutable inputs. Actual Chromium worker
execution passes nine numerical cases, four ABI faults and six metadata refusals,
plus stale-source refusal and JSON reload. These are isolated component results;
the preview compiler pin is unchanged and broader quality gates remain pending.
See `dev/rumoca-real-stores-verification.json`. The earlier diagnostic remains
separate evidence in `dev/registration-f64-store-diagnostic-verification.json`.

The frozen fresh browser compiler package also issues the unchanged full14400
source directly in an actual compiler worker, taking30.339 seconds. Its raw
artifact and71577-byte module are byte-identical to the artifact executed by
the ten-case numerical/reset/isolation browser proof, with the same consumer
bundle. Source-to-WASM browser issuance is therefore verified for this component;
startup remains slow and this package predates the next projection changes.
The same package compiles relative-pose source in0.591 seconds and passes26
original plus26 edited cases. See `dev/artifacts/fresh-browser-components`.

A full-capacity copy diagnostic now observes every original `memory.copy`
while retaining the original operation and comparing complete Y bytes/status
and immutable P against the source-issued module. Both 14400-active and
350-active fixtures execute 89,920 copies totaling 2,636,736 logical bytes.
86,419 copies are 24-byte vectors. The only 115,200-byte array copy executes
once outside all loops; this rejects the hypothesis of a full point-array
copy on every iteration for these fixtures. Logical copy volume is not DRAM
traffic, and the observer adds overhead, so this is not a runtime speedup or
a bandwidth diagnosis. Continue investigating scalar temporary storage and
the measured generated body. See `dev/registration-copy-inventory-verification.json`.

A following diagnostic replaces 36 fixed 24/32-byte copy sites with loads of
all source cells followed by stores, preserving overlapping-copy snapshots.
Original and round-tripped modules agree on complete Y/status and immutable P
for 16 fixtures. Six alternating blocks per binary measure **8.658 versus
7.728 ms (1.1203×)**, with the same full14400 inputs and 100 warm calls per
binary. Every candidate block is faster than every control block. This is a
post-emission diagnostic only; no compiler-issued small-copy change or preview
gain exists yet. A production fix must retain checked buffer bounds and failure
atomicity as well as values. See
`dev/registration-small-copy-diagnostic-verification.json`.

An additional diagnostic changes only `activeCount` in the same full14400
module. Two accepted 350-pair runs take 2.974 and 2.990 ms; two accepted
14400-pair runs take 9.155 and 9.189 ms. The capacity remains 14400 and all
parameter bytes remain immutable. This shows appreciable cost even with fewer
active pairs; it does not establish a smaller-capacity compiler gain or a
whole-pipeline result. See `dev/profile-registration-active-capacity.mjs` and
the scaling record embedded in the registration verification file.

### Host buffer handoff

The native-program host repeatedly checked input membership for every element
when obtaining an already validated field. Per-instance retention of the checked
input/output views reduces full14400 registration input copies and field access
from **2.256 to 0.0265 ms** in the final six alternating blocks of 200 calls per
consumer. The earlier 1.993-to-0.0252 ms comparison is retained separately.
The identical WASM module publishes bit-identical outputs after reset, retained
views stay live, and undeclared fields still refuse. Actual Chromium passes ten
numerical cases, ABI/metadata refusal controls and project-buffer isolation.
Cached lookup, reset and execution also reject externally detached memory;
all four controls pass in Chromium after `memory.grow(0)`.
This is host handoff alone, not kernel execution or GPU readback. The current
preview does not yet select this full-SLAM native-program path; its production
bundle remains unchanged. See `dev/native-field-handoff-verification.json`.

### Larger architectural experiment

Keeping rendered sensor buffers on the GPU and feeding compiler-generated
Modelica vision kernels directly would avoid reading full images/clouds back
to the CPU between those stages. This is a proposed architectural experiment,
not an implemented fast path. WGSL has f32/f16 floating types, rather than
native f64, so it requires a declared numerical profile and accuracy controls
for vision, while retaining the intended physics/filter precision. See the
[WGSL floating-point specification](https://www.w3.org/TR/WGSL/#floating-point-types).
The profiling browser currently reports no WebGPU adapter and no
`OVR_multiview2`; hardware/backend admission must be established before this
can be benchmarked. The portable WASM path remains necessary.

### Source preparation remains a separate blocker

The unchanged full160×90 `SeededDepthFrame` source still produces no module
within a bounded 30-second native attempt. A normally finalized native profile
has **903 samples, zero lost**, with 14.40% self time in expression projection
and prominent hashing/visited/fold-enqueue costs. Its last membership checkpoint
records **80,594,849 dense hits and 5,152 gaps**. Peak RSS is about 33 MiB.
This binds the observed work to repeated dependency traversal rather than an
unproven GPU or runtime explanation. It does not identify one exclusive pass
or prove the asymptotic cause. The raw trace stays on Scratch; source/producer
hashes and retained reports are in
`dev/seeded-depth-native-profile-verification.json`.

A follow-up using the verified narrow-Size-memo producer also times out at
30.069 seconds with no artifacts; its finalized trace has 904 samples, zero lost.
The checkpoints now identify the repeated work precisely: structural incidence
requests expression189 scalar0,1,2 and subsequent output pixels; each request
opens the same owned fold and traverses all14400 source points. By scalar1799,
the point counter has crossed26 million. A checked indexed-write projection
fix is applied on the compiler branch, preserving sequential RNG state
dependencies and source edge/fault order. The final combined projection suite
passes all 98 controls. Full-source issuance and original seeded-stream
numerical acceptance remain required; no depth-runtime speedup is established.

The actual unchanged full14400 source now accepts the indexed-write certificate
and traverses both complete output arrays. Its last membership checkpoint is
400,000, compared with the earlier 79.1 million; these work markers are not a
matched speedup ratio. The subsequent finalized 904-sample profile places
61.62% self time in `variable_scalar_slot`, 19.03% in `pack_coordinate` and
7.96% in register allocation during Solve lowering. The roughly ten-second
sampling window does not account for the entire thirty-second attempt. It
still times out without a native or Solve artifact. The next source target is
repeated full-array slot validation and packing during lowering, with checked
storage extents, register metadata and source/fault ordering preserved. See
`indexedWriteFollowup` in the depth profile verification file.

The checked coordinate-range optimization is now applied. Seven differential
controls compare it with the original per-scalar validation, including full
14400-cell storage, malformed bounds and register-allocation failures. All 103
projection controls and scoped strict compiler checks pass. The unchanged
full-depth preparation still times out at **60.095 seconds**, with no native
artifact and no numerical admission. A late ten-second `perf` window from that
same live process has **903 samples, zero lost**: BTree iterator destruction
accounts for 19.16% self samples, dependency-set union 16.50%, pure-call dependency
walking 15.73%, and register replacement 10.30%. The next measured frontier is
IR-Solve dependency extraction. Register reads clone exact BTreeSets and whole
input summaries are cloned for outputs. Optimized parent unwinding is incomplete;
these samples do not establish a particular pass or asymptotic complexity.
See [the source-bound range report](modelica-coordinate-range-verification.json).

The unchanged full350 matcher now passes the narrow Size/Floor/Real-Abs guard
eligibility checks. Its new preparation still times out at **30.091 seconds**,
with no module. Retained guard effects saturate the existing **16 MiB** memo
budget at 185440 events and 8568 keys; subsequent checkpoints record millions
of saturated requests. The 874-sample, zero-loss native trace is retained under
`$HOME/scratch/slam_web/profiles/matcher-scalar-abs-range`. This identifies another
compile-time frontier, not a measured matcher execution cost or justification
for increasing the cache limit without examining its representation.

An independent source-issued probe of the original depth-pixel helper reproduced
the typed `log(max(1e-9,radial))` refusal. The generic shared math-import fix is
now applied; the combined compiler gate passes 1,791 tests and scoped strict
checks. The original helper now issues in 23.455 ms and executes 265 independent
V8 cases with exact LCG state/draw counts, immutable inputs, zero observed depth
error and no Float32 mismatches. Invalid, dropout, accepted and zero-radial cases
are included. This is scalar-helper admission, not full-frame admission. The
evidence and original refusal are retained in
[the typed-math report](modelica-typed-math-functions-verification.json).
The complete original depth stream must compile and pass its independent
numerical oracle before this can be called an integrated Modelica depth kernel.

A scalar WASM `min`/`max` mismatch was independently reproduced and repaired:
single-NaN operands now follow the canonical evaluator's numeric selection.
Actual Wasmi execution passes 512 scalar results and two full14,400-pixel maps,
plus the existing sign and compact-kernel controls. This closes a numerical
backend defect; it does not by itself enable the complete physics graph.
`dev/rumoca-scalar-extrema-verification.json` retains the pre-fix failures and
post-fix execution evidence. Fresh browser and MSL validation remain pending.

## Research informing the next experiments

* [Khronos WebGL2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
  specifies the buffer readback APIs and sequentially consistent buffer access.
  Fewer synchronization/host-copy calls are a candidate, not a promised gain.
* [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
  exposes asynchronous render-target readback. The local negative result takes
  precedence over assuming that this API will help our lockstep workload.
* [V8 WASM compilation pipeline](https://v8.dev/docs/wasm-compilation-pipeline)
  explains baseline and optimized tiers and debugger effects. The registration
  samples explicitly identify TurboFan; this kernel is not running in V8's
  baseline tier during the recorded hot window.
* [Three.js BundleGroup](https://threejs.org/docs/pages/BundleGroup.html)
  supports cached WebGPU render bundles for static groups. This is a later
  submission-cost experiment, contingent on an actual backend migration.
* [Three.js WebGPURenderer migration](https://threejs.org/manual/pages/webgpurenderer)
  requires custom shaders to move to supported node/TSL materials. Swapping the
  renderer constructor alone does not preserve our depth and LiDAR shaders.
* [Khronos OVR_multiview2](https://registry.khronos.org/webgl/extensions/OVR_multiview2/)
  is a possible multi-view LiDAR experiment only after a hardware capability
  probe; support and benefit have not been established here.

## Reproduction and retained evidence

Durable browser comparison: `dev/sensor-geometry-performance-verification.json`
and `dev/benchmark-sensor-geometry.mjs`; selected readback comparison:
`dev/sensor-packed-readback-performance-verification.json`. Native sensor/thread diagnostic:
`dev/sensor-native-profile-verification.json` (1511 total perf samples,
115 from the identified sensor thread, zero loss). Physics evidence:
`dev/modelica-physics-critical-path-verification.json`. Durable registration follow-up:
`dev/registration-runtime-perf-verification.json` and
`dev/profile-modelica-native-runtime.mjs`.

Unrestricted normal-preview characterization:
`dev/sensor-normal-preview-performance-verification.json`.

Large traces, JIT images, disassembly and raw logs remain under
`$HOME/scratch/slam_web`, specifically `profiles/registration-runtime-followup`
and `tmp/physics-critical-path`. The verification records bind source, artifact,
module and trace hashes. Owned processes are profiled rather than sampling
unrelated system tasks. Native perf uses `cpu-clock:u`, 99 Hz and DWARF call
graphs; JIT-enabled Node uses `--perf-prof --perf-prof-unwinding-info` and a
scratch output directory. Run tooling through `nix develop path:.#ci`.

No result here establishes 10× real time, full visual SLAM, or a production
compiler migration. Any retained optimization must preserve sensor rates,
lockstep processing and numerical behavior and improve the measured workload.

## Exact-assignment browser follow-up

The new full-web review compiler now executes constructor-issued assignment kernels directly in Chromium. Full-plant Auto/Interpreter comparison passes349,162 visible values plus reset, rollback, repeated-time identity and mass edit. Actual generated module hashes match native source-issued modules. A separate counters-off same-build ABBA advance comparison measures4.467→2.593ms/camera interval (1.723×,41.95% less advance time), with unchanged930frames/1033endpoints/high90/20/90/10clock. Cold frames are included; camera/LiDAR/rendering, JSON snapshots and fullSLAM are excluded. This is neither a preview migration nor a whole-pipeline speedup.

The saved3107-sample CPU trace now resolves Rust functions: singleton projection assignments take91.66% of inclusive sampled advance time; typed pure calls take66.49% (overlapping groups), while canonical linear solves take0.34%. The next candidate is compiler-issued target-value execution through the actual projection path. The original analyzer mistook V8 js-to-wasm entry shims for generated kernels; offline reanalysis fixes this and retains the original report. Five analyzer regressions pass; no extra model run or altered samples are used to correct attribution.

[Browser build/parity/timing/profile evidence](rumoca-physics-exact-browser-verification.json) and [physics details](../docs/physics-performance.md) preserve exact hashes, scope and failed launch history. The normal website pin, fullModelicaSLAM integration and10×target remain pending.
