# Direct readback and physical-core scaling

Full browser SLAM still awaits Rumoca compiler fixes. Two new matched ABBA
campaigns help identify which performance changes are worth pursuing. Each
window processes150camera frames, or five simulated seconds, with848×480
RGB8/Z16 at30Hz,64-beam LiDAR at10Hz, IMU90Hz, GPS5Hz, moving cars/people,
medium city detail, and the independent visible viewer. The estimator is
Modelica inertial propagation. These are not full-SLAM benchmarks.

| Comparison | Baseline realtime factor | Candidate | Candidate/baseline |
| --- | ---: | ---: | ---: |
| Packed PBO vs direct attachment reads | 1.665× | 1.479× | 0.889 |
| Two vs four physical CPU cores | 1.383× | 1.919× | 1.387 |

The campaigns ran separately. Their baselines must not be combined into an
overall gain, and neither result establishes10x realtime or unrestricted
machine throughput.

## Direct readback rejected

The diagnostic candidate bypasses the PBO/getBufferSubData stage and calls
readPixels directly into each final typed attachment view. It preserves
capacity/layout checks and the prior pixel-pack-buffer binding. Only the
owned browser context receives the replacement; production source remains
unchanged.

Direct reads are11.1% slower in this campaign. Total browser CPU time per
five-second simulated interval increases from4.74 to5.08CPU seconds. The lower
average occupied-core count reflects slower completion, not less total work.
The existing packed path remains selected. No production readback change was
promoted.

Evidence: dev/artifacts/direct-sync-readback-2026-10-07/. The frozen runner and
candidate are under sources/. This fixture is diagnostic code, not an app
fallback or a numerical implementation.

## Four cores relieve diagnostic contention

The second campaign changes only the owned browser's CPU affinity. Both
baseline windows use physical cores8,9; both candidate windows use8,9,10,11.
The machine topology confirms four separate cores rather than sibling hardware
threads. Every observed browser thread's actual affinity is recorded and
checked before the capture window. Future threads inherit their parent's mask.

Both four-core windows outperform both two-core windows:

| Window | Physical-core budget | Realtime factor |
| ---: | ---: | ---: |
| A1 | 2 | 1.413× |
| B1 | 4 | 1.922× |
| B2 | 4 | 1.915× |
| A2 | 2 | 1.354× |

The mean throughput increase is38.7%. Approximate total browser CPU time for
the same simulated interval falls from5.61 to4.84CPU seconds, while average
occupied cores rises from1.55 to1.86 because the workload finishes sooner.
This is a sensitivity measurement on a shared host, not a new multithreaded
numerical solver or an application speedup. A normal browser is already free
to use the machine's available cores; the app does not impose the diagnostic
two-core mask. More cores also cannot substitute for efficient Modelica
lowering and state ownership.

Mean recorded physics-stage wall time falls from10.56 to7.99ms per camera
frame, and sensor-stage wall time from10.82 to7.75ms. These intervals include
worker scheduling/RPC and waiting; they do not isolate pure numerical execution
or GPU execution. CPU contention affects both stages, so future comparisons
must state the physical-core budget explicitly.

Evidence: dev/artifacts/browser-cpu-scaling-2026-10-07/. The original report
reuses a generic sentence about routed experimental code; its frozen runner
and affinity records establish that this campaign changes CPU affinity only.
The reviewer records that correction and the current runner uses a separate
scope description for CPU-budget tests.

## Browser-internal copies remain

Inspection of the exact Chromium154.0.8037.92 source shows that WebGL's
getBufferSubData forwards to a client implementation which allocates temporary
mapped memory, clears it, requests a service-side readback, waits, then copies
into the supplied destination. Providing a WASM view can eliminate an app-side
copy without removing these browser-internal operations. This source reading
does not assign an exclusive timing share to each operation.

Primary sources:
[Blink WebGL2 context](https://chromium.googlesource.com/chromium/src/+/154.0.8037.92/third_party/blink/renderer/modules/webgl/webgl2_rendering_context_base.cc),
[Chromium GLES2 client](https://chromium.googlesource.com/chromium/src/+/154.0.8037.92/gpu/command_buffer/client/gles2_implementation.cc).
Original source hashes and observed operation markers are retained in
chromium-copy-path.json under the CPU-scaling evidence directory. This supports
continuing with one packed transport and reusable compiler-owned raw-input
windows rather than calling the entire GPU-to-WASM path zero-copy.

## Validation and reproduction

Each campaign checks raw RGB/depth/LiDAR hashes at four warmup frames per
window, exact synchronized frame-clock progression over150timed frames,
hardware-reported graphics, and tracked production-source bookends. The reviewer
checks the original runner hashes, window records, source identities, parity,
affinity masks, physical-core identities and recomputed ratios:

    node dev/review-readback-and-cpu-scaling.mjs

Run dev/profile-camera-packing.mjs OUTPUT_DIRECTORY with
SENSOR_READBACK_EXPERIMENT=direct-sync or cpu-cores. The CPU experiment requires
explicit SENSOR_PROFILE_BASELINE_CPUS and SENSOR_PROFILE_CANDIDATE_CPUS lists
of at most four distinct physical cores. Use CHROMIUM_PATH and a short TMPDIR
under HOME/scratch through dev/rumoca-bounded-run.mjs. No CPU mask is stored in
portable application settings.

The direct campaign finishes in51.88seconds and CPU scaling in48.69seconds.
Both run at nice15, with a4GiB aggregate RSS limit and16GiB available-memory
reserve. Peak aggregate RSS stays below2,090,000KiB; available host memory
stays above55,740,000KiB. Resources.json in each evidence directory retains
the completion receipt. All owned jobs are terminal. Syntax checks and the
evidence review pass. No production algorithm, compiler pin, image resolution,
sensor rate or capture barrier changed.
