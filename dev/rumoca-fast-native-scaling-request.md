# Full-frame FAST native scaling request

Date: 2026-10-05. Read-only compiler diagnosis; no compiler edits, Cargo,
compilation, preparation retries, or full Solve JSON parsing. Only the two
retained 133,377-byte owner excerpts were parsed, using Perl JSON::PP on CPU 12
at nice 15. The source/build freeze remains with the compiler owner.

The [original preparation record](rumoca-fast-native-frame-preparation-verification.json)
retains the unchanged 160×90 source
`d42da6959fee8a629c6a9850fef31559ba692f5bafd3001ba69106200f34ea11`, 12,936
distinct call owners and the 1,822,514,705-byte Solve wire. It refused native
assignment certification before helper emission. The following are static
counts for two observed owners and conditional scaling bounds, not a produced
whole-frame native artifact. The [body reuse request](rumoca-pure-call-body-reuse-request.md)
contains the broader representation proposal.

The later [original-function component verification](modelica-fast-patch-verification.json)
issued a 13,178-byte baseline module and a 13,186-byte source-edited module,
each with 109 helper faults and 111 total faults, confirming the static helper
count below. Node and Chromium workers plus IndexedDB replay passed 276 exact
raw-bit score checks over 23 independent patches; the Modelica edit raises
`responses[1]` from zero to one. This proves the selected original 7×7 function
and its edited component, not full 160×90 detector admission or performance.
These component module sizes are not extrapolated to the full-frame artifact.

## Exact local inventory and consumer limits

Owners 0/1, identities 1/2, have byte-identical 133,037-byte bodies. Each has
one `Real[7,7]` input, one scalar Real result, no nested Call operations and no
assertion-predicate result. Recursive inventory includes both conditional
arms and each Map/Fold body once, not once per domain point:

| Observation, per retained body | Count |
| --- | ---: |
| Top-level typed operations | 113 |
| Operations including nested regions | 325 |
| Map / Fold / Conditional operations | 8 / 3 / 10 |
| Binary / Compare / Unary numeric operations | 34 / 10 / 1 |
| Dynamic element projections / element updates | 42 / 21 |
| Integer Add operations, included in Binary count | 18 |

Compiler pointers below are relative to `../rumoca-native-functions`.
`typed_call/emit.rs::compile_owner` emits one InvalidBuffer fault. Its
`validate_inputs` emits none for the root's Real input. Region bodies do not
run separate helper input validation. `typed_call/numbers.rs::number_operation`
unconditionally allocates a fault record for every admitted numeric operation,
including Real arithmetic and comparisons. `emit.rs::dynamic_operation`
allocates one bounds record per dynamic projection or update. Map/Fold bodies
and both conditional arms are emitted once statically.

Therefore, **each observed body emits exactly 109 static fault records** under
the current emitter, provided its reachable vocabulary is admitted:
1 ABI + (34 + 10 + 1) numeric + (42 + 21) bounds. This is a static inventory
count, not 109 possible faults on one execution. Several numeric records are
never referenced by a failure instruction for their admitted Real/compare
path. No rule here removes those records or any runtime check.

`typed_call/program.rs::ProgramHelpers::bodies` emits every reachable owner and
starts helper fault offsets at 2. `rumoca-bind-wasm/src/native_program_api.rs`
adds whole-program statuses 1/2. The app's
[`modelica-native-program.ts`](../src/modelica-native-program.ts) requires:

- At most **262,144** fault records (`validate`, line 55), unique positive
  statuses and complete owner/operation/region-path/Span metadata above status 2.
- At most **67,108,864 module bytes** (64 MiB, line 119).
- At most 1,024 memory pages, including complete Y/P and transactional scratch.
- The supported native profile and exact current Solve schema (currently 70).

The compiler binder separately enforces 64 MiB module and storage-plus-scratch
limits. Its typed emitter's fault-index guard is `i32::MAX`, not 262,144; it can
issue a fault inventory the app refuses. Function count has no explicit app
cap. Backend plans one helper for every reachable call owner; browser acceptance
of a very large helper count has not been measured here.

If all 12,936 owners had the observed inventory and remained reachable, the
existing format would contain **1,410,026 faults**, including statuses 1/2.
Only 2,404 such helpers fit the app fault cap. The retained evidence proves
this calculation's two local samples; it does not prove its whole-table premise.

## Independent module-size lower bound

The current typed emitter encodes instructions directly, without a subsequent
body optimizer. A lower bound can ignore all region-control instructions,
copies, constants, fills, ABI guards and publication. Even at the shortest
possible LEB encodings, `address` requires 5 bytes, `cell_address` 11,
`load_cell` 14, and `fail_if` 6. Every observed dynamic access has an index.
The one-index `dynamic_index` needs at least 49 bytes; the final element
load/store address sequence adds 23. Updates need that same 72-byte minimum
even when their aggregate copy aliases and emits nothing.

For numeric operations, `cells` emits at least 8 bytes surrounding its body,
the destination address costs 11, and the final store costs 3. A binary costs
at least 51 bytes, comparison 52, and unary 37. Integer Add emits more checks,
so using the Real binary minimum remains conservative. An aggregate loop
cannot make these minima smaller.

Each retained helper consequently has a code lower bound of
`63×72 + 34×51 + 10×52 + 1×37 = 6,827 bytes`.
If 12,936 helpers had that inventory, helper instructions alone would require
**at least 88,314,072 bytes**, exceeding the binder and app module limits before
the main schedule, section framing, fault-offset encodings or other helpers.
This is an instruction-count lower bound, not an exact encoded module size or
an unconditional claim about all owners. A real bounded compiler-issued
artifact is still required to measure module/scratch size and actual census.

## Earlier source-owner expansion

