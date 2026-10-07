# Static browser demo release checks

The release demonstrates Modelica quadrotor physics, inertial propagation,
Three.js GPU sensor rendering, editable source and local project persistence.
It does not qualify full visual SLAM or provide a generated FMU.

The local hardware browser run completed37 tests with two fixture failures and
23 explicitly skipped integration/compiler/retired-transport checks. The two
failures were corrected and rerun successfully:

- Sensor-rate verification now observes the native Z16 raster-cloud timestamp,
  including when dense CPU cloud readback is disabled. Its strict sensor counts,
  committed poses, timestamps and physics barrier checks remain unchanged.
- Paused viewer verification waits for initial compilation to finish before
  recording ground truth. Otherwise the startup's first pose races the camera
  assertions. Its keyboard, paused-time and editing-focus checks remain intact.

Earlier fixture corrections use RGB8's three-channel stride and native848×480
extents, filter actual instanced meshes, and disable stochastic noise only for
an analytic depth/color plane. Independent depth-noise and GPU geometry gates
remain strict. The full-frame Harris language-service test is preserved as a
separate strict compiler-admission suite because pinned Rumoca0.10.0 traps on
valid source. This is reported separately and never claimed as supported SLAM.

The supported unit suite passed203 tests; the production build passed. All
supported browser tests have passed across the complete run and focused reruns.
The whole browser command has not been rerun after the final two fixture fixes.
Hardware was reported as NVIDIA RTX3090 through ANGLE/WebGL2. The full local
browser run used at most four assigned cores, peaked near2.9GiB aggregate RSS,
and took4.2minutes. These are test-resource observations, not simulation throughput.

The GitHub workflow is validated with actionlint. Browser tests are divided
into six shards testing the exact same uploaded static build; Pages deployment
requires the build and every supported browser shard. Experimental compiler
checks remain separately visible. This change does not cancel the already
running prior workflow; it will be pushed only after that run finishes.
