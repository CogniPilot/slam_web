# Editable visual-word retrieval

`models/LoopClosure/RGBDBagOfWords.mo` is a standalone appearance retrieval component. It
proposes up to four retained keyframe IDs. A proposal is a cosine similarity,
not a probability or accepted loop constraint. Every proposal still needs the
full descriptor matcher and geometric registration before it can enter a pose
graph. No position, heading, trajectory truth or scene identifier is an input.

The component accepts 350 descriptors of49 cells and an explicit 256×49 learned
or configured vocabulary with enabled masks. Modelica removes patch means,
normalizes usable descriptors and vocabulary words, assigns each feature to the
nearest enabled word within an editable squared-distance gate, and constructs
an L1-normalized term-frequency histogram. It derives smoothed inverse document
frequency from the retained histories and ranks their weighted histograms by
cosine similarity. This follows the visual-word retrieval method described by
[Sivic and Zisserman](https://www.robots.ox.ac.uk/~vgg/publications/2003/Sivic03/).
[RTAB-Map's documentation](https://github.com/introlab/rtabmap/blob/master/doxygen/mainpage.md)
likewise distinguishes appearance hypotheses and subsequent geometric checks;
this component does not reproduce RTAB-Map's incremental dictionary, Bayesian
hypothesis filter, graph optimizer or multi-tier memory.

The vocabulary is explicit persistent input, rather than hand-written scene
signatures. A caller can provide centers learned from measured image patches.
This component does not train those centers. The caller must increment
`vocabularyVersion` when changing their meaning; Modelica then clears histories
that were quantized under the old version. Re-training and richer image
invariance remain separate work. Small intensity patches are susceptible to
viewpoint changes and repeated textures.

Persistence is explicit: copy `nextHistogram`, `nextEnabled`, `nextKeyframeId`,
`nextKeyframeTime`, `nextVersion`, `nextSlot` and `nextTime` into their matching
`previous*` inputs for the next invocation, and retain the vocabulary and its
version. The host performs buffer copies and serialization. Modelica owns the
bounded 128-slot FIFO update, including replacement of an existing keyframe ID.
`storeKeyframe=1` must come from genuine upstream geometric keyframe admission;
retrieval itself cannot certify that decision. Querying precedes insertion. Candidate slots refer to the previous history; a
returned slot can be overwritten by the subsequent FIFO update. Use its stable
keyframe ID and retained descriptor/point snapshot for geometric verification.

`minimumAge=2.0` uses supplied simulation seconds, independent of RGB-D frame
rate. Similarity ties rank by ascending keyframe ID then slot. Word-distance
ties choose the lower word index. Disabled padding contributes no descriptor.
Unusable patches and words are omitted; absent vocabulary or insufficient
assigned features yields no candidates. Corrupt history rows are cleared and
counted. Invalid configuration prevents retrieval and insertion. Reset and
vocabulary-version changes invalidate old histograms.

The independent TypeScript fixtures cover full350 assignment, transformed
revisits, geometric aliases, empty vocabulary, missing measurements, temporal
exclusion, deterministic ties,90Hz repeated-keyframe upserts,128-slot wrap,
JSON state persistence, vocabulary revision, invalid state and an editable
similarity boundary. The oracle is test code, not a production fallback.

Source-bound numerical tests are gated by `RUMOCA_BOW_ARTIFACT` and optional
`RUMOCA_BOW_EDITED_ARTIFACT`. The latter must use the same full-capacity source
with only `minimumSimilarity = 0.35` changed to `0.99`; its boundary fixture must
change one proposal to zero. The baseline gate checks every output, immutable
P bytes, source identity, reset, artifact/state JSON reload and recovery. An
optional `RUMOCA_BOW_NUMERICAL_REPORT` records actual execution evidence.

No compiler admission, native numerical pass, browser integration, performance
or complete SLAM claim follows from the source and oracle tests. The next gate
is compilation and source-issued NativeProgram preparation of the unchanged
`RGBDBagOfWords` model using the coordinated immutable review producer, then
these full-capacity executable tests. The application's production compiler pin
and current estimator are unchanged by this component.
