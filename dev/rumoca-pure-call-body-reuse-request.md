# Generic checked PureCall body reuse request

Date: 2026-10-05. Status: diagnosis and proposed compiler work; no compiler
changes, builds, preparation retries, or numerical validation performed here.

The unchanged full-frame FAST source exposes repeated construction and inline
serialization of one checked function body for distinct source call owners.
Introduce compiler-owned immutable body reuse without merging those owners or
sharing their invocation results, faults, activation contexts, or caches.

## Reproduction and limits

The [retained preparation record](rumoca-fast-native-frame-preparation-verification.json)
and [full-frame explanation](../docs/fast-native-frame.md) bind the original
`models/FastNativeFrame.mo` source SHA256
`d42da6959fee8a629c6a9850fef31559ba692f5bafd3001ba69106200f34ea11` to the
frozen producer and compiler closure. Source remains 160×90 RGBA, with 7×7
patches. The valid interior is 84 rows × 154 columns = 12,936 calls.

The single retained preparation took 247.718 seconds, with sampled peak RSS
7,444,588 KiB. Checked Solve serialization reached 1,822,514,705 bytes before
native direct-assignment schedule certification refused the original
Move-packed scalar residual tuple. No native module was issued and zero
numerical cases ran. That tuple refusal belongs to a separate generic
certification task; body reuse cannot establish its acceptance.

The retained inventory has 12,936 PureCall sites and 12,936 distinct owner IDs.
Only the first two bodies have been compared. Owners 0/1 have identities 1/2,
each owner is 133,377 bytes, and each complete body is 133,037 bytes. Both body
SHA256 values are
`d2d39e281a6e701c2c9d121b749c58b800cd74faac0bd095c52863ee5dc61895`.
The exact body equality is retained in
[representation-summary.json](artifacts/fast-native-frame-compact-calls/representation-summary.json).
These two owners even have the same recorded call span, but their identities
remain distinct. Neither matching spans nor matching names can authorize an
owner merge.

This diagnosis independently rechecked the two body digests using only the
133,377-byte retained owner excerpts and rechecked the model source digest.
The lightweight check ran on CPU 12 at nice 15. The complete Solve JSON was
never opened or parsed. Its retained location is
`$HOME/scratch/slam_web/tmp/fast-native-frame-compact-calls/solve.json`; do not
copy it into this repository. A preliminary bounded Python check could not
start because Python was absent from PATH; the successful check used Perl.

The table starts at byte 96,825,014; bytes from that offset to the end total
1,725,689,691, which includes trailing root data. The extrapolation
12,936 × 133,037 = 1,720,986,552 bytes is a diagnostic scale estimate, not proof
that every body matches. Preparation has no phase callbacks, so no timing
portion can be attributed to body lowering, serialization, or native codegen.

The later [original-function component verification](modelica-fast-patch-verification.json)
issued baseline/edit modules of 13,178/13,186 bytes, each with 109 helper faults
and 111 total faults. Node/Chromium worker execution and IndexedDB replay passed
276 exact raw-bit score checks over 23 independent patches, including the
Modelica `responses[1]` floor edit from zero to one. This supplies complementary
original 7×7 function evidence; it establishes no whole-frame body equivalence,
full 160×90 admission or performance claim.

## Governing specifications and required clarification

Read `../rumoca-native-functions/AGENTS.md` and `spec/README.md` first. This
proposal follows accepted SPEC_0007 (IR pipeline), SPEC_0029 (crate ownership),
SPEC_0032 (compact domains and scalar views), and SPEC_0033 (first divergent
layer, exact identity, current-version wire cutovers, focused validation).
SPEC_0040 is the reference catalog linked by accepted SPEC_0007.

SOLVE-C51 in SPEC_0040 requires one exact call owner, retained ordered argument
identity/context, typed capture ABI, result/predicate order, acyclic ownership,
and coordinate-scoped result reuse. It prohibits consumers from cloning,
hashing, structurally comparing, or rediscovering function bodies and states
that targets compile/render one helper per owner. SOLVE-C52 requires compact
structured conditional/loop regions and earlier-issued nested owners.

Before implementation, propose a narrow SOLVE-C51 clarification allowing a
checked owner to reference an immutable body definition and allowing its
distinct target entry to delegate to shared implementation code. Owner
identity and all invocation obligations remain unchanged. Canonical sharing
must be issued at construction, not reconstructed by a backend. In particular,
the existing C-rendering family heuristic is not permission to perform body
hashing in Solve consumers.

