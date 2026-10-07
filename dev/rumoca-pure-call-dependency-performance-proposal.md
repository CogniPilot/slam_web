# PureCall dependency performance proposal

Date: 2026-10-05. Read-only design review. No compiler edits, Cargo, preparation
retries, profiling processes or Modelica/source rewrites were performed. The
compiler owner retains the source/build freeze.

The [current unchanged depth preparation evidence](modelica-seeded-depth-map-profile-verification.json)
binds the full 14,400-cell `models/SeededDepthFrame.mo`, SHA256
`c161609d472a93d1417d97c1424c71fbee57009d3452c4cd18de2db9b5187a4d`, to
immutable producer `f189cd3c6019065db1dab7c45cd4e9dcf7438960fe73b64553cf7581206c2072`.
Its one attempt stopped at 180.255 seconds, sampled peak RSS 101,768 KiB,
without Solve/native artifacts or numerical cases.

The actual partial CPU profile has 816 samples and zero lost samples. Identified
self shares are `DependencyWalk::pure_call` 15.20%, `set_register` 12.99%,
iterator fold 10.91%, BTree destruction 8.33%/7.35%, BTree bulk insertion 6.99%,
and `DependencyState::union` 6.13%. The recorder was terminated as preparation
timed out after approximately 9.164 seconds of its requested 12-second capture.
DWARF caller output has invalid/unknown frames: these shares identify sampled
work, not a complete causal chain or proportions of the 180-second preparation.
Raw logs remain under `$HOME/scratch/slam_web/profiles/seeded-depth-map-producer`;
small durable excerpts are linked by the verification record.

## Current exact behavior

Compiler paths here are relative to `../rumoca-native-functions`.
The governing accepted rules are SPEC_0007/SPEC_0040 SOLVE-C51/C52,
SPEC_0029, SPEC_0032 and SPEC_0033. This optimization consumes constructor-issued
dependency summaries and changes allocation work, not source evaluation or
semantic ownership. It needs no new body-equivalence rule, wire schema,
source-name branch or unchecked summary acceptance.

| Location | Contract/cost |
| --- | --- |
| `rumoca-ir-solve/src/structural_pattern.rs:1759` | Primal and directional calls both dispatch to the same `DependencyWalk::pure_call`. |
| `:2471`, `pure_call` | Checks input-start/input-type count and summary/output count first. Then visits every argument range in input order and every cell in ascending offset order, eagerly unioning each complete range, before any output write or summary consumption. |
| `:2508`, `pure_call_output` | For every output element, evaluates the same summary in its stored source order, unions its dependency states, stores the destination and only then checks destination increment. |
| `:2536`, `pure_call_input_dependency` | Checks summary input index, returns precomputed whole input, or derives coordinate elements and reads their current register versions in coordinate order. |
| `:1821`, `get`; `:2996`, `register` | Missing or None register returns `UninitializedRegister { register, span }`. Reads clone the dependency state; production Known clones share an Arc. |
| `:1450`, `DependencyState`; `:1523`, `union` | Empty/Singleton are allocation-free. Known owns `Arc<BTreeSet<usize>>`; adding a new member to a shared set invokes copy-on-write. |
| `:2982`, `set_register`; `:1551`, `into_set` | Register writes grow/replace dense state, dropping old states; conversion to owned BTreeSet uses `Arc::unwrap_or_clone`, which can clone shared large sets. |
| `:1599`, `program_register_y_dependencies` | Finally converts every initialized register to an independent optional owned BTreeSet. This remains a potentially large consumer boundary. |
| `typed_program/call/dependency.rs` and `dependency/operations.rs:51` | Constructor derives summaries once. Pointwise/static projection/matrix relations preserve coordinates. Current generic Fold/Map/region, dynamic-index/update and reduction cases conservatively use whole-input access. |

The two changes below must remain separate from runtime result caching and from
call-body interning. The dependency walk holds register-flow facts, not evaluated
values. DependencySource has five distinct categories: Effect, Seed, SolverP,
SolverY and Time. Fold/conditional capture environments and the current register
versions are also part of this walk's exact context.

## Stage 1: demand-driven whole-input construction

Avoid constructing a complete input union when no issued output summary ever
requests it. Preserve eager validation of every original argument cell,
including entirely unused arguments and unused tails of coordinate-only inputs.

The smallest safe plan is:

1. Keep the existing interface-length check in place.
2. Inspect the issued summaries only to mark which valid input indices request
   `is_whole_input()`. This marking pass must not validate, resolve coordinates
   or return a summary error. An out-of-range summary index is left for its
   original output-element position to reject. No body inspection occurs.
