# Optimizer bottlenecks from perf and emitted code

The matched benchmark puts Rumoca CPU WASM 3.2–12 times behind optimized OMC
native C. A fresh original-module `perf` capture and retained-operation copy
counters pinpoint two reusable compiler defects: repeated evaluation of the
same source assignment and full-array loop carries for small or inactive updates.

## Actual hot owner

The checked ten-second evaluation window contains 985 samples, no lost records
and three unresolved leaves retained in the denominator. Weighted leaf cycles:

| Owner | Sampled cycles |
| --- | ---: |
| WASM function 28: `PGNormalProduct` call at Modelica line 340 | 56.09% |
| libc memmove | 31.62% |
| WASM copy wrapper | 1.24% |
| WASM function 23: block-solve helper | 4.33% |

The first three owners account for 88.95%. Perf reports 985 throttle and 985
unthrottle records; this is not a CPU-utilization measurement. The earlier
independent capture shows the same dominant owners at 53.14%,35.49%,1.14%.

This source mapping is compiler-issued evidence, not a guessed function name:
function 28's InvalidBuffer return 676 maps through the artifact fault table to
owner 25, source bytes 16209–16302 in the exact issued source:

```modelica
product := PGNormalProduct(direction,nodeMask,edgeMask,source,target,
  Ji,Jj,information,diagonal,damping);
```

The analyzer verifies the original module's disassembled WAT, the fault owner,
the byte span and its source digest. Function 33 maps to the `PGPCG` call;
function 24 to `PGPrecondition(rhs,factors,nodeMask)` at line 347; function 35
to `PGLinearize` at line 383. These are positions in frozen `run-source.mo`.

## Repeated source-assignment evaluation

There is exactly one `PGNormalProduct` assignment per active PCG iteration in
the Modelica source. The emitted PCG body has 22 call sites for that same owner.
Retained call instrumentation, with output bits and readonly inputs checked:

| Case | Reported PCG iterations / required product calls | Actual product calls | Amplification |
| --- | ---: | ---: | ---: |
| Eight-pose rotated loop | 247 | 4653 | 18.84 |
| All 128 nodes/all 256 edges | 111 | 2069 | 18.64 |
| Stationary optimum | 0 | 0 | none |

The inner preconditioner also runs 1673 times in the eight-pose case and 721 in
the dense case, against source upper bounds 247 and 111. Initial preconditioning
is a separate owner and is excluded from those counts. These are actual calls,
not extrapolated from static call sites or sampled percentages.

Requested fix: preserve source assignment/SSA value identity through loop and
conditional lowering. Compute each pure call once per authored occurrence and
iteration, then reuse its output. Aliased or updated operands need correct value
versions; caching raw mutable pointers across iterations would be incorrect.
Bind the invariant to these counters: product calls 247/111/0, preconditioning
within the corresponding authored bounds, unchanged numerical and rollback gates.

The emitted PCG function also reserves 10917424 scratch bytes for a 6168-byte
result. The normal-product callee uses 136888 scratch bytes plus 240648 input
bytes. Please expose per-call/region lifetimes and high-water allocation in
preparation reports; repeated call materialization and retained frames need
separate accounting. This may also help diagnose the full optimizer storage
refusal, but does not establish its allocation owner.

## Whole-array update and inactive-carry materialization

Function 28 accounts for 21.33 GB of the dense solve's 27.39 GB logical copied
bytes; in the small loop it accounts for 23.24 GB of 30.39 GB. Its 6144-byte
array is the entire 128×6 result. Source updates touch six entries per endpoint.

In the eight-pose case, copy site 168 at original WAT line 45492 executes
1153944 times in the inactive `else` branch. That is 4653 calls ×248 disabled
edge slots, copying **7089831936 logical bytes** despite no source update.
Sites 171/174 at lines 45533/45573 then each copy the same full result once per
edge: 1191168 calls and 7318536192 bytes each. Dense execution likewise contains
full result copies around each row update. These are logical widths, not
physical DRAM traffic or instrumented timing measurements.

Requested fix: alias-safe owned array updates, borrowed readonly inputs and
lifetime-aware loop/branch carries. Inactive branches should retain the same
value without cloning it. Active endpoint updates should write the affected
six-element rows after preserving all required reads. Keep dynamic index and
integer checks; use shape/range proofs to hoist redundant checks and address
calculations rather than dropping safety.

Function 35 separately copies 151468032 bytes even in the stationary control,
including whole 73728-byte Jacobian arrays for disabled edge slots. The same
carry/view fix needs to cover linearization and preconditioning.

## Machine code and OMC comparison

Every sampled function 28 leaf PC maps to its printed TurboFan instruction.
Within that function's samples, integer/address instructions account for 46.18%,
memory moves/loads/stores 37.95%, register/stack moves 7.75%, and floating
arithmetic 5.18%. The latter is 2.91% of the complete capture. Sampling skid and
instruction classification limit interpretation: these are not exact instruction
costs, and necessary arithmetic/addressing must remain. The hot PCs include
repeated scalar stores and multiply-by-six address calculations.

A separate OMC `-O3` dense-kernel perf run retains 2101 samples inside an explicit
monotonic evaluation interval, excluding 108 startup/warmup samples. All periods
and four unknown leaves stay in its denominator; no lost records occur. Its
50 repeated results exactly match the accepted baseline output bytes. Top leaves
are generic indexing (`calc_base_index_va` 13.60%, `calc_base_index_spec` 10.37%)
and GC allocation (`GC_malloc_kind` 7.90%). OMC has substantial runtime overhead
too; this supports pursuing direct shaped accesses and reusable scratch in
Rumoca. It does not prove an unimplemented speedup or a WASM-versus-WASM result.

The compiler acceptance target is **faster than the matched OMC medians** on
these cases, with unchanged inputs, capacities, budgets and numerical gates.
First land the source-identity and carry/view fixes, then rerun counters and
unprofiled ABBA timing. SIMD or GPU lowering can follow measured remaining math
cost. Application-managed math, reduced capacities and removed checks are not
substitutes for these compiler fixes.

## Evidence

Module SHA256:
`496681a41203b44869ab4f48f92a344c1f4195f449038e98d6f2a0a9e367b869`.
Source SHA256:
`1f7dbf492ae3b588559d2e930c165238e111d9df1d2f1c1a52a1475c72ef4788`.
Compiler: actual Rumoca main 0.10.2 / `f0e83f00ab21`.

Analyzer: `dev/analyze-pose-graph-hotspots.mjs`.
Capture: `dev/profile-pose-graph-kernel.mjs` and the frozen executed preimage.
Durable reports, source spans, counters and probe preimages:
`dev/artifacts/modelica-pose-graph-perf-hotspots-2026-10-07/`.
Large raw perf data, machine code, maps and WAT remain under
`$HOME/scratch/slam_web/profiles/pose-graph-perf-hotspots-2026-10-07/`,
`pose-graph-omc-perf-2026-10-07/` and `pose-graph-native-2026-10-07/`.
See also the [matched runtime benchmark](modelica-compiler-comparison-2026-10-07.md).
Full browser SLAM and 10x realtime are still unverified.
