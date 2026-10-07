# Demand-derived Solve artifacts: read-only architecture proposal

The native causal program path currently builds solver derivative products that its emitter does not consume. Accepted SPEC0007, lines250–252, already requires expensive/noncanonical products in `SolveArtifacts` to be materialized on backend/template/runtime demand. Reference SPEC0040 SOLVE-C15/C16 makes AD/Jacobian products separate from base Solve IR; SOLVE-C17 keeps structural sparsity construction-derived, never a raw hint. A typed demand boundary is therefore appropriate reusable compiler work. This audit produces no compiler patch or execution result.

Current priority is actual full vision source preparation. Root's private counter diagnostic reports an eager28,808×28,808 lookup containing829,900,864 indices (6,639,206,912 bytes), followed by RSS guard termination at final model validation. Root is testing the narrow lazy column-cache repair first. This audit did not execute that diagnostic, and does not establish that a new typed-core API is necessary after the cache repair. Implementing the API is deferred unless the actual native artifact gate shows it directly blocks vision preparation. No additional performance comparison is proposed.

## Exact source path and consumers

- `crates/rumoca-bind-wasm/src/native_assignment_api.rs:26–39`: `with_prepared_native_model` compiles the complete requested source, then calls `rumoca_sim::lower_dae_for_native_preparation` before its artifact callback.
- `crates/rumoca-sim/src/solve_lowering/entry.rs:51–70,154–195`: native preparation follows host-driven input seeding into the ordinary correlated full-model construction. Input declaration bindings, checked start attributes and experiment input overrides keep their existing ownership.
- `crates/rumoca-phase-solve/src/model_values.rs:149–187`: one structural selection and `lower_selection` construct the canonical problem and pure-call table. Global `lower_solve_artifacts` runs at161 before runtime defaults/visible projections at166 and final model validation at179.
- `crates/rumoca-phase-solve/src/artifacts.rs:9–75`: global products scalarize implicit/derivative RHS, derive scalar AD rows, tensor implicit/manifold JVPs, initialization JVPs, optional update/discrete JVPs, structural patterns/colorings/projection output facts and specialized algebraic Jacobian applications.
- `crates/rumoca-bind-wasm/src/native_program_api.rs:22–105,117–160`: the whole-program consumer reads the problem/layout, source-issued schedule, pure-call table and parameter vector. It reads no `model.artifacts`. It preserves the64MiB storage/module profile, emitted math/fault inventories, source/module digests and source-owned schedule metadata. The separate-stage native API likewise consumes schedule kernels and layout, without global solver products.
- `crates/rumoca-ir-solve/src/refresh/native_assignment.rs:108–168`: scheduling consumes canonical `ComputeBlock`, structural row targets and `VarLayout`. It retains source/family shapes, complete output/target coverage, overlap/refusal arithmetic, exact dependencies and deterministic order; it does not consume a global Jacobian/JVP artifact.

The actual field names are `implicit_jacobian_v`, `implicit_jacobian_v_scalar`, `full_jacobian_v` and structural products; there is no asserted `globalJacobian` field in this audit.

## Required obligations stay in the common core

`crates/rumoca-phase-solve/src/lower.rs:35–107` already performs layout, clocks, structural matching/feedback checks, source derivative resolution, complete continuous/initialization/discrete/event/action lowering, typed pure-call construction and refresh owner issuance. It finishes with `validate_problem_pure_call_sites`; that function calls complete `SolveProblem::validate` (`crates/rumoca-ir-solve/src/lib.rs:959`). These operations must remain common, regardless of demanded derivative products.

`SolveProblem::validate` checks the schema, storage runs, continuous/initialization/discrete/event contracts. Continuous validation at`ir-solve/src/lib.rs:2017` also re-derives and compares the native schedule from the exact original implicit RHS, targets and layout (`refresh.rs:667`). Demand selection cannot suppress this certifier, target gaps, ambiguity, arithmetic refusal or graph order.

Source `der(...)` lowering is separate from optional numerical AD products. `phase-solve/src/lower/scalar/coordinates.rs:410–478` rejects missing/mutually recursive definitions and retains matched state, expression, domain point and lexical derivative context. Structured derivative row cardinality at`lower.rs:394` and ordinary algebraic source compilation at1420 remain checked. The latter's diagnostic mentions derivative reads even when the failure originates from an ordinary source expression, so it cannot be used to justify skipping source lowering or inactive-window validation.

