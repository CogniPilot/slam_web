"""Replay sealed RGB-D observations through isolated ROS2; truth is never read.

Invoke with the pinned ros-env/bin/python3. DDS domain and loopback scope are
isolated from other ROS users. Outputs retain dropped inputs and raw receipts.
"""

import argparse
import fcntl
import hashlib
import json
import os
import platform
import re
import signal
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path


SCENE_ID = re.compile(r"[a-z][a-z0-9-]{0,31}")
# Fields that must stay constant within one replayed scene: the camera mount is
# published once as a static transform and RTAB-Map assumes one intrinsic set.
CONSTANT_CALIBRATION = ["width", "height", "fx", "fy", "cx", "cy", "forward", "up"]
# RTAB-Map tracks. Each run declares exactly one; the receipt names it.
TRACKS = {
    "rgbd-vo": "registered RGB-D only",
    "rgbd-vo+imu-gravity": "registered RGB-D + sealed raw IMU, orientation from an "
    "external Madgwick filter (gravity alignment)",
    "rgbd-vio-openvins": "registered RGB as monocular OpenVINS (Odom/Strategy 10) + "
    "sealed raw IMU; depth only as a feature mask, metric scale from the IMU",
}
# rtabmap_odom and rtabmap 0.23.7 drop sensor_msgs/Imu without orientation and do
# not run RTAB-Map's own ImuFilter from ROS, so orientation must come from a node
# in the pinned environment. Gain and zeta mirror ImuFilter/MadgwickGain and
# ImuFilter/MadgwickZeta defaults in the pinned rtabmap Parameters.h.
ORIENTATION_FILTER = "imu_filter_madgwick"
ORIENTATION_FILTER_PARAMETERS = {
    "use_mag": "false",
    "publish_tf": "false",
    "world_frame": "enu",
    "gain": "0.1",
    "zeta": "0.0",
    "constant_dt": "0.0",
}
IMU_TRACKS = {"rgbd-vo+imu-gravity", "rgbd-vio-openvins"}
OPENVINS_TRACK = "rgbd-vio-openvins"
# OdometryOpenVINS (RTAB-Map 0.23.7 built WITH_OPENVINS) takes raw IMU without
# orientation (canProcessAsyncIMU), the IMU-to-camera extrinsic from TF, and with
# one camera runs monocular. Vis/DepthAsMask allows features only where the
# registered depth lies in [Vis/MinDepth, Vis/MaxDepth]; depth never enters the
# filter. Other OdomOpenVINS/* keep their RTAB-Map 0.23.7 defaults.
OPENVINS_PARAMETERS = {
    "Odom/Strategy": "10",
    "OdomOpenVINS/UseStereo": "false",
    "Vis/DepthAsMask": "true",
}
# RTAB-Map 0.23.7 Parameters.h defaults, used when the capture declares no noise.
OPENVINS_DEFAULT_NOISE = {
    "OdomOpenVINS/AccelerometerNoiseDensity": 0.01,
    "OdomOpenVINS/AccelerometerRandomWalk": 0.001,
    "OdomOpenVINS/GyroscopeNoiseDensity": 0.001,
    "OdomOpenVINS/GyroscopeRandomWalk": 0.0001,
}
# The filter needs a positive bias random walk; a capture with constant biases
# declares zero, which is raised to this floor and reported.
OPENVINS_RANDOM_WALK_FLOOR = {
    "OdomOpenVINS/AccelerometerRandomWalk": 1e-4,
    "OdomOpenVINS/GyroscopeRandomWalk": 1e-6,
}
# Optional sealed sensors.json top-level block (covered by sensorsSha256):
# per-sample white-noise standard deviations and bias random-walk densities.
IMU_NOISE_FIELDS = {
    "accelSdPerSample": "OdomOpenVINS/AccelerometerNoiseDensity",
    "gyroSdPerSample": "OdomOpenVINS/GyroscopeNoiseDensity",
    "accelBiasRandomWalkDensity": "OdomOpenVINS/AccelerometerRandomWalk",
    "gyroBiasRandomWalkDensity": "OdomOpenVINS/GyroscopeRandomWalk",
}
# One convention for every IMU track. In the sealed format an interval stamped t
# holds the sample measured at t - dt (zero-order hold), and a frame's imu field
# is the sample measured at the frame time, so each frame's first interval
# repeats the previous frame's snapshot.
IMU_STAMP_CONVENTION = (
    "measurement time: interval.time - interval.dt for each interval, frame imu "
    "snapshot at frame time; an interval repeating the last published snapshot "
    "is skipped; ROS stamp 1 + measurement time"
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def package_version(ros_env, package):
    """Version declared by the pinned environment, not a hardcoded label."""
    text = (ros_env / "share" / package / "package.xml").read_text()
    match = re.search(r"<version>([^<]+)</version>", text)
    if match is None:
        raise ValueError(f"No version in {package}/package.xml")
    return match.group(1).strip()


def scene_frames(raw, manifest, scene, expect_frames):
    """Select one scene from the sealed inputs; scenes come from the data itself."""
    frames = json.loads(raw)["sensorFrames"]
    available = sorted({f["scene"] for f in frames})
    declared = manifest.get("scenes")
    if declared is not None and sorted(declared) != available:
        raise ValueError("Manifest scene list disagrees with sealed frames")
    if not SCENE_ID.fullmatch(scene) or scene not in available:
        raise ValueError(f"Scene {scene!r} not in sealed inputs {available}")
    frames = [f for f in frames if f["scene"] == scene]
    if expect_frames is not None and len(frames) != expect_frames:
        raise ValueError(f"Expected {expect_frames} {scene} frames, found {len(frames)}")
    if [f["index"] for f in frames] != list(range(len(frames))):
        raise ValueError("Scene frame indices are not contiguous from zero")
    first = frames[0]["calibration"]
    for previous, frame in zip([None, *frames], frames):
        layout = frame["imageLayout"]
        k = frame["calibration"]
        if layout.get("aligned") is not True:
            raise ValueError("Unregistered depth; run register-slam-comparison.mjs")
        if (
            layout["color"]["format"] != "RGB8"
            or layout["depth"]["format"] != "Z16"
            or layout["depth"]["unitsMeters"] != 0.001
            or layout["depth"]["isBigEndian"]
            or layout["rowOrder"] != "top-down"
            or (layout["color"]["width"], layout["color"]["height"])
            != (k["width"], k["height"])
            or (layout["depth"]["width"], layout["depth"]["height"])
            != (k["width"], k["height"])
        ):
            raise ValueError("Unsupported image layout for 16UC1 millimetre replay")
        if any(k[name] != first[name] for name in CONSTANT_CALIBRATION):
            raise ValueError("Calibration or camera mount changes within the scene")
        # Fixed-period publishing preserves the source clock only if it is uniform.
        if previous is not None and abs(
            frame["time"] - previous["time"] - (frames[1]["time"] - frames[0]["time"])
        ) > 1e-5:
            raise ValueError("Non-uniform frame interval within the scene")
    interval = frames[1]["time"] - frames[0]["time"] if len(frames) > 1 else None
    if interval is not None and not interval > 0:
        raise ValueError("Non-increasing frame times")
    return frames, available, interval


def sealed_imu(imu_inputs, registered_manifest, frames):
    """IMU samples from the sealed raw inputs that the registered frames came from."""
    raw = (imu_inputs / "sensors.json").read_bytes()
    manifest = json.loads((imu_inputs / "manifest.json").read_text())
    if digest(raw) != manifest["sensorsSha256"]:
        raise ValueError("IMU source manifest integrity failure")
    if registered_manifest.get("sourceSensorsSha256") != digest(raw):
        raise ValueError("IMU source is not the sealed input these frames were registered from")
    source = json.loads(raw)
    if source.get("format") != "slam-lab-raw-rgbd-v1":
        raise ValueError("IMU source is not a sealed raw RGB-D input")
    by_key = {(f["scene"], f["index"]): f for f in source["sensorFrames"]}
    samples = {}
    previous_time = None
    period = None
    for frame in frames:
        origin = by_key.get((frame["scene"], frame["index"]))
        if origin is None or origin["time"] != frame["time"]:
            raise ValueError("IMU source frames do not match the registered frames")
        rows = []
        for interval in origin.get("imuIntervals", []):
            check_imu_values(interval["imu"])
            if previous_time is not None and not interval["time"] > previous_time:
                raise ValueError("Non-increasing IMU sample times")
            if interval["time"] > frame["time"] + 1e-9:
                raise ValueError("IMU sample later than its frame")
            if period is None:
                period = interval["dt"]
            if not period > 0 or abs(interval["dt"] - period) > 1e-9:
                raise ValueError("Non-uniform IMU interval")
            previous_time = interval["time"]
            rows.append(interval)
        if rows and abs(rows[-1]["time"] - frame["time"]) > 1e-9:
            raise ValueError("Last IMU interval does not end at its frame")
        check_imu_values(origin["imu"])
        samples[frame["index"]] = {"intervals": rows, "snapshot": origin["imu"]}
    if period is None:
        raise ValueError("Sealed input carries no IMU samples for this scene")
    first = next(row for rows in samples.values() for row in rows["intervals"])
    return samples, {
        "source": "sealed raw sensors.json imuIntervals (specific force + rate, no orientation)",
        "inputSha256": digest(raw),
        "inputFormat": source["format"],
        "rateHz": 1 / period,
        "intervalSeconds": period,
        "intervalsInScene": sum(len(rows["intervals"]) for rows in samples.values()),
        "framesWithoutIntervals": [i for i, rows in samples.items() if not rows["intervals"]],
        "declaredNoise": source.get("imuNoise"),
    }


def check_imu_values(imu):
    values = [*imu["accel"], *imu["gyro"]]
    if len(values) != 6 or not all(isinstance(v, (int, float)) and abs(v) < 1e6 for v in values):
        raise ValueError("Non-finite or malformed IMU sample")


def imu_messages(frames, samples, settle_seconds):
    """IMU messages per frame, stamped at measurement time (IMU_STAMP_CONVENTION).

    The track is not an input: every IMU track publishes the same messages for
    the same sealed samples and settling window. Samples measured before the
    first replayed frame time plus settle_seconds are dropped and listed, so a
    replay that starts mid-capture publishes from its first frame like a capture.
    """
    if not settle_seconds >= 0:
        raise ValueError("Invalid IMU settling window")
    cutoff = frames[0]["time"] + settle_seconds
    plan = {}
    dropped = []
    skipped = []
    last = None  # (measurement time, imu) of the last snapshot considered
    for frame in frames:
        rows = samples[frame["index"]]
        candidates = []
        for j, interval in enumerate(rows["intervals"]):
            measured = round(interval["time"] - interval["dt"], 9)  # ROS stamp resolution
            if j == 0 and last is not None and abs(measured - last[0]) < 1e-9:
                if interval["imu"] != last[1]:
                    raise ValueError("IMU interval disagrees with the previous frame snapshot")
                skipped.append({"frameIndex": frame["index"], "time": measured})
                continue
            if last is not None and not measured > last[0] + 1e-9:
                raise ValueError("IMU interval measured before the previous frame")
            candidates.append({"time": measured, "imu": interval["imu"]})
        candidates.append({"time": frame["time"], "imu": rows["snapshot"]})
        last = (frame["time"], rows["snapshot"])
        kept = []
        for message in candidates:
            message = {"frameIndex": frame["index"], **message}
            (kept if message["time"] >= cutoff - 1e-9 else dropped).append(message)
        plan[frame["index"]] = kept
    return plan, {
        "stampConvention": IMU_STAMP_CONVENTION,
        "settleSeconds": settle_seconds,
        "settleCutoffTime": cutoff,
        "droppedBySettle": [m["time"] for m in dropped],
        "duplicatesSkipped": len(skipped),
    }


def imu_published_fields(imu_published):
    """Receipt fields recomputed from the messages actually published."""
    times = [m["time"] for m in imu_published]
    first = imu_published[0] if imu_published else None
    return {
        "samplesPublished": len(times),
        "firstPublishedTime": times[0] if times else None,
        "lastPublishedTime": times[-1] if times else None,
        "firstPublishedAccelNorm": sum(v * v for v in first["accel"]) ** 0.5 if first else None,
        "publishedStampsUnique": len(set(times)) == len(times),
        "publishedStampsIncreasing": all(b > a for a, b in zip(times, times[1:])),
    }


def openvins_noise(declared, rate_hz):
    """OdomOpenVINS/* IMU noise and where it came from.

    A declared per-sample standard deviation sd at rate f is the continuous
    density sd / sqrt(f). Without a declaration the RTAB-Map defaults are used
    and the receipt says so; no value is tuned on the replayed capture.
    """
    if declared is None:
        return dict(OPENVINS_DEFAULT_NOISE), {
            "source": "RTAB-Map 0.23.7 OdomOpenVINS defaults; the capture declares no "
            "IMU noise model",
            "floored": [],
        }
    if set(declared) != set(IMU_NOISE_FIELDS):
        raise ValueError(f"imuNoise must declare exactly {sorted(IMU_NOISE_FIELDS)}")
    values = [declared[field] for field in IMU_NOISE_FIELDS]
    if not all(isinstance(v, (int, float)) and 0 <= v < 1e3 for v in values):
        raise ValueError("Malformed imuNoise value")
    if not (declared["accelSdPerSample"] > 0 and declared["gyroSdPerSample"] > 0):
        raise ValueError("imuNoise white noise must be positive")
    noise, floored = {}, []
    for field, name in IMU_NOISE_FIELDS.items():
        value = declared[field]
        if field.endswith("PerSample"):
            value = value / rate_hz**0.5
        elif value < OPENVINS_RANDOM_WALK_FLOOR[name]:
            value = OPENVINS_RANDOM_WALK_FLOOR[name]
            floored.append(name)
        noise[name] = value
    return noise, {
        "source": "sealed sensors.json imuNoise; per-sample sd converted to density "
        "sd / sqrt(rateHz)",
        "declared": declared,
        "floored": floored,
    }


def imu_track_arguments(track, ros2, calibration, noise):
    """Extra rgbd_odometry and rtabmap arguments and added nodes for an IMU track."""
    if track == OPENVINS_TRACK:
        parameters = {
            **OPENVINS_PARAMETERS,
            # Zero depth is invalid, so the mask must start above it.
            "Vis/MinDepth": f"{calibration['near']:g}",
            **{name: f"{value:g}" for name, value in noise.items()},
        }
        odometry = [
            "-p",
            "wait_imu_to_init:=true",
            *[item for name, value in parameters.items() for item in ["-p", f"{name}:='{value}'"]],
            "-r",
            "imu:=/imu/data_raw",
        ]
        # The rtabmap graph runs as in rgbd-vo: only the odometry source changes.
        return odometry, [], [], parameters
    if track != "rgbd-vo+imu-gravity":
        raise ValueError(f"{track} is not an IMU track")
    odometry = [
        "-p",
        "wait_imu_to_init:=true",
        "-p",
        "Odom/AlignWithGround:='false'",
        "-r",
        "imu:=/imu/data",
    ]
    rtabmap = [
        "-p",
        "Optimizer/GravitySigma:='0.3'",
        "-p",
        "Mem/UseOdomGravity:='false'",
        "-r",
        "imu:=/imu/data",
    ]
    orientation_filter = [
        ros2,
        "run",
        ORIENTATION_FILTER,
        "imu_filter_madgwick_node",
        "--ros-args",
        *[
            item
            for name, value in ORIENTATION_FILTER_PARAMETERS.items()
            for item in ["-p", f"{name}:={value}"]
        ],
        "-r",
        "imu/data_raw:=/imu/data_raw",
        "-r",
        "imu/data:=/imu/data",
    ]
    return odometry, rtabmap, [orientation_filter], None


def shutdown_status(command, code):
    """What one estimator process's exit code means after the runner's SIGINT.

    `ros2 run` exits with 256 - n when its child dies on signal n; Popen gives -n
    for a process it started that died on a signal. Reported, never retried: a
    crash during replay already fails the run, and one after SIGINT is stated
    here while pass or fail is decided from the outputs.
    """
    signum = -code if code is not None and code < 0 else None
    if code is not None and 192 < code < 256:
        signum = 256 - code
    if code == 0:
        meaning = "clean exit"
    elif signum is not None:
        try:
            name = signal.Signals(signum).name
        except ValueError:
            name = f"signal {signum}"
        meaning = "stopped by the runner's SIGINT" if signum == signal.SIGINT else (
            f"crashed on {name} after the runner's SIGINT (teardown)"
        )
    elif code is None:
        meaning = "did not exit"
    else:
        meaning = f"nonzero exit {code} after the runner's SIGINT"
    return {
        "node": command[3] if len(command) > 3 else command[0],
        "exitCode": code,
        "meaning": meaning,
        "teardownCrash": code not in (0, None) and signum not in (None, signal.SIGINT),
    }


def rtabmap_openvins_linkage(ros_env):
    """Resolved rtabmap core and OpenVINS libraries of the env's rgbd_odometry.

    Raises when rgbd_odometry does not load libov_msckf_lib.so: a RTAB-Map built
    without OpenVINS would refuse Odom/Strategy 10 at run time.
    """
    binary = (ros_env / "lib/rtabmap_odom/rgbd_odometry").resolve()
    lines = subprocess.run(
        ["ldd", str(binary)], capture_output=True, text=True, check=True
    ).stdout.splitlines()
    resolved = {
        name: path
        for name, _, path in (
            line.split()[:3] for line in lines if "=>" in line and len(line.split()) >= 3
        )
    }
    core = next((p for n, p in resolved.items() if n.startswith("librtabmap_core.so")), None)
    if "libov_msckf_lib.so" not in resolved or core is None:
        raise ValueError(
            "rgbd_odometry in this ros-env does not load OpenVINS; the "
            f"{OPENVINS_TRACK} track needs RTAB-Map built WITH_OPENVINS"
        )
    return {"rgbdOdometry": str(binary), "rtabmapCore": core, "ovMsckf": resolved["libov_msckf_lib.so"]}


def main():
    # ROS imports stay here so the input functions above test without the pinned env.
    import rclpy
    from nav_msgs.msg import Odometry
    from rclpy.node import Node
    from rosidl_runtime_py.convert import message_to_ordereddict
    from rtabmap_msgs.msg import Info
    from rtabmap_msgs.srv import GetMap
    from sensor_msgs.msg import CameraInfo, Image, Imu

    runner_sha256 = digest(Path(__file__).read_bytes())
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", type=Path)
    parser.add_argument(
        "scene", help="scene id present in the sealed inputs, e.g. hallway or office-loop"
    )
    parser.add_argument("output", type=Path)
    parser.add_argument("--ros-env", type=Path, required=True)
    parser.add_argument("--expect-frames", type=int)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--rate", type=float, default=5)
    parser.add_argument("--domain", type=int, default=173)
    parser.add_argument("--feature-type", type=int, default=6)
    parser.add_argument("--cpu-count", type=int, default=2)
    parser.add_argument(
        "--map-policy",
        choices=["every-frame", "upstream-defaults"],
        default="every-frame",
    )
    parser.add_argument("--estimator", choices=["rtabmap", "stella"], default="rtabmap")
    parser.add_argument("--vocabulary", type=Path)
    parser.add_argument("--rtabmap-track", choices=sorted(TRACKS), default="rgbd-vo")
    parser.add_argument(
        "--imu-inputs",
        type=Path,
        help="sealed raw inputs the registered frames came from (IMU track only)",
    )
    parser.add_argument(
        "--imu-settle-seconds",
        type=float,
        help="IMU samples measured before the first frame time plus this are not "
        "published; required on IMU tracks, use the same value for every IMU track",
    )
    args = parser.parse_args()
    if args.rate <= 0 or (args.limit is not None and args.limit < 1):
        raise ValueError("Invalid rate or limit")
    # Validate inputs before queueing for the lock or creating the output.
    raw = (args.inputs / "sensors.json").read_bytes()
    manifest = json.loads((args.inputs / "manifest.json").read_text())
    if digest(raw) != manifest["sensorsSha256"]:
        raise ValueError("Sensor manifest integrity failure")
    frames, scenes_available, source_interval = scene_frames(
        raw, manifest, args.scene, args.expect_frames
    )
    # Stamps always come from the source clock; only the wall period changes.
    if source_interval is None or abs(source_interval * args.rate - 1) < 1e-4:
        replay_mode = "paced at source rate"
    else:
        replay_mode = f"fixed {args.rate:g} Hz wall rate; source interval {source_interval:g} s"
    scene_frame_count = len(frames)
    if args.limit:
        frames = frames[: args.limit]
    rtabmap_version = None
    if args.estimator == "rtabmap":
        rtabmap_version = package_version(args.ros_env, "rtabmap_slam")
        if package_version(args.ros_env, "rtabmap_odom") != rtabmap_version:
            raise ValueError("rtabmap_odom and rtabmap_slam versions differ")
    imu_track = args.rtabmap_track in IMU_TRACKS
    imu_plan = imu_receipt = openvins_receipt = None
    if imu_track:
        if args.estimator != "rtabmap" or args.imu_inputs is None:
            raise ValueError("The IMU track needs --estimator rtabmap and --imu-inputs")
        if args.imu_settle_seconds is None:
            raise ValueError("The IMU track needs a declared --imu-settle-seconds")
        imu_samples, imu_receipt = sealed_imu(args.imu_inputs, manifest, frames)
        imu_plan, imu_stamping = imu_messages(frames, imu_samples, args.imu_settle_seconds)
        imu_receipt.update(imu_stamping)
    if args.rtabmap_track == OPENVINS_TRACK:
        if len({f["calibration"]["near"] for f in frames}) != 1:
            raise ValueError("The depth mask needs one calibration near plane per scene")
        openvins_noise_values, noise_source = openvins_noise(
            imu_receipt["declaredNoise"], imu_receipt["rateHz"]
        )
        openvins_receipt = {
            "mode": "monocular: one camera, OdomOpenVINS/UseStereo false",
            "depthUse": "feature mask only (Vis/DepthAsMask): features where registered "
            "depth >= Vis/MinDepth (calibration near); depth is not a filter measurement",
            "scale": "metric scale from the IMU",
            "extrinsics": "IMU at the body origin (messages in base_link); camera from the "
            "base_link->camera_optical static transform; not calibrated online",
            "initialization": "OpenVINS static initializer (RTAB-Map defaults); needs the "
            "settled IMU stream to start stationary",
            "noise": openvins_noise_values,
            "noiseSource": noise_source,
            "ovMsckfPackageVersion": package_version(args.ros_env, "ov_msckf"),
            "linkage": rtabmap_openvins_linkage(args.ros_env),
            "rtabmapGraph": "unchanged from rgbd-vo (no IMU or gravity links in rtabmap)",
        }
        imu_receipt.update(
            messageFrame="base_link",
            imuToBody="identity: samples are body FLU specific force (m/s^2) and rate (rad/s)",
            rawTopic="/imu/data_raw",
            consumedTopic="/imu/data_raw (no orientation filter)",
            rawOrientation="all-zero quaternion, orientation_covariance[0] = -1",
            rawVectorCovariances="all zero; OpenVINS uses OdomOpenVINS/* noise instead",
            publishTiming="each frame's messages, measurement times in (previous frame, "
            "frame], published back-to-back immediately before that frame's images",
            rtabmapImuUse=[
                "rgbd_odometry OpenVINS propagation and updates (Odom/Strategy 10)",
                "rgbd_odometry waits for IMU before the first image (wait_imu_to_init)",
            ],
        )
    elif imu_track:
        if not (args.ros_env / "share" / ORIENTATION_FILTER / "package.xml").exists():
            raise ValueError(
                f"{ORIENTATION_FILTER} is not in the pinned ros-env. rtabmap_odom and "
                f"rtabmap {rtabmap_version} ignore IMU messages without orientation and "
                "do not run RTAB-Map's ImuFilter from ROS; this track needs an "
                "orientation filter added to the pin before it can run"
            )
        imu_receipt.update(
            orientationFilter=f"{ORIENTATION_FILTER} "
            + package_version(args.ros_env, ORIENTATION_FILTER),
            orientationFilterParameters=ORIENTATION_FILTER_PARAMETERS,
            messageFrame="base_link",
            imuToBody="identity: samples are body FLU specific force (m/s^2) and rate (rad/s)",
            rawTopic="/imu/data_raw",
            filteredTopic="/imu/data",
            rawOrientation="all-zero quaternion, orientation_covariance[0] = -1",
            rawVectorCovariances="all zero (unknown); the capture declares no IMU noise model",
            publishTiming="each frame's messages, measurement times in (previous frame, "
            "frame], published back-to-back immediately before that frame's images",
            rtabmapImuUse=[
                "rgbd_odometry initial orientation (wait_imu_to_init)",
                "rgbd_odometry motion-guess rotation (Odom/GuessMotion true)",
                "rtabmap graph gravity links (Optimizer/GravitySigma 0.3, Mem/UseOdomGravity false)",
            ],
        )
    elif args.imu_inputs is not None or args.imu_settle_seconds is not None:
        raise ValueError("--imu-inputs and --imu-settle-seconds are only used by IMU tracks")
    lock_path = Path.home() / "scratch/slam_web/tmp/ros2-comparison.lock"
    lock_path.parent.mkdir(exist_ok=True, parents=True)
    admission_lock = lock_path.open("a")
    fcntl.flock(admission_lock, fcntl.LOCK_EX)  # All estimators run serially.
    available = sorted(os.sched_getaffinity(0))
    if not 1 <= args.cpu_count <= len(available):
        raise ValueError("Invalid CPU affinity budget")
    affinity = available[: args.cpu_count]
    os.sched_setaffinity(0, affinity)
    args.output.mkdir()  # Never overwrite an earlier measurement.
    os.environ.update(
        ROS_DOMAIN_ID=str(args.domain),
        ROS_AUTOMATIC_DISCOVERY_RANGE="LOCALHOST",
        ROS_LOCALHOST_ONLY="1",
        OMP_NUM_THREADS="2",
        OPENBLAS_NUM_THREADS="1",
        OPENCV_FOR_THREADS_NUM="2",
        ROS_LOG_DIR=str(args.output / "ros-logs"),
    )
    mount = frames[0]["calibration"]
    ros2 = str(args.ros_env / "bin/ros2")
    commands = [
        [
            ros2,
            "run",
            "tf2_ros",
            "static_transform_publisher",
            "--x",
            str(mount["forward"]),
            "--y",
            "0",
            "--z",
            str(mount["up"]),
            "--qx",
            "-0.5",
            "--qy",
            "0.5",
            "--qz",
            "-0.5",
            "--qw",
            "0.5",
            "--frame-id",
            "base_link",
            "--child-frame-id",
            "camera_optical",
        ],
        [
            ros2,
            "run",
            "rtabmap_odom",
            "rgbd_odometry",
            "--ros-args",
            "-p",
            "frame_id:=base_link",
            "-p",
            "odom_frame_id:=odom",
            "-p",
            "approx_sync:=false",
            "-p",
            "sync_queue_size:=20",
            "-p",
            f"Vis/FeatureType:='{args.feature_type}'",
            "-r",
            "rgb/image:=/camera/rgb",
            "-r",
            "depth/image:=/camera/depth",
            "-r",
            "rgb/camera_info:=/camera/info",
            "-r",
            "odom:=/odom",
        ],
        [
            ros2,
            "run",
            "rtabmap_slam",
            "rtabmap",
            "--delete_db_on_start",
            "--ros-args",
            "-r",
            "__ns:=/rtabmap",
            "-p",
            "frame_id:=base_link",
            "-p",
            "subscribe_depth:=true",
            "-p",
            "approx_sync:=false",
            "-p",
            "sync_queue_size:=20",
            "-p",
            "database_path:=" + str(args.output / "rtabmap.db"),
            "-p",
            f"Kp/DetectorStrategy:='{args.feature_type}'",
            "-r",
            "rgb/image:=/camera/rgb",
            "-r",
            "depth/image:=/camera/depth",
            "-r",
            "rgb/camera_info:=/camera/info",
            "-r",
            "odom:=/odom",
        ],
    ]
    if args.map_policy == "every-frame":
        commands[2].extend(
            [
                "-p",
                "Rtabmap/DetectionRate:='0'",
                "-p",
                "RGBD/LinearUpdate:='0'",
                "-p",
                "RGBD/AngularUpdate:='0'",
            ]
        )
    if imu_track:
        odometry_args, rtabmap_args, added_nodes, odometry_parameters = imu_track_arguments(
            args.rtabmap_track,
            ros2,
            mount,
            openvins_receipt["noise"] if openvins_receipt else None,
        )
        commands[1].extend(odometry_args)
        commands[2].extend(rtabmap_args)
        commands.extend(added_nodes)
        if openvins_receipt:
            openvins_receipt["odometryParameters"] = odometry_parameters
    if args.estimator == "stella":
        if args.vocabulary is None:
            raise ValueError("stella requires a pinned vocabulary file")
        if (
            digest(args.vocabulary.read_bytes())
            != "310cdf3581b5dd5becfabd75823606e315b1f049f70e51fa23be05021dc4b107"
        ):
            raise ValueError("Official FBoW vocabulary hash mismatch")
        k = frames[0]["calibration"]
        settings = args.output / "stella-camera.yaml"
        settings.write_text(
            "\n".join(
                [
                    "Camera:",
                    "  name: sealed-rgbd",
                    "  setup: RGBD",
                    "  model: perspective",
                    "  color_order: RGB",
                    f"  cols: {k['width']}",
                    f"  rows: {k['height']}",
                    f"  fps: {args.rate}",
                    *[f"  {name}: {k[name]}" for name in ["fx", "fy", "cx", "cy"]],
                    "  k1: 0.0",
                    "  k2: 0.0",
                    "  p1: 0.0",
                    "  p2: 0.0",
                    "  k3: 0.0",
                    f"  focal_x_baseline: {k['fx'] * k['baseline']}",
                    "  depth_threshold: 40.0",
                    "Preprocessing:",
                    "  descriptor_type: ORB",
                    f"  depthmap_factor: {1 / frames[0]['imageLayout']['depth']['unitsMeters']}",
                    "Feature:",
                    "  name: default-orb",
                    "",
                ]
            )
            + "\n"
        )
        evaluation_directory = args.output / "stella-eval"
        evaluation_directory.mkdir()
        commands = [
            [
                ros2,
                "run",
                "stella_vslam_ros",
                "run_slam",
                "--vocab",
                str(args.vocabulary.resolve()),
                "--config",
                str(settings.resolve()),
                "--map-db-out",
                str((args.output / "stella-map.msg").resolve()),
                "--eval-log-dir",
                str(evaluation_directory.resolve()),
                "--viewer",
                "none",
                "--ros-args",
                "-p",
                "publish_tf:=false",
                "-p",
                "use_exact_time:=true",
                "-p",
                "encoding:=rgb8",
                "-r",
                "camera/color/image_raw:=/camera/rgb",
                "-r",
                "camera/depth/image_raw:=/camera/depth",
            ]
        ]
    logs = []
    processes = []
    published = []
    poses = []
    infos = []
    rclpy.init(args=None)
    node = Node("sealed_rgbd_replay")
    rgb_pub = node.create_publisher(Image, "/camera/rgb", 20)
    depth_pub = node.create_publisher(Image, "/camera/depth", 20)
    info_pub = node.create_publisher(CameraInfo, "/camera/info", 20)
    imu_pub = node.create_publisher(Imu, "/imu/data_raw", 200) if imu_track else None
    imu_published = []
    sent = {}

    def pose_callback(msg):
        stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9
        now = time.monotonic_ns()
        poses.append(
            {
                "stamp": stamp,
                "receivedMonoNs": now,
                "latencyMs": (now - sent[round(stamp, 6)]) / 1e6
                if round(stamp, 6) in sent
                else None,
                "message": message_to_ordereddict(msg),
            }
        )

    def info_callback(msg):
        row = message_to_ordereddict(msg)
        stamp = round(msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9, 6)
        row["_receivedMonoNs"] = time.monotonic_ns()
        row["_latencyMs"] = (
            (row["_receivedMonoNs"] - sent[stamp]) / 1e6 if stamp in sent else None
        )
        infos.append(row)

    pose_topic = "/odom" if args.estimator == "rtabmap" else "/run_slam/camera_pose"
    _subscriptions = [
        node.create_subscription(Odometry, pose_topic, pose_callback, 20),
        node.create_subscription(Info, "/rtabmap/info", info_callback, 20),
    ]
    # Sample RSS/CPU of wrappers and all descendants, not just the ros2 launcher.
    peak_rss = 0
    peak_threads = 0
    cpu_ticks = {}
    host_load = []

    def sample():
        nonlocal peak_rss, peak_threads
        host_load.append(
            {"monotonicNs": time.monotonic_ns(), "loadAverage": os.getloadavg()}
        )
        groups = {p.pid for p in processes}
        rss = threads = 0
        for entry in Path("/proc").iterdir():
            if not entry.name.isdigit():
                continue
            try:
                stat = (entry / "stat").read_text().rsplit(")", 1)[1].split()
                if int(stat[2]) not in groups:
                    continue  # process group field5
                values = dict(
                    line.split(":", 1)
                    for line in (entry / "status").read_text().splitlines()
                    if ":" in line
                )
                rss += int(values.get("VmRSS", "0 kB").split()[0])
                threads += int(values.get("Threads", "0"))
                cpu_ticks[(entry.name, stat[19])] = int(stat[11]) + int(stat[12])
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                pass
        peak_rss = max(peak_rss, rss)
        peak_threads = max(peak_threads, threads)

    def spin_for(seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            rclpy.spin_once(node, timeout_sec=min(0.02, max(0, end - time.monotonic())))

    failure = None
    final_map = None
    started = time.monotonic_ns()
    started_utc = datetime.now(timezone.utc).isoformat()
    try:
        for index, command in enumerate(commands):
            log = (args.output / f"process-{index}.log").open("w")
            logs.append(log)
            processes.append(
                subprocess.Popen(
                    command,
                    stdout=log,
                    stderr=subprocess.STDOUT,
                    start_new_session=True,
                )
            )
        deadline = time.monotonic() + 30

        def discovered():
            if args.estimator == "stella":
                return (
                    min(
                        rgb_pub.get_subscription_count(),
                        depth_pub.get_subscription_count(),
                    )
                    >= 1
                )
            return min(
                rgb_pub.get_subscription_count(),
                depth_pub.get_subscription_count(),
                info_pub.get_subscription_count(),
            ) >= 2 and (imu_pub is None or imu_pub.get_subscription_count() >= 1)

        while not discovered():
            if any(p.poll() is not None for p in processes):
                raise RuntimeError("Estimator launch failed; see process logs")
            if time.monotonic() > deadline:
                raise RuntimeError("Required image subscribers not discovered in30s")
            spin_for(0.1)
        spin_for(2)
        for index, frame in enumerate(frames):
            frame_start = time.monotonic()
            k = frame["calibration"]
            stamp = 1 + frame["time"]
            images = []
            for kind, encoding in [("rgb", "rgb8"), ("depth", "16UC1")]:
                image = frame["images"][kind]
                path = (args.inputs / image["path"]).resolve()
                if not path.is_relative_to(args.inputs.resolve()):
                    raise ValueError("Image path escape")
                data = path.read_bytes()
                if digest(data) != image["sha256"] or len(data) != image["bytes"]:
                    raise ValueError("Image integrity failure")
                msg = Image()
                msg.header.stamp.sec = int(stamp)
                msg.header.stamp.nanosec = round((stamp - int(stamp)) * 1e9)
                msg.header.frame_id = "camera_optical"
                msg.height = k["height"]
                msg.width = k["width"]
                msg.encoding = encoding
                msg.is_bigendian = 0
                msg.step = k["width"] * (3 if kind == "rgb" else 2)
                msg.data = data
                images.append(msg)
            camera = CameraInfo()
            camera.header = images[0].header
            camera.height = k["height"]
            camera.width = k["width"]
            camera.distortion_model = "plumb_bob"
            camera.d = [0.0] * 5
            camera.k = [k["fx"], 0.0, k["cx"], 0.0, k["fy"], k["cy"], 0.0, 0.0, 1.0]
            camera.r = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]
            camera.p = [
                k["fx"],
                0.0,
                k["cx"],
                0.0,
                0.0,
                k["fy"],
                k["cy"],
                0.0,
                0.0,
                0.0,
                1.0,
                0.0,
            ]
            for imu_message in imu_plan[frame["index"]] if imu_track else []:
                imu_stamp = 1 + imu_message["time"]
                imu = Imu()
                imu.header.stamp.sec = int(imu_stamp)
                imu.header.stamp.nanosec = round((imu_stamp - int(imu_stamp)) * 1e9)
                imu.header.frame_id = "base_link"
                # No orientation: zero quaternion (w defaults to 1) and the -1 flag.
                imu.orientation.w = 0.0
                imu.orientation_covariance[0] = -1.0
                (
                    imu.angular_velocity.x,
                    imu.angular_velocity.y,
                    imu.angular_velocity.z,
                ) = map(float, imu_message["imu"]["gyro"])
                (
                    imu.linear_acceleration.x,
                    imu.linear_acceleration.y,
                    imu.linear_acceleration.z,
                ) = map(float, imu_message["imu"]["accel"])
                imu_pub.publish(imu)
                imu_published.append(
                    {
                        "frameIndex": frame["index"],
                        "time": imu_message["time"],
                        "stamp": imu_stamp,
                        "accel": imu_message["imu"]["accel"],
                        "gyro": imu_message["imu"]["gyro"],
                        "sentMonoNs": time.monotonic_ns(),
                    }
                )
            sent[round(stamp, 6)] = time.monotonic_ns()
            info_pub.publish(camera)
            rgb_pub.publish(images[0])
            depth_pub.publish(images[1])
            published.append(
                {
                    "index": frame["index"],
                    "stamp": stamp,
                    "sentMonoNs": sent[round(stamp, 6)],
                }
            )
            spin_for(max(0, 1 / args.rate - (time.monotonic() - frame_start)))
            sample()
            if any(p.poll() is not None for p in processes):
                raise RuntimeError("Estimator exited during replay")
        spin_for(10)
        sample()
        client = node.create_client(GetMap, "/rtabmap/rtabmap/get_map_data")
        if args.estimator == "rtabmap" and client.wait_for_service(timeout_sec=3):
            request = GetMap.Request()
            request.global_map = True
            request.optimized = True
            request.graph_only = True
            future = client.call_async(request)
            rclpy.spin_until_future_complete(node, future, timeout_sec=10)
            if future.done() and future.result():
                final_map = message_to_ordereddict(future.result().data)
    except (Exception, KeyboardInterrupt) as error:  # noqa: BLE001 - preserve partial evidence for any runner failure
        failure = f"{type(error).__name__}: {error}"
    finally:
        sample()
        # SIGINT lets RTAB-Map finish its database writes before forced cleanup.
        for p in processes:
            try:
                os.killpg(p.pid, signal.SIGINT)
            except ProcessLookupError:
                pass
        for p in processes:
            try:
                p.wait(timeout=15)
            except subprocess.TimeoutExpired:
                failure = (
                    failure or "Shutdown deadline exceeded; estimator required SIGKILL"
                )
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()
        for log in logs:
            log.close()
        node.destroy_node()
        rclpy.shutdown()
    shutdown = [shutdown_status(c, p.returncode) for c, p in zip(commands, processes)]
    receipt = {
        "schema": 1,
        "estimator": f"RTAB-Map{rtabmap_version}"
        if args.estimator == "rtabmap"
        else "stella-vslam0.7.0-e445b545/ROS186f623d",
        "scene": args.scene,
        "scenesAvailable": scenes_available,
        "sceneFrames": scene_frame_count,
        "sourceFrameIntervalSeconds": source_interval,
        "replayMode": replay_mode,
        "track": TRACKS[args.rtabmap_track]
        if args.estimator == "rtabmap"
        else "registered RGB-D only",
        "rtabmapTrack": args.rtabmap_track if args.estimator == "rtabmap" else None,
        "imuRateHz": imu_receipt["rateHz"] if imu_track else None,
        "imuStampConvention": IMU_STAMP_CONVENTION if imu_track else None,
        "imu": {**imu_receipt, **imu_published_fields(imu_published)} if imu_track else None,
        "openvins": openvins_receipt,
        "inputSha256": digest(raw),
        "inputFormat": json.loads(raw).get("format"),
        "framesExpected": len(frames),
        "framesPublished": len(published),
        "posesReceived": len(poses),
        "uniquePoseStamps": len({p["stamp"] for p in poses}),
        "wallSeconds": (time.monotonic_ns() - started) / 1e9,
        "sampledPeakRssKiB": peak_rss,
        "sampledPeakThreads": peak_threads,
        "sampledCpuSeconds": sum(cpu_ticks.values()) / os.sysconf("SC_CLK_TCK"),
        "resourceScope": "estimator process groups, including ros2 wrappers; replay excluded",
        "outputPoseFrame": "body FLU"
        if args.estimator == "rtabmap"
        else "camera FLU in initial camera frame",
        "cameraOriginBody": [
            frames[0]["calibration"]["forward"],
            0,
            frames[0]["calibration"]["up"],
        ],
        "rateHz": args.rate,
        "domain": args.domain,
        "commands": commands,
        "cpuAffinity": affinity,
        "loadAverageAtFinish": os.getloadavg(),
        "mapPolicy": args.map_policy
        if args.estimator == "rtabmap"
        else "native-defaults",
        "featureType": args.feature_type if args.estimator == "rtabmap" else "ORB",
        "startedAtUTC": started_utc,
        "hostLoadSamples": host_load,
        "kernel": platform.release(),
        "python": platform.python_version(),
        "runnerSha256": runner_sha256,
        "rosEnvironment": str(args.ros_env.resolve()),
        "rtabmapPackageVersion": rtabmap_version,
        "exitCodes": [p.returncode for p in processes],
        "shutdown": shutdown,
        "teardownCrash": any(s["teardownCrash"] for s in shutdown),
        "passFailBasis": "failure below, from the replay and its outputs; a crash during "
        "replay fails the run, a teardown crash after SIGINT is stated in shutdown and "
        "does not by itself fail it; no process is retried",
        "failure": failure,
    }
    for name, data in [
        ("published", published),
        ("odometry", poses),
        ("info", infos),
        ("optimized-map", final_map),
        *([("imu-published", imu_published)] if imu_track else []),
    ]:
        (args.output / (name + ".json")).write_text(json.dumps(data, indent=2) + "\n")
    receipt_temp = args.output / "receipt.json.tmp"
    receipt_temp.write_text(json.dumps(receipt, indent=2) + "\n")
    receipt_temp.replace(args.output / "receipt.json")
    print(json.dumps(receipt, indent=2))
    if failure:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
