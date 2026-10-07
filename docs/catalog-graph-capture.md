# Visual capture and graph admission

`RGBDCatalogGraphCapture.Capture` connects the qualified Modelica visual and
graph owners in one proposal:

1. Prepare the capture histogram and retrieve up to four retained keyframes.
2. Match descriptors, verify geometry and calculate body-relative uncertainty
   for each candidate.
3. Verify a consecutive visual measurement from the previously newest
   keyframe to the prepared capture. This measurement uses the same calibrated
   geometry owner, with no minimum loop age.
4. Store the prepared immutable frame in the catalog.
5. Admit sequential and loop edges, prune evicted endpoints and prepare the
   chronological optimizer inputs.

No step publishes persistent state. The returned catalog and graph are both
held exactly when any step refuses, including a failure in final optimizer
input preparation after graph admission has succeeded. Prepared visual and
graph diagnostics are separate proposals and must not be used as committed
state. The outer estimator/reference/map transaction still owns publication.

The first capture needs no sequential edge and produces a one-node graph.
The current joined API handles ordinary captures; resetting every owner into
a new generation remains an outer operation. Per-candidate and sequential
RNG seeds are separate inputs, so retries can reproduce the same decisions.

All ten connected reference checks pass at the full 128-keyframe/256-edge
capacity, retaining the 350-feature domain and 96 consensus trials. Positive
checks verify the known optical transformation, actual admission of a
sequential measurement and four loops, eviction of keyframe 1, correct
chronological ordering and the dense350 case. Refusal checks verify the exact
failure stage and every catalog/graph field, including inactive payload,
after exhausted edge IDs, failed sequential geometry, disconnected prior,
invalid generation/epoch/time and late optimizer-input refusal.

Evidence: [source-bound reference results](../dev/artifacts/modelica-catalog-graph-semantics/report.json).
The 37.23-second reference result includes preparation, native reference build
and execution. It is not browser throughput or a real-time performance figure.

```sh
node dev/check-modelica-catalog-graph.mjs
node dev/export-rgbd-catalog-graph-source.mjs
```

The first command uses an independent reference compiler selected by
`OMC_BIN`. The exporter only joins the exact authored sources; Rumoca owns
production compilation. The thirteen-file public `RGBDCatalogGraphStep`
source SHA `ab439373...d7b106` was tested in an actual Chromium compiler worker
on PR382 CI module `66338544...ec481c`. It refuses package-qualified
`proposalCapacity` dimensions in Typecheck. No executable artifact was issued.
See [browser receipts](../dev/artifacts/pr382-9714034-browser-source-gates/README.md).

This connects visual loop verification to measured graph admission. Full graph
optimization, consistent inertial/reference corrections, joint landmark-map
publication, moving-image sequences, reset/reload, browser execution and
whole-step performance remain required for complete SLAM.

The [capture/mapping composition](catalog-mapping-capture.md) now joins this
visual proposal to calibrated projection and anchored mapping, with eighteen
full-domain reference passes and whole-owner rollback. This remains a staged
proposal; current/reference estimator and graph correction publication are
not yet connected.
