# Browser CI software rendering diagnosis

CI and local verification use the locked `flake.nix` environment through
`nix develop --no-update-lock-file .#ci`. Chromium defaults to ANGLE SwiftShader
for browser checks. A physical GPU is not required, but its performance cannot
be compared with the interactive RTX 3090 preview.

## Evidence

- Run 37646683578 passed the toolchain check, 203 unit tests and production
  build, then reached the 35 minute job timeout in the serial browser suite.
  Playwright's default CI dot reporter buffered progress on incomplete lines.
- Run 37651887837 passed 205 unit tests in 22 seconds and the production build
  in 11 seconds. Its six browser shards exposed individual timeouts instead
  of hiding their progress. Multiple tests timed out in the shared fixture's
  six-frame warmup, before reaching their own assertions.
- A local startup test took about 72 seconds with SwiftShader and 6.5 seconds
  with hardware graphics. This is a test duration, not simulation throughput.
- A ten-second `perf record -F 99 -g` capture of the owned SwiftShader GPU
  process collected 4,869 samples. Aggregation by shared object attributed
  94.15% to `memfd:swiftshader_jit` and 3.36% to `libvk_swiftshader.so`.
  These percentages describe the rendering process, not the entire app.
- The sensor-rate test reproduced its 120 second timeout locally under Nix.
  Switching only its scene to a warehouse still timed out when the continuous
  viewer competed with the sensor captures for software shader execution.
- The exact local Nix build verification passed all 205 unit tests and the
  production build; Vite took 9.62 seconds.

## Test fixture changes

Reuse the already compiled inertial project when its source matches exactly.
Wait for one real acquired frame rather than six unused frames. Sensor
component fixtures suspend unrelated continuous viewer rendering. Startup and
viewer responsiveness checks retain the real viewer; the Big city test restores
it for its visual captures.

Clock, independent sensor-rate, raw recording and camera format checks use an
economical warehouse fixture. Camera dimensions remain 848 by 480, LiDAR
remains 64 by 1024, and shaders, readback, physics and Modelica workers remain
real. Native format, parity, sensor counts, timestamps and lockstep barrier
assertions are retained. City geometry and quality have dedicated checks.

Keyboard tests hold a key until an actual camera update is observed rather
than assuming a fixed 320 ms sleep contains a rendered frame.

Profiling traces and raw logs are machine-local under
`$HOME/scratch/slam_web/profiles` and `$HOME/scratch/slam_web/tmp`.
This work does not establish full browser visual SLAM or 10x realtime speed.

## Revised deployment scope

At the user's request, routine CI now runs 15 focused browser smoke tests in
two shards. Full native sensor/city checks remain in `npm run test:browser:gpu`
and require `SLAM_BROWSER_GPU=1`; they no longer software-render the full city
as a prerequisite for publishing the browser demo.

Detected software rendering now selects 160 by 90 RGB-D, 64 by 128 LiDAR,
smaller cube faces and graphics below Low. Rendering remains in Three.js
shaders; there is no CPU resampling adapter. Calibration and raw image layouts
match the acquired dimensions. A persistent screen warning identifies the
CPU renderer and reduced preview; hardware and unknown drivers retain the
native profile. The normal hardware profile is unchanged.

For the time-sensitive faculty demo, the user explicitly authorized a manual
deployment that skips browser checks. The workflow's `skip_browser_checks`
dispatch input defaults to false and is unavailable to push/PR events. Build
and unit tests remain mandatory. Ordinary pushes still gate Pages on both
browser smoke shards. This manual release must not be described as passing
the hosted browser gates.

Local Nix validation after the profile changes passed 208 unit tests and the
production build (9.42 seconds for Vite).

## Release verification

Manual run [37655137621](https://github.com/CogniPilot/slam_web/actions/runs/37655137621)
published commit `3e4db3a` successfully on October 7, 2026. Build and unit tests
passed on GitHub; hosted browser checks were explicitly skipped for this run.
The Pages deployment step took 4 minutes 24 seconds after artifact upload.

Before publication finished, the exact uploaded `github-pages` artifact was
downloaded and extracted into a fresh detached checkout. Both normal CI smoke
shards passed under the locked Nix environment with SwiftShader: 14 passed,
one optional compiler-candidate test skipped, in 81.6 seconds including
dependency installation. Peak owned process RSS was 2.51 GiB. A strict static
server mounted the same artifact at `/slam_web/`; a phone-sized browser loaded
the real workers and assets, started with Run alone, and produced valid depth
data with the software warning visible and no browser or HTTP errors.

After publication, the public site returned HTTP 200. A separate browser check
against `https://cognipilot.github.io/slam_web/` used an RTX 3090 and a 390 by 844
viewport. Run started real Modelica physics, the drone was visible inside the
view frustum, and native 848 by 480 depth data was valid. No browser or HTTP
errors were recorded. This verifies the desktop GPU with a phone-sized layout;
it does not establish performance on a physical mobile device.

The deployment condition also rejects cancelled runs, including manual runs
whose build completed before cancellation. Ordinary pushes still require both
browser shards; the manual bypass remains explicit and defaults to false.

The subsequent workspace and startup review passed all 215 unit tests and the
production build in the pinned Nix CI environment. The built static site passed
20 browser smoke tests with one optional compiler-candidate test skipped. These
checks cover startup progress and compilation-error recovery, Run without Apply,
saved Modelica examples, the file explorer, collapse/fullscreen controls, sensor
packing, and the phone layout. The phone screenshot also confirms that the
GitHub link and Rumoca credit fit the title bar. This used software rendering;
it does not qualify full SLAM, hardware throughput, or a physical phone.
