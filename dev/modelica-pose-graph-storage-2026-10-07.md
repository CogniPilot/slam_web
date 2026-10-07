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
| `ModelicaPoseGraph` | 2.733 s, refused | exceeds 64 MiB | none |

These are preparation controls, not numerical acceptance or substitute
optimizer paths. The iteration-loop result narrows the failure to composition
above `PGRun`, including graph validation and guarded publication; it does not
establish which compiler frame or allocation causes the high-water mark.
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
