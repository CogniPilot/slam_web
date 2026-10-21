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
parser.add_argument("original", type=Path, nargs="?", help="Optional historical native trajectory for replay parity")
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
) if args.original else None
original_by_time = {round(s["time"], 6): s for s in original["samples"]} if original else None
samples = []
visual_samples = []
differences = []
keyframe_times = {}
max_retained = 0
verified_early = []
for row in rows:
    estimate = row["result"]["estimate"]
    sample = {
        "time": row["time"],
        "position": [estimate[k] for k in ["x", "y", "z"]],
        "quaternionWxyz": estimate["quaternion"],
    }
    samples.append(sample)
    if estimate.get("diagnostics", {}).get("observationAccepted") == 1:
        visual_samples.append(sample)
    keyframes = estimate.get("poseGraph", {}).get("keyframes", [])
    max_retained = max(max_retained, len(keyframes))
    for keyframe in keyframes:
        if "time" in keyframe:
            keyframe_times.setdefault(keyframe["id"], keyframe["time"])
    # Diagnostic evidence only: verified proposals may still fail graph admission,
    # and their geometric correctness is not independently established here.
    for candidate in estimate.get("loopClosure", {}).get("candidates", []):
        reference_time = keyframe_times.get(candidate["referenceId"])
        if row["time"] >= 300 and reference_time is not None and reference_time <= 60 and candidate.get("verified"):
            verified_early.append({"time": row["time"], "referenceTime": reference_time, **candidate})
    if original_by_time is not None:
        differences.append(
            float(
                np.linalg.norm(
                    np.array(sample["position"])
                    - original_by_time[round(row["time"], 6)]["position"]
                )
            )
        )
last_pose = None
if samples:
    first, last = samples[0], samples[-1]
    first_truth, last_truth = truth[round(first["time"], 6)], truth[round(last["time"], 6)]
    align = evaluation.rotation(first_truth["bodyQuaternionWxyz"]) @ evaluation.rotation(first["quaternionWxyz"]).T
    offset = np.array(first_truth["bodyPosition"]) - align @ first["position"]
    position_error = align @ last["position"] + offset - last_truth["bodyPosition"]
    angle_error = evaluation.rotation(last_truth["bodyQuaternionWxyz"]).T @ align @ evaluation.rotation(last["quaternionWxyz"])
    last_pose = {"time": last["time"], "positionErrorMeters": float(np.linalg.norm(position_error)),
                 "orientationErrorRadians": float(np.arccos(np.clip((np.trace(angle_error)-1)/2, -1, 1))),
                 "scope": "Last available pose after rigid initial-pose alignment; not proof of return localization or complete mission"}
stage_rows = []
for row in rows[1:]:
    timing = row["timings"]
    native = timing.get("nativeStages")
    if native is not None:
        stage_rows.append({"time": row["time"], "roundTripMs": timing["roundTripMs"], "workerMs": timing["workerMs"],
                           "entryMs": sum(stage["entryMs"] for stage in native),
                           "carryMs": sum(stage["carryMs"] for stage in native),
                           "carryBytes": sum(stage["carryBytes"] for stage in native)})
result = {
    "schema": 1,
    "receipt": receipt,
    "poseMetrics": evaluation.metrics(samples, truth, len(truth)),
    "visualPoseMetrics": evaluation.metrics(visual_samples, truth, len(truth)),
    "lastAvailablePose": last_pose,
    "mapRetention": {"uniqueObservedKeyframeIds": len(keyframe_times), "maxRetainedKeyframes": max_retained,
                     "earlyPlaceDefinition": "reference acquisition <=60s, proposal observed >=300s",
                     "verifiedEarlyProposals": verified_early,
                     "scope": "Candidate verification diagnostics only; graph acceptance and independent false-closure validation remain required"},
    "maxPositionDifferenceFromOriginalMeters": max(differences)
    if differences
    else None,
    "visualObservationAcceptedFrames": sum(
        row["result"]["estimate"].get("diagnostics", {}).get("observationAccepted") == 1
        for row in rows
    ),
    "scope": receipt.get("runtime", "published worker")+"; scene rendering/physics excluded; initializer separate",
    "hostStageBreakdown": {"frames": len(stage_rows),
                           "percentiles": {key: evaluation.percentiles([r[key] for r in stage_rows]) for key in ["roundTripMs", "workerMs", "entryMs", "carryMs"]},
                           "totals": {key: sum(r[key] for r in stage_rows) for key in ["roundTripMs", "workerMs", "entryMs", "carryMs", "carryBytes"]},
                           "scope": "Entry and carry are nested inside native step, worker and round trip; do not add nested intervals. Entry includes internal compiled state handling. Research instrumentation overhead included."} if stage_rows else None,
    "postInitializationLatencyMs": evaluation.percentiles(
        [row["timings"]["roundTripMs"] for row in rows[1:]]
    ),
    "postInitializationLatencySamples": max(0, len(rows) - 1),
    "percentileMethod": "NumPy linear interpolation",
}
(args.run / "evaluation.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
