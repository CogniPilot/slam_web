# Preliminary same-capture SLAM results

These are adapter smoke workloads: two 60.6 s synthetic routes, 304 frames each, 424×240 at 5 Hz. They are not scalability evidence. All 608 RGB/depth pairs were hash checked and deterministic registration was repeated with identical output. Ground truth is evaluator-only.

The Modelica rows are the original raw RGB-D+IMU capture. RTAB-Map uses the same RGB images and registered depth, with no IMU. Different modalities and incomplete tracking prohibit an efficiency/superiority ranking. Modelica state availability includes inertial prediction; it is not equivalent to successful visual tracking.

## ROS2 runs

| Run/config | Valid online poses | Initial ATE m | SE(3) ATE m | Final optimized ATE m | Pose p95 ms | Sampled peak RSS MiB | Loop events |
|---|---:|---:|---:|---:|---:|---:|---:|
| city-defaults-r1: GFTT/BRIEF6, upstream-defaults; covariance sentinel filter | 136/304 | 2.155 | 1.202 | 1.270 (26poses) | 71.86 | 819.9 | 5 |
| city-r1: GFTT/BRIEF6, every-frame; covariance sentinel filter | 140/304 | 2.102 | 1.190 | unavailable (0poses) | 65.44 | 1006.5 | 70 |
| city-r2: GFTT/BRIEF6, every-frame; covariance sentinel filter | 130/304 | 2.225 | 1.265 | 1.246 (131poses) | 70.55 | 880.1 | 57 |
| city-shared-r1: GFTT/BRIEF6, every-frame; covariance sentinel filter | 134/304 | 2.254 | 1.293 | 1.277 (135poses) | 65.45 | 871.0 | 57 |
| city-shared-r2: GFTT/BRIEF6, every-frame; covariance sentinel filter | 138/304 | 2.193 | 1.252 | 1.233 (139poses) | 58.65 | 878.7 | 58 |
| city-shared-r3: GFTT/BRIEF6, every-frame; covariance sentinel filter | 140/304 | 2.110 | 1.222 | 1.208 (141poses) | 50.52 | 881.7 | 76 |
| city-shared-r4: GFTT/BRIEF6, every-frame; covariance sentinel filter | 141/304 | 2.127 | 1.218 | 1.219 (142poses) | 70.96 | 881.9 | 60 |
| city-shared-r5: GFTT/BRIEF6, every-frame; covariance sentinel filter | 143/304 | 2.164 | 1.163 | 1.150 (144poses) | 49.75 | 873.5 | 67 |
| stella-city-r1: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 3.124 | 2.007 | 2.113 (304poses) | 56.75 | 241.6 | unavailable |
| stella-city-r2: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 161/304 | 3.141 | 1.511 | 1.022 (161poses) | 22.61 | 246.5 | unavailable |
| stella-city-r3: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 303/304 | 1.889 | 1.242 | 1.154 (303poses) | 58.07 | 237.8 | unavailable |
| stella-city-r4: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 2.621 | 1.626 | 1.565 (304poses) | 67.74 | 233.9 | unavailable |
| stella-city-r5: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 275/304 | 4.465 | 2.082 | 1.777 (275poses) | 67.66 | 279.8 | unavailable |
| stella-warehouse-r1: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 0.092 | 0.067 | 0.066 (304poses) | 26.94 | 189.1 | unavailable |
| stella-warehouse-r2: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 0.092 | 0.067 | 0.066 (304poses) | 29.19 | 189.1 | unavailable |
| stella-warehouse-r3: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 0.092 | 0.067 | 0.066 (304poses) | 58.61 | 189.3 | unavailable |
| stella-warehouse-r4: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 0.089 | 0.067 | 0.067 (304poses) | 62.84 | 189.1 | unavailable |
| stella-warehouse-r5: ORB + pinned FBoW, native-defaults; filtered by official exporter lost flags | 304/304 | 0.092 | 0.067 | 0.066 (304poses) | 61.64 | 189.1 | unavailable |
| warehouse-defaults-r1: GFTT/BRIEF6, upstream-defaults; covariance sentinel filter | 41/304 | 0.128 | 0.061 | 0.062 (9poses) | 28.21 | 786.3 | 0 |
| warehouse-r1: GFTT/BRIEF6, every-frame; covariance sentinel filter | 49/304 | 0.070 | 0.059 | 0.072 (50poses) | 23.15 | 827.8 | 4 |
| warehouse-r2: GFTT/BRIEF6, every-frame; covariance sentinel filter | 42/304 | 0.080 | 0.062 | 0.078 (43poses) | 17.15 | 823.7 | 4 |
| warehouse-shared-r1: GFTT/BRIEF6, every-frame; covariance sentinel filter | 46/304 | 0.081 | 0.070 | 0.084 (47poses) | 19.30 | 823.0 | 3 |
| warehouse-shared-r2: GFTT/BRIEF6, every-frame; covariance sentinel filter | 40/304 | 0.075 | 0.065 | 0.088 (41poses) | 17.87 | 822.0 | 2 |
| warehouse-shared-r3: GFTT/BRIEF6, every-frame; covariance sentinel filter | 42/304 | 0.080 | 0.060 | 0.074 (43poses) | 17.94 | 826.8 | 3 |
| warehouse-shared-r4: GFTT/BRIEF6, every-frame; covariance sentinel filter | 42/304 | 0.084 | 0.081 | 0.083 (43poses) | 18.26 | 822.1 | 2 |
| warehouse-shared-r5: GFTT/BRIEF6, every-frame; covariance sentinel filter | 44/304 | 0.080 | 0.073 | 0.082 (45poses) | 16.97 | 827.4 | 4 |

