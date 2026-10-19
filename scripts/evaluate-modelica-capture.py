"""Evaluate the already-recorded Modelica track; never label it a new replay."""

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
ap.add_argument("capture", type=Path)
ap.add_argument("inputs", type=Path)
ap.add_argument("output", type=Path)
args = ap.parse_args()
manifest = json.loads((args.inputs / "manifest.json").read_text())
truth_bytes = (args.inputs / "ground-truth.json").read_bytes()
if hashlib.sha256(truth_bytes).hexdigest() != manifest["groundTruthSha256"]:
    raise ValueError("Truth hash mismatch")
truth_rows = json.loads(truth_bytes)["samples"]
scenes = {}
for source in manifest["sourceFrames"]:
    raw = (args.capture / source["path"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("Capture frame hash mismatch")
    scene = source["path"].split("/")[0]
    row = json.loads(raw)
    scenes.setdefault(scene, []).append(row)
result = {
    "schema": 1,
    "status": "evaluation of original capture, not new offline run",
    "track": "original raw RGB-D + IMU, different modality from ROS RGB-D",
    "limits": [
        "No matched-modality performance ranking",
        "Step timings are recorded Modelica calls, not image-to-room/DDS latency",
        "Original capture did not export per-frame quaternion or process RSS",
        "WASM state bytes are logical state, not process memory",
    ],
    "scenes": [],
}
for scene, rows in scenes.items():
    truth = {round(t["time"], 6): t for t in truth_rows if t["scene"] == scene}
    samples = [
        {"time": r["time"], "position": r["position"]}
        for r in rows
        if np.isfinite(r["position"]).all()
    ]
    times = [
        r["diagnostics"]["stepMsTotal"]
        for r in rows
        if "stepMsTotal" in r["diagnostics"]
    ]
    result["scenes"].append(
        {
            "scene": scene,
            **evaluation.metrics(samples, truth, len(rows)),
            "samples": samples,
            "reportedStateFrames": len(samples),
            "visualObservationAcceptedFrames": sum(
                r["diagnostics"].get("observationAccepted", 0) == 1 for r in rows
            ),
            "stepCallMs": {
                f"p{p}": float(np.percentile(times, p)) for p in [50, 95, 99]
            },
            "finalKeyframes": rows[-1]["diagnostics"]["keyframes"],
            "finalLandmarks": rows[-1]["diagnostics"]["mapPoints"],
            "finalLoopEdges": rows[-1]["diagnostics"]["loopEdges"],
        }
    )
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
