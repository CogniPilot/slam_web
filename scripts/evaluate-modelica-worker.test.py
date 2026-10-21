"""Check mission scoring without an original estimator trajectory."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class WorkerEvaluationTests(unittest.TestCase):
    def test_absent_reference_and_partial_trajectory_preserve_quality_and_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            samples = [{"scene": "hallway", "time": t, "bodyPosition": [i, 0, 0],
                        "bodyQuaternionWxyz": [1, 0, 0, 0]} for i, t in enumerate([0, .2])]
            truth = json.dumps({"samples": samples}).encode()
            (root / "ground-truth.json").write_bytes(truth)
            (root / "manifest.json").write_text(json.dumps({"groundTruthSha256": hashlib.sha256(truth).hexdigest()}))
            (root / "receipt.json").write_text(json.dumps({"scene": "hallway", "runtime": "research worker", "framesExpected": 3001, "framesCompleted": 2}))
            rows = [{"time": t, "result": {"estimate": {"x": i * 2, "y": 0, "z": 0,
                     "quaternion": [1, 0, 0, 0], "diagnostics": {"observationAccepted": i}}},
                     "timings": {"roundTripMs": 10, "workerMs": 8,
                                 "nativeStages": [{"entryMs": 6, "carryMs": 1, "carryBytes": 16}]}}
                    for i, t in enumerate([0, .2])]
            (root / "poses.json").write_text(json.dumps(rows))
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("evaluate-modelica-worker.py")),
                                     str(root), str(root)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            scored = json.loads((root / "evaluation.json").read_text())
            self.assertIsNone(scored["maxPositionDifferenceFromOriginalMeters"])
            self.assertEqual(scored["lastAvailablePose"]["time"], .2)
            self.assertAlmostEqual(scored["lastAvailablePose"]["positionErrorMeters"], 1)
            self.assertEqual(scored["visualPoseMetrics"]["coverage"], .5)
            self.assertEqual(scored["hostStageBreakdown"]["totals"]["entryMs"], 6)
            self.assertEqual(scored["hostStageBreakdown"]["totals"]["carryMs"], 1)
            self.assertIn("research worker", scored["scope"])
            self.assertIn("not proof", scored["lastAvailablePose"]["scope"])
            # Evaluation refuses altered truth even when the estimator receipt exists.
            (root / "ground-truth.json").write_bytes(truth + b" ")
            rejected = subprocess.run([sys.executable, str(Path(__file__).with_name("evaluate-modelica-worker.py")),
                                       str(root), str(root)], capture_output=True, text=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("Truth integrity failure", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