Low error on a short tracked subset must be read together with coverage. Missing/invalid odometry is retained as failure, never a zero-error pose. Loop events are reported detections, not verified true closures or precision/recall.

## Repeated runs under ordinary shared load

| Estimator/scene | Completed repeats | Valid frames range | SE(3) ATE range m | Pose p95 range ms | Observed replay Hz range |
|---|---:|---:|---:|---:|---:|
| rtabmap/city | 5/5 | 134–143 | 1.163–1.293 | 49.75–70.96 | 4.868–4.883 |
| rtabmap/warehouse | 5/5 | 40–46 | 0.060–0.081 | 16.97–19.30 | 4.872–4.883 |
| stella/city | 5/5 | 161–304 | 1.242–2.082 | 22.61–67.74 | 4.859–4.896 |
| stella/warehouse | 5/5 | 304 | 0.067–0.067 | 26.94–62.84 | 4.851–4.894 |

Per-run receipts retain CPU affinity, actual thread count and sampled host load. Requested pacing is 5 Hz; observed pacing is reported rather than assumed. The first partial repeated-run group is not a completed five-repeat result.

## Original Modelica capture (RGB-D+IMU)

| Scene | State frames | Visual updates accepted | Translation-only initial ATE m | SE(3) ATE m | Modelica call p95 ms | Final loop edges |
|---|---:|---:|---:|---:|---:|---:|
| city | 304/304 | 79 | 0.521 | 0.399 | 61.96 | 0 |
| warehouse | 304/304 | 102 | 0.432 | 0.237 | 71.20 | 5 |

## Dispatch-to-pose timing on the current shared machine

| Estimator / scene | Runs | Latency sample scope | Post-init p50 ms | Post-init p95 ms | Sampled peak RSS MiB |
|---|---:|---|---:|---:|---:|
| rtabmap / city | 5 | covariance-valid frames only | 29.30–32.07 | 49.75–70.96 | 871.0–881.9 |
| rtabmap / warehouse | 5 | covariance-valid frames only | 12.99–14.30 | 16.97–19.30 | 822.0–827.4 |
| stella / city | 5 | official exporter lost mask | 6.29–42.50 | 22.63–67.74 | 233.9–279.8 |
| stella / warehouse | 5 | official exporter lost mask | 4.12–31.30 | 26.99–62.86 | 189.1–189.3 |
| Modelica published worker / city | 5 | all303 post-init state responses | 55.10–99.50 | 67.36–115.71 | 1704.8–1825.0 |
| Modelica published worker / warehouse | 5 | all303 post-init state responses | 61.80–64.80 | 78.89–177.51 | 1677.6–1760.2 |

