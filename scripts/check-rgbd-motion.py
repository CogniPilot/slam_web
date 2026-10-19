"""Evaluator-only cross-frame geometry diagnostic; never feeds truth to ROS.

Reproject measured depth through recorded body motion and the fixed camera mount.
Report residuals, coverage and an intentionally wrong-units control. Occlusions,
disparity noise and raster sampling remain visible; this is not a SLAM score.
"""

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location(
    "evaluation", Path(__file__).with_name("evaluate-slam-comparison.py")
)
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)
ap = argparse.ArgumentParser()
ap.add_argument("registered", type=Path)
ap.add_argument("inputs", type=Path)
ap.add_argument("output", type=Path)
args = ap.parse_args()
raw = (args.registered / "sensors.json").read_bytes()
manifest = json.loads((args.registered / "manifest.json").read_text())
if hashlib.sha256(raw).hexdigest() != manifest["sensorsSha256"]:
    raise ValueError("Sensor hash mismatch")
truth_raw = (args.inputs / "ground-truth.json").read_bytes()
truth_manifest = json.loads((args.inputs / "manifest.json").read_text())
if hashlib.sha256(truth_raw).hexdigest() != truth_manifest["groundTruthSha256"]:
    raise ValueError("Truth hash mismatch")
truth = {(r["scene"], r["index"]): r for r in json.loads(truth_raw)["samples"]}
frames = {(r["scene"], r["index"]): r for r in json.loads(raw)["sensorFrames"]}
E = np.array([[0, 0, 1], [-1, 0, 0], [0, -1, 0]], dtype=float)


def load_depth(frame):
    image = frame["images"]["depth"]
    data = (args.registered / image["path"]).read_bytes()
    if hashlib.sha256(data).hexdigest() != image["sha256"]:
        raise ValueError("Depth image hash mismatch")
    return (
        np.frombuffer(data, dtype="<u2").reshape(
            frame["calibration"]["height"], frame["calibration"]["width"]
        )
        * frame["imageLayout"]["depth"]["unitsMeters"]
    )


def compare(source, target, scale=1):
    k = source["calibration"]
    z = load_depth(source) * scale
    destination = load_depth(target)
    y, x = np.nonzero(z > 0)
    z = z[y, x]
    points = np.vstack(((x - k["cx"]) / k["fx"] * z, (y - k["cy"]) / k["fy"] * z, z))
    a = truth[source["scene"], source["index"]]
    b = truth[target["scene"], target["index"]]
    ra = evaluation.rotation(a["bodyQuaternionWxyz"])
    rb = evaluation.rotation(b["bodyQuaternionWxyz"])
    origin = np.array([k["forward"], 0, k["up"]])
    translation = (
        np.array(a["bodyPosition"])
        + ra @ origin
        - np.array(b["bodyPosition"])
        - rb @ origin
    )
    transformed = (rb @ E).T @ ((ra @ E) @ points + translation[:, None])
    positive = transformed[2] > 0
    transformed = transformed[:, positive]
    u = np.rint(k["fx"] * transformed[0] / transformed[2] + k["cx"]).astype(int)
    v = np.rint(k["fy"] * transformed[1] / transformed[2] + k["cy"]).astype(int)
    inside = (u >= 0) & (u < k["width"]) & (v >= 0) & (v < k["height"])
    measured = destination[v[inside], u[inside]]
    predicted = transformed[2, inside]
    paired = measured > 0
    residual = np.abs(measured[paired] - predicted[paired])
    coefficient = k["depthNoiseDisparityPx"] / (
        k["depthNoiseReferenceFx"] * k["baseline"]
    )
    noise_sigma = np.sqrt(
        (coefficient * measured[paired] ** 2) ** 2
        + (coefficient * predicted[paired] ** 2) ** 2
    )
    return {
        "pairedPixels": int(paired.sum()),
        "sourceValidPixels": len(z),
        "absoluteDepthResidualMeters": {
            f"p{p}": float(np.percentile(residual, p)) for p in [50, 75, 95]
        }
        if len(residual)
        else None,
        "approximateTwoFrameNoiseSigmaMetersP50": float(np.median(noise_sigma))
        if len(noise_sigma)
        else None,
        "approximateNoiseNormalizedResidual": {
            f"p{p}": float(np.percentile(residual / np.maximum(noise_sigma, 1e-9), p))
            for p in [50, 95]
        }
        if len(residual)
        else None,
    }


result = {
    "scope": "Evaluator-only consistency diagnostic; occlusion/noise remain; no estimator truth input",
    "registeredSensorsSha256": manifest["sensorsSha256"],
    "pairs": [],
}
for scene in ["city", "warehouse"]:
    for index in [0, 10, 50, 100, 200, 275]:
        source = frames[scene, index]
        target = frames[scene, index + 1]
        result["pairs"].append(
            {
                "scene": scene,
                "from": index,
                "to": index + 1,
                "correctUnits": compare(source, target),
                "wrongUnits1000x": compare(source, target, 1000),
            }
        )
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
