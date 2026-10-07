# Full graph covariance reference preparation

The first corrected full128-node/256-edge run timed out during OMC preparation,
before numerical evaluation. Its unchanged source receipt is
`dev/artifacts/modelica-graph-covariance-semantics/graph-covariance-semantics-gjrIJX`.
This is not a covariance numerical result.

Phase-local diagnosis retained the same production and test sources. `checkModel`
completed with935equations/935variables (462trivial), while `translateModel`
hit the same120s limit. Receipts are `graph-covariance-phase-hWvURK` and
`graph-covariance-phase-Oj0BTb` under the same artifact parent directory.
The latter includes an8s owned-process perf recording:1,427samples, zero lost.
The sampled inclusive backend path
`BackendDAEUtil_preOptimizeDAE -> EvaluateFunctions_evalFunctions ->
evaluateConstantFunctionCall -> predictIfOutput/updateAllStatements`
accounted for74.10%; GC marking accounted for27.24% self and expression
replacement8.50% self. Inclusive and self percentages overlap and must not be
added. This localizes the preparation cost to OMC backend partial function
evaluation, rather than frontend typing or the production covariance evaluation.

Local OMC `--help` documents `--preOptModules-=module1,module2`; its
`--help=preOptModules` identifies `evalFunc` as partial function evaluation.
The reference runner now explicitly uses
`setCommandLineOptions("--preOptModules-=evalFunc")`, in addition to its existing
frontend debug flags. The local help outputs are retained beside the perf
recording. This is a reference compiler optimization choice; it does not add an
application backend or change the Modelica numerical source.

Disabling this pass alone exposed a separate OMC SimCode limitation in0.365s:
the mixed-record equation `result=Run(scenario)` could not be scalarized and was
sent to an unsupported nonlinear solver. Receipt:
`graph-covariance-semantics-AlUVFT`. A test-only `AtTime(Real clock)` wrapper now
keeps the complete record assignment inside an algorithm and returns plain
tuple outputs. Exact binary1/8 phase spacing avoids final-time decimal drift.
All original19cases, full dimensions, production computations, tolerances and
96iteration cap remain unchanged.

That harness completed native simulation in61.041s with222,500KiB peak owned
RSS. Its40rows/463columns cover all19cases. Original receipt:
`graph-covariance-semantics-Qe5jIO`. The initial checker incorrectly split quoted
two-dimensional CSV names on their internal commas; the separate
`recheck-report.json` fixes only that parser and retains the original CSV SHA
and source/process receipt. A recheck rejects changed model/oracle source or
changed CSV, and never reruns the simulator or overwrites the initial report.

The result is **not qualified**:13/19cases pass. Every tested valid graph passes
the full144-cell numerical lower/upper PSD-gap checks, including zero-PCG and
early nonzero-PCG bounds. All refusal cases pass. Six intended tight solves fail
the unchanged convergence criterion at96iterations; maximum upper differences
are0.261 on the ordinary graph and1.045 with reversed edges. The selected
initial tree is a127-level chain. An independent test-only dense PCG probe on
the same full information matrix gives first-column residual0.005277 for that
chain and8.71e-7 for a6-level breadth-first tree, both after96iterations. The
latter still exceeds1e-10; no tolerance or success flag has been weakened.

All paths in portable runners derive disposable outputs from `$HOME/scratch`.
The perf target was only the owned bounded diagnostic process. No production
Rumoca artifact, browser execution, directed-rounding certificate or complete
SLAM acceptance is implied by these OMC reference observations.

## Breadth-first tree comparison

The production tree now freezes the incoming reached set for each discovery
layer. Original edge ordinal breaks ties within that layer. The independent
dense tree oracle instead builds adjacency lists and traverses a frontier queue,
sorting that layer's candidate edges by ordinal. It therefore checks the same
documented choice without copying the production scan. The complete information
operator still includes every original active factor; only the preconditioner
and residual majorant tree change.

`graph-covariance-semantics-QwrrJk` completed in60.098s with224,796KiB peak owned
RSS, equal source bookends,40strict CSV rows and all19cases. The result remains
**13/19, not qualified**. Every144-cell tight comparison now passes; the largest
upper difference from the independent dense inverse is6.407e-8. The six remaining
failures are exactly the unchanged strict convergence flags. Early zero/two-step
bounds, full PSD-gap checks, anchors, repeated selection, inactive poison and
refusals all pass. No iteration cap, tolerance or expected result was relaxed.

