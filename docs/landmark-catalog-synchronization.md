`UpdateCatalogLandmarkMap` connects keyframe membership and individual pose
changes to the indexed, anchored map update. It first calls
`RGBDLandmarkCatalog.Synchronize`, then `UpdateAnchoredLandmarkMap`, and commits
all map/anchor fields only if both accept. The public fixed-capacity interface
is `RGBDLandmarkCatalogMap`; prior/next state is explicit Modelica data.

The synchronization stage reads both previous and proposed catalog membership,
stable ids, positions and rotations. Old occupied landmarks must agree with
their old keyframe id/slot and world/local transform, and their confidence and
observation metadata must be valid. These checks occur before eviction or
reprojection can hide invalid prior state. Disabled catalog and empty map
payload are ignored; reset discards the prior generation's payload.

An evicted or reused keyframe slot removes its old landmarks and clears their
confidence and observation metadata **before the spatial index is built**.
The index therefore cannot merge a new observation into an evicted landmark,
even when their positions are identical. Retained landmarks receive their
own keyframe's pose correction using immutable local coordinates; distinct
keyframe corrections produce distinct world corrections. Empty storage is
canonicalized by the map update. A reset starts with empty geometry/anchors.

The map's catalog-geometry revision advances exactly once when enabled
membership, a retained identity or an enabled pose changes. Disabled payload
changes do not advance it; an unchanged geometry proposal holds it. Reset
advances the generation exactly once and starts revision zero. This revision
describes geometry/membership, not independent descriptor or histogram edits.
The owning keyframe/graph transaction must supply the accepted catalog state;
this component does not manufacture acceptance from a retrieval score.

If catalog preparation, the map update or anchor assignment rejects, the
original geometry, metadata, anchors, generation, geometry revision and
map clocks are all retained. Provisional eviction, projection and operation
counts become zero. Counts of occupied/confirmed/tentative landmarks describe
that held state. Accepted `prunedCount` includes both catalog evictions and the
map kernel's lifetime/distance pruning; `evictedCount` distinguishes the former.
Projection counts include retained occupied landmarks only when geometry
changes, and are zero for unchanged geometry and reset.

Outer rejection reasons are 1 for an unrequested transaction, 2 for catalog
preparation refusal and 3 for indexed-map/anchor refusal. The separate stage
reasons preserve the cause. Synchronization reasons are 1 unrequested,
2 invalid configuration/generation/reset, 3 rejected catalog proposal,
4 invalid previous/proposed nodes, 5 inconsistent revision,
6 invalid prior landmark ownership/metadata, and 7 refused reprojection.
The correction and indexed/anchor diagnostics retain their underlying reasons.

[All 28 independent controls pass](../dev/artifacts/modelica-landmark-catalog-semantics/README.md)
at 14,400 landmarks, 350 candidate slots and 128 keyframes, visiting 403,200
output slots. Accepted map outputs match an independent frozen map oracle
fed with closed-form expected corrections/pruning; anchor expectations also
use independent formulas. Refused cases check every held output field,
revision, clock and operation count. These are OMC semantics checks;
production compilation remains Rumoca SolveIR WASM.

The exact seven-file original/edit exports are produced by
`node dev/export-rgbd-landmark-catalog-map-source.mjs`. Current Chromium
issuance still refuses conditional output definedness in ToDae. It has no
Rumoca artifact or numerical browser execution. The complete keyframe record
capture, graph edge retention/correlation, joint estimator/reference/catalog
commit, reset/reload and moving-camera qualification remain required.
