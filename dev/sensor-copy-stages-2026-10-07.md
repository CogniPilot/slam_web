# Sensor fence and host-copy measurements

Full browser SLAM remains pending Rumoca compiler fixes. This pass separates
the existing sensor worker's fence wait from its host-copy API call. It adds
opt-in profiling only; production capture scheduling, image formats, rates,
packing and numerical execution are unchanged.

Thirty captures per condition used the hardware-reported RTX3090, a held
committed pose, medium detail, and an independent visible viewer. RGB8 and
Z16 remain848×480. Each profiled capture compares every raw RGB/depth byte,
and every LiDAR byte when enabled, against an uninstrumented capture at the
same pose. Physics time remains unchanged. These are diagnostic observations,
not matched flight-throughput measurements or CPU-utilization percentages.

GPU timer queries were disabled in the following measurements to avoid their
query/readiness overhead. Timed RPC completion excludes the subsequent parity
comparison but includes profiling and message handling.

| Readback | LiDAR | Mean RPC | Mean fence wait | Mean host-copy call |
| --- | --- | ---: | ---: | ---: |
| Synchronous | Off | 11.04ms | — | 7.04ms |
| Synchronous | On | 14.20ms | — | 9.10ms |
| Asynchronous | Off | 14.30ms | 8.84ms | 1.94ms |
| Asynchronous | On | 18.67ms | 10.09ms | 2.79ms |

Asynchronous capture performs the copy after a fence has signaled. Its fence
wait includes GPU/browser completion and event-loop scheduling; it is not pure
GPU execution time. There were about5.8polls per camera-plus-LiDAR capture.
The remaining2.79ms getBufferSubData call includes browser/driver mapping and
transport, not just memcpy. Synchronous copy time includes earlier completion
waits, so its9.10ms cannot be described as a pure transfer cost. Separate
conditions and a held pose do not establish a full-pipeline speed advantage.

This evidence makes both readback transport and polling/scheduling relevant
to the10x target. It does not justify changing production readback defaults.
The next transport experiment should measure completed-buffer mapping/copy
separately and compare any scheduling change in matched flight windows while
retaining the lockstep barrier and watching CPU usage.

## Rejected completion diagnostic

An initial option called gl.finish immediately before getBufferSubData and
recorded that API time under the label gpu-drain. Inspection of the exact
Chromium154.0.8037.92 source shows that Blink implements finish by calling
Flush. It does not provide the intended completion barrier. Therefore the
original gpu-drain/drainedBeforeCopy labels in the frozen experimental reports
are invalid descriptions, and their near-zero duration says nothing about
whether GPU work had completed.

The option has been removed from the profiler and runner. The runner explicitly
rejects the old experimental environment flag rather than silently ignoring
it. Its original sources and observations are retained for review, with this
correction; no performance improvement is claimed from that experiment.

Exact upstream implementation:
[Chromium154.0.8037.92 WebGL context](https://chromium.googlesource.com/chromium/src/+/154.0.8037.92/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc).
The source hash and relevant function are retained in chromium-finish.json.
The asynchronous fence measurement follows the
[WebGL2 getBufferSubData guidance](https://registry.khronos.org/webgl/specs/latest/2.0/).

## Validation and reproduction

Evidence: dev/artifacts/sensor-copy-stages-2026-10-07/. It includes the exact
executed profiler/runner,240raw-parity observations across the four original
conditions, the correction above, and20further successful captures using the
final code after removing the finish option. The reviewer checks source
identities, raw-parity results, completed fence records, and the unchanged
production sensor/compiler sources. TypeScript checking also passes.

Run node dev/review-sensor-copy-stages.mjs to review the retained evidence.
For a new capture, use dev/profile-current-sensor-worker.mjs OUTPUT_DIRECTORY
with SENSOR_READBACK_MODE=sync or async, SENSOR_PROFILE_HOST_ONLY=1, and
SENSOR_PROFILE_REPEATS=30. Omitting host-only retains the previous GPU timer
query behavior. Use CHROMIUM_PATH and a short TMPDIR under HOME/scratch,
through dev/rumoca-bounded-run.mjs.

The240capture run took49.58seconds and the final20capture run20.49seconds.
Both ran at nice15 on cores8,9 with a4GiB aggregate RSS limit and a16GiB
available-memory reserve. Peak aggregate RSS stayed below2,080,000KiB and
available host memory above58,670,000KiB. Completion receipts are retained
in resources.json; all owned jobs are terminal. No compiler pin, ABI limit,
Modelica algorithm, image fidelity or sensor cadence changed.
