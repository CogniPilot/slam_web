# ToDae phase-wide generated catalog: concrete lifetime arrangement

Read-only implementation guidance against the current
`rumoca-native-functions` source, 2026-10-05. No compiler edits or builds were
performed for this review. Signatures below are proposed changes, not current
exported APIs. The generated-local/statement implementation is owned by root.

## Enclose both analysis and construction

`construction.rs::construct` currently performs loop normalization, `analyze`,
balance checking, variable planning and external-table preparation, then opens
`Dae::construct` and calls `build_checked`. Put one generative catalog closure
outside that complete sequence. Do not create a separate factory per function
whose keys must escape in a returned plan.

```rust
pub(crate) fn construct(flat: &flat::Model, source_map: SourceMap)
    -> Result<dae::Dae, ToDaeError>
{
    let unrolled = analysis::unroll_carrying_algorithm_loops(flat)?;
    let flat = unrolled.as_ref();
    GeneratedCatalog::construct(&source_map, |catalog| {
        let analysis = analyze(flat, catalog)?.with_semi_linear_rules(flat);
        // Existing balance refusal, variable plan and external tables unchanged.
        let variable_plan = plan_variable_construction(flat, &analysis)?;
        let external_tables = native_tables::build_external_tables(
            flat, &analysis.constants)?;
        let dae = dae::Dae::construct(source_map.clone(), |construction| {
            build_checked(flat, &analysis, &variable_plan, construction)
        }).map_err(ToDaeError::from)?;
        Ok(dae.with_external_tables(external_tables))
    })
}
```

This is a layout sketch: retain the current non-partial balance rejection and
its error ordering at their existing position. Map catalog errors through the
real phase error owner. `SourceMap` owns Arc-backed storage, so cloning here
preserves the authentic snapshot without copying source text. Moving the
borrowed `source_map` into the inner constructor would fail the borrow contract.

The catalog API can have this shape (whether its callback owns or borrows the
catalog is an implementation choice):

```rust
fn construct<'source, R>(
    source_map: &'source SourceMap,
    run: impl for<'locals> FnOnce(
        &mut GeneratedCatalog<'locals, 'source>
    ) -> R,
) -> R;
```

`R` is outside the `for<'locals>` binder and therefore cannot carry a fresh
key. Catalog/source errors can wrap this return in a Result without changing
the lifetime argument. `Dae::construct` opens its independent `'dae` brand
inside that closure. The final owned Dae, BalanceDetail, structural selections
and ToDaeError carry neither brand.

## Exact analysis and construction signatures

```rust
fn analyze<'locals>(
    flat: &flat::Model,
    catalog: &mut GeneratedCatalog<'locals, '_>,
) -> Result<Analysis<'locals>, ToDaeError>;

fn validate_functions<'locals>(
    flat: &flat::Model,
    shapes: &FunctionShapeAnalysis,
    catalog: &mut GeneratedCatalog<'locals, '_>,
) -> Result<HashMap<FunctionSpecializationKey, FunctionPlan<'locals>>, ToDaeError>;

fn build_checked<'locals, 'dae>(
    flat: &flat::Model,
    analysis: &Analysis<'locals>,
    variable_plan: &VariableConstructionPlan,
    construction: &mut dae::DaeConstruction<'dae>,
) -> Result<(), dae::DaeConstructionError>;
```

The temporary `&mut catalog` borrow is **not** `&'locals mut catalog`.
Declaration allocation returns an owned declaration/key branded by `'locals`,
not an object borrowed for the duration of that mutable call. Thus validating
one specialization does not prevent allocating declarations for the next.
Analysis owns normalized sources, declarations and plans; it should not retain
a mutable catalog reference or an incidental borrow of the Flat function.

Current `Analysis.function_plans` becomes
`HashMap<FunctionSpecializationKey, FunctionPlan<'locals>>`.
`FunctionPlan`, `FunctionStatementPlan`, the normalized statement/guard nodes,
and generated definitions carry that single fresh brand. Ordinary shapes,
constants, balance records, variable plans and DAE function registry IDs do not
need to acquire it merely because Analysis has that field.

`FunctionValidationContext` needs two distinct parameters:
`FunctionValidationContext<'scope, 'locals>`. Its short-lived references to
roles/shapes/definition tables/generated declarations use `'scope`; the opaque
keys inside those tables use `'locals`. No reference must be promoted to the
catalog's brand lifetime. Keep mutable allocation outside this Copy validation
context, passing the allocator to normalization/planning explicitly.

Construction signatures that accept FunctionPlan/FunctionStatementPlan should
propagate `'locals` through `construct_functions`,
`construct_recursive_component`, `define_function`, `lower_function_plan` and
their plan-taking helpers. There is no required relationship
`'locals: 'dae` or `'dae: 'locals`.

The dependent scope counts for the currently concrete construction helpers are:

| Helper/type | Current lifetimes | Minimal new lifetimes |
| --- | --- | --- |
| Analysis, FunctionPlan, FunctionStatementPlan | none | `'locals` |
| FunctionValidationContext | `'scope` | `'scope, 'locals` |
| FunctionSymbols | `'symbols, 'dae` | `'symbols, 'locals, 'dae` |
| FunctionConditional, FunctionFold, TotalArrayDefinition | `'scope, 'statement, 'dae` | `'scope, 'statement, 'locals, 'dae` |
| ConditionalBranch, NestedFunctionConditional, ConditionalAssignment | `'scope, 'statement, 'dae` | `'scope, 'statement, 'locals, 'dae` |
| FunctionRegistry, FunctionRegistryInput | `'shape, 'dae` | unchanged |

`ConditionalAssignment` acquires the extra brand through its FunctionSymbols
even when its own assignment target remains an ordinary source declaration.
The corresponding function arguments may use anonymous `'_` parameters where
no branded result is returned; name both brands on constructors returning
DAE-branded body capabilities. This does not require adding the fresh brand to
every model-wide coordinate or expression type.

## Per-specialization DAE mapping

`function_construction.rs::construct_functions` already walks the shape
analysis's issued construction components. Acyclic bodies are built inside
`construction.function(signature, callback)`; recursive groups reserve every
member before defining its bodies. Keep both paths unchanged apart from passing
branded plans/declarations.

At `define_function`, keep generated values in a fresh map:

```rust
HashMap<GeneratedLocalKey<'locals>, dae::FunctionValueId<'dae>>
```

Reserve each declaration with `functions.local` under the **current** function
reservation. That map's short borrow belongs in
`FunctionSymbols<'symbols, 'locals, 'dae>`, alongside current coordinates,
FunctionRegistry and shapes. It must be recreated for every exact specialization
and every recursive-group member. It must not live in the global
FunctionRegistry or be shared simply because two specializations originate from
the same source function instance. Constructor-owned IDs cannot escape the DAE
closure.

`FunctionRegistry<'shape, 'dae>` and `FunctionRegistryInput<'shape, 'dae>` can
retain their existing two lifetimes: they do not own generated local maps.
Short source/planning borrows in FunctionConditional and FunctionFold remain
separate from the two brands; those structs' plan slices/Symbols acquire
`'locals` as needed. Ordinary model LoweringSymbols need no extra brand when
generated reads are confined to explicit normalized function-node lowering.

Allocation policy must prevent ordinal collisions across specialized plans.
Two sound choices are: normalize each source function once and share its issued
declarations across shape plans, while reserving separate DAE values; or allocate
fresh dense ordinals from the phase-wide owner catalog on each plan build.
Do not restart a per-function ordinal counter for every specialization while
pretending those independently allocated declarations are the same identity.
Validation-only return/definedness normalizations may allocate their own locals;
register **the declarations of the consumed plan**, not every catalog row that
mentions the same function instance.

## Evidence path has the authentic source map

The only production caller found for
`rumoca_phase_dae::construction_evidence(flat)` is
`rumoca-compile/src/session/compile_support.rs::dae_model_outcome_from_flat`.
It receives `tree: &ast::ClassTree` and immediately preceding this call already
passes `tree.source_map.clone()` to `to_dae`. Change the signature rather than
weakening registered-provenance checks:

```rust
// phase-dae/src/lib.rs and construction.rs
fn construction_evidence(flat: &flat::Model, source_map: &SourceMap)
    -> Result<(BalanceDetail, Vec<StructuralSelection>), ToDaeError>;

// compile_support.rs
rumoca_phase_dae::construction_evidence(&artifact.flat, &tree.source_map)
```

Open another phase-wide catalog inside evidence, run the same `analyze`, and
return only its key-free balance/selections. It need not reuse the first
construction's keys; no branded artifact crosses between the two analyses.
Do not create an empty/placeholder source map or rely on later construction
after an evidence result has already been returned.

Direct private `analyze` callers found in current tests are:

- `construction/tests/clocks_temporal.rs`: successful analysis and the
  missing-delay-provenance analysis in the same test; `TestSource.map` exists.
- `construction/tests/boundary.rs::binding_lowering_does_not_fallback_to_declaration_provenance`:
  retain analysis and variable plan through the intentional later Flat mutation;
  `TestSource.map` exists. Wrap the whole analysis/use/construction-check region,
  rather than returning a branded Analysis from a helper closure.

The catalog should store owned identity/provenance data, not borrow `flat` or
its Function bodies for its entire lifetime; the negative boundary fixture
intentionally mutates the Flat expression after planning. The DAE constructor
must still reject the invalid binding provenance at the correct later point.

Compiler-wide searches found no other production evidence callers. Public
`to_dae` need not change. A broader external caller cannot be inferred from this
workspace-only search, so the added SourceMap evidence parameter is a deliberate
public Rust API change to record in review.

## Narrow lifetime controls

Compile-fail: return a generated key or Analysis from the catalog closure;
mix keys from two catalog invocations; return a DAE value map from
`Dae::construct`; move the source map while the catalog borrows it.

Positive: analyze two functions and two different input-shape specializations
of one function in the same outer catalog; allocate after an earlier plan is
retained; instantiate per-reservation maps with independent DAE IDs; recursive
group reservation order unchanged; evidence uses the real map and returns only
balance/selections; the existing provenance-negative tests retain their refusals.

These controls and implementation remain **UNRUN** in this review. Root owns
the actual compiler patch and qualification.
