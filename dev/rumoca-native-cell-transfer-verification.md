The full Modelica FAST detector is executing correctly in Rumoca SolveIR WASM.
Two generic final-emission optimizations now improve its isolated Chromium
median by 8.4–8.8% across three paired rounds. Connected Modelica localization
and full SLAM remain unfinished.

| Chromium worker round | Before median | After median | Improvement |
| --- | ---: | ---: | ---: |
| 0 | 23.9 ms | 21.8 ms | 8.8% |
| 1 | 23.8 ms | 21.7 ms | 8.8% |
| 2 | 23.8 ms | 21.8 ms | 8.4% |

These are math-only headless measurements of the unchanged 160×90 source,
with four finite input frames, 64 warmups per artifact and 120 samples per
batch. Artifact order alternates across three rounds. Rendering, GPU sensor
readback, selection, localization, mapping and loop closure are excluded.
Input copying adds little in this fixture. Node results vary more: median
improvement is 12–29%, and one round has a worse p95. No end-to-end or 10×
realtime performance claim follows from these measurements.

Rumoca now routes dynamically addressed eight-byte Map results through its
existing raw `i64.load`/`i64.store` specialization. Scalar native call transfers
use a scoped single-iteration body while preserving checked extents, original
counter increments, conversion checks, first faults and publication order.
No Modelica arithmetic, input dimensions or validators changed.

The actual module inventory changes from 27,567 to 14,631 loops, removes all
672 eight-byte bulk-copy sites, and removes all 12,936 detected one-extent
i32 loop guards. Other bulk-copy widths retain their original counts.
The module shrinks from 14,990,200 to 14,796,160 bytes. Its 99 function bodies
remain within the 1 MiB budget; the largest is 1,048,326 bytes. The canonical
Solve export is byte-for-byte unchanged.

Strict lint, formatting, linking and 44 broad suites pass: 3,087 passed,
zero failed, one ignored. Focused controls compare independent original-loop
and bulk-copy emission, overlapping and unaligned ranges, raw NaN/signed-zero
bits, bounds faults, counters, Boolean/Integer conversions, late-fault
atomicity and recovery. Full-source numerical checks cover 230,400 scores
in Node and another 230,400 on each of the first and restored Chromium runs.
Finite outputs compare exact bits; NaNs compare classification. Compilation
and profiling artifacts remain under `$HOME/scratch/slam_web`.

The fixed20 MSL canary has not run for this source closure; these are focused
WASM and broad compiler results, not a release or full-cohort qualification.
The new compiler has not been promoted into the website's browser compiler.
No downloadable FMI-LS-WASM FMU is produced by this change.

The next localization change needs a shared normalized statement inventory
that exposes generated predicate snapshots to every liveness, substitution,
definedness and loop-lowering pass. The staged design uses opaque
function-owned local keys and preserves each original predicate evaluation.
Its implementation is pending; it must not invent declaration IDs, hide RHS
reads behind empty markers, or weaken conditional validation.

A larger performance opportunity is documented in
[the composite-family proposal](rumoca-fast-composite-family-proposal.md):
preserve sibling equation-body paths through the outer image loop and retain
structural border/interior domains before call owners are issued. This is
necessary to avoid scalar caller expansion while keeping source identity,
bounds and existing native Map certificates. It is currently a proposal.

Source-bound artifacts, resource measurements, complete timing rounds and
outstanding work are recorded in
[the verification record](rumoca-native-cell-transfer-verification.json).
# Subsequent compiler work

The detector qualification above belongs to its pinned producer and source
inventory. New checked normalization groundwork and constant assertion fixes
have since changed the compiler source; the detector's native/browser numerical
and timing evidence has not been rerun with that newer compiler. See
[the current normalization verification](rumoca-function-normalization-verification.md).
