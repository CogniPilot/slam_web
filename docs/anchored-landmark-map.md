`UpdateAnchoredLandmarkMap` combines the shared indexed map kernel and
`AssignLandmarkAnchors` in one standard Modelica function. Private insertion
receipts carry the original candidate index; host code does not infer ownership
from changed point values. The wrapper `RGBDAnchoredLandmarkMap` keeps the full
14,400/350/128 domains and exposes explicit prior and next state.

An insertion receives a checked stable catalog identity and cached slot, with
`q_local = transpose(R_anchor)*(p_world-p_anchor)`. A retained or merged landmark
keeps its previous identity/local coordinates and must agree with its retained
catalog pose. An empty destination clears its anchor. Receipt indices must be
unique, enabled and within the actual candidate count, and the inserted point
must equal its original candidate. Disabled payload is ignored. `clearedCount`
counts canonicalized empty slots, including slots already empty.

Map and anchor acceptance jointly control one commit. If either rejects,
geometry, occupancy, confidence, observation timestamps/frame labels, map
clocks/world frame and every anchor/generation hold their previous values.
Insertion/merge/prune/drop/invalid-candidate and anchor-operation counts become
zero. Occupied/confirmed/tentative counts describe the held state. Outer
`rejectionReason` is 1 for an unrequested transaction, 2 for map refusal and 3
for anchor refusal; separate map/anchor reasons preserve the underlying cause.

A reset advances the ownership generation exactly once, matches the catalog
generation and requires every resulting occupied destination to be a fresh
insertion. Prior disabled/reset payload can be discarded. No identity is
transferred to a reused catalog slot merely because its array position matches.

`UpdateCatalogLandmarkMap` now supplies checked eviction pruning and individual
pose reprojection before indexing/insertion, with rollback to the original
state on later failure. Its full-capacity independent checks pass; browser
issuance remains blocked. See [the catalog transaction](landmark-catalog-synchronization.md).
The enclosing SLAM owner still must supply and jointly commit a coherent catalog.
Current/frozen-reference poses, covariance/cross-covariance and graph/catalog
state must join the same outer commit. This function alone does not implement
those owners, edge correlation policy or complete SLAM.

Independent Modelica tests pass all 40 assignment cases and 20 composed cases
at the original capacities. The composed suite compares every accepted map
output to the frozen pre-index oracle and every anchor to independent
closed-form expectations; refused cases check whole-state rollback.
[Assignment evidence](../dev/artifacts/modelica-map-anchor-assignment-semantics/README.md)
and [composed evidence](../dev/artifacts/modelica-anchored-landmark-map-semantics/README.md)
retain source hashes, commands, logs and resource records. OMC is used only for
independent semantics checks; browser production stays on Rumoca SolveIR WASM.

The exact five-file export is produced by
`node dev/export-rgbd-anchored-landmark-map-source.mjs`. Original source and
an edit to only the wrapper's confirmation threshold are separate source-bound
gates. Actual Chromium issuance with CI module `152316db...f29cd` refuses
`UpdateAnchoredLandmarkMap`'s conditional definition of `confirmed` in ToDae.
The function defines it either in the map-call branch or in the rollback loop;
acceptance can become 1 only through the branch that defines it. Independent
tests prove behavior but do not establish Rumoca admission. The compiler-owner
handoff requests general source-ordered definedness with related guards;
no dummy output values, application backend or reduced domain is substituted.
