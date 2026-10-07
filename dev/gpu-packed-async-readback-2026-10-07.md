# Packed asynchronous sensor readback

The camera, raw depth, optional depth cloud and same-timestamp LiDAR can now use
one pooled pixel-pack buffer and one host copy in asynchronous mode. Previously
only synchronous capture supported a packed batch; asynchronous capture used
one buffer and one copy per attachment. Hardware still defaults to the existing
synchronous path until matched measurements justify changing it.

`src/gpu-readback.ts` shares packed submission/copy code between both modes and
shares fence completion between packed and separate asynchronous batches.
Every render/read submission happens synchronously at the committed pose. The
async path flushes one fence, yields to the event loop and backs off while that
fence is unsignaled. Only after completion does it call `getBufferSubData` once.
The capture Promise remains the lockstep barrier; no later simulation frame is
submitted while processing the current frame.

This follows the [WebGL 2 readback guidance](https://registry.khronos.org/webgl/specs/latest/2.0/#3.7.3):
readback can incur a blocking driver/browser round trip, and inserting a fence
before copying can reduce that cost. It cannot eliminate the transfer of bytes
to CPU memory. WebGL also requires an event-loop turn before a newly created
fence can signal. The locally installed Three.js 0.180 implementation starts
its async fence polling with a 4 ms timer; this transport uses an initial
MessageChannel turn followed by 1–4 ms timer backoff. It does not busy-spin.

Direct mode writes into the supplied contiguous destination. The unit fixture
uses a real `WebAssembly.Memory` window with guards and special float payloads.
If memory grows and detaches views while the fence is pending, capture refuses
before copying. Owners must retain valid input windows until capture completes.
Production sensor storage is still an application-owned buffer; Rumoca's typed
source-bound writable input windows and complete native SLAM State integration
remain pending. No zero-copy GPU/WASM claim is made.

The normal device data remains RGB8 and little-endian Z16, packed and oriented
by GPU shaders. Float32 cloud/LiDAR payloads are copied as bytes, preserving
their bits. JS performs transport and optional bulk scatter only. Source math,
image conversion and SLAM compilation remain owned by Modelica/Rumoca.

## Validation

The 17 readback unit cases pass, including all previous synchronous and
separate-buffer tests. New coverage checks one packed copy, all submissions
before the fence, stable WASM windows/guards, exact float payloads, buffer reuse,
current binding restoration after an event-loop turn, memory-grow rejection,
submission/fence/context/copy faults, timeout cleanup and pending-disposal
refusal. TypeScript validation passes.

The actual hardware and software browser fixture checks native 848×480 RGB8/Z16,
depth cloud and 64-beam LiDAR parity between synchronous packed, asynchronous
packed and asynchronous separate reads. Both packed paths make one host copy.
The hardware viewer/lockstep test also passes in both default synchronous mode
and forced packed asynchronous mode (`SLAM_TEST_PACKED_READBACK=1`,
`SLAM_TEST_READBACK=async`). Resource-bounded logs and browser
attachments are under `$HOME/scratch/slam_web/profiles/packed-async-2026-10-07`.

## Matched timing experiment

`dev/profile-frozen-pipeline.mjs` accepts `SLAM_PIPELINE_READBACK_MATRIX=1`.
It builds an isolated source snapshot and compares synchronous packed,
asynchronous packed and asynchronous separate capture at balanced fidelity.
Camera-only and camera/cloud/LiDAR configurations each run twice, with the
second sweep reversed. CPU/GPU sampling is disabled; process CPU deltas are
recorded outside the measured frame loop. Exact settings, source hashes, served
asset hashes and per-frame timing remain in the report. These are camera plus
Modelica inertial baseline measurements, not full visual SLAM or 10× acceptance.

Example, inside the repository development environment:

```sh
SLAM_PIPELINE_READBACK_MATRIX=1 SLAM_PIPELINE_FRAMES=30 \
  node dev/profile-frozen-pipeline.mjs dev/artifacts/fresh-readback-comparison
```

Use the resource guard, low priority and project scratch settings for shared-host
profiling. The driver requires a fresh output directory and never replaces the
live preview or its production assets.

The [matched report](artifacts/packed-async-readback-2026-10-07/report.json)
contains all twelve runs. Each measured 30 frames after ten warmup frames on
two low-priority CPU cores of a shared machine, RTX 3090, native 848×480 RGB8/Z16,
camera 30 Hz, LiDAR 10 Hz, IMU 90 Hz and GPS 5 Hz in simulation time. Source and
served-asset bookends pass; all runs report no page errors. LiDAR/cloud are
disabled in the camera-only rows and enabled in the combined rows.

| Workload | Capture path | Realtime factor, sweep 1 / 2 | Mean active CPU cores, sweep 1 / 2 |
| --- | --- | --- | --- |
| Camera | Sync packed | 1.595 / 1.291 | 1.69 / 1.56 |
| Camera | Async packed | 0.686 / 1.114 | 1.12 / 1.43 |
| Camera | Async separate | 0.642 / 0.722 | 1.12 / 1.22 |
| Camera + cloud + LiDAR | Sync packed | 0.821 / 0.856 | 1.72 / 1.76 |
| Camera + cloud + LiDAR | Async packed | 0.520 / 0.575 | 1.33 / 1.34 |
| Camera + cloud + LiDAR | Async separate | 0.571 / 0.523 | 1.32 / 1.24 |

Packed async does not beat synchronous capture on this machine. Compared with
separate async reads, it has no consistent combined-workload throughput gain
in these short runs. The CPU figures also vary. Its concrete benefit is one
transport copy and support for contiguous direct destinations without blocking
the worker on GPU completion. Hardware defaults remain synchronous; no automatic
policy change or full-SLAM speedup is claimed.

Combined synchronous captures average 18.18 / 17.97 ms, with measured readback
intervals of 15.26 / 15.16 ms. Combined async packed captures average 35.24 /
33.11 ms, including 31.40 / 29.40 ms in the readback/wait interval. These are wall
intervals including browser scheduling and GPU waits, not isolated device copy
times. Mean node timing also changes across runs, so these data do not isolate
a single causal CPU or GPU bottleneck. An additional separated GPU/CPU diagnostic
is recorded rather than attributing the entire wait to the PCIe transfer.

## Separate CPU and GPU diagnostic

The [sensor diagnostic report](artifacts/packed-sensor-diagnostic-2026-10-07/report.json)
uses the same runtime sources, synchronous packed mode and enabled sensor
streams. Its helper adds a diagnostic option after the matrix was frozen, so
the driver hash differs; the application sources match. The uninstrumented
30-frame run measures 0.819×, about 1.65 active CPU cores. The separate
60-frame CPU-sampled run measures 0.703× with profiling overhead, and the
10-frame GPU-timed run measures 0.571× with query overhead. Do not compare
these diagnostic rates as implementation speedups.

All GPU timer queries were available and non-disjoint. Across ten camera
frames (with three LiDAR ticks), render queries total 18.992 ms: RGB 11.736 ms,
axial depth 1.079 ms, full-screen shader passes 1.386 ms and LiDAR faces
4.790 ms. That averages 1.899 ms of rendering per camera frame. PBO-write
queries total 46.653 ms; ten host-copy calls total 204.900 ms wall time for
88,624,128 bytes. The host interval includes GPU synchronization and browser
overhead; the intervals overlap and must not be summed. These short diagnostics
do not prove exclusive costs, GPU saturation or sustained full-SLAM performance.

The CPU profile records 7.52% main-thread self time in `flushClouds`, 7.37% in
`postMessage`, and 2.62% in garbage collection; 70.47% is idle. The sensor worker
records 16.57% in `getBufferSubData` and 77.09% idle. These percentages are of
each sampled profile, including idle and diagnostic overhead; they are not
global CPU utilization. Source inspection confirms `flushClouds` clones dense
cloud/LiDAR arrays for presentation. Reducing those presentation copies is a
concrete next target, alongside direct Rumoca input-window integration.

Native `perf` captured 291 samples with zero lost. Self samples include
clock queries (6.53%), memmove (4.47% worker / 3.44% browser), concurrent V8
marking (4.12%) and browser/NVIDIA readback. The short profile and unresolved
JIT/driver addresses limit attribution. The separate stat capture records
4763.87 ms task clock over 2.85 s elapsed. Raw traces and full reports remain
in scratch; the concise native summary is retained with the diagnostic evidence.

## Unqualified software city workload

The native-sized component capture passes on SwiftShader. The complete city
clock/viewer test on two low-priority CPU cores fails its unchanged 120 s test
deadline while waiting for more than five frames after source/project import.
Packed async reaches frame 1; the previous separate-buffer async path, forced
through the same reference-project helper, reaches frame 2. The packed run's
snapshot reports about 2 viewer FPS. Neither run qualifies the complete
software city, and these observations do not establish a comparative packing
regression or a causal diagnosis. They expose an unresolved broader software
rendering/load problem. The assertion, scene and timeout were not relaxed.

Both original failures, exact errors and page snapshots are preserved in the
review evidence and scratch `software-clock*` receipts. The hardware clock
check passes. Reducing dense display transfers and scaling software scene
rendering remain work toward the overall portability/performance objective;
full browser SLAM and the 10× goal are still unachieved.

The consolidated [review](artifacts/packed-async-readback-2026-10-07/review.json)
binds current runtime sources and the unchanged 59-file Modelica source to the
passing and failing checks. It includes the final TypeScript receipt, browser
errors/snapshots, both profiling campaigns and the explicit remaining limits.
