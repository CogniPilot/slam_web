# Checked function normalization groundwork

The `slam-native-functions` branch now contains a compiled, tested phase-wide
generated-local catalog and an explicit recursive function planning inventory.
This is implementation groundwork for the nested conditional/loop blocker in
`RGBDLocalizationTracking`. **Production ToDae consumers have not migrated to
it, and no connected localization artifact was issued. Full SLAM remains
unavailable in the browser.**

The separately qualified FAST detector and its earlier measured improvements
remain evidence for their pinned producer. They have not been requalified with
this newer compiler source. The preview compiler was not promoted.

## Implemented compiler changes

`rumoca-core/src/generated_function_locals.rs` issues opaque keys from actual
function declaration and instance identities plus a dense per-owner ordinal.
A generative lifetime spans the whole planning run, rather than one short-lived
function callback. This permits planning several source functions and shape
specializations inside one outer catalog scope. It keeps runtime DAE value
reservations separate per specialization. Keys cannot escape the catalog or
enter another catalog run; they are not names, fabricated source DefIds,
serialized source references, or source-span identities. Repeated allocations
for the same owner do not restart its ordinal counter. Reservation supplies
registered source provenance but no initial value.

`rumoca-phase-dae/src/function_normalization` represents For, While, If and When
children explicitly. A checked source leaf rejects hidden control flow.
Generated Boolean definitions expose their RHS dependencies and target writes;
source leaves retain their original resolved references. Conditions containing
loops snapshot first-true selection at their original lexical position. Later
elseif predicates remain lazy; definitions inside outer loops refresh there
instead of moving into a preheader. Assertions and exits are retained for the
ordinary semantic owner rather than discarded or newly admitted.

Introduced-local definedness checks reject use before definition, self-reading
initial definitions, duplicate static definition sites, path-partial joins and
loop-local escape. An enclosing snapshot remains available to its inner loops.
Source expression typing, source variable definedness, loop-domain proofs and
DAE transition ownership are still obligations of the production phase owner.
This planning API supplies no numerical executable certificate.

The explicit `NormalizedStatementRewriter` dispatches whole-statement and
sequence overrides recursively. Existing source expression, target and leaf
rewriting remains canonical. A legacy source-leaf override that introduces a
control statement receives an error rather than hiding it in an opaque leaf.
There is no blanket conversion from a source statement rewriter: each scoped
production pass must implement the new hooks deliberately. The new nested-loop
control proves that scope hooks run; it does not qualify the still-pending
production `IndexBinding` adapter.

## Separate production assertion fix

The assertion-only loop control exposed an existing evaluator defect:
`rumoca-eval-flat` skipped both `Statement::Assert` and the built-in `assert`
call spelling. A selected false assertion therefore returned the following
function output instead of failing. The producer now evaluates the condition,
aborts selected default/error assertions with their message and statement
provenance, and skips message evaluation for true assertions. False warning
assertions return `NotConstant` because their reporting action cannot be
discarded into a value-only constant; this does not claim a warning-reporting
runtime implementation. These semantics are grounded in
[Modelica §8.3.7](https://specification.modelica.org/maint/3.6/equations.html#assert).

The function-call helper moved into `function_eval/statement_calls.rs`, keeping
the touched parent below the 2,000-line production-file limit. Other preexisting
handling of print, terminate and reinit was outside this fix.

## Actual verification

Final compiler Rust/Cargo source inventory:
`f7a19a9f3b46686d2710808821dd261fdd294d9331f900b438ac786bf270b70d`.
All qualification stages ran against identical before/after inventories; an
independent final inventory recheck matched. Exact commands, complete logs,
resources and source manifests are retained under
[the qualification evidence](artifacts/function-normalization/qualification/review.json).

| Check | Actual result |
| --- | --- |
| Core library tests | 211 passed |
| Flat constant evaluator library tests | 176 passed |
| ToDae library tests | 382 passed |
| Total library tests | 769 passed, zero failures |
| Fresh-key escape and cross-catalog Rustdoc controls | 2 expected compile failures passed; lifetime/escape diagnostics inspected |
| Strict Clippy | Three affected packages, all targets/features, `-D warnings`: passed |
| Workspace formatting | Passed |
| Maximum owned qualification RSS | 1,290,960 KiB |
| Concurrency / scheduling | Four Cargo/test/Rayon workers; CPU affinity 6,7; nice 15 |

There are 31 new runtime test controls: five catalog controls, eighteen
normalization/definedness/rewrite controls and eight assertion controls. The
bounded planning-graph execution tests use the existing source-expression
evaluator and compare with the original-function evaluator. They are not native
DAE/Solve/WASM localization tests. Existing compaction differential suites also
ran: 159,741 compared program/input pairs had no observable output divergence;
97,200 loop-local regions exercised the liveness witnesses.

Earlier failures are preserved in
[the earlier evidence](artifacts/function-normalization/earlier-refusals/).
The initial compile refusal was a test fixture missing an expression Box. The
selected-assertion failure exposed and drove the production evaluator fix.
Strict Clippy then required two test refactors; no lint allowances or checker
weakening were added. Read-only review found the initial rewrite hook bypass;
the final explicit rewrite API and three new controls address that API hazard.
[The review](rumoca-mounted-normalization-review.md) preserves its original
findings and appended resolution.

## Remaining production cutover

Enclose analysis and construction in one catalog scope, then replace the source
and generated-guard representations in FunctionPlan, loop compaction, liveness,
substitution, shape/role and definedness analysis, and lowering with this single
inventory. Remove the Empty markers, generated-name references and span side
tables together. Source leaf and expression visitors must expose every new
dependency; generated key identity must never downcast to VarName.

Reserve each consumed declaration through the canonical DAE function-local
constructor under its exact specialization. Snapshot correlation must survive
inner loops and be cleared at the lexical loop that refreshes it. Add explicit
production scope adapters before migrating binder substitutions. Preserve all
existing early-return, partial-write, assertion and atomic join checks.
The exact lifetime/source-map arrangement and affected signatures are in
[the integration note](rumoca-normalized-catalog-lifetimes.md).

After that cutover, run the unchanged localization source and the staged native
semantic and moving RGB-D numerical regressions. Then qualify the browser
compiler before connecting the session and advancing persistent mapping and
verified loop closure. The fixed 20-model canary, full native producer and
full-source browser numerical qualification have not run for this closure.
No native performance, end-to-end sensor throughput, full SLAM, FMI packaging,
or 10× realtime capability is claimed by this verification.

Machine-readable current evidence:
[rumoca-function-normalization-verification.json](rumoca-function-normalization-verification.json).
