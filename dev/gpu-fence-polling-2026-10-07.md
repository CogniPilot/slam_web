# GPU fence polling experiment

The current profiling tools now follow the public startup flow: wait for the
loading screen, click Run, observe real frames, then pause and own lockstep.
They no longer wait for an automatic run that the app does not perform.

An RTX 3090 experiment compared the existing asynchronous readback with four
yielded fence probes before timer backoff. Each ABBA window used 150 camera
frames at 30 Hz, 848×480 RGB8/Z16, 64-beam LiDAR at 10 Hz, IMU at 90 Hz and
GPS at 5 Hz. Moving actors and the independent viewer stayed enabled. Every
sampled RGB/depth/LiDAR hash matched; source bookends were unchanged.

| Window | Polling | Sim / wall | Physics node, ms/frame | Readback, ms/frame | Viewer FPS |
| --- | --- | ---: | ---: | ---: | ---: |
| A | Existing | 0.084 | 341.36 | 30.95 | 29.75 |
| B | Four yielded probes | 0.213 | 134.87 | 13.29 | 29.96 |
| B | Four yielded probes | 0.232 | 124.31 | 13.17 | 30.00 |
| A | Existing | 0.235 | 123.29 | 12.16 | 29.96 |

**Do not promote the candidate.** The final baseline beats both candidate
windows. The first-window outlier also affects unchanged physics and rendering;
its cause is unresolved. The aggregate ratio does not establish a polling gain.

The physics node includes physical propagation and modeled sensor/actor work.
It dominates this run; sensor capture averages 16.37 ms/frame in the final
baseline. The owned browser used approximately 1.14–1.38 CPU cores within a
two-core affinity limit. This is a Vite development application on a shared
host, using the pinned compiler and actual upstream controller. These timings
are not a production throughput comparison or full SLAM acceptance. The known
periodic controller-event defect also remains unresolved.

Production readback is unchanged. Hardware defaults still use synchronous
readback; both sides of this experiment explicitly selected the asynchronous
path. The fixture is diagnostic only. Reproduce with
`SENSOR_READBACK_EXPERIMENT=fence-turns node dev/profile-camera-packing.mjs OUTPUT`
against a running Vite server through `SLAM_PROFILE_URL`, inside Nix and the
bounded process runner. Evidence is in
`dev/artifacts/gpu-fence-polling-2026-10-07/`.
