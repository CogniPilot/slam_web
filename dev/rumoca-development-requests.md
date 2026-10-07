# Rumoca development requests for browser RGB-D SLAM

Current-source note (2026-10-07): unused raster/thumbnail vision, CPU depth-noise
models and the partial SLAM placeholder have been deleted. Older sections below
are historical measurements or requests, not available execution paths. Current
source and runtime status are in [the composition](../docs/rgbd-inertial-slam-composition.md).

Execution resumed on 2026-10-05 after unrestricted access was restored to the
root agent. Both `../rumoca-native-functions` and `$HOME/scratch/slam_web` pass
shell write-access checks. The root agent owns compiler mutations and Cargo
execution because existing child agents still retain their restricted profiles;
they provide reviewed commands and source proposals without bypassing those
profiles. The full SLAM objective remains unfinished.

Before resuming compiler work, recover the state of the earlier qualification
driver if possible. Its last recorded broader log is 433,395 bytes with SHA256
`cbfe546dbdca85a6696e96906fd452a48c8a775dc20dfe11ae8563925b478106`,
zero test-result summaries, and no terminal resource or source-after record.
The missing tool handle does not establish a successful or failed qualification.
Do not move or reuse a potentially active cache without resolving its ownership.

Continue with the existing branch and unchanged full-size source. The resumed
coverage-index qualification has passed; capture allocation boundaries in the
prepared private copied diagnostic producer. Qualify the lazy column-cache change and compare the
same source under the same limits. Integrate the borrowed-subscript and paired
direct-division/BroadcastBinary changes with their production tests and original
source replay. Only then qualify and promote the browser compiler package and
complete the native input/frontend/filter/map/loop-closure integration. The
reviewed proposals are linked below; none of their source-integrity checks
substitutes for compiler execution or full-pipeline acceptance.

Updated: 2026-10-05. Current compiler integration branch: **`slam-native-functions`**,
in the sibling `rumoca-native-functions` checkout. The earlier
`rumoca-slam-perf` / `slam-cv-performance` branch is historical evidence.
Make current compiler fixes on the integration branch, validate
them there, and bring the resulting browser artifact into `slam_web`. This file
tracks work we are implementing ourselves; it does not defer the fixes to an
external agent. Preserve the original sibling `rumoca` working tree.

### Latest complete-filter and full-frame frontiers

The [earlier latest-main unchanged full-frame preparation profile](rumoca-original-fast-preparation-profile.json)
stops at the owned 8 GiB RSS limit after 225.796 seconds, before issuing a Solve
inventory or executable. Its 15-second `perf` sample has no lost samples:
`Coverage::overlaps` accounts for 55.74% of self samples and native schedule
`dependencies` for 34.22%. These are compiler preparation costs, not detector
execution times. The proposed generic fix indexes bounding spans while retaining
the exact periodic overlap checker, all dependency/fault obligations and the
original deterministic stage order. Its copied-source controls pass, but dense
synthetic cases regress. The [independent proposal review](rumoca-preparation-proposals-root-review.json)
preserves those regressions and the original validation obligations.

The [unchanged full-frame diagnostic](rumoca-fast-native-preparation-counts-verification.json)
now measures 13,537 producer families, 633,864 reads and 90,552 dependency edges.
The old checker makes 8,580,616,968 producer/read comparisons per derivation,
while actual edge capacity is only 827,904 bytes per completed graph. The guarded
run ends at 8 GiB RSS after 245.631 seconds, with three source/precoverage passes
and two completed graphs; no Solve inventory or executable is issued. Sparse
edge storage does not explain the memory limit. The reviewed candidate-index
[v2 proposal](rumoca-preparation-proposals-v2-root-review.json) is now applied on
the compiler integration branch and has passed 68 focused native-assignment
tests. The [resumed qualification](rumoca-native-coverage-index-v2-resume-verification.json)
passes 2,895 broader tests (zero failures, one ignored), then 68 focused tests,
strict Clippy, formatting and the actual compiler link. Three Clippy issues were
fixed only in the index tests; the production index implementation is unchanged.
Both driver source bookends match their recorded inventories. The unchanged
full-size gate remains pending. Keep this change separate from array-copy and arithmetic fixes when
measuring its effect. No larger memory limit or replacement detector source is
the acceptance path.

The [early full-frame profile](rumoca-fast-native-early-preparation-profile.json)
has 797 samples and no loss, taken before the first native-preparation marker.
DAE projection expression validation, domain-context lookup and visited-set
insertion account for 41.68%, 10.59% and 10.08% of self samples respectively.
This is a different phase from the earlier overlap-checker sample and does not
attribute the later RSS limit. Investigate retained scalar AD/artifact
materialization before the final native validation if memory still limits the
indexed producer; preserve root, domain and guard obligations in any projection
optimization.

A further source audit identifies a distinct quadratic allocation:
`rumoca-eval-solve/src/sparsity.rs` uses a compact conservative Full pattern for
mixed Map/AffineStencil blocks, but `JacobianStructure::derived` immediately
calls `StructuralPattern::column_rows`. For Full, that method allocates every
row index separately in every column. On the sampled 64-bit producer, a
28,800×28,800 pattern would require 6,635,520,000 bytes for those indices alone.
That is a conditional size calculation, not a measured allocation or proof of
the RSS failure's cause. The actual mixed node kinds are recorded; the pattern
dimensions and retained lifetime at this boundary still need measurement.
Preserve the exact conservative pattern, coloring and consumers while making
derived column storage compact or demand-driven. Do not weaken the dependency
pattern or skip validation to admit the detector.

The [retained-allocation audit and private counters](rumoca-fast-retained-artifacts-audit.json)
now bind scalarization, scalar/compact AD, structural pattern construction and
the final validation boundary to exact compiler source preimages. An
[independent check](rumoca-fast-retained-artifacts-root-review.json) rehashes all
32 files and applies the seven-file patch exactly in memory. The counter patch
is opt-in, private and uncompiled; no allocation values have been captured from
it. Shallow capacity measurements must not be summed across checkpoints as if
all products were simultaneously live.

The separate [lazy column-cache proposal](rumoca-lazy-jacobian-column-cache-proposal.json)
uses `OnceLock` to defer the existing exact coordinate view until an actual
consumer requests it. It retains pattern truth, coloring, the public borrowed
slice API, cold-clone behavior and the old deep-copy behavior of warm clones.
The [root review](rumoca-lazy-jacobian-column-cache-root-review.json) independently
rehashes six archived files and checks both source changes against exact current
preimages. Five staged unit controls, compiler qualification and unchanged
full-frame memory comparison remain unrun. Legitimate consumers of a dense Full
view still allocate rows×columns. This patch and the diagnostic overlay both
touch `model.rs`; reconcile their changes deliberately before a copied experiment.

The [actual 12×17 dimension-edit execution](rumoca-fast-dimension-source-execution-verification.json)
passes Node and dedicated Chromium-worker numerical checks, fault recovery and
IndexedDB/page/worker reload. Its source changes only the two image dimensions;
the detector function is unchanged. The issued graph contains 103 scalar
programs and 18 Maps, with 53 operations and one pure call per interior score
program. This identifies the current small graph shape; it does not establish
the full 160×90 shape, full-frame admission, native uint8/float32 inputs or SLAM.

The [actual RGB input source controls](rumoca-rgb-source-preparation-verification.json)
now distinguish three further frontiers. The staged `Real(...)` conversion
syntax was invalid; the corrected Integer source uses standard assignment
coercion and issues checked IntegerToReal owners, but native export refuses its
retained dynamic assertion predicates. The exact full Integer and Real grayscale
functions both exceed the 120-second preparation guard before issuing Solve IR.
An eight-second Integer preparation profile has 785 samples and no loss, with
substantial constant-value cloning, destruction and allocation; its precise
caller remains under audit. These are preparation costs, not frame timings.

The [borrowed array-subscript proposal](rumoca-rgb-borrowed-subscript-root-review.json)
independently matches four compiler preimages and copied postimages. It retains
borrowed image arrays until selection and returns an owned selected value,
preserving index evaluation, slice ownership and unsubscripted reads. The
extracted 563-case component checks reduce recursive clone visits for a single
90×160×4 scalar read from 72,092 to one. Production crate tests, exact full RGB
source retries and any source-level performance claim remain pending; the
patch changes neither constant-binding eligibility nor array writes.

The small Real source emits, but strict execution finds 11 of 75 mean values
differing from source-ordered division by one ULP. Plain tensor/scalar division
currently lowers to multiplication by a computed reciprocal. The generic fix
must use the existing checked BroadcastBinary Divide, as elementwise division
already does, and preserve source arithmetic, exceptional values and faults.
The failing evidence is retained; no tolerance relaxation or raw-byte binding
is inferred from these controls.

The [separate direct-division and BroadcastBinary proposals](rumoca-tensor-division-root-review.json)
are frozen and independently rehashed. Exact in-memory patch application
matches their compiler preimages and postimages. The copied production backend
passes seven Wasmi groups, including both orientations, full 14,400-cell
synthetic tensors, exceptional values, fault atomicity and recovery; 18 old
Binary modules and fault inventories are byte-identical. The review binds 40
production source files and 178 copied CargoJSON dependency files. Actual
Modelica source-to-module, phase tests and compiler integration remain unrun;
the backend component proof is not a full-source acceptance substitute.

The previous broader qualification driver's handle became unavailable after
the environment change, and its last observed log contains no terminal record
or test summaries. With host process visibility restored, the root agent finds
no live old index-gate or `rumoca-native-target` Cargo process. Unrelated builds
use separate caches and remain untouched. The
[partial index record](rumoca-native-coverage-index-v2-partial-verification.json)
retains the focused 68-test pass and exact source bookends, without qualifying
the broader build or issuing a full-frame retry. The resumed drivers now finish
those broader, strict, formatting and link checks. The new source-bound producer
is frozen in Scratch; the private allocation-counter copy has matching source,
asset and fixture bookends and its build is running. No counter results,
full-frame improvement or browser compiler package promotion are claimed yet.

The [reviewed native executable consumer](rumoca-native-program-schema72-verification.json)
now additionally accepts schema72 provenance only for the unchanged
`native-direct-program-f64-v3` ABI. An actual compiler-issued source passes Node
and a Chromium worker, including strict metadata refusals, read-only inputs and
whole-memory ABI-fault atomicity. Existing schema70 FAST function artifacts,
their compiled source edit and IndexedDB reload still pass. This establishes
executable-loader compatibility, not Solve wire compatibility, a new production
compiler package, full-frame detector admission or complete SLAM.

The unchanged full 21-state current/reference transaction now has an actual
source-issued WASM module. Its persistent session passes Node and dedicated
Chromium-worker tests, including measured IMU batches, image-use epochs,
complete covariance retention, reloads and rollback/recovery. See the
[transaction](modelica-schmidt-reference-transaction-verification.json) and
[persistent browser-session](modelica-schmidt-session-browser-verification.json)
records. This is a filter integration prerequisite; the production frontend,
mapping and loop closure remain pending.

The [current persistent-session optimization](modelica-schmidt-session-optimization-verification.json)
reduces redundant state copying and validation around that unchanged module.
Five Node tests and dedicated Chromium workers retain covariance, persistence,
defensive snapshots and whole-memory rollback. A warmed same-process ABBA/BAAB
comparison measures 1.313590 ms before and 1.150710 ms after: 12.40% lower
session step time, with 116,788 bitwise-equal state/flag comparisons. All 32
archived artifacts and the current session source were independently hashed.
This gain concerns the isolated driver; it does not establish full SLAM
integration or sensor/rendering throughput.

The [new full-transaction perf and generated-code investigation](schmidt-transaction-profile-verification.json)
measures approximately 1.05 ms per prediction step on one CPU, including copying
the actual 388 returned state cells to the next input. In the selected warm
`cpu-clock:u` interval, nine covariance PSD helper owners account for 73.60% of
self samples. A Scratch-only Modelica branch refactor passed the independent
20-case expectations but left almost all measured cost. The next measured
backend experiment is [private scalar registers in WASM locals](rumoca-typed-scalar-local-performance-proposal.md),
preserving array memory, slot snapshots and every fault/transaction guard.
These component measurements exclude sensors and the visual frontend.

The [bounded scalar-local patch](rumoca-typed-scalar-local-review-verification.json)
is now frozen and independently applies to copied exact compiler preimages.
It keeps arrays, slots, ABI buffers, source/fault identities and original scratch
allocation intact while moving eligible private scalar temporaries into owner
locals. Tests and actual artifact/performance gates remain unrun; this is the
queued backend experiment for the profiled covariance hotspot.

