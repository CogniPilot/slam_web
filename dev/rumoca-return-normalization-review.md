# Returning-branch predicate preservation

Read-only source review, 2026-10-05. No compiler edits or builds. The source
controls below are staged, **unrun**. This identifies a structural semantic
defect in the old normalization, not a measured current executable failure or
proof that a particular public backend admits these functions.

## Concrete defect

`construction/analysis/function_returns.rs:120` takes a non-leading `if` whose
arms all end in `return`. It creates a generated return predicate by combining
every source branch predicate into a normal `OpBinary::Or` tree
(`disjoin_conditions`), then evaluates the original source predicates again
to select the returning body (`guarded_blocks`, lines 145–163).

An ordered source `if` evaluates conditions until its first true arm. Replacing
this with ordinary Boolean arithmetic does not preserve that evaluation
schedule. In particular, `constant/function_eval.rs:1360` evaluates both binary
operands. The separate top-level flat evaluator has some short-circuit constant
rules; those do not establish lazy statement semantics for function execution
or every downstream projection. The generated normal binary expression adds
an inactive gather/call/fault dependency and duplicates source predicate
evaluation. Neither late backend optimization nor a proof that the entire
Boolean result is true repairs the source-owned evaluation/cardinality contract.

A second instance occurs after an earlier return: later returning bodies use
`active and originalPredicate` (`and_condition` at line 152). The generated
return-definition RHS is protected by an `Expression::If`, but that does not
protect the separate body-selection predicate from an eager read when
`active=false`.

## Exact regression source and oracle

[source.mo](artifacts/return-normalization-review/source.mo) provides two generic
functions with independent whole-output definitions in each returning arm.
A harmless prefix makes both exercise non-leading normalization.

For **both** `OrderedReturningElseif` and `InactiveLaterReturn`:

| Arguments `(first, samples, k)` | Required source behavior |
| --- | --- |
| `(true, {5}, 2)` | Return `1`; the out-of-range gather is never evaluated. |
| `(true, {5}, 1)` | Return `1`; no later returning body or tail runs. |
| `(false, {5}, 1)` | Return `2`. |
| `(false, {-5}, 1)` | Return `3`. |
| `(false, {5}, 2)` | Selected out-of-range gather faults. |

Preserve the fault control: a test that substitutes a safe gather or recompiles
an independently specialized true arm would not qualify the normalization.
Use unsettled source inputs or directly exercise the normalized function plan.
Compare original function execution and the issued/lowered normalized plan;
original source interpretation alone does not exercise the defective rewrite.

## Required normalized mapping

1. Snapshot each selected arm at its original execution site, with an explicit
   generated Boolean definition whose RHS is a lazy conditional on prior
   continuation/arm selection. If execution already returned, no original
   predicate, gather or call may execute.
2. Select returning bodies from those captured keys, not by reevaluating source
   predicates. A later arm definition must be lazy after an earlier selection.
3. Compute returned/continuing flags only from initialized generated Boolean
   reads. Ordinary `and`/`or` of those total reads can be valid; this does not
   authorize `and`/`or` over arbitrary source predicates as a laziness rewrite.
4. Map each definition key to its corresponding specialization-local runtime
   value and source provenance. Do not recover definitions by `Empty` marker
   span lookup: the current old planner at `function_bodies.rs:541` does that.
5. Preserve source statement order, reachable prefixes, return output
   definedness and selected assertions. A false arm's faulting predicate must
   not become a prerequisite for the complete tuple. Return/break inside loops
   remain refused until their distinct control-flow owner is qualified.

The new snapshot module currently handles loop-containing conditionals, not
early returns. Its lazy captured-arm pattern is reusable, but retaining source
`Return` leaves does not implement this return normalization by itself.

