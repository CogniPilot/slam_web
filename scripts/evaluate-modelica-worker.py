"""Score the real published worker replay separately from the original capture."""

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
parser = argparse.ArgumentParser()
parser.add_argument("inputs", type=Path)
parser.add_argument("run", type=Path)
parser.add_argument("original", type=Path)
args = parser.parse_args()
seal = json.loads((args.inputs / "manifest.json").read_text())
raw = (args.inputs / "ground-truth.json").read_bytes()
if hashlib.sha256(raw).hexdigest() != seal["groundTruthSha256"]:
    raise ValueError("Truth integrity failure")
receipt = json.loads((args.run / "receipt.json").read_text())
rows = json.loads((args.run / "poses.json").read_text())
truth = {
    round(t["time"], 6): t
    for t in json.loads(raw)["samples"]
    if t["scene"] == receipt["scene"]
}
original = next(
    s
    for s in json.loads(args.original.read_text())["scenes"]
    if s["scene"] == receipt["scene"]
)
original_by_time = {round(s["time"], 6): s for s in original["samples"]}
samples = []
differences = []
for row in rows:
    estimate = row["result"]["estimate"]
    sample = {
        "time": row["time"],
        "position": [estimate[k] for k in ["x", "y", "z"]],
        "quaternionWxyz": estimate["quaternion"],
    }
    samples.append(sample)
    differences.append(
        float(
            np.linalg.norm(
                np.array(sample["position"])
                - original_by_time[round(row["time"], 6)]["position"]
            )
        )
    )
result = {
    "schema": 1,
    "receipt": receipt,
    "poseMetrics": evaluation.metrics(samples, truth, len(truth)),
    "maxPositionDifferenceFromOriginalMeters": max(differences)
    if differences
    else None,
    "visualObservationAcceptedFrames": sum(
        row["result"]["estimate"].get("diagnostics", {}).get("observationAccepted") == 1
        for row in rows
    ),
    "scope": "production client dispatch to published worker response; scene rendering/physics excluded; initializer separate",
    "postInitializationLatencyMs": evaluation.percentiles(
        [row["timings"]["roundTripMs"] for row in rows[1:]]
    ),
    "postInitializationLatencySamples": max(0, len(rows) - 1),
    "percentileMethod": "NumPy linear interpolation",
}
(args.run / "evaluation.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
