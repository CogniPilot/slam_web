# Ordered descriptor matching with conservative early rejection

The native flight perf profile identified descriptor matching as 14.91% of
inclusive sampled CPU cost. The production matcher now accumulates squared
differences directly from the two descriptor matrices instead of constructing
two row slices for every pair. The sample order and arithmetic are unchanged.
It stops when the partial distance reaches the maximum of the forward
second-nearest distance and the reverse nearest distance.

This bound is conservative. The existing validation admits only finite
descriptor components with magnitude at most one. Every squared difference is
nonnegative, and ordered floating-point addition cannot reduce the partial sum.
Once that sum is at or above both limits, it cannot change either strict search
comparison. The forward nearest distance is never larger than its second
distance. Equality keeps the original lowest-slot tie behavior. A candidate
that can improve either direction continues accumulating in its original order.
The full-distance diagnostic function remains unchanged.

The existing full 350×49 exhaustive comparison passes all twelve checks in all
24 scenarios. A separate test compares every output against the exact preceding
active-domain matcher in twelve adversarial cases and four measured image-pair
variants. These cover zero/distance2/distance4 ties, differences in the first or
last descriptor coordinate, reverse correspondence, repeated descriptors,
inactive poisoned data and singleton/empty reference domains. Actual RGB8/Z16
frames 0/6/12 produce 321/350/350 enabled descriptors in Modelica; paired variants
with and without prediction gating produce 83/101/42/44 matches. All 56064
published output cells match bit for bit, including signed zero.

Matched ABBA perf-stat runs execute 128 matches per window in the same -O2
OpenModelica binary, with identical descriptor fixtures, full 350-slot capacity,
call order and checksums. Mean task-clock falls from 31956.48 ms to 8578.975 ms:
3.72498× reference matching CPU throughput, 73.154% less CPU time. This combines
direct indexing and conservative early rejection; no separate attribution to
either change is claimed. Counters include small fixture-read and output
publication costs. Generated C confirms the bounded ordered scalar loop and
the removal of the two per-pair descriptor slice allocations. Full generated
artifacts and raw data remain in scratch; bounded review evidence is retained
in the repository.

The complete rendered flight passes 24 checks and controlled sensor loss/recovery
passes 32 checks. Both complete published CSVs are byte-identical to the preceding
passing replays. The latter retains prediction, covariance growth, held map and
reference, duplicate-batch rollback and visual recovery. Two source-workspace
unit suites also pass 46 tests. File reachability remains 74 Modelica files with
no unreachable production files.

Two initial test-harness failures are retained. The first used a positional
depth-scale argument in a Boolean slot; the second used incorrectly ordered
calibration arguments and its benchmark failed to read a multi-variable MAT
fixture. The passing harness uses the exact production near/far/noise order,
named depth units and a single explicitly packed descriptor matrix. Neither
initial run is used for numerical or performance claims.

Only models/RGBDFeatureMatching.mo changes in the complete 59-file native graph.
The new immutable composition is
artifacts/descriptor-matching-bound-2026-10-07/native-source/source.mo,
SHA256 01a6ffc7a8ad9708e904bef83552c150ea27adf81b476008833f46c34a6d3dcd.
The [bound review](artifacts/descriptor-matching-bound-2026-10-07/review.json)
checks current source hashes, exact prior source, all result bits, retained
generated code, hardware counters and replay output identities.

These are independent OpenModelica native reference results. The updated full
matcher has not been issued or numerically qualified by Rumoca WASM. No live
browser speedup, full browser SLAM, long-flight accuracy, rendered loop closure
or 10× realtime claim follows. Algorithm capacities, image resolution, sensor
rates, State and native input contracts are unchanged. No application compiler,
host numerical fallback, external compiler-tree edit or package-pin promotion
was introduced.
