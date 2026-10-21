"""Independent TF-IDF/cosine reference for the deterministic CPU research fixture."""
import json
import math
import sys
from pathlib import Path

rows = []
for name in sys.argv[1:]:
    receipt = json.loads(Path(name).read_text())
    capacity = receipt["capacity"]
    histories = [set((i * 7 + j) % 256 for j in range(8)) for i in range(capacity)]
    idf = [1 + math.log((1 + capacity) / (1 + sum(w in h for h in histories))) for w in range(256)]
    for result in receipt["results"]:
        query = [0.0] * 256
        for i in range(350):
            query[i % result["queryWords"]] += 1
        query = [n / 350 for n in query]
        norm = sum((query[w] * idf[w]) ** 2 for w in range(256))
        scores = []
        for i, history in enumerate(histories):
            candidate_norm = 0.0
            dot = 0.0
            for w in range(256):
                weighted = (1 / 8 if w in history else 0.0) * idf[w]
                candidate_norm += weighted * weighted
                dot += weighted * query[w] * idf[w]
            score = min(1.0, max(0.0, dot / math.sqrt(max(norm * candidate_norm, 1e-24))))
            if score >= 0.35:
                scores.append((score, i + 1))
        scores.sort(key=lambda pair: (-pair[0], pair[1]))
        expected = [pair[1] for pair in scores[:4]]
        expected += [0] * (4 - len(expected))
        if expected != result["candidateIds"]:
            raise ValueError(f"Candidate mismatch in {name}: {expected} vs {result['candidateIds']}")
        if "candidateScores" in result:
            expected_scores = [pair[0] for pair in scores[:4]] + [0.0] * (4 - min(4, len(scores)))
            if any(abs(a - b) > 2e-12 for a, b in zip(expected_scores, result["candidateScores"])):
                raise ValueError(f"Candidate score mismatch in {name}")
        rows.append({"path": name, "capacity": capacity, "queryWords": result["queryWords"], "expectedIds": expected, "status": "pass"})
print(json.dumps({"scope": "Independent reference for seeded synthetic fixtures, not general retrieval equivalence", "checks": rows}, indent=2))
