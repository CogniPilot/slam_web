# Full-size pose-graph WASM storage refusal

The unchanged `ModelicaPoseGraph` production root refuses native preparation:
`native whole-program scratch exceeds 64 MiB`. Preparation takes 2.733 s,
with about 705 MiB peak process-tree RSS. No optimizer module issues and no
numerical assertion runs. This is a full-SLAM compilation blocker.

Compiler: paired Rumoca 0.10.2 / `7e8ec61d2adf`; compiler WASM SHA256
`444f029ee3bc57e47c260f72192288f3d9238d7159f1abda809637bfc816b5ef`.
Production source SHA256:
`c93b6acbbe1f8f699fd6f79bb5bfbcf8f80dffb2830ee6666426a98751785932`.
The production compiler pin and Modelica math remain unchanged.

The diagnostic roots in
[PoseGraphStorage.mo](../tests/compiler-probes/fixtures/PoseGraphStorage.mo)
call the actual production functions with all 128 node and 256 edge slots.
Their runtime limits retain the production defaults, including 48 PCG
iterations, eight backtracks and eight optimizer iterations where applicable.

| Root | Preparation | Issued scratch bytes | Module bytes |
| --- | ---: | ---: | ---: |
| `PoseGraphLinearizeStorage` | 4.628 s | 3589592 | 137816 |
| `PoseGraphPCGStorage` | 2.373 s | 11484928 | 152650 |
| `PoseGraphStepStorage` | 2.366 s | 15759056 | 278459 |
| `PoseGraphRunStorage` | 2.040 s | 15963256 | 244114 |
| `PoseGraphValidationStorage` | 9.340 s | 178496 | 752288 |
| `ModelicaPoseGraph` | 2.733 s, refused | exceeds 64 MiB | none |

The table records preparation controls, not substitute optimizer paths.
Validation and the iteration loop both issue independently. This narrows the
failure to their composition in `OptimizeModelicaPoseGraph`, including guarded
publication; it does not establish which compiler allocation causes the limit.
Rumoca needs per-frame storage evidence and a lifetime-safe storage fix.
Reducing capacities, removing guards or merely raising the limit would not
establish usable memory or correct execution.

Frozen source snapshots and actual reports are in
`dev/artifacts/modelica-pose-graph-native-2026-10-07/`:

- `source.mo` / `prepare.json`: complete optimizer refusal.
- `storage-source.mo` / `linearize.json`, `pcg.json`: two-root control snapshot,
  SHA256 `a2d8f70117d564b1853913dbceed423b930466d16c013423f3704b8aaeee3e81`.
- `step-source.mo` / `step.json`: three-root snapshot,
  SHA256 `cf5c33fa6a134fe7e1ac426663a0e81f4fa46092e55596f3bfb8979e47921d0a`.
- `run-source.mo` / `run.json`: current four-root snapshot,
  SHA256 `1f7dbf492ae3b588559d2e930c165238e111d9df1d2f1c1a52a1475c72ef4788`.
- `validation-source.mo` / `validation.json`: production plus
  `PoseGraphValidationStorage.mo`, SHA256
  `ced043bdc8aa664f515fd54dc3c1debed1d5b90dd10673374d0a4f90a005f7ce`.

Large issued artifacts and logs remain under
`$HOME/scratch/slam_web/tmp/pose-graph-native-2026-10-07/`.
Each probe ran through `rumoca-bounded-run.mjs`, limited to 120 s, 8 GiB RSS,
a 16 GiB available-memory reserve and two low-priority CPU cores.

After compilation succeeds, the existing
[optimizer gate](../tests/compiler-probes/modelica-pose-graph.test.ts), with
`RUMOCA_POSE_GRAPH_ARTIFACT`, must verify the complete issued optimizer:
nonlinear rotated loops, correlated information, full storage, fixed gauge,
invalid-input rollback, recovery and source reload. Passing OMC reference
controls does not replace that WASM gate.

## Numerical execution of the iteration kernel

The actual `PGRun` module now passes nine native and nine static Chromium worker
execution cases. The native test also compares its eight-pose result against
the independent quaternion/finite-difference dense optimizer. The dense case
uses every one of the 128 nodes and 256 edges, with noncommuting rotations,
correlated information and reverse edges; it converges to known geometry within
1e-4 and lowers the independent objective from 1.827 to about 7.05e-19.
The 128-pose drifted loop lowers its objective from 384.14 to 0.09988.

Both input storage lanes stay readonly. The gauge is exact; stationary poses
stay exact; masked NaN padding and extreme inactive i64 endpoints are ignored.
One versus eight typed iteration budgets changes the real solve. Recovery,
reset and JSON reload reproduce identical output bytes; stale source refuses.
The browser test serves static files only and executes WASM in a worker.

The separately issued validation component passes 15 native cases against an
independent LDL/BFS admissibility oracle: full256 constraints, sparse endpoints,
invalid masks, invalid endpoints, disconnected nodes, reflected rotations,
asymmetric/singular/indefinite/nonfinite information, disabled NaNs and recovery.
All 512 typed endpoint outputs remain in bounds and valid active endpoints are
exact. This does not qualify their combined optimizer or atomic publication.

Gate: `tests/compiler-probes/modelica-pose-graph-run-native.test.ts`, using
`RUMOCA_POSE_GRAPH_RUN_ARTIFACT` and `RUMOCA_POSE_GRAPH_VALIDATION_ARTIFACT`.
Browser probe: `dev/probe-native-pose-graph-run-browser.mjs`.
Receipts: `run-numerical.json`, `validation-numerical.json`, `run-browser.json`
in the evidence directory above.

## Generated-code performance

Warm original-module medians are about 544 ms for the eight-pose loop,
1362 ms for the dense128/256 graph and 4.08 ms for a stationary graph under
shared host load. A checked 30-second evaluation-only interval executes 22
dense solves. These are CPU WASM kernel timings, not simulation throughput.

An actual `perf` capture uses the monotonic clock and lies wholly inside that
interval. Its 991 samples have no lost-event records; all periods remain in
the denominator, including three unknown leaves. `memmove` accounts for 35.49%
of sampled leaf cycles, the WASM copy wrapper 1.14%, and WASM function28 53.14%.
The event inventory also records 991 throttle and 990 unthrottle events; this
is sampled attribution, not a CPU-utilization measurement. The generic
`dev/summarize-perf-evaluation.mjs` checks clock, process, sample inventory,
phase containment and trace hashes.

Copy instrumentation retains every original call and copy, checks every output
bit against the unmodified executable, and verifies both input lanes readonly:

| Case | Copy calls | Logical copied bytes |
| --- | ---: | ---: |
| Eight-pose loop | 11983306 | 30388223272 |
| Dense128/256 | 9893647 | 27387125288 |
| Stationary graph | 12388 | 182717504 |

In function28, sites171/174 at original WAT lines45533/45573 each copy a full
6144-byte vector 1191168 times for the eight-pose loop: 7318536192 logical bytes
per site. In the dense graph those sites each run 529664 times. Stationary
function35 still copies 73728-byte matrices per slot, including disabled
slots. These give the compiler agent concrete immutable-capture, array-update
and inactive-domain regressions. Logical bytes are not measured DRAM traffic.
The app does not rewrite the issued module for execution.

`dev/probe-native-pose-graph-run-runtime.mjs` provides the `copies` and
`performance` probes. Original traces, maps and WAT remain under
`$HOME/scratch/slam_web/profiles/pose-graph-native-2026-10-07/`; compact receipts
and frozen proof sources remain in the evidence directory. No performance fix
or complete browser SLAM integration is claimed here.
