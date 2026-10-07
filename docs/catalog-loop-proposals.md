`RGBDCatalogLoopStep` connects appearance retrieval and geometric loop
verification in Modelica. Its Batch result contains the prepared keyframe,
retrieval diagnostics, four calibrated geometric proposals and their seed
states. Each proposal reads retained descriptors, optical points, calibration
and pose metadata from the same immutable catalog used for retrieval.

Before reading a candidate slot, the owner checks index and identity domains,
generation, vocabulary, current capture identity and appearance-score bounds.
The pending eviction slot is excluded. Geometry then uses the existing full
descriptor matcher, bounded consensus/refinement, relative uncertainty and
optical-to-body covariance transport. Appearance alone cannot verify a loop.
Per-candidate seeds have independent inputs/outputs; the authored graph does
not require serial RNG advancement between candidates. Compiler scheduling
and actual multithreaded execution remain unqualified.

The catalog is trusted Modelica-owned state; external restoration must first
pass full catalog validation. The stage neither mutates the catalog nor
admits any graph edge. A prepared frame can proceed to capture even if every
appearance candidate fails geometry. Graph identity retention, shared-image
correlation and joint estimator/reference/catalog/map publication remain
separate requirements.

All 10 connected full-domain reference controls pass, including four positive
proposals and a dense350-feature case. See
[the exact results and boundaries](../dev/artifacts/modelica-catalog-loop-semantics/README.md).
`dev/export-rgbd-catalog-loop-source.mjs` exports the exact eleven-file graph.
Actual Chromium preparation of source SHA `ae93dd50...450a80` through PR382 CI
tip97140341c refuses package-qualified proposalCapacity dimensions during
Typecheck. The failure is assigned to the existing general compiler fix; no
Rumoca/browser artifact or numerical case has been issued for this graph.

The separate [catalog/graph capture composition](catalog-graph-capture.md) now
adds consecutive visual measurements, catalog storage and measured graph
admission. Its ten full-domain reference controls pass. The proposal-only
stage described here still owns no persistent state; coordinated estimator,
reference, graph and map publication remains required.
