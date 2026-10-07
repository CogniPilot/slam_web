# Mounted generated-local normalization review

Read-only review, 2026-10-05. This note reviews the mounted Core catalog and
public ToDae planning module; production ToDae consumers have **not** migrated.
No compiler mutation, build, or executable admission test was performed here.
Root owns qualification results. This does not establish localization admission.

The reviewed snapshot transformation preserves the original conditional site.
Definitions inside a `For`/`While` body execute again on each entered iteration;
they are not hoisted to a preheader. Each later `elseif` predicate is behind a
lazy `Guard::If` checking previously captured selections. Thus branch writes
cannot change the selected arm or cause later predicates to execute. Nested
definitions remain inside the original enclosing arm. The implementation
retains loop bodies, assertions, exits and unsupported source constructs for
the semantic checker.

Generated identities are separate from source `DefId`s, phase-branded, and
owned by `(declaration, instance, ordinal)`. Reservation is not a definition.
The introduced-local dataflow check rejects self-read, duplicate definition
sites, loop-local escape, prior-iteration initialization and partial branch
initialization. It conservatively visits all lazy expression arms for static
read collection; execution/lowering must preserve the separate lazy semantics.
Opaque source leaves cannot contain `For`, `While`, `If` or `When`; every current
Core statement variant is handled explicitly.

## Concrete migration hazard: statement rewrite overrides

`function_normalization/traversal.rs:56` recursively rewrites normalized nodes,
and `statement.rs:30` directly invokes `StatementRewriter::walk_statement` for a
source leaf. Neither invokes an existing rewriter's `rewrite_statement` or
`rewrite_statements` overrides. Reusing such a rewriter is therefore not
behaviorally equivalent to the original Core rewrite.

There is an actual affected override: `construction/analysis/fixed_loops.rs:107`
implements `IndexBinding::rewrite_statement` to stop at a nested `For` that
rebinds the substituted index. The normalized walker descends into that loop
without consulting the override and can replace the inner binder's reads with
the outer iteration value. This does not currently change production behavior
because the module is unused there.

Before migration, introduce an explicit normalized-statement rewrite contract
with overrideable sequence/statement traversal and lexical-scope handling, or
adapt each such pass explicitly. Preserve opaque-leaf validation on any source
leaf replacement. Do not advertise the current expression/target/index rewrite
facility as a drop-in full `StatementRewriter`. Add a nested same-name binder
regression and a statement-replacement override control.

Other migration obligations remain explicit: map only declarations belonging
to the consumed plan into each function specialization's fresh runtime value
IDs; retain generated definitions in loop targets, read liveness, substitution
and definedness; lower `Guard::If` lazily; and preserve the existing reachable
prefix/early-return owner. The current module retains returns instead of
normalizing them. Public mutable plan inventories are not executable
certificates; inventory-changing passes require the semantic owner's checks.

## Assertion evaluator

`constant/function_eval/statement_calls.rs` now aborts selected false default
or error assertions, preserves statement provenance and does not evaluate a
true assertion's message. Both statement and call spellings use the same
routine. A selected warning returns `NotConstant` rather than silently losing
the reporting action in constant evaluation. Read-only inspection found no new
correctness defect in this change. Current controls include false/true,
inactive arm, selected loop, explicit error/warning, operand typing and output
slots. Runtime warning reporting remains a downstream owner obligation.

## Reviewed source SHA-256

Paths are relative to the compiler checkout; hashes describe the inspected
source bytes, not a built producer or an executed localization artifact.

| File | SHA-256 |
| --- | --- |
| `crates/rumoca-core/src/generated_function_locals.rs` | `574f8aa39b3b26186059a2b7c762380421db8d578216313d149a7e07cb3aa72e` |
| `crates/rumoca-phase-dae/src/function_normalization.rs` | `db668f40bca754fc842b942cc9ae03cf1e4b393901ffa6729903ce7d2551904c` |
| `crates/rumoca-phase-dae/src/function_normalization/guard.rs` | `2ccf16305562e2cea80c8edd022f99a5bc20bef47d2f39ee2ceca44bd49f927a` |
| `crates/rumoca-phase-dae/src/function_normalization/statement.rs` | `e8d4cbc68856a4ea64bba7e9e0c4ddcdd9919817d17bff70d4c978d5531edb21` |
| `crates/rumoca-phase-dae/src/function_normalization/snapshot.rs` | `f13d932fde4a854fb0070a5b0f504d212a55f0834f402e6e93da139f353e2ae3` |
| `crates/rumoca-phase-dae/src/function_normalization/traversal.rs` | `c0b86fcc85e29f38d0f5941ee7ed0933a4042baadc80a015f6f179aa399c020b` |
| `crates/rumoca-phase-dae/src/function_normalization/dataflow.rs` | `943753d808f75400bf82e5a7847cdb64181b7ff2d2679cf119e2c649a4b8a8e5` |
| `crates/rumoca-phase-dae/src/construction/analysis/fixed_loops.rs` | `775071726f4a1210e96f31f414788263701fe6c98163f41d70ba67c875f48dad` |
| `crates/rumoca-eval-flat/src/constant/function_eval/statement_calls.rs` | `e653efc85253aba68789d9fa614016b13eeba4c6ec0c92193e8d986176e0879d` |

## Resolution addendum — 2026-10-05

Root addressed the identified API migration hazard in a subsequent source
revision. `NormalizedStatement::rewrite` now requires explicit implementation
of `NormalizedStatementRewriter`; there is no blanket bridge from the legacy
Core `StatementRewriter`. The new trait dispatches overrideable normalized
statement and sequence hooks recursively, so an adapter can stop at a rebinding
scope before traversing its range/body. Source-leaf rewriting invokes the actual
legacy `rewrite_statement` override and returns a checked `Result`; replacements
that conceal control flow are refused by `SourceStatement::construct`.

Read-only inspection confirms this addresses the reported API hazard. New tests
exercise nested scope-hook dispatch, actual leaf override dispatch, and rejection
of a loop inserted into an opaque source leaf. The scope test deliberately stops
at every nested loop to verify dispatch: it is not the production `IndexBinding`
adapter or proof of that adapter's exact binding policy. That concrete adapter
remains pending because production passes have not migrated. Inventory mutation
still requires the semantic owner's validation; the planning module does not
claim an executable certificate. No build or test was run by this reviewer.

The earlier source hashes and finding are preserved above. These are the
subsequent inspected bytes (paths relative to the compiler checkout):

| File | SHA-256 |
| --- | --- |
| `crates/rumoca-phase-dae/src/function_normalization.rs` | `b6c05079228fd25b8a1762aa880d3171408dc91495980351c9420a9179bc1691` |
| `crates/rumoca-phase-dae/src/function_normalization/rewrite.rs` | `c150f37d715d98b5c6b1b175ad10428c80d68bffd9e961e34ae05b7627f0444d` |
| `crates/rumoca-phase-dae/src/function_normalization/statement.rs` | `117f7bb92d4faf64cd627cfab5268779585e8b312a42e7a4ce614f5a69fe0fc5` |
| `crates/rumoca-phase-dae/src/function_normalization/traversal.rs` | `be8051f4d7d5646f76bf4729084405194f30fe7bb4705a9fdfacd46f86068e8f` |
| `crates/rumoca-phase-dae/src/function_normalization/tests/rewriting.rs` | `0b5556fd97f380fbdaf929342450141e11af9952d2b1ff3f98f1d80dab68702c` |
