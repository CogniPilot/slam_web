# Sensors and timing

Set rates in **Configuration → Sensor rates**. Rates measure simulation time.
RGB and depth share one acquisition timestamp, with separate optical calibrations.
Physics waits for due sensor processing to finish; slow processing retains the
samples rather than skipping them. The viewer independently targets 30 real-time FPS.

| Sensor | Selectable rate | Output |
| --- | --- | --- |
| RGB + depth | 15 / 30 / 60 Hz | RGB8 color and Z16 axial depth |
| 64-beam LiDAR | 5 / 10 / 20 Hz | Raw point samples in body forward/left/up coordinates |
| Airframe IMU | 30 / 60 / 90 / 180 Hz | Specific force and angular velocity |
| GPS | 1 / 5 / 10 Hz | Position with simulated noise and indoor availability |

The IMU belongs to the airframe; the D435 camera supplies RGB and depth.
LiDAR scans are instantaneous scene snapshots. Rotating acquisition and motion
distortion are not modeled.

## Camera images

Hardware rendering uses 848 × 480 camera images at every graphics quality.
Software rendering uses a smaller 160 × 90 preview and displays a warning.
Three.js renders the sensor views on the GPU; shaders add depth noise and
quantize depth. Z16 samples use an explicit meters-per-unit scale, with zero
meaning no valid return. The simulation does not stream a physical camera.

## Quality defaults

| Graphics | RGB + depth | LiDAR | IMU | GPS |
| --- | ---: | ---: | ---: | ---: |
| Low | 15 Hz | 10 Hz | 90 Hz | 5 Hz |
| Balanced | 30 Hz | 10 Hz | 90 Hz | 5 Hz |
| High | 60 Hz | 20 Hz | 90 Hz | 10 Hz |

Custom rates override this table until **Use quality defaults** is selected.
If simulation runs slowly, lower rates or turn off optional LiDAR and depth points.
Graphics quality also changes what the camera sees, so keep settings consistent
when comparing algorithms. Full visual SLAM and the 10× realtime target are still
in development.
