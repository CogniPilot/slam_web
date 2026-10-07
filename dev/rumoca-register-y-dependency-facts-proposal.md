# Opaque register-Y membership facts: separate next stage

Date: 2026-10-05. Read-only review after freezing the separate PureCall scratch
patch. No compiler edits, Cargo, preparation or profiling were performed. This
proposal is not included in `pure-call-dependency-review/compiler.patch`.

The current compiler has exactly one direct caller of
`structural_pattern.rs::program_register_y_dependencies` (`:1603`):
`refresh/dependency.rs::ScalarProgramYDependency::new` (`:84`). Its private field
is `Option<Vec<Option<BTreeSet<usize>>>>` (`:77`). The field is queried only by
`depends_on(register, target)` (`:89`), which calls set membership. No caller
consumes the entire ordered register/set matrix. The public wrapper is used by
assignment-shape construction and continuous-refresh commit checks, including
`refresh.rs::exact_rows_can_commit_together` (`:1178`).

The structural walk already finishes with
`Vec<Option<DependencyState>>`. Empty/Singleton are allocation-free; Known holds
`Arc<BTreeSet<usize>>`. The present return boundary converts every initialized
register with `DependencyState::into_set` (`:1551`), whose Known branch calls
`Arc::unwrap_or_clone`. Many registers sharing one exact dependency set can
therefore become many independent complete sets solely to answer membership.
This is a direct code-level allocation opportunity, not a causal attribution of
the incomplete depth profile or a measured performance result.

## Minimal design and ownership

Keep the existing exhaustive walk and error path unchanged. Replace only its
private materialization boundary with a crate-visible opaque capsule owned by
`structural_pattern`:

```rust
pub(crate) struct RegisterYDependencyFacts {
    registers: Vec<Option<DependencyState>>,
}
```

Its field and dependency state remain private. The existing factory returns
`Result<RegisterYDependencyFacts, StructuralPatternError>` by moving the completed
walk's register vector into the capsule; it does not call `into_set`. Expose only
a read-only membership query taking the same register and target types and
returning `Option<bool>`:

- Missing/out-of-range register or an uninitialized entry: `None`.
- Initialized Empty: `Some(false)`.
- Initialized Singleton(index): `Some(index == target)`.
- Initialized Known(set): `Some(set.contains(&target))`.

Use a direct variant match for membership. `with_set` currently materializes
Empty/Singleton through `into_set`, so it would unnecessarily allocate a
singleton set here. Do not expose the vector, individual states, owned sets,
pointer identity or a membership cache. The capsule needs no Clone, Deserialize,
mutation API, new crate dependency or public re-export.

Change the wrapper's private field to `Option<RegisterYDependencyFacts>`. Keep
`new(program).ok()` and the existing program-lifetime PhantomData unchanged.
Translate absent capsule or `None` membership to `true` in `depends_on`, exactly
preserving today's fail-closed result. Successful initialized empty dependence
must still return false. Preserve the public constructor/query signatures and
all caller behavior, including equal register addresses in distinct programs or
different source prefixes.

Known sets are immutable through the capsule. During construction, the existing
walk changes shared sets only through `Arc::make_mut`; after successful
construction, no capsule operation mutates them. Arc sharing is storage sharing,
not identity or permission to reuse an invocation or analysis across programs.
The capsule retains the same final register versions and SolverY category as
the original factory. The existing source/program lifetime and the canonical
prefix cache's drop-on-position-change discipline remain intact.

This stays within accepted SPEC_0029 read-only IR queries and its SPEC_0041 row
for `ScalarProgramYDependency`: the structural interpretation remains singly
owned in Solve IR. SPEC_0007/SPEC_0040 C51/C52 owner/provenance and checked call
summaries are untouched. No semantic body sharing, result cache, new public proof
authority or wire/schema change is introduced. An optional catalog clarification
can name the private retained representation under the existing owner row; no
new owner boundary or semantic contract is needed for exact membership.

## Separate edit and validation plan

Only two production files should need changes:
`crates/rumoca-ir-solve/src/structural_pattern.rs` for the capsule/factory/query,
and `crates/rumoca-ir-solve/src/refresh/dependency.rs` for the private field and
fail-closed query composition. Keep public ordered dependency outputs and their
existing `into_set` boundaries unchanged. Add focused tests under these owners;
do not silently expand the already frozen PureCall patch.

Compare capsule membership with a test-only literal old owned-set materialization
for small complete register matrices, checking present and absent target values,
out-of-range registers, holes, initialized Empty, Singleton and Known sets,
register overwrites, and distinct programs sharing register numbers. Inject an
invalid operation after an otherwise valid prefix to confirm factory failure
still makes every wrapper query conservative. Preserve span/error checks on the
factory and the existing guarded-Fold, matrix, call, assignment-shape and
continuous-refresh proof/replay controls.

For allocation controls, use a 14,400-cell whole output with a small dependency
cardinality and verify retained Known states share their set, repeated membership
is read-only, and the capsule boundary does not invoke `into_set`. Use unique
14,400-cell input sets with only a few whole outputs; never materialize a
14,400-by-14,400 old matrix merely for an oracle. Public output-set equivalence
tests remain independent of this internal representation check.

The compiler owner should stage this after the first patch's focused checks and
current Flat source freeze. Run the appropriate Tier 1 canary/broader gates under
SPEC_0033, then coordinate one bounded unchanged-depth producer measurement. This
stage removes a potentially large owned-set conversion; demanded union work,
coordinate substitution, ordered output writes, register-vector growth and other
consumers' public set conversions remain. No full-depth completion, numerical
acceptance, speedup or SLAM performance claim follows from this proposal alone.

## Separate scratch review patch

An explicitly authorized, uncompiled patch is staged at
`$HOME/scratch/slam_web/tmp/register-y-dependency-facts-review/register-y-facts.patch`,
SHA256 `726c1d1b08deaaf3046571bff0f60b349df7f9fc7e74845e57f54909d226ba90`.
Apply after the frozen PureCall v1 and coordinate-only addendum; both prior patch
hashes remain unchanged. No sibling compiler files were edited and no Cargo,
compiler, behavioral tests, preparation or profiling were run.

The four-file patch implements the private capsule and single-consumer query,
registers a focused test module, and adds an independent original owned-set
oracle. It checks prefix/version/error/fail-closed behavior, aliased calls,
Fold/Conditional contexts, and exact Arc identities/refcounts for three large
aliases and 14,400 small-cardinality output states. The old matrix oracle remains
bounded. Scratch README and manifests record sequential preimages and all hashes.
Formatting, whitespace and patch-application checks passed; test assertions and
performance effects remain unverified until the compiler owner runs the gates.
