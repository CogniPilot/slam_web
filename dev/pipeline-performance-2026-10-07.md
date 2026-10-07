# Native-image browser pipeline profile

These historical measurements were recorded before the user's explicit request
to remove the legacy vision adapter and put depth noise in a shader. The live
application now runs camera + Modelica inertial propagation with GPU depth
noise; native vision and full SLAM are pending. The removed detector's runtime
must not be counted as a SLAM performance improvement.

The measured browser remained below real time. It ran Modelica inertial
propagation and the historical Harris raster adapter, not full visual SLAM.
The RTX3090 is reported by ANGLE/WebGL2. The principal measured bottleneck is
the Harris detector, rather than camera rendering alone.

## Measurements

Frozen-source campaigns `artifacts/pipeline-2026-10-07-a` and `-b` contain
source/served-asset bookends, full per-frame timings and compiler/source IDs.
Large builds, CPU profiles, perf recordings and screenshots remain under
the home-relative scratch paths in their reports. The live preview was not
replaced. Both campaigns completed without browser errors or changed assets.

Each campaign measures30 camera frames per quality mode with CPU sampling
disabled, followed by a separate60-frame medium diagnostic with main/worker
CDP profiles and native `perf`. Images are848×480; camera clocks are15/30/60Hz,
IMU90Hz, actors enabled, depth cloud and LiDAR disabled, asynchronous GPU
readback. These workloads do not establish performance with LiDAR enabled.

| Quality | Before, × realtime | After, × realtime | After Harris compute, ms/frame |
| --- | ---: | ---: | ---: |
| Low | 0.311 | 0.397 | 65.65 |
| Medium | 0.153 | 0.194 | 71.69 |
| High | 0.095 | 0.111 | 65.35 |

All owned jobs used cores6,7, nice15, OMP1, time/RSS limits and a16GiB available
memory reserve. Other jobs remained active. These are short shared-host,
two-core observations; they are not unrestricted-machine maxima or a clean
matched causal speedup measurement. Development limits explain some difference
from the user's rates. The same per-camera detector work explains why reducing
sensor frequency helps roughly in proportion to the selected rate.

## Attribution and changes

Before, the low detector averages94.52ms total:71.75ms WASM evaluation,
13.13ms feature selection,1.79ms input conversion, with the remainder including
RPC and scheduling. Camera submission/readback averages18.53ms. Stages are
from that same run; other runs must not be mixed into a summed decomposition.

The medium diagnostic maps8.86% of main-thread weighted self samples to the
depth-preview pixel loop,6.06% to `Runtime.noise`, and4.01% of the vision
worker's samples to `readRasterFeatures`;25.94% are in its generated WASM
function0. Samples include idle time and scheduling and are not exact CPU
execution percentages. Native `perf` reports zero lost samples and visible
sine/cosine/logarithm costs. Raw perf can identify JIT addresses but does not
provide enough symbols to assign those addresses to Rumoca Rust functions.

The depth preview previously allocated1.63MB of RGBA and evaluated sine over
407,040 pixels on every frame. `src/depth-preview.ts` now uploads the existing
Float32 image and colors it with a Three.js shader. It never modifies the raw
depth. Sensor previews and trajectory drawing are coalesced onto the existing
30Hz real-time presentation deadline, while every sensor/estimator frame still
runs in lockstep. RGB preview upload uses a view instead of copying its image.
The RGB-only vision worker receives RGB, dimensions and time, excluding the
unused depth and IMU fields; buffers remain owned by the complete main frame.

The after diagnostic has no depth-preview host pixel loop. The same detector
worker bundle and WASM function remain hot. Current JS depth-noise generation,
U8-to-F64 raster expansion, and JS feature ranking still require replacement
by the intended compiler-owned pipeline; these were not hidden or disabled.
The current Harris WASM was emitted by the legacy application raster adapter
from compiler-issued rows. These timings must not be attributed to a qualified
Rumoca-owned whole-frame native emitter, which is still pending.

## Verification

Hardware browser checks pass for actual reduced-message/full-message feature
equality, retained raw images, held IMU timing, and the GPU depth preview.
The preview checks rectangular grids,848×480, both signed zeros, invalid black,
row orientation, resize, replacement frames and raw-byte preservation. Display
colors differ by at most one8-bit display value from the independent old color
formula. The same preview check passes on SwiftShader. TypeScript passes.
Receipts are under `scratch/slam_web/profiles/depth-preview-2026-10-07`.

Full SLAM, a steady30FPS interval distribution, and10× realtime have not been
established by this work. The10× frame budget at30Hz is3.33ms; the current
Harris evaluation alone exceeds it by approximately20×.

## Camera/INS after explicit legacy removal

