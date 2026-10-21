# Mission memory proposal for review

The goal is a reproducible ten-minute hallway return experiment, followed by a
mine and recorded real missions. The current source overwrites a 64-keyframe
catalog. The graph validator separately admits at most 128 nodes and 256 edges.
Retaining more appearances alone cannot preserve a globally consistent map.
This document proposes a bounded design; it does not qualify an implementation.

Review direction, 2026-10-20: measure the whole replay first. Prefer a
larger single bounded graph if reviewed solver/memory budgets qualify it; use
submaps only if that simpler option cannot hold the mission. Resolve the
uncertainty/ownership contract before any submap implementation.

## Proposed separation

| Store | Initial research budget | Contract |
| --- | --- | --- |
| Active geometry and local graph | Up to 64 keyframes | Frequent visual tracking and local correction; explicit ownership of each landmark and reference. |
| Mission place records | Up to 1024 keyframes | Retain early places for the whole admitted mission. Immutable descriptor/geometry records, versioned word histograms, stable IDs and submap membership. |
| Retrieval workspace | Up to 4 candidates, fixed scratch | Deterministic candidate selection followed by actual geometric verification. Record index overflow or incomplete search explicitly. |
| Submap anchors and connecting graph | Up to 128 anchors / 256 edges | Global relation between bounded local maps. Cross-submap constraints require a defined uncertainty/ownership contract before implementation. |

Budgets are hypotheses for the mission, not demonstrated adequate capacities.
Admission must account for overlap, anchor constraints and the actual keyframe
cadence. A full store yields a visible capacity outcome; it must not silently
discard an old place and call the subsequent failed lookup a successful search.
At 1024 records, 350 features and 49 float64 descriptor values, descriptors alone
cost 140,492,800 bytes (134 MiB). Active descriptors at 64 cost 8.375 MiB.
Geometry, histograms, indexes, scratch, serialization and runtime are additional.
Keep persistent payload outside the frequently copied active-state bundle;
measure actual storage and transfer costs rather than substituting these sums
for resident memory. No binary descriptor change is part of the first prototype.

The Modelica models own map decisions and estimator mathematics. The host can
transport opaque, hashed records. A requested record is admitted only when its
mission generation, vocabulary version, feature/calibration schema, submap ID
and immutable content hash match the requested ID. Retrieval must never accept
host-provided poses as unvalidated estimator state. Missing, stale or partially
restored records produce visible results without changing the active binding.

## Decision gates before implementation

1. Measure the whole current replay, including state transfer, descriptor
   assignment, retrieval, matching/RANSAC, graph optimization, covariance and
   commit. Existing isolated kernels do not establish their mission frequency
   or the dominant end-to-end cost.
2. Review the submap transition and uncertainty contract. Define how overlapping
   references are owned, how a loop changes anchor and landmark frames, which
   correlations are retained, and how double counting is prevented. A small
   active graph by itself proves none of these properties. Do not change the
   existing global correction semantics merely to fit a timing budget.
3. Prototype mission place storage with the existing dense scorer as the
   reference. Then add bounded word postings with exact candidate/score/tie
   equivalence, including ubiquitous hallway words. Indexing does not accelerate
   vocabulary assignment or remove a worst-case linear posting scan.
4. Add hierarchical assignment or direct feature matching bins only as separate
   recall/accuracy experiments. Review source/dependency licenses before reuse.

The alternative to submaps is a larger single bounded graph with reviewed
validation limits, memory and solver budgets. Measure it against the submap
design; neither the present cost curve nor the literature selects a winner for
this implementation. Capacity remains finite and overflow remains explicit.

## Evidence required for the replacement claim

Capture and seal one 3001-frame, 5 Hz, 600-second hallway flight. Keep evaluator
truth separate. All estimators consume identical observations with explicit
calibration, depth registration and modality differences. Define numerical
accuracy and tracking acceptance bands before scoring. Preserve the current
64-keyframe run as the baseline, including its failures.

An early-place revisit is accepted only when a recorded, geometrically verified
loop identifies a retained outbound place. Continuous inertial output, a loop to
a recent return frame and the plant's return position do not qualify. Report a
separate controlled tracking-loss/relocalization case; describe the observation
dropout and reset semantics and apply them consistently to every estimator.

Report return error, heading, relocalization delay, visual coverage and false
closures with latency tails, throughput/backlog, CPU, RSS, linear memory, map
bytes and every capacity failure. Use at least five interleaved serial runs on
equal CPU budgets. Include preprocessing and drain work. A system comparison
with RGB-D+IMU versus RGB-D only remains unmatched in modality.

Repeat on representative recorded real-world data before a real-world claim.
Replacing the tested ROS 2 SLAM component does not establish replacement of ROS 2
discovery, transport, lifecycle, logging or a user's entire robot integration.
Modelica source is analyzable; formal verification and equivalence after lowering
are additional obligations, not properties established by this benchmark.
