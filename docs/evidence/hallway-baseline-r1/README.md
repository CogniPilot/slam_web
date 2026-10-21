# First hallway diagnostic baseline — failed return

The current native SLAM pipeline does not pass this600-second hallway return.
This is one diagnostic run with host timing instrumentation; it does not rank
Modelica against ROS2 or establish scalability.

| Observation | Result |
| --- | ---: |
| Captured / replayed observations | 3001 /3001 |
| Mission duration / achieved path | 600 s /280.17 m |
| Initial-pose-aligned ATE RMSE | 14.225 m |
| Last available pose position error at600 s | 34.291 m |
| Last orientation error | 0.3836 rad |
| Accepted visual updates | 1344 /3001 |
| Maximum graph keyframes / unique observed IDs | 10 /10 |
| Last graph keyframe acquisition | 16.4 s |
| Verified proposal to a reference acquired by60 s, after300 s | 0 |
| Callback latency p50 /p95 /p99, initializer excluded | 69.5 /79.005 /89.101 ms |
| Sampled Chromium tree peak RSS | 3,280,328 KiB |

Visual-update acceptance is not identical to visual tracking coverage: the
estimator also has an independent-noise eligibility policy. Do not describe the
other frames as lost tracking without examining their refusal reasons. State
availability is not visual localization. SE3-fitted ATE is retained in the JSON;
the primary mission error above uses rigid alignment at the first pose, with no
scale fit and no whole-route fit hiding return drift.

The retained graph stopped at ten keyframes. Across the mission,2909 rows report
keyframeRejectionReason4 and loopGraphReason4. The exact exported Modelica source
was found locally and its SHA256 verified as843d316165385fdcb5c64784d822fd669e9b2311ec5df0a22b74ddf097d4e868,
matching the replay's native profile. Its enum definitions identify the outer
catalog rejection as graph refusal and graph-measurement rejection4 as failure
to admit the consecutive chain. Sequential verification reports reason7 on many
rows, including the last (the consensus path), and reason11 on others (the pose
consistency screen). This localizes admission starvation. It does not establish
that this alone causes all drift; visual updates continued and correction/bias
behavior requires a separate counterfactual.

The64-keyframe and128-node/256-edge source limits remain unqualified for larger
missions, but this run did not exercise them. Prefer a controlled admission and
correction diagnosis before implementing larger stores or submaps. A queued
first40-second cadence probe changes maximumInterval2 to0.6 s and translation
threshold0.6 to0.2 m, preserving verification thresholds; it is a diagnostic
configuration, not a qualified fix or a full return test.

The host clocks place206.319 s inside the compiled WASM entry out of209.853 s of
post-initializer callback time (~98.3%). Host carry totaled3.3 ms; the issued
layout required zero explicit host carry bytes. The entry still includes
internal state handling and many algorithm stages. These data do not identify
graph optimization as the dominant cost. Native function clocks tied to the
exact module/owner map are the next isolation.

Unpaced total wall time was535.018 s, including Node image reads, base64/CDP and
per-frame `/proc` resource sampling between sequential requests. This closed-loop
harness does not qualify open-loop throughput, bounded queue behavior or drops.
Its CPU budget was two logical CPUs (affinity6,7), on a shared host; Chromium
process-tree CPU totaled396.19 s, excluding the Node coordinator. Do not compare
this instrumented unpaced result directly to paced ROS control rows.

Inputs are sealed separately from evaluator truth (sensor645b6347, truthf018a192).
Depth registration produced the ROS RGB-D-only track (e31de4e9); native uses raw
RGB-D plus IMU. Registration cost and modality differences remain explicit.
Capture used NVIDIA/Vulkan co-resident with inference, with at least4773 MiB free
in whole-device samples and a maximum333 MiB aggregate increase. This establishes
observed fit for this capture, not permanent coexistence or an inference-latency
result. Response-body archive warnings are preserved in the original capture
receipt; sensor image/hash/clock validation passed, while complete renderer
archive reproducibility remains unqualified.

Full trajectories, raw frames and configuration are under
`$HOME/scratch/slam_web/profiles/environment-scale-20261020-r1/`; this directory
contains the compact review evidence. A real-world advantage, formal verification
and a viable replacement for a ROS2 SLAM component are not established.


## Preliminary controls and feedback probes

These single runs do not establish a clean efficiency ranking. Primary ATE uses
rigid initial-pose alignment. Native has state availability even without a
visual update; ROS counts use their documented pose-validity filters.

|System|Pose/state count|ATE RMSE|Pose callback p95|Summed process RSS peak|
|---|---:|---:|---:|---:|
|Native Modelica (instrumented)|3001/3001|14.225 m|79.0 ms|3.128 GiB|
|RTAB-Map|3000/3001|5.177 m|58.4 ms|2.022 GiB|
|stella|2322/3001|98.552 m|66.5 ms|0.735 GiB|

RTAB-Map's separate asynchronous map callback p95 is435.8 ms; its final graph
has2254 scored timestamps. Stella's saved frame trajectory has97.37 m initial-
aligned ATE and2322 scored timestamps. Eight online pose steps exceed1 m,
including one82.9 m step over0.2 s. These are observed discontinuities, not a
proven loop-failure mechanism. Native is instrumented/unpaced; ROS is paced;
raw RGB-D+IMU and registered RGB-D-only tracks differ. None of these results
qualifies a replacement claim or an advantage at matched quality.

The40-second graph-feedback-off intervention ends at0.307 m error and0.0127 m/s²
bias norm; constraining direct nuisance gain alone ends at0.610 m and0.816 m/s².
The latter does not stop uncertainty inflation. A synthetic component run and
four actual archived-module shadow events reproduce that constrained nuisance
variances scale1/weight while their means remain unchanged. This is the
implemented CI rule, not an established implementation-contract violation.
See `actual-module-shadow.json`, `ci-nuisance-component.json` and
`../../plans/slam-graph-feedback.md` for scope and repair constraints.

The full mission cause remains open. No estimator repair is drafted or applied.
Before changing fusion semantics, establish the correlation/uncertainty contract
and validate it, then repeat the complete mission. Numeric quality bands,
repeatability, open-loop throughput and real-world evaluation remain required.
