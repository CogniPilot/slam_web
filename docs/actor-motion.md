# Editable Modelica actor motion

[ActorMotion.mo](../models/Scene/ActorMotion.mo) owns the complete six-actor stadium
route and absolute animation-clock mathematics formerly computed in
`src/world-actors.ts`. Current runtime code dispatches this source through the
Modelica math worker and supplies its frames to Three.js. Renderer, worker-RPC,
saved-project and hardware-browser checks pass. No host trajectory fallback or
production compiler-pin change is introduced.

The input `sampleTime` is the committed simulation time, expressed in seconds.
It may move backward or repeat during seek/replay; the source has no state to
accumulate. Each of `east`, `north`, `sceneYaw`, `distance` and `walkTime` is a
six-element output array, ordered as pedestrian 1/2/3 then traffic car 1/2/3.
The editable source retains every original speed, route offset, half-length,
turn radius and pedestrian phase, plus the 0.85 animation-clock rate.

| Output | Rendering use |
| --- | --- |
| `east[i]`, `north[i]` | Scene position `(east, 0, -north)` |
| `sceneYaw[i]` | Existing `atan2(east tangent, -north tangent)` scene rotation |
| `distance[i]` | Signed travel distance without the route offset; drives wheel rendering |
| `walkTime[i]` | Absolute authored walk-clock time, including phase |

Three.js retains asset normalization, material/skin handling, transforms,
authored animation playback and wheel rendering. Low-detail visibility chooses
the named actor subset while preserving the source's full six-actor batch;
the third pedestrian's absence must not shift car identities.

[ModelicaRuntimeMath](../src/modelica-runtime-math.ts) optionally accepts actor
source as its fifth constructor argument and exposes `actors(time)`. The
[math worker](../src/modelica-runtime-math.worker.ts) always constructs the actor
session from the persisted sensor source and accepts `{type:'actors',time}`.
A missing or malformed ActorMotion model fails initialization explicitly and
releases every session created during that attempt. The
[frame adapter](../src/modelica-actor-motion.ts) validates finite sampled time
and exactly six finite values in each array at renderer/worker boundaries.
Actor sampled time may be negative, repeated or rewound; a separate monotonic
internal session clock advances without entering the trajectory equations.

The production-WASM adapter test and existing sensor/evaluation test pass
together: two files, four tests. They verify complete frames against a separate
actual Modelica session, replay, source edits, monotonic dispatch, invalid input
refusal, constructor cleanup and boundary validation. The bounded process took
9.78 seconds and observed 1284680 KiB peak aggregate RSS; TypeScript checks also
pass.

The completed [integration record](../dev/modelica-actor-motion-integration-verification.json)
also records six renderer/asset, RPC and project tests, two final sensor-RPC
tests, the production build and two hardware-browser checks on NVIDIA RTX 3090
with ANGLE WebGL 2. The browser checks prove that all six Modelica actor poses
reach the viewer and RGB-D renderer unchanged, with timestamps equal to the
committed 90 Hz simulation timestamp. An editable first-pedestrian speed
doubles its travel distance while every other actor remains bit-identical;
the edited source persists through save/reload and replay. Invalid frames fail
before camera acquisition. Three.js keeps presentation near 30 FPS during
held processing and main-thread stalls.

The [integrated performance record](../dev/modelica-actor-motion-performance.json)
measures 120 frames of the Modelica inertial-propagation workload with RGB-D
Harris detection, city/high detail, traffic and pedestrians, daytime lighting,
synchronous GPU readback and no LiDAR. It averages 21.774 ms per complete frame,
or 0.5092 times realtime; the viewer reports 30.49 FPS. Mean node times are
13.898 ms for sensor acquisition, 1.243 ms for physics, 3.282 ms for detection,
0.657 ms for inertial propagation and 0.577 ms for evaluation. Browser CPU
deltas average 1.669 active cores. The perf capture contains 323 samples with
none lost; the sensor-worker CPU profile attributes 882 ms exclusively to
`readPixels` across the sampled run.

This run used browser CPUs 4/5 while a compiler task used CPUs 6/7 on the same
machine. Sequential shared-machine measurements do not isolate a causal actor
speedup. The profile measures inertial propagation rather than full SLAM;
full SLAM remains pending and the requested 10 times realtime target is unmet.

A subsequent [resource verification](../dev/modelica-actor-motion-resource-verification.json)
uses the strengthened watchdog, which includes detached browser descendants
and verifies process identities before terminating owned work. It measures
2,049,692 KiB peak owned RSS and 24.582 ms/frame (0.4508 times realtime), with
the viewer at 30 FPS. An independent detached-memory control confirms that the
guard detects excess RSS and removes its own child. This is a sampled RSS
guard, not a kernel cgroup limit. Both shared-machine profiles remain valid;
their timing variation cannot establish a causal speedup or regression.

The production compiler rejected dynamic `mod` before execution, so the final
editable Modelica source states the same signed remainder and positive wrap
with `floor` equations. Every field retains its own bounded `for` family. The
test oracle independently implements the original signed-remainder route and
does not import the renderer or supply production math.

The historical source-only [verification record](../dev/modelica-actor-motion-verification.json) reports
the actual pinned compiler `0.10.0` / `e1e7783f1fb4`. Its unchanged six-actor
probe passes 11070 output comparisons over 369 complete calls. It covers every
route segment midpoint and boundary, ±1e-7 metres around those boundaries,
negative and positive cycles, repeated times, exact replay/reset and source
edits to speed, geometry and animation rate. Scene-yaw differences are checked
modulo two pi because `atan2` can return equivalent ±pi values at signed zero;
positions and clocks are checked directly. Maximum numerical error was
1.14e-13. Its `runtimeIntegrated:false` describes that source-probe checkpoint;
completed integration and profiling records are linked above.

The final measured cold source/session preparation was 681.1 ms; preparing the
edited source took 181.1 ms. Complete `set_inputs`/`advance_to`/`state_json` calls
averaged 0.244 ms, with a 9.58 ms maximum. This includes JSON parsing for the
complete batch and excludes assets, Three.js rendering, worker transport and
full SLAM. The bounded process took 6.03 seconds overall and observed 771440 KiB
peak aggregate RSS, under an 8 GiB cgroup/RSS limit and a 120-second deadline on
two CPUs. These are source-migration proofs, not integrated pipeline speedups.

To repeat the production-pin probe and emit a fresh verification record:

```sh
RUMOCA_ACTOR_REPORT=dev/modelica-actor-motion-verification.json \
  nix develop path:.#ci --command npx vitest run \
  --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-actor-motion.test.ts
```
