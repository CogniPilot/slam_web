# CPU scaling probes, 2026-10-20

These are exploratory isolated-kernel measurements, not a mission-scale SLAM or
ROS replacement result. `summary.json` defines scope, concurrency, versions and
aggregation. Every process receipt and timing sample is retained under `raw/`.

| Kernel / fixture | Median per-process p50 | Range of per-process p95 |
| --- | ---: | ---: |
| One descriptor match, 350 active features | 25.024 ms | 25.051–25.777 ms |
| One descriptor match, 100 active features | 2.284 ms | 2.301–2.456 ms |
| Graph32, drifted chain + loop | 9.335 ms | 9.351–9.435 ms |
| Graph64, drifted chain + loop | 27.506 ms | 27.512–28.149 ms |
| Graph128, drifted chain + loop | 54.240 ms | 54.327–55.196 ms |
| BoW64, eight-word query | 16.520 ms | 14.714–26.221 ms |
| BoW1000, eight-word query | 23.416 ms | 18.521–42.252 ms |

Graph128 consumed all eight outer iterations; cost reduction is not convergence
certification. Matching excludes RANSAC. BoW combines assignment, history and
retrieval. The larger BoW tails appeared under shared load, including an owned
Vite build during part of that sweep. Retain this variation; do not infer a clean
system scaling ratio from these data. Linear memory excludes all other kernels,
mission descriptors, browser and host runtime. No memory-fit claim follows.

To reproduce the fixture calculations, install the repository's locked package
set and pinned Rumoca package. The observations used Node22.23.3, CPU affinity2,3
and the host configuration in `summary.json`. The locked CI shell separately uses
Node24; it is not the runtime of these measured Node probes. Use new scratch
output prefixes, never overwrite an issued receipt.

```sh
node scripts/compile-bow-capacity.mjs 64 "$HOME/scratch/slam_web/build/bow64"
taskset -c 2,3 node scripts/profile-bow-capacity.mjs "$HOME/scratch/slam_web/build/bow64" 64
node scripts/compile-slam-kernel.mjs graph 64 "$HOME/scratch/slam_web/build/graph64"
taskset -c 2,3 node scripts/profile-slam-kernel.mjs graph "$HOME/scratch/slam_web/build/graph64" 64
node scripts/compile-slam-kernel.mjs matching 350 "$HOME/scratch/slam_web/build/matching"
taskset -c 2,3 node scripts/profile-slam-kernel.mjs matching "$HOME/scratch/slam_web/build/matching" 350
python3 scripts/check-bow-fixture.py docs/evidence/environment-scale-cpu-r1/raw/bow*-timing.json
```

Repeat five fresh processes in the rotated serial order in `summary.json`.
BoW capacities are64/256/512/1000; graph capacities32/64/128. The research-only
schema89 consumer executes compiler-issued WASM. Application admission and the
canonical Modelica algorithms are unchanged. Source and module hashes bind each
receipt. `bow-independent-check.json` has40 checks of candidates/scores against
an independent TF-IDF/cosine reference on these fixtures; this is not general
retrieval equivalence. Flight and browser checks validate only the hallway
fixture and capture clock, not SLAM return localization.