A [subsequent matched comparison](schmidt-transaction-matched-branches-verification.json)
uses one process, the same actual388-cell state transport and six ABBA cycles.
Baseline/edit medians are1.055258/1.019665 ms; the median cycle ratio is1.033870
(3.276% lower candidate step time). All20 independent cases pass for both
modules. This is a modest component gain, with no cross-machine or whole-pipeline
claim, and the Scratch source remains unpromoted.

The original full 160×90 FAST source now receives a certified direct-assignment
schedule after the generic [Move-packed tuple fix](rumoca-move-packed-tuples-verification.json).
The [next unchanged-source attempt](rumoca-fast-native-frame-move-packed-verification.json)
reached native emission and refused canonical typed `Map` at owner 0, operation
95, the original `1:22` detector domain. Generic Map emission now passes
[scoped native/source gates](rumoca-typed-map-emission-verification.json):
1,901 tests and strict/fmt checks, without a source rewrite or schema change.
The [one unchanged full160×90 retry](rumoca-fast-native-frame-typed-map-verification.json)
passed assignment certification and captured the same exact1.8 GiB Solve wire,
then hit the8 GiB resource guard before issuing a native module. It establishes
no next opcode refusal and executes no fullframe numerical cases. The next
producer work preserves conditional loop templates and perpoint invocation
context before expanding calls; this remains distinct from scoped Map gates.

The [new frozen-producer parity corpus](inactive-call-template-parity-verification.json)
finds six inactive-template regressions in the conditional-template candidate.
All six prepare with the preceding typed-Map compiler; four candidate cases fail
for missing exact call-shape certificates. The other two expose newly analyzed
inactive `edge` and `der` expressions, requiring temporal/state eligibility as well.
One case retains the same callable
with a different reachable input shape, so callable reachability is insufficient.
The compiler correction must select each family template through the existing
exact call-profile and affine-slice shape authority before every dependent
planner/lowerer consumes it. The correction now passes
[2,574 affected tests, strict checks and formatting](rumoca-conditional-affine-template-verification.json).
An independent [replay of all six exact regression sources](conditional-template-parity-replay-verification.json)
also admits native schedules with the final frozen producer. These are preparation
checks; full FAST numerical execution and production SLAM remain pending.

The [unchanged full-frame attempt with that final producer](rumoca-fast-native-frame-selected-template-verification.json)
reaches native preparation but stops at the 8 GiB RSS guard after 252.379 seconds,
without a native artifact or numerical execution. Its 1,822,514,705-byte Solve
wire is byte-identical to the preceding typed-Map result, so this correction has
not compacted the original full detector. An eight-second `perf` capture contains
727 samples with none lost; ordered-tree routines account for approximately
78.29% of self samples. Some retained caller stacks identify `UniqueProgram::new`.
The source rebuilds producer indexes for distinct output prefixes. Removing that
repetition while preserving prefix ownership is the next preparation experiment;
these samples do not measure runtime SLAM or GPU throughput.

The [unchanged full-depth preparation profile](modelica-seeded-depth-map-profile-verification.json)
uses the immutable typed-Map producer and the original 14,400-cell seeded
source. It stops at 180.254 seconds with 101,768 KiB peak RSS, before producing
Solve or native artifacts. A valid partial `perf` capture has 816 samples,
zero lost: `pure_call` 15.20%, `set_register` 12.99%, and substantial BTree
allocation/union/destruction. This changes the next action from an unmeasured
reprobe to a generic dependency-materialization fix. Preserve eager validation
of every argument/register and snapshot any demanded whole-input summaries
before output writes; retain exact coordinate summaries and sequential RNG
prefixes. The report's incomplete DWARF stacks do not prove a complete causal
call chain. No runtime depth throughput or full-depth numerical result exists.

The [sequential dependency patch review](rumoca-dependency-followup-review-verification.json)
archives two follow-ups to the [pure-call optimization review](rumoca-pure-call-dependency-review-verification.json):
full14,400 coordinate-only validation controls and a private register-Y membership
capsule that preserves shared exact facts. All three patches apply in order to
copies of current compiler sources; compiler sources remain unchanged. Cargo,
numerical and unchanged-depth performance checks are still pending. This staging
result does not establish a preparation or runtime speedup.

The [original FAST function browser proof](modelica-fast-patch-verification.json)
passes276 raw-bit checks in Node and dedicated Chromium workers, with the
independent23 patches, a genuinely compiled Modelica score-floor edit, reset,
readonly inputs, invalid-buffer atomicity/recovery and IndexedDB reload.
The original function module is13,178 bytes with109 helper fault records.
This complementary function proof does not replace full160×90 compilation
or the57,600 fullframe independent scores. Browser-side compilation/editing
UI and production selection are not covered by this probe.

Separately, exact retained evidence shows 12,936 occurrence owners carrying
inline FAST function bodies. Only the first two bodies have been compared;
their exact bytes match. [The body-reuse request](rumoca-pure-call-body-reuse-request.md)
identifies construction, clone and wire duplication, while retaining distinct
call identity, provenance and fault context. It calls out the accepted
helper-per-owner contract and the narrow clarification required before sharing
implementation bodies. This is still a design request, not an implemented
memory reduction or permission to compare/hash consumer bodies.
The [native scaling diagnosis](rumoca-fast-native-scaling-request.md) also
locates the earlier Flat conditional-template refusal and materialized call
growth. It records exact two-owner static bounds and current consumer limits;
whole-table projections remain explicitly conditional.

### Current throughput priority

The feature-selection frontier has a [staged three-patch prerequisite](rumoca-guarded-conversion-review-verification.json):
reaching guard facts, exact lexical static endpoints and a privately proved
single-assignment local envelope. Independent root application to exact copies
passes; all20 controls and compiler gates remain unrun. The original selector
still needs nested raster/heap progress, counter bounds and ordinary While
ownership before a native artifact can be issued.

The [fresh native and browser profiler investigation](throughput-profile-2026-10-04.md)
separates GPU work, blocked readback, physics interpretation and generated
registration execution. Retained sensor batching gave a 3.90% end-to-end gain.
The subsequent matched packed-readback comparison gives an 11.90% gain,
reaching 0.4911× for the specified high-quality 90/20/90/10 Hz workload.
The 10× target remains unmet. A dedicated Chromium physics worker spends
83.2% of endpoint processing in `advance_to`. A checked wasm32 adapter has
independent parity evidence, but the production pin remains unchanged and
its initially admitted scalar kernels cover only about 0.425% of measured
advance time. A subsequent exact-assignment emitter now activates in the fresh
review browser compiler. All 28 static source sequences admit; three modules
are actually instantiated on the measured trajectory and their SHA256 values
match the native source-issued modules. Full-plant browser parity covers
349,162 values, reset, rollback and a mass source edit. An uninstrumented
same-build ABBA comparison measures **4.467→2.593 ms** per camera interval,
**1.723×** for isolated `advance_to`. This includes cold frames and excludes
GPU capture, JSON snapshots and the full pipeline; the preview pin stays
unchanged. See [actual browser evidence](rumoca-physics-exact-browser-verification.json).
The new resolved Chromium trace points to the canonical projection target-value
path: 91.66% of advance samples descend through singleton assignments and
66.49% through typed pure calls (overlapping inclusive groups). The dense solve
accounts for 0.34%. The checked compiler-issued target-value hook now passes
actual browser parity and execution coverage, preserving complete prefixes,
output selection and faults. It does not pass performance acceptance: an
uninstrumented interleaved comparison with the earlier exact-assignment compiler
measures **2.557→3.182 ms**, a **24.46% advance-time regression**. Its new profile
places 53.21% of advance samples in typed calls under the interpreted causal seed
sweep, 29.17% in singleton projection and 5.28% below generated kernels, with
overlapping inclusive groups. The next measured targets are that causal seed
execution coverage and the granularity of millions of small private calls.
See [the actual regression record](rumoca-physics-private-browser-verification.json).
Do not infer target registers or prematurely commit Y to use the assignment ABI.
The profiler now excludes V8 `js-to-wasm` entry trampolines from generated kernel
attribution; the saved trace, original misclassification and corrected report
remain visible. This is an execution-coverage frontier, not a plant/solver change.
Browser kernels execute directly through V8 WebAssembly; Wasmi
is a native test oracle. Full native physics also requires admitted linear-solve, tensor and pure-call
operations, rather than a change to the plant or solver. GPU readback packing
is now the selected default after exact-byte and hardware-clock gates. The latest full14400 compiled-registration
perf profile places 86.85% of self samples in its generated hot function and
reproduces 9.206 ms per call; scalar temporary storage is the next codegen
investigation. Component timings cannot be added to claim a pipeline split.

A post-emission diagnostic replaces 233 Real-result reinterpret/store pairs
with direct F64 stores and measures 9.340→8.927 ms (1.0462×), preserving complete
Y/status/P for 16 listed fixtures. The storage-only generic emitter follow-up is
implemented and passes all 63 typed-call Wasmi controls. Its fresh compiler-issued
full14400 module measures 9.531→8.667 ms (1.0996×) with bit-identical outputs over
six alternating blocks per module; actual Chromium numerical/ABI/metadata gates
also pass. This is an isolated registration gain on the compiler branch. The
preview pin is unchanged; broader quality gates and full SLAM remain pending.
See [the source-issued evidence](rumoca-real-stores-verification.json). Keep the
earlier post-emission diagnostic separate from this compiler-issued result.
The [depth preparation profile](seeded-depth-native-profile-verification.json)
binds the full14400 source's timeout to dependency projection and repeated hash /
fold traversal, with about 80.6M membership events in 30 seconds. Source preparation
remains a blocker independent of runtime throughput.

The subsequent current-Size-memo trace pins the depth frontier to structural
incidence output-scalar projection. Each scalar reopens the same14400-point fold;
by scalar1799 it has walked26 million source points. A narrowly checked
indexed-write projection fix is applied on the compiler branch, preserving
actual carried RNG dependencies. The final combined projection suite passes
98 controls. It cannot be called an admitted depth kernel until the unchanged
full source and independent stream fixtures execute.
The unchanged full source now accepts that certificate and traverses both output
arrays. The next observed hotspot is Solve lowering: 61.62% self samples in
variable-slot lookup and 19.03% in coordinate packing. Full native issuance
still exceeds the30second diagnostic bound. Preserve storage/error semantics
when eliminating repeated full-array range checks; this is a compile-time
frontier, distinct from GPU capture and runtime kernel throughput.

That checked range fix now passes seven differential controls, all 103
projection controls and scoped strict checks. The actual unchanged full-depth
source still times out at 60.095 seconds without an artifact. A late perf window
identifies IR-Solve dependency-set cloning, union and destruction as the next
hotspot. Stage shared immutable exact sets and identity/empty union paths;
preserve every DependencySource, per-element summaries, traversal and error
semantics. Do not substitute empty dependencies or smaller sensor dimensions.
The [range report](modelica-coordinate-range-verification.json) records source,
producer, checks and the limits of the optimized calltree.

The unchanged full350 matcher no longer refuses narrow Size/Floor/Real-Abs
guard eligibility. Its 30.091-second bounded attempt still produces no module:
retained effects saturate the existing 16 MiB memo budget. Inspect representation
and duplicate retention before changing the limit. The original depth-pixel
helper separately refused typed Log at source bytes1391..1412. The shared generic
typed math-import patch is applied, with the paired compiler gate passing 1,791
tests and scoped strict checks. The unchanged original pixel helper now issues
and passes 265 V8 numerical cases, including exact state/draw consumption and
zero-radial clipping. Full14400 source issuance and stream execution remain
pending. See [the original refusal and follow-up](modelica-typed-math-functions-verification.json).

The native-program host now retains already checked per-instance input/output
views. With the identical full14400 artifact, input copying and field lookup
measure **2.256→0.0265 ms** in the final six alternating blocks per consumer;
the earlier comparison remains recorded separately. Reset, retained
views, metadata isolation and field-refusal controls pass actual Chromium;
the app build passes. Four additional Chromium controls reject externally
detached memory during input/output lookup, reset and execution. This does not
improve the currently selected inertial
preview path or establish a GPU/kernel/pipeline gain. See
[host handoff evidence](native-field-handoff-verification.json).

## What the application needs

Students edit Modelica algorithms in the browser, compile to portable WASM, and
run the same algorithms on embedded hardware. Rust supplies the host and
appropriate compiler/runtime primitives. Production algorithms should not need
Python, a Python runtime, a cloud service, or handwritten JavaScript equivalents
of their Modelica equations. Cloud compilation may be optional; static browser
deployment must continue to work.

Current cutover: the executable Python implementation, Python dependencies,
Rust algorithm fallback and Docker paths have been removed. The browser build
contains Modelica presets only. Full SLAM integration is explicitly pending,
and the runnable inertial baseline is separately named. Host-side feature
ranking/NMS, simulation sensor noise and navigation/evaluation calculations
still need to migrate into Modelica; removing Python does not finish that work.
Three.js retains scene construction, rendering and GPU sensor capture; browser
UI, files, workers, transport and compiler plumbing remain host responsibilities.

