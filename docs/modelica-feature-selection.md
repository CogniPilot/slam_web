# Editable Modelica feature selection

`models/Vision/Features/FeatureSelection.mo` retains the full 160×90 score raster and 14,400
output rows, including the editable cap through 14,400. The source owns
heap ranking, ties-to-even quantization, raster tie order, raw-score early stop,
square occupancy/NMS, settings validation and the separate grid traversal.
Its production integration is pending: no reviewed runnable artifact currently
implements this complete source.

An [earlier immutable native compiler probe](../dev/modelica-feature-selection-native-verification.json)
reproduced the unchanged source's ToDae dependent-domain refusal with producer
`27df64656c5c504de5dc181f6ec89664ad597f582105865b9bb65e8cdbe6fd63`.
The full source failed in 43 ms. A compact bounded-domain scratch experiment
retained all 14,400 scores and output rows and reached another ToDae refusal:
a runtime conditional cannot currently own the remaining ordered fold plan.
The experiment was not installed in the editable model or vision adapters.
There is no numerical WASM parity claim.

The first missing proof is the loop-carried candidate count. Existing interval
inference correctly invalidates a mutable recurrence rather than treating one
iteration as a finite-range proof. Without a checked induction certificate for
`0 <= candidateCount <= size(scores,1)`, the later `1:candidateCount` range has
no certified compact envelope. The retained 26-line
[RuntimeCandidateCount reproducer](../dev/artifacts/modelica-feature-selection-native/RuntimeCandidateCount.mo)
uses the full 160×90 input and reproduces this same refusal in 15 ms.
The generic compiler work belongs in the DAE function-loop/domain owner:
prove the bounded recurrence and preserve runtime range entry snapshots,
lexical binders, element membership and ordered carried updates. Replacing
the missing proof with scalar expansion or an assumed bound would violate
Rumoca's compact-domain and construction contracts.

The second refusal comes from
`function_conditionals.rs::validate_conditional_branch_shape`: a runtime
branch with a remaining `FunctionStatementPlan::For` lacks an ordered fold
owner. Supporting it requires branch-entry predicate snapshots and exact
carried-definition/output joins. Students should not need to write manual
SSA variables to author ordinary Modelica algorithms. The Modelica language
permits runtime algorithm-loop ranges and ordered statement sequences;
see [MLS 3.7 chapter 11](https://specification.modelica.org/maint/3.7/statements-and-algorithm-sections.html).

The existing independent selector oracle passed its eight contract fixtures,
plus grid and nonfinite-domain checks. All three actual-WASM gates remain
skipped because no artifact was issued. Three small conditional controls hit
the 30-second bound without phase evidence; their cause remains unknown and
they are not accepted or used to attribute a compiler failure. Exact sources,
raw refusals/timeouts, immutable source closure and resource terminals are
retained under `dev/artifacts/modelica-feature-selection-native/`.

The [final-source producer follow-up](../dev/modelica-feature-selection-owner-final-verification.json)
used immutable producer `4881367e…` with frozen source closure `8f719cbb…` and
one 10-second limit per unchanged full14400 source. The original selector
reproduced the dependent-domain refusal in 46.33 ms. The staged raster-While
isolator refused in 13.28 ms at the earlier arithmetic-series classifier:
ordinary top-level `While` currently enters a narrowly supported integer-series
path. This differs from the original selector's nested conditional topology.
The staged conditional ordered-fold isolator timed out after 10.043 seconds,
with only the test header recorded; it provides no phase or branch-owner proof.
No native or Solve artifact was issued, and no numerical case ran.

The [owner follow-up](../dev/artifacts/feature-selection-owner-proposal/final-4881367/owner-followup.md)
separates those results from the earlier causal reproducer. The unchanged
selector requires checked counter induction, generic bounded-While progress
and header ownership, and ordered loop transitions within conditional regions.
Declining the arithmetic-series classifier alone cannot supply the missing
ordinary-While owner. Compiler sources, Modelica source and production pin
remain unchanged by this follow-up.

The [current compiler development requests](../dev/rumoca-slam-next-frontiers.md)
record exact source/producer evidence for checked raster counter/While ownership
and the separate historical seeded-depth dependency-incidence frontier. They
add no compiler execution or native acceptance claim.
