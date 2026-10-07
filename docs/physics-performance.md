# Modelica physics performance

## Current pooled-storage review

The frozen `06617147…` compiler builds for the browser and removes the observed
private-memory allocation failures. Actual Chromium constructs all 205 emitted
kernels without error; the derivative assignment kernel executes 558 times
with status zero in the short diagnostic. The longer unchanged-plant gate
passes 349,162 comparisons against the interpreter, including reset, rollback,
repeated time and the original Modelica mass edit. Maximum scaled difference
is `4.55e-13` against a `2e-9` tolerance.

An uninstrumented interleaved comparison against the preceding `46bda124…`
compiler measures **3.336→1.219 ms per camera interval**, a **2.737× speedup**
for physics advance. All 277,877 compared values match exactly. Both use the
same 90/20/90/10 Hz endpoint schedule and adaptive solver. This excludes state
extraction, sensors, rendering and SLAM. Multiple emitter changes separate
the compiler artifacts; this is not an isolated-patch causal benchmark or a
10× whole-system result.

Concurrent original and edited plants exercise one private pool with distinct
observed bases. Reset leaves the other plant intact. After all runtime leases
are freed, a fresh plant obtains a different pool even while 276 old exported
functions remain retained; those old functions are not called after free.
All 35,508 lifecycle comparisons match exactly. These controls do not claim
immediate browser garbage collection or physical-memory release. Full extent,
late-fault and reentrancy controls remain separately recorded native tests.
[Browser verification](../dev/rumoca-private-arena-browser-verification.json)
retains actual emitted bytes, all four browser gates and resource limits.
Application integration and complete visual SLAM remain separate work.

The fixed20 native MSL canary passes with unchanged outcomes and nine
byte-identical traces, but its feature closure excludes the changed WASM
backend. The application review starts the default scene and then refuses
FAST compilation at the existing raster certification guard. The main
preview therefore retains its previous public compiler. The exact preset
cause is under investigation; the physics-only gain is not yet a shipped
application gain. [Application gate](../dev/rumoca-private-arena-preview-verification.json).

## Earlier private target-value review: correct results, slower execution

The latest frozen compiler closure `a5a1bf42…` builds successfully for browser
WASM, with unchanged source checks before and after the build. Its private
target-value kernels execute in Chromium and preserve the full plant across
349,162 comparisons, reset, invalid-operation rollback, repeated time and a
mass source edit. Maximum scaled difference is `4.55e-13` at a `2e-9` tolerance.
The observed sessions execute 5,046,814 private kernel calls with zero failure
statuses. Their hashes identify actual browser-instantiated bytes; they have
not been matched to native inventory module hashes.

Performance does not pass. With counters disabled, an interleaved
baseline/candidate/candidate/baseline comparison measures **2.557→3.182 ms**
per camera interval: **24.46% more advance time** than the earlier exact-assignment
compiler. Both artifacts run the same complete plant, adaptive solver,
tolerances and 90/20/90/10 Hz endpoint schedule. The comparison checks all
269 visible fields at 1,033 endpoints. It excludes GPU capture, rendering,
state extraction and SLAM; externally owned host builds were active.

A separate 3,409-sample CPU profile shows the remaining interpreted typed-call
path under `refresh_causal_seed_rows` accounts for 53.21% of sampled advance
time. Singleton projections account for 29.17%, generated kernel descendants
for 5.28%, and linear solves for 0.19%. Inclusive groups overlap. Many small
private calls now reach compiled code while the causal seed sweep still
interprets expensive functions. The earlier exact-assignment profile places
all 1,434,940 sampled microseconds of interpreted typed calls under projections;
the candidate places all 1,463,246 under causal seed refresh. This shows that
the remaining interpretation changed stage rather than disappearing. Private
status bridges account for another overlapping 506,169 sampled microseconds
in the candidate. These saved profiles were collected at different times;
the uninstrumented interleaved comparison above establishes the measured
regression, while the profiles identify paths to investigate.

An actual constructor diagnostic now identifies the derivative failure. Its
25,022-byte module is emitted and matches the native-tested derivative module
exactly (`058f702b…`), but Chromium throws `RangeError` while allocating its
private memory. Two unchanged 30-frame runs each compare all 269 visible fields
at 33 endpoints exactly with Interpreter; failed native admission preserves
correct results through the existing fallback. The first run records 14 failed
instances and the second records 15, including the derivative instance in both.
These are diagnostic observations, not new performance measurements.

