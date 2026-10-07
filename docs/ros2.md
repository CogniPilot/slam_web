# ROS 2 contracts and historical bridge evidence

The Python ROS bridge, container launch path and companion package are retired. Their install, Docker and module execution instructions are removed. Replacement ROS 2 transport for the complete Modelica estimator remains pending, alongside Linux/NXP deployment and hardware validation. No Python fallback is supported.

The browser graph uses local direct typed data flow; browser and core CI require neither ROS nor Zenoh. A replacement ROS bridge must preserve the following source-time, calibration, DDS and coordinate contracts; transporting messages successfully does not establish estimator correctness.

## Topics and coordinate contract

| Topic | Message | Meaning |
|---|---|---|
| `/camera/color/image_raw` | `sensor_msgs/Image`, `rgb8` | Rectified color pixels |
| `/camera/color/camera_info` | `sensor_msgs/CameraInfo` | RGB intrinsics |
| `/camera/depth/image_raw` | `sensor_msgs/Image`, `32FC1` | Raw optical Z, meters |
| `/camera/depth/camera_info` | `sensor_msgs/CameraInfo` | Raw depth intrinsics |
| `/camera/aligned_depth_to_color/image_raw` | `sensor_msgs/Image`, `32FC1` | Depth reprojected to RGB pixels |
| `/camera/aligned_depth_to_color/camera_info` | `sensor_msgs/CameraInfo` | RGB calibration |
| `/imu/data` | `sensor_msgs/Imu` | Body-FLU acceleration/angular rate, no orientation measurement |
| `/clock` | `rosgraph_msgs/Clock` | Source sensor time, never wall-time substitution |
| `/tf_static` | `tf2_msgs/TFMessage` | Calibrated `base_link` → `camera_optical` mounting |

Images/calibration share an acquisition stamp and optical-RDF `camera_optical` frame. The simulator's RGB/depth intrinsics differ, so RGB-D consumers need aligned depth and RGB calibration. Registration deprojects depth rays and projects to RGB intrinsics, resolving collisions by nearest optical Z. Unsampled/invalid aligned pixels are NaN, following [REP 118](https://github.com/ros-infrastructure/rep/blob/master/rep-0118.rst); no hole filling invents depth. Already rectified physical samples remain unchanged.

`base_link` is FLU. TF must use measured `opticalToBody` and `originFlu`, including camera offsets; the simulated default applies only without physical calibration. IMU vectors must already use body-FLU SI units. Sensor topics require compatible best-effort sensor-data QoS; `/clock` is best effort with depth one. Static TF is reliable and transient local. Incoming odometry must support both reliable and best-effort publishers.

Simulation/replay consumers must use the shared source clock. For physical capture, deliberately select the common measured clock domain and retain integer `capture.timestampNs`. Never infer synchronization from arrival time or ROS wall time.

External odometry retains position, normalized Hamilton quaternion, exact source stamp and frame IDs on `lab/compare/ros2`. The estimator output must be explicitly transformed to the browser's ENU world and FLU body convention before relay. Each stream aligns at its first shared sensor timestamp using a rigid body-pose transform. Displayed RMS differences compare paired estimates; they do not measure ground-truth accuracy.

## Retired implementation evidence

The previous digest-pinned ROS Jazzy x86_64 container used Python 3.12, hash-verified NumPy 2.2.5 and eclipse-zenoh 1.10.0. Actual DDS checks passed all eight image/calibration/IMU/clock streams, physical mounting TF and return odometry for both simulated and exact physical-capture timestamps. Reliable and best-effort odometry publishers were checked separately, including nanosecond rounding across second boundaries.

An actual browser round-trip passed three 160×90 simulator frames at sensor times 0.3, 0.4 and 0.5 seconds, with the controlled ROS publisher's odometry returned to the comparison stream. This proves transport/message contracts of the retired bridge. It does not provision ROS on ARM, validate the replacement Modelica pipeline or benchmark an external estimator.

The historical default external topic was `/rtabmap/odom`; verification used a controlled publisher, not an RTAB-Map estimator. Real external-estimator configuration, RGB-D/QoS/TF correctness and trajectory measurement remain acceptance work for the replacement integration.
