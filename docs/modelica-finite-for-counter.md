# Finite For counter bounds: verified scope and remaining admission frontier

The compiler now has a separate checked induction recognizer for an initialized
scalar Integer counter with one optional unit increment in a finite For. It
publishes a conservative interval for the complete statement sequence, without
pretending the final count is a constant. The old single-iteration inference and
its repeated-counter refusal regression remain unchanged.

The recognizer uses resolved declaration identity, a literal initializer, exact
whole-domain cardinality, checked arithmetic and a complete write inventory.
Range references must match the owning function input's name and DefId and must
remain unwritten/unshadowed. Malformed cached spellings, unrelated identities,
unknown/decrement/multiple writes, partial receivers, overflow and nested
unproved loops yield no induction fact; no identity is repaired by name.

Sixteen new controls passed, including full14400 canonical interpreter
comparisons of count, ordered suffix membership, lexical restoration and
active/inactive overflow. The unchanged repeated-counter control, seven existing
dependent-domain controls, and strict nine-package Clippy also passed. The first
reference attempt had one FuelExhausted failure: the interpreter counts expression
visits as well as statements. Its corrected test-only400000 fuel bound covers the
fixed full14400 fixture; the domain and production limits did not change.

The unchanged full14400 RuntimeCandidateCount source **has not been admitted as a
native executable**. Its actual source gate timed out after180.253 seconds
(exit124, peak43148KiB), without a prepared-model callback, native/Solve artifact
or numerical execution. This is not a passing admission or throughput result.

A separately authorized60-second profiling run on the same immutable producer
and exact source finalized2711 perf samples with zero lost samples. Its live
instrumentation identifies `rumoca-phase-structural/src/incidence.rs:370` calling
scalar projection of expression43, and typed RuntimeCandidateCountFold output
selection. The fold domain is14400; recorded selections advance to scalar1099
while fold-point visits exceed17million and membership events reach86.2million.
This grounds repeated full-domain projection across distinct selected output
scalars as the current preparation frontier. Guard summaries show zero charged
effect payload in these checkpoints. The profile's leading self symbol is
validation-memo projection expression traversal (21.62%), followed by hashing.
No cross-selection validation-cache widening was implemented here.

Original FeatureSelection still has separate general While/conditional-fold
ownership gaps. No Modelica source was rewritten, reduced in capacity or replaced
by a host selection algorithm. The separate small-copy emitter proposal remains
unapplied in this evidence scope.

The [verification report](../dev/modelica-finite-for-counter-verification.json)
and [evidence bundle](../dev/artifacts/finite-for-counter/evidence-manifest.sha256)
preserve the applied patch, source/producer hashes, initial failure, focused and
strict resources, unchanged full source and finalized diagnostic logs. The raw
trace and immutable executable stay under `$HOME/scratch/slam_web`.
