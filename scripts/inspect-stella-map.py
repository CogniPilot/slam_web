"""Decode the official final map snapshot; do not infer historical loop events."""

import argparse
import hashlib
import json
from pathlib import Path

import msgpack

parser = argparse.ArgumentParser()
parser.add_argument("map", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
raw = args.map.read_bytes()
data = msgpack.unpackb(raw, raw=False, strict_map_key=False)
keyframes = data["keyframes"]
edges = set()
for identity, keyframe in keyframes.items():
    for other in keyframe["loop_edges"]:
        edges.add(tuple(sorted((int(identity), int(other)))))
result = {
    "scope": "final retained map snapshot, not historical detection events",
    "sha256": hashlib.sha256(raw).hexdigest(),
    "databaseBytes": len(raw),
    "keyframes": len(keyframes),
    "landmarks": len(data["landmarks"]),
    "finalLoopEdges": len(edges),
    "loopEdges": [{"from": a, "to": b} for a, b in sorted(edges)],
}
args.output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
