# Persistent Schmidt driver overhead: measured review request

[Actual Node/V8 evidence](modelica-schmidt-session-profile-verification.json) compares the unchanged full-21 module `b57eed18…`, source `f8fe0faa…`, through `ModelicaSchmidtSession.advance` and direct NativeProgram state carry. Both use the same measured 90 Hz IMU trajectory, capture once, and then predict without reusing visual observations. All 388 retained cells and seven flags matched bitwise for 32 steps (12,416 state-cell comparisons, error zero).

Eight interleaved ABBA/BAAB windows, each with 32 warm calls and 100 measured calls, yielded:

| Complete driver | Mean per step | Window mean range |
|---|---:|---:|
| Persistent session | 1.72889 ms | 1.40012–1.95522 ms |
| Direct full-state carry | 1.12763 ms | 1.11316–1.14706 ms |

The observed difference is 0.60126 ms, or 53.3% over direct carry. The direct path intentionally lacks rollback protection, public snapshot isolation and repeated transport/state validation; it is a measurement baseline, not a safe replacement session. Shared-host single-CPU14/nice15 scheduling and short-window outliers remain relevant. For example, the separate instrumented session diagnostic had p50 1.34471 ms, p95 1.42014 ms and maximum 38.57088 ms. No particular GC, scheduler or JIT cause is established for that outlier.

Instrumentation was excluded from ABBA. The separate diagnostic measured session native evaluation at 1.12252 ms mean and non-evaluation work at 0.63746 ms mean. Direct input copies took 0.00807 ms and returned-state copies 0.03269 ms. Timers include their own overhead. The separate CPU profile counted only samples descending from `advance`, excluding owner construction: `advance` self 7.48%, `cells` 4.33%, `checked` 3.74% of that sampled subtree. These are CPU sample shares, not an allocation of blocked wall time. No GC samples occurred in that diagnostic window; this does not rule out GC elsewhere.

The bounded whole experiment completed in 4.814 seconds, peak RSS 391,940 KiB, below 120 seconds/4 GiB with a 16 GiB available-memory reserve. Raw windows, exact executed bundle, CPU profile, script/session snapshots and resource terminal are archived. This measures only the filter driver, not sensors, rendering, camera registration, mapping, loop closure or 10× realtime.

## Narrow proposed driver changes, pending review

Current `src/modelica-schmidt-session.ts` clones retained state at advance entry, copies each native output through `cells`, then `checked` clones the entire candidate again and recopies every state/config array. A returned `snapshot` performs another defensive clone. All these passes are correct, but the redundant internal copies are concrete candidates.

Split external snapshot normalization from internal successful-output collection. External create/restore must still validate schema/source/config, every finite cell, epoch/flag domains and array lengths, and own defensive copies. For a private candidate populated from actual native outputs, validate and copy each state/flag exactly once. Configuration validated at creation remains private and unchanged; it need not be cloned and rescanned at every interval. Never trust fixture expectations, omit output finiteness checks, reinterpret covariance validity in the host or publish partially checked state.

Retain commit-after-all-intervals and full memory rollback. A private reusable checkpoint buffer sized to the native memory can avoid allocating a fresh full-memory slice on each frame while still copying every byte before execution. Check memory buffer identity/length and reallocate safely if it changes; preserve all P/Y/scratch bytes on failure. Do not reduce rollback to Y or expose the checkpoint to callers. Public `snapshot` results remain independent copies, and reset/restore keep their current baseline/source/config semantics.

Reuse immutable default observation buffers and static transport descriptors only where ownership is explicit. Keep final-interval-only observation/capture, actual measured intervals, contiguous time validation, Modelica-owned epoch/pose decisions, and no interpreter retry after an admitted failure. These are representation/copy changes, not numerical code.

No driver optimization has been applied. A reviewed patch must pass existing actual Node and Chromium session controls, including multi-interval rollback, negative-prior rejection/recovery, all state fields/flags, source/config refusal, defensive snapshot mutation, JSON/IndexedDB restore and reset. Repeat the same interleaved complete-driver measurement with the exact module/trajectory before retaining any claimed improvement.

## Reviewed implementation and matched follow-up

The app-only change is now [verified separately](modelica-schmidt-session-optimization-verification.json).
It retains the original module, all state cells and numerical validation while
removing repeated internal clones and reusing the full-memory checkpoint.
NativeProgram's changed-buffer refusal remains authoritative; memory growth is
not supported or recovered by the driver. Five Node controls, actual Chromium
lifecycle controls and final TypeScript pass.

The primary improvement proof uses both archived original session `066ee55c…`
and current `225c28db…` in one process, with 300 warm calls each and eight
interleaved ABBA/BAAB windows. Old mean was 1.31359 ms, new mean 1.15071 ms:
12.4% lower elapsed time. All 388 retained cells and flags matched bitwise across
116,788 comparisons. This warm matched result, rather than the earlier separate
32-warm driver/direct means, establishes the retained isolated driver gain.
