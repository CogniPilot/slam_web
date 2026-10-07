`RGBDKeyframeRetrieval.PrepareCapture` queries appearance directly from the
retained keyframe geometry catalog. It normalizes descriptors, assigns the
configured vocabulary and uses the existing TF-IDF/cosine retrieval owner.
Its outputs are a prepared measurement with the resulting histogram and up to
four catalog-bound candidate identities, slots and scores.

There is no second persistent histogram FIFO or retrieval clock. The subsequent
keyframe capture publishes the histogram with descriptors, calibrated optical
points, pose, identity and epoch. The query excludes the slot that the pending
capture would evict, so a returned proposal can remain a retained graph node
after that capture. Use this adapter when preparing a capture; reset first
provides the newly initialized catalog and matching measurement generation and
vocabulary.

Header and measurement metadata are checked before retrieval. Active malformed
history refuses the preparation. The prepared frame must pass the full catalog
admission checks. Candidate Real domains are certified before Integer conversion
and indexing, then bound back to generation, vocabulary, identity and age.
A refusal holds every original measurement field and clears proposals and
assignment outputs. The previous catalog is trusted Modelica-owned state;
external restores must pass the existing full catalog validation first.

All 20 complete-domain reference controls pass; see
[the source-bound reference evidence](../dev/artifacts/modelica-keyframe-retrieval-semantics/README.md).
`RGBDKeyframeRetrievalStep` is the browser compilation surface and
`dev/export-rgbd-keyframe-retrieval-source.mjs` exports its exact five files.
Actual browser compilation on PR382 CI tip97140341c refuses package-qualified
`proposalCapacity` array dimensions during Typecheck. The exact five-file
source SHA is `fd80e746...acdb0f`; no artifact or browser numerical case exists.
This is assigned to the compiler agent's general constant-dimension fix.
A similarity
score supplies a geometric-verification candidate, never a graph constraint.

The [catalog-loop stage](catalog-loop-proposals.md) now joins this retrieval
to all four geometric verifiers. Its 10 full-domain reference controls pass,
including sparse-final and dense350 matching, but its browser compilation
still refuses the same package-constant dimension owner.
