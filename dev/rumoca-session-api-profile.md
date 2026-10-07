# Reusable Rumoca session read bottleneck

The app-side inertial WASM emitter was removed in favor of Rumoca's public
session. The migration exposed a compiler API cost. This diagnostic runs that
session directly, with no application worker, GPU or replacement integrator.
The compiler should fix the shared API; a one-off application shortcut is not
the requested architecture.

The pinned public compiler is 0.10.0, commit `e1e7783f1fb4`. The unchanged
`ModelicaInertial.mo` receives six held inputs at 180 Hz. Eight matched windows
use ABBA then BAAB ordering, 200 warmup frames and 4,000 measured frames per
window. Both read interfaces produce identical values for all 16 outputs over
128 initial frames, or 2,048 comparisons.

| Per frame, milliseconds | 16 scalar `get` calls | One complete snapshot, including JSON parse |
| --- | ---: | ---: |
| Input API | 0.0074 | 0.0044 |
| Solver advance | 0.0735 | 0.0544 |
| Output API | 0.1249 | 0.0219 |
| Complete measured loop | 0.2088 | 0.0812 |

These are diagnostic timings on a shared host, including timer overhead.
The solver timings also vary between windows; do not attribute the entire
total difference to the read API or claim a compiler speedup. The snapshot
is a comparator establishing the cost of repeated observations, rather than
a new application execution path.

The separate post-warmup V8 profile has 580 samples. Time-weighted ancestry
places 55.75% within `get`, 34.42% within `advance_to` and 2.11% within
`set_inputs`. Linux `perf` collected 615 samples with zero lost samples,
including initialization and both interfaces. Its JIT symbols and native
annotation were generated successfully using `perf record -k 1` and
`perf inject --jit`. That broader denominator differs from the V8 loop.
The public WASM lacks a function-name section; numbered functions cannot
be assigned Rust source identities from this evidence alone.

The current development source shows the reusable cause:
`BackendSimulationSession::get` calls `MeSimulationSession::visible_values`
for every scalar. That path performs a complete checked observation, obtains
the full output vector, builds a named map and includes applied inputs.
Reading sixteen cells therefore repeats the whole observation sixteen times.

The first generic fix should expose the existing `values_for` chain through
the common `SimulationSession` and WASM bindings. It should observe once and
return requested values, preserving output cardinality checks, evaluation
errors, name ordering, input overrides, unknown names and source edits.
Avoid adding a state cache until every input, advance, event, reset and
initialization invalidation is proven. Direct scalar allocation improvements
can follow separately. Neither change belongs in application equation code.

The first CPU-2 run was terminated after heavy host contention; it produced
no accepted timing report. A smaller successful run then established phase
timings, but its first JIT injection failed because the perf clock flag was
missing. Both outcomes remain recorded. The final run uses CPU 31, nice 15,
a 120-second/2-GiB process limit and a 16-GiB host memory reserve. Large raw
perf/JIT files stay under `$HOME/scratch/slam_web/profiles`.

This is a reusable API diagnosis. The compiler patch, merged-main tests,
browser acceptance and before/after measurements remain required. It does
not establish full SLAM or 10 times realtime.

The profiler now accepts an optional complete compiler package directory after
the output directory. It imports that package's JavaScript and matching WASM,
records both hashes and verifies all 2,048 initial output comparisons with
`Object.is`, including zero signs. Set `RUMOCA_PROFILE_READ_API=batch` to compare
sixteen scalar reads against the actual compiler `values_for` method. A package
without that method is rejected; the profiler never substitutes a snapshot for
the requested batch API.

```sh
RUMOCA_PROFILE_READ_API=batch RUMOCA_PROFILE_FRAMES=4000 \
  node dev/profile-rumoca-session-api.mjs \
  "$HOME/scratch/slam_web/profiles/session-api-batch" \
  "$HOME/scratch/slam_web/build/rumoca-reviewed/pkg"
```

A 128-frame smoke run with matching public 0.10.0 glue/WASM passes exact parity
and all eight measurement windows. The same old package correctly refuses batch
mode. This validates the profiling tool and its refusal contract, not the new
compiler API or a speed improvement. The longer historical profile above is
unchanged and remains specific to its archived compiler and script.
