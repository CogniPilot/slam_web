# Measured pose graph

`models/RGBDGraphMeasurements.mo` owns a bounded graph of measured body-frame
relative poses. The immutable keyframe catalog owns the node identities, image
epochs, calibration and pose estimates. The graph has 256 edge slots for the
catalog's 128 keyframes. These capacities are named constants, not a packed
prefix of the feature or landmark domains.

An edge stores a stable edge ID, its two keyframe IDs and cached ring slots,
image epochs, a body rotation/translation and the unmodified relative
covariance/information from geometric verification. It does not store an
estimated pose as an observation. Disabled slots have no statistical role.

## Capture and lifetime

`Capture` takes the old catalog, a catalog containing one already admitted
capture, the old graph, one consecutive-frame measurement and up to four loop
proposals. It checks the catalog transition and the old graph before pruning.
The catalog payload comes from the qualified capture owner; an external restore
must pass both `RGBDKeyframes.ValidCatalog` and `ValidState` first. A header
check alone does not certify descriptors, geometry or calibration.

Every retained consecutive keyframe pair must have a measured sequential edge.
The first capture needs none. Each later capture requires a verified measurement
from the previously newest keyframe to the new keyframe. Loops cannot replace
this chain requirement. A newly introduced disconnected node is refused.

Before admission, edges whose keyframes were evicted are cleared. Verified
proposals are bound to the current generation, retained identities and image
epochs. Admission checks proper rotations, SPD covariance/information and their
inverse relation, calibrated optical-to-body transport, the entire 350-slot
inlier/partner domain, one-to-one partners, residuals and reported RMS. A
verified but malformed proposal refuses the whole capture. Unverified proposals
are ignored. Repeated endpoint pairs are counted and do not create duplicate
edges or consume an edge ID.

When all edge slots are occupied, insertion replaces the oldest loop edge by
stable edge ID. It never replaces a sequential edge. Edge identities do not
wrap; exhausted identity/revision domains refuse admission. An explicit reset
accepts a first capture in a newer generation, with a fresh graph, and can
recover a damaged old payload.

All work is local to the returned proposal. On any failure, every field of the
old graph is held, including disabled payload; mutation counters are zero. The
caller still has to commit graph, catalog, estimator, reference and map together.
The public `RGBDGraphMeasurementStep` wrapper performs no persistent publication.

## Optimizer ordering and correlation

`PrepareProblem` maps retained keyframes into chronological optimizer rows.
The oldest surviving keyframe is row 1, which the existing optimizer fixes as
its gauge. After capture 129 evicts keyframe 1, row 1 is keyframe 2 even though
ring slot 1 contains keyframe 129. Edges use this same ID-to-row mapping.
Malformed node pose estimates or an invalid graph refuse the entire problem.

Relative measurements can share images. Treating each raw information matrix as
independent evidence would count shared noise multiple times. The default makes
no independence assumption between graph measurements. With E active edges it
passes `information_e / E` to the optimizer and preserves every raw stored
matrix. The number of active edges, rather than allocated capacity, determines
the scale; a single-node, zero-edge graph uses a factor of 1.

The linear covariance bound behind this policy is explicit. Suppose each
zero-mean error has marginal covariance bounded by R_e, and let C be their
joint covariance with arbitrary cross correlations. For any block vector x,

```
x' C x <= (sum_e sqrt(x_e' R_e x_e))^2
        <= E * sum_e x_e' R_e x_e.
```

The first inequality follows from covariance Cauchy–Schwarz, and the second
from the scalar Cauchy–Schwarz inequality. Thus `C <= E * blockdiag(R_e)` in
the positive-semidefinite order. Uniform scaling preserves the undamped
least-squares minimizer; it changes the information scale and can affect damped
iteration steps.

This is a conditional linear noise policy. Existing registration covariances
are first-order estimates under the model described in
[registration-uncertainty.md](registration-uncertainty.md), not certified bounds
for selection errors, wrong matches, calibration errors or nonlinear bias.
This policy does not make graph results independent of the inertial prior, and
does not justify feeding an optimized pose into an ordinary independent
measurement update. Graph marginal uncertainty, uncertain gauge transport and
a consistent graph/filter/reference/map correction remain separate work.

## Verification scope

The independent reference checks use the full 128-node/256-edge domain,
350-slot sparse features including slot 350, and actual `Capture` calls. They
check four-loop capacity replacement, chain preservation, eviction, duplicates,
malformed and stale measurements, whole-state holds, reset recovery, chronological
mapping and every active scaled information matrix. The joined optimizer input
is checked by the existing `PGValidateGraph`; the full nonlinear optimizer is
not thereby qualified.

Evidence and exact tested source hashes are in
`dev/artifacts/modelica-graph-measurement-semantics/`. Run the bounded reference
check with `OMC_BIN` set to a reference compiler:

```sh
node dev/check-modelica-graph-measurements.mjs
```

OpenModelica is independent reference tooling only. Production compilation and
WASM execution belong to Rumoca SolveIR. Browser source issuance, moving-image
SLAM, persistent coordinated corrections and throughput still require their
own acceptance gates.