The immediate vertical is quadrotor RGB-D/inertial SLAM. RGB and axial depth are
captured together at the selected **15/30/60/90 Hz in simulation time**, with a
separate airframe IMU, GPS and **5/10/20 Hz** 64-beam LiDAR. The Configuration
pane exposes each rate; explicit user settings survive graphics changes and
project reload. Physics stops at every sensor event until processing completes.
The Three.js viewer runs independently at **30 FPS in wall time**. The user's
latest request explicitly supersedes the earlier fixed-90-Hz requirement.
Comparisons must identify rates: lower-rate throughput is a different workload,
not evidence of a faster algorithm. Dropping due events or advancing physics
ahead of processing remains forbidden.

The eventual target is **10× realtime**: 900 complete sensor/physics/algorithm
steps per wall second, or **1.11 ms per complete step**. This is a target, not an
achieved result. Prioritize the measured critical path and retain estimator
quality, source editability, project persistence, and portable deployment.

## Current SLAM integration checkpoint

The website Configuration, camera controls, scene proportions, actor routes and
independent sensor clocks are verified. Work has returned to Modelica SLAM.

- `RGBDRelativePose.mo` now converts an accepted optical-frame registration into
  a map-frame body observation. It includes the inverse relative transform and
  camera lever arm, using a retained estimated reference pose. The actual browser
  compiler worker passed 26 independent cases, an edited Modelica body, stale
  artifact refusal and JSON source/artifact reload. This is a component proof;
  no ground-truth pose is an estimator input.
- The unchanged full-14,400-pair `RigidPointRegistration.mo` now has both a
  verified standalone typed-call kernel and a complete source-issued v3 model
  executable. The earlier 65.8-second `unsupported or effectful operations`
  refusal is preserved as history. The generic native owner/linker now checks
  input ranges, shares complete immutable-input call tuples, declares scratch
  and publishes Y only on success. Nine Chromium numerical cases, four raw ABI
  transaction faults and six corrupted-metadata cases pass. Twenty warmed
  complete-model calls average **8.995 ms**, excluding sensors, matching,
  transport and rendering. This does not establish the 10× pipeline target.
  Fresh browser compiler source production and broader upstream gates remain
  separate; keep the current preview pin unchanged.
- The full-350-feature matcher compiled, but both native and ordinary-session
  preparation reached the 180-second bound before numerical execution. A native
  perf run of the exact final source reproduced that bound: 30.52% of recovered
  self samples were in `ParameterFragments::begin` and 23.29% in hash-map
  insertion. Cross-result fragment reuse was implemented, but the unchanged
  workload still timed out at 180 seconds. Query-aware structural projection
  then passed 45 focused controls and reduced observed peak RSS from about
  3.8 GB to 1.9 GB; preparation still timed out at 180.426 seconds without an
  artifact. Its finalized trace now attributes 38.52% of self samples to hash
  insertion and 19.19% to expression projection. Continue fixing the measured
  preparation bottleneck while retaining nested argument/error semantics and
  cache isolation. No matcher numerical acceptance or execution speedup is
  established by these changes.
  This is preparation profiling, not a matcher execution benchmark. The raw
  RGB/depth descriptor source now declares separate optics and preserves raw
  RGBA layout; full-size compilation passed, while numerical execution remains
  pending. Equal image dimensions do not imply equal RGB/depth pixel bearings.
- The canonical fixed-20 MSL canary reached its 600-second build limit before
  any model phase ran. Tier 1 validation remains pending. Keep the preview's
  compiler pin unchanged until compiler and whole-pipeline acceptance pass.

See [relative-pose evidence](modelica-rgbd-relative-pose-verification.json),
[whole-model registration browser proof](rumoca-native-horn-whole-program-verification.json),
[MSL canary evidence](rumoca-native-msl-canary-verification.json), and
[current sensor-rate performance](multirate-sensor-performance-verification.json).
Persistent visual filtering, landmarks, pruning and verified loop closure are
still required before calling the application full SLAM.

## Measurements and limitations

### Upstream candidates and review boundaries

The compiler changes are general array, dependency-analysis and portable-execution
improvements. They do not recognize Harris, RGB-D, camera resolutions or SLAM
model names to decide correctness. Keep application algorithms in `slam_web`.

| Compiler issue | General change | Current review status |
| --- | --- | --- |
| Eager scalar expansion of large arrays/stencils | Lazy native templates and compact Map/AffineStencil execution (`75dec420a`, `c3d328377`) | Committed component proofs; full pipeline throughput is separate |
| Dependent reductions, bounded function domains and lost empty-array types | Scoped specialization and typed empty comprehensions (`9e6ed9a3d`, `e3be35ab6`, `8a2418c77`) | Committed; generic matrix/reduction regressions, not image-only rules |
| Repeated loop materialization and large invalidation inventories | Scoped materialization reuse and compact reverse dependencies (`37a875980`, `7831077cc`) | Committed; compile-time improvements |
| Deep expression comparisons for many event occurrences sharing a source span | Fingerprint buckets with exact collision checks and insertion order; signed-zero hash normalization preserves equality | Current uncommitted branch work; 196 core and 321 DAE construction tests pass; descriptor preparation still times out in incidence projection |
| Incomplete nested-fold dependency projection | Exact lexical domain identities and complete fold graphs (`b1ebcc2e6`) | Committed; preserve error and dependency semantics |
| Function-owned `div`/`mod`/`rem` lost scope with binder/literal-only operands, and wire replay excluded open loops | Derive scope from the checked body capability during insertion; reconstruct through the exact body or fold capability | Original source and six constructor/reload variants pass; separate native pure-call interface refusal remains |
| Native assignment certification excluded complete scalar output groups and binder-varying values independent of the target | Certify original terminal store groups, exact scalar target loads and direct constant-coefficient residuals without rewriting source | Unchanged full350 landmark projection passes 40 native and 41 Chromium cases; candidate projection only |
| Fragmented portable array execution | Checked tensor kernels, native assignment ownership and one fused executable (`2cab63634`, `940f5062e`, `7cf04ab37`, `943aa7d7b`) | Committed component/source/browser proofs; retain capability refusals |
| Whole typed array functions could not run in the complete native model | Typed-call owner/linking, immutable-input tuple reuse, explicit scratch/status ABI and atomic publication | Current uncommitted branch work; unchanged full14400 registration and composed filter execute numerically, fresh combined browser build and broader gates pending |
| Preparation dominated by fragment/visited-set bookkeeping | Exact fragment reuse, query-aware capture avoidance and compact exact visited membership | Current optimization work; focused query controls pass, full350 matcher still not admitted |

Upstream these as focused correctness or performance changes with minimal source
reproducers, independent numerical tests and explicit capability boundaries.
Do not describe successful template execution as full-source admission, or
preparation profiles as algorithm throughput. No upstream PR has been published.
The [event lookup verification](rumoca-event-occurrence-index-verification.json)
binds exact source, producer and compiler-source manifests. Its normally finalized
profiles distinguish the original deep-expression comparison bottleneck from the
later dependency-projection frontier. Both full-size descriptor preparation
attempts still timed out; no descriptor numerical admission or matched preparation
speedup is claimed. The [scalar-cell code-generation verification](modelica-scalar-cell-codegen-verification.json)
collects the separate actual runtime improvement and its correctness gates.

The [`div` ownership correction](rumoca-function-quotient-verification.json)
passes the unchanged source's canonical DAE serialization and checked reload.
The original49 native interface refusal was subsequently resolved by exact
typed Integer quotient operations. The [follow-up proof](rumoca-integer-quotient-verification.json)
includes actual source-issued WASM, edited source, worker execution, reset and
local reload. This does not admit the full350 matcher. Seven affected
compiler libraries plus typed-call execution tests pass 1,348 tests, with strict
all-target/all-feature Clippy. These checks do not replace the fixed MSL canary.
The [full350 landmark native proof](modelica-rgbd-landmark-projection-native-verification.json)
and [Chromium proof](modelica-rgbd-landmark-projection-browser-verification.json)
include general camera extrinsics, sparse invalid inputs, source edits and local
reload. They establish candidate projection, not persistent mapping or SLAM.
The descriptor/matcher preparation frontiers remain open. The generic PDE, neural ODE and control-model
paths should benefit from the same array/runtime infrastructure, but that broader
performance benefit has not been measured here.

Actual runtime profiling is separate from these preparation experiments. The
[full14400 registration profile](modelica-registration-runtime-profile-verification.json)
uses Node/V8 JIT symbols, a normally finalized `perf` trace (1,541 samples,
zero reported loss), emitted WAT and annotated native JIT instructions. Self
samples include 75.67% in the typed registration function, 10.32% in the WASM
memory-copy wrapper and 4.35% in libc memmove. The emitted module contains 255
eight-byte copy sites and 536 one-cell loops. Native `abs`/`sqrt` instructions
already exist; only `pow` is imported. Exact eight-byte bit-preserving copies
and straight-line one-cell emission now have focused Wasmi tests and actual
Chromium numerical/ABI verification. An uninstrumented alternating comparison
of the unchanged full14400 registration source measured 13.218 ms versus
9.277 ms: **1.425× faster execution**, with every output bit unchanged and input
bytes immutable. See the [matched comparison](modelica-scalar-cell-codegen-comparison-verification.json)
and [browser verification](modelica-scalar-cell-codegen-browser-verification.json).
This excludes compilation, sensor capture, matching, filtering and rendering;
it does not establish a full-pipeline speedup. Keep raw traces and generated
code in `$HOME/scratch/slam_web/profiles`; the durable record binds their hashes.

These are different experiments. Do not compare kernel-only times with whole
simulation times or claim all Modelica code is already faster than Python.

| Experiment | Measured result | Interpretation |
| --- | --- | --- |
| Matched full-resolution ordered Harris, 160×90, input/evaluation/output | Modelica WASM 2.350 ms; Python reference 4.543 ms | About 1.9× for this implementation and dataset; Modelica evaluation alone was 1.607 ms. |
| Optional separable Harris versus ordered Harris, alternating same recorded inputs | 1.306 ms versus 2.229 ms | Reuses horizontal sums; changes floating-point grouping. Must remain an explicit algorithm choice. |
| FAST, matched input/evaluation/output | Modelica 17.358 ms; Python 15.300 ms | Compilation alone is insufficient; generated loops and repeated work need attention. |
| Grid detector, matched input/evaluation/output | Modelica 0.169 ms; Python 0.545 ms | Most benefit comes from avoiding Python conversion overhead; Python arithmetic itself was faster. |
| Full pipeline: 1,800 steps / 20 simulated seconds, RTX 3090, high-detail city, cars/people on, LiDAR off | 48.496 s wall, 26.880 ms/step, **0.412× realtime** | Uses Modelica ordered Harris but still the full Python SLAM reference. This is not a Python-free result. |
| Mean full-pipeline stage times | Physics 1.411 ms; sensor 14.208 ms; detector 3.194 ms; SLAM 5.016 ms; map 0.383 ms | Stage means do not sum to the complete step: transport, scheduling, and other overhead also matter. |
| Independent viewer during that run | 30.50 FPS; 34.7 ms p95 interval | Viewer responsiveness and simulation throughput are separate metrics. |
| Browser CPU in that run | Approximately 1.92 active cores | CDP process deltas include profiling overhead. Record CPU alongside latency. |

The graphics backend in this measurement is hardware-reported NVIDIA WebGL2,
not WebGPU. Sensor rendering/readback is the largest current bottleneck.
Compiler improvements alone will not make this pipeline run at 10×.

The application already has compact staged raster adapters, but they consume
compiler-issued operation/layout evidence through application-specific export
code. The goal is to replace that adapter with a supported upstream API, not to
move vision mathematics into the host.

Reproduction tools:

- Python-comparison detector profilers have been retired. Detector parity is
  retained in Modelica/WASM tests with independent numerical oracles.
- [Physics snapshot profiler](../scripts/profile-physics-snapshot.mjs).
- [Whole-browser profiler](../scripts/profile-browser.mjs), including worker CPU
  profiles, per-stage timings, graphics identity, transport, and estimator diagnostics.
- Latest local whole-pipeline report: `/tmp/slam-profile-shared-fence/timings.json`,
  `summary` only for aggregate figures. This temporary report is evidence from
  this machine, not a checked-in benchmark dependency. Regenerate reports for
  subsequent changes rather than relying on its continued existence.