The8s simulation profile retained beside this receipt has1,475samples and zero
lost: `PGNormalProduct`52.31% inclusive and `TreeSolve`31.90% inclusive. Array
indexing is prominent (`index_real_array`32.11% inclusive; base-index/shape
checks13.73%,8.75%,8.73%,5.25% self), with allocator `GC_malloc_kind`7.10% self
and matrix-vector multiplication4.38% self. These overlap; they are not a
partition of execution time. This profile is OMC generated-C reference
performance, not Rumoca WASM throughput.

The CSV does not export `Result.residualNorm`, so it cannot establish the actual
source's final residual range. The separate `tree-diagnostic` archive contains
only independent dense/central-difference-Jacobian probes. Across its12right-hand
sides at96iterations, recomputed residual norms are6.49e-7..1.28e-6 for the full
graph,5.28e-7..1.00e-6 for reversed edges and3.87e-9..7.18e-9 for the active96-node
case. Recursive and recomputed norms agree to about1e-15. The first full-graph
column falls from0.113 at24iterations to0.00267 at48,5.73e-5 at72 and8.71e-7 at96.
This indicates finite-iteration convergence, rather than residual-recursion
drift or stagnation; it does not substitute for measuring the Modelica residual.
Residual replacement alone is therefore not a supported fix. A future targeted
reference boundary should expose the already computed residual norms before
selecting a stronger preconditioner or orthogonalization policy.

## Authoritative residual export

The subsequent test-only tuple and CSV boundary now exposes the production
`Result.residualNorm[12]` without changing the covariance source. Receipt
`graph-covariance-semantics-LOyR5G` completed natively in59.451s, peak224,216KiB
owned RSS, with equal source bookends and40strict475-column rows. The result
remains13/19; the only six failures are convergence flags. All144-cell tight
and PSD-gap comparisons, bounds and refusals still pass.

Actual recomputed Modelica residual norms across nonanchor columns are:

| Case | Minimum | Maximum | Iterations |
| --- | ---: | ---: | ---: |
| Full128-node graph | 6.583e-7 | 1.248e-6 | 96 |
| Reversed edges | 5.235e-7 | 1.015e-6 | 96 |
| Active96-node graph | 4.119e-9 | 8.042e-9 | 96 |

Anchored directions have exactly zero residual and zero iterations. The zero
iterate has unit residual; the two-iteration case ranges1.002..1.277. The complete
per-column residuals, iteration counts and flags are in the report. No current
source residual history was exported, so a statement about stagnation would
still exceed this evidence.

This receipt also retains a separate8s owned-simulation perf recording and
self/inclusive reports (1,453samples, zero lost). These are local OMC generated-C
runtime measurements. The contract's proposed block/coarse preconditioners are
review-only and were not added to this frozen source or measured by this run.

## Six-direction balancing follow-up

The subsequently authorized production coarse operator passed an independent
full-capacity4/4formula gate (`graph-coarse-semantics-khcmND`). The initial
`graph-coarse-semantics-qv1fQW` receipt retains an OMC C-generation failure for
the TEST reduction `max(abs(record.threeDimensionalArray))`; exhaustive scalar
zero checks replaced that reduction without changing the asserted canonical
refusal or production numerical source.

Full covariance receipt `graph-covariance-semantics-ThDvSm` is native-process0,
71.197s/230,136KiB,40strict475-column rows, equal bookends and13/19. All144-cell
tight comparisons, PSD gaps, early bounds and refusals pass. Only strict
convergence fails, with maximum actual residual1.085e-6(full),1.098e-6(reversed)
and8.421e-9(active96). No tolerance/iteration/capacity changed. The new reference
run is slower than the59.451sbaseline; the successful operator proof cannot be
represented as a convergence or performance success.

### Generated recurrence review and competing hypotheses

The retained generated `ModelicaPoseGraphCovarianceAcceptance_functions.c`
confirms that `_coarseEnabled` calls `BalancedSolve` initially and again after
each unconverged update. It retains `alpha=rho/(p'Hp)`, recursive `r-=alpha*Hp`,
`beta=nextRho/rho`, `p=z+beta*p`, and the unchanged96bounded iterations. Final
residual/flags are computed from a fresh `B-HX` application, not copied from
the recursive residual. Thus the new operator is executed, and final failure
is not explained by a stale recursive-only diagnostic or a skipped coarse call.

The most economical hypothesis is unresolved graph deformation modes outside
the six global rigid directions. A rank-six correction cannot by itself supply
a96-iteration guarantee for a general762-dimensional SPD system. Its operator
oracle proves the formula but does not measure the remaining spectrum. A
clustered coarse basis or rank-aware block Krylov span is the appropriate next
review topic; repeating the same full gate cannot establish those policies.

