import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location(
    "evaluate", Path(__file__).with_name("evaluate-slam-comparison.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EvaluationTests(unittest.TestCase):
    def test_shared_percentile_rule_is_linear_not_nearest_rank(self):
        result = module.percentiles([0, 10])
        self.assertEqual(result["p50"], 5)
        self.assertEqual(result["p95"], 9.5)
        self.assertEqual(result["p99"], 9.9)

    def test_missing_orientation_is_labelled_translation_only(self):
        truth = {0: {"bodyPosition": [4, 5, 6], "bodyQuaternionWxyz": [1, 0, 0, 0]}}
        result = module.metrics([{"time": 0, "position": [0, 0, 0]}], truth, 1)
        self.assertEqual(
            result["initialAlignmentScope"],
            "translation only; estimate orientation unavailable",
        )

    def run_top_level(self, stella=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            times = [0, 0.2, 0.4, 0.6]
            truth = {
                "samples": [
                    {
                        "scene": "city",
                        "time": t,
                        "bodyPosition": [t, 0, 0],
                        "bodyQuaternionWxyz": [1, 0, 0, 0],
                    }
                    for t in times
                ]
            }
            truth_bytes = json.dumps(truth).encode()
            (root / "truth.json").write_bytes(truth_bytes)
            (root / "manifest.json").write_text(
                json.dumps(
                    {"groundTruthSha256": hashlib.sha256(truth_bytes).hexdigest()}
                )
            )
            receipt = {
                "scene": "city",
                "estimator": "stella-test" if stella else "RTAB-Map-test",
                "cameraOriginBody": [0, 0, 0],
                "outputPoseFrame": "body FLU",
            }
            (root / "receipt.json").write_text(json.dumps(receipt))
            poses = []
            for index, t in enumerate(times):
                # Different sentinel failure mechanisms must both be excluded for RTAB.
                covariance = [0.0] * 36
                covariance[0] = 9999 if index == 1 and not stella else 0
                orientation = {
                    "w": 0 if index == 2 and not stella else 1,
                    "x": 0,
                    "y": 0,
                    "z": 0,
                }
                poses.append(
                    {
                        "stamp": 1 + t,
                        "latencyMs": index + 2,
                        "message": {
                            "pose": {
                                "pose": {
                                    "position": {"x": t, "y": 0, "z": 0},
                                    "orientation": orientation,
                                },
                                "covariance": covariance,
                            }
                        },
                    }
                )
            (root / "odometry.json").write_text(json.dumps(poses))
            (root / "published.json").write_text(
                json.dumps(
                    [
                        {"stamp": 1 + t, "sentMonoNs": (i + 1) * 1_000_000_000}
                        for i, t in enumerate(times)
                    ]
                )
            )
            (root / "info.json").write_text("[]")
            (root / "optimized-map.json").write_text("null")
            if stella:
                (root / "stella-eval").mkdir()
                # All four ROS poses are valid matrices; only these two are in
                # the official export, which drops backend lost frames.
                (root / "stella-eval/frame_trajectory.txt").write_text(
                    "1 0 0 0 0 0 0 1\n1.4 0 0 .4 0 0 0 1\n"
                )
            subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("evaluate-slam-comparison.py")),
                    str(root / "truth.json"),
                    str(root),
                    "--manifest",
                    str(root / "manifest.json"),
                    "--output",
                    str(root / "result.json"),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            return json.loads((root / "result.json").read_text())

    def test_top_level_rtab_filters_and_source_timestamp_offset(self):
        result = self.run_top_level()
        self.assertEqual(result["validPoseTimes"], [0, 0.6])
        self.assertEqual(result["onlineOdometry"]["matched"], 2)
        self.assertEqual(result["onlineOdometry"]["coverage"], 0.5)
        self.assertAlmostEqual(
            result["onlineOdometry"]["initialPoseAlignedAteRmseMeters"], 0
        )

    def test_top_level_stella_export_lost_mask_and_timestamp_offset(self):
        result = self.run_top_level(stella=True)
        self.assertEqual(result["validPoseTimes"], [0, 0.4])
        self.assertEqual(result["optimizedPoseTimes"], [0, 0.4])
        self.assertEqual(result["onlineOdometry"]["matched"], 2)
        self.assertEqual(result["optimizedGraph"]["matched"], 2)
        self.assertAlmostEqual(
            result["onlineOdometry"]["initialPoseAlignedAteRmseMeters"], 0
        )

    def test_rigid_alignment_known_rotation_and_translation(self):
        a = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])
        r = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
        t = np.array([4, 5, 6])
        fit, offset = module.fit_se3(a, (r @ a.T).T + t)
        np.testing.assert_allclose(fit, r, atol=1e-12)
        np.testing.assert_allclose(offset, t, atol=1e-12)

    def test_scale_error_is_not_fitted_away(self):
        a = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]])
        r, t = module.fit_se3(a, 2 * a)
        self.assertGreater(np.linalg.norm((r @ a.T).T + t - 2 * a), 0.1)
        self.assertAlmostEqual(np.linalg.det(r), 1)

    def test_missing_frames_reduce_coverage_and_do_not_bridge_rpe(self):
        truth = {
            t: {
                "time": t,
                "bodyPosition": [t, 0, 0],
                "bodyQuaternionWxyz": [1, 0, 0, 0],
            }
            for t in [0, 0.2, 0.4]
        }
        samples = [
            {"time": t, "position": [t, 0, 0], "quaternionWxyz": [1, 0, 0, 0]}
            for t in [0, 0.4]
        ]
        result = module.metrics(samples, truth, 3)
        self.assertAlmostEqual(result["coverage"], 2 / 3)
        self.assertEqual(result["rpePairs"], 0)
        self.assertAlmostEqual(result["initialPoseAlignedAteRmseMeters"], 0)

    def test_relative_rotation_and_translation(self):
        truth = {
            t: {
                "time": t,
                "bodyPosition": [t, 0, 0],
                "bodyQuaternionWxyz": [1, 0, 0, 0],
            }
            for t in [0, 0.2]
        }
        samples = [
            {"time": t, "position": [t, 0, 0], "quaternionWxyz": [1, 0, 0, 0]}
            for t in [0, 0.2]
        ]
        result = module.metrics(samples, truth, 2)
        self.assertEqual(result["rpePairs"], 1)
        self.assertEqual(result["rpeTranslationRmseMeters"], 0)
        self.assertEqual(result["rpeRotationRmseRadians"], 0)

    def test_invalid_quaternion_is_rejected(self):
        with self.assertRaises(ValueError):
            module.rotation([0, 0, 0, 0])

    def test_ros_mount_quaternion_maps_optical_axes_to_flu(self):
        r = module.rotation([0.5, -0.5, 0.5, -0.5])
        np.testing.assert_allclose(r @ np.array([0, 0, 1]), [1, 0, 0], atol=1e-12)
        np.testing.assert_allclose(r @ np.array([1, 0, 0]), [0, -1, 0], atol=1e-12)
        np.testing.assert_allclose(r @ np.array([0, 1, 0]), [0, 0, -1], atol=1e-12)
        yaw = module.rotation([2**-0.5, 0, 0, 2**-0.5])
        np.testing.assert_allclose(
            yaw @ np.array([0.18, 0, -0.04]), [0, 0.18, -0.04], atol=1e-12
        )

    def test_optical_trajectory_conversion_keeps_body_origin_and_rotation(self):
        identity = module.optical_camera_to_body(
            [0, 0, 0], [1, 0, 0, 0], [0.18, 0, -0.04]
        )
        np.testing.assert_allclose(identity["position"], [0, 0, 0], atol=1e-12)
        np.testing.assert_allclose(
            module.rotation(identity["quaternionWxyz"]), np.eye(3), atol=1e-12
        )
        # Optical forward is body forward; an optical translation along Z maps to body X.
        forward = module.optical_camera_to_body(
            [0, 0, 2], [1, 0, 0, 0], [0.18, 0, -0.04]
        )
        np.testing.assert_allclose(forward["position"], [2, 0, 0], atol=1e-12)
        q = [2**-0.5, 0, 2**-0.5, 0]
        converted = module.optical_camera_to_body([0, 0, 0], q, [0, 0, 0])
        e = module.rotation([0.5, -0.5, 0.5, -0.5])
        np.testing.assert_allclose(
            module.rotation(converted["quaternionWxyz"]),
            e @ module.rotation(q) @ e.T,
            atol=1e-12,
        )


if __name__ == "__main__":
    unittest.main()