These timings use the same logical boundary: dispatch of an already-prepared sensor frame to receipt of its pose callback. ROS uses DDS; the native row uses the unchanged production client and exact published Chromium154 worker, including postMessage transfer and response. The initializer is separate for every row; post-init excludes that first input only and does not assert a JIT warmup fixed point. Source images, source timestamps and IMU intervals are preserved; scene rendering and physics are excluded. All runs use two-CPU affinity and ordinary shared load. The native tree includes Chromium/renderer/worker; ROS rows include estimator process groups and launchers. All reported callback percentiles are recomputed by one NumPy-linear helper from retained per-frame samples; raw runner receipts retain their original diagnostics. ROS timing includes DDS delivery, synchronization, tracking and the return callback, not just an internal tracking timer. Chromium-tree RSS is not directly comparable with native process-group RSS; sums can double-count shared pages. Different tracking masks, modalities and resource scopes still prohibit a simple speed/memory ranking.

The fresh native replay is checked against the original trajectory; per-run maximum differences and full pose/RPE scores are retained in summary.json. Native repeats are listed at their actual completed count, including an incomplete set if this revision precedes completion.

First-pair post-initialization comparison: city: Modelica p95 67.36ms is higher than stella 57.01ms; warehouse: Modelica p95 78.89ms is higher than stella 26.99ms. These are observed callbacks under the stated conditions, not a controlled superiority claim.

## Stella city drift check

The first city run logs 0 tracking losses, 0 resets, 0 successful relocalizations and 1 initial map creation. The following fixed-initial-pose errors and largest adjacent steps distinguish accumulated error from a single logged restart; they do not establish a root cause.

| Time s | Position error m |
|---:|---:|
| 0.0 | 0.000 |
| 10.0 | 2.281 |
| 20.0 | 1.489 |
| 30.0 | 1.301 |
| 40.0 | 0.713 |
| 50.0 | 4.620 |
| 60.6 | 6.291 |

| Largest pose step time s | Estimated step m | True step m |
|---:|---:|---:|
| 12.6 | 0.673 | 0.046 |
| 37.2 | 0.538 | 0.121 |
| 44.4 | 0.534 | 0.073 |
| 43.8 | 0.495 | 0.098 |
| 45.2 | 0.472 | 0.046 |

Modelica call time is not comparable with ROS callback latency. Its capture did not export per-frame orientation or process RSS; its initial-alignment ATE is translation-only, not a rigid pose alignment. Global SE(3) position alignment remains valid. Logical WASM state size is not reported as process memory.

## Matched availability masks

| ROS run | Shared frames | ROS odometry SE(3) ATE m | Modelica same-frame SE(3) ATE m |
|---|---:|---:|---:|
| city-defaults-r1 | 136 | 1.202 | 0.341 |
| city-r1 | 140 | 1.190 | 0.339 |
| city-r2 | 130 | 1.265 | 0.362 |
| city-shared-r1 | 134 | 1.293 | 0.402 |
| city-shared-r2 | 138 | 1.252 | 0.355 |
| city-shared-r3 | 140 | 1.222 | 0.340 |
| city-shared-r4 | 141 | 1.218 | 0.376 |
| city-shared-r5 | 143 | 1.163 | 0.346 |
| stella-city-r1 | 304 | 2.007 | 0.399 |
| stella-city-r2 | 161 | 1.511 | 0.439 |
| stella-city-r3 | 303 | 1.242 | 0.398 |
| stella-city-r4 | 304 | 1.626 | 0.399 |
| stella-city-r5 | 275 | 2.082 | 0.406 |
| stella-warehouse-r1 | 304 | 0.067 | 0.237 |
| stella-warehouse-r2 | 304 | 0.067 | 0.237 |
| stella-warehouse-r3 | 304 | 0.067 | 0.237 |
| stella-warehouse-r4 | 304 | 0.067 | 0.237 |
| stella-warehouse-r5 | 304 | 0.067 | 0.237 |
| warehouse-defaults-r1 | 41 | 0.061 | 0.207 |
| warehouse-r1 | 49 | 0.059 | 0.204 |
| warehouse-r2 | 42 | 0.062 | 0.211 |
| warehouse-shared-r1 | 46 | 0.070 | 0.206 |
| warehouse-shared-r2 | 40 | 0.065 | 0.203 |
| warehouse-shared-r3 | 42 | 0.060 | 0.211 |
| warehouse-shared-r4 | 42 | 0.081 | 0.212 |
| warehouse-shared-r5 | 44 | 0.073 | 0.206 |