SPEC_0036, SPEC_0045, and SPEC_0048 are DRAFT in the observed index, not accepted
rules. Their construction/storage and occurrence-versus-term directions are
useful design context but cannot silently override accepted requirements.
SPEC_0029 owns SourceId/Span in core and prohibits span-rebasing sidecars; any
new body/occurrence provenance representation needs an explicit catalogued,
typed construction rule rather than an ad hoc diagnostic remapping table.

## Exact implementation ownership

Compiler paths below are relative to `../rumoca-native-functions`. Observed
HEAD was `03e6b59a47f1adc48488b89e4c462c5fa50f3aaf` with an existing dirty tree;
the files were read only. The retained preparation closure, rather than this
observation, identifies the original producer.

| Stage | Implementation pointer | Observed behavior |
| --- | --- | --- |
| DAE identity/signature | `crates/rumoca-ir-dae/src/model/view.rs:720`, `FunctionView` | Provides branded `FunctionId`, effective parameter/result types and declaration provenance; display name is not an identity. |
| Solve registry | `crates/rumoca-phase-solve/src/lower/typed_functions.rs:41`, `PureCallRegistry`; `:218`, `CallRegistration` | Owns one table and a map keyed by exact DAE call-owner `ExprId`. Repeated projections of that same owner reuse its registration; different owners do not reuse lowered bodies. |
| First duplication | `crates/rumoca-phase-solve/src/lower/typed_functions/registration.rs:5`, `register_call`; `:49`, `register_call_body` | For each new owner, registers earlier nested owners, gathers assertions/conditional groups/types, and lowers the same function statements again. The cache is occurrence-level, not function-specialization-level. |
| Checked construction | `crates/rumoca-ir-solve/src/typed_program/call.rs:569`, `SolvePureCallTableBuilder::add_owner` | Creates fresh input/output slots and `TypedProgram::construct_with_calls`, validates the complete output interface, then independently derives directional body, dependencies, projections and affinity for every owner. |
| Body allocations | `crates/rumoca-ir-solve/src/typed_program/program.rs:625`, `TypedProgram` | Stores slots, register types and operations as owned boxed slices, including owned nested structured regions. Its derived Clone recursively copies these payloads. |
| Root storage/wire | `crates/rumoca-ir-solve/src/typed_program/call.rs:165`, `SolvePureCallOwner`; `:459`, `SolvePureCallTable`; `:777`, Deserialize | Every owner has `body: TypedProgram` by value. Derived Serialize emits each body inline. Replay reconstructs and derives facts per owner. |
| Subsequent clones | `crates/rumoca-sim/src/wasm_execution/expressions.rs:223`; `crates/rumoca-exec-cranelift/src/emit/projection_batch.rs:67`; `projection_jacobian.rs:195` | Existing table clones recursively clone owner bodies. The `immutable_lineage: Arc<()>` witness only accelerates equality; it does not share the boxed body allocation. |
| Interpreter checks | `crates/rumoca-eval-solve/src/typed_program/mod.rs:241`, `eval_owner_in_scope`; `:312`, `validate_arguments`; `:1073`, `eval_call` | Validates the complete ordered argument interface before running a fresh frame; result reuse is keyed by owner inside the invocation scope. |
| Native WASM | `crates/rumoca-exec-wasm/src/typed_call/link.rs`, `LinkedOwners::construct_roots`; `emit.rs:26`, `compile`; `:48`, `compile_owner` | Plans and compiles every reachable owner. Input validation and atomic publication are part of each issued helper. |
| Native fault identity | `crates/rumoca-exec-wasm/src/typed_call.rs:29`, `TypedCallFault`; `emit.rs:257`, `fault`; `:335`, `validate_inputs` | Fault records contain owner ID, operation ordinal, region path, opcode, kind and exact Span. Status is globally offset per compiled owner; two owners cannot alias the same fault record. |
| Cranelift | `crates/rumoca-exec-cranelift/src/emit/typed_program.rs:244`, `TableCompiler::new`; `:287`, `compile_all`; `:297`, `compile_owner` | Declares and compiles one function for every primal owner and each available directional owner; per-owner successful-input caches also exist. |
| Existing C reuse | `crates/rumoca-phase-codegen/src/codegen/pure_call_families.rs:50`, `PureCallFamilies::new`; `:144`, `representatives`; `:158`, `family_key` | Serializes all owners to JSON first, removes provenance from key copies, replaces nested owner IDs with callee family IDs, and emits representatives. Saves rendered C helpers, but does not save canonical lowering, wire bytes, table clones or the initial JSON materialization. |