MLS 3.6 [§11.2.6](https://specification.modelica.org/maint/3.6/statements-and-algorithm-sections.html#if-statement)
specifies ordered first-true branch selection; §11.2.5 links the function return
semantics. SPEC0007 keeps structured function control and source cardinality;
the DAE/Solve branch ownership contracts must preserve it through projection.

## Inspected source SHA-256

| Compiler-relative path | SHA-256 |
| --- | --- |
| `crates/rumoca-phase-dae/src/construction/analysis/function_returns.rs` | `0419ed5d13c1fecfe1db5bd65daef72db2f80d83a6b862bad083a86742b795c7` |
| `crates/rumoca-phase-dae/src/construction/analysis/function_bodies.rs` | `74c001e40182540f566a8734dceae6656e39cfb3b8a5888e956ff4ebe307ca03` |
| `crates/rumoca-eval-flat/src/constant/function_eval.rs` | `7bf933e5b1230e08397b5a72e5b5fc7a0351c50ac31e8ecaa184b462c250079f` |
| `crates/rumoca-phase-dae/src/function_normalization/snapshot.rs` | `f13d932fde4a854fb0070a5b0f504d212a55f0834f402e6e93da139f353e2ae3` |

## Mounted narrow fix review — 2026-10-05

Root mounted the production fix and regression tests after the initial review.
`disjoin_conditions` now constructs an ordered `Expression::If` with true
values for selected arms and false fallthrough. `and_condition` now constructs
`if left then right else false`. All three callers of the latter helper form
compiler-generated continuation/remaining predicates, not a replacement of
user-authored Boolean operators. The rewrite therefore makes the intended
algorithm activation explicit without changing the user's ordinary `and`
semantics. Source predicate subtrees and source spans remain attached; no guard
identity, function output definedness or construction checks were weakened.

Read-only inspection found no new semantics/ownership regression in this narrow
change. The five predicate unit tests execute through `eval_function`, which
actually evaluates both operands of ordinary binary expressions, rather than
the generic flat `eval_expr` path whose constant short-circuit rules masked the
earlier defect. Root reports the corrected before-fix run reproduced two
inactive `IndexOutOfBounds` failures and the after-fix library run passed all
774 tests. These are root-reported execution results, not tests run by this
reviewer.

`rumoca/tests/suite_core/function_return_lazy.rs` also uses a dynamic `time >= 0`
predicate to prevent compile-time function evaluation from erasing the return
normalization route. It checks DAE wire round-trip, inactive invalid reads,
selected invalid-read faults, second branches and fallthrough through the
actual DAE/Solve runtime. At this review handoff, root's full native suite gate
is active; no terminal PASS is inferred here.

The narrow fix still computes predicates for the generated return flag and
then reevaluates them for body selection. It retains the old `Empty` marker,
span lookup and generated-name mapping. Eliminating predicate duplication,
using opaque generated keys throughout production planning/construction, and
admitting nested loop conditionals remain separate migration obligations.
No full normalized-tree migration or localization admission is established.

Original reviewed preimages above are preserved. Subsequent source SHA-256:

| Compiler-relative path | SHA-256 |
| --- | --- |
| `crates/rumoca-phase-dae/src/construction/analysis/function_returns.rs` | `249863c9be36ad2ddc6e5a485e6d942f314be9bd79bec4ab0d328223a199ba1a` |
| `crates/rumoca-phase-dae/src/construction/analysis/function_returns/tests.rs` | `eb85e7c30e8c7baad12664856afda811784e5bea3b2a99bf3de35f4e4e7385a2` |
| `crates/rumoca/tests/suite_core/function_return_lazy.rs` | `d219952c165b33c03dc9e4e3f351785619f5d71fc25fe2e613594f80f3bb7659` |

## Canonical runtime test relocation review — 2026-10-05

Root's CLI `suite_core` gate reached its 600-second deadline before the tests
executed. That is not a return-test PASS. Root relocated the controls to their
runtime owner, `rumoca-sim/src/solve_lowering/tests/function_returns`, and removed
the CLI copies/readers rather than retaining duplicate suites.

Read-only comparison against the staged former
`rumoca/tests/suite_core/function_return_checked.rs` verified that all seven
test names remain and all six raw Modelica fixture strings are byte-identical.
The relocated tests retain trailing-return behavior, guarded-return wire/runtime
behavior, partial-output refusal, scalar and record output defaults, the actual
checked-DAE store-shape/default-seed assertions, and partial-return continuation.
The three new lazy-return controls preserve both function variants, the dynamic
`time >= 0` predicate, DAE wire round-trip, inactive/active invalid-index checks,
and positive/negative valid-index second-arm/fallthrough results.

The helper uses `Session::new(SessionConfig::default())`, registers the original
filename and source with `add_document`, and calls
`compile_model_strict(...).into_parts().0`. Inspection of `Compiler::compile_str`
confirms the same default session and strict compilation entrypoint. The facade
also loads optional external/package source roots; these complete in-memory
fixtures do not depend on that facility. Moving them does not qualify those
packaging features and does not weaken their source-to-DAE/Solve return checks.
The helper's parse `expect` fails closed, and semantic failure checks still use
the strict report's failure summary. The owning test module is registered in
`solve_lowering/tests.rs`.

No control, numerical tolerance, selected-fault requirement or strictness loss
was found in this migration. At review handoff, root's new `rumoca-sim --lib`
native-solvers `function_returns` gate is active, under reported source identity
`703539b47fea34eea8cf264f41e00568bc89022558d96e1dc58c86199cb15aff`.
Execution remains unverified here; no compiler/cache writes or builds were
performed by this reviewer. The full normalized-key/localization gaps above
remain unchanged.

Relocated source SHA-256 (old reviewed paths/hashes are preserved above):

| Compiler-relative path | SHA-256 |
| --- | --- |
| `crates/rumoca-sim/src/solve_lowering/tests/function_returns/mod.rs` | `3c881a17dd2da070bdeef93fbbdb29b823ba72f640563346c0a0adff2618a303` |
| `crates/rumoca-sim/src/solve_lowering/tests/function_returns/checked.rs` | `32872f99c4e65d61477aa47827d1ea95d1e244aa5e075fc0a4e9b61fe4c6ad3a` |
| `crates/rumoca-sim/src/solve_lowering/tests/function_returns/lazy.rs` | `b7a560a88288355c2b2aba32ae0a0a9fbf26991711ad8058cee534730021898b` |

## Actual projection frontier and proposed ownership fix — 2026-10-05

Root's `return-lazy-sim-J1gT1m` gate terminated after running ten runtime
controls: **eight passed, two failed** before runtime with projection
`IndexOutOfBounds { index: 2, extent: 1 }`. The reported source identity remains
`703539b47fea34eea8cf264f41e00568bc89022558d96e1dc58c86199cb15aff`;
it is not qualified by that result. Preserve the original constant-index
controls and failures. Root added three complementary dynamic-index controls
in `function_returns/dynamic.rs`; their index comes from a named state only at
runtime. Build session 70171 is active at this review handoff, with no result
yet. Dynamic controls do not replace constant-index acceptance.

### Earliest responsible owner

`rumoca-eval-dae/src/projection.rs:1546`, `Projection::conditional`, unconditionally
walks each guard, each value arm and the fallback to collect conservative scalar
incidence. The Index dispatch around line 493 converts a settled subscript to a
base scalar and propagates `IndexOutOfBounds` from `checked_index` around line
2187. Thus explicit lazy expression semantics do not by themselves make the
*dependency walk* conditionally fault-aware. The existing
`tests/fold_context.rs::specialized_actual_arguments_remain_distinct_and_out_of_bounds_stays_a_refusal`
correctly requires rejection of an unconditional constant invalid call. Do not
weaken `checked_index`, discard that negative control or globally turn address
errors into unknown subscripts.

### Principled projection mode

Use a projection-owned activation fact derived from the checked Conditional
inventory, separate from lexical domain identity: `Guaranteed` versus
`Conditional`. A root starts Guaranteed. Its first predicate inherits the
enclosing mode. Under an unsettled guard, its value arm and later predicates
are Conditional; the fallback is Conditional too. An enclosing Conditional
mode cannot be upgraded by an inner branch. Any settled truth refinement must
come from an exact checked-value owner. Do not specialize Boolean/Real actual
arguments using a cache that currently keys only Integer bindings.

At an individual Index operation, a constant-invalid index under Conditional
mode can conservatively report the base/subscript dependency union, as the
existing dynamic-subscript path does, while leaving the original checked
gather and source fault semantics intact for runtime. Guaranteed reads retain
the current refusal. Restrict the first profile to the precise address fault;
shape errors, malformed IR, unsupported external bodies, recursion limits and
other failures must remain failures. Do not catch an error around an entire
branch and stop: that would omit later siblings, guard dependencies and
additional errors. If a settled literal guard makes an invalid arm guaranteed,
retain rejection; an actually impossible arm may be excluded only with exact
owner proof.

This is incidence analysis, not permission to create a valid runtime scalar
for an invalid address. Subsequent Solve lowering must retain a guarded checked
gather/fault; the actual constant-index runtime tests are required to verify
that. Projection success alone is insufficient.

### Exact cache-owner checklist

Current equality and payload owners do not include activation facts:

| Owner | Current identity / consequence |
| --- | --- |
| `ScalarExpressionDependency`, `model_visited`, `FrameMemo.visited`, `FunctionSummaryCapture.visited` | Expression, field, scalar and lexical DomainContextId. A conditional visit must not suppress a later guaranteed validation of the same node. `visited.rs` dense tiles must preserve any added distinction, not merely its sparse fallback. |
| `FunctionSummaryKey` / `function_results` | Function result plus specialized Integer bindings. Conditional call summaries must not become unconditional address certificates. Preserve actual-argument/frame substitution and success-only publication. |
| `FoldNode`, `completed_folds`, `FrameMemo.folds` | Fold/initial/update/carry/field/scalar and parent lexical context. Enqueued work must retain activation when processed after its parent branch scope has exited; completed conditional results cannot suppress a guaranteed walk. |
| `parameter_fragments::reuse::Key` and recording | Function/expression/field/scalar plus parent context. Imported fragments must be mode-compatible and retain needed Integer bindings/fault behavior. |
| `query::validation_memo::Key` | Invocation-local expression/scalar/binder values. A deferred conditional address is not a successful strict address check and must not enter its success set. |
| `query::guard_memo::Key` / recorded effects | Expression plus full lexical context; effects include pending FoldNodes. Replayed guard checks and pending nodes need compatible activation; nested/caller frame transitions must restore the previous fact. |
| Query-validation child caches and literal-update sweep shortcuts | Must not reuse conditional completion to validate guaranteed reads. Review every completion/publication boundary, not only the top-level function summary. |

Thread the fact through actual/caller frames and deferred Fold work, restoring
it on success **and error**. Keep it separate from recursion membership: adding
mode must not disguise real cycles or allow extra recursion. Either key each
affected successful cache by the exact activation context, or explicitly use
an uncached original walk for that context, including deferred work. Disabling
only one summary cache is insufficient. Do not publish partial/suppressed
walks as complete inventories or invent a domain/binder ID to encode mode.

### Qualification controls required

Keep unconditional invalid selectors and specialized actual-argument refusal;
keep existing failed-fold nonpublication tests. Add the same node first under
a conditional path then unconditionally (and reverse order), same function
at both call sites, nested Fold completion/replay, record-field indexing and
filtered/unfiltered query comparisons. Require cached/uncached equality of
ordered dependencies and errors. Require selected runtime gathers to fault,
inactive gathers not to execute, and settled true/false predicates to retain
their exact reachability. No cache/source validation bypass is proposed.

Reviewed source hashes (read-only; no compiler/cache writes or build):

| Compiler-relative path | SHA-256 |
| --- | --- |
| `crates/rumoca-eval-dae/src/projection.rs` | `30f608d6238c441a3b94f335af5d3368e6c70231d0932d40c017921c146fc9d4` |
| `crates/rumoca-eval-dae/src/projection/fold_graph.rs` | `bac4df162a4a6417415188f166a07ddcbee694a6cebb24143476844194404c41` |
| `crates/rumoca-eval-dae/src/projection/visited.rs` | `9ef4b42fd8a7132c0babda88db4b6c2ace4ee38ca0961537178afd76afa12424` |
| `crates/rumoca-eval-dae/src/projection/tests/fold_context.rs` | `0e9b2477c283342f3f92165f1a64d101e21fbbfa338553ae942e8b6d455efa52` |

## Dynamic runtime frontier: totality versus captures — 2026-10-05

Root's `return-dynamic-hnbpfd/focused.log` completed **two PASS, one FAIL**.
The inactive dynamic control faults with `typed project aggregate element`
while running `orderedReturningElseif`; selected fault and valid second-arm /
fallthrough controls pass. The inactive test stops at its first function, so
this does not establish the inactive result of `inactiveLaterReturn`. Original
constant-index failures remain recorded above. No full acceptance is inferred.

The failure has now crossed projection and reached typed Solve execution.
Read-only inspection identifies two distinct potential hoisting paths:

* **Totality:** `lower/typed_functions/total_conditionals.rs:112` classifies every
  `FunctionValue` as a zero-operand total read. But
  `captures.rs::function_definition_value` demand-lowers a missing definition's
  RHS, or its complete conditional assignment group. It is not inherently an
  already-computed register read. `total_conditional` emits eager enclosing
  `Select` operands in reverse-arm order, so this classification can move an
  unavailable, faulting definition into the enclosing region.
* **Captures:** even when totality declines `Select`,
  `typed_functions.rs::conditional` calls `capture_environment_for` on all later
  operands before emitting its `builder.conditional`. Capture discovery then
  resolves every pending referenced definition via
  `function_definition_value` in the parent (`captures.rs:198`). Its `scope=None`
  path assumes every such definition may be computed there. Correlated
  assignment chains use the same capture mechanism across later predicates,
  every arm and fallback. This can hoist a definition without the Select path.

The interpreter's `eval_conditional` selects only one region. The gather error
therefore does not by itself prove the interpreter eagerly enters both regions:
the offending gather may have been emitted in the parent, including when
preparing captures. The direct dynamic `Index` operation is already classified
non-total. If the failing predicate reaches a direct Index without an
intervening FunctionValue, attributing it solely to that totality rule is
unsupported.

### Discriminating trace

For the faulting gather, record its exact DAE expression ID/provenance and every
intervening FunctionDefinition ID, RHS and correlated-group membership. Match
it to the emitted typed Project's containing region and operation order. Then
identify whether it was emitted by `total_conditional`'s expression demand or
by `pending_definitions` resolution before Conditional construction. These are
different compiler owners even when they reach the same resolver. A branch
containing only eager Select operations implicates totality; an enclosing
Project before a real Conditional with its result captured implicates capture
materialization. Root's actual DAE/typed trace is still needed to attribute the
observed case; neither hypothesis is claimed proven by this review alone.

### Safe repair boundaries

An already available, dominance-valid FunctionValue register can be a total
read. An unavailable definition cannot be called total merely because its
target is a scalar: its RHS/group may perform a checked gather, call, assertion
or conversion. A structural conservative refusal is safe; any availability-
sensitive totality memo must account for its region/definition environment.
Recursing through one RHS alone is insufficient if the resolver executes a
complete correlated tuple/group with other faulting members.

Capture discovery must distinguish completed dominating values from
branch-owned/unexecuted definitions using checked source/DAE ownership. It
must not resolve all missing definitions in a parent merely because they share
a lexical function scope. Conversely, do not indiscriminately move earlier
source assignments into a branch: an unconditional assignment with a faulting
RHS must still fault even when its value is unused by the selected arm. Preserve
correlated tuple atomicity, exact definition types/coercion, assertion slots,
call cardinality and existing preceding-sibling Fold capture reuse. A change
only to FunctionValue totality is not proof that capture hoisting is fixed.

No compiler/cache writes or build by this reviewer. Inspected SHA-256:

| Compiler-relative path | SHA-256 |
| --- | --- |
| `crates/rumoca-phase-solve/src/lower/typed_functions.rs` | `dffcdd53cf38baa69b0bb3a8d3677f0c0ed3547b4979df7fd5fb24f860a72621` |
| `crates/rumoca-phase-solve/src/lower/typed_functions/total_conditionals.rs` | `2289a4bd6b5d1cd76e37c2deeb293560cd6e9ab49588a891cb33c9ac35c9c757` |
| `crates/rumoca-phase-solve/src/lower/typed_functions/captures.rs` | `7492120d9b1997fbffacc067ad28129d9e2c06b43cc579f7914c2a3725b4dbd7` |
| `crates/rumoca-phase-solve/src/lower/typed_functions/regions.rs` | `42be53c965e67d378ef993357880cb9b85304fc16bfd4ac021b7249a4b538a68` |
| `crates/rumoca-sim/src/solve_lowering/tests/function_returns/dynamic.rs` | `7570759102e07f88a8aea4e7b9bd5ca24ae44bc5ed4549b9f4290f4a63a39199` |

### Competing harness explanation from actual checked trace

Root's raw trace `REIfPx` shows direct Index nodes 8/17, no intervening
FunctionValue between the relevant predicate and gather, a lazy five-operand
generated-guard RHS13 and correct conditional-group conditions14/19. This
undercuts attribution of that RHS to the FunctionValue-totality rule: a direct
dynamic Index is explicitly non-total. If its capture roots consist of loaded
parameters and available earlier values, capture preparation does not hoist
that gather either. The two source-review risks above remain unproved generic
risks, **not the demonstrated cause of this failing control**.

`lower/scalar.rs:1277` replaces registered model relations with buffered P-slot
reads (unless a noEvent context applies). Root notes `eval_dae_at` does not
initialize event Boolean history. Consequently the original `time >= 0`
argument can read a false buffered flag even at time zero, making the gather
correctly selected despite the test expecting an inactive arm. The test did
not independently establish the Boolean received by the function. A corrected
control keeps the same functions and runtime index but supplies an explicit
`input Boolean first` through `SimOptions.initial_inputs`. Root session96757
is active at this handoff; no result is inferred.

The raw checked DAE trace is the evidence here. Root identified loss of
greater-than-2^53 SourceId precision in a Node-parsed/reserialized JSON copy;
that copy is not a canonical wire preimage and must be replaced by the original
wire string. The table's `dynamic.rs` hash is its earlier inspected version:
root changed this file between this review's reads to add the explicit input.
The other four typed-lowering hashes remained stable. Preserve the original
failure and fixture version rather than relabeling it as a tested corrected
control.

| Subsequent compiler-relative preimage | SHA-256 |
| --- | --- |
| `crates/rumoca-phase-solve/src/lower/scalar.rs` | `36e247b2d2cc7f1a2b4eb2e2aff02b3924b79184b429e21b87f0b84e2d1597e5` |
| `crates/rumoca-sim/src/solve_lowering/tests/function_returns/dynamic.rs` | `2e871faa25abb5d1fdad7eb29c50267ff2b653f0c6d1eb9db35e848ed6aca31a` |

## 2026-10-05 corrected runtime/browser result and independent projection review

Root's explicit Boolean-input dynamic gate `91UkXv` passed all three controls
(eight evaluation cases). This resolves the earlier dynamic failure as an
event-buffer test-harness defect; it provides no reason to change typed
totality or capture lowering. The corrected constant-index helper also uses
an explicit Boolean input, preserving its original invalid-index controls.
The raw checked-DAE wire was restored without parsing/reserializing SourceIds.

The frozen compiler source manifest is
`9f238178dd92cf0784e49faeb4bf232352db552a9f9a20dd91247f7878031920`.
Root's [summary](artifacts/return-predicate-execution/summary.json) records
774 library tests passed; 13 runtime controls ran, with 11 passed and two
constant-index controls failing during dependency projection before runtime;
one emitted SolveIR WASM test passed. Scoped Sim/bind strict checks and formatter
passed. This aggregate qualification remains **failed**.

The [actual Chromium report](artifacts/return-predicate-execution/browser-report.json)
records six calls to the source-issued 1,987-byte module, SHA-256
`d78b304796a777b7deec263d7dd85d7570ee55e27701c1e15398aced3700ddd4`:
inactive invalid gathers skipped, selected invalid gather returned status 7,
failed output commit was prevented, input bytes remained unchanged, and a
following valid call recovered. The report is scoped to one module in a Blob
worker. It does not qualify constant-index projection, production normalized
consumer migration, connected localization or full SLAM. This review did not
run a compiler, simulation or browser.

I independently read the private conditional-projection proposal
[review](artifacts/conditional-projection/review.md) and
[patch](artifacts/conditional-projection/activation.patch), SHA-256
`d836caaa843f82a726eb4cb3944cbe3f967acc7ae505890b7115e87e879fb2d6`.
All 24 copied preimages/postimages matched its manifest,
`4bd0f5a5057d511d17146aa5c879fc41961c6475138e57a287f0393127048185`.
These identities describe the reviewed candidate before its pending
call-argument repair; subsequent proposals require new bookends.

The ordered literal-guard walk and scoped `with_activation` preserve enclosing
activation on success and ordinary error. Activation is distinct from lexical
domain and recursion identity. Visited membership, function summaries, deferred
and completed folds, imported fragments and guard caches distinguish the two
modes. Payloads retain read mode; guard replay re-captures that stored payload,
while fold drain scopes the stored node and restores its parent context.
Conditional address checks cannot publish strict validation-memo success.
Specialized Integer bindings retain their existing cache isolation; conditional
unbound Integer selectors use conservative incidence rather than claiming an
address proof. Literal-update profiles record relative guard modes and replay
them within the enclosing mode, retaining first-true literal reachability.
I found no specific additional blocker in these inspected paths.

The proposal defers only a conditional `IndexOutOfBounds` address operation
through the existing conservative base/subscript union. It does not suppress
arbitrary Integer overflow, domain errors or unsupported operators. Source
identity, field layouts, array extents, scalar counts and the executable checked
gather remain unchanged. Wider unions and separate visits for the two modes can
increase retained dependency/storage counts; this review gives no measured
performance or memory result. The proposal's cached/reference controls share
the new activation walker, so they establish optimization equivalence only
after execution, not an independent runtime oracle.

One concrete blocker was identified: formal read activation is not actual
argument activation. At a guaranteed `f(first, samples[2])`, evaluating the
argument is guaranteed even if `f` reads that formal only in a later arm. This
differs from `f(first, samples, 2)` whose gather occurs inside the callee's
conditional. In the reviewed candidate, `apply_function_summary` projects an
actual under the captured formal's mode; the direct `FunctionFrame::Actual`
path also projects only a demanded formal scalar under the callee's current
mode. Neither validates every guaranteed-call argument separately.
`query_free_arguments` excludes Index/Call/compound actuals and therefore does
not supply that missing proof. Record-result and unused-formal cases require
the same distinction. A separate strict actual-expression validation owner
must preserve caller scope, fault order and query filtering, while conditional
formal usage can still qualify result incidence. Root and the proposal author
are adding independent guaranteed-call versus guarded-whole-call controls;
their results and the repaired patch are pending at this review.

## 2026-10-05 executable actual-argument triage

Root's new production Sim argument controls ran **one passed, two failed**.
The original checked-DAE wire in
`$HOME/scratch/slam_web/tmp/return-arguments-trace-rzhdTa/checked-dae.json`
has SHA-256 `80e02c943418120e0fb9c9dab4c1094a68d29969868b411e0971d4bf1f2a84fd`.
Root reports Index expression 44, runtime Integer selector expression 38,
and Call 45 retaining that actual argument. With `first=true`, state index 2
and extent 1, evaluation returned 1 without an error. The DAE therefore has not
erased the problematic actual. This review is source inspection, not execution
of that wire or proof of the precise emitted Solve operation sequence.

Two distinct responsible paths are visible:

1. `lower/scalar/functions.rs::emit_typed_pure_call` returns `None` for an
   ordinary nonrecursive, nondirectional continuous call before packing its
   actuals (line 4194 at the reviewed preimage). `function_call`, aggregate
   `pack_function_call` and record-result fallback then install expression-ID
   argument frames and lower assertions/results. `function_parameter` performs
   demand substitution in caller scope; it suspends callee activation, but
   only when the formal is demanded. There is no mandatory actual-evaluation
   result in that fallback. Merely emitting unused packed registers would
   not suffice: `PreparedLazyRowPlan` evaluates demanded outputs and selected
   `Select` arms, so unreferenced argument work could still disappear. The
   plan is used only for eligible rows with at least 64 operations; smaller or
   ineligible rows execute the fast/checked linear walk. Consequently the
   observed `first=true` result alone does not distinguish an omitted gather
   from an executed gather whose error became NaN.
2. `lower/scalar/arrays.rs::dynamic_scalar_index` issues
   `LinearOp::LoadIndexedRegister` for a runtime selector over a packed base.
   The lazy (`lib.rs:2031`), checked (`2389`) and fast (`3140`) evaluators all
   turn `tensor_register_offset(None)` into NaN. The checked evaluator's
   `set` checks register storage, not numerical/index validity. A selected
   invalid gather can therefore reach a comparison as NaN and take a normal
   fallback result. Indexed carried/capture loads have the same conversion.
   These are execution defects independently of whether unused pure actuals
   may be omitted. `prepared/dependency.rs::op_can_fail` also omits these loads
   under the current non-faulting implementation; changing their fault behavior
   requires that owner to be updated along with checked/fast/lazy execution and
   trace/specialization reuse.

The reusable repair belongs to these owners. Runtime load-address resolution
must return a checked, source-associated index fault rather than a NaN value,
before reading or committing an output. Do not blanket-change every `None`
from update-selection helpers: a nonmatching update coordinate legitimately
means “retain this element.” If a checked call promises eager numeric actuals,
its scalar fallback must preserve an explicit executed call-boundary obligation
under the call site's activation, not a callee arm's activation or an unused
register. That obligation must remain visible to lazy dependency planning,
AD, fault classification and selected-region execution. Use the existing typed
call owner when its derivative requirements are met; removing the nondirectional
fallback globally is not a safe isolated fix, since `ad.rs::lower_pure_call`
requires a directional owner unless every input tangent is proven zero.

The canonical typed path differs. `typed_functions.rs::call_arguments` lowers
each nontext actual before `builder.call`; typed interpretation checks
`ProjectElementDynamic` using `select_modelica_element` and returns a
`project aggregate element` error. Native `typed_call/emit.rs::dynamic_index`
emits an issued IndexBounds status before the read, and `typed_call/calls.rs`
copies the entire input tuple before calling, propagates failure and transfers
no result tuple after failure. The scalar exec-WASM emitter explicitly refuses
`LoadIndexedRegister`; it does not silently give that scalar row the typed
backend's semantics. Existing passing native return controls use an array and
index as separate formals, with the gather inside the callee. They do not prove
the new faulting-actual call-site control. That new native/source test is needed.

Normative precision matters here: [MLS §3.3](https://specification.modelica.org/maint/3.6/operators-and-expressions.html#evaluation-order)
permits omission of values that do not influence a result, while guaranteeing
selected if branches. [§12.2](https://specification.modelica.org/maint/3.6/functions.html#function-as-a-specialized-class)
binds read-only inputs; it does not specify left-to-right faulting of every pure
actual. Therefore the requested stricter actual-fault policy is consistency
with Rumoca's checked-call execution contract, not an unconditional eager-order
claim from MLS. A demanded invalid gather becoming a normal value remains a
clear mismatch. SPEC_0007/0040 require semantic ownership in Solve lowering;
SPEC_0032 retains aggregate-native runtime access; SPEC_0029 keeps evaluator and
compiler responsibilities separate. No constructor/cache validation bypass,
source-specific rewrite, interpreter replacement or backend change was made
by this review.

| Reviewed compiler-relative source | SHA-256 |
| --- | --- |
| `crates/rumoca-phase-solve/src/lower/scalar/functions.rs` | `819af071f4e5eb08037314cec853aa497edae1d76fa110f879491564aef0de0f` |
| `crates/rumoca-phase-solve/src/lower/scalar/arrays.rs` | `1ac70f34e88f7b67a9e2c0a54720c6658dd585daf19861e8462ad343abd62ca0` |
| `crates/rumoca-phase-solve/src/lower/typed_functions.rs` | `dffcdd53cf38baa69b0bb3a8d3677f0c0ed3547b4979df7fd5fb24f860a72621` |
| `crates/rumoca-phase-solve/src/ad.rs` | `9482a46180ca98163f7591b07fff7a686b49430aa1f3ab081a444b474faeb4d1` |
| `crates/rumoca-eval-solve/src/lib.rs` | `97d6463b7570328695ba38da544fddf37260e6f84dd36de006d631b665d4b610` |
| `crates/rumoca-eval-solve/src/prepared/dependency.rs` | `e376ddc0d3562d8a7e366996c2f1ee64fb55f04ea02757bac3f8a37408e90fdc` |
| `crates/rumoca-exec-wasm/src/typed_call/emit.rs` | `cd2a1698ecbef1933fda50544af7a8c681e80ad482dc85e0cbe23b8987610624` |
| `crates/rumoca-exec-wasm/src/typed_call/calls.rs` | `a581fc36284f5ff7bd10b4d8304404e56419e57871332b932a8487e78f767708` |

The corrected private projection proposal was subsequently reviewed at patch
SHA-256 `1a18884cd00c002a52bab4a7485dabfb6b5a006af32ee5fcd629c2c23183faa9`.
All 26 copied preimages/postimages match manifest
`81c75d358cad31bfde288a77908410b066501f86c35a7e247438e2ff713c3ec2`.
Its separate `validating_actuals` role restores on success and error, suppresses
incidence/parameter publication, and bypasses visited/fragment/address/guard
memo shortcuts and completed-fold reuse. Structured actual Array/Record/Field
and Index values retain their address obligations without changing result
incidence. The same ordered conditional walk scopes actual and result reads.
Original caller Integer proof requests remain owned by the caller summary.
Available Coordinate/Literal aggregate values skip scalar enumeration.

The added controls encode expected strict scalar/unused-formal/record-sibling/
Field/record-result refusals separately from a gather internal to a callee,
cover cached/direct order, and retain relevant/excluding-coordinate queries.
I found no further concrete blocker in this candidate by inspection. Produced
array Call/Fold actuals still validate all scalars with shortcuts disabled:
repeated nested body or domain walks may be costly and need measured
qualification. These new controls and runtime/compiler gates remain unrun at
this review. This address-projection repair does not resolve the independent
scalar demand/fault mechanisms documented above.