Runtime vectors at`phase-solve/src/model_values.rs:211–267` must keep checked bindings/start values, overrides, nominal/domain checks, alias starts, visible projections and variable metadata. The final pure-call visitor also visits visible rows (`ir-solve/src/visitor.rs:169–176`), not only the canonical problem. A primal core needs the same visible call-site validation; dropping global artifacts cannot drop that visit.

The native profile still rejects states, initialization equations, events, clocks and external tables at`bind-wasm/src/native_assignment_api.rs:44–72`. Backend operator/type capability, typed argument and frame checks, lazy invocation behavior, ordered source assertions, exact owner/provenance/fault mapping and output transaction remain unchanged. Demand is derived from the checked consumer interface, never source names, image dimensions, host reconstruction or a model whitelist.

## Bounded API design if actual admission needs it

Use one phase-owned `LoweredSolveCore<'source>` constructed by the existing structural selection and `lower_selection` exactly once. Retain its canonical problem/table, the exact `PreparedDae<'source>`, formal alias report, original external-table ownership, override scope and timing context. It exposes immutable views, not a second lowerer or mutable graph.

The core has two consuming capability constructors:

1. **Full runtime demand** builds the same complete `SolveArtifacts`, then the existing runtime vectors, then the existing `LoweredSolveModel` and its complete validation. This preserves legacy artifact-before-runtime-vector error order, source correlation and the full FMI/simulation contract. `lower_solve_model` remains this full-demand wrapper.
2. **Primal value demand** builds the same checked runtime vectors and validates all canonical/visible call references, then exposes an opaque primal preparation result with immutable problem/table/parameters/external-table views. It has no field pretending empty products are materialized artifacts, and cannot be supplied as an executable full `SolveModel` to FMI/simulation. The existing native profile and emitter then consume those exact views. Keep the public native source→artifact JSON/ABI unchanged. A new generic sim primal-preparation wrapper can preserve the existing public Rust full-model preparation signature for compatibility.

If a previously prepared primal core later requires full products, consume that same immutable core and derive them through the phase's sole artifact function; do not redo source selection or reconstruct ownership. Artifact availability must be typed/explicit. Empty JVP blocks cannot serve as a missing-artifact marker because a legitimate empty domain also has empty products. Initial implementation need not introduce arbitrary artifact bitmasks, caching or a new wire schema.

Complete model wire replay currently deliberately rebuilds runtime products at`phase-solve/src/model_wire.rs:121–126`; leave its full-runtime semantics intact. A later demand-aware replay must get demand from its caller, never from an untrusted payload, and retain the same base/call/schedule reconstruction checks.

Two eager derivations are outside the global split and must remain in its first stage: reduced chart artifacts at`phase-solve/src/lib.rs:198,266`, and checked typed pure-call directional owners at`ir-solve/src/typed_program/call.rs:680–682`. Preserve them and state the scope honestly; omitting global products does not mean zero AD or prove a speed improvement.

## Concrete controls required before integration

- Independently compare legacy full assembly and full-demand assembly for canonical problem/table, runtime defaults, visible rows/metadata, derivative products, errors/provenance and source-issued native module/fault bytes.
- Prove one base construction by consuming a core into either profile while retaining the exact compact program/call owners; no table/body cloning or owner merging.
- Test original host-driven input/start/override/alias/default failures, complete visible call-site validation and source derivative missing/cycle/domain-context failures.
- Preserve native state/event/clock/initialization/external-table refusals, target gaps/overlap/ambiguity and ordered arithmetic refusal through independent existing certifiers.
- Show primal demand cannot cross a full-runtime API and full demand actually builds all required products; failed AD capability remains an error for consumers that demand it.
- Replay canonical complete model wire with the existing full product contract and unchanged source/call ownership.
- Finally prepare and numerically execute the unchanged full vision source. Tiny source/model controls do not substitute for that gate.

All source paths above were read-only. Main compiler mutation, Cargo/shared-cache work and private counter execution remain with root's active compiler owner. No demand API patch has been applied or staged; accepted demand semantics are recorded here for a bounded follow-up only if the actual source gate needs it.