Campaign `artifacts/pipeline-2026-10-07-c` is a different workload: the user
requested removal of the historical detector and GPU depth noise. It runs
Modelica physics/INS and848×480 GPU-noised cameras, with native vision/full
SLAM pending, actors enabled and LiDAR/depth cloud disabled. Hardware readback
uses the production synchronous packed PBO choice; the earlier campaigns
explicitly selected asynchronous readback. Short, sampling-disabled30-frame
observations measure2.03× low,1.41× balanced,0.70× high. The separate60-frame
medium CDP/perf diagnostic measures1.06× with instrumentation. No paired
causal speedup or full-SLAM throughput is claimed.

Balanced node wall intervals average9.99ms physics,10.76ms sensor,1.19ms INS
and0.97ms evaluation. They include RPC/waits and scheduling, not just CPU
execution. The diagnostic main profile is81.10% idle; sensor worker self
samples include7.27% getBufferSubData and2.65% readBatchPackedSync, with85.53%
idle. Physics is91.49% idle, so its wall interval cannot be described as9.99ms
of pure numerical CPU work. Readback and serialized worker/physics intervals
remain worth investigating. These sampled shares do not measure GPU execution.
The old Runtime.noise/preview pixel loops and legacy detector are absent.

Native perf captured180 samples, zero lost, over roughly1.9s. Visible costs
include clock_gettime and NVIDIA/ANGLE framebuffer readback; this short capture
does not resolve all JIT addresses or prove a unique bottleneck. All six actual
workers and the main thread have CDP profiles. Source/asset bookends pass;
the minified production bundle contains no modelica-vision worker or WABT.
The build/profile guard completed in68.96s with4,652,712KiB peak owned RSS,
two low-priority cores and the16GiB host memory reserve. Tests and limits are
recorded in `artifacts/gpu-noise-retirement-2026-10-07/review.json`.

## Live RGB8/Z16 boundary and GPU attribution

Campaign [F](artifacts/pipeline-2026-10-07-f/report.json) freezes the camera
integration revision and verifies matching source/served-asset bookends. This
predates the subsequent authored RGB3/Z16 Modelica input bindings. Live
848×480 cameras now deliver RGB8 and Z16, totaling2,035,200bytes per pair:
37.5% fewer bytes than RGBA8/Float32 depth. Noise, row orientation, packing
and preview color conversion run in Three.js shaders. Optional cloud and
LiDAR share the capture allocation; no CPU pixel conversion was added.

| Quality | Camera rate, simulation Hz | Camera/INS throughput, × realtime |
| --- | ---: | ---: |
| Low | 15 | 1.82 |
| Balanced | 30 | 1.29 |
| High | 60 | 0.73 |

These are separate30-frame sampling-disabled runs, actors enabled,
cloud/LiDAR disabled, two low-priority CPU cores and a shared host. Native
vision/full SLAM remains pending. They establish neither a matched speedup
over earlier campaigns nor10× realtime. Balanced wall intervals average
10.64ms physics,11.30ms sensor,1.84ms INS and1.39ms evaluation; intervals include
worker communication, scheduling and waits. The separate CDP/perf run measures
0.96× with instrumentation and must not replace the uninstrumented result.

A separate10-pair GPU timer diagnostic reports supported timers and no
disjoint intervals. Mean GPU elapsed time per camera pair is0.870ms RGB,
0.185ms axial depth and0.103ms total for noise/color-pack/depth-pack fullscreen
passes: approximately1.16ms combined. The two PBO-write intervals total2.15ms
per pair. One2,035,200byte blocking host-copy call averages7.92ms wall time.
That call includes GPU waits and browser/driver overhead; GPU intervals and
host wall time overlap and must not be summed. Short shared-host timer samples
do not prove exclusive cost or GPU saturation. They identify readback and
serialized worker intervals as the next transport targets, rather than the
depth-noise arithmetic.

Native perf captured177 samples with zero lost samples; task-clock was3374.84ms
over2.092s across the selected browser processes. Visible costs include
clock_gettime, memmove and V8 concurrent marking. This short sample cannot
assign unresolved JIT addresses to compiler functions or establish a unique
bottleneck. The readable report is retained under
`$HOME/scratch/slam_web/profiles/raw-camera-integration-2026-10-07/perf-qualified-report.txt`.

[Qualification review](artifacts/raw-camera-integration-2026-10-07/review.json)
records hardware/software capture and preview parity, shared storage/one-copy
checks, lockstep clocks, replay,38 unit checks and passing TypeScript. Two
future full-SLAM tests remain skipped. Mid-flight file replay is refused
because the published compiler package lacks reset_at; zero-start file replay
passes. Campaign E was deliberately cancelled to correct a TypeScript union
guard and is unqualified; F contains the correction. The profiling guard
completed in83.31s with4,850,356KiB peak owned RSS and the16GiB memory reserve.
