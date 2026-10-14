# Hosting and deployment

SLAM Lab builds into a static website. Simulation and compilation run in the
visitor's browser using WebAssembly; no simulation or compiler service is needed.

## Build the website

Use the pinned Nix environment:

```sh
nix develop --no-update-lock-file path:.#ci
npm ci
npm run assets
npm run build
npm run preview
```

The build initializes the pinned `modelica_models` Git submodule automatically.
It needs Git and network access once; subsequent builds reuse that checkout.

Publish the contents of `dist/` to a static host. This repository deploys to
GitHub Pages after CI passes on `main`. The deployed site includes the compiler,
Modelica source and rendering assets.

`npm run assets` also publishes the native SLAM programs when a Rumoca
`native_step` export of `D435FastSLAMInitialize` and `D435FastSLAMStep` exists
(`SLAM_NATIVE_EXPORTS`, with `init-named` and `step-named` directories). By default
the publisher uses `~/scratch/slam_web/build/slam-native-profiles` when its
424 × 240 profile exists, otherwise the legacy `slam-native-exports` directory.
The programs are content addressed, gzip compressed and listed in
`public/vendor/slam/manifest.json` together with the SLAM source hash they were
compiled from. An explicitly selected missing export directory leaves the
estimator unpublished, or fails the build with `--require`.

When no local exports exist, `npm run assets` installs the immutable release
in `slam-native-package.json`, including all five modes. It verifies the archive
hash, source composition and input dimensions, and caches the download in
`~/scratch/slam_web/downloads/native-slam`. This also supplies native SLAM to
the Pages build. Set `SLAM_NATIVE_PACKAGE` to that exact archive for an offline
install. Explicit `SLAM_NATIVE_EXPORTS` overrides still require local exports;
edited Modelica sources require new compiler exports.
`node scripts/slam-native-assets.mjs --package` selects the pinned delivery
explicitly, even on a development machine that already has local exports.

The resolution selector offers the ordinary sizes shared by D435 RGB and Z16
depth: 424 × 240, 640 × 360, 640 × 480, 848 × 480 and 1280 × 720.
The 720p pair supports at most 30 Hz; the other pairs support 60 Hz.
New projects start at 424 × 240. Saved projects without a resolution retain
848 × 480. These are simulated pinhole optics, not device-specific calibration.
[D400 datasheet, Table 4-2](https://realsenseai.com/wp-content/uploads/2025/08/Intel-RealSense-D400-Series-Datasheet-August-2025.pdf).

Export matching native programs for every camera size using a built Rumoca
`native_step` executable and the Modelica Reset state CSV:

```sh
node scripts/export-slam-profiles.mjs --binary /path/to/native_step --reset /path/to/reset.csv --revision COMPILER_COMMIT
node scripts/slam-native-assets.mjs --require
```

`--output` changes the scratch export directory; `--resolution 424x240` exports
one mode. Each profile records the executable hash, exact source, compiler
revision supplied by the caller and export commands. The wrappers change image
dimensions only; feature, keyframe and map capacities remain unchanged. Changing
resolution resets the experiment and loads its matching programs. Missing
profiles produce an explicit error instead of resizing captured images.
SLAM's raw arrays and FAST loops derive their bounds from the selected image
dimensions; keyframes retain the actual `rgbSize` and `depthSize`. The legacy
848 × 480 entrypoints are defaults only. The host writes resolution-specific
RGB/depth intrinsics and noise calibration for every image. The publisher checks
both exported programs' input counts against the selected raster.
The smallest raster and lower rates trade visual information for throughput;
the initial city view can contain too few features for mapping at 424 × 240.
Use a larger size when comparing localization or map quality.

To measure the complete native run, serve a production build and run
`node scripts/profile-native-slam.mjs`. Results and screenshots go to
`~/scratch/slam_web/profiles/browser-native-slam`. Set `CHROMIUM_PATH` if needed;
`SLAM_PROFILE_URL`, `SLAM_PROFILE_RESOLUTION`, `SLAM_PROFILE_CAMERA_HZ`,
`SLAM_PROFILE_IMU_HZ` and `SLAM_PROFILE_FRAMES` select the experiment.
`SLAM_PROFILE_CPU_PROFILING=1` also records Chrome CPU profiles for the main
thread and every worker. Profile sampling adds overhead; measure throughput
separately with it disabled. `attribution.json` groups weighted self samples
into WASM, JavaScript (including TypeScript, libraries and generated glue), GC
and native/unattributed time, with the hottest functions per worker. Idle time
is excluded; these percentages do not measure GPU utilization or wall time.

A sampled run on an RTX 3090 with Chromium 154 (15 Hz camera, 90 Hz IMU,
848 × 480; ten warmup frames and sixty measured frames) attributed 85.2% of
active self samples to WASM, 6.8% to JavaScript, 0.8% to GC and 7.2% to browser
bindings/unattributed time. JavaScript accounted for 1.1% within the native SLAM
worker and 1.2% within physics. This used Rumoca `9f507597` for both native
exports and the browser compiler; production browser bindings remain separately
pinned in `rumoca-package.json`. The largest physics cost was typed-program
evaluation inside WASM; SLAM's large State publication was another hotspot.
An uninstrumented production build with the existing browser compiler pin,
424 × 240 at 5 Hz and a 10 Hz IMU ran 12 simulated seconds in 13.68 wall seconds
(0.88× realtime). Mean frame work was 175 ms physics, 45 ms native SLAM and
6.5 ms sensors. Realtime is not yet achieved; the lower raster trades away
visual features, and this throughput check does not qualify localization accuracy.

## Running on a robot

The Modelica library is maintained independently in
[CogniPilot Modelica Models](https://github.com/CogniPilot/modelica_models).
**Download SLAM FMU** in the Embedded deployment panel serves the FMI-LS
WebAssembly package of `D435FastSLAMStep` (FMI 3 co-simulation,
`binaries/wasm32-wasip2/` component, `modelDescription.xml` with Int64 Integer
and Boolean variables) when the site publishes it. `npm run assets` copies
`package/published/D435FastSLAMStep.fmu` from the export directory next to the native
programs. The package is the compiler's current build (about 7 MB zipped, a 28 MB
component): functionally complete, but not yet wired to CPU/GPU execution
planning or hardware sensor interfaces on a host.
The header **Download** button still exports the project, not the FMU.
