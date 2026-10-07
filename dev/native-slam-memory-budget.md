The full native-resolution SLAM graph needs a compiler-owned memory plan as
well as successful lowering. The present application consumer and reviewed
Rumoca native program profile both cap imported memory at64MiB. Raising an app
constant alone cannot fix the compiler profile or excessive copying.

This is a source-level lower-bound calculation, not a measured issued full-SLAM
artifact. The current59-file native RGB3/Z16 graph has source SHA256
01a6ffc7a8ad9708e904bef83552c150ea27adf81b476008833f46c34a6d3dcd.
Its frozen source is
`dev/artifacts/descriptor-matching-bound-2026-10-07/native-source/source.mo`.
`node dev/audit-native-slam-memory.mjs` checks the current source declarations,
State ownership links, dimensions and exact CI producer source before emitting
`dev/artifacts/native-slam-memory-budget-2026-10-07/report.json`.

| Selected source field | Shape | Bytes for one f64 copy |
| --- | --- | ---: |
| Catalog descriptors | 128×350×49 | 17,561,600 |
| Catalog optical points | 128×350×3 | 1,075,200 |
| Native RGB3 plus depth inputs | 480×848×(3+1) | 13,025,280 |

Three copies of just these two catalog arrays plus one camera input region
require68,935,680bytes, or65.7421875MiB. That exceeds the67,108,864byte budget
by1,826,816bytes, before every other State field, typed Integer/Boolean storage,
pose/filter covariance, pixels/masks, graph, map, image kernels and helper
input/output/temporary storage. The native raw sensor streams themselves use
only2,035,200bytes; this calculation concerns their current f64 representation
in the compiled program, not GPU readback size.

The previous document's68,966,400byte descriptor-plus-camera bound used an
older RGBA source snapshot661cd46791fd. Current RGB3 uses one fewer channel,
so descriptors alone no longer prove the excess. The optical-point field
establishes the updated partial bound without assuming RGBA or counting the
rest of State.

The three-copy assumption comes from the reviewed ABI implementation:

- `previous` is a complete input State in P, including its descriptor catalog.
- `next` is a complete returned State with the retained real catalog.
- `CallProgramPlan` allocates a private work-Y region, then publishes host Y
  transactionally on success. Its `work_bytes` is eight times the Y scalar
  count. Complete helper call input/output and scratch regions are additional.

This is conditional on those fields retaining their current materialized
f64 P/host-Y/work-Y representation. If the compiler aliases/views retained
storage, eliminates an intermediate, or issues different record storage, use
its actual layout/liveness report instead. Do not describe this arithmetic as
an observed full-graph memory refusal: compilation has not reached that gate
on the downloaded package. Layout and typed State ownership changes are welcome;
they need to retain atomic failure and exact State semantics.

Read-only source audit of actual CI compiler revision33467086deca (module SHA
c5177288675db521d14cf4695b5d8a13d5bb5c3f3a304b945f6500bfff99fcec),
fetched from GitHub without editing/building the external compiler checkout:

- `crates/rumoca-bind-wasm/src/native_program_api.rs` bounds Y+P and then
  Y+P+scratch+typed lanes to64MiB.
- `crates/rumoca-exec-wasm/src/emit/compute/call_program/layout.rs` constructs
  work-Y plus helper input/output/scratch and then memo/typed-lane regions.
  Scratch itself also has a64MiB limit.
- `src/modelica-native-program.ts` rejects memory_pages>1024. Its limit must
  follow a reviewed compiler-issued profile when that profile changes.

Exact producer files and hashes are retained under
`dev/artifacts/native-slam-memory-budget-2026-10-07/compiler/` and its report.
This partial bound applies to the Step entrypoint with a previous State and
camera inputs. It is not a memory prediction for Reset, which has no previous
catalog or camera inputs. Reset compilation is being tested separately.

Please deliver a reusable compile option/profile with an explicit checked
memory budget and a storage/liveness breakdown. First remove avoidable whole
State/record copies and repeated helper work. A larger supported budget may
still be required; expose it clearly instead of silently shrinking the128/350/
256/14400 capacities or duplicating app-side compiler logic. Preserve exact
Integer/Boolean record transport, readonly sensor inputs, rollback and
cross-entrypoint record identity. CV f32/byte transport can reduce sensor and
vision storage while physics/filter calculations remain f64, but it does not
replace ownership/liveness analysis for large carried records.

The main runtime remains unqualified until the actual native graph is issued,
loaded, executed and profiled in a browser worker. No production package pin,
ABI acceptance limit or external compiler checkout was modified by this audit.
