# GPU depth noise and removal of the legacy vision adapter

The live camera now applies measurement noise in a Three.js GLSL pass before
GPU readback. The application-owned Modelica-to-WASM vision compiler and worker
are removed from `src` and the application build. Their historical sources and
tests are retained only as inert `.txt` evidence in
`artifacts/retired-vision-adapter-2026-10-07`, with SHA256 inventories.
WABT is a development dependency for independent compiler ABI fixtures, with
no application import. No application compiler replaces the removed adapter.

The current runnable preview is camera + Modelica inertial propagation.
Native feature detection and full visual SLAM remain pending. The unavailable
detector emits no feature result or flow activity; the UI shows Pending.
Harris and FAST native Modelica source remain editable and persistent. Old
generated detector caches are discarded on project load/compile, while student
source is preserved. The complete Modelica SLAM source workspace is unchanged.

## Measurement model

`src/gpu-depth-noise.ts` runs on the nominal axial-depth texture. Invalid,
nonpositive and nonfinite depth becomes zero. A deterministic integer hash of
the project seed, logical top-down pixel index, 180 Hz simulation tick and
draw lane produces independent uniforms. One draw controls dropout; two more
produce a standard Gaussian through Box–Muller. The depth error standard
deviation is `z² * disparityNoisePx / (referenceFx * baselineMeters)`.

The current configuration uses 0.08 px disparity noise, 0.5% dropout, the
camera profile's reference focal length and baseline, and 1 mm depth units.
Positive noisy depth is quantized to the nearest depth unit, with half upward
in float32 shader arithmetic, and clamped to the unsigned 16-bit range.
At this initial qualification the normalized camera carried float32 meters.
The subsequent raw-camera integration replaces live images with RGB8/Z16;
the GPU depth cloud continues to use the same quantized metric texture. See
`realsense-output-formats.md` for the current boundary and ABI limitations.

This deliberately changes the old stochastic contract: camera noise no longer
consumes IMU random draws, and changing image resolution/rate cannot perturb
the airframe random stream. The shader hashes seed/tick modulo unsigned 32 bits;
the tick is rounded from committed simulation time, not wall time. Repeated
captures at the same seed/time/geometry match on a given GPU implementation.
Different GPUs may round transcendental operations differently; cross-GPU
bitwise equivalence is not promised. Dataset replay retains captured samples.
This is an independent-pixel teaching sensor model, not a complete RealSense
stereo matching/noise emulator.

The measured depth texture also feeds the existing GPU depth-cloud shader.
World rendering remains independently paced; camera and processing retain the
lockstep barrier. No per-pixel depth-noise/conversion loop remains in Runtime.

## Qualification

Browser fixtures cover native 848×480 images, reproducibility, changed
seed/tick, depth-dependent noise statistics, dropout, quantization, invalid
samples and source texture preservation. Application checks cover startup
without the retired worker, IMU-only estimator messages, missing detector
activity/cache, native shapes, sync/async parity and 15/30/60 Hz lockstep timing.
Clock/viewer and packed RGB/depth/cloud/moving-actor LiDAR checks also exercise
the active shader. Resource-bounded logs and attachments are under
`$HOME/scratch/slam_web/profiles/gpu-noise-retirement-2026-10-07`.

Removing feature computation changes the workload. Any new camera/INS
throughput is not comparable to the old Harris measurements as a visual-SLAM
speedup, and does not establish the 10× full-SLAM goal.

Final [review evidence](artifacts/gpu-noise-retirement-2026-10-07/review.json)
records the passing hardware/software noise checks, seven distinct passing
hardware application/component checks, TypeScript and21 focused unit tests.
It retains the two obsolete lab fixture failures and their successful recheck;
two future full-SLAM/custom-graph tests remain explicitly skipped. The frozen
production build contains no retired vision worker/WABT code, and all15 inert
archive files match their original hashes. Source/served-asset bookends pass.

The separate production camera/INS profile, with native images, GPU noise,
moving actors and LiDAR/depth cloud disabled, measures2.03× low,1.41× balanced
and0.70× high. Jobs used two low-priority cores on a shared host. These short
observations exclude native feature detection/full SLAM and are not a matched
speedup comparison to historical Harris campaigns. Raw profiles/builds stay
in scratch; durable summaries are in `artifacts/pipeline-2026-10-07-c`.
