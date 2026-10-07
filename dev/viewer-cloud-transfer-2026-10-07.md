# Bounded cloud presentation transfers

The prior CPU profile attributed main-thread self time to dense-cloud cloning
and worker messaging. Source inspection also found that every camera frame
re-enqueued the latest LiDAR object, including frames between LiDAR ticks.
This change reduces display transport work while retaining every sensor result
for lockstep processing.

## Implementation

`src/viewer-cloud-transfer.ts` keeps only the newest pending presentation for
each stream. Object identity suppresses unchanged captures; time alone is not
used because resets and replay may legitimately revisit a timestamp. At most
one combined cloud/LiDAR message is in flight. A busy viewer therefore delays
presentation without accumulating a queue of dense copies or blocking the
simulation's algorithm processing.

One separate transferable buffer holds the changed display streams. If the
camera cloud and LiDAR share adjacent source storage, one bulk byte copy fills
that buffer; otherwise two bulk byte copies fill it. Raw float payloads are
preserved, with no element conversion, filtering or point compaction. The
original sensor/estimator/recording buffers remain owned by the application.

The worker returns retired buffers only after neither stream's geometry still
references them. This matters when a combined allocation holds both streams:
new camera data alone cannot release the allocation still used by a held LiDAR
scan. The sender retains at most three idle buffers. In repeated stable-shape
30 Hz camera / 10 Hz LiDAR tests, four total allocations suffice after warmup.
The first unit run exposed a two-idle-buffer policy evicting a useful combined
allocation every LiDAR tick; the bounded pool now retains the needed set.

`src/dense-point-buffer.ts` reuses the geometry and interleaved GL attribute at
stable shapes, replaces its array reference and increments its version for
Three.js to upload. A size change rebuilds/disposes the geometry. It performs
no per-point math. Three.js 0.180's local `WebGLAttributes.updateBuffer` uses
`bufferSubData` on an updated attribute; the application no longer destroys
and reallocates cloud/LiDAR geometry every capture.

LiDAR display placement is copied from the main world's captured scan view
when that scan first enters the mailbox. The viewer applies that placement
instead of a newer interpolated body pose. This metadata stays exclusively
in the presentation message; sensor inputs and Modelica code receive no new
truth pose. Depth clouds retain their existing capture pose and mounting offset.

A new project clears queued presentation identities and hides old clouds.
Quality changes that preserve presentation keep the current display. A pending
batch retains its completion ownership across a project reset.

## Qualification

Eight focused unit checks pass across the cloud-transfer and trajectory files.
They cover exact float bits (including NaN payloads and signed zero), immutable
source ownership, latest-only backpressure, held-stream retention, mixed rates,
buffer reuse, changed shapes, resets and stable geometry/attribute reuse.
TypeScript validation passes.

The actual viewer worker fixture passes on hardware and SwiftShader with native
848×480 clouds and 64×1024 LiDAR. Across twelve frames it checks complete SHA256
digests of both displayed arrays, source storage preservation, four total
allocations, stable geometry identities, captured placement after newer body
poses, native counts and no GL errors. The fixture isolates protocol/render
correctness; it is not whole-city software performance qualification.

The hardware application clock/viewer and native raw camera/cloud/LiDAR capture
checks also pass. The earlier complete SwiftShader city clock failures remain
unresolved; this change does not claim to qualify that workload. Logs and
attachments are under `$HOME/scratch/slam_web/profiles/viewer-cloud-transfer-2026-10-07`.

## Performance campaign

`dev/profile-viewer-cloud-transfer.mjs` verifies every preserved source file
from the preceding sensor diagnostic, copies it into a disposable scratch
baseline, and installs the same measurement helpers in both runtimes. Shared
public assets are hashed by every run. The campaign measures before, after,
after, before with sampling disabled, then records a separate after CPU/perf/GPU
diagnostic. It preserves native raster sizes, balanced graphics, actors,
camera/depth-cloud/LiDAR streams, sensor clocks and synchronous packed capture.

