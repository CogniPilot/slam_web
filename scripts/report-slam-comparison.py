"""Build a portable report from raw run receipts; never substitute missing runs."""

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "evaluation", Path(__file__).with_name("evaluate-slam-comparison.py")
)
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)
ap = argparse.ArgumentParser()
ap.add_argument("runs", type=Path)
ap.add_argument("inputs", type=Path)
ap.add_argument("output", type=Path)
args = ap.parse_args()
args.output.mkdir(exist_ok=True, parents=True)
modelica = json.loads((args.runs / "modelica-original-evaluation.json").read_text())
truth = json.loads((args.inputs / "ground-truth.json").read_text())
summary = {
    "status": "measured reference-capture comparison; not a scalability or superiority claim",
    "runs": [],
    "nativeWorkerReplays": [],
    "modelica": [
        {k: v for k, v in s.items() if k != "samples"} for s in modelica["scenes"]
    ],
}
for run in sorted(args.runs.iterdir()):
    if (
        run.is_dir()
        and run.name.startswith("modelica-worker-")
        and (run / "receipt.json").exists()
    ):
        subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("evaluate-modelica-worker.py")),
                str(args.inputs),
                str(run),
                str(args.runs / "modelica-original-evaluation.json"),
            ],
            stdout=subprocess.DEVNULL,
            check=True,
        )
        result = json.loads((run / "evaluation.json").read_text())
        result["run"] = run.name
        summary["nativeWorkerReplays"].append(result)
    if (
        not run.is_dir()
        or not (run / "receipt.json").exists()
        or "smoke" in run.name
        or run.name.startswith("modelica-worker-")
    ):
        continue
    if (run / "stella-map.msg").exists():
        subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("inspect-stella-map.py")),
                str(run / "stella-map.msg"),
                str(run / "stella-map-summary.json"),
            ],
            stdout=subprocess.DEVNULL,
            check=True,
        )
    subprocess.run(
        [
            sys.executable,
            str(Path(__file__).with_name("evaluate-slam-comparison.py")),
            str(args.inputs / "ground-truth.json"),
            str(run),
            "--manifest",
            str(args.inputs / "manifest.json"),
            "--output",
            str(run / "evaluation.json"),
        ],
        stdout=subprocess.DEVNULL,
        check=True,
    )
    result = json.loads((run / "evaluation.json").read_text())
    receipt = result.pop("runReceipt")
    data = {
        k: v
        for k, v in receipt.items()
        if k not in ["commands", "rosEnvironment", "hostLoadSamples"]
    }
    loads = [sample["loadAverage"][0] for sample in receipt.get("hostLoadSamples", [])]
    data["hostLoadOneMinuteRange"] = [min(loads), max(loads)] if loads else None
    if (run / "stella-map-summary.json").exists():
        result["finalMapSnapshot"] = json.loads(
            (run / "stella-map-summary.json").read_text()
        )
    result["runtime"] = data
    result["run"] = run.name
    scene = result["scene"]
    times = set(result["validPoseTimes"])
    original = next(s for s in modelica["scenes"] if s["scene"] == scene)
    samples = [s for s in original["samples"] if s["time"] in times]
    scene_truth = {
        round(t["time"], 6): t for t in truth["samples"] if t["scene"] == scene
    }
    result["modelicaOnSameValidTimestamps"] = evaluation.metrics(
        samples, scene_truth, len(scene_truth)
    )
    optimized_times = set(result["optimizedPoseTimes"])
    result["modelicaOnSameOptimizedTimestamps"] = evaluation.metrics(
        [s for s in original["samples"] if s["time"] in optimized_times],
        scene_truth,
        len(scene_truth),
    )
    summary["runs"].append(result)
    if run.name.startswith("stella-city-"):
        subprocess.run(
            [
                sys.executable,
                str(Path(__file__).with_name("analyze-stella-drift.py")),
                str(args.inputs),
                str(run),
            ],
            stdout=subprocess.DEVNULL,
            check=True,
        )
        result["driftAnalysis"] = {
            k: v
            for k, v in json.loads((run / "drift-analysis.json").read_text()).items()
            if k != "series"
        }


