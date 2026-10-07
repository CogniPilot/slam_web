# RealSense-compatible simulated camera output

The selected target configuration is SDK `RGB8` color and `Z16` depth.
It does not assume every user-selected RealSense profile uses those formats.
The live `SensorFrame` now carries GPU-packed RGB8/Z16, explicit image layouts
and depth scale. Historical RGBA8/Float32-meter datasets remain readable;
normalized debug/analytical capture is explicit and is not the live output.
This matches the selected image-format contract, not a complete emulation of
RealSense firmware, stereo processing, distortion or hardware timestamps.

| Stream | SDK format | ROS image encoding | Data |
| --- | --- | --- | --- |
| Color | RGB8 | rgb8 | Interleaved unsigned8-bit R,G,B; no alpha |
| Depth | Z16 | 16UC1 | Little-endian unsigned16-bit axial depth; zero invalid |

The SDK defines metric depth as `sample * unitsMeters`. The scale is explicit,
not inferred from the type. The simulation defaults to0.001m per unit; hardware
must supply its actual reported scale. The ROS wrapper additionally normalizes
depth to millimeters in `fix_depth_scale`, so arbitrary SDK scale metadata
cannot be passed unchanged as ROS `16UC1` millimeters. The default1mm simulation
scale agrees with both boundaries.

Sources, checked2026-10-07:

- [SDK format definitions](https://github.com/realsenseai/librealsense/blob/master/include/librealsense2/h/rs_sensor.h)
- [SDK projection and depth interpretation](https://dev.realsenseai.com/docs/projection-in-realsense-sdk-2-0/)
- [ROS format mapping and scale normalization](https://github.com/realsenseai/realsense-ros/blob/ros2-master/realsense2_camera/src/base_realsense_node.cpp)

`src/gpu-realsense-packing.ts` implements the graphics component. Two Three.js
GLSL passes pack native render-target samples directly into RGB8 and Z16 byte
layouts. Color alpha is discarded, including exact recovery of8-bit sRGB
storage values after hardware sampling. Float axial depth is decoded on the
GPU and quantized to the explicit depth unit; nonpositive/nonfinite values
become zero, positive overflow saturates65535. Quantization uses nearest
integer with half upward in float32 shader arithmetic. This is the simulation's
declared quantizer, not a claim about undocumented camera firmware rounding.

Both shaders produce top-down rows directly. Native848-pixel rows are tightly
packed: color stride2544bytes, depth stride1696bytes. Rectangular diagnostic
grids with odd widths retain explicitly described4-byte row padding. A single
PBO readback copies both images into one destination buffer, with Uint8 and
Uint16 views and no host pixel conversion or scatter. Native output totals
2,035,200bytes per pair versus3,256,320bytes for RGBA8 and Float32 depth.

Hardware/software qualification is `tests/browser/realsense-packing.spec.ts`:
all color byte values, raw and sRGB targets, separate rectangular stream
dimensions,848×480, two depth scales,16-bit boundaries, zero/signed zero,
negative/nonfinite input, saturation, padding, endian order, source-image
preservation, renderer-state restoration and exactly one host copy. Evidence
resides under `scratch/slam_web/profiles/realsense-packing-2026-10-07`.

## Live capture and remaining Rumoca integration

The live sensor worker and main-renderer fallback now return only RGB8/Z16.
There is no accompanying normalized image readback. Optional depth cloud and
LiDAR write into extra views of the same destination allocation. Synchronous
packed mode copies the entire enabled capture in one getBufferSubData call;
asynchronous/software mode retains the same byte layouts and lockstep barrier.
Image layouts report stride/scale, top-down rows, unaligned depth and the
simulation clock domain. Frame timestamp/number remain the committed values.

The current59-file SLAM source now binds native D435 inputs to RGB3 and raw
depth codes with an explicit depthUnits input. Modelica converts individual
depth samples to meters inside calibrated geometry, without constructing a
converted metric image. Historical functions/models retain RGBA4 and scale1
defaults. Native848×480 initialization passes the reference geometry/covariance
checks. Completing native ingress still needs Rumoca typed U8/U16 backing
storage and full-State issuance. The existing normalized localization consumer
refuses raw frames; full browser SLAM is not yet running. Capture/display/replay evidence
is in [the qualification review](artifacts/raw-camera-integration-2026-10-07/review.json),
with [GPU timing and throughput limits](pipeline-performance-2026-10-07.md).
The [Modelica input qualification](modelica-raw-image-inputs-2026-10-07.md)
records the current source snapshot, raw-camera graph checks and complete
held-IMU batching/rollback checks separately from browser execution.
Separate RGB/depth pinhole intrinsics and the configured ideal camera mount
are retained. These are simulation calibration values, not physical factory
extrinsics or hardware clock measurements.
Raw depth remains unaligned unless an explicitly selected alignment stage
changes its calibration.

The depth-noise loop now runs before readback in `src/gpu-depth-noise.ts`.
It deliberately replaces the old camera/IMU-shared sequential random stream
with independent pixel/seed/simulation-tick hashing. GPU disparity noise,
dropout and depth-unit quantization are active in the camera/INS baseline;
they do not depend on real-time presentation rate. See
`gpu-depth-noise-2026-10-07.md` for the stochastic contract and qualification.
The retired application vision adapter is removed. Color display unpacks RGB8
in a Three.js shader; depth display samples a native R16UI integer texture and
applies the explicit depth scale. Neither preview expands pixels in JavaScript.
Dataset v2 and binary camera envelope v2 preserve raw formats; historical v1
RGBA/F32 recordings still load. Explicit recording compacts camera views only
when needed to avoid retaining unused cloud/LiDAR storage for300 frames.

Browser qualification covers source/format parity, native images, rectangular
padding, GPU display, combined readback, sync/async equality, injected-fault
restoration/recovery, independent sensor clocks and recording/replay. Receipts
are under `$HOME/scratch/slam_web/profiles/raw-camera-integration-2026-10-07`.
File replay is qualified for zero-start recordings only. The published Rumoca
browser package lacks `reset_at`; recordings starting later are explicitly
refused. Stable failing evidence is retained in `recording-recheck.log`, and
the compiler handoff requests the already implemented branch API in a qualified
browser package. No timestamps are shifted to hide that limitation.

Rumoca must accept strided raw U8 RGB8 and U16 Z16 with the depth scale, and
promote values only where the Modelica math needs them. The previously requested
U8/F32 transport ABI must be extended for U16. Avoid JS conversion loops or
another application-owned compiler. The full-frame Modelica graph and its
typed-State carry remain the primary compiler blockers. The old normalized
localization session explicitly refuses raw frames instead of converting pixels
or pretending its ABI accepts them. The live INS consumes IMU/time only; native
feature detection/full SLAM remain pending. Direct GPU-to-Rumoca storage is
still unimplemented.