The new profiler counters record display batches, copied bytes, allocations,
reuse and queue state outside numerical code. Measurements remain camera plus
Modelica inertial baseline evidence. Native detector/full SLAM integration,
compiler-owned typed input windows, portability and 10× acceptance are still
pending; authored Modelica source and the production compiler pin are unchanged.

The [comparison](artifacts/viewer-cloud-transfer-2026-10-07/comparison.json)
contains two 90-frame, sampling-disabled measurements per runtime after ten
warmup frames. They ran sequentially on two low-priority CPU cores of the shared
RTX 3090 machine. Every source/asset bookend passes; page errors are empty.

| Runtime | Realtime factor, run 1 / 2 | Mean active browser CPU cores, run 1 / 2 |
| --- | --- | --- |
| Preserved before | 0.706 / 0.795 | 1.723 / 1.718 |
| Current after | 0.793 / 0.794 | 1.554 / 1.498 |

The new runs consume about 10–13% fewer active CPU cores in these observations.
Throughput overlaps the older runtime's range, so no consistent speedup is
established. This is a CPU/allocation improvement with substantial throughput
work remaining. Final viewer reporting windows measure 30.49 / 30.00 FPS after
versus 29.51 / 28.00 before; those individual windows do not prove sustained,
uniform 30 FPS on all systems.

All four runs process exactly 90 camera frames, 270 IMU samples, 30 LiDAR scans
and 15 GPS observations over three simulation seconds. Camera/IMU/LiDAR/GPS
remain 30/90/10/5 Hz respectively. Rasters, scene, actors and input formats
are unchanged. The two new display runs publish 83 / 84 clouds and all 30 LiDAR
updates during the measurement; stale display-only clouds may be coalesced,
while the processing graph still receives every capture. Four buffers were
already allocated after warmup and no further pool allocations occur during
either measured interval. All published samples retain their full native sizes.

## Separate diagnostic

The [after diagnostic](artifacts/viewer-cloud-transfer-2026-10-07/after-diagnostic/report.json)
separates uninstrumented throughput (0.800×), CPU/perf sampling (0.801× with
overhead), and ten GPU-timed frames (0.815× with overhead). Do not use these
rates as matched before/after measurements. The sensor worker profile still
records substantial self time in `getBufferSubData` (21.66%, including 70.61%
idle in that profile). Main-thread profiling records 5.96% in `postMessage`,
4.86% garbage collection and 73.93% idle; it does not establish that every
allocation source or message cost has been eliminated.

All GPU queries were available and non-disjoint. Rendering totals 17.777 ms
over ten camera frames (including three LiDAR ticks): 1.778 ms per frame.
Ten host-copy calls total 127.100 ms wall time for 88,624,128 bytes. PBO-write
queries total 38.860 ms. These intervals overlap; host time includes GPU waits
and browser/driver overhead. The dominant host interval remains a target, and
this short diagnostic does not isolate PCIe transfer time or GPU saturation.

Native `perf` captures 442 samples with zero lost. Visible self costs include
clock queries (9.28%), worker/browser memmove (3.85% / 2.94%), V8 concurrent
marking (2.71%) and browser/NVIDIA readback. The stat capture records 6270.83 ms
task clock over 3.75 s. Raw profiles stay in scratch; concise native output is
retained with the diagnostic. The entire guarded comparison finishes in 187 s,
peak owned RSS 4,810,532 KiB, with minimum host available memory 54,558,344 KiB.

The next graphics transport target is the large dense-cloud round trip.
Displaying depth by reconstructing its points in the viewer GPU could preserve
the image/point geometry while avoiding a host XYZ readback for presentation.
That is future work, not part of these measurements; raw algorithm inputs,
explicit dense-cloud capture and native Modelica qualification must retain
their contracts. Full browser SLAM still depends on Rumoca's native State and
typed-input integration; there is no numerical fallback in this change.

The consolidated [qualification receipt](artifacts/viewer-cloud-transfer-2026-10-07/review.json)
records source hashes, matching workloads, test results and resource bounds.
