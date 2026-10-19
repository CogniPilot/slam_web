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
