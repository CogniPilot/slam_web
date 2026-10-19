"""Evaluator-only: reads sealed truth after a run. Metric SE(3), never Sim(3)."""

import argparse
import hashlib
import json
from itertools import pairwise
from pathlib import Path

import numpy as np


def percentiles(values):
    """One interpolation rule for ROS and published-worker callback samples."""
    if not values:
        return None
    values = np.asarray(values, dtype=float)
    if not np.isfinite(values).all():
        raise ValueError("Non-finite timing sample")
    return {
        f"p{p}": float(np.percentile(values, p, method="linear")) for p in [50, 95, 99]
    }


def rotation(q):
    q = np.asarray(q, dtype=float)
    if not np.isfinite(q).all() or abs(np.linalg.norm(q) - 1) > 1e-3:
        raise ValueError("Invalid quaternion")
    w, x, y, z = q / np.linalg.norm(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def fit_se3(source, target):
    a = np.asarray(source)
    b = np.asarray(target)
    u, _, vt = np.linalg.svd((a - a.mean(0)).T @ (b - b.mean(0)))
    correction = np.eye(3)
    correction[2, 2] = np.linalg.det(vt.T @ u.T)
    r = vt.T @ correction @ u.T
    return r, b.mean(0) - r @ a.mean(0)


def metrics(samples, truth, expected):
    pairs = [
        (s, truth[round(s["time"], 6)]) for s in samples if round(s["time"], 6) in truth
    ]
    if not pairs:
        return {
            "matched": 0,
            "expected": expected,
            "coverage": 0,
            "initialPoseAlignedAteRmseMeters": None,
            "se3AlignedAteRmseMeters": None,
        }
    estimated = np.array([s["position"] for s, t in pairs])
    actual = np.array([t["bodyPosition"] for s, t in pairs])
    initial_r = (
        rotation(pairs[0][1]["bodyQuaternionWxyz"])
        @ rotation(pairs[0][0]["quaternionWxyz"]).T
        if "quaternionWxyz" in pairs[0][0]
        else np.eye(3)
    )
    initial_t = actual[0] - initial_r @ estimated[0]
    errors_initial = (initial_r @ estimated.T).T + initial_t - actual
    r, t = fit_se3(estimated, actual)
    errors = (r @ estimated.T).T + t - actual
    result = {
        "matched": len(pairs),
        "expected": expected,
        "coverage": len(pairs) / expected,
        "initialPoseAlignedAteRmseMeters": float(
            np.sqrt(np.mean(np.sum(errors_initial**2, axis=1)))
        ),
        "initialAlignmentScope": "rigid initial pose"
        if "quaternionWxyz" in pairs[0][0]
        else "translation only; estimate orientation unavailable",
        "se3AlignedAteRmseMeters": float(np.sqrt(np.mean(np.sum(errors**2, axis=1)))),
        "alignmentScale": 1,
        "alignmentRotation": r.tolist(),
        "alignmentTranslation": t.tolist(),
    }
    trans = []
    angles = []
    intervals = []
    for (s0, t0), (s1, t1) in pairwise(pairs):
        dt = s1["time"] - s0["time"]
        if abs(dt - 0.2) > 1e-5:
            continue  # Gaps do not silently become adjacent-frame RPE.
        if "quaternionWxyz" not in s0 or "quaternionWxyz" not in s1:
            continue
        re0 = rotation(s0["quaternionWxyz"])
        re1 = rotation(s1["quaternionWxyz"])
        rt0 = rotation(t0["bodyQuaternionWxyz"])
        rt1 = rotation(t1["bodyQuaternionWxyz"])
        de = re0.T @ (np.array(s1["position"]) - s0["position"])
        dg = rt0.T @ (np.array(t1["bodyPosition"]) - t0["bodyPosition"])
        trans.append(float(np.linalg.norm(de - dg)))
        error = (rt0.T @ rt1).T @ (re0.T @ re1)
        angles.append(float(np.arccos(np.clip((np.trace(error) - 1) / 2, -1, 1))))
        intervals.append(dt)
    result.update(
        rpeIntervalSeconds=0.2,
        rpePairs=len(trans),
        rpeTranslationRmseMeters=float(np.sqrt(np.mean(np.square(trans))))
        if trans
        else None,
        rpeRotationRmseRadians=float(np.sqrt(np.mean(np.square(angles))))
        if angles
        else None,
    )
    return result


def pose_from_ros(pose):
    p = pose["position"]
    q = pose["orientation"]
    return {
        "position": [p[k] for k in ["x", "y", "z"]],
        "quaternionWxyz": [q[k] for k in ["w", "x", "y", "z"]],
    }


def quaternion_product(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return [
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ]


def optical_camera_to_body(position, quaternion, origin):
    mount = [0.5, -0.5, 0.5, -0.5]
    inverse_mount = [0.5, 0.5, -0.5, 0.5]
    body_quaternion = quaternion_product(
        quaternion_product(mount, quaternion), inverse_mount
    )
    return camera_flu_to_body(
        rotation(mount) @ np.array(position), body_quaternion, origin
    )


def camera_flu_to_body(position, quaternion, origin):
    position = np.array(position)
    origin = np.array(origin)
    body_position = position + origin - rotation(quaternion) @ origin
    return {"position": body_position.tolist(), "quaternionWxyz": quaternion}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("truth", type=Path)
    ap.add_argument("run", type=Path)
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    truth_raw = args.truth.read_bytes()
    manifest = json.loads(args.manifest.read_text())
    if hashlib.sha256(truth_raw).hexdigest() != manifest["groundTruthSha256"]:
        raise ValueError("Truth integrity failure")
    receipt = json.loads((args.run / "receipt.json").read_text())
    scene = receipt["scene"]
    truth = {
        round(t["time"], 6): t
        for t in json.loads(truth_raw)["samples"]
        if t["scene"] == scene
    }
    published = json.loads((args.run / "published.json").read_text())
    expected = len(truth)
    odometry = json.loads((args.run / "odometry.json").read_text())
    valid = {}
    for row in odometry:
        pose = row["message"]["pose"]
        s = pose_from_ros(pose["pose"])
        # rtabmap publishes all-zero quaternion and covariance9999 for tracking failures.
        try:
            rotation(s["quaternionWxyz"])
        except ValueError:
            continue
        if not np.isfinite(s["position"]).all():
            continue
        if pose["covariance"][0] >= 9999:
            continue
        if receipt.get("outputPoseFrame") == "camera FLU in initial camera frame":
            origin = np.array(receipt["cameraOriginBody"])
            s["position"] = (
                np.array(s["position"])
                + origin
                - rotation(s["quaternionWxyz"]) @ origin
            ).tolist()
        s["time"] = round(row["stamp"] - 1, 6)
        valid[s["time"]] = s
    infos = json.loads((args.run / "info.json").read_text())
    by_id = {
        row["ref_id"]: round(
            row["header"]["stamp"]["sec"]
            + row["header"]["stamp"]["nanosec"] * 1e-9
            - 1,
            6,
        )
        for row in infos
        if row["ref_id"] > 0
    }
    optimized = json.loads((args.run / "optimized-map.json").read_text())
    final = []
    invalid_graph = 0
    if optimized:
        for identity, pose in zip(
            optimized["graph"]["poses_id"], optimized["graph"]["poses"]
        ):
            if identity in by_id:
                sample = {"time": by_id[identity], **pose_from_ros(pose)}
                try:
                    rotation(sample["quaternionWxyz"])
                except ValueError:
                    invalid_graph += 1
                    continue
                if not np.isfinite(sample["position"]).all():
                    invalid_graph += 1
                    continue
                final.append(sample)
    final.sort(key=lambda s: s["time"])
    stella_trajectory = args.run / "stella-eval/frame_trajectory.txt"
    if receipt["estimator"].startswith("stella") and stella_trajectory.exists():
        for line in stella_trajectory.read_text().splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            values = [float(v) for v in line.split()]
            if len(values) != 8:
                raise ValueError("Malformed TUM trajectory")
            stamp, x, y, z, qx, qy, qz, qw = values
            sample = optical_camera_to_body(
                [x, y, z], [qw, qx, qy, qz], receipt["cameraOriginBody"]
            )
            sample["time"] = round(stamp - 1, 6)
            final.append(sample)
        final.sort(key=lambda s: s["time"])
    if receipt["estimator"].startswith("stella"):
        # A valid pose matrix may survive a failed tracking step. The official
        # trajectory exporter explicitly excludes frames flagged as lost.
        tracked_times = {s["time"] for s in final}
        valid = {
            timestamp: sample
            for timestamp, sample in valid.items()
            if timestamp in tracked_times
        }
    latencies = [
        row["latencyMs"]
        for row in odometry
        if row["latencyMs"] is not None and round(row["stamp"] - 1, 6) in valid
    ]
    steady_latencies = [
        row["latencyMs"]
        for row in odometry
        if row["latencyMs"] is not None
        and round(row["stamp"] - 1, 6) in valid
        and round(row["stamp"] - 1, 6) > 0
    ]
    unavailable = []
    gap = []
    for timestamp in sorted(truth):
        if timestamp not in valid:
            gap.append(timestamp)
        elif gap:
            unavailable.append(gap)
            gap = []
    if gap:
        unavailable.append(gap)
    report = {
        "schema": 1,
        "scene": scene,
        "truthSha256": hashlib.sha256(truth_raw).hexdigest(),
        "runReceipt": receipt,
        "onlineOdometry": metrics(
            sorted(valid.values(), key=lambda s: s["time"]), truth, expected
        ),
        "onlinePoseFilterPolicy": "valid matrix/covariance, filtered by the official exporter's lost flags"
        if receipt["estimator"].startswith("stella")
        else "valid quaternion and covariance below9999 sentinel",
        "optimizedGraph": metrics(final, truth, expected),
        "loopClosuresReported": len(
            {
                (row["ref_id"], row["loop_closure_id"])
                for row in infos
                if row["loop_closure_id"] > 0
            }
        ),
        "proximityDetectionsReported": len(
            {
                (row["ref_id"], row["proximity_detection_id"])
                for row in infos
                if row["proximity_detection_id"] > 0
            }
        ),
        "mapCallbackLatencyMs": percentiles(
            [row["_latencyMs"] for row in infos if row.get("_latencyMs") is not None]
        ),
        "poseLatencyMs": percentiles(latencies),
        "steadyStatePoseLatencyMs": percentiles(steady_latencies),
        "postInitializationLatencySamples": len(steady_latencies),
        "percentileMethod": "NumPy linear interpolation",
        "publishedInputs": len(published),
        "invalidOrMissingPoseInputs": len(published) - len(valid),
        "observedReplayHz": (len(published) - 1)
        * 1e9
        / (published[-1]["sentMonoNs"] - published[0]["sentMonoNs"])
        if len(published) > 1
        else None,
        "validPoseTimes": sorted(valid),
        "optimizedPoseTimes": [s["time"] for s in final],
        "invalidOptimizedGraphPoses": invalid_graph,
        "unavailableIntervals": [
            {"firstTime": g[0], "lastTime": g[-1], "frames": len(g)}
            for g in unavailable
        ],
        "limits": [
            "Single run is preliminary, not a scalability or speed ranking",
            "Initial reference with sentinel covariance excluded; missing tracking is retained in coverage",
            "Pose callback latency includes DDS and replay-side scheduling; image hashes checked before publish",
        ],
    }
    if receipt["estimator"].startswith("stella"):
        report["loopClosuresReported"] = None
        report["proximityDetectionsReported"] = None
        report["limits"].append(
            "Stella loop events are unavailable from the ROS pose interface; final TUM frame trajectory is scored when exported"
        )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