| Optimized graph run | Shared nodes | ROS graph SE(3) ATE m | Modelica same-node SE(3) ATE m |
|---|---:|---:|---:|
| city-defaults-r1 | 26 | 1.270 | 0.353 |
| city-r1 | 0 | unavailable | unavailable |
| city-r2 | 131 | 1.246 | 0.361 |
| city-shared-r1 | 135 | 1.277 | 0.401 |
| city-shared-r2 | 139 | 1.233 | 0.355 |
| city-shared-r3 | 141 | 1.208 | 0.339 |
| city-shared-r4 | 142 | 1.219 | 0.375 |
| city-shared-r5 | 144 | 1.150 | 0.345 |
| stella-city-r1 | 304 | 2.113 | 0.399 |
| stella-city-r2 | 161 | 1.022 | 0.439 |
| stella-city-r3 | 303 | 1.154 | 0.398 |
| stella-city-r4 | 304 | 1.565 | 0.399 |
| stella-city-r5 | 275 | 1.777 | 0.406 |
| stella-warehouse-r1 | 304 | 0.066 | 0.237 |
| stella-warehouse-r2 | 304 | 0.066 | 0.237 |
| stella-warehouse-r3 | 304 | 0.066 | 0.237 |
| stella-warehouse-r4 | 304 | 0.067 | 0.237 |
| stella-warehouse-r5 | 304 | 0.066 | 0.237 |
| warehouse-defaults-r1 | 9 | 0.062 | 0.176 |
| warehouse-r1 | 50 | 0.072 | 0.205 |
| warehouse-r2 | 43 | 0.078 | 0.212 |
| warehouse-shared-r1 | 47 | 0.084 | 0.207 |
| warehouse-shared-r2 | 41 | 0.088 | 0.204 |
| warehouse-shared-r3 | 43 | 0.074 | 0.212 |
| warehouse-shared-r4 | 43 | 0.083 | 0.213 |
| warehouse-shared-r5 | 45 | 0.082 | 0.207 |

This controls the missing-frame mask, not the different sensor modalities.

## Configuration and limitations

- Pinned nix-ros-overlay 814d97b0; ROS 2 Jazzy; RTAB-Map core/wrapper 0.23.7. The compiled binary reports GFTT/BRIEF (6) as its feature default.
- Every-frame mapping overrides DetectionRate=0, LinearUpdate=0 and AngularUpdate=0. Upstream-default runs retain 1 Hz, 0.1 m and 0.1 rad. Exact sync and queue 20 are adapter settings.
- ORB (2) was tried first and lost tracking after initialization in the 15-frame smoke. It is retained in the raw evidence; no best-of selection is concealed.
- City-r1 was the bring-up run without CPU affinity and without a final graph service export. Later runs bind replay/estimators to two CPUs. Internal thread counts and sampled CPU/RSS are retained in summary.json. Two CPUs does not mean only two threads.
- The stella dependency compilation ran concurrently during initial bring-up. Timing/resource rows retain the recorded contention and load. The repeated-run table states completion explicitly. A matched-modality workload and an agreed quality band remain necessary for a performance claim.
- Registration projects co-located source pixel footprints into RGB optics, uses nearest axial Z for overlaps, preserves invalid zeros and introduces no interpolated depth. The 5 cm baseline belongs to the disparity-noise model, not camera translation.
- Registered sensor metadata hash: c78b7df933dcfe16484b9face69db0664eb6b95631530abefd55f6b2cfa4ef2b. Registration-only first-run p95 = 2.075 ms; separate full offline preparation (hash/read/write included) repeat wall = 3.157 s for 608 frames. Neither is silently included in cached ROS callback latency.
- stella uses the official RGB-D run_slam executable, default ORB settings and pinned FBoW vocabulary. Its final TUM trajectory excludes frames marked lost by the backend; online availability is masked to those timestamps. Stella final-frame trajectories and RTAB-Map final graph-node poses have different export scopes. Final retained map edges are exported separately; unavailable historical loop events are not reported as zero.

## Reproduction

Build scripts/ros2-comparison-env.nix with Nix flakes enabled and the official ros.cachix.org cache. Use the resulting bin/python3 to run scripts/run-rtabmap-comparison.py. Supply sealed sensor inputs, one scene, a new output directory and --ros-env. For stella, build scripts/stella-comparison-env.nix and pass --estimator stella with the pinned vocabulary. The evaluator/report runs separately in scripts/slam-comparison-evaluator-env.nix with ground-truth.json and its sealed manifest. Full raw receipts, failed attempts, trajectories and source pins accompany the private work-safe handoff; portable summary.json contains the scored outcomes.