The earliest relevant growth is already in **Flat loop expansion**, not only
in Solve body storage. The original source has one textual patch call inside
a static row/column `if` equation. These implementation facts explain the path:

1. `rumoca-phase-flatten/src/equations/mod.rs::expand_for_equation` (1040)
   separates independent bodies and asks for a symbolic template before
   materialization. `collect_template_residuals` (1255) accepts Simple and
   nested For equations, but returns None for the source's Equation::If.
2. `collect_for_iterations` (1296) substitutes each concrete binder value and
   flattens those source equations. The scalar arithmetic preparation helper
   does not admit this conditional patch-call body. The missing template keeps
   exact materialized residuals rather than a single conditional call family.
3. `rumoca-phase-dae/src/construction.rs::lower_structured_equations` (1330)
   can lower a template once with typed binders; without one,
   `lower_materialized_family_bodies` (1664) lowers each scalar residual.
   `rumoca-ir-dae/src/expression/call_nodes.rs` issues a new owner at the current
   expression-arena length for every new call occurrence.
4. Solve registration then maps each distinct DAE owner to a distinct checked
   call owner and rebuilds its function body. The retained Solve table proves
   12,936 distinct owners. The corresponding count of distinct DAE owner ExprIds
   is inferred from this producer path; no retained full DAE dump was parsed.

A source-proven compact conditional family could avoid creating these owners
in the first place. It would retain the original full domain and lazy guard,
or a constructor-proven exact interior/border partition, the 7×7 affine window,
ordered results and source occurrence plus each domain-point invocation.
This fits C51's compact-domain context and SPEC_0032's family/scalar-view
direction. It does **not** authorize merging the 12,936 already-issued owners
or reconstructing a stencil from consumer-side scalar rows.

Actual implementation must prove fixed window shape under binder-valued slice
bounds, exact input evaluation order, inactive-border laziness, row-major output
mapping and dependency ordering after the complete grayscale field. It must
also retain a failure's exact domain point. A static family owner is not an
invocation result key: the runtime invocation context must include the domain
point and existing input/version/profile context, or execute every point fresh
without cross-point reuse. Existing scalar lowering has context-keyed call
projection caches; those do not by themselves establish runtime certificates.
The whole-program native memo recognizer accepts only complete unchanged
P/time/constant coordinates, not arbitrary binder-varying gray windows.

## Next canonical body reuse stage

Implement checked immutable body sharing first as a bounded representation
change, using a concrete DAE FunctionId, effective ABI/types/shapes, arithmetic
and AD profiles, structural captures, and exact nested binding/provenance facts
as the construction key. For an initial stage, require exact compatible spans
and exact nested owner bindings; the two observed FAST bodies satisfy that
storage case. Unknown facts get separate bodies. Never return another owner's
registration or cache on a body hit.

The minimal accepted-spec clarification belongs in SPEC_0040 SOLVE-C51, linked
from accepted SPEC_0007: permit distinct checked owners to reference one
constructor-issued immutable body, and permit each distinct target entry to
delegate to shared implementation code while retaining exact identity,
validation, fault mapping, activation and result-cache obligations. Consumers
still cannot hash/compare bodies to discover equivalence. No span-rebasing
sidecar exception is needed for the conservative exact-provenance stage.

Minimal canonical edit set, after release of the source/build freeze:

- `rumoca-phase-solve/src/lower/typed_functions.rs` and `registration.rs`:
  construction-owned specialization lookup before lowering; keep the current
  occurrence registration map and all assertion/result order checks.
- `rumoca-ir-solve/src/typed_program/call.rs`: table-owned immutable body
  definitions, checked body attachment and shared facts where their exact
  contract matches; retain separate owner ID, identity, Span and call site.
- Current Solve schema/version, checked wire encoder/replay and affected
  fixtures: body definitions once, checked references in owners, no old-format
  adapter. Arc alone with inline serde does not reduce the 1.8 GB wire.
- Focused constructor/identity/wire/clone tests and generic shape/profile/capture
  negative controls. Prove one actual body construction/AD derivation with an
  out-of-band test counter, not merely equivalent outputs. Record Tier 1 canary
  evidence before claiming the compiler capability complete.

Backend sharing follows as a separate refinement of this issued relation in
`typed_call/link.rs`, `typed_call/program.rs`, `typed_call/emit.rs`, Cranelift's
typed-program compiler and the C typed-call view. Preserve per-owner entries,
fault contexts and successful-result cache storage. WASM implementation sharing
requires body-local failure locations resolved through the exact owner context;
redirecting to a representative helper with its baked fault offsets is invalid.

**Body storage sharing alone does not remove the fault cap:** 109 records per
distinct owner still scale linearly in the existing app artifact. Code sharing
may remove the module-size growth but cannot silently alias fault owners. The
next full-frame path should therefore establish source-owned compact families
and domain-point fault context, or specify a new generic compact fault-inventory
profile with matching checked compiler/app support. Merely raising limits,
dropping checks or merging owner identities does not establish admission.

The [actual original-function proof](modelica-fast-patch-verification.json)
now confirms 109 helper faults (111 including whole-program statuses), a
13,178-byte native module and 5,872 scratch bytes for the original 7×7
FastPatchScore function selected by a probe wrapper. Its independently compiled
score-floor edit has the same fault/scratch counts and a 13,186-byte module.
Both pass 276 combined raw-bit checks in Node and dedicated Chromium workers,
with reset, readonly inputs, invalid-buffer atomicity/recovery and an IndexedDB
reload. This confirms the static local count for actual function artifacts,
not the unchanged 160×90 source's admission or whole-table body equality.
The full-frame attempt independently hit the 8 GiB resource guard before a
native artifact; it does not establish which opcode, size limit or phase would
refuse next. Keep current limits and both proof scopes explicit.
