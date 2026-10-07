# Shared pedestrian rigs

Three.js `SkeletonUtils.clone` creates a skeleton for each skinned mesh
primitive. The three pedestrian assets previously had 30 distinct skeleton
objects. Freshly cloned primitives now share a skeleton only when they have
the exact same inverse-bind array owner and ordered bone objects. Each
pedestrian retains its own bones, animation mixer and rig. Mesh bind matrices,
geometry, materials and animation clips are unchanged. Existing allocated bone
textures keep their owners.

The actual asset controls compare every bone-palette and bind-matrix element
at simulation times 0, 1 and 8. The hardware browser compares every RGB, axial
depth, depth-cloud and LiDAR byte at times 0, 3 and 11. All comparisons pass.
There are 12 remaining skeleton owners. GPU diagnostics record 72 skeleton
updates for RGB-D plus four LiDAR views, down from 180.

The longer held-pose benchmark used a visible viewer, the dedicated sensor
worker, RTX 3090 hardware rendering and four-CPU affinity. Each sensor load
ran ABBA then BAAB, with 100 warm captures and 1,000 timed captures per window.
Configuration, asset rebuilds, GPU instrumentation and byte comparisons were
outside the timed windows. There were 16,000 timed captures total.

| Held-pose sensor capture | Original RPC time | Shared rigs | Reduction |
| --- | ---: | ---: | ---: |
| RGB-D | 3.755 ms | 3.230 ms | 14.0% |
| RGB-D plus LiDAR | 7.340 ms | 6.138 ms | 16.4% |

The separate actual lockstep comparison used 90 Hz RGB-D, 10 Hz LiDAR and
the current inertial estimator, with the independent viewer averaging about
30 FPS. Across 1,440 timed camera frames, mean throughput was 0.485× with
original rigs and 0.506× with shared rigs: a 4.4% increase. CPU consumption
ranged from about 1.5 to 1.7 cores. Host activity may overlap these short
windows; their absolute throughput is not directly comparable to the earlier
profile. These measurements establish neither full SLAM nor 10× realtime.

The [verification record](../dev/shared-skeletons-verification.json) binds the
build, source snapshots, tests, browser reports and retained raw profiling
records. The public local preview uses the shared-rig build and passed fresh
automatic startup, preset switching and saved-project migration checks. The
production Rumoca compiler pin is unchanged.
