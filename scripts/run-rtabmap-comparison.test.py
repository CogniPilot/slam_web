import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "runner", Path(__file__).with_name("run-rtabmap-comparison.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

DT = 0.1


def imu(value):
    return {"accel": [value, 0.0, 9.81], "gyro": [0.0, 0.0, value]}


def capture(intervals_per_frame, frame_count, first_time=0.0):
    """Sealed-format frames: an interval stamped t holds the sample measured at t - dt."""
    period = intervals_per_frame * DT
    frames, samples = [], {}
    for index in range(frame_count):
        time = round(first_time + index * period, 9)
        intervals = (
            []
            if index == 0 and first_time == 0.0
            else [
                {
                    "time": round(time - period + (j + 1) * DT, 9),
                    "dt": DT,
                    "imu": imu(round(time - period + j * DT, 9)),
                }
                for j in range(intervals_per_frame)
            ]
        )
        frames.append({"index": index, "time": time})
        samples[index] = {"intervals": intervals, "snapshot": imu(time)}
    return frames, samples


def publish(plan):
    """The records the runner writes to imu-published.json, in publish order."""
    return [
        {
            "frameIndex": m["frameIndex"],
            "time": m["time"],
            "stamp": 1 + m["time"],
            "accel": m["imu"]["accel"],
            "gyro": m["imu"]["gyro"],
        }
        for rows in plan.values()
        for m in rows
    ]


class ImuStampTests(unittest.TestCase):
    def test_a_three_intervals_publish_three_messages_at_measurement_time(self):
        frames, samples = capture(3, 3)
        plan, stamping = module.imu_messages(frames, samples, 0)
        times = [m["time"] for m in plan[2]]
        # Intervals 2 and 3 at interval.time - dt, then the snapshot at the frame time;
        # interval 1 repeats frame 1's snapshot and is skipped.
        self.assertEqual(times, [0.4, 0.5, 0.6])
        for m in plan[2]:
            self.assertEqual(m["imu"], imu(m["time"]))  # each sample at its own time
        self.assertEqual(stamping["duplicatesSkipped"], 2)
        all_times = [m["time"] for rows in plan.values() for m in rows]
        self.assertEqual(len(all_times), len(set(all_times)))

    def test_b_first_frame_of_capture_has_no_earlier_snapshot(self):
        frames, samples = capture(3, 2)
        plan, stamping = module.imu_messages(frames, samples, 0)
        self.assertEqual([m["time"] for m in plan[0]], [0.0])  # snapshot only
        self.assertEqual([m["time"] for m in plan[1]], [0.1, 0.2, 0.3])
        self.assertEqual(stamping["duplicatesSkipped"], 1)

    def test_b_first_replayed_frame_mid_capture_starts_at_its_frame_time(self):
        frames, samples = capture(3, 2, first_time=0.6)
        plan, stamping = module.imu_messages(frames, samples, 0)
        # Samples measured before the first replayed frame are outside the replay,
        # so a mid-capture start publishes from its frame time like a capture start.
        self.assertEqual([m["time"] for m in plan[0]], [0.6])
        self.assertEqual(stamping["droppedBySettle"], [0.3, 0.4, 0.5])
        self.assertEqual([m["time"] for m in plan[1]], [0.7, 0.8, 0.9])
        self.assertEqual(stamping["duplicatesSkipped"], 1)

    def test_c_settling_window_drops_the_same_samples_for_every_imu_track(self):
        frames, samples = capture(3, 4)
        runs = {
            track: module.imu_messages(frames, samples, 0.25) for track in module.IMU_TRACKS
        }
        self.assertTrue(runs)
        for plan, stamping in runs.values():
            self.assertEqual(stamping["settleCutoffTime"], 0.25)
            self.assertEqual(stamping["droppedBySettle"], [0.0, 0.1, 0.2])
            self.assertEqual(publish(plan)[0]["time"], 0.3)
            self.assertEqual(runs[next(iter(module.IMU_TRACKS))], (plan, stamping))
        # The window is relative to the first replayed frame, not to capture time 0.
        frames, samples = capture(3, 3, first_time=0.6)
        _, stamping = module.imu_messages(frames, samples, 0.25)
        self.assertEqual(stamping["droppedBySettle"], [0.3, 0.4, 0.5, 0.6, 0.7, 0.8])
        with self.assertRaises(ValueError):
            module.imu_messages(frames, samples, -0.1)

    def test_d_receipt_fields_match_what_was_published(self):
        frames, samples = capture(2, 5)
        plan, stamping = module.imu_messages(frames, samples, 0.15)
        published = publish(plan)
        fields = module.imu_published_fields(published)
        self.assertEqual(fields["samplesPublished"], len(published))
        self.assertEqual(fields["samplesPublished"], 7)  # 9 samples, 2 settled
        self.assertEqual(
            fields["samplesPublished"] + len(stamping["droppedBySettle"]),
            len({row["time"] for rows in samples.values() for row in rows["intervals"]})
            + 1,  # the t = 0 snapshot has no interval
        )
        self.assertEqual(fields["firstPublishedTime"], published[0]["time"])
        self.assertEqual(fields["lastPublishedTime"], frames[-1]["time"])
        self.assertAlmostEqual(
            fields["firstPublishedAccelNorm"], (0.2**2 + 9.81**2) ** 0.5
        )
        self.assertTrue(fields["publishedStampsUnique"])
        self.assertTrue(fields["publishedStampsIncreasing"])
        for record in published:
            self.assertAlmostEqual(record["stamp"], 1 + record["time"])

    def test_interval_that_disagrees_with_previous_snapshot_is_refused(self):
        frames, samples = capture(3, 2)
        samples[1]["intervals"][0]["imu"] = imu(99.0)
        with self.assertRaises(ValueError):
            module.imu_messages(frames, samples, 0)

    def test_sealed_reader_returns_snapshot_and_checks_last_interval(self):
        frames, samples = capture(2, 3)
        sensor_frames = [
            {
                "scene": "hallway",
                "index": f["index"],
                "time": f["time"],
                "imu": samples[f["index"]]["snapshot"],
                "imuIntervals": samples[f["index"]]["intervals"],
            }
            for f in frames
        ]
        registered = [{"scene": "hallway", **f} for f in frames]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)

            def seal(sensor_frames):
                raw = json.dumps(
                    {"format": "slam-lab-raw-rgbd-v1", "sensorFrames": sensor_frames}
                ).encode()
                sha = hashlib.sha256(raw).hexdigest()
                (root / "sensors.json").write_bytes(raw)
                (root / "manifest.json").write_text(json.dumps({"sensorsSha256": sha}))
                return {"sourceSensorsSha256": sha}

            got, receipt = module.sealed_imu(root, seal(sensor_frames), registered)
            self.assertEqual(got, samples)
            self.assertEqual(receipt["framesWithoutIntervals"], [0])
            self.assertAlmostEqual(receipt["rateHz"], 10)
            sensor_frames[2]["imuIntervals"] = sensor_frames[2]["imuIntervals"][:1]
            with self.assertRaises(ValueError):
                module.sealed_imu(root, seal(sensor_frames), registered)

    @unittest.skipUnless(os.environ.get("SLAM_SEALED_HALLWAY"), "set SLAM_SEALED_HALLWAY")
    def test_sealed_hallway_publishes_each_sample_once_at_its_own_time(self):
        source = json.loads(
            (Path(os.environ["SLAM_SEALED_HALLWAY"]) / "sensors.json").read_text()
        )
        frames = [{"index": f["index"], "time": f["time"]} for f in source["sensorFrames"]]
        samples = {
            f["index"]: {"intervals": f["imuIntervals"], "snapshot": f["imu"]}
            for f in source["sensorFrames"]
        }
        plan, stamping = module.imu_messages(frames, samples, 0)
        published = publish(plan)
        self.assertEqual(stamping["duplicatesSkipped"], len(frames) - 1)
        self.assertEqual(published[0]["time"], 0)
        self.assertTrue(module.imu_published_fields(published)["publishedStampsIncreasing"])
        for frame in source["sensorFrames"]:
            last = plan[frame["index"]][-1]
            self.assertEqual((last["time"], last["imu"]), (frame["time"], frame["imu"]))


