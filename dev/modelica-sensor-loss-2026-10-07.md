# Native RGB-D measurement loss and recovery

The full Modelica SLAM composition passes 32 reference checks for temporary
visual measurement loss during the captured quadrotor flight. This closes an
important qualification gap: an unusable camera measurement must not freeze
inertial prediction, invent landmarks, discard the retained reference, or
consume the same camera epoch twice.

The test uses the existing 13 native 848×480 RGB8/Z16 acquisitions and all 36
actual held IMU intervals from the Rumoca plant. Modelica deliberately replaces
the depth image at camera epoch 3 with zero codes, then replaces RGB at epoch 4
with a uniform value of 128. These are controlled test faults; the original
capture files remain unchanged. The images retain their full resolution and
separate optical calibrations. There is no resizing, image alignment, authored
IMU, pose injection, or host estimator calculation.

The [fixture](../tests/modelica/RGBDRenderedSensorLossAcceptance.mo) calls the
complete initialization and held-IMU SLAM functions. The State retains all
128 keyframes, 256 graph edges, 350 feature slots and 14,400 map slots.
It checks the following behavior:

- All 36 held IMU intervals complete, including the six during visual loss.
  The final accepted processing-step count is 37 including initialization.
- Each bad camera epoch completes once, with zero selected features, matches,
  visual corrections, reference captures and map updates. Repeating its batch
  refuses before processing and preserves the complete State.
- The entire map, its anchors, confidence and clocks stay unchanged during loss.
  Catalog, graph, vocabulary and pose view remain held; capture identities stay
  held while their processing-step ledger advances correctly.
- The retained visual reference survives both bad measurements. The complete
  returned localization estimator matches a separate image-disabled invocation
  using the same measured IMU holds. This tests separation of image publication
  from prediction; independent lower-level tests qualify the filter equations.
- Position/velocity covariance trace grows during both unavailable frames.
  The complete covariance/state validation gates continue to accept.
- The first normal acquisition, epoch 5, corrects against the retained epoch-2
  reference: 134 descriptor candidate matches and 103 registration inliers.
  The rest of the replay completes, with five visual corrections and five new
  references after initialization. The final map contains 731 occupied slots.

All 32 checks pass, with exact CSV schema, source/capture bookends and one replay
trace. The [bound review](artifacts/sensor-loss-2026-10-07/review.json) links the
immutable numerical receipt and current source identities. Production Modelica
is unchanged and still matches native source SHA256
`f3272ea69928df2fbb3030e1d289b83bf1d34dd8283782e4d153711fb1aa1841`.

To repeat this development reference check, provide OpenModelica with Modelica
4.1.0 installed, then run:

```sh
SLAM_REFERENCE_SCENARIO=sensor-loss SLAM_REFERENCE_SECONDS=300 \
  node dev/check-modelica-rendered-flight-slam.mjs \
  dev/artifacts/modelica-rendered-flight-frames/flight-p2gCED
```

`OMC_BIN` may select the reference executable. The existing flight scenario
remains the default. The reference helper's new `imageRequested` argument
defaults to its previous behavior. This developer-only runner packages exact
integer camera codes as MAT Real values for OMC; that transport is not the
browser raw-input ABI and does not qualify float32 or zero-copy WASM ingress.

The bounded compiler/reference job took 135.4 seconds with peak aggregate RSS
1.64 GiB and at least 53.96 GiB available host memory. It used two assigned CPU
cores, low scheduling priority and one OpenMP thread. These include preparation
and diagnostic work and are not browser throughput measurements.

This is a 0.4-second controlled outage test. It does not establish long-term
drift, recovery after a large viewpoint change, rendered loop closure, embedded
deployment, native Rumoca artifact execution, or the 10× realtime target. The
application still runs the camera/Modelica inertial baseline until full native
SLAM compilation, raw typed inputs and persistent State execution are qualified.