The first duplication is fresh construction, not a clone inside
`register_call_body`. Later table Clone and backend JSON clones add separate
costs. Changing only Clone to Arc sharing cannot reduce inline wire size or
prevent repeated lowering; changing only C representative selection cannot
reduce canonical Solve representation.

## Proposed checked representation

Use two identities owned by the checked call table: a specialized immutable
body definition and an exact source invocation owner. Each owner retains its
current ID/semantic identity and occurrence contract, and references a body
through an aggregate-bound typed handle. The body contains immutable typed
operations/regions and its checked ABI. Finalized allocations can use Arc or
an arena; no mutable body, public unchecked attachment, cross-table handle or
persistent global cache is needed.

Select reuse before lowering in `PureCallRegistry`, from construction-owned
DAE data. A suitable key has all inputs that can change the generated body:

- The exact immutable DAE aggregate and concrete effective `FunctionId`.
  Declaration `DefId`, rendered name and source span alone are insufficient.
  Across independent aggregate builds, derive a new body instead of treating
  process-local IDs as persistent semantic authority.
- Complete effective input/output/capture types, scalar domains, record or
  enumeration identity where relevant, shapes, and ordered result/assertion
  ABI. Equal scalar counts with different dimensions are distinct.
- Arithmetic profile, directional/AD mode and every lowering decision that
  changes the program. Binary32 and Binary64 cannot share executable bodies.
- Exact captured structural values and specialization environment that decide
  extents, domains, constants or branches. Use typed identities and exact
  literal bits. Runtime inputs remain explicit ordered arguments, not cache-key
  samples; runtime values must never become inferred structural constants.
- Earlier-issued nested body/ABI identities and their complete ordered binding
  plan; provenance requirements needed for safe attachment.

An ordinary map over this compiler-owned key may use hashing as an index with
full key equality. A digest alone is never acceptance evidence. Do not serialize
or structurally compare thousands of already-lowered bodies to discover the
key. If any required fact is absent or differs, construct a distinct body.

On a miss, run the existing checked construction once and publish the body only
after all interface, output, structured-control, dependency and directional
checks succeed. On a hit, issue a new owner and check its exact ABI, provenance,
nested bindings and occurrence contract against the body capability. Duplicate
owner identity still rejects before body construction or attachment. Reuse
body-relative dependency/projection/affinity facts only when their certified
inputs and nested bindings match; per-owner facts are still bound to that exact
owner. Failure exposes no partially attached owner or cached failed body.

Keep the original `CallRegistration.calls` map: it establishes that several
projections belong to one invocation. A separate construction-only body lookup
must not replace that map or return another owner's `RegisteredCall` on a hit.

### Provenance and nested calls

A body currently embeds both function-definition spans and call-site spans in
slots, loads and assertion stores. For an initial conservative implementation,
share only bodies with exactly compatible provenance and exact nested owner
bindings. This already admits the two retained byte-identical bodies without
discarding spans. It may safely miss reuse for other occurrences.

For general sharing across different call spans or nested bindings, extend the
checked representation explicitly: retain definition-origin Span values in
the body, and represent occurrence-owned interface provenance through the
exact owner. Every access must resolve the original responsible Span; never
overwrite one owner's spans with those of a representative or apply text/span
offset rebasing. This is a typed provenance contract to specify first under
SPEC_0029/SOLVE-C51, not a second SourceMap or unreviewed sidecar.

Likewise, a shared body cannot retain the representative parent's concrete
nested IDs when other parents require different nested owners. Either require
identical nested bindings for reuse, or introduce checked body-local nested
call ordinals plus each owner's ordered exact callee bindings. Construction
proves each binding has the required ABI/body, is earlier issued and preserves
the existing occurrence context. The interpreter/backend consumes that checked
binding; it cannot rediscover it from shape or callee name. Lazy conditionals,
compact fold/map binders and assertion ordering remain unchanged.

## Wire and backend reuse

