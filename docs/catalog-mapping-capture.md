# Visual capture, graph and anchored map

`RGBDCatalogMappingStep` joins the existing visual/catalog/graph capture,
calibrated landmark projection and anchored mapper in one Modelica source
graph. Mapping consumes the already admitted capture; it does not store the
same frame a second time. The new `RGBDCatalogMapping.State` record retains
all map coordinates, occupancy, confidence, observation metadata, anchor-local
points, stable anchor identities, generation and catalog-pose revision.

The returned catalog, measured graph, map and optimizer inputs are published
as one proposal only when all stages accept. A late map failure holds all old
owner fields, including inactive payload, and clears the optimizer proposal.
Per-stage diagnostics are observations of staged work, not committed state.
The enclosing current/reference estimator must still join publication.

Projection is bound to the admitted immutable frame: every enabled map
candidate must equal its optical point transformed through its camera
extrinsics and estimated body pose. Map synchronization validates the old
anchor geometry before eviction or reprojection. Eviction prunes a landmark's
stable keyframe identity before the reused ring slot can receive new points.
Insertion receipts bind newly inserted features to the current captured
keyframe; retained and merged points keep their existing local anchors.

## Sensor epochs and map observations

Camera image epochs can have gaps between captures. They are not map update
counters. Each accepted transaction records the captured `imageEpoch` and
`imageTime`, and increments the independent consecutive map `frame` counter
once. For example, a captured camera epoch128 followed by200 produces map
counter128 followed by129. Raw image identity and sensor time are preserved.
An already used or stale map image epoch refuses the entire proposal.

The reference tests exposed and corrected an earlier bug that passed camera
epoch200 directly into the mapper's consecutive counter. The earlier numerical
failure and its source hashes remain preserved. No test input was changed to
hide the epoch gap.

## Evidence and remaining integration

All18 joined reference checks pass at full capacity: 14,400 map slots,
350 feature slots, 128 keyframes, 256 graph edges and96 hypotheses. Controls
include actual sequential/four-loop visual capture, first capture, dense350,
final feature/map slots, independent calibrated world coordinates, merges,
insertion receipts, eviction, lifetimes, confidence promotion, separate
clocks and exact owner rollback. A full14,400-occupied map with malformed final
slot is refused after the visual proposal has accepted.

Two separate checks also execute the actual350-feature projection equation
component against independent closed-form calibrated coordinates. Both pass.
The initial combined reference build exceeded its120-second preparation bound
and remains recorded as incomplete. The separate full-domain reference builds
do not constitute execution of the entire public browser wrapper.

The joined function check took44.38s with peak owned RSS575904KiB; the
projection check took82.71s with peak891836KiB. Both timings include independent
reference preparation/build/execution, not WASM throughput. Source bookends,
fresh strict CSV and simulation-success checks pass for both current sources.

```sh
node dev/check-modelica-catalog-mapping.mjs
node dev/check-modelica-catalog-mapping.mjs --projection
node dev/export-rgbd-catalog-mapping-source.mjs
```

Use `OMC_BIN` for the independent reference compiler. Production compilation
and execution belong to Rumoca SolveIR. The exact21-file browser export
SHA `4520ceb1...351de8` was refused by published module `66338544...ec481c` in
Typecheck1447.7ms: lexical package dimensions in map record fields and
package-qualified proposal dimensions remain unresolved. No artifact was
issued. See [reference evidence](../dev/artifacts/modelica-catalog-mapping-semantics/README.md)
and [browser receipts](../dev/artifacts/pr382-9714034-browser-source-gates/README.md).

This owner handles captures. The new [every-frame Modelica dispatcher](catalog-frame-processing.md)
adds keyframe selection and a noncapture mapping branch so every due sensor
frame can enter the lockstep barrier while retaining places long enough for
loop retrieval. Its local reference checks do not constitute browser runtime
integration. Nonlinear graph solve, consistent current/reference corrections,
complete reset/reload, moving-image browser acceptance and whole-step
performance remain required.
