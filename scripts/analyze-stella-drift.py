"""Separate observable drift/steps from logged lost/relocalization events."""

import argparse
import importlib.util
import itertools
import json
import re
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
args = parser.parse_args()
scored = json.loads((args.run / "evaluation.json").read_text())
receipt = json.loads((args.run / "receipt.json").read_text())
rows = json.loads((args.run / "odometry.json").read_text())
truth = {
    round(t["time"], 6): t
    for t in json.loads((args.inputs / "ground-truth.json").read_text())["samples"]
    if t["scene"] == receipt["scene"]
}
valid = set(scored["validPoseTimes"])
samples = []
for row in rows:
    timestamp = round(row["stamp"] - 1, 6)
    if timestamp not in valid:
        continue
    pose = evaluation.pose_from_ros(row["message"]["pose"]["pose"])
    sample = evaluation.camera_flu_to_body(
        pose["position"], pose["quaternionWxyz"], receipt["cameraOriginBody"]
    )
    samples.append({"time": timestamp, **sample})
initial = samples[0]
r = (
    evaluation.rotation(truth[initial["time"]]["bodyQuaternionWxyz"])
    @ evaluation.rotation(initial["quaternionWxyz"]).T
)
t = np.array(truth[initial["time"]]["bodyPosition"]) - r @ initial["position"]
series = []
for sample in samples:
    aligned = r @ sample["position"] + t
    series.append(
        {
            "time": sample["time"],
            "position": aligned.tolist(),
            "truth": truth[sample["time"]]["bodyPosition"],
            "positionErrorMeters": float(
                np.linalg.norm(aligned - truth[sample["time"]]["bodyPosition"])
            ),
        }
    )
steps = []
for previous, current in itertools.pairwise(series):
    steps.append(
        {
            "time": current["time"],
            "estimatedStepMeters": float(
                np.linalg.norm(np.array(current["position"]) - previous["position"])
            ),
            "truthStepMeters": float(
                np.linalg.norm(np.array(current["truth"]) - previous["truth"])
            ),
            "errorBeforeMeters": previous["positionErrorMeters"],
            "errorAfterMeters": current["positionErrorMeters"],
        }
    )
log = (args.run / "process-0.log").read_text()
result = {
    "scene": receipt["scene"],
    "trackingLostLogCount": len(re.findall(r"tracking lost: frame", log)),
    "resetLogCount": len(re.findall(r"resetting system", log)),
    "newMapCount": len(re.findall(r"new map created", log)),
    "successfulRelocalizationLogCount": len(
        re.findall(r"relocalization succeeded \(frame=", log)
    ),
    "errorAtTenSecondIntervals": [
        min(series, key=lambda s: abs(s["time"] - timestamp))
        for timestamp in [0, 10, 20, 30, 40, 50, 60.6]
    ],
    "largestAdjacentSteps": sorted(
        steps, key=lambda s: s["estimatedStepMeters"], reverse=True
    )[:5],
    "series": series,
    "scope": "Fixed initial-pose alignment, not globally fitted; log counts are observed events, not a proven root cause",
}
(args.run / "drift-analysis.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "series"}, indent=2))
