# Sensor readback profiling, 2026-10-07

Full browser SLAM remains pending Rumoca compilation/state-layout fixes. These
measurements cover the current Modelica inertial pipeline, not full SLAM.

The actual dedicated sensor worker is now selectable by URL in the diagnostic
worker profiler. Sampling can start after initialization and warmup. The
original first-worker/compiler behavior remains the default and was checked
with an actual browser compilation of NativeIntegerCounter from CI33467086deca.

## Measured bottleneck

On Chromium154 with the hardware-reported RTX3090, a held-pose capture loop
produced6881 worker samples over8.589seconds. getBufferSubData accounts for
54.94% of sampled worker time; projectObject3.61%, matrix multiplication2.68%,
and updateMatrixWorld2.01%. These are sampled time shares, including time
blocked inside WebGL, **not CPU-utilization percentages**.

An independent perf cpu-clock trace records847 samples with zero lost samples.
Stacks include NVIDIA driver work beneath ANGLE BufferGL::mapRange and Chromium
HandleGetBufferSubDataCHROMIUM. This supports investigating GPU readback and
synchronization before another scene-matrix optimization. Scene-transform
batching was already implemented in withCommittedScene.

The asynchronous fence path reduces getBufferSubData's sampled share to19.71%,
with56.32% idle. It completes856 held-pose captures in8.509seconds versus1261
in8.501seconds for synchronous reads. These separately sampled diagnostic
windows are not a matched whole-pipeline throughput benchmark or proof that
either path is faster on every driver.

The WebGL2 specification explicitly describes blocking/round-trip costs and
recommends PBOs with a completion fence before getBufferSubData:
[WebGL2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/).
The existing implementation already pools PBOs, combines attachments in one
buffer, and copies into the exact final destination. A synchronous PBO copy
can still include waiting for earlier GPU work.

## Controlled experiments

Each experiment uses ABBA windows of150 camera frames:848x480 RGB8 and Z16 at
30Hz,64beam LiDAR at10Hz, IMU90Hz and GPS5Hz. Moving cars/people and the
independent viewer remain enabled. Modelica propagates the physics, actor
motion and inertial estimate. Sensor rendering, packing and projection remain
on the GPU. Each window advances five simulated seconds without skipped camera
frames. Four warmup frames per window compare raw RGB, depth and LiDAR hashes.

| Experiment | Baseline mean realtime factor | Candidate | Candidate/baseline | Decision |
| --- | ---: | ---: | ---: | --- |
| One combined RGB8/Z16 packing attachment | 1.673 | 1.610 | 0.963 | Rejected |
| STATIC_READ instead of STREAM_READ PBO allocation hint | 1.587 | 1.506 | 0.949 | Rejected |

The combined attachment reduced two GPU packing draws/reads to one, preserved
all tested raw output bytes, and passed six device-format component cases,
including different color/depth dimensions, odd row padding, sRGB, nonfinite
depth and renderer-state restoration. It nevertheless consumed more CPU and
did not improve the measured pipeline. The allocation hint also preserved
the raw hashes and did not improve throughput. Small driver/timing variation
limits the precision of these ratios; neither experiment justifies promotion.

Production packing was restored byte-for-byte to SHA256
4491ef7916b91e853a0e6b79caaa2f48df6c170cc2b324770a10ad2694e659ad.
The candidate remains only in a diagnostic fixture and frozen review evidence.
The benchmark routes experimental source into its own browser context; it does
not modify the preview, lower sensor rates between A/B or add host vision math.

Owned browser jobs ran at nice15 on cores8,9 with bounded time/memory. Peak
aggregate RSS was2,729,720KiB for the native-perf diagnostic and approximately
2.1million KiB for the ABBA experiments. Available host memory remained above
57million KiB. Raw traces and disposable browser profiles stay under HOME/scratch.

## Evidence and reproduction

Durable reports, both V8 profiles, native perf summaries, exact candidate,
ABBA window records and source hashes are in
`dev/artifacts/sensor-readback-profile-2026-10-07/`.
`node dev/review-sensor-readback-profile.mjs` checks the restored production
sources, actual worker identity, raw parity, experiment calculations and
original trace identity. It intentionally makes no full-SLAM/10x claim.

Validation: TypeScript checking passes. Five GPU readback/device-format browser
checks passed in the initial run. The sixth exposed a stale dense-cloud test:
the default now returns a Z16 raster, and shared buffers require typed-view
offsets when comparing bytes. That test now explicitly requests the dense GPU
diagnostic and compares its own storage span; its focused rerun passes with
405004 valid and2036 invalid pixels, maximum projection error6.85e-7metres,
sync/async parity, worker parity and shared camera/LiDAR timestamp3seconds.
The initial failure and corrected result are both retained in the evidence.

Use `dev/profile-current-sensor-worker.mjs OUTPUT_DIRECTORY` with
SENSOR_CPU_PROFILE=1, optional PERF_PATH, and optional SENSOR_READBACK_MODE=async.
Use `dev/profile-camera-packing.mjs OUTPUT_DIRECTORY` for the combined candidate
or SENSOR_READBACK_EXPERIMENT=static-read for the allocation-hint comparison.
Run through dev/rumoca-bounded-run.mjs, set CHROMIUM_PATH, and choose a short
TMPDIR under HOME/scratch for browser socket paths.

The older live-lockstep harness now defaults to the supported30Hz paired-camera
profile; SLAM_PROFILE_CAMERA_HZ permits15,30,60 and checks its actual clock.
It no longer assumes an unsupported90Hz paired RGB/depth stream.

The next transport experiment should separately measure fence completion,
driver mapping and copy cost. Neither fewer reads nor a different allocation
hint solved the bottleneck. Rumoca full-graph compilation, typed raw-image
ingress and compiler-owned State interchange remain separate requirements.
