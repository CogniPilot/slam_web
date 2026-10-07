# Simulation timing and performance evidence

Current-source note (2026-10-07): unused raster/thumbnail vision, CPU depth-noise
models and the partial SLAM placeholder have been deleted. Older sections below
are historical measurements or requests, not available execution paths. Current
source and runtime status are in [the composition](rgbd-inertial-slam-composition.md).

The simulation uses independently selected camera, LiDAR, IMU and GPS rates.
The latest matched High Main Street GPU sensor test held 90/20/90/10 Hz,
all actors, the depth cloud, and the available Modelica INS/detector workload.
Packing each capture into one PBO and one browser GPU readback increased
observed throughput from **0.439× to 0.491× realtime (11.9%)**, with sensor
wall time falling from 12.59 to 9.74 ms. The ABBA comparison used identical
executable bundles and 900 camera frames per condition, with exact camera,
LiDAR, IMU and GPS counts. Hardware comparisons preserve every RGB, depth,
cloud and LiDAR byte at three moving-actor poses. See the
[matched readback evidence](../dev/sensor-packed-readback-performance-verification.json).
The preceding sensor-only geometry batching comparison measured a separate
3.9% throughput increase; these gains must not be multiplied across bundles.

These controlled browsers and their children ran on two CPU cores. CDP CPU
profiling was enabled equally in every ABBA run; native sampling and GPU
queries were used in a separate diagnostic run. The viewer still schedules
30 Hz, with missed deadlines. Full visual SLAM and 10× realtime remain pending.
A separate selected-default run with normal process priority, CPUs 0–31 and
no CPU/native/GPU sampling measured **0.623× realtime**, with sensor wall
time 7.09 ms. It captured exactly 900 camera, 200 LiDAR, 900 IMU and 100 GPS
observations over ten simulated seconds. Sixteen completed viewer windows
averaged 30.03 Hz (range 29.51–30.50 Hz); the largest window p95 frame interval
was 54.4 ms. This shared-host observation includes an unrelated external build
and does not establish a clean-machine or matched optimization speedup. See
[the normal-preview record](../dev/sensor-normal-preview-performance-verification.json).

Earlier Low/High results and their different workloads remain recorded in
[the multirate profile](../dev/multirate-sensor-performance-verification.json).

### GPU work and browser transport

The [owned-process diagnostic](../dev/sensor-native-profile-verification.json)
contains 1,511 normally finalized native samples with no lost samples;
115 samples belong to the exact sensor worker TID identified by Chrome trace.
GPU timers measured mean RGB 0.710 ms, axial depth 0.457 ms and LiDAR cube
face 0.588 ms. In the instrumented run, 1,120 CPU readback calls accumulated
3,373 ms of API walltime, while the sensor thread consumed 1,510 ms of active
CPU across the profiling window. API walltime includes transport and blocking;
these numbers do not assign all idle time to the GPU. Native GPU-process
stacks reach buffer mapping through GetBufferSubDataCHROMIUM. Sensor render
targets have zero multisamples. Raw stacks, GPU queries, CPU profiles, thread
accounting and V8 maps are preserved with artifact hashes.