3. Traverse inputs and cells in the original argument/offset order. For marked
   inputs, retain the existing complete-range union. For unmarked inputs, check
   exactly the same register initialization/address sequence without unioning
   dependency sets. A shared borrowed `register_ref` implementation can own the
   existing error expression, with `register` cloning that result; alternatively
   retain `get` and discard its cheap Arc clone for the initial minimal change.
4. Finish every required whole union **before any destination write** and store
   those states in the call-local `PureCallInputDependencies`. No cache survives
   this `pure_call` invocation or crosses a category/context/register version.
5. Keep coordinate-summary substitution and output order unchanged.

This is lazy with respect to summary demand, not late with respect to writes.
Simply computing an input union when the first output requests it can change
behavior if earlier output destinations overlap input registers. The original
whole-input state is a pre-write snapshot; preserve it without assuming an
unproved non-alias contract. No register snapshot vector or cross-call cache is
needed when marked inputs are materialized during the original validation pass.

Address formation currently uses `start + offset as Reg` in
`union_scalar_range`, whereas other helpers use `checked_reg_offset`. This
optimization must not silently change overflow handling or first-error order.
Retain the current arithmetic in the replacement validation path; any desired
arithmetic-contract repair belongs to a separately proven change. Preserve the
coordinate path's existing explicit overflow errors.

## Stage 2: reuse a complete whole-only summary within one output

This is likely more useful for the current depth workload than avoiding unused
input unions. For an output whose summary consists only of whole-input entries,
its dependency result does not vary with the output element. All of its operands
already refer to the call-local pre-write snapshots established in Stage 1.
Compute that ordered summary union once, then set each output destination to a
clone of the resulting immutable `DependencyState`. Known clones share Arc;
Empty/Singleton clones remain allocation-free.

Precise equivalence constraints:

- If output scalar count is zero, return unchanged without resolving the summary,
  matching the original empty loop. An empty summary for a nonempty output gives
  Empty for every element and can use the same path.
- For a nonempty whole-only output, resolve its summary once at the original
  **first element**, using `pure_call_input_dependency` in the original stored
  source order. Invalid input indices therefore reject at the same point, after
  all eager argument checks and any preceding output writes. Whole-only summaries
  never call `input_elements` in the original implementation; do not add it here.
- Keep every destination set and its following `destination.checked_add(1)` in
  the original per-element order. Do not replace this with early total-width
  validation, change which cell is written before overflow, batch all writes,
  or validate later output summaries before earlier ones execute.
- **Any coordinate or mixed summary stays on the original per-element path.**
  Its coordinate mapping may vary by element and its reads currently observe
  live register versions; neither output shape nor coincident source Span proves
  uniformity. Preserve coordinate, contraction and nested-call semantics exactly.
- Scope reuse to one output within one call invocation. No global or owner-keyed
  summary-result map is required. Body identity and equal argument addresses alone
  cannot establish equivalence across writes, source categories or nested contexts.

This avoids repeatedly rebuilding a large whole-input set plus additional scalar
dependencies for every output cell. `DependencyState::union` currently clones a
shared BTreeSet when adding an absent member through `Arc::make_mut`; repeating
that union can dominate even when the base whole-input state is shared.

The actual depth source has one `DepthFrameSample` call with an array input and
a sequential Fold. Current Fold dependency access is conservative whole-input,
so Stage 1 cannot be assumed to omit that array union. There is no completed
Solve artifact to prove its exact emitted summary census. Do not weaken the
summary to pointwise depth dependence: RNG state for a later pixel depends on
the preceding accepted/dropout/invalid-depth decisions. A more exact dependency
relation would have to preserve that prefix and belongs to constructor-owned
compact prefix analysis, not a consumer shortcut.

## Minimal edits and independent regression controls

After the freeze is released, keep the production edit localized to
`rumoca-ir-solve/src/structural_pattern.rs`: whole-demand classification,
ordered validation/materialization, the private whole dependency storage, and
the whole-only output path. Reuse the existing `DependencyState` and checked
summary API. No compiler/body lowerer, Modelica model, backend or wire edit is
needed. Add focused tests below the existing
`structural_pattern/shared_dependency_tests/calls.rs` ownership.

The existing differential harness toggles legacy **DependencyState Clone/union**
allocation semantics only. After changing `pure_call`, both harness paths would
run the new call algorithm, so that toggle alone is not an independent oracle.
Add a test-only original eager `pure_call`/output path or a literal reference
walk, selected with a scoped guard; production has only the new path. Compare
exact output sets and typed errors including register, diagnostic text and Span.

Required controls:

1. Generic 14,400-element coordinate-only, whole-only, unused and mixed arguments.
   The existing `issued_per_element_and_whole_input_summaries_preserve_full_capacity`
   fixture covers identity plus reduction and an unused second input. Assert a
   whole-only union is evaluated once per output, and an unused/coordinate-only
   input is checked completely but never materialized as a whole union, using
   out-of-band test counters; equal results alone do not prove the optimization.
2. Uninitialized first/last cells of unused or coordinate-only inputs; several
   invalid inputs so the original earliest argument/cell wins; interface mismatch
   before register checks; malformed summary indices/coordinates after full
   argument validation. Retain the zero-output, empty-summary and per-cell
   destination-overflow ordering controls where representable by the test API.
3. Deliberately overlapping output/input ranges: a whole dependency requested
   after an earlier output overwrites its input still uses the original pre-write
   union. Mixed/coordinate summaries retain the old live-read behavior. Also test
   repeated calls after a register is rewritten and two owners at equal addresses.
4. All five DependencySource categories, primal/directional calls, nested
   Fold/conditional captures, empty/descending domains and coordinate matrix
   contractions. Preserve existing replay tests that reject forged dependency
   summaries and distinct primal/tangent argument relationships.
5. Sequential RNG and effect prefixes: invalid depth consumes zero draws, dropout
   one and accepted depth three, in source order. The complete original prefix
   stays authoritative. `DependencyWalk::runtime` and
   `apply_runtime_dependency` (`:2359`, `:2888`) keep their category classification;
   no source execution, validation or random-state action is omitted or cached.
6. Keep native assignment's separate all-input numerical-failure checks untouched:
   `refresh/native_assignment/range.rs::independent_call_inputs` checks every
   complete argument against its owned target even when output summaries omit it.
   Existing `compact_call_checks_entire_unused_tensor_argument_range` and original
   prefix tests must still pass. Output sparsity cannot replace this authority.

Run only the smallest meaningful focused suites first and record the Tier 1
canary delta under SPEC_0033, coordinated by the compiler owner. One subsequent
bounded probe of the unchanged full source can measure preparation completion,
summary-demand counters, RSS and exact artifact identity. No retry was run here.

## Costs that remain

Both stages retain O(total argument cells) eager validation. Whole-only outputs
still need every ordered destination write, dense register growth/replacement,
and correct output stores. Coordinate and contraction summaries still perform
their required per-element substitutions. Legitimate whole-input dependence is
not removed.

The current profile also points to BTree allocation/destruction and owned-set
materialization. Stage 2 reduces repeated summary unions but
`program_register_y_dependencies`/`into_set` can still duplicate shared sets into
many independent BTreeSets. A future borrowed/shared consumer or compact exact
dependency representation would need its own ownership and certificate design;
do not fold it into this bounded change without evidence.

This is a general safe optimization proposal, not a proved speedup, completed
full-frame preparation, numerical acceptance, throughput or full-SLAM claim.

## Scratch review patch

After this read-only diagnosis, an explicitly authorized patch was prepared only
in copied files under `$HOME/scratch/slam_web/tmp/pure-call-dependency-review`.
`compiler.patch` SHA256 is
`7c5915578194f71b7686c851ba6c3485c00a34f0c3c9a478f2c2a6f6605b8a6d`.
The sibling compiler remains untouched; no Cargo/compiler/preparation was run.
The scratch README and hash manifests record scope, original preimages and gates.

The patch implements both stages with an independent copied old-eager oracle,
test-only work counters, all five categories, overlapping registers, mixed live
coordinates, register-version changes, directional calls, unused-tail/error-order
and prior-write controls. The 14,400-cell whole-output fixture uses four dependency
indices per cell; the existing unique 14,400-input fixture has only one whole
scalar output. This bounds old-oracle memory independently of the future original
depth preparation gate. Rustfmt, whitespace and patch-application checks passed;
compilation, behavioral tests and performance measurements remain unrun and must
be coordinated by the compiler owner after the freeze.

Review identified that identity-plus-reduction globally demands the first whole
input, so a separate tests-only addendum adds an issued 14,400 identity-only owner
and unused second input. All five categories assert zero whole unions / 14,400
summary substitutions, old-eager parity, coordinate/unused last-cell errors and
their priority when both cells are missing. The bounded addendum is
`$HOME/scratch/slam_web/tmp/pure-call-dependency-coordinate-review/coordinate-tests.patch`,
SHA256 `80dadac7455767b934b42afee56feb79d238ee9b82a24acad5840762a4a77a2b`.
Its preimage is the first patch's modified test file; apply it after v1, whose
hash remains unchanged. Format/whitespace/application checks passed, with no tests
run. The separate opaque register-Y next-stage review is
[rumoca-register-y-dependency-facts-proposal.md](rumoca-register-y-dependency-facts-proposal.md).
