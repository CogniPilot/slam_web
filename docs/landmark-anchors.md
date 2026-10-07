`RGBDMapAnchors.Reproject` supplies the map geometry transaction needed when
different optimized keyframes receive different pose corrections. A landmark
retains its position in its owning keyframe's body coordinates, its stable
keyframe identity and its catalog slot. Its displayed world position is

```text
p_world = R_anchor * q_anchor + p_anchor
```

At insertion, calibrated optical geometry must become a body-local anchor:
`q_anchor = cameraOriginBody + opticalToBody * q_optical`. It must be captured
with the identity of that same accepted keyframe. A merge retains the existing
anchor; reusing an empty/pruned map slot requires a new anchor assignment. The
current `RGBDLandmarkMap` supplies explicit insertion receipts through its
shared update kernel. `UpdateAnchoredLandmarkMap` now binds insertions to
keyframes and commits map metadata and anchors together; its full-domain
independent tests pass, but browser compilation still refuses conditional
definedness. See [the receipt contract](landmark-insertion-receipts.md) and
[the composed transaction and remaining boundaries](anchored-landmark-map.md).
World coordinates alone cannot recover stable ownership after individual
keyframes move.

The correction reads each cached catalog slot directly and checks its stable
identity. Catalog slots must remain fixed within a generation. If a keyframe
has been evicted or its slot reused under a new identity, the old landmarks
are pruned rather than attached to the new occupant. Node identities must be
unique; positions must be bounded and rotations proper. Disabled graph slots
and unoccupied map slots may contain ignored payload. Accepted empty slots are
canonicalized to zeros.

The component supports the complete 14,400-landmark and 128-keyframe domains.
Reprojection makes one pass over landmarks, with no keyframe search per point.
Unique-node validation makes at most 8,128 comparisons at the full node
capacity. These are operation-domain bounds, not measured speedups. Correction
runs when a graph transaction changes; it is not intended to run at the image
rate when no graph correction is pending.

The graph and map must share a generation, and a correction advances the map's
graph revision by exactly one. `graphAccepted` must come from an accepted graph
transaction, not appearance retrieval or a UI control. The source checks that
flag and the supplied pose snapshot but does not prove optimizer convergence
or statistical edge admission. Repeated reprojection uses immutable local
geometry, so it does not compound transforms already applied to world points.

Every landmark is validated before acceptance. Malformed active map payload,
out-of-range slots, duplicate node identities, improper rotations or transformed
coordinates outside the configured bound refuse the transaction. A failure at
the final landmark preserves every prior point, local coordinate, occupancy,
anchor identity, slot and revision; counts return to zero. Rejection reasons
are 1 disabled, 2 configuration/version, 3 graph not accepted, 4 graph state,
5 map state and 6 corrected coordinates.

The function proposes map geometry only. The final SLAM owner must commit graph,
filter/reference/covariance and map together. It must also carry confidence,
observation time, frame identity and occupancy pruning together, rebuild the
map index for the new geometry, and preserve all owners on refusal. Reset and
saved-state reload must retain or reset generation, revisions and anchors
coherently. The existing global filter reanchor does not establish a correlated
multi-keyframe graph correction policy.

Independent tests use every landmark slot and all 128 graph nodes, with closed
form transforms for two differently corrected owners. They cover the final
map/node slots, repeated revisions, eviction/reuse, ignored disabled payload,
invalid inputs and full-state rollback. All28 checks pass with unchanged
production source hashes before/after; preparation plus execution took 1.65 s
and peaked at 104,768 KiB owned RSS. These are test measurements, not realtime
factor. [The accepted report and historical preparation diagnostics](../dev/artifacts/modelica-map-anchor-semantics/README.md)
retain the full-domain calls and source bindings. Run
`node dev/check-modelica-map-anchors.mjs` with `omc` or `OMC_BIN`. OMC is an
independent semantics tool; its results do not establish browser execution.
Actual Rumoca preparation currently rejects the wrapper's package-constant
dimensions during Typecheck. No browser artifact or integrated graph/map
transaction has been accepted.