Current reviewed compiler evidence supersedes the earlier covariance timeout:
package `94cff417cec61c256b5ea307d5d2a7f8213437ac` passes the actual browser
675-entry covariance/transition/noise gate. Cold preparation is 45.8 s and calls
are 189–227 ms, so this is correctness evidence, not fast production execution.
The full Modelica pose correction gate also passes 29 observation cases,
including all 15 corrections, 225 Joseph/posterior entries, innovation gating,
exact rejection and recovery. Neither component proves integrated SLAM.
Flatten optimization is now integrated as `37a875980a8e7478129b93a6dec960cca193eb68`;
its 1.524× focused native preparation result has not yet been measured in WASM.

## Fixes already on the working branch

Do not reimplement these. Extend their existing owners and tests where needed.

| Work | Status and scope |
| --- | --- |
| Lazy native WGSL views, `75dec420a` | Avoids eager scalar code generation for compact families. Large reductions in **template preparation** time; not a whole-image source compilation or GPU throughput result. |
| Canonical compile metadata envelope, `b15673ab0` | Keeps build metadata outside canonical DAE JSON. Preserve original JSON bytes and exact source IDs; do not round-trip 64-bit IDs through JavaScript `Number`. |
| Compact CPU WASM Map/AffineStencil, `c3d328377` | Actual Wasmi bit-exact scalar-reference checks at 160×90 and 320×180; 418-byte module. IR-level execution proof, not complete Modelica Harris admission. |
| Checked direct tensor matrix kernels, `2cab63634` | Actual f64 matrix execution checks, including 15-state-sized products. Computed/aliased operands and tensor-register inputs remain unsupported. |
| Bytes-only portable WASM export, `4cc87b4e4` | Exports checked kernel bytes without instantiating them inside the compiler's shared memory. |
| Dependent static reductions and exact template planning, `9e6ed9a3d` | Native compile/balance controls pass for generic SPD6 and full nested ES15 covariance source. Browser numerical execution remains to be verified. Empty reductions with lost types remain separate. |
| Native causal assignment certification and portable binding, `940f5062e` | Committed with profile `native-direct-assignments-f64-v1`. Ten owner/binding regressions, all 356 Solve IR library tests, all 13 WASM execution tests, and scoped all-target/all-feature strict Clippy pass. Signed-zero certificate replay preserves exact constant bits. Fresh browser package and actual 16/14,400-pixel assignment/source-edit gates pass; combined upstream gates remain pending. |
| Canonical WASM `Sign`, `fa1cbe742` | Committed. Actual Wasmi execution checks ±0, subnormals, infinities and NaN against the canonical Modelica operation; emitted comparisons produce canonical zero rather than importing JavaScript `Math.sign`. |
| Typed empty comprehension preservation, `e3be35ab6` | Integrated onto `slam-cv-performance` from verified commit `e2c44a72d`. Flatten preserves the original empty comprehension's body/domain/source ownership so DAE can check its type and shape. 26 focused and 1,397 affected native tests pass, with three existing ignored doctests; strict scoped Clippy and formatter checks pass. Generic SPD6 first-row browser numerics pass. Combined canary/workspace gates remain pending. |

The new native profile issues a complete stateless direct Map/AffineStencil
assignment schedule from canonical Solve ownership. It preserves whole-domain
target/dependency checks and rederives certificates after wire decoding. It
explicitly refuses states, initialization/events, unsupported scalar families,
clamped accesses, and general tensor algebra. Its current producer still
enumerates domains during compilation. Compact execution does not establish
compact compilation.

Subsequent gate update: the full workspace-test attempt terminated with exit
101 and an empty log. Its cause is unconfirmed; this is neither a test pass nor
proof of a source failure. The signed-zero certificate and canonical WASM
`sign` fixes now pass actual execution/ownership regressions and are committed
as shown above. Combined workspace tests, measured canary and browser execution
still need to pass before changing the application's production compiler pin.

Upstream details:
[native assignment API and evidence](../../rumoca-slam-perf/docs/verification/native-cpu-assignments.md),
[static reduction fixes](../../rumoca-slam-perf/docs/verification/static-reduction-specialization.md),
[typed empty reduction proof](../../rumoca-slam-perf/docs/verification/typed-empty-reductions.md),
and [performance evidence](../../rumoca-slam-perf/docs/verification/slam-cv-performance.md).

## RUM-001 — Finish browser verification of the current fixes (P0)

**Deliverable:** a reproducibly built full-web compiler package from this branch,
then actual browser numerical tests using that package. Native compile success
does not substitute for browser execution. Preserve existing physics and LSP
exports when adding the new binding.

The combined full-web package is now built from `e3be35ab6e85`, with actual
WASM SHA-256 `d806adb09863af445d49115663bc71499ef5ef6b2982f715db53c9efe5b54cbd`.
The final Cargo vendor-only pin was revalidated unchanged. Package-level
execution verifies the native `Sign` edge cases and source/module digests.
The artifact and its `build-proof.json` are local review output at
`/tmp/rumoca-slam-native-full-web`; this does not change the production pin.
Combined required upstream gates are running on the frozen tree. Final
whole-workspace formatter and all-target/all-feature strict Clippy pass;
workspace tests and later required gates remain pending.

Use the opt-in [browser assignment gate](../tests/browser/rumoca-native-assignments.spec.ts)
with `RUMOCA_BRANCH_PKG` pointing to the full-web wasm-pack output. It checks
actual portable module execution, fresh inputs, exact source/module hashes,
changed Modelica output, and capability refusals. It is not evidence of complete
vision or filter admission. The default test run skips this gate unless that
compiler package is supplied.

The separate [browser filter gate](../tests/browser/rumoca-filter-kernels.spec.ts)
uses that same package and the frozen sources from `RUMOCA_BRANCH_SOURCE`
(default: the sibling `rumoca-slam-perf` checkout). It exercises generic SPD6
including its first-row empty reduction, all sixteen right-hand sides,
conditioning, invalid inputs and recovery, then the unchanged generic full
15-state covariance source against independent continuous-Lyapunov solutions.
The actual browser SPD6 gate passes on the combined package: cold preparation
669.9 ms; after the first call, complete input/advance/output handling took
1.1–1.3 ms across the remaining seven cases. The ill-conditioned fixture has
condition estimate 2.952×10⁸ and passes condition-scaled forward error and
strict backward residual checks. Its exact source SHA-256 is
`62d75a1791b39cf812ffa14601ef31954ea2f2b0bd74a06e362c9c1ea9297adb`.
Native assignment browser gates also pass at 16 and 14,400 pixels (the full
160×90 sensor raster). Initial and source-edited results match every grayscale
and score value bit-for-bit across eight fresh inputs; source/module hashes
verify, unsupported state/scalar profiles refuse. The full-size source's cold
preparation is 6.840 s; its two portable modules total 602 bytes and memory is
1,310,720 bytes. This simple RGB-mean/nonlinear-score source establishes
whole-raster assignment admission, not full Harris, GPU vision or an ES15
execution backend.

The full unchanged generic ES15 covariance browser gate **times out after
240 seconds during session preparation**, before any numerical assertions.
The renderer reaches approximately 1.29 GB RSS and occupies one CPU core.
The suite is terminal: three tests pass, that covariance test fails, and its
renderer is closed. Exact phase profiling is the next required fix; do not
raise the timeout or replace the full model to treat this as success. The
durable local log is `/tmp/slam-rumoca-branch-browser.log`. Run both opt-in gates with:

```sh
RUMOCA_BRANCH_PKG=/tmp/rumoca-slam-native-full-web \
  nix develop path:.#ci -c npx playwright test \
  tests/browser/rumoca-native-assignments.spec.ts \
  tests/browser/rumoca-filter-kernels.spec.ts
```

The new lowering may retain native `Map` families where older output exposed
`ScalarPrograms`. Application exporters must consume the supported family API
or explicitly reject it; a schema check alone cannot establish that every node
is scalar. Recheck all existing custom exporters before changing the app pin.

Use [SPD6Solve](../models/SPD6Solve.mo), the frozen generic six-row Cholesky
source in the upstream static-reduction regression, and the complete 15-state
covariance source. Run the covariance acceptance probe described in
[its README](../tests/compiler-probes/README.md). It is currently unverified:
the application's pinned compiler panics on generic reductions; expanded fixed
contractions did not finish preparation in a bounded 196-second run and reached
approximately 1.36 GB RSS. No covariance numerical assertions ran there.

Acceptance:

- Browser executes the unchanged generic source, not merely a smaller matrix or
  a substitute model. Compare SPD solutions using forward-error bounds scaled
  by conditioning and strict backward residuals.
- Full 15×15 covariance agrees with the independent continuous-Lyapunov cases,
  including process-noise cross terms, symmetry, and positive quadratic forms.
- Source edits produce changed numerical outputs and hashes; repeated calls
  consume fresh inputs. Invalid SPD inputs refuse safely and recover on the
  next valid call.
- Record cold phase times, peak memory, module size, dispatch/copy times, and
  actual compiler revision. Replace the app's pinned artifact only after the
  browser evidence passes.

## RUM-002 — Typed empty reductions and static comprehension domains (P0)

**Implementation status:** fixed and integrated in `e3be35ab6`; affected native
tests and strict checks pass. The unchanged strict validator still rejects
untyped literal empties and malformed bodies. Numerical browser acceptance of
the frozen generic SPD6 fixture now passes; integrated upstream gates are pending.

**Problem:** generic Cholesky naturally evaluates
`sum(L[i,k] * L[i,k] for k in 1:i-1)` at `i = 1`. An empty iteration domain
must retain enough element-type information to produce the correct identity.
The dependent-domain fix above deliberately did not fix type loss for empties.

**Requested fix:** preserve the scalar element type through static
specialization and reduction lowering. Follow MLS semantics for each reduction
operator and element type; do not apply an untyped zero to all cases. Keep
runtime-dependent unsupported domains as clear diagnostics, not panics.

Acceptance: compile and execute the same six-row Cholesky with its first-row
empty sum; test Real and Integer sums, relevant product identities, nested
empty domains, lexical shadowing, initial/continuous templates, and a genuinely
unsupported runtime extent. Verify source ownership and diagnostics as well as
numeric results. Fix this in the phase that loses the type, not the browser host.

## RUM-003 — Complete causal array programs with reusable storage (P0)

**Problem:** standalone compact expression kernels exist, but the native
assignment profile cannot yet execute complete vision/filter programs with
scalar boundaries, reductions, computed matrix operands, or bounded function
calls. Application-side raster exporters are a temporary bridge.

**Measured preparation bottleneck on `e3be35ab6e85`:** the unchanged full
generic ES15 source compiles to a balanced 3,015-equation/unknown DAE in
1.165 s with 205,156 KiB (about 200 MiB) peak RSS. Its exact source SHA-256 is
`982cf8f1b69def3ef606f94539a2ce277731cbbd6e3d6da5dd2536ea7ffa8f77`.
Lowering to FMI/Solve times out at 60 s with 1,304,276 KiB (about 1.24 GiB) peak RSS,
before runtime vectors, solver initialization or native kernel compilation.
A bounded 15-second inspector CPU profile of the actual package attributes
79.17% of inclusive samples to continuous refresh construction / 79.01% to
`PreparedScalarProgramBlock::new`. Target-assignment shape derivation accounts
for 40.62%; eager `PreparedTensorAffine` construction for 38.26%, including
36.00% in repeated register-flow derivation beneath materialized isolated
programs. These are nested inclusive percentages and must not be added.
The local profile is `/tmp/rumoca-es15-native.cpuprofile`, with summary at
`/tmp/rumoca-es15-native-profile-summary.log`.

Signed-off staging commit `c4968a8275aefa85cf142ee34cdde1bc0513e956` targets
this measured preparation path: avoid
eagerly preparing every candidate during projection-tearing normalization
when none is needed; query the actual source/program/output/target and cache
owner-issued shape evidence. Restrict candidate analysis only with a complete
SSA dependency proof, including register versions, conditional/fold/dynamic
loads and exact signed-zero constants. Preserve the old exhaustive analysis
as a small-case oracle. The isolated implementation now passes 361 IR tests,
215 evaluator tests, strict scoped all-target/all-feature Clippy, and five
additional exhaustive-candidate oracles after the final helper extraction.
It also fixes a repeated-store prefix bug that could execute a later external
table load while evaluating an earlier output. Cache identity includes the
exact source prefix. Integration onto `slam-cv-performance`, a fresh full-web
WASM build, and the unchanged full ES15 browser numerical gate remain pending;
native test success does not establish the complete browser filter.

The exact `withInteractiveOptions` browser-session call is also sampled from
the same WASM package under a bounded Node inspector worker: in its first
15.08 s, source compilation takes 1.218 s (8.08% of samples), structural
preparation 0.167 s (1.11%), and refresh construction 11.985 s (79.48%).
Exhaustive shapes account for 44.28%; eager TensorAffine materialization for
34.97%, including 33.05% in register-flow construction. This independently
confirms the same bottleneck on the actual session entry point. A separate
25-second watchdog terminates that probe before numerical execution.