Loss of finite-precision H-conjugacy remains a competing hypothesis: the
generated recurrence has no reorthogonalization of earlier search directions.
Neither the current CSV nor the old independent decreasing-history probe
measures production `p_i'Hp_j`, so this is not an identified source defect or
proof of stagnation. The independent history's recursive/recomputed agreement
argues against residual-drift replacement as the main explanation, while not
excluding loss of direction orthogonality. A future targeted diagnostic would
record the residual history and selected conjugacy defects under the same
strict criterion before choosing a reorthogonalization policy.

Finally, `BalancedSolve` generates additional array contractions and allocated
linear combinations around the existing tree solve. That is a plausible cost
of the slower run, consistent with the earlier array-allocation profile, but
the new operator was not sampled during this run. Do not attribute its measured
11.75sextra elapsed time to a specific function without another profile.
Neither this numerical reference nor these hypotheses qualify Rumoca/browser
execution, an outward rounding certificate, or complete SLAM integration.

## Full-information paired block follow-up

The bounded independent finite-difference diagnostic compares the frozen tree
baseline with full-H principal-block preconditioning and the same six-direction
balanced coarse operator. The six-coordinate diagonal variant reaches strict
1e-10 residuals in49–54iterations, improving the96-step failure but still missing
the48default. Two adjacent free-node12-coordinate blocks reach the unchanged
criterion in42–46iterations for all12selected columns on the full128-node graph,
reversed edges and active96-node graph. Both diagnostic scripts, frozen source
preimages, raw histories, resource receipts and reports are retained under
`dev/artifacts/modelica-graph-covariance-semantics/covariance-balanced-{jacobi,pair}-diagnostic`.
These JS computations are independent test/oracle work, never app numerics.

The source now builds64checked12-coordinate principal blocks of the full undamped
H, retaining every factor's diagonal terms and both within-pair cross terms.
The partition is free rows(2,3),(4,5),...,(128,padding). Inactive coordinates and
last padding get independent positive diagonal blocks scaled to the maximum
physical diagonal in their pair; this avoids an artificial relative-pivot
refusal at large information scales. Their right-hand side and returned action
are exactly zero. No physical H entry changes, and no jitter/noise is added.
The original checked tree remains the residual-majorant owner. Existing
BalancedSolve and tree APIs stay intact; Select uses BalancedPairSolve only as
its numerical preconditioner. Defaults48, limit96, all tolerances and capacities
remain unchanged.

Actual Modelica pair-operator receipt `graph-pair-semantics-9fekYS` passes11/11,
comparing every free coordinate with independent finite-difference full H and
separate12-block solves. Controls include original full/reversed/active96,
zero-H rank refusal, high uniform information, an interior inactive slot, malformed
endpoint/mask/active-edge eligibility, combined high information plus interior
hole, and the exact two-active-node{1,128}/information1e13padding counterexample.
All declared128/256storage remains present; the original full-domain controls
remain. The earlier source's full19hardgate `graph-covariance-semantics-XOdhUq`
passed19/19 including unchanged strict residual/PSD/all144/error assertions.
It is historical because the remaining inactive-padding branch was subsequently
fixed. Final source hard/default gates are pending resource availability:
`graph-covariance-semantics-jVgYqj` was immediately killed by the unchanged16GiB
available-memory floor, before compilation/CSV. The receipt preserves this
failure rather than claiming numerical execution.

### Final unchanged strict hard/default gates

After resource availability recovered, final source
`0860150bdf5c8046067068032c2093d9caa30e52acbd804649eddd2ce56f83b0`
passed the original19hardgate (`graph-covariance-semantics-gaFAHN`,29.291s,
243808KiB). The separate omitted-parameter default48gate preserves all original
19scenarios/thresholds and also passes (`graph-covariance-default-semantics-5mQTLG`,
28.397s,237568KiB). Normal success cases omit maximumPCG, exercising the public
48default; zero/two-step/invalid97 controls retain their explicit inputs.
All original residual/PSD/all144/early-error/refusal assertions pass, with fresh
residual maxima9.9913167609e-11(full),9.5815880767e-11(reversed),8.8127714405e-11
(active96), requiring42–46iterations. Source/runner hashes were independently
recomputed after all gates; strict fresh CSV, simulation success, process0 and
bookends pass. No threshold, iteration default/ceiling or graph capacity changed.
The earlier immediate memory-floor failure remains historical evidence, not an
unresolved numerical failure. The two ordinary floating reference passes do
not imply a general48-iteration guarantee or outward-rounded certificate, and
do not qualify Rumoca/browser/public-model/full-SLAM execution.