def number(value, digits=3):
    return "unavailable" if value is None else f"{value:.{digits}f}"


def span(values, digits=3):
    if not values:
        return "unavailable"
    return (
        number(values[0], digits)
        if min(values) == max(values)
        else f"{min(values):.{digits}f}–{max(values):.{digits}f}"
    )


def repeated_runs(estimator, scene):
    return [
        r
        for r in summary["runs"]
        if r["scene"] == scene
        and (
            ("-shared-r" in r["run"])
            if estimator == "rtabmap"
            else r["run"].startswith("stella-")
        )
    ]


summary["repeatCounts"] = {
    estimator: {
        scene: len(repeated_runs(estimator, scene)) for scene in ["city", "warehouse"]
    }
    for estimator in ["rtabmap", "stella"]
}
summary["referenceRepeatSetComplete"] = all(
    count >= 5
    for scenes in summary["repeatCounts"].values()
    for count in scenes.values()
)
summary["nativeWorkerRepeatCounts"] = {
    scene: sum(r["receipt"]["scene"] == scene for r in summary["nativeWorkerReplays"])
    for scene in ["city", "warehouse"]
}
summary["nativeWorkerRepeatSetComplete"] = all(
    count >= 5 for count in summary["nativeWorkerRepeatCounts"].values()
)
first_pair = []
for scene in ["city", "warehouse"]:
    native = next(
        (
            r
            for r in summary["nativeWorkerReplays"]
            if r["run"] == f"modelica-worker-{scene}-r1"
        ),
        None,
    )
    stella = next(
        (r for r in summary["runs"] if r["run"] == f"stella-{scene}-r1"), None
    )
    if native and stella:
        native_p95 = native["postInitializationLatencyMs"]["p95"]
        stella_p95 = stella["steadyStatePoseLatencyMs"]["p95"]
        comparison = (
            "higher"
            if native_p95 > stella_p95
            else "lower"
            if native_p95 < stella_p95
            else "equal"
        )
        first_pair.append(
            f"{scene}: Modelica p95 {native_p95:.2f}ms is {comparison} than stella {stella_p95:.2f}ms"
        )


text = [
    "# Preliminary same-capture SLAM results",
    "",
    (
        "These are adapter smoke workloads: two 60.6 s synthetic routes, 304 frames each, 424×240 at 5 Hz. "
        "They are not scalability evidence. All 608 RGB/depth pairs were hash checked and deterministic "
        "registration was repeated with identical output. Ground truth is evaluator-only."
    ),
    "",
    (
        "The Modelica rows are the original raw RGB-D+IMU capture. RTAB-Map uses the same RGB images "
        "and registered depth, with no IMU. Different modalities and incomplete tracking prohibit "
        "an efficiency/superiority ranking. Modelica state availability includes inertial prediction; "
        "it is not equivalent to successful visual tracking."
    ),
    "",
    "## ROS2 runs",
    "",
    "| Run/config | Valid online poses | Initial ATE m | SE(3) ATE m | Final optimized ATE m | Pose p95 ms | Sampled peak RSS MiB | Loop events |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
]
for run in summary["runs"]:
    runtime = run["runtime"]
    odometry = run["onlineOdometry"]
    graph = run["optimizedGraph"]
    policy = runtime.get("mapPolicy", "every-frame")
    policy += (
        "; filtered by official exporter lost flags"
        if runtime["estimator"].startswith("stella")
        else "; covariance sentinel filter"
    )
    latency = run["poseLatencyMs"] or {}
    feature = (
        "ORB + pinned FBoW"
        if runtime["estimator"].startswith("stella")
        else "GFTT/BRIEF6"
    )
    text.append(
        f"| {run['run']}: {feature}, {policy} | {odometry['matched']}/{odometry['expected']} | "
        f"{number(odometry['initialPoseAlignedAteRmseMeters'])} | {number(odometry['se3AlignedAteRmseMeters'])} | "
        f"{number(graph['se3AlignedAteRmseMeters'])} ({graph['matched']}poses) | {number(latency.get('p95'), 2)} | "
        f"{runtime['sampledPeakRssKiB'] / 1024:.1f} | {run['loopClosuresReported'] if run['loopClosuresReported'] is not None else 'unavailable'} |"
    )