The private-register emitter adds a separate, unexported memory to each kernel.
Import/export metadata alone concealed this defined memory. A minimal actual
Chromium control retains 384 instances importing the same memory successfully;
giving each instance one defined 64 KiB memory fails at 122 instances with the
same allocation error. The unchanged derivative bytes reproduce that failure.
Importing the same second arena memory into 384 instances also succeeds. This
rules out an imported-memory instance cap for the tested count. The browser's
[pinned V8 memory allocator](https://github.com/v8/v8/blob/31fac3bef58c3def36b0760e4ddc54ec77099596/src/objects/backing-store.cc)
reserves an 8 GiB virtual address range for guarded wasm32 memories, even when
the declared maximum is one page; that reservation is distinct from committed
physical RAM. The controls and source together identify per-kernel memory
reservations as the cause of the observed native admission failure.

The required fix is bounded private storage that avoids one guarded memory per
kernel while retaining disjoint storage ownership, faults and reentrancy.
Simply sharing the same zero-offset scratch space would weaken isolation.
The seed refresh already tries the native schedule, so a second dispatch hook
is unnecessary. Keep the production pin unchanged until corrected construction,
whole-plant parity, throughput and matched compiler gates pass.
[Instantiation evidence](../dev/rumoca-physics-instantiation-verification.json)
and the [earlier profile record](../dev/rumoca-physics-private-browser-verification.json)
retain the distinct verification scopes.

The matched fixed 20-model canary for this same frozen compiler closure is now
complete. All model outcomes are unchanged, and the nine completed numerical
traces match the baseline exactly across 175 channels. Nine ToDae refusals and
two Solve failures remain visible. This is a focused matched delta, not full
MSL parity; it does not cover subsequent tensor-view or matrix code-generation
changes. [Canary evidence](../dev/rumoca-matched-msl-canary-verification.json).

## Earlier exact-assignment browser review

The earlier full-web review compiler uses exact assignment kernels in Chromium.
With counters and CPU sampling disabled, the same complete plant averages
**4.467 ms with Interpreter and 2.593 ms with Auto** per camera interval:
**1.723× faster, or 41.95% less advance time**. The ABBA comparison contains
two 930-frame runs per policy with identical adaptive integration, tolerances,
held controls and 90/20/90/10 Hz sensor-clock endpoints. It includes the first
30 cold frames; JSON extraction, initialization and the scene/sensor pipeline
are outside the measured advance calls. This is a shared-host, isolated physics
result, not an equal-work website or full-SLAM throughput result.

Separate instrumented runs prove actual browser activation, full-plant policy
parity over 349,162 comparisons, signed zeros, reset replay, invalid-operation
rollback, repeated-time identity and a mass edit. During each original Auto
trajectory, 15,461 assignment calls and 687,863 residual calls execute; assignment
statuses are all zero and Interpreter uses no generated kernels. The three
instantiated assignment modules exactly match native source-issued module
SHA256 values: 903 bytes, 40,240 bytes/120 programs, and 25,022 bytes/68 programs.
The first bytecode matches two equivalent sequence identities, so its digest
alone does not identify which constructor sequence was used. Static admission
of all 28 possible sequences remains a separate native proof.

The fresh WASM package is 35,803,870 bytes, SHA256
`084ebb6713ab2a693cea6b887f9da879736b7f6d98f829afcde11a540a18001e`,
from the verified frozen 2,389-file compiler closure `8f719cbb…`.
Its guarded build passed in 172.482 seconds with four Cargo/test/Rayon workers.
[Browser verification](../dev/rumoca-physics-exact-browser-verification.json)
retains the actual reports, executed harnesses and an initial Chromium launch
failure caused by a Unix socket path that was too long. The corrected run only
shortens the derived Scratch temporary path; compiler and model stay identical.
Canonical projections and dense linear solves still execute outside assignment
kernels. The production compiler pin and normal website remain unchanged;
fixed-20 canary evidence and complete SLAM are still pending.

The new 3,107-sample Chromium profile resolves the remaining Rust functions.
Of 2,158,001 sampled microseconds within `advance_to`, 1,977,931 descend through
`project_algebraic_singleton_assignment` (91.66%) and 1,434,940 through
`typed_program::eval_pure_call` (66.49%). These inclusive groups overlap.
Canonical linear-solve functions account for 7,416 microseconds (0.34%);
compiling them alone would leave the main observed cost. The projection path
calls `PreparedScalarProgramBlock`'s target-value evaluator, then the typed
function evaluator, including vector allocation. Returning compiler-issued
target values through that path is the next candidate to validate.

The original profiler classified every `wasm://` ancestor as generated code.
V8 also gives its `js-to-wasm` entry trampolines that URL, which incorrectly
attributed compiler execution below the entry wrapper to generated kernels.
Reanalyzing the same saved trace separates those engine wrappers: actual
generated-kernel descendants account for 22,264 microseconds, about 1.03% of
sampled advance time. Five regression checks cover wrapper exclusion, imported
math descendants, unclassified frames, duplicate-context aggregation and
malformed call trees. The original report remains visible beside the
[corrected report](../dev/artifacts/physics-exact-browser/cpu-profile/corrected-report.json).
No model rerun or timing adjustment is used for this correction.

## Earlier production-pin and scalar-bridge measurements

The unchanged full quadrotor plant spends about 83% of its isolated physics call time in `advance_to`. The input setter is a small part of this cost. The measurements use the production compiler pin, the existing RK45 session, its tolerances, and the High configuration's camera/LiDAR/IMU/GPS rates of 90/20/90/10 Hz. No integration steps or sensor-clock endpoints were removed.

| Isolated measurement | Advance per endpoint | JSON plus snapshot extraction per endpoint | Total per camera frame |
| --- | ---: | ---: | ---: |
| Node 24, CPU profile and native perf | 1.870 ms | 0.323 ms | 2.500 ms |
| Chromium 154 dedicated worker, CPU profile | 2.571 ms | 0.434 ms | 3.432 ms |

Each run measures 900 camera frames and 1,000 physics endpoints after 30 warmup frames. These are CPU-only session measurements; scene rendering, sensor capture, worker RPC and the whole SLAM pipeline are absent. Sampling overhead and sequential warming prevent a causal comparison between the runs. The existing full-state JSON contains 269 visible values, about 9,879 bytes, while the snapshot consumes 25 values. Reducing that transport is secondary to accelerating execution.

The finalized native trace has 439 samples and no lost samples. The Chromium worker profile has 2,329 samples. Hot stripped WASM functions include a tag-dispatch body and vector-growth code, consistent with generic evaluation work. The retained bytecode observations and V8 address-map joins do not identify exact Rust functions.

The actual complete plant lowers to 21 continuous states, 175 algebraics, 66 outputs and two pure-call owners. Its derivative block contains a dense 3×3 linear solve. The production compiler's `wasm32` simulation composition supplies no execution backend even though `rumoca-exec-wasm` provides a runtime for compiler-generated row kernels sharing the compiler's WASM memory.

The first review bridge preserves the current ME component, adaptive solver, refresh ordering and events. It admits complete original scalar programs with exact source spans and output mappings. That measured profile declines Min/Max, dense linear solves, multiple outputs, tensor ranges, pure calls, external tables, directional kernels and complete assignment/event schedules. Selected unsupported programs decline before execution. Whole-block execution requires every original program to be supported. The original evaluator remains available through the existing runtime contract.

The review bridge instantiates generated modules through `js_sys::WebAssembly::Module` and `Instance`, importing the existing `wasm_bindgen::memory()`. Its synchronous JS function call executes the generated module directly in Chromium's WebAssembly engine. Wasmi is the native test oracle; it is not nested inside the browser compiler for this path. The measured small kernel share therefore identifies a coverage boundary rather than a nested interpreter.

Seven focused admission controls and an actual unchanged full-source inventory passed. The scalar profile admits 53 of 121 implicit programs (431 of 1,313 static operations), 15 of 17 derivative programs (70 of 86 operations), and all 12 root-condition programs. Complete derivative execution still refuses the unsupported members. Every constructor-issued causal assignment sequence contains an unsupported member, so **zero whole assignment sequences fit this first profile**. These static counts do not measure runtime hit share.

Normal causal refresh uses exact-assignment schedules and can bypass selected-row kernels. The bridge therefore has no demonstrated critical-path speedup. Six host binding controls and scoped sim/binding strict Clippy passed. A frozen review browser compiler now passes full-plant Auto/Interpreter differential checks: all 269 visible values across 1,033 endpoints, reset replay, invalid-operation rollback, repeated time, and a mass edit from 2.0 to 2.4. The 349,162 comparisons have a maximum scaled difference of 3.41×10⁻¹³ against a bound of 2×10⁻⁹; signed zeros are checked separately. This compares the same build's execution policies; independent plant validation remains separate.

Auto creates 120 generated expression kernels and executes 715,310 calls including initialization and controls; Interpreter creates none. The diagnostic ABBA advance times were 4.545, 4.526, 4.586 and 4.405 ms per camera frame. These timings include kernel counters and cold frames and demonstrate no gain. Separate finalized worker CPU profiles contain 5,338 Auto samples and 5,493 Interpreter samples. Only 18,019 of 4,240,059 sampled microseconds within Auto `advance_to` descend into generated kernels, about **0.425%**. The remaining samples include compiler execution and its other runtime work; the measurement does not classify all of it as interpretation. The sampled Auto/Interpreter advance means were 4.296/4.711 ms per endpoint, with no causal speedup attributed to that sequential pair.

The next useful execution scope is the complete constructor-issued assignment schedule and the canonical dense 3×3 solve. That solve selects the existing SmallDense policy, preserving finite checks, pivot ties, ordered row normalization/elimination and source faults. It must retain original outputs and schedule order. No diagonal assumption, matrix inverse, plant rewrite or integration-step reduction is justified by this inventory.

A subsequent review emitter now consumes the existing constructor-issued exact assignment schedules. Each complete output tuple succeeds in scratch before its ordered targets commit; later programs observe earlier commits. A fault in a later program retains earlier complete commits, while a fault within a tuple publishes none of that tuple. Six actual Wasmi controls verify sparse targets, ordered dependencies, late faults/recovery, immutable parameters and guarded entry spans. The paired native gate passes 1,791 tests with four Cargo/test/Rayon workers, scoped strict Clippy and formatting. Its [separate verification record](../dev/rumoca-exact-assignment-schedule-verification.json) preserves failed attempts, exact source/producer hashes and supported profiles.

The next [actual full-source gate](../dev/rumoca-physics-exact-source-verification.json) now admits all 28 distinct constructor-issued assignment sequences from the unchanged plant, including projection seed sequences. The original source and a mass edit from 2.0 to 2.4 each pass 112 direct Wasmi cases with bit-exact comparison of all 262 Y values, unchanged 192 P values, and guarded spans. Modules are 552–40,240 bytes, with 2,096–2,976 scratch bytes. The four fixtures cover initial values, general six-degree-of-freedom state, near-ground conditions and long command time. Scoped nine-package strict Clippy and formatting pass; the frozen source, producer, module manifests and complete binary fixtures are retained.

That native source gate measures static assignment coverage. The later browser
activation and full-plant policy parity are recorded above. Certified algebraic
and derivative dispatches still contain 22 and 16 projection steps respectively,
and root/event dispatches are projection-only. The existing normal refresh
snapshot owns whole-refresh rollback; other torn-sweep and relation-memory paths
retain their existing retry behavior. Canonical SmallDense3 emission and the
fixed 20-model canary remain pending.

The review package does not change the production pin or establish a fully
native RHS, full SLAM or the 10× target. The original scalar bridge used two-job
focused gates; subsequent exact-assignment and full-source focused/strict gates
use SPEC0033 §6a's fixed four-worker budget. A measured fixed 20-model canary
delta remains pending, and cohort parity is unmeasured.

The [durable verification record](../dev/modelica-physics-critical-path-verification.json) binds source/compiler hashes, resource guards, finalized profiles, the complete Solve inventory, and the current adapter scope. Reproduction scripts are [Node](../dev/probe-physics-critical-path.mjs), [Chromium worker profiling](../dev/probe-physics-browser-cpu.mjs) and [same-build browser policy parity](../dev/probe-physics-portable-me.mjs); raw profiles and generated-code inspection remain under `$HOME/scratch/slam_web/tmp/physics-critical-path`.