The current pooled asynchronous path avoids Three's fixed initial fence delay,
but the earlier matched comparison found it slower for this lockstep workload.
[Three recommends asynchronous readback](https://threejs.org/docs/pages/WebGLRenderer.html)
where possible; this is not a guarantee of throughput improvement.
[WebGPU mapping](https://gpuweb.github.io/gpuweb/#dom-gpubuffer-mapasync)
provides an asynchronous readiness contract, without guaranteeing direct
aliasing to WASM memory. A future renderer experiment could use
[BundleGroup](https://threejs.org/docs/pages/BundleGroup.html) to reuse static
render commands, but its performance benefit requires the WebGPU backend.
[Three's migration guide](https://threejs.org/manual/pages/webgpurenderer)
requires custom ShaderMaterial paths to be ported to node materials/TSL,
so the existing depth and LiDAR shaders need fresh numerical parity gates.
[Khronos multiview](https://registry.khronos.org/webgl/extensions/OVR_multiview2/)
could combine views into texture arrays, but cannot read a multiview framebuffer
directly and disallows active timer queries for multi-view draws. The current
ordinary Chromium hardware capability probe reports neither OVR_multiview2
nor a WebGPU adapter. These are research options, not accepted implementations
or measured speedups.

## Raw LiDAR handoff and graphics budgets

The LiDAR path now returns the exact dense GPU RGBA32F buffer; its per-sample
TS range decoding and point compaction are removed. GPU shaders compute FLU
XYZ and clear invalid samples, while rendering binds the interleaved buffer.
Nine hardware-browser checks and two additional raw-byte/array-identity checks
pass, including all room/detail combinations, independent enclosure geometry,
sync/async parity and failure recovery. See
[the raw handoff record](../dev/raw-lidar-handoff-verification.json).

Fresh 360-frame synchronous all-sensor profiles measure Low at 41.24 ms/step
(0.269× realtime) and High at 41.00 ms (0.270×), with about 1.4 active CPU cores.
Both include the available Modelica inertial baseline, RGB-D, depth cloud,
64×1024 LiDAR, CDP sampling and `perf` on the shared RTX 3090 host. They have
different readback/instrumentation from older measurements below and do not
establish an isolated before/after improvement. Sensor-worker sampling still
attributes 5.94–6.98 seconds exclusively to `getBufferSubData`; those stacks
include driver waits and do not measure GPU occupancy. LiDAR buffer handoff
averages 0.002 ms, while the shared sensor readback wait is 16.7–19.1 ms.
Viewer windows are mostly near 30 FPS; High's first recorded window is 27.54 FPS,
and p95 frame intervals remain above 33.3 ms. Full visual SLAM, perfectly steady
30 FPS and 10× simulation are not accepted by these measurements.

Cloud shading now uses one, two or three noise layers at Low, Medium or High,
and daylight skips invisible moon/star calculations. The selected rendering
budget is visible below the toolbar. A separate paused GPU timer-query probe
measures Low overview draws at 0.60–0.84 ms and High at 0.81–1.26 ms in two
orderings. It excludes sensing and algorithms and cannot stand in for complete
pipeline performance. Its bundle and screenshots are retained in
[the atmosphere/quality record](../dev/graphics-cloud-quality-verification.json).

## Current Big city and all-sensor measurements

Low now limits photographic surface maps to 256 × 256, releases disabled normal
maps and shadow targets, and restores the original images on High. For the six
surface families, Low binds 786,432 texels versus 4,718,592 on High; these are
image counts, not a hardware allocation measurement or a sixfold speedup.
Original downloaded bitmaps remain in memory, and model textures/HDR/antialiasing
are unchanged. Nine fresh hardware-browser checks and five material/geometry
checks pass quality changes, all room combinations, original-image restoration,
resource disposal, synchronized sensors, exact readback parity and recovery.

A fresh same-bundle, same-source 360-frame Big city pair with all sensors measures
Low at 28.46 ms/step (0.390× realtime) and High at 30.39 ms (0.365×), using about
1.62 active CPU cores. Distinct viewer windows after the first reported startup
window are near 30 FPS; the first window includes scene/shader startup and is
retained in the evidence. Both runs use CPU affinity 4,5 and nice 10 on the shared
RTX 3090 host. This single pair does not establish a universal gain, an isolated
before/after effect, or older-laptop performance. `perf` task-clock and CDP
profiles still identify GPU readback/driver waits (`getBufferSubData`, 3.27–3.47
seconds of exclusive sampled CPU stacks) as a major cost. GPU occupancy is not
measured. Full visual SLAM and 10× remain pending. See the
[current texture-budget and profiling record](../dev/graphics-texture-quality-verification.json).

The graphics dial changes viewer pixel budget, shadows, normal maps and scene
decoration while retaining all three enterable furnished interiors. It leaves
the calibrated 160×90 RGB-D dimensions and 90 Hz lockstep contract intact. In
matched 360-frame RTX 3090 runs with raw depth cloud and 64×1024 LiDAR, Low measures
35.57 ms/step versus 38.63 ms on High; both dedicated viewers average about 30 FPS.
Those runs use the genuine QuadrotorSIL plant and available Modelica inertial
baseline, not the pending visual SLAM stack. See [the scene record](../dev/big-city-verification.json).

The dial now applies at a completed frame boundary without recompiling or
resetting the experiment. Eight fresh hardware-browser checks cover preserved
worker/state/trajectory/camera identity, the next exact 1/90-second step,
synchronized RGB-D/LiDAR, independent viewer rendering, all furnished rooms
and sensor readback/failure recovery. See [the control record](../dev/live-graphics-quality-verification.json).
This control check does not measure a new whole-pipeline speedup or establish
performance on older laptops.

The subsequent synchronous PBO batching experiment submits RGB, depth and raw
depth-cloud reads before waiting for the last buffer, and reuses mixed-size
buffers without unnecessary reallocation. Six actual hardware-browser tests
pass geometry, exact sync/async/direct-worker parity, moving actors, failure
restoration, all room/quality combinations and the 90 Hz barrier. A separate
matched 360-frame High before/after pair measures 32.08→31.34 ms/step and camera
readback 14.41→13.01 ms, with approximately 29.9 viewer FPS. This is a modest
observed difference on a shared machine, not a universal throughput guarantee.
The actual bundles, model hashes, limits and checks are retained in
[the readback record](../dev/batched-readback-verification.json).

RGB, depth, raw depth cloud and LiDAR now share one capture readback batch.
All four reads are submitted before the first host copy; asynchronous mode
uses one fence for the complete set. Seven actual RTX 3090 browser checks pass
exact pixels, cloud coordinates, LiDAR ranges/XYZ, shared timestamps, recovery
from render/copy faults, the independent viewer barrier and every Big city
room/quality combination. The matched 360-frame High pair measures
40.40→37.38 ms/step with about 1.45 active CPU cores in both runs and roughly
30 viewer FPS. This single pair on a shared machine is an observed gain, not
a universal guarantee. A separate current run with `perf` records
34.69 ms/step, 0.320× realtime and 1.64 active CPU cores. Camera/LiDAR timing
spans overlap in the shared batch and must not be added together. Actual
bundles, CPU-stack samples, resources and checks are retained in
[the shared sensor record](../dev/shared-sensor-readback-verification.json).

Combined sensor capture now prepares committed animation and scene transforms
once across RGB-D and LiDAR. Hardware checks verify one full scene traversal,
exact moving-actor measurements against forced automatic traversal, synchronous
state restoration, failure recovery, all room/quality combinations and the
independent viewer barrier. Ten scoped readback/worker tests also pass. The
current 360-frame High sample measures 29.29 ms/step (0.379×) and 29.81 viewer FPS;
a separate `perf` run measures 35.27 ms/step (0.315×), 1.53 active CPU cores and
29.97 viewer FPS. The before sample is 56.24 ms/step, but unchanged physics also
changes 7.25→3.56 ms between runs, so the overall difference cannot be attributed
to the scene optimization. Sensor `getBufferSubData` remains the largest active
sampled stack (4.26 seconds exclusive). Shared preparation is included in the
sensor RPC total, outside the overlapping camera/LiDAR spans. Sources, bundles,
resources and exact gates are in [the scene capture record](../dev/single-scene-capture-verification.json).

A same-bundle High asynchronous-fence sample measured 36.89 ms/step versus
31.34 ms for synchronous batching, with about 1.50 versus 1.62 active CPU
cores. The measured hardware default remains synchronous batching in the
dedicated sensor worker. This single comparison does not establish the best
policy for other GPUs; software and unknown renderers retain asynchronous
readback.

The earlier 1,800-frame all-sensor city run measures 35.15 ms/step (0.316× realtime)
and 29.98 viewer FPS. CPU sampling attributes 21.55 seconds to sensor `readPixels`
and 8.24 seconds to main-thread `postMessage`; these include driver waits and
sampling overhead, not measured GPU compute durations. Its model workload,
source digests and limitations are in [the all-sensor record](../dev/all-sensors-performance-verification.json).
Complete visual SLAM remains pending, and 10× realtime requires 1.111 ms/step.
None of these results meets that target. Compiler-owned fused execution and
typed image/array storage are the next substantial performance work.

Actual source-issued portable functions are now verified separately in
Chromium. An unchanged Modelica function over 14,400 values, plus gain and
subtraction source edits, compiles to 1004/1005/1004-byte modules. Full-input
numerical oracles, ordered cancellation, signed zero, overflow and atomic
failure/recovery pass. The final 1000-call input-copy/execute/output-copy means
are 0.125, 0.0711 and 0.0706 ms (the prior baseline sample was 0.0804 ms).
These are standalone function timings, with engine tiering and shared-machine
variation; they do not measure feature detection, the complete estimator or
simulation throughput. Production compiler pin and model graph integration
remain unchanged. [The browser proof](../dev/rumoca-source-typed-call-browser-verification.json)
retains exact source/module digests, ABI layouts and reproduction instructions.

The unchanged 14,400-cell Integer recurrence also passes actual browser WASM
execution in a 904-byte module. BigInt64 input/output preserves the complete
signed 64-bit range, seeded accumulation order and checked overflow/underflow;
failed calls leave public output untouched and subsequent calls recover.
The combined Real/Integer gate passes both tests. This verifies a standalone
function, including its transfers, rather than the wrapper model or SLAM graph.

An unchanged function with a three-element carried tensor over the same full
14,400-value input also passes native and Chromium execution, along with an
edited gain. Its 1640/1641-byte modules preserve sequential field updates, all
four outputs, exact late source faults, input/ABI guards and atomic recovery.
The 1000-call input-copy/execute/output-copy means are 0.3332/0.3232 ms. A profiled
compiler dependency-inventory repair preserves first-occurrence order while
removing repeated linear membership searches; source lowering now finishes in
about 21 seconds where it previously timed out. Compilation and whole-graph
runtime performance still need work. These are component proofs, not SLAM or
10× acceptance; the same browser record retains their exact artifacts.

The current direct-flow INS measurement is identified separately below. The other records describe the implementation measured before the Modelica-only cutover. Python/Pyodide, Rust-algorithm and companion measurements remain historical comparisons; those execution paths and their runners are retired. No listed result establishes complete replacement-SLAM operation, current deployment or the requested 10× rate. Current algorithm and physics mathematics must be Modelica, Three.js provides 3D rendering, and host glue is limited to UI/I/O/compiler/worker plumbing. Docker execution is removed.

The current browser simulation schedules sensor events on a 180 Hz integer
clock grid. RGB and depth are paired at the selected 15/30/60/90 Hz; LiDAR,
IMU and GPS have independent selected rates. Physics waits for each due
event's capture and processing. A slow graph slows simulated progress relative
to wall time; due samples are not dropped. Recorded datasets preserve their
original timestamps. The earlier fixed-90-Hz measurements describe the
preceding scheduler.

The viewer targets 30 FPS independently. Supported OffscreenCanvas contexts give the viewer and sensor renderer dedicated workers; unavailable worker rendering falls back to the main thread. Viewer interpolation changes presentation only. Sensor images and moving actors use the committed simulation pose/time. Separate contexts still compete for the same CPU, GPU and driver resources, so a 30 FPS target does not establish a hardware performance guarantee.

Asynchronous RGB and depth reads share one pooled GPU fence per capture. Both render-target reads are submitted before that fence; processing waits for both, and the next physics step remains blocked. Dedicated sensor workers reporting hardware acceleration now select synchronous readback; software/unknown worker renderers and main-thread rendering retain the asynchronous path. Hardware browser checks compare exact RGB/depth bytes across both paths, repeated frames and scene-state restoration. Separate sensor-worker checks retain exact LiDAR ranges and committed timestamps. Buffer reuse and failed submission/fence/copy cleanup are tested as well.

A subsequent 1,800-frame RTX 3090 city profile with the Modelica Harris default, high detail, actors and no LiDAR measured 26.88 ms per step / 0.412× simulation rate / 1.92 active browser cores. Mean camera/detector/SLAM times were 14.21/3.19/5.02 ms. The final viewer window measured 30.50 FPS and 34.7 ms p95 intervals, with 0.982 m trajectory RMSE, 790 confirmed landmarks and no verified city loops. Perf recorded 94.59 CPU seconds across the sampled browser processes. This is a sequential shared-machine observation, not an isolated attribution of the improvement to fence batching: physics and estimator timings also changed. Complete throughput remains far below the requested 10× rate.

## Reading the diagnostics

The graphics diagnostic identifies the actual WebGL renderer, including software rendering. The performance monitor counts completed viewer renders, captures, vision outputs and LiDAR scans using elapsed wall time, with UI updates at most once per second and monitoring suspended while hidden. Display interval mean/p95 and main-thread long tasks, where supported, expose stalls. Long-task time is not process CPU utilization and unsupported browsers report it as unavailable.

Camera timings separate command submission from asynchronous readback wait. Worker timings separate input conversion, computation, output conversion and validation when supplied by the algorithm worker; RPC round-trip and queue time also include scheduling delays. The retired transport measurements separated serialization, Zenoh delivery, remote response and decoding. Current browser nodes exchange local typed data directly without Zenoh; the older timings are historical evidence. These are wall-time stage measurements, not GPU timestamp queries or operating-system CPU percentages. The displayed simulation/wall factor measures completed simulated time against elapsed execution time.

Headless browser checks use Chromium/SwiftShader. They establish correctness and expose regressions, but cannot predict Firefox on an RTX GPU or prove a particular realtime factor. No tenfold simulation speedup is established by the measurements below.

`scripts/profile-browser.mjs` profiles one built-preview Chromium instance after ten warmup frames. It explicitly selects the available **Modelica inertial propagation** workload, because full Modelica SLAM integration is pending. This INS profile does not measure visual SLAM. It records main/worker CPU profiles and Chromium process CPU-time deltas; `meanActiveCores` is summed process CPU seconds divided by elapsed sample wall time, including profiler overhead. Before profiling, the report records the algorithm/detector presets, seed, actor/lighting settings and SHA-256 hashes of the five editable sources—physics, sensor observations, evaluation, detector and algorithm—and the graph. Historical reports with three source hashes retain their original workloads. This is separate from the browser UI's long-task counter. Optional `SLAM_PROFILE_PERF=/path/to/perf` attaches operating-system sampling only to that browser's process IDs after warmup. The default sample is 60 lockstep frames; `SLAM_PROFILE_FRAMES` bounds a different count and `SLAM_PROFILE_SOFTWARE=1` explicitly selects SwiftShader. Hardware results must retain the reported renderer and scene/detail/LiDAR settings.

A 300-frame check after batching physics observations reported 20.32 ms per
complete step (0.546×), 1.92 mean active browser CPU cores and 30 FPS in the
final viewer window on ANGLE / NVIDIA RTX 3090. Mean physics was 0.854 ms;
RGB-D capture/transport remained the largest stage at 10.89 ms, including
1.93 ms render submission and 6.37 ms readback in the camera measurements.
The run retained ordered Modelica Harris and the full reference estimator,
city/high detail, cars/people enabled, LiDAR disabled, and all 90 Hz lockstep
samples. `perf` and CDP profiles reported no capture errors. This short run
covers a different motion/map interval than the 1,800-frame runs and occurred
on a shared development machine; it is not a matched whole-pipeline speedup
comparison. The trace is a local diagnostic at
`/tmp/slam-profile-bulk-physics`, not a checked-in benchmark dependency.

## Current direct-flow Modelica INS profile

The [checked report](../dev/modelica-direct-flow-performance.json) records a
120-frame run after ten warmup frames with local typed delivery and no Zenoh.
It explicitly used Modelica inertial propagation with full-resolution Harris
detection, city/high detail, seed 7, cars/people enabled, daylight and no LiDAR.
The report includes the five editable source hashes and graph hash. The
renderer was WebGL 2 / ANGLE / NVIDIA RTX 3090; the final viewer window measured
30.49 FPS. This is an INS workload, and it does not measure complete visual
SLAM, registration, mapping or loop closure.

Mean complete step was 26.8825 ms, giving a 0.41257× simulation/wall factor.
Mean node times were physics 1.269 ms, sensor 19.154 ms, Harris 3.038 ms,
inertial propagation 0.741 ms and evaluation 0.518 ms. Camera submission,
readback and total averaged 2.918 / 12.657 / 15.843 ms. CDP measured 5.02 browser
CPU seconds over 3.232 wall seconds, or 1.553 mean active cores. Perf recorded
4.906 CPU seconds, 385 samples and no lost samples; no browser errors occurred.

The browser ran at nice 10 on cores 4 and 5 while a compiler task used cores 6
and 7. Profiling overhead and shared-machine GPU/driver contention remain part
of this observation. Its workload differs from the historical full-estimator
runs, so their timings do not establish a speedup for this cutover. The
requested complete-pipeline 10× rate remains unmet.

The [synchronous-readback report](../dev/modelica-direct-flow-sync-performance.json)
uses the same five source hashes, graph, scene, seed, frame count and hardware
as the asynchronous run. It retains the same lockstep capture barrier and
measures blocking direct reads in the sensor worker.

| Current INS profile | Async readback | Direct readback |
| --- | ---: | ---: |
| Mean complete step | 26.883 ms | 22.508 ms |
| Simulation / wall time | 0.41257× | 0.49242× |
| Mean sensor node | 19.154 ms | 14.119 ms |
| Mean camera submission | 2.918 ms | 2.451 ms |
| Mean camera readback | 12.657 ms | 7.930 ms |
| Mean camera total | 15.843 ms | 10.581 ms |
| Mean active browser cores | 1.553 | 1.610 |

The direct run's viewer remained at 30 FPS and reported no errors. These were
sequential measurements on a shared development machine, with profiling
overhead and a concurrent compiler task; they do not isolate driver/readback
causality or establish a full-SLAM speedup. Following this comparison and exact
RGB/depth/LiDAR parity checks, dedicated sensor workers reporting hardware
acceleration select direct synchronous readback by default. Software/unknown
worker renderers and main-thread fallback retain asynchronous readback. Three
hardware browser gates passed with the new policy, including the shared 90 Hz
lockstep barrier, viewer rate near 30 FPS and the reported synchronous capture
method. Both observations remain far below the requested complete-pipeline
10× rate.

## Long-run trajectory transfer fix

A 1,800-frame city run exposed growing viewer submission cost: trajectory history retained entire estimates, including landmarks and pose graphs, and cloned that history into the viewer on every sensor frame. The late part of the run exceeded 200 ms per step although numerical node timings stayed stable. History now stores pose snapshots, and the viewer receives transferred Float32 position buffers in Three.js coordinates. Estimator data is sent separately. This preserves camera timing, estimator results and trajectories while avoiding repeated map-history allocation.

Measured Chromium reported ANGLE / NVIDIA GeForce RTX 3090 / OpenGL ES 3.2. The scene was city, high detail, cars and people enabled, LiDAR disabled; the detector and estimator still used the Python reference. Both runs processed 1,800 lockstep frames, representing 20 simulated seconds, after ten warmup frames, with CPU profiling enabled:

| Measurement | Before | After |
| --- | ---: | ---: |
| Wall time | 210.9 s | 52.0 s |
| Simulation / wall time | 0.095× | 0.385× |
| Mean complete step | 117.1 ms | 28.8 ms |
| Mean active browser CPU cores | 2.78 | 1.91 |

The corrected run averaged physics 1.45 ms, RGB-D capture/transport 14.06 ms, detector 5.94 ms, SLAM 4.37 ms and map handling 0.37 ms. The viewer reported 30 FPS, approximately 34.5 ms p95 display intervals and zero main-thread long tasks. Both runs ended with 0.982 m trajectory RMSE and 790 confirmed landmarks. They verified no city loop closures. This is a roughly fourfold improvement in this long-run comparison, not evidence of the requested 10× simulation rate. Achieving 10× at 90 Hz requires an average complete step below 1.12 ms.

A separate 180-frame run restricted the browser and all its CPU descendants to two cores using `taskset -c 0,1`. With the same RTX 3090 GPU and scene, it averaged 51.3 ms per step / 0.216× simulation rate / 1.34 active cores; the final viewer window reported 30.5 FPS and 39.9 ms p95 intervals. CPU affinity is a resource constraint, not a proxy for a laptop GPU. A separate 90-frame run with 64-beam LiDAR enabled averaged 39.0 ms per step / 0.284× / 2.41 active cores. Those short runs cover different motion intervals and cannot be used as matched speedup comparisons.

An internal `SLAM_PROFILE_READBACK=sync` probe keeps capture in the dedicated sensor worker but uses direct `readRenderTargetPixels`, with the blocking duration counted as readback time. GPU browser checks verify byte-identical RGB, depth and LiDAR at the same committed pose and restored scene state. This does not change the sensor frequency or physics clock.

Two separate historical 180-frame desktop runs measured 32.2 ms per step / 0.344× with asynchronous reads and 24.5 ms / 0.453× with direct reads. Mean active cores were 2.14 and 2.25 respectively; final viewer windows were near 30 FPS. A two-core direct-read probe instead averaged 62.4 ms / 0.177× / 1.48 active cores, slower than the earlier two-core asynchronous run. Runs were sequential on a shared development machine, so these are observations rather than isolated driver benchmarks. At that pre-cutover checkpoint, asynchronous readback remained the default and the direct path was a profiling option; the current hardware-worker policy is recorded above.

## Shared transforms for synchronized sensor passes

RGB and depth render from the same committed pose, as do the six faces of
one LiDAR cube. [withCommittedScene](../src/committed-scene.ts) updates the
scene matrices once before those synchronous render passes and restores
Three's automatic-update flag before waiting on GPU readback. Animation is
applied first. The viewer continues updating its own scene normally.

The hardware browser gate compares against a reference that forces the
original automatic traversal on every pass. At three different poses and
moving-actor times on the RTX 3090, all RGB bytes, depth samples and LiDAR
ranges match exactly. Instrumentation counts two full scene traversals for
RGB-D plus LiDAR, down from the original eight. An injected depth-render
failure restores the scene flag/material, and the next capture recovers.
The existing synchronous/asynchronous and worker readback parity checks also
pass. This removes repeated CPU work; it does not establish a whole-pipeline
speedup or eliminate GPU readback latency.

The following 300-frame profile retained the same editable source hashes,
seed and settings as the earlier short check, but measured 32.23 ms per step
(0.344×), 2.16 mean active browser CPU cores, and 29.51 FPS in the final viewer
window. Physics, detector, SLAM and camera timings all increased; the camera
averaged 2.85 ms render submission and 11.55 ms readback. This run overlapped
the bounded two-core compiler build on the shared machine, so it cannot
isolate the transform change's throughput effect. `perf` recorded 21.32 CPU
seconds over 10.10 sampled wall seconds; the GPU/CPU profiles are in the local
diagnostic `/tmp/slam-profile-committed-transforms`. No capture errors were
reported, and the separate 90 Hz lockstep / independent viewer browser gate
passes. The observed slowdown remains recorded rather than presented as a
performance improvement.

## Matched Modelica Harris benchmark

The retired matched-kernel profiler compared portable WASM under Node V8 with matching NumPy equations in Pyodide. It used source/compiler/exporter hashes to cache artifacts, validated source/layout provenance and checked every corner score, feature set and optional NMS mask. It excluded rendering, WorkerRpc and Zenoh transport.

The measured run used Node 24.21.0, Pyodide 0.29.3/NumPy 2.2.5 and Rumoca 0.10.0 commit `e1e7783f1fb4`. Eight recorded city RGB frames each ran three warmups and twelve measured iterations. Mean end-to-end CPU WASM timings include input copy, evaluation and output selection/conversion:

| Matched profile | Modelica WASM | Pyodide NumPy | Numerical result |
| --- | ---: | ---: | --- |
| Raw RGB → thumbnail Harris, host greedy suppression | 0.473 ms | 2.204 ms | All 392 scores exact; feature sets match on all eight frames |
| Raw RGB → thumbnail Harris + Modelica local NMS | 0.403 ms | 1.034 ms | Scores and all mask entries exact; feature sets match on all eight frames |

For Harris, input/evaluation/output means were 0.107/0.192/0.174 ms. For Harris + NMS they were 0.089/0.286/0.027 ms. Cold lowering/export took 9.96/1.68 seconds and 5.71/1.49 seconds respectively; the modules were 4,090,861 and 4,411,859 bytes. Saved matching artifacts avoid lowering/export on reload.

Both Modelica profiles accept raw 160×90 RGB but average 5×5 tiles into an 18×32 grayscale image and emit 14×28 scores. Harris selected 55–64 features in these frames; local NMS selected 11–16. The Python preset operates at full 160×90 resolution, uses different smoothing/suppression and permits 240 features. Before the candidate-sort optimization below, it took 9.443 ms and selected 115–128 features in the same run. Its result is a separate workload, not an equivalent performance baseline or evidence that replacing the default preserves localization quality.

The historical bounded runs used deterministic inputs or a browser-exported dataset. Their execution commands are removed with the retired reference runtime.

The recorded runner used seeded RGBA/black fixtures by default; recorded-city numbers required the original images. Explicit compiler packages had distinct source/compiler/exporter cache identities. Native/browser artifact parity was checked separately. These are historical methods, not current runtime directions.

## Historical full-resolution Python candidate sorting

The Harris preset now selects threshold-relevant quantized ranks before sorting, retaining a guard rank for rounded ties at the original stopping boundary. Pixel coordinates use ordinary integer `divmod` rather than repeated NumPy scalar coordinate conversion. It preserves all 25 smoothing additions, suppression, the 240-feature cap and pixel-index tie ordering. Native tests compare full response float64 bits and every output coordinate, score and order against an embedded original detector on seeded random, flat, edge, repeated-tie and weak-contrast images. With `SLAM_HARRIS_DATASET` set, the same test also checks eight recorded city frames.

A separate warmed Node 24.21.0/Pyodide 0.29.3/NumPy 2.2.5 run used those eight frames, eight warmups and sixty measured iterations per frame, interleaving all six call-order permutations across original, sort-only and final detectors. Mean complete `detect()` time was 9.946 ms originally, 9.262 ms with candidate sorting alone and 4.716 ms with integer coordinates as well. Original/final p95 was 12.811/6.332 ms; every returned score and feature remained exact. Input was prepared before timing, and output conversion, rendering, RPC and transport were excluded. This approximately 52.6% detector reduction (2.11×) does not establish the same improvement for complete simulation throughput.

## Full-resolution compiled Modelica Harris

The measured full-resolution preset used `HarrisRasterStages.mo`: three independently lowered Modelica models compute grayscale, gradient products and ordered 25-term Harris smoothing/response. The raster adapter supplies edge-clamped neighborhoods and caches the intermediate images. It emits only compiler-issued, certified direct assignment math. Every grouped load address is checked against the original issued address sequence before affine address arithmetic is hoisted. No image downsampling or handwritten substitute for the detector equations is used.

On eight recorded city images and six seeded random/flat/edge/tie fixtures, all 14,400 float64 response bits and returned feature coordinates, scores and ordering matched the optimized reference. Native Wasmtime checks also cover changed `harris_k` values, repeated images and zero clearing. Source changes invalidate cached artifacts. Separate browser replay checks retain identical estimator positions when the detector is replaced.

A warmed Node 24.21.0 run with Rumoca 0.10.0 / `e1e7783f1fb4` used eight city frames, eight warmups and thirty alternating measured iterations per frame. The final reduction source measured 2.350 ms end to end: 0.043 ms input copy, 1.607 ms WASM evaluation and 0.701 ms feature selection/output. The matched Pyodide reference was 4.543 ms including output conversion; p95 totals were 3.040/5.116 ms. The module was 4,663 bytes, with 983,040 bytes of bounded memory and no imports. Its source SHA-256 is `faa81a704d6d923720173e686c4d20102f47bb34b29ff591b9b76c12b5b853f7`; cold lowering/export/instantiate took 374/262/2.2 ms. Exact response bits and feature ordering also pass for edited `harris_k=0.07`, changing frames, flat-frame clearing and native Wasmtime execution. These measurements exclude camera rendering, worker RPC, Zenoh and estimator processing; they are not a full-pipeline speedup measurement.

A subsequent 1,800-frame complete city run used this Modelica detector with the reference SLAM estimator, high detail, actors enabled, asynchronous RGB-D reads and LiDAR disabled on the same RTX 3090 renderer. It measured 30.38 ms per step / 0.365× simulation rate / 2.04 active browser cores, with the final viewer window at 30.49 FPS. Mean stage times were physics 1.90 ms, camera 15.76 ms, detector 3.59 ms, SLAM 5.78 ms and map handling 0.42 ms. This sequential shared-machine observation did not improve whole-pipeline throughput over the earlier 28.8 ms reference run, despite lower detector cost. GPU capture and scheduling remain larger bottlenecks. A separate 2,250-frame browser flight verified finite covariance, continuing visual corrections and 1.16 m trajectory RMSE, with no verified city loop closures.

The earlier `HarrisPixelKernel` remains a separate prototype, with the same response/feature parity but approximately 16.9 ms end-to-end time in its original run because it recomputes each overlapping neighborhood. The full-array `HarrisFullResolution.mo` is retained as an installed-compiler overflow reproducer; it does not compile successfully with the pinned compiler. Staged execution provides working full-resolution editable math without claiming that compiler gap is resolved.

## GPU backend boundary

Scene, RGB-D and LiDAR rendering currently use standard WebGL2 GPU rendering with pooled asynchronous pixel-pack-buffer readback. The Modelica vision artifact evaluates f64 operations in CPU WebAssembly. Rumoca's `prepare_gpu_simulation` and `wgsl-ode` backend support checked explicit ODE derivatives with their own capability contract; they reject algebraic residual/projection stages required by the stateless vision path. A stateless array-map test also produced that explicit rejection with the installed compiler. No general WebGPU renderer or stateless Rumoca image-kernel executor is enabled in the app.

A general Modelica image kernel needs a causal image-compute backend and validation against the same full-resolution equations. Presenting existing ODE WGSL support or a smaller thumbnail workload as an implemented full-resolution GPU vision path would overstate the result. GPU integration, readback cost and complete graph throughput need separate measurements on the user's actual browser and renderer.

## Batched physics observations

The physics worker now reads one coherent Rumoca `state_json()` snapshot per step. Previously it read 16 variables separately and the clock once. Rumoca's current RK Model Exchange `get(name)` path constructs the full visible-value observation for each name; repeatedly crossing that path creates avoidable refresh and allocation work. The batch retains Rumoca's simulation time and all position, quaternion, velocity, accelerometer and gyro values. It does not advance the session or change integration.

An alternating 500-sample Node 24.21.0 run on the pinned Rumoca 0.10.0 / `e1e7783f1fb4` compared both reads at the same held-flight coordinate after 60 simulation steps. Every one of the 17 values, including time, remained bit-identical. Mean observation time was 0.368 ms for separate reads and 0.059 ms for the batch; p95 was 0.393/0.076 ms. The JSON snapshot was 1,468 bytes. This observation-only measurement excludes integration, rendering, workers and transport, and ran while compiler work was active on the machine. It does not establish a whole-pipeline speedup. The numerical test also checks changing commands, edited model mass, reset and a missing IMU output.

A future upstream typed batch ABI can further avoid JSON and repeated name lookups. The current change uses the supported pinned API rather than adding host-side physics mathematics.

## Full-resolution Modelica FAST-9 and Grid

The measured detector choices included **Modelica FAST · full resolution** and **Modelica Grid · full resolution** alongside the default full-resolution Modelica Harris preset. `FastRasterStages.mo` computes raw 0–255 grayscale, radius-three circle differences and the strongest contiguous nine-sample bright/dark arc. Shared 2/4/8-sample windows retain the original nine-sample response. Comparisons preserve the reference's ordered tie behavior, including signed zero. `GridRaster.mo` supplies uniform scores and sampling settings. Both execute compiled Modelica assignments over the full 160×90 frame; they do not use thumbnails or call the Python detector in production.

A separate selection ABI evaluates eight Modelica outputs: absolute threshold, relative threshold, rank scale, square suppression radius, feature cap, spacing, border and starting coordinate. The host performs generic sorting, suppression and feature packing. FAST defaults remain threshold 18, round-to-nearest-even ranks scaled by 1e8, stable pixel-index ties, suppression radius 3 and cap 240. Grid defaults remain spacing 6, start 5 and a five-pixel border, producing 350 features in raster order without suppression. Its cap 14400 preserves the uncapped reference traversal rather than silently truncating edited denser grids. Grid rejects threshold/ranking/suppression settings because its profile does not apply those policies.

Tests compare all 14,400 response float64 bits and every feature coordinate, score and ordering with the migration reference. They cover eight recorded city frames plus random, black/white, repeated, checker, weak-contrast and edge inputs under Node WASM and native Wasmtime. Edited FAST threshold 30 and Grid spacing 9/cap 100 also match. Compiler-issued dependency checks require selection settings to depend only on parameters/constants; image-, coordinate- and time-dependent configuration is rejected. Invalid spacing, incompatible caches, overlapping memory regions and unsupported issued stages are checked separately.

The matched Node 24.21.0/Pyodide 0.29.3 run used Rumoca 0.10.0 commit `e1e7783f1fb4`, eight city frames, eight warmups and thirty alternating measured calls per frame. Complete detector times include Modelica RGB input copying and host output packing; Python inputs were prepared beforehand, with output conversion included:

| Full-resolution detector | Modelica total | Python total | Modelica evaluation | Modelica module / memory |
| --- | ---: | ---: | ---: | ---: |
| FAST-9 | 17.358 ms | 15.300 ms | 16.813 ms | 26,749 / 589,824 bytes |
| Grid | 0.169 ms | 0.545 ms | 0.109 ms | 812 / 524,288 bytes |

FAST remains slower than its vectorized reference, even after source-level window caching reduced its initial Modelica total from 24.864 to 17.358 ms. Grid's advantage mainly comes from avoiding Pyodide feature conversion: Python computation alone averaged 0.053 ms, versus 0.109 ms for the full-image Modelica evaluation. These are CPU detector measurements, excluding rendering, worker RPC, transport and estimation; neither is a whole-pipeline speedup claim. FAST source SHA-256 is `a625243a70e07afc2cfdd543c64c453698fd6bf5c4572a6204e08c38adc907b5`; Grid is `ec104fcdcaa22e93e201bf0eb0f0eaf7157679445888109cf1f0b69461f80c63`.

Legacy Python projects now require an explicit migration error and manual porting with recoverable source. They cannot execute, fall back to a Python runtime or silently become an inertial/Modelica project. Saved Modelica sources retain compiler provenance and matching portable modules; source edits invalidate cached modules. Artifact checks bound memory to 2 MiB, forbid imports/start functions and validate aligned nonoverlapping ABI regions and selection domains. The associated source hash detects stale-source cache reuse; it does not certify that an arbitrary imported WASM binary was compiled from that source. Complete replacement Modelica Linux/NXP deployment remains pending and unsupported profiles report explicit errors.

## Optional separable Harris experiment

`models/HarrisSeparableRaster.mo` and `src/modelica-separable-raster-export.ts` power the optional **Modelica Harris · separable** preset. Ordered full-resolution Harris remains the default. Four compiler-issued Modelica stages cache grayscale, gradient products, unnormalized five-pixel horizontal sums and the final five-row Harris response. The last stage divides by 25 exactly once; there is no downsampling, feature-cap change or handwritten detector substitute. Generic raster addressing reads the declared neighborhoods. Grouping the additions changes floating-point association, so this profile is explicitly **not bit-exact** to ordered 25-term Harris.

A matched Node 24.21.0 run used the same eight city RGB frames, eight warmups and thirty alternating calls per frame for both compiled Modelica profiles:

| Measurement | Ordered default | Separable prototype |
| --- | ---: | ---: |
| Complete detector mean | 2.229 ms | 1.305 ms |
| WASM evaluation mean | 1.600 ms | 0.673 ms |
| Input / output mean | 0.027 / 0.603 ms | 0.027 / 0.606 ms |
| Complete detector p95 | 2.340 ms | 1.415 ms |
| Module / bounded memory | 4,663 / 983,040 bytes | 4,041 / 1,310,720 bytes |

These CPU WASM detector calls include RGB copying and feature packing, but exclude rendering, worker RPC, Zenoh and estimation. The prototype's source SHA-256 is `2f486773188cac1475570b5d0448e97577433744afd04ad2a2542443d60e68ba`. Lowering/export/instantiation measured 61/348/4.7 ms in that sequential run; the ordered compiler had already warmed up, so those are not matched cold-compilation timings.

Across the eight city frames and six random/flat/edge/tie/weak fixtures, all quantized ranks and selected coordinate ordering matched. However 49,397 response values differed in their float64 bits. Maximum absolute error was 1.0843e-18. The largest error was 0.087 of the checked forward-error envelope `128*epsilon*(abs(xx*yy)+xy^2+abs(k)*(xx+yy)^2)`; this conditions the error against contributing terms rather than dividing by a nearly cancelling response. Maximum relative error was 1.116e-12 among responses above 1e-12 magnitude. Native Wasmtime, edited `harris_k=0.07`, changing frames, flat clearing and source/cache checks also pass. Returned feature score bits can differ even when their coordinates and ordering match.

A deliberate rank-boundary fixture proves the equivalence is not universal. Two rotated copies of an 11×11 RGB patch with `harris_k=0.03999999935668231` give these actual Node/Wasmtime results at pixel (44,27):

| Profile | Response | Rounded rank at 1e12 |
| --- | ---: | ---: |
| Ordered | 0.0002947106895 | 294710690 |
| Separable | 0.0002947106894999999 | 294710689 |

The first two selected coordinates swap with (112,61), although the selected coordinate set stays the same. The compact fixture is `tests/fixtures/harris-separable-rounding.json`; its regression test preserves that difference and verifies the ordered module still matches the original oracle bit-for-bit. The existing ordered exactness gate remains unchanged. This rounding-sensitive preset stays opt-in.

The actual-browser integration test replays 30 identical RGB-D/IMU records through ordered and separable Harris, verifying matching feature coordinates/order, score differences below 1e-15, and estimator position differences below 1e-9 on those ordinary frames. A separate 2,250-step/25-second simulated flight produced 1.158 m trajectory RMSE, 153 visual updates, finite position covariance, and 999 map points. It verified zero city loop closures; the result does not establish loop-closure quality. Source edits to `harris_k=0.07` recompile to a different artifact and survive local save/reload. Its approximately 49.35 seconds wall time is a validation run, not a matched whole-pipeline speedup benchmark.
## Current independent sensor-rate profiles

The quality dial now changes sensor workload as well as presentation. In two
sequential six-second simulated Main Street profiles on the RTX 3090, Low
(RGB-D 15 Hz, LiDAR 10 Hz, IMU 90 Hz, GPS 5 Hz) measured **1.48× realtime**;
High (90/20/90/10 Hz) measured **0.39×**. Both enabled GPU depth clouds and
64×1024 LiDAR, the full-resolution detector, actual quadrotor plant and the
available Modelica INS baseline. These different-rate workloads are not an
equal-work renderer comparison or full visual SLAM benchmark. Both final
viewer windows reported 30 FPS, with p95 intervals of 37.4/39.6 ms; individual
deadlines were missed. The 10× target remains unmet.

CPU/perf sampling covered the owned browser processes, pinned to two CPU cores
at nice 10, after warmup. Mean browser CPU use was 1.53/1.59 active cores. Low's
frame interval covers six IMU samples: its 27.0 ms physics-node mean includes
those transport/evaluation events and intervening LiDAR capture. It is not
pure rigid-body integration time. Readback and repeated worker/runtime
boundaries remain targets for compiling the full Modelica processing graph.
Custom sensor rates persist independently of graphics settings.

Exact bundles, source snapshots, samples and perf counters are retained in
[the multirate profile record](../dev/multirate-sensor-performance-verification.json).
These measurements precede the Configuration tab and shared IMU input-validator
build; their scope and hashes remain explicit. Earlier measurements above
retain their original fixed-rate workloads.