text += [
    "",
    (
        "Low error on a short tracked subset must be read together with coverage. "
        "Missing/invalid odometry is retained as failure, never a zero-error pose. "
        "Loop events are reported detections, not verified true closures or precision/recall."
    ),
    "",
    "## Repeated runs under ordinary shared load",
    "",
    "| Estimator/scene | Completed repeats | Valid frames range | SE(3) ATE range m | Pose p95 range ms | Observed replay Hz range |",
    "|---|---:|---:|---:|---:|---:|",
]
for estimator, scene in [
    (e, s) for e in ["rtabmap", "stella"] for s in ["city", "warehouse"]
]:
    repeats = repeated_runs(estimator, scene)
    if not repeats:
        continue

    text.append(
        f"| {estimator}/{scene} | {len(repeats)}/5 | {span([r['onlineOdometry']['matched'] for r in repeats], 0)} | "
        f"{span([r['onlineOdometry']['se3AlignedAteRmseMeters'] for r in repeats])} | "
        f"{span([r['poseLatencyMs']['p95'] for r in repeats], 2)} | {span([r['observedReplayHz'] for r in repeats])} |"
    )
text += [
    "",
    (
        "Per-run receipts retain CPU affinity, actual thread count and sampled host load. "
        "Requested pacing is 5 Hz; observed pacing is reported rather than assumed. "
        "The first partial repeated-run group is not a completed five-repeat result."
    ),
    "",
    "## Original Modelica capture (RGB-D+IMU)",
    "",
    "| Scene | State frames | Visual updates accepted | Translation-only initial ATE m | SE(3) ATE m | Modelica call p95 ms | Final loop edges |",
    "|---|---:|---:|---:|---:|---:|---:|",
]
for row in summary["modelica"]:
    text.append(
        f"| {row['scene']} | {row['reportedStateFrames']}/{row['expected']} | {row['visualObservationAcceptedFrames']} | "
        f"{number(row['initialPoseAlignedAteRmseMeters'])} | {number(row['se3AlignedAteRmseMeters'])} | "
        f"{row['stepCallMs']['p95']:.2f} | {row['finalLoopEdges']} |"
    )
text += [
    "",
    "## Dispatch-to-pose timing on the current shared machine",
    "",
    "| Estimator / scene | Runs | Latency sample scope | Post-init p50 ms | Post-init p95 ms | Sampled peak RSS MiB |",
    "|---|---:|---|---:|---:|---:|",
]
for estimator in ["rtabmap", "stella"]:
    for scene in ["city", "warehouse"]:
        runs = repeated_runs(estimator, scene)
        if not runs:
            continue
        text.append(
            f"| {estimator} / {scene} | {len(runs)} | {'official exporter lost mask' if estimator == 'stella' else 'covariance-valid frames only'} | "
            f"{span([r['steadyStatePoseLatencyMs']['p50'] for r in runs], 2)} | "
            f"{span([r['steadyStatePoseLatencyMs']['p95'] for r in runs], 2)} | "
            f"{span([r['runtime']['sampledPeakRssKiB'] / 1024 for r in runs], 1)} |"
        )
