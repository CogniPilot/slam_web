"""Compact preliminary hallway table; retain scope differences and failures."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("inputs", type=Path)
parser.add_argument("registered", type=Path)
parser.add_argument("runs", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
seal = json.loads((args.inputs / "manifest.json").read_text())
registered = json.loads((args.registered / "manifest.json").read_text())
if registered["sourceSensorsSha256"] != seal["sensorsSha256"]:
    raise ValueError("Registered inputs have a different source")
if hashlib.sha256((args.inputs / "ground-truth.json").read_bytes()).hexdigest() != seal["groundTruthSha256"]:
    raise ValueError("Truth integrity failure")
rows = []
for name, folder, native in [("Native Modelica (instrumented)", "hallway-native-stage-r1", True),
                              ("RTAB-Map", "hallway-rtabmap-r1", False), ("stella", "hallway-stella-r1", False)]:
    path = args.runs / folder
    receipt = json.loads((path / "receipt.json").read_text())
    score = json.loads((path / "evaluation.json").read_text())
    expected = seal["sensorsSha256"] if native else registered["sensorsSha256"]
    if receipt.get("sensorMetadataSha256", receipt.get("inputSha256")) != expected:
        raise ValueError("Run input hash mismatch: " + folder)
    metric = score["poseMetrics"] if native else score["onlineOdometry"]
    rows.append({"system": name, "run": folder, "inputSha256": expected,
                 "sensorMode": "raw RGB-D + IMU" if native else "registered RGB-D only",
                 "replayMode": receipt["mode"] if native else "paced5Hz, observed input rate retained in evaluation",
                 "posePolicy": "state availability; visual acceptance is a separate count" if native else score["onlinePoseFilterPolicy"],
                 "poseOrStateCount": metric["matched"], "expected": metric["expected"],
                 "initialPoseAlignedAteRmseMeters": metric["initialPoseAlignedAteRmseMeters"],
                 "se3AlignedAteRmseMeters": metric["se3AlignedAteRmseMeters"],
                 "poseCallbackP95Ms": score["postInitializationLatencyMs"]["p95"] if native else score["steadyStatePoseLatencyMs"]["p95"],
                 "mapCallbackP95Ms": None if native or score["mapCallbackLatencyMs"] is None else score["mapCallbackLatencyMs"]["p95"],
                 "summedProcessRssGiB": receipt["sampledPeakRssKiB"] / 1048576,
                 "sampledCpuSeconds": receipt["sampledCpuSeconds"], "resourceScope": receipt["resourceScope"],
                 "failure": receipt.get("failure"),
                 "evaluationSha256": hashlib.sha256((path / "evaluation.json").read_bytes()).hexdigest()})
result = {"status": "preliminary single-run comparison; no scalability or replacement proof",
          "sensorMetadataSha256": seal["sensorsSha256"], "truthSha256": seal["groundTruthSha256"],
          "rows": rows, "limits": [
              "Different sensor modes, depth processing and pose-availability policies; quality is not matched.",
              "Native is instrumented/unpaced; ROS runs are paced. Callback semantics and resource process scopes differ.",
              "Closed-loop replay does not qualify open-loop backlog/drop behavior. Node replay/resource-sampling overhead is excluded from estimator process groups.",
              "No numeric quality band was agreed; no advantage claim follows. All three outcomes and failures remain in evidence.",
              "Native failed early-place return qualification. Stella has large pose jumps; their cause is not established by the table.",
              "Real-world, multi-run and formal-verification acceptance remain outstanding."]}
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
