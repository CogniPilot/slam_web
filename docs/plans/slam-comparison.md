# Same-data SLAM comparison protocol

Protocol established October 18, 2026. Execution results and limitations are in
[the measured comparison](../benchmarks/ros2-rgbd-20261019/results.md).

## Comparators

Start with [RTAB-Map's ROS 2 package](https://github.com/introlab/rtabmap_ros/tree/ros2)
and [stella_vslam's ROS 2 package](https://github.com/stella-cv/stella_vslam_ros/tree/ros2),
both of which provide RGB-D input paths. ORB-SLAM3 is an additional reference;
its upstream implementation and any community ROS 2 wrapper must be pinned
separately. Record core, wrapper, vocabulary, dependency and container hashes.
The existing browser ROS test is skipped and is not a working comparator.

## Identical observations and explicit sensor modes

Data-source contract: Modelica supplies vehicle physics, motion and the IMU/GPS
observation mathematics. Three.js renders the shared scene into camera RGB,
depth and any LiDAR observations used by a selected track. Capture at simulation
timestamps and record the actual sensor samples, including deterministic noise
seeds/draws, units, calibration and sensor clock configuration. Replay those
recorded samples to each stack; do not resimulate motion or redraw sensor noise
independently for a comparator. Simulator truth may drive scene rendering and
sensor generation, but remains unavailable as an estimator input.

Use immutable captures, not independently rendered versions of a route. Replay
the same image bytes, timestamps, intrinsics, extrinsics, depth units and IMU
samples wherever the selected sensor mode uses them. Keep ground truth in the
evaluator only. Never supply simulator pose, perfect odometry, loop identities,
wheel odometry or a prebuilt map to an estimator.

The initial sealed inputs contain 608 RGB-D frames from city and warehouse plus
the captured IMU intervals. `scripts/prepare-slam-comparison.mjs` verifies every
image hash/size, monotonic camera times and calibration, then emits sensor-only
replay metadata and a separate evaluation truth file. Raw images remain in owned
scratch; the manifest references them without duplicating large files.

These are 64-keyframe verification-configuration measurements, not a mission-scale parity claim. The current catalog can retain up to 350 features per keyframe; it does not establish ten-minute return localization.

These captures have unregistered depth and different RGB/depth focal lengths.
[RTAB-Map RGB-D odometry expects registered depth](https://github.com/introlab/rtabmap_ros/blob/ros2/rtabmap_odom/README.md).
Do not relabel the existing depth image as aligned. Validate a deterministic
registration adapter with occlusion handling and known-point projections, hash
its output, and include its time/memory in end-to-end costs. A common registered
input comparison must feed that same derived image set to all implementations;
retain a separate raw-input system comparison where required preprocessing is
part of each system's measured pipeline.

Declare RGB-D and RGB-D+IMU as separate comparison tracks. The current Modelica
profile uses IMU. A pure RGB-D comparator is not a matched-modality efficiency
result against it. A stack that does not implement a track is marked unsupported,
not silently given extra inputs or a zero/ideal IMU. Establish and verify a
supported common track before making a head-to-head superiority claim.

Validate optical/body/world axis conventions, quaternion ordering, camera mount,
gravity/specific-force conventions and pose timestamps using known-motion cases
before evaluating accuracy. These conversions are adapters, not fitted drift
corrections. Ground-truth body poses must be transformed to camera poses when
scoring a camera-pose output.

## Workloads and configuration

The two existing 60.6 s / 5 Hz captures are adapter smoke cases, not sufficient
evidence of scalability. Extend the shared corpus with longer routes, higher
camera/IMU rates, multiple seeds, repeated facades, true revisits, moving objects,
low texture and sustained catalog eviction. Include an appropriate public RGB-D
dataset after the capture adapters pass, with dataset licensing and checksums.

Run upstream recommended defaults first. Then run explicitly budget-matched
configurations where the implementations expose comparable limits. Record
detected/retained features, keyframes, maps, vocabularies and all parameter files;
equal parameter names do not establish equal work. Keep tuning data separate
from evaluation routes. Do not tune only slam_web or report only its best seed.

## Measurements

- Accuracy: metric translation ATE RMSE, translational/rotational RPE, drift,
  tracking coverage and tracking-loss/relocalization counts. Report both fixed
  initial-frame and single global SE(3)-aligned results. Do not use Sim(3) scale
  fitting for metric RGB-D. Record association tolerance and unassociated poses.
- Closure quality: labelled loop precision/recall and resulting pose error.
  Export actual closure events if available; otherwise report unavailable rather
  than inferring events from pose jumps. Keep false closures separate from
  rejected candidates and missed revisits.
- Runtime: input receipt to timestamped pose output, p50/p95/p99 latency,
  sustainable throughput, dropped frames, backlog and time to drain. Include
  frontend, search, optimization, data transfer and required preprocessing.
- Resources: CPU-seconds per processed frame, thread count/affinity, peak RSS,
  WASM linear memory, GPU use and map/index bytes where observable. Runtime
  memory is not the same as logical map memory.
- Replay modes: paced at original timestamps with bounded queues, and separate
  unpaced throughput runs. Include final optimization/drain time and all timeout,
  crash and initialization failures. Startup/compile and steady-state time are
  separate results.

Use the same physical machine and CPU/thread budgets for the main CPU comparison;
disable viewers/rendering for offline estimation. Record browser/native compiler
settings and SIMD/threads. Report optional GPU configurations in a separate row.
Run serially, interleave stack order, repeat at least five times after documented
warmup, and retain all outcomes. A hardware or load mismatch disqualifies a clean
speed ranking; report it rather than hiding it. Resource checks precede builds.

## Release and claim gate

Publish the reproduction commands, immutable input/config hashes, raw trajectories,
per-run resource/timing receipts, failures and evaluator output with the comparison
table. Define the accuracy/coverage acceptance band before scoring. Claim an
efficiency advantage only for workloads and sensor modes where measured quality
is comparable; otherwise report the observed speed/quality tradeoff. No advantage
is claimed by this plan or by sealing the current captures.

## Isolated execution

The initial environment had no ROS installation. The comparison now uses pinned
Nix environments, without changing a system profile or the running console:

- `scripts/ros2-comparison-env.nix`: ROS 2 Jazzy and RTAB-Map 0.23.7.
- `scripts/stella-comparison-env.nix`: official stella core, ROS wrapper and the
  upstream-recommended g2o revision. Header/hook compatibility changes are
  recorded in the expression; the SLAM algorithms are unchanged.
- `scripts/register-slam-comparison.mjs`: verified, deterministic registration.
- `scripts/run-rtabmap-comparison.py`: shared ROS image replay and resource
  recorder; select `--estimator stella` for the official RGB-D `run_slam` entrypoint.
  The wrapper's component entrypoint supports monocular input only.
- `scripts/evaluate-slam-comparison.py`: separate metric evaluator. It reads
  ground truth only after estimation; orientation, camera lever arm and missing
  tracking are handled explicitly.

RTAB-Map and stella use separate environments because their g2o revisions export
overlapping library names. A local admission lock serializes estimator runs.
Both consume the same sealed registered observations. Ordinary shared-machine
load and actual CPU affinity are retained, without reserving the machine.

The original Modelica capture uses raw RGB-D plus IMU. Its results are a separate
sensor track, with matched-timestamp rows for interpreting availability bias.
They do not establish a matched-modality efficiency advantage. Larger workloads
and an agreed quality band remain necessary for that claim.


## Long-term place memory: brief literature review (2026-10-20)

The question is whether a ten-minute mission can return to an early place and
localize with competitive accuracy and resource cost. Our short captures do not
answer it. ROS 2 supplies middleware; the relevant algorithm baselines are the
pinned RTAB-Map and stella implementations.

| Primary source | Mechanism relevant to this mission | Implication for this project |
| --- | --- | --- |
| Labbé & Michaud, [RTAB-Map, JFR 2019](https://doi.org/10.1002/rob.21831), and [0.23.7 memory implementation](https://github.com/introlab/rtabmap/blob/0.23.7/corelib/src/Memory.cpp#L2137) | Word-to-place references support TF-IDF retrieval; active working memory can transfer to a persistent long-term map. | Bound active work while retaining old places. Record actual memory/time thresholds: their defaults are zero, disabling those bounds. |
| Gálvez-López & Tardós, [Bags of Binary Words, TRO 2012](https://doi.org/10.1109/TRO.2012.2197158), [DBoW2 vocabulary source](https://github.com/dorian3d/DBoW2/blob/master/include/DBoW2/TemplatedVocabulary.h), and pinned [stella place database](https://github.com/stella-cv/stella_vslam/blob/e445b5452535e781fdf6777ec33a06f5f8f5e416/src/stella_vslam/data/bow_database.cc) | Hierarchical quantization, word postings, and sparse place scoring reduce unnecessary comparisons. | Assignment, place retrieval and geometric correspondence are separate stages. An inverted place index does not accelerate word assignment by itself. |
| Pinned [stella BoW matcher](https://github.com/stella-cv/stella_vslam/blob/e445b5452535e781fdf6777ec33a06f5f8f5e416/src/stella_vslam/match/bow_tree.cc) | Correspondences are searched within shared vocabulary nodes and checked geometrically. | A direct feature index is a later experiment: restricting bins may change correspondence recall. |
| Campos et al., [ORB-SLAM3, TRO 2021](https://arxiv.org/abs/2007.11898), and [Atlas implementation](https://github.com/UZ-SLAMLab/ORB_SLAM3/blob/master/src/Atlas.cc) | Earlier maps are retained and can be merged after revisits or tracking interruptions. | Fast local tracking and persistent global place recognition are different requirements. |

Current source already limits loop proposals to four keyframes. It still has
dense vocabulary assignment, history/IDF scoring and catalog state handling.
Neither that fact nor the 64-keyframe limit establishes the dominant runtime
cost. Inverted retrieval is not constant-time: a common hallway word can have a
posting for nearly every stored keyframe. Include index insertion/removal,
normalization invalidation and worst-case frequent-word work in measurements.

The recommended first prototype is a fixed-capacity mission place store with a
separate bounded active geometric set, stable generation/ID ownership and a
deterministic inverted index. Keep the existing descriptors, geometric admission
thresholds and dense scorer as the reference. Validate candidate identities,
scores/ties, empty queries, vocabulary changes, eviction and restore. A full
posting list must trigger an explicit capacity result, never silently discard an
early place or turn an incomplete query into a successful negative result.
This is a design recommendation, not a measured performance win or a completed
formal proof. Changing the graph/anchor lifetime also needs a covariance and
ownership review; retaining an appearance record alone does not preserve a
consistent global pose graph.

Mission capacity must follow observed coverage, not the desire to produce a fast
number. Probe 64 (verification configuration), 256, 512 and 1000 retained
keyframes with fixed feature/vocabulary settings, then choose a mission-capacity
configuration that actually retains the required early map. Report allocator,
linear-memory/scratch, resident process and persisted bytes separately. The
current float64 descriptor payload is 49 * 8 = 392 bytes per feature; 64 * 350
features take 8,780,800 bytes before other geometry, state, scratch or runtime
costs. [ORB's 32-byte descriptor representation](https://github.com/dorian3d/DBoW2/blob/master/include/DBoW2/FORB.h)
is 12.25 times smaller for descriptor payload only. It is a separate accuracy
profile, and the generated target must actually use packed storage rather than
widening bytes into integer lanes. It is not a predicted whole-system speedup.

The hallway fixture uses an authored Modelica reference over 600 seconds:
accelerate to 0.5 m/s, travel to 140 m, stop, return and settle at the start. The
controller, motor and rigid-body dynamics remain in the original plant. A
CPU-only plant execution returned within 0.018 m of its physical start; this is
flight-fixture validation, not estimator relocalization. The rendered corridor
must be captured once and hash-sealed for all estimators. A return counts only
with geometrically verified correspondence to the early map; recent backward
views, inertial state availability and simulator truth are not substitutes.

Proposed proof gates are return position/heading error, time to relocalize,
visual tracking and false closures together with p50/p95/p99 latency, sustainable
rate/backlog, CPU, memory and storage at mission capacity. Report every failure
and capacity overflow over at least five interleaved runs. An efficiency win
requires matched sensor modes and quality bands as well as comparable process
scopes and CPU budgets. The existing RGB-D+IMU versus RGB-D-only comparison
remains an explicit unmatched-modality system comparison.

After the synthetic hallway and mine, use recorded real-world data. The
[OpenLORIS-Scene dataset](https://lifelong-robotic-vision.github.io/dataset/scene.html)
provides D435i RGB-D and IMU in real indoor scenes, including corridors and
revisits. Apply its documented calibration corrections and verify clocks,
extrinsics, units and IMU conversion before evaluation. No real-world advantage
is claimed until that stage and a representative recorded mission pass.

Keep the language/codegen question separate: compare the same modeled algorithm,
inputs, numeric/storage types and resource budget after lowering against an
independent hand-written implementation. An end-to-end difference between SLAM
algorithms cannot establish whether Modelica lowering matches C++, Rust or
Python performance.
