# GPU reconstruction of the native depth cloud

Live cloud display now uses the same top-down Z16 image delivered to the
algorithm. A Three.js vertex shader reads an unsigned R16UI texture, computes
one FLU point per pixel from the calibrated intrinsics, and renders it at the
captured camera pose. There is no host XYZ construction, row flip, scalar
conversion, decimation or additional sensor readback for presentation.

This removes 6,512,640 bytes of dense Float32 XYZ/depth readback per native
848×480 camera frame. The viewer uploads 814,080 bytes of Z16 instead of
6,512,640 bytes of XYZ/depth. Noise, invalid returns, clipping, camera
intrinsics, offsets and capture time remain explicit. RGB8, Z16, LiDAR and
every algorithm processing tick retain their formats and cadence. Renderer
pose metadata stays out of algorithm inputs.

Explicit `captureSensorPair` still provides dense GPU-computed XYZ when a
consumer requests it. Live display uses the compact path by default; the
internal `setDepthCloudReadback` comparison control selects the dense path.
The display mailbox retains its bounded transferable pool, latest-only
presentation policy and captured LiDAR placement. It preserves Z16 bytes,
including diagnostic row padding, and aligns a following Float32 LiDAR view.
Textures and geometry are reused at stable shapes. No vertex array is built
for the depth cloud: `gl_VertexID` supplies each pixel index.

## Qualification

The [consolidated receipt](artifacts/depth-cloud-raster-2026-10-07/review.json)
records eight passing browser tests, nine unit tests and a passing TypeScript
check. Hardware and SwiftShader both pass the new point/ownership tests.

The native point test observes all 407,040 vertex results with transform
feedback compiled from the actual presentation vertex shader. Native results
match the existing noisy dense GPU cloud; the RTX3090 result is byte-exact in
the observed Float32 coordinates. The fixture has 405,047 valid points and
1,993 invalid returns. Separate 13×17,17×13 and848×480 tests check padding,
asymmetric intrinsics, two unit scales and near/far rejection against analytic
geometry, with error below 4.3e-7 m. Actual Three.js rendering also matches the
dense representation at a translated and rotated pose: 111,770 nonblack
pixels, zero differing pixels on the hardware run.

Native camera capture still uses one host copy. A camera/LiDAR tick reads
3,083,776 bytes instead of9,596,416. RGB, depth and LiDAR are byte-identical
between the two representations; the raster aliases the original depth view.
The algorithm-facing object contains only `rgb`, `depth` and `imageLayout`.
Worker tests hash all displayed values after transferable-buffer recycling,
verify unchanged sensor storage and stable geometry, and check held scan
placement after a newer body pose. The hardware lockstep/viewer test passes.
Full software-city loading remains unqualified; component success does not
resolve the previously recorded software-city deadline failure.

## Matched throughput

The [comparison](artifacts/depth-cloud-raster-2026-10-07/comparison.json)
uses the same current runtime with only the cloud presentation encoding
changed, in dense/raster/raster/dense order. Each run freezes its sources and
checks served assets before and after. Sampling is disabled for these runs.
They run sequentially on the RTX3090 with owned work limited to two CPU cores
(6–7), nice15 and one OpenMP thread, while the host is shared.

| Encoding | Simulation/wall | Mean browser active cores |
| --- | ---: | ---: |
| Dense XYZ, first | 0.867× | 1.634 |
| Z16 GPU display, first | 1.260× | 1.580 |
| Z16 GPU display, second | 1.214× | 1.517 |
| Dense XYZ, second | 0.848× | 1.667 |

The repeated raster rates are about40–49% faster than the dense rates in this
short campaign. This is a camera plus Modelica inertial baseline measurement,
not full SLAM throughput. The10× target remains unachieved.

Every run processes90 native camera frames,270 IMU samples,30 LiDAR scans and
15 GPS ticks in3 simulated seconds. Camera30Hz, IMU90Hz, LiDAR10Hz and GPS5Hz,
scene detail, actors, seed, noise and authored algorithm sources match. The
viewer publishes66–69 of the90 raster clouds versus83 dense clouds because it
renders at30Hz wall time while raster simulation advances faster. This is
presentation coalescing; no algorithm frame is dropped. Display LiDAR updates
are29–30 in the measured window; all30 scans are processed. Four pool buffers
are allocated before measurement and no further allocations occur.

Final viewer reporting windows show29.5–30.5FPS with raster display; individual
windows do not prove steady30FPS. Their p95 frame intervals are37.1–42.8ms.
Mean render submission is about3.44–3.45ms versus4.25–4.88ms with dense points.

## Separate profiling

The [raster diagnostic](artifacts/depth-cloud-raster-2026-10-07/raster-diagnostic/report.json)
separates uninstrumented throughput (1.443×), CPU/perf sampling (1.121× with
overhead) and ten GPU-timed frames (1.050× with overhead). These additional
rates are not paired speedup evidence. All GPU queries are available and
non-disjoint.

Ten GPU-timed frames, including three LiDAR scans, read23,497,728 bytes in ten
host copies. Rendering totals14.887ms (1.489ms/camera frame); PBO-write queries
total14.039ms and host-copy API wall time totals66.100ms. These intervals overlap
and must not be added. Host-copy wall time includes waiting and browser/driver
work; it does not isolate PCIe transfer. Relative to the equivalent payload
with dense XYZ,65,126,400 fewer bytes cross the sensor readback boundary.

CPU sampling records11.04% self time in sensor `getBufferSubData` with81.42%
idle. Main-thread samples include6.72% `postMessage`,1.90% garbage collection
and77.59% idle. Native perf retains317 samples with zero lost, including clock
queries, browser/driver calls and memory copies. The raw perf and CPU profiles
remain in scratch; concise native output is retained with the diagnostic.
The complete guarded comparison takes176s, peaks at4,714,328KiB owned RSS and
keeps at least55,561,040KiB host memory available.

Further work must reduce the remaining GPU readback and serialized runtime
calls. Full browser SLAM still requires Rumoca's native State and typed raw
input integration. No compiler pin, numerical fallback or authored Modelica
was changed for this campaign; its native59-file source is SHA9cd25ba7.

After the campaign, the [Catalog declaration fix](modelica-catalog-bindings-2026-10-07.md)
changes that one pending-SLAM source file. The [source follow-up](artifacts/depth-cloud-raster-2026-10-07/source-follow-up.json)
records the exact delta; graphics/runtime files still match the measured build.
These measurements do not execute the corrected SLAM State.
