# Longer rendered Modelica flight reference

The native reference now accepts a source-bound flight of up to 121 frames,
while retaining the original 13-frame contract by default. This extends
numerical validation of the actual Modelica implementation. Browser SLAM and
10× realtime remain unqualified; OpenModelica is an independent native test
compiler, not a runtime dependency or browser compilation fallback.

The new capture contains 91 synchronized 848×480 RGB8/Z16 frames over three
seconds, 270 held IMU intervals and 271 source snapshots. The actual Rumoca
quadrotor moves approximately 1.424 m and turns. Three.js produces the camera
bytes, including the existing GPU depth noise and dropout. The acquisition
uses 30 Hz camera and 90 Hz modeled IMU clocks. Raw IMU has no stochastic bias
or noise. Truth is retained separately and never enters the estimator.

Capture metadata and frozen acquisition sources are in
`artifacts/modelica-rendered-flight-frames/flight-OIdp94/`. Large raw images
remain in `$HOME/scratch/slam_web/tmp/flight-OIdp94/output/`; their original
hashes are checked before and after replay. Long captures avoid duplicating
these disposable bytes into every durable receipt. The OMC-only MAT transport
preserves every raw RGB byte and Z16 code exactly as a float64 mathematical
value. It now streams matrices to disk and independently decodes every cell.
This reference packaging is not a proposed WASM camera ABI.

The extended replay enables the actual Modelica graph-processing request.
The same state, chronology, mapping, feature, calibration and covariance
checks remain. Extended-only checks permit source-owned catalog and correction
revision growth and require both completed visual observations and reference
captures. The original short mode still requires exactly six observations,
six captures, catalog nextId=2 and no graph correction. Requesting graph
processing does not prove a rendered loop was found or closed.

Before executing the longer replay, the evaluator declared a maximum position
error of 0.5 m, position RMSE of 0.25 m, and at least 1 m of actual oracle
displacement. These checks apply to every published CSV evaluation row and
every captured frame. Missing, malformed or nonfinite outputs cannot pass.
Oracle evaluation happens after execution and does not alter Modelica inputs.
Passing this short moving-flight gate would not certify long-flight accuracy.

The generalized harness passes the original 24 checks. Its MAT and complete
published CSV are byte-identical to the preceding short reference:

- Previous receipt: `artifacts/modelica-rendered-flight-slam/rendered-flight-slam-bf0OwM/`.
- Generalized receipt: `artifacts/modelica-rendered-flight-slam/rendered-flight-slam-K4krbE/`.
- MAT SHA256: `f4e4e72b42b6665a490d634cac742ce568a88d1c1a00375f83071adb6c2137ba`.
- CSV SHA256: `e23193e609f2cbaf138f4329e64e2283e34858db88b7941bd83ff633696c4eb3`.

The first extended attempt, `rendered-flight-slam-VRK2tg`, reached update 71
before its 300-second guardian limit. Its status is `FAILED_OR_INCOMPLETE`;
there is no final accuracy verdict. Peak native aggregate RSS was 2,026,180 KiB,
with at least 54,631,340 KiB available host memory. The retained timeout is not
a numerical acceptance failure or a claim of compiler deadlock. A second
attempt uses a 500-second limit with unchanged images, algorithm and accuracy
limits. Both runs retain the 8 GiB RSS cap, 16 GiB host reserve, low priority
and CPU affinity 8,9. The extended-only accepted time range is at most 540 s;
short reference modes retain their 300 s maximum.

The second attempt, `rendered-flight-slam-pA2y6r`, finishes all 91 frames with
source bookends intact and a successful native simulation. It remains
`FAILED_OR_INCOMPLETE`: 23 of 24 Modelica checks pass, but check 18 fails.
Mapping accepts epochs 0–75 and refuses epochs 76–90; the retained map remains
at 847 occupied landmarks while localization continues. All 90 advances are
accepted, with 45 visual observations and 45 local reference captures. These
reference refreshes are distinct from graph keyframe insertion: the retained
catalog has two keyframes, with the second committed at epoch 48.

All three CSV output rows pass the predeclared position gate: maximum error
0.183330542 m, RMSE 0.086114343 m, and endpoint error 0.083555259 m. Oracle
maximum displacement is 1.424233558 m. Position accuracy alone does not make
this a passing SLAM reference. The native job takes 365.986 s including
compilation and independent validation, peaks at 2,004,896 KiB aggregate RSS,
and preserves at least 54,914,660 KiB available host memory. Both reference
jobs and the owned profiler are terminal.

The first refused map update coincides with the next graph-keyframe request:
estimated displacement from the last accepted keyframe is 0.546638 m at epoch
75 and 0.603903 m at epoch 76, crossing the authored 0.6 m capture threshold.
`RGBDCatalogFrame.Advance` chooses capture exclusively when requested; it does
not continue ordinary mapping if capture refuses. This identifies the branch
to investigate, not the precise retrieval/registration/graph refusal reason.
No admission threshold or rollback rule has been relaxed. A fix must preserve
old catalog/graph ownership and must never bind a reference birth to a merely
requested, uncommitted keyframe ID.

A ten-second perf sample of the first native replay contains 1,366 samples
and no lost samples. Generic OMC array indexing accounts for 56.42% of sampled
cycles, and `FastCircleScore` itself for 13.71%. Generated C retains five
temporary arrays and generic indexed accesses in that function. Call-chain
classification attributes 61.06% of sampled cycles to the independent,
unpruned feature-scoring check and 23.69% to the actual production advance
path; unresolved stacks remain separate. These are overlapping perspectives
on the same profile, not additive cost categories. The test intentionally
recomputes features and geometric diagnostics independently. Its total elapsed
time cannot represent production SLAM throughput, and this OMC profile does
not establish Rumoca WASM costs. Raw traces stay on scratch; bounded summaries,
hashes and the inspected C body are in
`artifacts/modelica-extended-flight-2026-10-07/`.

Reproduce using Node and an independently installed OpenModelica with the
Modelica 4.1.0 library. Set `OMC_BIN` to its executable; all build output and
expanded reference data stay under HOME-derived scratch storage:

```sh
SLAM_REFERENCE_SCENARIO=flight-extended \
SLAM_REFERENCE_CFLAGS=-O2 SLAM_REFERENCE_SECONDS=500 \
node dev/check-modelica-rendered-flight-slam.mjs \
  "$HOME/scratch/slam_web/tmp/flight-OIdp94/output"
```

The runner bounds native compilation and execution itself. For a fresh longer
GPU capture, set `SLAM_CAPTURE_FRAME_COUNT=91` when invoking
`dev/capture-modelica-slam-flight-frames.mjs`; its default remains 13. The
capture still requires hardware-backed Chromium and the running development
preview. Neither test adds numerical JavaScript, Python or a production
server. No production Modelica source, compiler pin or public adapter changed.
