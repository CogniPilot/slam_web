# Mapping after refused keyframe registration

A fresh RTX 3090 capture contains 91 native 848×480 RGB8/Z16 frames and 270
held IMU intervals from the Rumoca quadrotor. The capture harness now creates
the `models/Vehicles` directory when freezing the reorganized plant source.

The original Modelica replay failed mapping at epoch 76. Frame binding, policy
and retrieval passed; sequential registration found 23 descriptor matches but
refused geometric consensus. Graph capture correctly refused the constraint.
That optional refusal also prevented subsequent ordinary map observations.

`RGBDCatalogFrame.Advance` now uses the existing observation owner when the
sequential consensus refuses. Catalog, graph and anchors remain unchanged;
normal candidate admission and rollback still apply. Diagnostics retain the
keyframe and sequential refusal reasons. `RGBDLocalizationCatalog.Publish`
binds a local reference to a catalog ID only after an actual insertion.
No registration thresholds or acceptance checks changed.

Validation in the pinned Nix environment:

- All 24 original extended-flight checks pass, including mapping at every frame.
- Estimated positions are bit-identical before and after the fix. The final
  map has 944 points instead of the stalled 847.
- Five full-capacity controls verify graph/catalog retention, old-anchor mapping,
  refusal receipts, corrupt-candidate rollback and absent-keyframe binding.
- Existing frame and publication regressions pass all 6 and 24 checks.
- All 215 unit tests and the production build pass.
- Installed Rumoca 0.10.0 parses the exact 59-file native composition.

Reference receipts and comparison are under
`dev/artifacts/modelica-capture-diagnostic-2026-10-07/`. The failing and passing
replays are respectively `rendered-flight-slam-3BIMrK` and
`rendered-flight-slam-c8pvdl` under `dev/artifacts/modelica-rendered-flight-slam/`.
Large inputs and native builds remain under HOME-derived scratch storage.

A bounded `perf` sample of the original native replay recorded 855 samples
with none lost. Generic OpenModelica array access and index calculation account
for 61.38% of sampled self cycles. This diagnostic reference includes independent
feature recomputation and validation; it does not measure Rumoca WASM or browser
throughput. Full browser SLAM and 10× realtime remain unqualified. The three-second
capture also does not qualify sustained accuracy or observed loop closure.

To repeat with an installed OpenModelica executable in `OMC_BIN`:

```sh
nix develop --no-update-lock-file .#ci
node dev/check-modelica-catalog-frame.mjs --tracking
SLAM_REFERENCE_SCENARIO=flight-extended SLAM_REFERENCE_CAPTURE_DIAGNOSTIC=1 \
  SLAM_REFERENCE_SECONDS=500 SLAM_REFERENCE_CFLAGS=-O2 \
  node dev/check-modelica-rendered-flight-slam.mjs \
  "$HOME/scratch/slam_web/tmp/flight-c1SpKm/output"
```
