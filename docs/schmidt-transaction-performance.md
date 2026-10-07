# Complete filter transaction: measured cost and generated code

The source-issued complete 15-current + 6-reference Modelica transaction takes
**1.052 ms per prediction step** in the latest unprofiled Node/V8 run on one
CPU core. Twelve blocks each carry the actual 388 returned state cells through
600 predictions with a frozen correlated reference. A preceding run measured
1.065 ms. These are isolated filter costs, excluding the visual frontend,
sensor rendering/readback, feature selection, mapping and viewer. They do not
establish browser or whole-simulation throughput.

[The verification record](../dev/schmidt-transaction-profile-verification.json)
binds source `f8fe0faa…`, module `b57eed18…`, the executed probe and consumer,
and all 20 independent fixture cases: 7,876 checks, maximum error
`7.641665078494952e-13`. The probe validates those cases before profiling.
The public app and production compiler pin remain unchanged by this experiment.

## Actual perf and WASM evidence

The Linux `perf` capture uses `cpu-clock:u`, 499 Hz, frame-pointer stacks and
V8's JIT integration. The exact hot interval is selected from the probe's
`CLOCK_MONOTONIC` markers after fixture checks, module construction and warmup.
For future captures, set V8's `--perf-prof-path` and `--logfile` explicitly under
the project Scratch profile directory. Both completed captures' owned V8 logs
were copied, hash-checked and moved there after the processes exited.
There were zero lost samples. In that interval, nine covariance PSD function
owners account for **73.60% of self samples**; `eval_assignments` accounts for
20.49%. Those percentages describe sampled code, not hardware memory stalls
or the fraction of elapsed wall time.

The generated WAT and emitter implementation show scalar intermediate values
stored in linear scratch memory. Native annotation of one 21×21 PSD helper
shows hot stores and copies of these scalar values. Its annotation covers the
whole profiled process; `perf annotate` here does not support the time selector
used by `perf report`. The rejected annotation command is retained as evidence.
Only one static `memory.copy` appears in that helper. This evidence does not
identify bulk array copies as the dominant runtime cost.

[V8's perf documentation](https://v8.dev/docs/linux-perf) describes the JIT
record/inject/report workflow. Its [WASM compilation documentation](https://v8.dev/docs/wasm-compilation-pipeline)
explains why profiling warm optimized code matters. The archive includes the
full generated WAT as lossless gzip, an owner/source map that preserves decimal
source identities, the raw capture and reports. Processed traces, JIT files and
earlier failed profiling attempts remain under
`$HOME/scratch/slam_web/profiles/schmidt-transaction`.

## Source experiment and next backend change

A separate Scratch-only Modelica variant moves each PSD factor sum into the
branch that uses it, retaining the used accumulation order, covariance checks,
tolerances and original full dimensions. The compiler issued a complete module
in 175.133 seconds with 4,939,052 KiB peak RSS. The same independent 20-case
expectations pass, but an unpaired timing measured 1.026 ms per step. That small
difference does not justify a causal speedup claim or promoting the variant.

The next generic backend experiment is [private scalar register locals](../dev/rumoca-typed-scalar-local-performance-proposal.md).
It must preserve array memory, mutable-slot snapshots, region-local register
names, complete guards, fault identities and atomic outputs. Its benefit still
needs an actual compiler patch, differential numerical/fault tests and matched
measurements of the unchanged complete transaction. No 10× simulation claim is
supported by these component measurements.

## Follow-up matched source experiment

The [matched record](../dev/schmidt-transaction-matched-branches-verification.json)
compares the same baseline and Scratch branch-refactor modules in one Node/V8
process on CPU 14 at nice 15. Both pass 20 independent cases (7,876 numerical
checks each), receive 1,000 warmup steps, and carry all 388 actual returned state
cells. Six ABBA cycles contain 600 prediction steps per block. Median baseline
and candidate times are 1.055258 and 1.019665 ms; the median cycle ratio is 1.033870,
or 3.276% lower candidate step time. Every measured cycle favored the candidate;
this one-machine component experiment provides no confidence interval or
cross-machine guarantee. The source refactor remains unpromoted and excludes
sensors, visual frontend, mapping and viewer costs. Generated scalar scratch
traffic remains the next backend hypothesis to measure.

## Persistent driver copy optimization

The [current session verification](../dev/modelica-schmidt-session-optimization-verification.json)
covers an implemented transport change around the unchanged complete module.
The driver makes one owned candidate state per frame, copies each returned
field once per interval and reuses a checkpoint of the entire WASM memory.
External inputs, source/config metadata and defensive snapshots retain their
checks; failure restores the checkpoint before another interval can proceed.

Five Node tests and actual Chromium workers cover covariance retention,
IndexedDB reload, mutable snapshot isolation and rollback/recovery. The warmed
same-process ABBA/BAAB comparison carries the actual returned state at 90 Hz:
300 warm calls and 400 timed calls per version, 116,788 bitwise-equal state/flag
comparisons. Mean session times are 1.313590 ms before and 1.150710 ms after,
or 12.40% lower elapsed step time. This is a single-machine isolated session
measurement, with no whole-pipeline or 10× realtime claim. It includes driver
work that the approximately 1.05 ms kernel probe above excludes.
