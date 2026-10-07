Application ownership work after insertion receipts
=================================================

Current evidence
----------------

- `models/RGBDLandmarkMap.mo`: common partial-function interface, one shared
  `UpdateLandmarkMapWithReceipts` algorithm, compatible legacy delegate.
  Current owner SHA `0e5e664b...61d166c`; old owner is preserved in
  `dev/artifacts/modelica-landmark-map-receipts/previous-owner-source.mo`.
- Legacy28 full-output differential checks PASS at 14400/350 with 3225964
  scalar comparisons. Receipts16 checks PASS with 230400 visited slots.
- `models/RGBDMapAnchors.mo` reprojection remains unchanged SHA `297dc4d6...3345333`;
  its28 full14400/128 checks PASS. These are OMC semantics, not browser execution.
- Actual current CI browser module still refuses the new map in ToDae at
  `RGBDSpatialIndex.Find`'s bounded While. Exact source SHA `33031c72...d2d808b`,
  exported under `$HOME/scratch/slam_web/tmp/pr382-87b5570-source-gates/indexed-map-receipts/`.
- Original frozen map and 18-source localization gates remain available unchanged.
  Compiler owner uses `dev/rumoca-agent-handoff.md`; watch for its replies/artifacts.

Implemented Modelica owner (browser qualification pending)
---------------------------------------------------------

`models/RGBDMapAnchorAssignment.mo` supplies `AssignLandmarkAnchors`;
all40 independent full-domain controls pass. `models/RGBDAnchoredLandmarkMap.mo`
calls the shared receipt kernel and assignment in one transaction; all20
full-domain differential/rollback controls pass. Evidence is under
`dev/artifacts/modelica-map-anchor-assignment-semantics/` and
`dev/artifacts/modelica-anchored-landmark-map-semantics/`.
The exact five-file browser source SHA is `ccf6f84b...b22f82`; actual Chromium
on the existing CI module refuses conditional definedness of `confirmed`
in ToDae. It has no artifact or numerical browser case. The general guard
definedness issue is now in the compiler handoff. The contract below is
implemented and independently checked; outer ownership remains incomplete.

Anchor assignment consumes the private `insertedFeature` receipt, without
inferring insertion from map output differences and without duplicating the
map algorithm. Preserve full14400 map / 350 candidate / 128 catalog domains.

Inputs should include prior map points/occupancy and anchor local coordinates,
ids/slots/generation; next map points/occupancy and receipts; original calibrated
world candidates/masks/count; a checked retained catalog pose/id/slot for the
chosen anchor; map acceptance/request/reset and ownership generation.

- Positive receipt: require a valid original candidate index/mask, unique use
  of that index, and exact equality of the inserted point to that candidate.
  Bind a stable retained keyframe identity/slot and compute local geometry
  entirely in Modelica. One valid convention is
  `q_local = transpose(R_anchor)*(p_world-p_anchor)` using the retained pose;
  if direct optical geometry is used, include the correct camera extrinsic
  and relative body pose for that chosen retained keyframe.
- Zero receipt + occupied: require a retained previous occupied slot and an
  unchanged world point; preserve the old local geometry/id/slot. Validate
  cached identity against the catalog. Catalog eviction must prune those
  anchors before the spatial index/map update, so this branch cannot attach
  an old landmark to a reused catalog slot.
- Empty: clear local geometry/id/slot on acceptance.
- Reset: all occupied next slots must be new insertions; advance ownership
  generation coherently with catalog/filter/map reset.
- Any late invalid receipt/anchor/state: roll back every prior anchor field;
  the outer owner must also hold the map values, times, frame labels, counts
  and catalog/filter owners. Standalone map acceptance is insufficient.

Use generic array dimensions in independent test helpers but assert/call the
full domains; fixed-size test helper preparations previously timed out. OMC
rank-two `max(abs(matrix))` generated invalid C; test-only comparisons can use
explicit element reductions as in RGBDMapAnchorTests. Do not rewrite production
math or lower capacities merely to appease the reference compiler.

Required independent controls: insert, merge preserving prior anchor,
prune/reinsert at identical position assigning a new anchor, sparse feature350,
map slot14400, cached catalog slot128, duplicate/tampered/out-of-range receipts,
malformed active state, disabled payload, reset/refusal and full rollback.
The map kernel and assignment are now composed and tested to hold both owners
on either failure. `UpdateCatalogLandmarkMap` additionally synchronizes old/new
catalog geometry, evicts before indexing, reprojects individual anchors and
rolls back every original field on later failure. All28 full14400/350/128
independent controls pass; actual browser issuance still refuses conditional
definedness. Next work is keyframe record capture and joint graph/filter/reference/map commits, alongside compiler
qualification. Browser issuance/numerical/edit/persistence gates remain
separate. Do not claim full SLAM or 10x until actual connected browser execution
proves it.