# Runs the runner's main() in a child process with stub ROS modules, a stub ros2
# that only sleeps, and a clock that rclpy.spin_once advances. The frame loop,
# the IMU publish loop and the /proc resource sampler all run for real.
FAKE_ROS_DRIVER = """
import importlib.util, sys, time as real_time, types

runner_path = sys.argv[1]
sys.argv = [runner_path, *sys.argv[2:]]


class Clock:
    now = 0.0

    def monotonic(self):
        return self.now

    def monotonic_ns(self):
        return int(self.now * 1e9)

    def __getattr__(self, name):
        return getattr(real_time, name)


clock = Clock()


class Msg:
    def __init__(self):
        self.orientation_covariance = [0.0] * 9

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        value = Msg()
        setattr(self, name, value)
        return value


class Publisher:
    def get_subscription_count(self):
        return 2

    def publish(self, message):
        pass


class Node:
    def __init__(self, name):
        pass

    def create_publisher(self, *args):
        return Publisher()

    def create_subscription(self, *args):
        return object()

    def create_client(self, *args):
        return types.SimpleNamespace(wait_for_service=lambda timeout_sec: False)

    def destroy_node(self):
        pass


def spin_once(node, timeout_sec=0):
    clock.now += max(timeout_sec, 1e-3)


stubs = {
    "rclpy": dict(init=lambda args=None: None, spin_once=spin_once, shutdown=lambda: None),
    "rclpy.node": dict(Node=Node),
    "nav_msgs": {},
    "nav_msgs.msg": dict(Odometry=Msg),
    "rosidl_runtime_py": {},
    "rosidl_runtime_py.convert": dict(message_to_ordereddict=lambda message: {}),
    "rtabmap_msgs": {},
    "rtabmap_msgs.msg": dict(Info=Msg),
    "rtabmap_msgs.srv": dict(GetMap=Msg),
    "sensor_msgs": {},
    "sensor_msgs.msg": dict(CameraInfo=Msg, Image=Msg, Imu=Msg),
}
for name, attributes in stubs.items():
    module = types.ModuleType(name)
    module.__dict__.update(attributes)
    sys.modules[name] = module
spec = importlib.util.spec_from_file_location("runner", runner_path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
runner.time = clock
runner.main()
"""