To reduce the measured Solve wire, serialize each checked body once in a
body-definition table and store typed body references in owner records. Arc
with the old inline serde shape would still write 12,936 copies. This is a
current-version Solve schema cutover: update version, encoder, decoder and
fixtures together, rejecting the superseded format per SPEC_0033. No legacy
reader/fallback or producer-side JSON rewriting should remain.

Replay body definitions through the same checked constructors in dependency
order, then attach exact owner records with local ABI/provenance/binding checks.
Recompute certificates; do not trust serialized directional/dependency facts,
hashes, counts or lineage tokens. Unknown/foreign body references, duplicate
identities, forward/cyclic nested references and incompatible profiles reject.
The finalized table's clone should retain immutable allocations rather than
clone nested bodies; full equality for independently built roots remains exact.

Targets should consume the issued body relation, maintaining an owner entry
and context while compiling large implementation code once per compatible
body/profile/target ABI. Do not route several owners directly to a helper whose
fault offsets, nested IDs or cache storage were baked for one representative.

For WASM, a viable target refinement is a distinct owner entry plus common
implementation returning a body-local fault description (operation ordinal,
region path and fault kind). The checked owner context resolves it to the
original owner/Span/status inventory and exact nested owner. Preserve the
current external fault contract and success-only output publication. If a
faulting operation's exact context cannot be represented, compile a separate
implementation. Unsupported assertion-predicate output profiles still reject.

For Cranelift, keep successful-input/result caches and their lifetime rules
attached to the original owner and arithmetic profile. Sharing executable
instructions does not grant cache sharing between distinct owners. The C view
can render each issued body once without materializing every body as JSON, but
must preserve the same owner entry/binding/provenance obligations.

Every source call still lowers and validates its entire ordered argument tuple,
including unused inputs and their possible faults. Invalid inputs, inactive
branches, ordered nested effects/predicates, arithmetic checks and exact store
commit order cannot be suppressed by shared code. Body reuse performs no
execution CSE, hoisting, cross-owner result memoization or argument pruning.

## Regression and evidence controls

1. A generic pure function called by many distinct owners with the same
   specialization constructs one body, retains every original owner identity,
   and has equal numerical and fault behavior in interpreter/WASM/Cranelift/C
   supported profiles. Include different call spans and two calls with the
   same span. A constructor-only counter proves lowering/AD derivation really
   happened once; success must not depend only on observing matching outputs.
2. Separate definitions, redeclared/effective types, same-size different shapes,
   integer/enumeration domains, structural capture values, loop domains,
   Binary32/Binary64 and differing tangent profiles do not share incompatible
   bodies. Signed zero/NaN payloads in structural values retain exact bits.
3. Nested parents with the same body but different exact child owners preserve
   those children, invocation counts, ordered predicates and fault paths. A
   dormant faulting branch stays dormant. Repeated projections of one owner
   retain the existing single-invocation behavior without merging two owners.
4. Faults in unused arguments and the earliest invalid Boolean/integer input
   are still observed in source order. Divide/index/conversion/overflow faults
   retain owner, operation, region path, Span and target-visible status. Failure
   cannot publish partial outputs, retained results or another owner's cache.
5. Malformed wire rejects absent/foreign bodies, changed ABI/profile/provenance,
   duplicate owner IDs/identities, swapped bindings and forward/cyclic nesting.
   Replayed facts match independent construction; no mutable sharing API or
   cross-table authority is introduced. Update the current
   `typed_program/call/tests/table_sharing.rs` test that explicitly expects
   different cloned owner allocations when representation changes.
6. Capture before/after body-definition count, owner count, lowered-operation
   count, wire bytes, native implementation count/module bytes and bounded
   preparation RSS/time. Measure original FAST source and at least one generic
   unrelated function fixture. Do not claim all 12,936 current bodies are equal
   until bounded producer-owned evidence establishes that fact.
7. After focused contracts pass, record the fixed Tier 1 MSL canary delta under
   SPEC_0033. A full cohort gate is needed for cohort parity claims. The original
   full-frame native refusal remains visible until its separate source-preserving
   assignment certification work establishes acceptance.

Large outputs, caches and disposable builds must stay under project-owned
`$HOME/scratch` directories; derive paths from HOME, use the existing bounded
CPU/nice/resource workflow, and coordinate all compiler mutations and Cargo
runs with the agent owning the source/build freeze. This document authorizes
no source rewrite, frame reduction, checker weakening, new preparation attempt
or compiler mutation during that freeze.
