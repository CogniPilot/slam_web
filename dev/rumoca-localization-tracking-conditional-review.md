# Localization tracking conditional: read-only triage

Status: concrete connected-source refusal inspected; minimal reproduction and
fix below **not executed or applied**. No compiler/source/cache/build mutation.

## Actual failure and first owner

Root's actual native preparation failed in **ToDae**, before Solve/native
codegen, with:

```text
unsupported Flat semantic owner `function conditional`:
`RGBDLocalizationTracking` requires assignments or nested conditionals in every checked branch
```

The preserved input is `$HOME/scratch/slam_web/tmp/rgbd-core-daA5p4/source.mo`,
SHA256 `97f44b0e4650a83da5c7812b271460e7e2fef9a06a4bc46080ed81a1585dba02`;
the actual failure is in that directory's `preparation.log`. Its function
matches `models/RGBDInertialLocalizationStep.mo:108` onward. The source has an
outer feature loop, then the runtime branch below (abridged only here):

```modelica
for i in 1:size(index,1) loop
  valid := /* runtime feature-index checks */;
  partner := if valid then integer(index[i]) else 1;
  if valid then
    valid := SLAMExactRealEqual(currentEnabled[partner],1.0);
    for coordinate in 1:2 loop
      valid := valid and /* old and current pixel-coordinate checks */;
    end for;
    if valid then
      currentPixel[i,:] := currentPixels[partner,:];
      referencePixel[i,:] := oldPixels[i,:]; enabled[i] := 1.0;
    end if;
  end if;
end for;
```

The emitted diagnostic has one exact producer:
`rumoca-phase-dae/src/construction/analysis/function_conditionals.rs`,
`validate_conditional_branch_shape` (approximately lines 490–555). It admits
assignment/record/multi-output/assertion plans and recursively checks nested
conditional plans. A `For`/loop plan falls through to this diagnostic. The first
source statement with this forbidden shape is the coordinate loop inside the
outer `if valid`; the log does not print its span or post-normalization plan, so
that precise surviving-plan attribution is a source-path conclusion, not a
captured IR dump.

## Why the existing normalizers cannot settle this shape

`function_bodies.rs::validate_statement_function` calls
`normalize_function_returns`, then `compact_function_loops`, then checks
top-level statements and their definitions.

`function_returns.rs::snapshot_loop_conditional` already supplies the required
semantic technique for a top-level conditional with loops: snapshot ordered
branch selection in generated immutable Booleans; hoist the branch's prefix
through its last loop as guarded statements; preserve its loop-free remainder
as one conditional. However `normalize_function_returns` calls this helper only
on each statement of the input sequence. Its generic case clones the whole
outer `For`; it does not normalize that loop's nested statement sequence. The
tracking conditional is inside this outer `For`, not at the function's top
level.

`loop_compaction/mod.rs::push_invariant_conditions_into_loops` does traverse
nested loops. It deliberately declines predicate pushdown when the condition
reads a value assigned in its branch. Here the condition reads `valid`, and
both the branch prefix and its coordinate loop assign `valid`. That refusal
protects semantics: evaluating the original predicate again after its first
write would change which remaining statements execute.

The subsequent `function_conditionals.rs::resolve_conditional_branch` has no
runtime-branch compact transition owner. Its comment explicitly documents that
loops cannot be embedded in its expression-branch owner. Furthermore
`collect_branch_targets` currently does not collect loop-owned targets. Merely
whitelisting a `For` plan would therefore neither prove the full target tuple
nor provide a checked lowering for its loop-carried values.

## Normative grounding and classification

