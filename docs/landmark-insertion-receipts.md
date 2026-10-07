`UpdateLandmarkMapWithReceipts` is the shared numerical map update. The existing
`UpdateLandmarkMap` signature delegates to it, so old callers retain their
outputs. Both functions inherit the common input/output declarations from
`RGBDLandmarkMapInterface`; the update algorithm exists once.

The extra `insertedFeature` Integer array has one entry per map slot:

| Receipt | Meaning |
| --- | --- |
| `0` | This transaction did not insert into the slot. Use occupancy to distinguish retained and empty slots. |
| Positive candidate index | This slot was inserted from that original candidate slot, including sparse final candidate slots. |

Insertion receipts are initialized to zero and written only when insertion
actually happens. Later same-frame merges preserve the original receipt and
anchor identity. Rejected transactions return zero receipts. A reset clears
old slots before inserting and issues receipts for its new points.

Receipts are required because pruning can free a slot and immediately reinsert
a point at exactly the same position. Position/confidence differences cannot
identify that event reliably. Such a slot needs a new keyframe anchor even
though its world coordinates did not change. Receipt production belongs to the
Modelica update that owns the insertion decision, rather than a host-side
comparison of outputs.

All28 full-output map regressions still pass against the frozen pre-index
oracle at 14,400 map slots and 350 candidates (3,225,964 scalar comparisons).
All16 additional receipt cases pass and visit 230,400 receipt slots. They
cover unique original candidate identities, feature350, map slot14400,
duplicate merges, pruning/reinsertion at identical coordinates, reset and
invalid/drop/refusal paths. [Source-bound evidence and reproduction commands](../dev/artifacts/modelica-landmark-map-receipts/README.md)
are retained with the prior owner source. These tests are independent OMC
semantics checks; production compilation remains Rumoca SolveIR WASM.

The updated two-file browser source still refuses `RGBDSpatialIndex.Find`'s
bounded while statement in ToDae. Original compiler-gate exports remain
unchanged, and the updated source is qualified separately. No WASM artifact
has been issued for either source version.

`AssignLandmarkAnchors` and `UpdateAnchoredLandmarkMap` now assign body-local
coordinates and stable identities, retain merged anchors and clear empty
slots. Both owners commit together; all 40 assignment and 20 composed
full-domain independent checks pass. Actual browser issuance still refuses
conditional output definedness. The outer catalog/graph/filter commit remains
required. See [the composed owner](anchored-landmark-map.md) and
[the correction convention](landmark-anchors.md).
