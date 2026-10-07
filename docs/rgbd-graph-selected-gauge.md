# Selected graph poses in an uncertain absolute gauge

`models/Optimization/RGBDGraphSelectedGauge.mo` owns the numerical adapter between the
selected graph covariance and `GraphGaugeUncertainty.Transport`. Its
`SelectAndTransport` function prepares the actual measured graph, maps the
supplied final poses from catalog slots into graph-node order, runs the actual
undamped selected-covariance owner, and transports the complete selected block.
All interfaces retain 128 node slots, 256 measured-edge slots and 12 selected
coordinates. The incoming Estimate is returned whole on every refusal and when
disabled. No graph, raw catalog capture or supplied final pose is mutated.

## Coordinate and statistical contract

The covariance solver's selected order is current world-additive position,
current body right-local angle, reference world-additive position, reference
body right-local angle. Its gauge is graph node 1, the oldest retained capture.
For final anchor `(pa,Ra)` and selected poses `(pi,Ri)`, the adapter forms

```
ti = Ra' (pi-pa),       Qi = Ra' Ri,
D = diag(Ra', I3, Ra', I3),
relativeJointBound = D selected.upper D'.
```

The full congruence includes position/angle and current/reference correlations.
Passing the world covariance directly to the relative transport would rotate
those blocks twice for a nonidentity anchor. A selected anchor endpoint uses
the exact zero relative translation, identity rotation and the solver's exact
zero covariance rows/columns; it retains uncertain absolute anchor covariance.

The actual `GraphGaugeUncertainty.Transport` then combines the supplied 6D
anchor bound and the relative 12D joint bound with its unknown-cross beta
inequality. This adapter does not assert their independence or manufacture an
anchor bound. The anchor mean must equal the final graph anchor exactly; the
caller supplies an already validated bound at that mean and pose revision.
The bound and raw-factor provenance tokens are positive caller assertions.
The retained anchor-bound owner must establish their statistical validity.

The selected covariance owner remains an ordinary floating-point numerical
calculation. Its `roundoffCertified=false` propagates to an accepted result;
the adapter does not claim an outward-rounded binary64 covariance certificate.
The detailed solver contract is in
[graph-covariance-solver-contract.md](../dev/graph-covariance-solver-contract.md).

`SelectFromAnchor` accepts a retained `RGBDGraphAnchorBound.Estimate` instead of
separate anchor scalars. It matches the estimate's generation, source, stable
capture ID, actual oldest slot, epoch, birth sequence, pose revision, timestamp
and provenance against the catalog, Context and Binding. Its mean must exactly
match the supplied final anchor pose. Only then does it invoke
`SelectAndTransport`; its typed-boundary rejection reason is 7. Disabled calls
and all refusals retain the whole incoming Estimate.

The retained anchor owner preserves the capture bound for an unchanged mean.
For a changed graph mean it provides a conditional first-order **error second
moment** bound, including the observed mean displacement and full chart
congruence. It is not a centered covariance or a global nonlinear certificate.
The adapter preserves that interpretation and the unknown-cross inequality;
numeric PSD checks and identity/provenance matching do not prove the capture
input's statistical validity.

## Identity and input ownership

The function accepts the actual `RGBDGraphMeasurements.State` and catalog. It
calls `PrepareProblem` internally, so a caller cannot provide a different
Problem with substituted endpoints, information scaling or factors. The
prepared `catalogSlot` mapping selects the supplied `finalPositionsBySlot` and
`finalRotationsBySlot`; raw capture means remain immutable. Every active final
pose is checked, including active nodes outside the selected pair. Inactive
pose, edge and sequence payloads may remain poisoned and are not validated.

`Context` carries generation, source revision, actual graph revision, input
catalog pose revision, and slot-indexed capture IDs and capture sequences. Its
occupied IDs must match the catalog and its sequences must be positive and
strictly increasing in capture order. A sequence denotes the accepted processing
step when that capture was born. It is not inferred from an ID, image epoch,
timestamp, ring slot or reference-replacement count.

The adapter constructs the expected Binding from actual prepared selectors,
catalog IDs/epochs/image times, Context sequence entries, graph revision and
explicit provenance tokens. Every Binding field must match. Graph node selectors
are range checked before indexing. Equal current/reference selectors require
the actual `GraphGaugeUncertainty.SameCapture` predicate: ID, epoch, timestamp
and accepted birth sequence must all agree. The catalog-derived expected Binding
must still pass actual `ValidBinding` and match every caller Binding field.
`Transport` owns exact duplicate relative means/rotations and all four 6D
covariance-block consistency. The duplicate estimate retains one shared graph
error in both rows; no independent duplicate covariance is introduced. The
transport's chronological binding rules still apply. The source revision and
pose revision remain caller context assertions: artifact loading verifies the
source digest and an outer persistent owner must maintain the pose revision and
capture-sequence ledger. `ContextFromLedger` calls the durable
`RGBDGraphCaptureLedger.Valid` owner against the actual catalog, source revision
and accepted step, then copies its IDs/sequences and the actual graph revision.
It checks graph generation/revision and pose-revision domains, while
`SelectAndTransport` retains actual graph-factor validation. Its incoming
Context remains whole on idle/refusal. The ledger and context factory are
reusable owners; wiring them into the outer session transaction remains work.