def seal(root, body, **manifest):
    raw = json.dumps(body).encode()
    (root / "sensors.json").write_bytes(raw)
    sha = hashlib.sha256(raw).hexdigest()
    (root / "manifest.json").write_text(json.dumps({"sensorsSha256": sha, **manifest}))
    return sha


class ReplayLoopTests(unittest.TestCase):
    def test_imu_frames_replay_with_the_resource_sampler_live(self):
        frames, samples = capture(2, 3)
        calibration = {"width": 2, "height": 2, "fx": 2.0, "fy": 2.0, "cx": 0.5,
                       "cy": 0.5, "forward": 0.18, "up": -0.04, "near": 0.28,
                       "far": 10, "baseline": 0.05}
        layout = {"color": {"width": 2, "height": 2, "format": "RGB8"},
                  "depth": {"width": 2, "height": 2, "format": "Z16",
                            "unitsMeters": 0.001, "isBigEndian": False},
                  "rowOrder": "top-down", "aligned": True}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            raw, registered, env = root / "raw", root / "registered", root / "env"
            for directory in [raw, registered, env / "bin"]:
                directory.mkdir(parents=True)
            for package in ["rtabmap_slam", "rtabmap_odom", module.ORIENTATION_FILTER]:
                (env / "share" / package).mkdir(parents=True)
                (env / "share" / package / "package.xml").write_text(
                    "<package><version>0.23.7</version></package>"
                )
            ros2 = env / "bin" / "ros2"
            ros2.write_text("#!/bin/sh\nexec sleep 60\n")
            ros2.chmod(0o755)
            source_sha = seal(raw, {
                "format": "slam-lab-raw-rgbd-v1",
                "sensorFrames": [
                    {"scene": "hallway", **f, "imu": samples[f["index"]]["snapshot"],
                     "imuIntervals": samples[f["index"]]["intervals"]}
                    for f in frames
                ],
            })
            registered_frames = []
            for f in frames:
                images = {}
                for kind, size in [("rgb", 12), ("depth", 8)]:
                    data = bytes([f["index"]] * size)
                    path = f"hallway/{f['index']:04d}-{kind}.bin"
                    (registered / path).parent.mkdir(exist_ok=True)
                    (registered / path).write_bytes(data)
                    images[kind] = {"path": path, "bytes": size,
                                    "sha256": hashlib.sha256(data).hexdigest()}
                registered_frames.append({"scene": "hallway", **f, "calibration": calibration,
                                          "imageLayout": layout, "images": images})
            seal(registered, {"format": "slam-lab-raw-rgbd-v1", "sensorFrames": registered_frames},
                 scenes=["hallway"], sourceSensorsSha256=source_sha)
            driver = root / "driver.py"
            driver.write_text(FAKE_ROS_DRIVER)
            out = root / "out"
            result = subprocess.run(
                [sys.executable, "-I", str(driver), str(Path(module.__file__).resolve()),
                 str(registered), "hallway", str(out), "--ros-env", str(env),
                 "--cpu-count", "1", "--domain", "199",
                 "--rtabmap-track", "rgbd-vo+imu-gravity", "--imu-inputs", str(raw),
                 "--imu-settle-seconds", "0"],
                capture_output=True, text=True, timeout=120,
                env={"HOME": str(root), "PATH": os.environ.get("PATH", "")},
            )
            self.assertEqual(result.returncode, 0, result.stderr[-2000:])
            receipt = json.loads((out / "receipt.json").read_text())
            published = json.loads((out / "imu-published.json").read_text())
        self.assertIsNone(receipt["failure"])
        self.assertEqual(receipt["framesPublished"], 3)
        # Frame 0 publishes its snapshot, then frames 1 and 2 two samples each.
        self.assertEqual([m["frameIndex"] for m in published], [0, 1, 1, 2, 2])
        self.assertEqual(receipt["imu"]["samplesPublished"], len(published))
        # The sampler ran after every frame, after the drain and in the finally.
        self.assertEqual(len(receipt["hostLoadSamples"]), 3 + 2)
        self.assertGreater(receipt["sampledPeakRssKiB"], 0)



if __name__ == "__main__":
    unittest.main()