for scene in ["city", "warehouse"]:
    runs = [r for r in summary["nativeWorkerReplays"] if r["receipt"]["scene"] == scene]
    if not runs:
        continue
    text.append(
        f"| Modelica published worker / {scene} | {len(runs)} | all303 post-init state responses | "
        f"{span([r['postInitializationLatencyMs']['p50'] for r in runs], 2)} | "
        f"{span([r['postInitializationLatencyMs']['p95'] for r in runs], 2)} | "
        f"{span([r['receipt']['sampledPeakRssKiB'] / 1024 for r in runs], 1)} |"
    )
text += [
    "",
    (
        "These timings use the same logical boundary: dispatch of an already-prepared sensor frame to receipt of its pose callback. "
        "ROS uses DDS; the native row uses the unchanged production client and exact published Chromium154 worker, including postMessage transfer and response. "
        "The initializer is separate for every row; post-init excludes that first input only and does not assert a JIT warmup fixed point. "
        "Source images, source timestamps and IMU intervals are preserved; scene rendering and physics are excluded. "
        "All runs use two-CPU affinity and ordinary shared load. The native tree includes Chromium/renderer/worker; ROS rows include estimator process groups and launchers. "
        "All reported callback percentiles are recomputed by one NumPy-linear helper from retained per-frame samples; raw runner receipts retain their original diagnostics. "
        "ROS timing includes DDS delivery, synchronization, tracking and the return callback, not just an internal tracking timer. "
        "Chromium-tree RSS is not directly comparable with native process-group RSS; sums can double-count shared pages. "
        "Different tracking masks, modalities and resource scopes still prohibit a simple speed/memory ranking."
    ),
    "",
    (
        "The fresh native replay is checked against the original trajectory; per-run maximum differences and full pose/RPE scores are retained in summary.json. "
        "Native repeats are listed at their actual completed count, including an incomplete set if this revision precedes completion."
    ),
    "",
    "First-pair post-initialization comparison: " + "; ".join(first_pair) + ". "
    "These are observed callbacks under the stated conditions, not a controlled superiority claim.",
    "",
    "## Stella city drift check",
    "",
]
for run in summary["runs"]:
    if run["run"] == "stella-city-r1":
        drift = run["driftAnalysis"]
        text.append(
            f"The first city run logs {drift['trackingLostLogCount']} tracking losses, {drift['resetLogCount']} resets, "
            f"{drift['successfulRelocalizationLogCount']} successful relocalizations and {drift['newMapCount']} initial map creation. "
            "The following fixed-initial-pose errors and largest adjacent steps distinguish accumulated error from a single logged restart; they do not establish a root cause."
        )
        text.extend(["", "| Time s | Position error m |", "|---:|---:|"])
        for point in drift["errorAtTenSecondIntervals"]:
            text.append(f"| {point['time']:.1f} | {point['positionErrorMeters']:.3f} |")
        text.extend(
            [
                "",
                "| Largest pose step time s | Estimated step m | True step m |",
                "|---:|---:|---:|",
            ]
        )
        for step in drift["largestAdjacentSteps"]:
            text.append(
                f"| {step['time']:.1f} | {step['estimatedStepMeters']:.3f} | {step['truthStepMeters']:.3f} |"
            )
text += [
    "",
    (
        "Modelica call time is not comparable with ROS callback latency. Its capture did not export "
        "per-frame orientation or process RSS; its initial-alignment ATE is translation-only, not a rigid pose alignment. "
        "Global SE(3) position alignment remains valid. Logical WASM state "
        "size is not reported as process memory."
    ),
    "",
    "## Matched availability masks",
    "",
    "| ROS run | Shared frames | ROS odometry SE(3) ATE m | Modelica same-frame SE(3) ATE m |",
    "|---|---:|---:|---:|",
]
for run in summary["runs"]:
    common = run["modelicaOnSameValidTimestamps"]
    text.append(
        f"| {run['run']} | {common['matched']} | {number(run['onlineOdometry']['se3AlignedAteRmseMeters'])} | "
        f"{number(common['se3AlignedAteRmseMeters'])} |"
    )