Rejection reasons are 1 disabled, 2 context/graph/sequence ledger, 3 selection or
binding, 4 final pose or anchor mean, 5 selected covariance, 6 gauge transport,
and 7 typed anchor binding or mean.
`covarianceStatus` and `transportReason` retain their respective owner's result.
Diagnostics begin at zero on each call. Result publication copies the incoming
Estimate first and replaces it only after both numerical owners accept.

## Reference gate

Run `node dev/check-modelica-graph-selected-gauge.mjs` with OpenModelica available
as `omc` or through `OMC_BIN`. The runner uses a fresh directory beneath
`$HOME/scratch/slam_web/tmp`, CPUs 10/11, a 120-second/8-GiB guardian and source
hash bookends. Coordinate those CPUs with the mapping reference gate. Durable
CSV/log/source identities are copied to
`dev/artifacts/modelica-graph-selected-gauge-semantics/`.

The 60 controls include 128 occupied wrapped catalog slots and 256 active
measured factors, final means different from raw captures, noncommuting anchor
and selected rotations, all 144 covariance cells, an anchor endpoint retaining
nonzero shared uncertainty, both signed shared-latent extremes, inactive poison,
and exact full-Estimate holds for disabled calls and each refusal stage.
The chart oracle differentiates composed manifold means independently and
compares against the world selected block. It invokes the actual covariance
solver separately on prescribed final poses; it does not independently prove
that solver's covariance calculation. The separate selected-covariance reference
gate owns its independent dense graph solve.

All four current gates passed on the same typed-wrapper/coarse-preconditioner
source closure. Each retains equal source hash bookends, strict three-row CSV,
successful simulation text and zero process exit status.

| Gate | Result | Time / peak RSS | Receipt |
| --- | --- | --- | --- |
| Original adapter | 60/60 | 23.70 s / 307 MiB | [ZiO2kU](../dev/artifacts/modelica-graph-selected-gauge-semantics/graph-selected-gauge-semantics-ZiO2kU/report.json) |
| Context factory | 16/16 | 5.18 s / 209 MiB | [ZKJdf3](../dev/artifacts/modelica-graph-selected-gauge-semantics/graph-selected-gauge-context-ZKJdf3/report.json) |
| Same-capture adapter | 20/20 | 12.66 s / 287 MiB | [Yaq1vm](../dev/artifacts/modelica-graph-selected-gauge-semantics/graph-selected-gauge-clone-Yaq1vm/report.json) |
| Typed anchor boundary | 24/24 | 13.57 s / 307 MiB | [siAsyf](../dev/artifacts/modelica-graph-selected-gauge-semantics/graph-selected-gauge-anchor-siAsyf/report.json) |

The [evidence index](../dev/artifacts/modelica-graph-selected-gauge-semantics/README.md)
retains historical receipts and exact source identities. These tests select
`maximumPCG=0`: they qualify conversion of the accepted conservative bound,
including an unconverged solve, and do not establish PCG convergence.

Run the separate 16-control context factory gate with
`node dev/check-modelica-graph-selected-gauge.mjs --context`. It calls no selected
solve and checks wrapped/partial catalogs, ignored inactive poison, ledger
ID/epoch/time/step/source/generation mismatches, graph/pose revision domains and
complete Context holds. It runs no selected covariance solve.

## Same-capture adapter controls

`node dev/check-modelica-graph-selected-gauge.mjs --clone` runs a separate
20-control acceptance. The original 60 adapter checks and 16 context checks are
unchanged. The appended controls include full128/256 and partial graphs,
noncommuting rotations, an anchor-endpoint clone retaining nonzero uncertainty,
all 144 covariance entries and exact shared 6D blocks, both signed latent-error
extremes, complete incoming Estimate holds and actual ledger identity refusals.
The old equal-selector/mismatched-Binding case remains a refusal. The acceptance
calls `Run(time)`, retaining runtime input dependence rather than a zero-input
function evaluated during compilation.

The original mismatched-identity case23 remains a refusal in the refreshed
60-control gate. Exact clone pose/covariance consistency is also checked in all
accepted appended cases.

`node dev/check-modelica-graph-selected-gauge.mjs --anchor` runs 24 separate
typed-boundary controls. They obtain the estimate from actual `FromCapture`,
compare all 144 transported entries using independent manifold derivatives,
cover distinct and cloned selected poses and the uncertain anchor endpoint,
and reject each swapped metadata field, wrong mean, inactive request, empty
record and late invalid bound while retaining the full previous Estimate.

These reference gates qualify controlled numerical adapter behavior only.
Rumoca/browser execution, statistical validity of input capture bounds, outer-session
integration and full SLAM are separate obligations. A new keyframe can make
current and reference the same capture. Its correction must consume one 6D
measurement through the separately owned full21 prior/gain/reset branch; this
adapter never performs correction or duplicated SPD12 fusion.
