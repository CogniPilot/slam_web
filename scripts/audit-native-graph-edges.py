"""Evaluator-only residuals of recorded native graph measurements against truth."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("evaluation", Path(__file__).with_name("evaluate-slam-comparison.py"))
evaluation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evaluation)


def edge_residual(edge, reference, current):
    """Source convention: [Ri'*(pj-pi)-u, Log(D'*Ri'*Rj)], not SE3 log."""
    ri = evaluation.rotation(reference["bodyQuaternionWxyz"])
    rj = evaluation.rotation(current["bodyQuaternionWxyz"])
    translation = ri.T @ (np.array(current["bodyPosition"]) - reference["bodyPosition"]) - edge["translation"]
    error = np.asarray(edge["rotation"], dtype=float).reshape(3, 3).T @ ri.T @ rj
    angle = float(np.arccos(np.clip((np.trace(error) - 1) / 2, -1, 1)))
    if angle >= np.pi - 1e-3:
        raise ValueError("Rotation residual is outside the source chart")
    scale = .5 if angle < 1e-6 else angle / (2 * np.sin(angle))
    attitude = scale * np.array([error[2, 1] - error[1, 2], error[0, 2] - error[2, 0], error[1, 0] - error[0, 1]])
    residual = np.r_[translation, attitude]
    covariance = np.asarray(edge["covariance"], dtype=float).reshape(6, 6)
    if not np.isfinite(residual).all() or not np.isfinite(covariance).all() or not np.allclose(covariance, covariance.T, rtol=1e-10, atol=1e-12):
        raise ValueError("Invalid residual/covariance")
    np.linalg.cholesky(covariance)
    return {"translationErrorMeters": float(np.linalg.norm(translation)), "rotationErrorRadians": angle,
            "normalizedSquaredResidual": float(residual @ np.linalg.solve(covariance, residual))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", type=Path)
    parser.add_argument("run", type=Path)
    args = parser.parse_args()
    seal = json.loads((args.inputs / "manifest.json").read_text())
    raw = (args.inputs / "ground-truth.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != seal["groundTruthSha256"]:
        raise ValueError("Truth integrity failure")
    receipt = json.loads((args.run / "receipt.json").read_text())
    truth = {row["index"]: row for row in json.loads(raw)["samples"] if row["scene"] == receipt["scene"]}
    audit, seen = [], set()
    for row in json.loads((args.run / "poses.json").read_text()):
        for step in row["timings"].get("nativeStages", []):
            for edge in step.get("newGraphMeasurements", []):
                if edge["id"] in seen or edge["kind"] not in [1, 2]:
                    raise ValueError("Unexpected edge identity/kind")
                seen.add(edge["id"])
                reference, current = truth[edge["referenceEpoch"]], truth[edge["currentEpoch"]]
                if not reference["time"] < current["time"] <= row["time"] + 1e-6:
                    raise ValueError("Edge acquisition chronology mismatch")
                audit.append({"id": edge["id"], "kind": edge["kind"], "referenceTime": reference["time"],
                              "currentTime": current["time"], **edge_residual(edge, reference, current)})
    groups = {}
    for kind, label in [(1, "sequential"), (2, "loop")]:
        subset = [edge for edge in audit if edge["kind"] == kind]
        groups[label] = {"count": len(subset), **{key: evaluation.percentiles([edge[key] for edge in subset])
                           for key in ["translationErrorMeters", "rotationErrorRadians", "normalizedSquaredResidual"]}}
    result = {"truthSha256": seal["groundTruthSha256"], "summary": groups, "edges": audit,
              "scope": "Posthoc evaluator-only residuals under the source body-frame product-residual convention. Covariance-normalized values are descriptive; Gaussian coverage and general false-closure rejection are not established."}
    (args.run / "edge-audit.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"summary": groups, "scope": result["scope"]}, indent=2))


if __name__ == "__main__":
    main()