**Requested fix:** extend the existing phase-owned causal schedule and checked
storage plan. Admit mixed scalar/tensor families incrementally. Assign bounded
scratch buffers to intermediate tensors; reuse them according to proven
lifetimes. Compile each producer once and schedule its consumers from canonical
dependencies. Support computed matrix operands through this storage contract,
including transpose/views with checked strides and alias handling.

Source fixtures:
[ordered Harris stages](../models/HarrisRasterStages.mo),
[FAST stages](../models/FastRasterStages.mo),
[Grid](../models/GridRaster.mo),
[ES15 F/G](../models/ES15Dynamics.mo),
[covariance prediction](../models/ES15CovariancePrediction.mo), and
[SPD6](../models/SPD6Solve.mo).
[Nominal prediction](../models/ES15NominalPrediction.mo) is an additional
fixture. Its [actual-WASM component test](../tests/modelica-nominal-prediction.test.ts)
passes quaternion-reference motion, bias correction, tilted gravity,
small-angle, rejected-step, and recovery cases. It is not a production node or
proof of the complete filter.

[Attitude reset](../models/ES15AttitudeReset.mo) is another actual-WASM-verified
component: [its numerical test](../tests/modelica-attitude-reset.test.ts)
differentiates quaternion composition independently and checks all 225 covariance
entries, cross terms, symmetry, positive quadratic forms, and unchanged
position/velocity/bias blocks. The complete filter still needs integration.

Acceptance: direct upstream preparation/export of these sources, with no
host-side equation isolation, scheduling heuristics, or rewritten mathematics.
Check all pixels/matrix entries against independent references, changed source,
changed inputs, wire round trips, negative bounds/alias/dependency cases, and
source replacement invalidation. Keep unsupported nonlinear coupled systems
as explicit refusals until a valid solver profile supports them.

## RUM-004 — Make full-image compilation scale (P0)

**Problem:** compact kernels are small, but source compilation can still
materialize scalar relations or enumerate every image point while proving
families. [Full-resolution Harris](../models/HarrisFullResolution.mo) reproduces
a capacity-overflow/unreachable failure in the pinned compiler. Expanding
matrix contractions also creates unacceptable cold preparation time/memory.

**Measured whole-frame source, 2026-10-03:**
[HarrisNativeFrame.mo](../models/HarrisNativeFrame.mo) expresses all ten ordered
array families, including the complete 160×90 grayscale/gradient raster and
82×152 interior responses. The actual review WASM package at `e3be35ab6e85`
compiled this source into a balanced DAE with 133,776 equations and unknowns in
41,650 ms (944,537,600-byte process RSS; 750,256,128-byte WASM memory). Native
assignment preparation did not finish within a separate 90-second watchdog.
Admission, numerical parity and whole-detector execution remain unverified.

The first 15 seconds of the actual source-compilation CPU profile attribute
76.8% of the inclusive sampled time to Flatten's `expand_for_equation` /
`collect_for_iterations`; expression qualification and lowering occur beneath
that expansion. These nested percentages must not be added. This is a distinct
source-production bottleneck from RUM-003's assignment preparation. Preserve
typed empty reductions and binder/occurrence semantics when sharing invariant
loop work. The reproducible entry points are
[the source generator](../scripts/generate-native-harris.mjs),
[the native probe](./probe-native-harris.mjs), and
[the phase/profile probe](./rumoca-phase-probe.mjs). Local raw reports are
`/tmp/slam-native-harris-compile.log` and
`/tmp/slam-native-harris-compile.cpuprofile`; source SHA-256 is
`18e456247e415add38f7ffdb509d5bf22e0b818ee27bacc24372244867dcf46a`.

**Requested fix:** profile source parsing through Flatten, ToDae, structural
analysis, Solve construction, and export separately. Keep range-preserving
families and proof artifacts compact wherever their source structure permits
it. Replace repeated enumeration/scalar materialization with reusable domain
evidence in the owning phase. Preserve exact address, occurrence, and dependency
validation; removing checks is not an optimization.

Acceptance: actual Modelica-source benchmarks at 160×90, 320×180, and 640×480,
plus full 15-state covariance. Report cold/warm time, peak RSS, equation/family
counts, allocations, and module bytes. Show expected growth from image storage
without per-pixel generated code or redundant metadata. An initial requested
budget is <1 s and <256 MiB for cold 160×90 preparation on a documented machine;
it is an engineering target, not current performance. Unsupported source must
diagnose its phase and span instead of crashing or exhausting memory.

The complete depth-noise frame now provides another concrete reproduction:
[SensorDepthFrame.mo](../models/SensorDepthFrame.mo) retains 14,400 pixels and
28,800 outputs, with two independent equation loops. Reviewed94 prepares it in
57.7 seconds at 3.6 GiB peak RSS, although the resulting certified native
modules total only 1,056 bytes and execute in 0.60 ms on average. An edited
dropout threshold has the same preparation cost (59.7 seconds). The
[actual full-frame gate](../tests/compiler-probes/modelica-depth-frame.test.ts)
checks every output over 90 frames, source edits, defaults and persistence;
[the proof](modelica-depth-frame-verification.json) separates preparation from
execution and records the unchanged production pin. Optimize the owning
preparation phases while preserving these complete dimensions and equations.

## RUM-005 — Stateless Modelica GPU array pipeline (P1, major throughput work)

**Problem:** `prepare_gpu_simulation` targets explicit ODE simulation; it does
not establish a general stateless vision backend. Whole-image GPU execution
could reduce image transfers, but the application currently renders sensors
through WebGL2. A WebGPU compiler alone does not eliminate that readback.

**Requested fix:** expose a separate stateless array-compute profile consuming
the same authoritative causal tensor schedule. Specify input/output shape,
stride, scalar type, resource ownership, dispatch dependencies, buffer reuse,
completion, and device-loss behavior. Allow a host-supplied WebGPU device and
resident resources, with a portable CPU-WASM fallback. Begin with gray,
gradients, score images, and compact feature extraction; return small feature
and depth-correspondence buffers rather than complete images where possible.

Application integration must separately validate sensor texture transfer or a
sensor WebGPU rendering path. Do not claim zero-copy WebGL/WebGPU interoperability
without a working measured implementation. Do not reinterpret residual kernels
as assignment values or call an ODE backend a general image backend.

