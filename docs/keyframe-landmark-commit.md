`UpdateKeyframeLandmarks` joins retained keyframe capture and anchored landmark
mapping in Modelica. `RGBDKeyframeLandmarkStep` also connects calibrated optical
projection to that transaction. No host numerical backend is used.

The transaction binds measurement time, epoch, generation, vocabulary, body
pose and optical extrinsics. Enabled map candidates must agree with the same
measurement's projected optical points. Catalog eviction prunes dependent
landmarks before indexing; surviving points retain their keyframe anchors.
Catalog capture, map geometry, anchors, generations, revisions and clocks
publish together. A later refusal retains all prior catalog and map values.
Reset likewise commits both owners together. Frames without a new capture can
use an existing anchor.

The standalone catalog passes all 20 original full-capacity reference controls.
The new combined 16-case fixture retains 14,400 map slots, 350 features and
128 catalog slots, and compares whole catalog snapshots and every map output
slot. All 16 cases now pass on every result row, validating 230,400 map slots
per evaluation. Owned reference preparation/execution took 24.81 seconds.
Earlier preparation/build timeouts and an unscalarized equation-count refusal
remain preserved. Profiling identified an expanded 32,768-argument C call;
disabling reference function-argument expansion avoided that build cost.
Catalog initialization now copies one canonical frame per slot and passes
all 20 original controls plus exhaustive initialization equivalence against
the frozen pre-optimization frame defaults. See
[the results and preserved attempts](../dev/artifacts/modelica-keyframe-landmark-semantics/README.md).

Actual Chromium compilation of the exact eleven-file source through Rumoca
PR #382's CI package at tip `97140341c` refuses implicit record-constructor
metadata for `RGBDKeyframes.Catalog` in ToDae. A generic four-slot mixed
Integer/Boolean/Real record reproduction reaches the same refusal. The Rumoca
agent has accepted a general fix, but no corrected artifact has been qualified.
The current source with revised initialization was also checked in Chromium:
eleven-file SHA `66fa15ba...c615c` reaches the same constructor refusal.
See [the source-bound browser receipts](../dev/artifacts/pr382-9714034-browser-source-gates/README.md).

Catalog-bound appearance retrieval now has its own Modelica owner and 20
full-capacity reference passes; see [keyframe retrieval](keyframe-retrieval.md).
The separate [visual catalog/graph capture](catalog-graph-capture.md) now joins
retrieval, geometric verification and measured graph-edge admission with ten
full-domain reference passes. This landmark transaction still needs
descriptor/frontend integration, correlated estimator and reference ownership,
and joint graph/filter/catalog/map publication. Moving-image, reset/reload and performance
qualification remain required before complete browser SLAM can be claimed.
