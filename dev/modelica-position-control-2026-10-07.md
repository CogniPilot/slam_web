# Local library and position control

The app ships unmodified Modelica library packages from
`CogniPilot/modelica_models` main, revision
`93c5bca1439d7d43506ab63f7f2d5e4f23637605`. The snapshot contains 641 Modelica
sources; package ordering, license, notice and per-file hashes are retained in
`models/Libraries/CogniPilot`. No upstream tools or build outputs are included.

New projects save the complete editable library. The physics and estimator
workers and language server consume that workspace. Existing saved projects
retain their source snapshots. Updating the checked-in library uses
`scripts/sync-modelica-models.mjs CHECKOUT FULL_COMMIT_SHA`, which reads committed
Git blobs, including when the checkout has unrelated uncommitted work.

`LabQuadrotor` now connects the upstream log-linear position/velocity and
quaternion attitude controller to the upstream body-rate law and desaturating
motor allocator. Actual rotor dynamics drive the six-degree-of-freedom plant.
The old application PD controller and duplicate rigid-body/quaternion sources
are removed. Feedback currently comes from plant truth.

Keyboard/tour velocity commands advance a reference position and heading in
Modelica. `positionMode=1` selects explicit `targetPosition`, `targetVelocity`,
`targetAcceleration` and `targetHeading` inputs. This does not implement a
polynomial trajectory planner or connect SLAM estimates to flight control.

## Verification

- Nix default unit suite: 224 tests in 46 files pass.
- TypeScript and static production build pass.
- Actual Chromium production physics-worker test: 24 simulated seconds, targets
  `{2,-1,2.5}` and `{-1,1,1.5}`, final errors 0.07304 m and 0.07552 m. Finite
  pose/IMU, quaternion norm, rotor direction, held timestamp and reset checks
  pass. Initial displacement confirms motion through the motors, not a pose
  override. See `dev/check-position-control-browser.mjs`.
- Actual static-site tests: upstream control source has live diagnostics and
  edited gains survive save/reload; fresh desktop and phone visitors can start
  with Run alone. Both CI smoke shards pass on the exact updated build:
  21 tests pass and the compiler-candidate-only check is skipped.

## Remaining compiler defect

Periodic `sample(0,0.01)` events stop after 1 s on production Rumoca 0.10.0 and
reviewed 0.10.2/42729cb4f520. The position integral consequently freezes.
`PeriodicControllerClock.mo` reproduces this without library dependencies:
ticks at 0,0.1,0.5,1,1.1,2,3 s are 1,11,51,101,101,101,101; the final three must
be 111,201,301. The strict compiler regression fails at 1.1 s as expected.
The reusable runtime fix is requested in `dev/rumoca-agent-handoff.md`.

Tracking results do not qualify that sampled integral, efficient execution,
full browser SLAM or 10x realtime. The new controller still runs too slowly on
the existing interpreter; no JavaScript control-math workaround was added.

## Profile and evidence

An actual CPU/perf run of the pinned compiler measured 180 sensor endpoints:
`advance_to` accounts for 91.2% of 10.832 s, `state_json` 6.9%, setters 1.7%.
These are isolated, profiled physics timings under shared host load. Skipping
identical setter batches preserves all 25 public values, but demonstrates no
speedup. Stripped JIT symbols prevent attribution to specific Rust functions.

Exact library/source preimages, the production worker bundle, tracking receipt,
clock failure and profiles are retained locally under
`dev/artifacts/modelica-position-control-93c5bca-2026-10-07/`.
Its hash manifest verifies the retained files. The compiler agent has the
periodic scheduling request and source-bound profile in the shared handoff.