[MLS 3.6 §11.2.6](https://specification.modelica.org/maint/3.6/statements-and-algorithm-sections.html#if-statement)
selects a branch by evaluating its conditions in order, executes its selected
statement body, and gives unselected bodies no effect. A body may contain a
`for` statement; §11.2.2 defines its ordered iterations. §11.2.1 defines
sequential assignment. Changing `valid` *inside* an already selected branch
does not retrospectively terminate that branch. Array element/range writes
are allowed; output arrays here are explicitly initialized to zero first.

Accepted Rumoca contracts supporting a compiler fix:

- SPEC_0007 §Flat/DAE stage contracts: function algorithms remain structured,
  with checked shared-branch correlation; loops retain `FunctionFoldProgram`
  compact owners.
- SPEC_0040 DAE-C20: one checked conditional owns ordered conditions, complete
  type-compatible branch tuples and shared correlation. Downstream phases must
  consume that owner rather than infer control flow.
- SPEC_0032 §4: range-preserving owners and runtime aggregate indexing remain
  compact; do not expand 350 or 2 iterations into a substitute scalar IR.
- SPEC_0022 ALG-018 already describes loops inside conditional branches as
  statements guarded by the branch's immutable guard, with the loop-free
  remainder remaining a conditional.
- SPEC_0033 §2–3: fix the first divergent owning phase and retain actual source
  evidence. SPEC_0008 requires an explicit acceptance boundary for refusals.

This is valid Modelica beyond the current checked runtime-conditional profile.
The current validator is enforcing its documented owner boundary; a fix needs
to extend the source-owned normalization/transition proof, not delete that
boundary or move the algorithm into the app.

## Minimal general source reproduction (unrun)

The mutation is deliberately read after the branch. Inputs remain runtime
values. A literal copy is staged at
`dev/artifacts/rgbd-localization-tracking-triage/MutableNestedGate.mo`; its
actual compile result is still unrun by this reviewer.

```modelica
function MutableNestedGate
  input Boolean mask[2];
  output Real y[2];
protected
  Boolean valid;
  Real s;
algorithm
  y := zeros(2); valid := false; s := 0.0;
  for i in 1:2 loop
    valid := mask[i]; s := 0.0;
    if valid then
      for j in 1:2 loop
        s := s + 1.0;
        valid := false;
      end for;
    end if;
    y[i] := if valid then s else -s;
  end for;
end MutableNestedGate;

model MutableNestedGateProbe
  input Boolean mask[2] = {true,false};
  output Real y[2];
equation
  y = MutableNestedGate(mask);
end MutableNestedGateProbe;
```

Expected `{true,false}` gives `{-2,0}`; `{false,true}` gives `{0,-2}` and
`{true,true}` gives `{-2,-2}`. A faulty live-predicate rewrite gives `-1` on a
selected arm, because the first iteration sets `valid=false`.

## Proposed general repair and required controls

Extend the existing compact loop-conditional normalization to nested lexical
statement sequences, retaining a branch-selection snapshot **inside the
enclosing loop iteration**, not a function-entry Boolean. Reuse generated
guard/source identity and checked tuple/carry machinery. Preserve first-true
elseif priority, fall-through seeds, dynamic index lazy evaluation, later reads
of mutable locals, source fault ordering and complete conditional target joins.
If the current generated-definition plan cannot represent the nested lexical
scope, add that checked transition owner first; recursive traversal alone is
not sufficient proof. Never use a model/function name or a `valid` variable-name
special case.

Focused controls should cover the minimal source above; false-guard invalid
index remains unevaluated; true-guard fault retains its source identity;
multibranch selection remains frozen after mutation; empty-domain/no-else
fall-through; nested scalar/aggregate writes; mutable loop-carried guard values;
and the existing uninitialized guarded-output negative regression in
`suite_core/function_spd_loop_compaction.rs`. Final acceptance requires the
unchanged connected source and moving RGB-D actual-artifact regression, not
only this small control.

Competing hypotheses rejected by the current evidence: invalid Modelica
`if`/`for` grammar (legal); missing zero output initialization (explicit);
runtime-vs-static dimension admission (`coordinate` has fixed range 1:2);
native-WASM function-size/engine failure (ToDae fails before emission);
descriptor/matching/filter numerical failure (no artifact executes). Runtime
indexed slices may expose a later owner gap, but are not this diagnostic's
first responsible construct. Post-normalization plan/spans should be captured
in the focused reproduction before claiming the fix.

## Audited compiler bookends

The read-only review used these exact file SHA256 values:

| File under `crates/rumoca-phase-dae/src/construction/analysis/` | SHA256 |
| --- | --- |
| `function_returns.rs` | `0419ed5d13c1fecfe1db5bd65daef72db2f80d83a6b862bad083a86742b795c7` |
| `function_conditionals.rs` | `e2e09f6c4f51d68ab4e879a4bb30783b7eea7a24caee13a6af3e7d7b330da5b2` |
| `function_bodies.rs` | `74c001e40182540f566a8734dceae6656e39cfb3b8a5888e956ff4ebe307ca03` |
| `loop_compaction/mod.rs` | `9cb98f18d8a25dc1a100f6754a94ddc10c65a1e2f6f916959fdc77b2502a8426` |

## Implementation guidance: recursive snapshots and their lifetime

This is a proposed change, still **unrun/unapplied**. The minimal safe change is
not to recursively call the complete return normalizer on arbitrary loop
bodies. Its `reachable_prefix` cuts a sequence at `return`; doing so inside a
loop would incorrectly consume a function exit as a local loop exit. Add a
separate recursive snapshot traversal which leaves existing return/break owners
and their refusals intact:

1. Walk the source statement sequence in order. For a `For`, preserve its
   binders, range expressions, span and exact range-evaluation point; recursively
   snapshot its body **at that lexical location**. For a `While`, preserve its
   condition and recursively snapshot its body, then leave the existing bounded
   while proof in charge of whether that loop is admitted. Neither traversal
   hoists a body guard before the loop or transforms an unsupported exit.
2. For an `If` whose branch contains a loop, use the existing
   `snapshot_loop_conditional`/`hoist_loop_prefix` selection strategy, recursively
   visiting a loop body when encountered there. Reuse the same shared guard
   accumulator; do not separately normalize the same source conditional once
   before and once inside the hoisting walk. Loop-free conditionals remain their
   current checked conditional owner.
3. At the original conditional position, assign each generated guard exactly
   once for that execution: `g_k := if remaining then condition_k else false`,
   then update `remaining` by the earlier guards. A surrounding active/return
   continuation guard participates in `remaining` as it does today. Use the
   existing lazy `If` expression for condition evaluation, rather than eager
   evaluation followed by Boolean `and`. That preserves first-true selection
   and skips faults/actions in later predicates after an earlier selection.
4. Guard the branch prefix through its last loop and its remaining conditional
   with these snapshots. Writes to source `valid` are ordinary sequential writes;
   subsequent loop iterations still use frozen `g_k`, and a later source `if
   valid` sees its updated value. A snapshot inside an outer loop is **reassigned
   on every outer iteration**, while staying invariant during an inner loop.
5. Preserve the current early-return continuation and unreachable-source
   validation. Do not reset an enclosing return guard per loop iteration or
   treat a nested return as a local continuation. A prior return guard can be a
   capture of the outer fold; a newly introduced branch guard belongs to the
   iteration where its definition executes. Retain existing typed refusals for
   returns/breaks until their current control-flow owners specifically certify
   the source occurrence.

The current source requires these related owner changes before this traversal
can be safe:

- `analysis/function_bodies.rs::plan_function_statements` recognizes generated
  assignments by an `Empty` source marker and exact guard `Span`. This already
  makes them runtime assignments at their marker position; preserve that
  position, source provenance and exactly one marker per source occurrence.
  The function-level guard catalog is metadata, **not** a function-entry
  evaluation schedule.
- `analysis/function_loops.rs::function_loop_targets` currently ignores
  `GeneratedBooleanAssignment`. Include its target in loop planning with
  correct scalar Boolean type; classify the new target as per-iteration scratch
  only with a dominating whole definition and no escaping/back-edge incoming
  reads. It must not require an arbitrary incoming Boolean seed in the fold's
  carried tuple. `annotate_iteration_locals` currently restricts candidates to
  `context.function.locals`; the checked generated-local catalog must be included
  explicitly, not admitted by a generated-name prefix heuristic.
- `function_body.rs::lower_one_function_loop_statement` has no
  `GeneratedBooleanAssignment` dispatch. Add the counterpart of
  `lower_generated_boolean_assignment` using
  `lower_function_expression_scoped(...,loop_body.body(),binders,...)` and the
  existing checked loop assignment constructor. Without this, the generated
  `Empty` marker reaches `lower_function_loop_assignment`'s `unreachable!`.
- `FunctionDefinitions::forget_varying_guard_paths` currently preserves a
  branch-only proof when its guard references *any* generated Boolean. That
  assumption was valid for function-level immutable snapshots and is unsafe for
  a guard now reassigned each outer iteration. Use the actual lexical
  definition/loop-local ownership to forget correlations across the loop which
  reseeds a guard, while allowing that guard as an invariant capture inside a
  nested loop. Clearing only the guard's defined bit is insufficient if another
  target's branch-only coverage still refers to it. Do not cache true selection
  from one outer coordinate as evidence for another coordinate.
- Generated names currently use a condition source start position;
  `register_generated_boolean_values` creates checked Boolean locals in the
  function reservation and planner lookup uses the complete span. Preserve the
  owning function and source-occurrence identity; deduplicate/reject conflicting
  generated definitions rather than append two snapshots for the same original
  condition. Do not manufacture a distinct guard per scalar iteration: one
  checked local is reassigned by the compact fold at each iteration.

Concrete source-level regression matrix for root's implementation:

| Control | Required result |
| --- | --- |
| Minimal `MutableNestedGate` above, true predicate then `valid=false` during first inner iteration | Both inner iterations run; result -2, not -1 |
| False outer guard with an invalid `a[row]` gather only in its loop body | No gather/fault; initialized output retained |
| Repeated calls and outer mask `{true,false,true}` | Each iteration reseeds its own snapshot; no inherited true/false proof or value |
| First arm true, body mutates a value used by later elseif predicate | Only first arm runs; mutation never reselects later arm |
| First arm true, later elseif predicate includes invalid gather or failing assertion-bearing pure call | Later predicate remains unevaluated; no fault/action |
| First arm false, second predicate fault | Fault/action is retained at that predicate's original source identity |
| Else arm containing a loop, with preceding guards false | Else loop executes once in source order, not alongside an earlier arm |
| Loop-empty domain and no-else branch | No iteration effects; explicit fall-through values retained |
| Top-level early return before a nested-loop conditional | Returned path evaluates no nested predicate/range/body; continuing path keeps per-iteration snapshots |
| Return or unsupported break inside the nested loop | Existing typed refusal remains; no traversal silently erases exit semantics |

The unchanged 350-slot tracking function additionally needs its full source
capture/tracking test after these small controls. A syntactic loop rewrite that
passes the minimal example but leaks a guard's definedness across iterations is
not sufficient acceptance.

### Empty-marker dependency caveat (additional source review)

The existing `Empty`-marker scheme cannot safely be reused by recursive
normalization without addressing source-pass dependencies. The marker's actual
guard expression exists only in `GeneratedBooleanDefinition`, not in its
`Statement::Empty`. `compact_function_loops` runs on this statement tree before
the guard is planned. Its liveness/store-deletion and scalar-local substitution
analyses inspect statement expression reads; they cannot see that the marker
reads `valid`, a loop binder, a gather index or an earlier generated guard. For
example, an apparent dead prefix assignment to `valid` could be removed even
though the hidden snapshot expression must read that exact value. Merely adding
the guard to loop targets later does not restore a deleted dependency.

Prefer **actual compiler-issued Boolean assignment statements** in the
normalized source sequence, with a checked generated target reference and the
lazy guard value as the statement RHS. Continue to register Boolean local type,
function reservation identity and original source provenance through the
existing generated-local owner. These assignments make RHS reads and target
writes visible to the same generic liveness and substitution owners that process
user assignments. Treating the marker plus a side table as an assignment would
instead require threading that side table through every relevant source-pass
visitor; missing even one would retain this defect.

The assignment must still retain the scoped guard-correlation facts and
per-iteration ownership described above. Do not blindly change its plan to an
ordinary assignment until target/type/shape validation can resolve the checked
generated local. Similarly, static guard folding must use the current exact
definition and lexical lifetime rather than expand an old hidden expression
after its source inputs have changed.

Additional controls for this representation decision: the preceding scalar
assignment used *only* by a snapshot stays live; a binder/gather read used only
by a snapshot retains its scope and lazy fault; a source prefix redefinition
does not replace an earlier snapshot with its newer value; identical source
span revisits do not duplicate generated owners. A toggling variant of the
minimal control (`valid := not valid` inside the two-iteration loop) should yield
2 for a true mask and 0 for a false mask; live-predicate pushdown incorrectly
yields -1. This variant additionally makes the mutation a back-edge dependency.
