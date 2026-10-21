import importlib.util
from pathlib import Path
import unittest

import numpy as np

spec = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-native-graph-edges.py"))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class EdgeAuditTests(unittest.TestCase):
    def test_body_frame_and_rotation_direction_with_nonidentity_reference(self):
        s = np.sqrt(.5)
        # Reference faces +Y; its local +X translation is world +Y.
        reference = {"bodyPosition": [10, 2, 1], "bodyQuaternionWxyz": [s, 0, 0, s]}
        current = {"bodyPosition": [11, 4, 1.5], "bodyQuaternionWxyz": [s, 0, 0, s]}
        edge = {"translation": [2, -1, .5], "rotation": np.eye(3).ravel().tolist(), "covariance": np.eye(6).ravel().tolist()}
        result = audit.edge_residual(edge, reference, current)
        self.assertAlmostEqual(result["translationErrorMeters"], 0)
        self.assertAlmostEqual(result["normalizedSquaredResidual"], 0)
        edge["translation"][0] += .3
        angle = .1
        edge["rotation"] = [np.cos(angle), -np.sin(angle), 0, np.sin(angle), np.cos(angle), 0, 0, 0, 1]
        result = audit.edge_residual(edge, reference, current)
        self.assertAlmostEqual(result["translationErrorMeters"], .3)
        self.assertAlmostEqual(result["rotationErrorRadians"], .1)
        self.assertAlmostEqual(result["normalizedSquaredResidual"], .1)

    def test_indefinite_covariance_is_rejected(self):
        pose = {"bodyPosition": [0, 0, 0], "bodyQuaternionWxyz": [1, 0, 0, 0]}
        edge = {"translation": [0, 0, 0], "rotation": np.eye(3).ravel().tolist(), "covariance": (-np.eye(6)).ravel().tolist()}
        with self.assertRaises(np.linalg.LinAlgError):
            audit.edge_residual(edge, pose, pose)


if __name__ == "__main__":
    unittest.main()
