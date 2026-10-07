# Physical D435 capture contracts

The Python capture adapter and its companion launcher are retired. No current camera-shell, package installation or launch command is provided. Replacement transport for the complete Modelica estimator, a connected D435 and NXP/RDD2 interoperability remain pending.

The browser renders native **848×480** simulated RGB/depth pairs, with separate RGB and depth optics, at selectable15/30/60 Hz. This is a supported common D435 mode, not an upscaled160×90 image or the camera's maximum-resolution mode. The D400 datasheet lists depth848×480 through90 Hz and color848×480 through60 Hz; paired acquisition uses the color limit. Maximum-resolution modes are depth1280×720 and color1920×1080 at30 Hz. See the [manufacturer datasheet](https://www.intelrealsense.com/wp-content/uploads/2024/10/Intel-RealSense-D400-Series-Datasheet-October-2024.pdf), Table4-2. Nominal pinhole fields of view remain approximate; matching resolution does not reproduce factory calibration, distortion, exposure or physical hardware synchronization.

Airframe IMU (30/60/90/180 Hz), GPS (1/5/10 Hz) and optional LiDAR (5/10/20 Hz) have independent schedules on an exact180 Hz integer clock grid. Each due measurement uses its committed physics pose and timestamp; processing completes before physics advances. The viewer independently targets30 wall-time FPS. Simulation retains every due sample and camera frame when processing is slow.

Quality defaults, in RGB-D/LiDAR/IMU/GPS order, are Low15/10/90/5 Hz, Medium30/10/90/5 Hz and High60/20/90/10 Hz. Image resolution stays848×480 at every graphics quality. Saved custom rates override quality defaults until the user explicitly restores them; historical paired90 Hz settings migrate to60 Hz while preserving all other rates and editable sources. The D435 supplies RGB/depth measurements and no IMU: inertial measurements must come from the separate airframe sensor.

Historical160×90 compiler and SLAM receipts retain their original shapes and remain reference evidence. Full-SLAM browser integration is still pending; those receipts do not qualify848×480 SLAM or its throughput. Thumbnail detector sources remain recoverable, but the live preset menu offers full-resolution detectors.

Simulated LiDAR captures an idealized instantaneous scene snapshot at each scan timestamp. It does not model rotating acquisition, per-beam time or motion distortion. Ouster specifies 10/20 Hz OS1 operating modes in its [sensor documentation](https://docs.ouster.com/sensor-docs/firmware/sensor-performance), and the [OS1 product page](https://ouster.com/products/hardware/os1) lists a 20 Hz maximum frame rate. The simulator's 5 Hz setting is an additional experimental rate, not a physical OS1 mode claim.

## Geometry and transport acceptance

A replacement adapter must preserve the versioned `SLB1` envelope in `src/packet.ts`. It must deproject factory depth, apply factory depth-to-color extrinsics and z-buffer **color-optical Z** onto an ideal rectified color grid. RGB inverse projection must use the SDK distortion model. Occluded, invalid and unobserved pixels remain zero depth; no measurement is synthesized. Rectified RGB and depth share the output color intrinsics.

Physical mounting calibration supplies both `opticalToBody` and `originFlu`: a finite proper rotation from color-optical right/down/forward to body forward/left/up, and the optical center in body meters. Real frames have no simulator truth or trajectory RMSE without an independent reference.

The previous adapter had deterministic SDK, geometry and clock tests. Those fixtures establish requirements for its replacement; they do not validate removed code or a new hardware integration. USB rules, firmware topics, sensor IDs, available stream modes and actual throughput must be measured on the provisioned target.

## Measured clock calibration

The retained calibration contract is a JSON object with these required fields:

| Field | Contract |
| --- | --- |
| `opticalToBody` | Nine row-major entries of a proper color-optical RDF → body-FLU rotation. |
| `originFlu` | Color optical center relative to the body origin, three meters. |
| `clockDomain` | Named common domain after mapping both sensors. |
| `maxClockErrorNs` | Measured nonnegative upper bound below the allowed IMU gap. |
| `cameraClock` | `domain`, `sourceAnchorNs`, `targetAnchorNs`, `rate`; domain matches SDK hardware/system/global time, integer nanosecond anchors and finite positive rate. |
| `imuClock` | `timeStatus`, `sourceAnchorNs`, `targetAnchorNs`, `rate`; actual Synapse status: 0 node-local boot time, 1 shared gPTP, 2 holdover. |

Each mapping computes `targetAnchorNs + round((sourceNs - sourceAnchorNs) * rate)`. Anchors, rates and error bounds come from measured synchronization. An identity mapping requires independent proof of the same domain. RealSense system/global time does not establish airframe gPTP synchronization. Recalibrate after reboot, drift or discipline changes. Network arrival time is never measurement time.

The canonical 40-byte Synapse IMU sample must carry valid accelerometer/gyro fields, the selected sensor ID and finite body-FLU SI measurements. Acceleration retains gravity as specific force. Only measurement samples bracketing the camera timestamp may supply interpolation. Missing/reordered samples, changed domains, excessive bracket span including uncertainty and excessive RGB/depth skew reject a frame.

## Historical capture profile and remaining checks

The retired adapter requested supported 640×480 RGB/depth at 30 Hz and produced a 160×90 ideal color-pinhole output. Its defaults allowed at most 20 ms IMU gaps and 5 ms RGB/depth skew. Frame time came from mapped color time; `dt` measured elapsed time since the last accepted frame. Metadata retained integer source/mapped stamps, IMU brackets and clock uncertainty.

Its experimental transport used 15-second leases and acknowledged ordered 24 KB chunks, retaining at most the latest pending physical frame per subscriber. These are historical transport results, not current launch instructions. Simulation must continue to retain every lockstep frame. Replay must preserve actual timestamps and avoid fabricated truth.

Before deployment, verify the actual mount, clock uncertainty, camera modes, USB throughput, airframe units/topics and complete Modelica estimator timing on the target. Emulation and mocked SDK checks do not establish physical capture.
