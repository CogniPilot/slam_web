# Rendered return-flight SLAM reference

The full Modelica reference passes a 6.4-second out-and-back flight with an
actual loop closure to its first keyframe and an accepted graph correction.
This qualifies the native reference replay, not browser SLAM or realtime speed.

The camera captures 97 synchronized RGB8/Z16 pairs at 848×480 and 15 Hz.
Rumoca WASM executes the Modelica quadrotor and controller; its actual 90 Hz
IMU supplies 576 held intervals. Three.js renders the city on the RTX 3090,
including shader depth noise. Actors are disabled. Separate oracle snapshots
are used only after execution to evaluate pose; the estimator receives neither
oracle poses nor supplied loop edges.

| Check | Result |
| --- | --- |
| Return to first keyframe | One verified kind2 graph edge |
| Accepted graph correction after closure | One |
| Visual updates refused | 10 |
| Refused frames with no selected features | Eight |
| Accepted observations after the first refusal | 19 |
| Position RMSE / maximum error | 0.147 / 0.355 m |
| Predeclared RMSE / maximum limits | 0.25 / 0.5 m |
| Reference assertions | 24 passed |

The return flight includes feature-poor views and a rejected eligible
innovation. Each refused update is compared against an independently executed
inertial-only batch using the same held samples. The complete State must match,
except image completion and consumption of an eligible attempted pair's epoch.
This checks map, graph, reference payload, covariance, vocabulary and ledger
preservation. Recovery, final mapping and actual closure are required. The
original short-flight contract remains strict and passes all 24 assertions.

Seventeen adversarial controls verify the refusal contract, including forbidden
state changes and missing or unjustified epoch consumption. The existing
complete-State comparator also passes its original 382 checks.

Capture with `SLAM_BROWSER_GPU=1 SLAM_CAPTURE_TRAJECTORY=revisit` and
`nix develop --no-update-lock-file .#ci --command node dev/capture-modelica-slam-flight-frames.mjs`.
Replay its output directory with `SLAM_REFERENCE_SCENARIO=revisit`,
`SLAM_REFERENCE_CFLAGS=-O2`, `SLAM_REFERENCE_SECONDS=540`, and `OMC_BIN`
pointing to OpenModelica, using the same Nix shell and
`node dev/check-modelica-rendered-flight-slam.mjs CAPTURE_DIRECTORY`.
The standalone refusal controls use
`node dev/check-modelica-complete-state-comparison.mjs --rendered-refusal`.

Durable receipts under `dev/artifacts/`:

- Capture: `modelica-rendered-flight-frames/flight-SHKlGg/`.
- Full replay: `modelica-rendered-flight-slam/rendered-flight-slam-sJrQ3D/`.
- Short-flight regression: `modelica-rendered-flight-slam/rendered-flight-slam-u3obn2/`.
- Refusal controls: `modelica-complete-state-comparison/complete-state-comparison-k8MF9L/`.
- Comparator regression: `modelica-complete-state-comparison/complete-state-comparison-OZ97HZ/`.

The replay took 424.7 seconds including compilation, input loading, diagnostic
replays and execution; this is not a kernel throughput benchmark. Peak aggregate
RSS was 2.07 GiB with over 37 GiB available. Large raw captures, MAT data and
generated executables remain under `$HOME/scratch/slam_web`. No production
algorithm, image rate, compiler pin or browser runtime was changed by this work.