Precision must be explicit: WGSL's concrete floating types are f32 and f16, and
its evaluation rules differ from strict CPU f64. A GPU path needs numerical and
algorithm-quality tolerances rather than a bit-exact-f64 promise.
[WGSL types and floating-point evaluation](https://www.w3.org/TR/WGSL/#floating-point-types).

Acceptance: actual browser GPU dispatch with device identification, input
transfer, compute, output transfer, GPU timing when supported, wall latency,
and CPU consumption measured independently. Compare feature sets/order,
tracking failures, trajectory error, covariance, matching, and verified loops
against the strict CPU baseline. Keep precision selection visible in artifacts
and saved projects. CPU fallback must pass the same behavioral contract.

## RUM-006 — Optimize generated loops without silent algorithm changes (P1)

**Requested fix:** profile invariant loads, index arithmetic, repeated stencil
reads, checked access lowering, branch selection, and intermediate reuse. Use
legal CSE/loop-invariant motion and suitable SIMD/layout improvements. Optimize
FAST's bounded 16-sample circle work and preserve threshold, tie, and NMS rules.
Measure Cranelift/native and portable WASM targets separately; a native JIT
result is not evidence of the browser's performance.

Preserve ordered-f64 semantics by default. Separable Harris is faster, but
[the rank-boundary fixture](../tests/fixtures/harris-separable-rounding.json)
demonstrates a real feature ordering change: at `(44,27)`, regrouping changes
the rounded rank from 294710690 to 294710689. The compiled Node and Wasmtime
regression in [the separable tests](../tests/modelica-separable-raster.test.ts)
proves the difference. Algebraic reassociation/fusion must be an explicit
precision/optimization contract, not an invisible compiler transformation.

Acceptance: strict baseline stays bit-exact on random, flat, edge, weak/tied,
recorded city, and adversarial rank cases, including signed zero where required.
Any relaxed mode reports its error bounds and passes downstream trajectory/
tracking checks. Profile complete input/evaluation/output against the existing
implementation, not just an arithmetic microbenchmark.

## RUM-007 — Typed, persistent runtime ABI and exact stepping (P1)

Application progress: the physics worker now uses one existing `state_json()`
observation instead of 16 `get()` calls and one clock read. Actual WASM tests
retain all 17 values and timestamps across changed commands, model mass edits,
reset, and interface rejection. The matched observation-only profiler measured
0.368 ms before versus 0.059 ms after; integration and transport are excluded.
See [the profiler](../scripts/profile-physics-snapshot.mjs) and
[measurement limits](../docs/performance.md#batched-physics-observations).
This does not implement the typed low-allocation upstream ABI requested below.

**Requested fix:** expose batched typed input/output memory layouts, reusable
instances and buffers, and low-allocation calls for compiled physics, controller,
vision, and filter nodes. Avoid per-element JS/WASM calls and per-step JSON
conversion. Preserve source/compiler/module hashes, checked capacities,
parameter defaults, ABI version, and memory-sharing requirements.

Provide reset/checkpoint/restore and explicit step-completion semantics. Rumoca
remains responsible for the Modelica simulation clock and physics. Hosts must
not advance the next 1/90-second step while current camera/algorithm work is
pending. Worker/GPU completion participates in the barrier. Record actual copy,
dispatch, queue, and serialization overhead before redesigning the transport.

Acceptance: repeatable exact timestamps and replay, source-edit invalidation,
checkpoint recovery, blocked-processing tests, no skipped frames, no growing
steady-state allocation, and the independent 30-FPS viewer. Verify bytes-only
exports work from a shared-memory compiler build with the portable unshared
runtime ABI. Test the same artifact in a browser and a native WASM host; do not
require a Python host on embedded Linux.

## RUM-008 — Efficient small-matrix and bounded algorithm lowering (P1)

**New migration sources, 2026-10-03:**
[RGBDFeatureObservation.mo](../models/RGBDFeatureObservation.mo) passes sixteen
actual review-WASM fixtures for calibrated bearings, inverse-depth interpolation,
depth gates, camera extrinsics and descriptors. Its pure algebraic decisions use
`noEvent`; ordinary input-producing comparisons separately exposed a host
input-event lifecycle bug that is being fixed upstream.
[ES15Reanchor.mo](../models/ES15Reanchor.mo) passes an actual pinned-WASM oracle
covering all 225 covariance entries, world velocity/gravity transport and the
unchanged local attitude/bias basis.

[ES15PoseCorrection.mo](../models/ES15PoseCorrection.mo) expresses the complete
15-state correction with Modelica SPD solve composition, Joseph covariance,
injection/reset and rejection. It compiles on the review package in 698 ms, but
its full numerical session gate reaches the 90-second watchdog before assertions.
Direct nested-component composition also reveals a child-input causality/balance
limitation; the explicit same-frame Modelica component composition avoids that
limitation without introducing a host numerical solve.

[SymmetricEigen6.mo](../models/SymmetricEigen6.mo) supplies a bounded cyclic
Jacobi algorithm and a known-spectrum, reconstruction, orthogonality and planar
nullspace oracle in
[modelica-eigen6.test.ts](../tests/compiler-probes/modelica-eigen6.test.ts).
Guarded/dependent function loop domains initially receive an explicit function
conditional refusal. Equivalent fixed domains with scalar selection get further,
and compilation succeeds in 509.5 ms with 208,384,000-byte process RSS and a
370,231-byte DAE. The full review-WASM session gate still reaches its separate
90-second watchdog before assertions. This is unverified source, not an admitted
production solver. A separate 22-second exact-session watchdog with a 15.07-second
CPU sample isolates another preparation owner: 71.83% inclusive time in
`rumoca_eval_dae::projection::Projection` expression/function-fold dependency
traversal; 64.94% in `visit_expression_once`, and 51.46% in allocation beneath
`expression_domain_context`. JavaScript garbage collection takes 24.39%.
Recursive function names are counted once per CPU sample; nested inclusive
percentages overlap. This is distinct from RUM-003's Solve assignment preparation
and RUM-004's Flatten materialization. The raw profile and summary are
`/tmp/slam-modelica-eigen6-session.cpuprofile` and
`/tmp/slam-modelica-eigen6-session-summary.json`. Preserve expression occurrence,
domain binding, selected element and read-version identities when optimizing
this dependency proof; no numerical assertions have run yet.

**Requested fix:** execute Modelica-defined bounded functions/loops for the
remaining ESKF and geometry, with reusable dense matrix scratch and stable
numerical operations. All application algorithm equations and decisions must
be Modelica; Rust is the compiler/runtime host, not an alternative SLAM
implementation. Support one SPD factorization with 16 RHS rather than independently
factoring for each RHS. General reductions, small SVD/rank checks, and graph
linear systems will be needed for registration and loop optimization.

Preserve the current 15-state convention: world-additive position/velocity,
right-local attitude error, then accelerometer/gyro biases. Do not substitute
a different SE₂(3) state convention without transforming all Jacobians and
covariance. Preserve innovation gating, rejection without state mutation,
Joseph covariance update, attitude reset, gravity treatment, and graph
reanchoring. The F/G and SPD component proofs do not prove a full ESKF or SLAM.

Acceptance: independent motion finite differences and matrix references,
stationary/rotating/bias cases, invalid/ill-conditioned covariance recovery,
rejected innovations, frame changes, complete replay, and actual geometrically
verified loop closures. The user's immediate-removal instruction supersedes
the previous policy of retaining the executable reference: Python and the Rust
algorithm fallback have been removed. Preserve historical measurements and
full-fidelity acceptance fixtures without executing the retired runtimes.
Full Modelica SLAM remains explicitly unavailable until integration passes;
the separately labeled inertial baseline is not a SLAM replacement. Zero
verified city loops in the historical profile is not loop success.

## RUM-009 — Fast editing, diagnostics, and reproducible artifacts (P2)

**Requested fix:** incremental compilation and bounded source-hash caches for
algorithm edits, with invalidation by compiler revision, ABI, precision, and
parameter-layout changes. Report phase diagnostics to the existing Rumoca LSP
with source spans. Avoid recompiling unchanged modules when applying a project
or switching views. Keep saves self-contained enough to reopen offline with
their Modelica source and rebuild the artifact.

Acceptance: editing Harris coefficients/FAST threshold changes actual results;
save/download/reload preserves source and precision choices. A stale or damaged
artifact is rejected and rebuilt. Record first-load, edit-to-ready, cached-load,
and peak-memory timings. Build browser/native artifacts through `flake.nix`
using pinned dependencies, with no developer-specific absolute paths.

## RUM-010 — Full bounded Modelica feature selection (P0)

The strict Modelica cutover requires selection decisions, not just corner
scores, to execute from Modelica. [FeatureSelection.mo](../models/FeatureSelection.mo)
retains the full 14,400-pixel score raster and output capacity, exact ties-to-even
ranking, deterministic rank/raster order, raw-score early stop, whole-image
maximum/domain validation, spacing/border/cap and occupancy suppression. The
independent direct-sort/geometric-suppression oracle covers ranking ties,
outside-border maxima, signed zero, caps and grid behavior.

The unchanged full source on reviewed package `94cff417c` refuses before
numeric preparation in approximately 330 ms, with 182,244 KiB peak RSS. The
ToDae owner reports `function loop domain`: candidate-count-dependent heap and
occupancy loops require a compact dependent-domain transition, and scalar
statement expansion is prohibited. This is not a numerical pass or merely a
slow execution problem. FunctionFold/PureCall and dynamic index/storage ownership
also remain outside the current stateless native assignment artifact.

Implement bounded runtime function/loop ownership with explicit scratch and
lifetime plans, preserving selected addresses, lexical domains, source
occurrences, original statement order and failure reporting. Do not replace
the Modelica algorithm with TypeScript sorting, generated handwritten WAT, an
alternate Rust implementation, a smaller raster or a reduced output capacity.
Mixed Direct/Zero scalar-plus-array native stages are useful first steps but
do not resolve this function-domain blocker.

The current owner audit distinguishes three obligations. The conditional
`candidateCount := candidateCount + 1` recurrence in the original nested raster
While loops has no checked induction envelope; the existing invalidation is
correct and must stay for unproved recurrences. Ordinary bounded While has no
function-statement owner, and runtime conditional branches reject ordered For
transitions. A fixed-For count bound alone would repair the minimal count
reproducer without admitting the original heap selector. Implement checked
program-point induction, bounded While progress/header ownership and lazy
ordered branch joins in stages. Preserve complete array state and source fault
order. The [owner proposal](artifacts/feature-selection-owner-proposal/proposal.md)
retains the executed full14400 reproducer, two explicitly unexecuted isolators,
owner source inventory and planned differential controls; it is design evidence,
not compiler admission.

Acceptance requires the unchanged full source in actual WASM, changed image
inputs, threshold/source edits, tied and rounding-boundary scores, invalid
rank domains, raw-score early stopping, borders/spacing/occupancy, full cap,
grid mode and project save/reload. Small fixtures and compilation-only probes
must remain separately labeled; no host fallback is permitted.

## RUM-011 — Compile the connected pipeline into one executable (P0)

The new unchanged [composed filter fixture](../models/ES15FilterStep.mo)
connects nominal prediction, F/G, full 15-state covariance propagation, both
Cholesky solves and pose correction in Modelica. The review compiler
`943aa7d7b745` executes nine numerical cases through one interpreted session,
including all 225 covariance entries against independent continuous Lyapunov
and Gaussian-elimination/Joseph references. It takes 146.8 s to prepare in the
recorded shared-machine run. Per-case verification is 394–519 ms, including
oracle/assertion work, so it is not a native kernel benchmark.

The same literal source passed to `prepare_native_program` is refused after
32.48 s with `native scalar program requires one terminal scalar output`.
Combined source SHA-256 is
`99ce45b42482b79211913840a57b63b91471ab3ef00d27fb85d289e153886d48`.
Extend only the compiler-owned checked schedule/storage profile justified by
the actual scalar producer and its effects; do not split this composition into
host-controlled solves or forge owner tables. Native admission must then pass
the same numerical cases, exact dependency/fault ordering, changed-source
invalidation and persistent-state tests. The fixture consumes a measured pose;
it does not provide the RGB-D frontend, map or loop closure.
See [the numerical gate](../tests/compiler-probes/modelica-filter-step.test.ts)
and [the source admission probe](probe-modelica-filter-step.mjs).
[The verification record](modelica-filter-step-verification.json) retains
component/compiler/source hashes, refusal and input/CLI failure history.
An actual native-branch producer now saves the canonical Solve wire directly
from the same unchanged composition. It identifies 72 compact programs ending
in `StoreOutputRange`, including fourteen 225-element matrix programs. The
first refusal is a four-operation tensor load/subtract/store of nine rotation
entries. This is an array-range admission gap, not a reason to expand each
matrix into separate scalar programs. Preserve the original compact ownership,
complete prefix, dependency ordering and fault behavior when extending the
constructor. [The structural diagnostic record](modelica-filter-schedule-verification.json)
binds the actual producer binary, source, canonical wire and refusal; it does
not establish native execution or an immutable compiler release.
The working native branch now admits complete terminal array ranges and emits
their arithmetic as compact WASM loops in bounded private memory. Constructor,
actual WASM, and Chromium main/worker fixtures pass. It also proves affine
target permutations, including the source's column-first 6×16 solve, without
reordering its evaluation. The repeated unchanged composition reaches a new
refusal at source node 167: six targets have stride 16 and contain gaps in their
bounding interval. Extend compact target ownership to represent these sets,
prove exact disjointness/coverage/dependency overlap, and preserve original
source prefixes. Do not declare the whole bounding interval owned, expand the
domain into scalar stages, or change the Modelica source to bypass this gap.
See [the current native gate record](rumoca-native-filter-array-verification.json).
The subsequent periodic-block target-owner extension clears both node 167's
strided columns and node 174's 15×6 rectangular slice. The unchanged complete
source now emits one 636,340-byte module with 1,212 compiler-issued stages.
Nine independent numerical cases pass in Node and a dedicated Chromium worker:
all 225 covariance entries, state/counters, observation rejection/recovery,
byte-immutable explicitly supplied inputs, and prepublication invalid-ABI traps.
After the compiler build finishes, 1,000 warmed worker calls average 0.2241 ms for
execution and 0.2273 ms including the filter's input/output copying. This excludes
camera/LiDAR/GPU transfers, registration, rendering and the rest of SLAM.
The native v2 exporter and actual rectangular-source edit/copy-ABI refusal pass
seven binding controls. The old separate-stage copy ABI explicitly refuses
sparse targets; it cannot claim their bounding gaps. Full-filter source-edit,
project persistence, reviewed package/pin integration, and the fixed 20-model
Tier1 canary are still required. See
[the complete native filter core record](rumoca-native-filter-core-verification.json).
The earlier refusal records remain historical evidence. No 10× pipeline
speed claim follows from the small array execution checks. Tier 1 canary and
source-edit/persistence gates also remain required before a compiler release.
To rerun the isolated numerical gate with a validated review package, set
`RUMOCA_BRANCH_PKG` and run `npx vitest run --config dev/vitest-filter-step.config.ts`
under the reproducible Nix environment and bounded runner.

The user requests compilation of the connected Modelica pipeline together.
Keep individual node sources editable, but compile their connected numerical
owners into a single portable WASM program with shared typed buffers and one
public step entry point. Three.js still supplies rendered RGB/depth arrays;
UI, project files and transport remain browser plumbing. This is a required
execution direction, not a claim about the current preview.

The current runtime separately compiles physics, vision, inertial propagation,
sensor availability, sensor observations, actor motion and evaluation. Multiple session
calls, JSON extraction and worker round trips add overhead. The current native
assignment artifact does preserve a compiler-issued ordered program and shared
memory, but emits one WASM module per stage and copies stage outputs into Y.
The fresh review package `943aa7d7b745` now also emits a single module through
`prepare_native_program`; its unchanged full 160×90 mixed-program WASM probe
passes with exact numerical, source-edit, persistence and refusal checks. See
[the verification record](modelica-fusion-eigen6-verification.json).
This remains a stateless component profile outside the active application.
Complete connected stateful composition, slow covariance execution and
unsupported function loops remain separate requirements.

Extend the compiler-issued executable plan to emit a single module and direct
stores into the declared output/state buffers, using the same canonical
Modelica operators, source occurrence identities and proven stage dependencies.
Do not build an application-specific mathematical implementation in JavaScript,
Rust or handwritten WAT. Preserve the numerical grouping/precision and failure
contracts; allow safe buffer reuse only with explicit read/write lifetimes.
Compilation must retain source mapping and independently editable node sources.
Stateful integration and bounded loops need the same source-owned treatment.

Preserve the sample boundary: physics integrates to the next 1/90-second
timestamp, cameras render from that committed pose, and sensor/vision/estimator
processing finishes before the next physics advance. Rendering creates an
external acquisition boundary; one compiled program may need a pause/resume
entry or separate advance/acquire/process entries. Do not turn held sensor
samples into continuous observations, reorder conditional random draws, or
feed evaluation-only truth into the estimator to force a single call.

Acceptance: compare fused and unfused execution on identical full-size inputs,
source edits and parameters; verify all output/state values, rejected-innovation
state preservation, replay/reset, source/artifact hashes and exact 90 Hz barrier.
Measure total step time and CPU/memory/worker/transport overhead on matched
scenes. Keep the viewer independent at 30 wall-clock FPS. Full SLAM still needs
registration, matches, pruning and verified loop closures; a fused INS pipeline
cannot satisfy that gate. Browser and Linux/NXP must consume the same program.

## RUM-012 — Compact reverse invalidation without dense adjacency copies (P0)

The complete depth-frame preparation profile identifies a concrete memory
candidate inside `rumoca-eval-solve/src/sparsity.rs`:
`derive_algebraic_reverse_invalidations` calls `StructuralPattern::column_rows`
before visiting projection blocks. A conservative full pattern for the two
compact 14,400-target families expands 28,800 × 28,800 wasm32 indices, or
3,317,760,000 bytes, even when the projection-block list is empty. These exact
source owners are unchanged between reviewed94 and main37a.

Actual reviewed-WASM profiling prepares the unchanged complete frame in
60.9 seconds, with aggregate peak RSS 3.66 GiB. Of 61.25 seconds sampled,
78.95% is attributed to V8 garbage collection; `column_rows` has 1.72 seconds
exclusive and 3.17 seconds inclusive. Detached GC stacks do not establish a
causal attribution to a Rust function. The source allocation is a precise
candidate to verify with before/after evidence, not a measured fix. Raw profile
and resource provenance are recorded in the
[depth-frame proof](modelica-depth-frame-verification.json).

Requested fix: derive reverse invalidation directly from certified compact
pattern membership and already committed projection rows, without copying
rows × columns adjacency. Preserve block order, every row/column bounds
refusal, Full/Empty/Diagonal/Affine semantics and source provenance. Do not
weaken the conservative pattern or skip validation to improve memory use.
Deriving more precise composite patterns is a separate authority change.

Acceptance: independent small dense-oracle comparisons for every pattern
variant, ordered repeated/overlapping blocks and malformed target refusals;
the unchanged 28,800-dimensional case with bounded linear working storage;
strict scoped upstream gates; and fresh actual-WASM complete depth-frame
numerical/source-edit checks with before/after cold preparation time and RSS.
The compact consumer fix passed seven focused checks, 222 eval-solve library
tests and scoped strict Clippy, and is integrated into the isolated performance
branch. Fresh full-web revision `943aa7d7b745` passes the unchanged full-frame
numerical and source-edit probe: 2,592,000 output comparisons, unchanged emitted
module digests, 31.11 seconds for both source preparations and the complete
probe, and 1,216,172 KiB peak owned RSS. See the
[new depth-frame record](modelica-depth-frame-compact-verification.json).
This combined gate does not isolate cold single-source preparation or the
causal contribution of each compiler fix. The production pin and runtime depth
path remain unchanged; broad upstream and runtime-integration gates remain.

## RUM-013 — Remove measured acquisition/dispatch overhead (P0)

The actual 1,800-frame browser run includes synchronized RGB-D, GPU-projected
64×1024 LiDAR, raw depth cloud, the genuine QuadrotorSIL plant and the available
Modelica inertial baseline. It takes 35.15 ms/frame (0.316× realtime), while the
independent viewer averages 29.98 FPS. Ten times realtime requires 1.111 ms/frame
at the fixed 90 Hz simulation sample rate. This is not full SLAM acceptance.
See [the durable run record](all-sensors-performance-verification.json).

CPU sampling attributes 21.55 seconds exclusive to sensor-worker `readPixels`,
8.24 seconds to main-thread `postMessage`, and 1.01 seconds to the remaining
host depth-noise path. These are sampled CPU-stack times including driver waits
and profiler overhead, not GPU elapsed-time measurements. The genuine plant
costs 4.44 ms/frame through the current interpreted simulation-session adapter;
vision costs 3.15 ms/frame. Both already exceed the complete 10× frame budget.

Integrate the verified full-frame depth program and source-issued native
function backend with a compiler-owned sampled graph/typed buffer ABI. Keep
large image/point arrays in reusable WASM storage or transfer ownership without
cloning them into nodes that do not consume them. A declared acquisition barrier
must separate advance/render/process while preserving exact 90 Hz lockstep and
random draw order. GPU acquisition cannot be made fast by silently skipping
frames, reducing beam count or substituting asynchronous stale observations.
Profile fence/readback strategies against the actual new depth-cloud workload;
the previously measured synchronous policy is not proof that it remains best.

The GPU/Modelica boundary should accept original `Uint8Array` RGB and
`Float32Array` image/point buffers with declared shape, stride, byte offset,
storage type and invalid-sample representation. Widening to Modelica Real,
depth-code decoding, row orientation and calibration belong to compiled
adapters or source models; avoid per-element JavaScript conversion. Bind views
into reusable WASM memory where WebGL permits, or transfer buffer ownership
once. Do not claim zero-copy GPU-to-WASM from ordinary WebGL readback: it still
copies through browser-managed GPU/host memory. Retain immutable inputs,
alignment/alias checks and one completed capture before clock advancement.

The current acquisition patch removes the LiDAR host decoding/compaction loop:
all 65,536 RGBA32F samples are transferred unchanged and rendered as an
interleaved attribute. GPU shaders supply FLU XYZ, exact radial codes and zero
invalid samples. Dense scan consumption in Modelica is still pending. Host
depth noise, depth-code decoding and feature rank/NMS remain explicit migration
work; the patch is not acceptance of a computation-free JS runtime.

The isolated `slam-native-functions` branch first passed 25 scoped executable
tests, including nine typed-call/ABI oracle fixtures, strict Clippy and formatter
checks. [The baseline record](rumoca-native-typed-call-verification.json) retains
that source and its explicit control-flow refusals. The subsequent extension
passes 36 scoped tests, with 11 new lazy-Conditional and compact one-binder,
scalar-carried Fold fixtures, including an ordered 14,400-cell captured-array
reduction. Strict Clippy and formatter checks pass. [The control-flow record](rumoca-native-typed-control-verification.json)
retains its own source, oracle, resource and failure history.

These are checked typed-IR execution fixtures. Actual full Modelica function
source admission is a separate gate underway; aggregate-carried/multi-binder
Fold, nested Call and complete-model scheduling remain unsupported. This is a
prerequisite, not a completed compiled SLAM graph. Preserve branch isolation
and production-pin compatibility until application, browser, replay and native
deployment gates pass.

The source-admission characterization found an upstream ordering defect:
algorithm accumulator compaction rewrites a seeded sequential Real sum into
`seed + sum(terms)`. For the unchanged 14,400-cell source fixture, the ordered
recurrence returns 14407.0 while the issued table returns 14406.25. This is a
semantic discrepancy, not acceptable optimization noise. The isolated branch
now retains source-ordered Real accumulator loops, including resolved aliases,
arrays and nested loops. Fresh full-source tables execute in Wasmi with exact
ordered results, signed zero, IEEE overflow and atomic late-failure recovery;
315 DAE library tests, 41 executor tests and strict scoped checks pass.
[The source-order record](rumoca-native-source-order-verification.json) retains
the proof and original discrepancy. Integer seeded reassociation also changes
checked overflow behavior; its isolated producer repair now passes exact native
and browser source tests, including signed 64-bit endpoints and atomic faults.
Keep the
original source and bit-exact oracle rather than rewriting the student
algorithm to fit a backend.

The same source-issued modules pass actual Chromium execution for all 14,400
inputs and complete outputs, including source-edited gain and subtraction,
ABI guard/input immutability, signed zero, cancellation, overflow, failure
atomicity and recovery. Module sizes are 1004/1005/1004 bytes. Complete input
copy, execution and output copy takes 0.071–0.125 ms per call in the final
1000-call sample (baseline 0.0804 ms in the prior run). This is a standalone
function component, not full detector/filter/graph or 10× acceptance. See
[the browser record](rumoca-source-typed-call-browser-verification.json) and
the opt-in [execution gate](../tests/browser/rumoca-source-typed-call.spec.ts).
The unchanged Integer source adds a 904-byte browser module with full 14,400-cell
BigInt64 input/output verification. Neither gate executes the wrapper model.
Assertion-predicate owners are explicitly refused by the native backend until
their severity, source failure and continuation semantics have a verified ABI;
executing a Boolean value alone does not enforce a Modelica assertion.

One checked finite-binder Fold now supports aggregate carried tuples using
separate private frames and whole-tuple transitions. The unchanged full14,400
source with a three-element accumulator, plus a gain edit, passes source-issued
native and actual Chromium checks for sequential field updates, exact outputs,
late source faults and atomic recovery. Modules are 1640/1641 bytes and browser
transfer/execute/output-copy means are 0.3332/0.3232 ms. An ordered dependency
inventory repair uses hash membership while retaining first-occurrence order
and full field identity; full-source lowering finishes in about 21 seconds
instead of timing out. Larger carried tensors can still copy their full value
each iteration; this is not a zero-copy or whole-SLAM performance claim.

The GPU acquisition path now shares a single readback batch across RGB, depth,
raw depth cloud and LiDAR, with all reads submitted before host copying. Seven
hardware browser checks pass exact output parity, shared timestamps and failed
render/copy recovery. A matched 360-frame High pair measures 40.40→37.38 ms/step,
about 1.45 active CPU cores and approximately 30 viewer FPS. A separate current
`perf` run measures 34.69 ms/step, with sensor `getBufferSubData` still the largest
active sampled JS/driver stack (3.90 seconds exclusive over the sample).
Neither timing is full SLAM or 10× acceptance. Preserve the measured bundle and
overlapping-wait limitations in [the shared readback record](shared-sensor-readback-verification.json).

Sensor rendering additionally shares one committed animation/transform update
across all views. Exact moving-actor parity, failure restoration, the independent
viewer and room/quality checks pass on hardware, with ten scoped unit checks.
The current High sample measures 0.379×; a separate `perf` sample measures 0.315×
and 1.53 active CPU cores, with `getBufferSubData` still the dominant active
sensor stack. Broad shared-machine variation prevents attributing the observed
whole-pipeline difference to this change. See
[the scene capture record](single-scene-capture-verification.json). Full compiled
graph execution and efficient typed sensor transfer remain substantial work.

## RUM-014 — Parallel execution of expensive independent Modelica regions (P1)

**Status: proposed; no parallel Solve executor has been implemented or enabled
in the application.** This extends RUM-011's single compiled graph and complements
RUM-005's GPU array backend. A single executable can contain a parallel schedule;
students should still edit ordinary Modelica arrays, equations and functions.

### Observed implementation and motivation

In the current `rumoca-native-functions` checkout, the Solve runtime owns mutable
scratch through `RefCell` and execution backends through `Rc`. Its prepared
evaluation and refresh paths do not dispatch independent graph work through a
thread pool. The WASM binding has an optional `wasm-rayon` feature and exports
`wasm_init(num_threads)`, but `full-web` does not enable that feature and this
application does not call the initializer. This is a pool initialization surface,
not evidence that a model's Solve graph is parallelized. Native bulk simulation
helpers parallelize independent simulation jobs. Sparse Newton calls faer's
global parallelism API, but the workspace dependency disables default features
and does not request faer's Rayon feature; those calls alone establish no
multicore numerical execution in this build.

The application uses separate browser workers for viewing, sensor rendering,
physics, vision, state estimation and other services. `src/runtime.ts` still
awaits graph nodes in sequence and makes several sequential worker calls at
each sensor event. The recorded High run uses approximately 1.91 active CPU
cores on average across the browser; this is process CPU accounting, not proof
of physical core affinity or parallel execution of one Modelica model. See
[the measured run](sensor-normal-preview-performance-verification.json).

The physics profile attributes 91.66% of sampled advance time to the canonical
singleton projection path, including overlapping typed-call work. First remove
that measured interpretation overhead and establish execution coverage. A
thread pool around the same repeated work is not a demonstrated fix. See
[the profile and parity evidence](rumoca-physics-exact-browser-verification.json).

### Requested compiler and runtime design

Relevant language boundaries are MLS 3.7 [chapter 8](https://specification.modelica.org/maint/3.7/equations.html)
(equations have no source execution order), [§11.1.2](https://specification.modelica.org/maint/3.7/statements-and-algorithm-sections.html#an-algorithm-in-a-model)
(preserve the conceptual sequential result of an algorithm), and
[§12.3](https://specification.modelica.org/maint/3.7/functions.html#pure-modelica-functions).
The latter explicitly states, "Pure Modelica functions are not assumed to be
thread-safe." Purity is therefore insufficient to admit concurrent calls.
Rumoca must prove its generated function storage is reentrant and give each
job an independent execution context. External callees, external objects,
caches and wrapped impure calls require a separate checked threading contract
or ordered execution. Standard Modelica does not prescribe a worker count,
core-affinity API or automatic parallel scheduler.

Existing compiler precedents include OpenModelica's development
[automatic parallelization](https://openmodelica.org/doc/OpenModelicaUsersGuide/latest/parmodauto.html):
`--parmodauto` emits an equation task graph, then the runtime clusters and
schedules it through oneTBB. Dassault documents Dymola 2024x
[parallel co-simulation FMUs](https://3dswym.3dexperience.3ds.com/post/catia-mbse-cyber-systems/speeding-up-co-simulation-using-parallelization_D1fmWI_MQ5SeX6kWpIRriA)
using `Advanced.Translation.ParallelizeCode`. These establish useful native
runtime precedents; neither source establishes a browser-WASM implementation
or the throughput of our vision workload.

1. Derive a checked execution plan from existing authoritative Solve ownership.
   Preserve compact tensor domains, source provenance, dependency ordering,
   selected outputs, control flow, effects and fault behavior. Cite governing
   SPEC_0007 and SPEC_0032 contracts and propose any new scheduling contract in
   Rumoca's specs before changing compiler semantics. A backend schedule is a
   derived projection, not a second owner of model equations.
2. Identify coarse independent pure regions and independent iterations of
   compact map/stencil domains. Suitable initial candidates are image tiles,
   per-feature descriptors and per-current-feature correspondence searches.
   Check read/write sets, aliasing of tensor views and scratch ownership.
   Disjoint writes alone are insufficient when another iteration reads them.
   Do not split an ordered carried fold or state transition merely because its
   source uses a `for` loop.
3. Emit compiled kernels before dispatching them. Give each job private scratch
   and checked output ownership, with shared immutable inputs where legal.
   Keep dependent regions behind explicit barriers. Preserve existing commit
   boundaries and canonical fault selection; concurrent completion order must
   not choose which fault is reported or publish partial state. Assertions,
   external effects and event actions remain ordered unless a separate checked
   contract establishes their legality.
4. Keep strict f64 reduction order by default. Independent pixels or descriptor
   rows can run concurrently while each row retains its original arithmetic.
   Reassociation of registration, covariance or pose-graph sums needs a separate
   explicit numerical policy and downstream quality evidence. Thread count
   must not silently change landmark ranking, feature tie order or filter results.
5. Provide a bounded, persistent CPU worker pool with configurable concurrency,
   workload thresholds, cancellation and source-edit invalidation. Fuse small
   regions and choose sequential execution when dispatch/synchronization costs
   exceed predicted savings. Budget threads across the application rather than
   creating a full pool in every Modelica worker. Browser scheduling cannot
   promise physical-core pinning.
6. For browser WASM, specify the shared-memory/atomic build, pool initialization,
   cross-origin isolation and deployment headers as an explicit capability.
   Workers must not share the current `Rc`/`RefCell` session unsafely. Use a
   checked immutable executable plan plus per-worker execution contexts.
   Non-threaded execution must remain available on unsupported deployments.
   JavaScript may initialize workers and submit bounded jobs; Modelica kernels
   perform the numerical work.
7. Keep simulation time lockstep: every computation required at timestamp `t`
   completes and commits before physics advances past it. Independent work
   within that timestamp can run concurrently. Keep the 30 Hz wall-time viewer
   independent and publish only coherent completed snapshots. This also allows
   a later GPU implementation to satisfy the same completion contract, with
   the separate precision/resource constraints in RUM-005.

### First implementation and acceptance

Start with one source-issued full-capacity pure vision region whose sequential
compiled path already passes numerical gates. Do not start by threading the
entire mutable solver session or by making each scalar equation a worker job.
The capability should generalize to other Modelica workloads, with no camera
dimensions, SLAM node names or application-specific scheduling rules in Rumoca.

Compare the same source, input frames and work at 1, 2 and 4 workers in native
and actual browser WASM builds. Preserve source/compiler/artifact hashes and
verify that multiple kernel workers actually execute concurrently. Report cold
initialization, warm execution, transfer, dispatch, barrier, memory, CPU time,
p50/p95 latency and full-pipeline throughput separately. Record hardware and
concurrent machine load; exclude profiling overhead from timing comparisons.

Controls must cover dependent and overlapping regions, aliased views, empty
domains, conditional branches, exact strict reductions and ties, simultaneous
faults, no partial publication, cancellation, reset, source edits and replay.
Use the existing serial executor as the differential baseline. Performance
acceptance requires a measured gain for the admitted expensive workload and
no dispatch regression for small workloads under automatic selection. Re-run
the matched fixed-20 MSL/OMC canary after compiler changes; a scheduling plan,
worker count or successful pool initialization is not a throughput result.

## RUM-015 — Remove per-kernel private-memory reservation failures (P0)

Review status: generic disjoint pooled storage is implemented on the compiler
branch. Focused native/Wasmi and strict gates pass; actual Chromium has zero
constructor failures and preserves full-plant parity, mass source edits and
reset/free lifetime controls. Uninstrumented physics advance measures
3.336→1.219 ms against the failing compiler (2.737×). This excludes sensors,
rendering and SLAM; no whole-pipeline or isolated-patch speed claim is made.
[Browser evidence](rumoca-private-arena-browser-verification.json) and
[fixed20 feature-scoped canary](rumoca-private-arena-msl-canary-verification.json)
are durable. The application review's FAST certification refusal keeps the
public compiler pin unchanged; complete preset/source persistence acceptance,
earlier exact-assignment comparison and complete capability gates remain.
[Application gate](rumoca-private-arena-preview-verification.json).

Actual Chromium construction now pinpoints the derivative-seed fallback.
The unchanged source emits the native-tested 25,022-byte derivative kernel
(`058f702b…`), but its instance throws a private-memory allocation `RangeError`.
Thirty original high-rate camera intervals retain exact full-plant parity via
the existing fallback. No new speedup is established by this diagnosis.
[Evidence](rumoca-physics-instantiation-verification.json).

`emit/arena.rs::ArenaPlan::add_memory` defines a separate memory for each
generated kernel. Although its minimum and maximum can both be one 64 KiB
page, Chromium's guarded wasm32 allocation reserves much more virtual address
space. The actual same-memory controls admit 384 instances; separate private
memories and the unchanged derivative module fail at 122. A second imported
arena reused by 384 instances succeeds. These controls test construction, not
numerical isolation or execution.

Replace per-kernel memory definitions with generic, compiler/runtime-owned
bounded storage. Preserve disjoint per-kernel regions, original checked
register extents, parameter/input immutability, source faults, tuple publication
and outer rollback. Pooling must not alias simultaneously live or reentrant
calls, expose register space to unrelated ABI buffers, or change arithmetic.
Keep growth, offsets, overflow and allocation failure checked. Retain the
existing per-program capacity; no browser flags, shared-memory/header
requirements, application-specific caps or forced interpretation are fixes.

Acceptance requires actual native and Chromium controls for many retained
kernels, alternating different live kernels, nested/reentrant calls, private
sentinels, late faults/recovery and reset/free cycles. The unchanged complete
quadrotor must instantiate and execute its derivative kernel with zero
constructor failures, preserve every visible output against Interpreter, and
survive a mass source edit and persistence/replay. Match uninstrumented ABBA
latency against the frozen failing compiler and earlier exact-assignment
compiler; report preparation, allocation, execution and committed/virtual
memory separately. Re-run scoped strict gates and the matched fixed-20 canary.
Construction success alone does not prove 10× realtime or full SLAM.

## Verification and delivery order

1. Finish RUM-001 on the existing branch. Freeze sources during final gates;
   record required workspace tests, strict Clippy, formatting, docs, and the
   measured fixed-20 MSL/OMC canary. Respect upstream specs and retain signed-off
   commits. Refresh and verify Nix fixed-output vendor hashes after lock changes.
2. Fix RUM-002 and broaden RUM-003 incrementally using real source fixtures;
   profile RUM-004 before hiding compilation cost behind caching.
3. Benchmark CPU loop/ABI work against the matched datasets. Develop the GPU
   profile and application sensor integration together, measuring transfers.
4. Migrate the full ESKF, registration, matching, map pruning, and loop graph
   only as each complete component passes numerical and replay acceptance.

Each completed request should include its upstream commit, source reproducer,
positive/negative tests, browser and native evidence, before/after latency and
memory, remaining refusals, and application integration status. Never call
native compilation, IR microbenchmarks, a reduced-state estimator, or a smooth
viewer proof of a complete high-throughput Modelica SLAM stack.

## GPU input handoff follow-up, 2026-10-05

The [actual GPU-to-WASM experiment](gpu-wasm-handoff-verification.json) now
passes raw RGB/depth/LiDAR and guard checks with one direct packed PBO copy
into nonshared WASM-memory views. Transport-only savings are approximately
0.05–0.07 ms; Rumoca execution is not integrated. See
[handoff findings](gpu-wasm-handoff-findings.md) for the source-issued packed
U8/F32 input descriptor and compiled numeric-promotion request. The current
native parameter ABI uses F64; interpreting raw sensor bytes as those values
is invalid. Co-locate rendering and the compiled graph to avoid raw-buffer
round trips through the UI, while retaining strict lockstep and a portable
unshared-memory path. No host CV or per-pixel JavaScript converter should be
introduced as the final ingestion owner.

## Mixed precision update, 2026-10-05

The user now requests Float32 storage and arithmetic for computer vision,
with Float64 retained for dynamics and estimation. This supersedes full-raster
F32-to-F64 promotion as the preferred ingestion design. Keep RGB packed U8
until compiled U8-to-F32 conversion, and preserve depth/LiDAR F32 inputs.
Promote small selected observations at a compiler-issued graph boundary.
The [mixed precision request](rumoca-mixed-precision-cv.md) records existing
Binary32 IR/evaluator support, the explicit WASM rejection and eight-byte
layout gaps, source precision ownership, integration order and acceptance.
The production preview remains F64; this request does not claim integration
or a measured speedup.

## Remove application WASM backends, 2026-10-05

The user explicitly requests Rumoca ownership of all heavy compilation and
removal of the separate TypeScript backend. Modelica -> Solve IR -> Rumoca
WASM generation is the required path. Application code may validate compiler
metadata, instantiate compiler-issued modules, transfer inputs/outputs and
manage workers/persistence; it must not lower opcodes, discover schedules,
generate raster loops or implement numerical integration.

The inertial worker now delegates to `WasmSimulationSession` and its app-side
WAT/RK4 exporter is removed. Source/compiler metadata replaces cached app
binaries. This is canonical compiler-owned execution, not a claim that every
RHS kernel is native or that throughput improved. The public preview has not
yet been updated with this migration.

Expose generic `WasmSimulationSession.reset_at(time)` through the browser API,
calling the existing compiler simulation reset owner. The current public API
resets only at zero; the adapter explicitly refuses nonzero-start replay
rather than rebasing time or evolving initial state across the gap. Preserve
source-dependent `time`, initial conditions, finite timestamp validation,
reset fault behavior and normal zero-time `reset()` compatibility. Verify
time-dependent equations, nonzero recorded starts, repeated resets and input
retention through actual compiler/browser controls.

Vision still depends on the app-side exporters. The installed compiler lacks
`prepare_native_program`; the working branch provides it for admitted
stateless full-source graphs. Scalar kernel stage sources alone do not encode
the full image traversal. Complete Modelica frame equations, feature selection
and source-owned input ingress must be admitted before those emitters and
cached formats can be retired. Avoid moving the same compilation work into
another application helper or claiming native compilation from session Auto.

## Reusable execution priorities and C++ comparison, 2026-10-05

The user explicitly prioritizes optimizations in reusable Rumoca rather than
an application-specific compiler or numerical runtime. Latest upstream main
was fetched at `91eb8cb883cadfa3dd4184f0ff4a85bc63b5452b`; local work is preserved
in snapshot `14694fd7e` before reconciliation. Pre-merge test results cannot
certify the merged compiler. Recheck current upstream semantic ownership before
carrying earlier workarounds forward.

The [standalone session profile](rumoca-session-api-profile-verification.json)
identifies a generic output-read bottleneck. Sixteen scalar reads repeatedly
perform a complete observation. In the longer matched diagnostic they average
0.125 ms for reads, versus 0.022 ms for a single complete snapshot including
JSON parsing. Weighted V8 samples place 55.75% inside `get`; Linux perf retains
615 samples and native annotations. See [scope and limits](rumoca-session-api-profile.md).
Expose the existing checked `values_for` owner through the common session and
WASM API; preserve all observation, warning, cardinality, input-override and
failure behavior. Measure the actual merged implementation before advertising
an improvement. Avoid a separate app state cache or numerical shortcut.

The [typed-call Binary32 patch](rumoca-typed-call-binary32-patch-verification.json)
extends Rumoca's existing canonical backend and entrypoint. Copied-backend
execution passes 14,400-element arrays with four-byte cells, F32 rounding,
source-independent Rust F32 numerical controls, transactional pointer faults
and a byte-identical Binary64 fixture. This is a narrow straight-line Real32
component profile. Modelica source lowering, mixed Integer/Boolean layouts,
Map/Fold/control, nested calls, external packed views and whole-program
admission remain pending. Never present this component as a running GPU
feature detector. The earlier scratch emitter is a prototype only; it is not
a second production backend.

The desired pipeline is GPU-produced U8 RGB and F32 depth/LiDAR, one packed
readback into compiler-issued WASM input storage, compiler-owned U8-to-F32
conversion and native F32 CV, then small typed F32-to-F64 observation edges.
No whole-frame JSON, host pixel conversion, TypeScript raster generator or
bulk F64 image promotion should be needed. This CPU/WASM path still has a GPU
readback; it is not a GPU-resident feature detector or a zero-copy claim.

Competitive ROS 2 C++ performance must be assessed with matched workloads:
the same complete detector equations, image dimensions and numeric units,
feature cap, sensor rates, held timestamps, output requirements and CPU-core
budget. Compare both the detector kernel and acquisition-to-accepted-estimate
pipeline, retaining warm/cold compilation separately. Check numerical outputs
before timings, include buffer transport and preprocessing, and report CPU,
memory, viewer FPS and lockstep simulated/wall time. A standalone C++ kernel
can establish a native computation baseline, but cannot be labeled an actual
ROS 2 node or full simulator benchmark. No such comparison has run yet.

At the requested 90 camera frames per simulated second, 10 times realtime
allows about 1.11 ms of wall time per camera interval for the complete lockstep
workload. Independent LiDAR and IMU due events must remain included. SIMD and
parallel scheduling belong in compiler targets and checked graph execution;
elementwise SIMD may preserve arithmetic order, while changing reduction order
requires an explicit numerical policy. F32 by itself does not establish that
budget, C++ parity or full SLAM.
