# Hardware browser captures

Run capture and profiling scripts from `nix develop`. The flake supplies
Chromium through `CHROMIUM_PATH` and Python with NumPy for comparison checks.
A separate GPU-enable flag is not needed for these measurement scripts:

- `capture-environment-scale.mjs`
- `capture-native-precall.mjs`
- `profile-native-slam.mjs`
- `profile-browser.mjs` in its default hardware mode

They select ANGLE Vulkan and check a WebGL 2 renderer before loading the
application. SwiftShader, other software renderers, unknown devices and a
non-Vulkan backend fail immediately. The actual scene renderer is checked as
well. This prevents an unavailable GPU from silently turning a capture into a
long software run.

An explicit `VK_DRIVER_FILES` or `VK_ICD_FILENAMES` remains authoritative.
Otherwise the launcher looks for an installed NVIDIA manifest in the standard
Vulkan directories, then for a Nix NVIDIA package matching the loaded kernel
driver version. It refuses an ambiguous matching Nix package. Other devices
use the Vulkan loader defaults and must pass the same renderer check. This
selects installed files; it does not install a driver or expose GPU devices to
a container. The renderer check is still required to establish that the
selected browser and driver actually work together.

Capture receipts include `browserGpu` with the executable, driver selection
and renderer. Profilers also save `browser-gpu.json`, including the renderer
on a failed preflight. Environment captures retain a failed preflight in
`receipt.json`. A refusal is not a throughput measurement.

The office capture uses a 250-second Modelica route and 1,251 frames at 5 Hz:

```sh
nix develop
SCALE_CAPTURE_SCENE=office-loop SCALE_CAPTURE_URL=http://127.0.0.1:4198/ \
  node scripts/capture-environment-scale.mjs TEMPLATE_CAPTURE NEW_OUTPUT
```

The template must contain the existing city project, initial configuration
and native profile. The preview must include the office environment. The
capture checks the scene and physics hash so an older preview cannot silently
record another environment. A shorter `SCALE_CAPTURE_FRAMES` is a diagnostic
prefix; it is not a complete loop comparison. Ground truth remains separate
when sealing inputs for estimator replay.

The explicit `SLAM_PROFILE_SOFTWARE=1` diagnostic and bounded CPU render smoke
scripts keep their software workloads and labels. Offline WASM estimator
replay does not render a scene and does not require this GPU capture check.