text += [
    "",
    "| Optimized graph run | Shared nodes | ROS graph SE(3) ATE m | Modelica same-node SE(3) ATE m |",
    "|---|---:|---:|---:|",
]
for run in summary["runs"]:
    common = run["modelicaOnSameOptimizedTimestamps"]
    text.append(
        f"| {run['run']} | {common['matched']} | {number(run['optimizedGraph']['se3AlignedAteRmseMeters'])} | "
        f"{number(common['se3AlignedAteRmseMeters'])} |"
    )
text += [
    "",
    "This controls the missing-frame mask, not the different sensor modalities.",
    "",
    "## Configuration and limitations",
    "",
    (
        "- Pinned nix-ros-overlay 814d97b0; ROS 2 Jazzy; RTAB-Map core/wrapper 0.23.7. "
        "The compiled binary reports GFTT/BRIEF (6) as its feature default."
    ),
    (
        "- Every-frame mapping overrides DetectionRate=0, LinearUpdate=0 and AngularUpdate=0. "
        "Upstream-default runs retain 1 Hz, 0.1 m and 0.1 rad. Exact sync and queue 20 are adapter settings."
    ),
    (
        "- ORB (2) was tried first and lost tracking after initialization in the 15-frame smoke. "
        "It is retained in the raw evidence; no best-of selection is concealed."
    ),
    (
        "- City-r1 was the bring-up run without CPU affinity and without a final graph service export. "
        "Later runs bind replay/estimators to two CPUs. Internal thread counts and sampled CPU/RSS "
        "are retained in summary.json. Two CPUs does not mean only two threads."
    ),
    (
        "- The stella dependency compilation ran concurrently during initial bring-up. "
        "Timing/resource rows retain the recorded contention and load. The repeated-run table states completion explicitly. "
        "A matched-modality workload and an agreed quality band remain necessary for a performance claim."
    ),
    (
        "- Registration projects co-located source pixel footprints into RGB optics, uses nearest axial Z "
        "for overlaps, preserves invalid zeros and introduces no interpolated depth. "
        "The 5 cm baseline belongs to the disparity-noise model, not camera translation."
    ),
    (
        "- Registered sensor metadata hash: c78b7df933dcfe16484b9face69db0664eb6b95631530abefd55f6b2cfa4ef2b. "
        "Registration-only first-run p95 = 2.075 ms; separate full offline preparation (hash/read/write included) "
        "repeat wall = 3.157 s for 608 frames. Neither is silently included in cached ROS callback latency."
    ),
    (
        "- stella uses the official RGB-D run_slam executable, default ORB settings and pinned FBoW vocabulary. "
        "Its final TUM trajectory excludes frames marked lost by the backend; online availability is masked to those timestamps. "
        "Stella final-frame trajectories and RTAB-Map final graph-node poses have different export scopes. "
        "Final retained map edges are exported separately; unavailable historical loop events are not reported as zero."
    ),
    "",
    "## Reproduction",
    "",
    (
        "Build scripts/ros2-comparison-env.nix with Nix flakes enabled and the official ros.cachix.org cache. "
        "Use the resulting bin/python3 to run scripts/run-rtabmap-comparison.py. "
        "Supply sealed sensor inputs, one scene, a new output directory and --ros-env. "
        "For stella, build scripts/stella-comparison-env.nix and pass --estimator stella with the pinned vocabulary. "
        "The evaluator/report runs separately in scripts/slam-comparison-evaluator-env.nix with ground-truth.json and its sealed manifest. "
        "Full raw receipts, failed attempts, trajectories and source pins accompany the private work-safe handoff; "
        "portable summary.json contains the scored outcomes."
    ),
    "",
]
(args.output / "results.md").write_text("\n".join(text))
(args.output / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(args.output / "results.md")
