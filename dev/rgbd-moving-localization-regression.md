# Moving RGB-D core regression

`tests/compiler-probes/modelica-rgbd-moving-localization.test.ts` is a separate
test of the frozen `RGBDInertialLocalizationStep` source. It never compiles a
replacement model, changes its dimensions, injects a visual transform into its
inputs, or substitutes a backend. It instantiates the actual compiler-issued
artifact through `NativeProgram` when one is supplied.

The input comprises full 90×160 RGBA and optical-Z images and the complete
350-feature domain. Twenty-four distinct 7×7 marker patches have noncoplanar
depths and sparse feature slots, including 344–349. Current feature slots are
permuted. Each depth marker fills the calibrated bilinear interpolation
footprint with one Float32 axial-depth value. RGB and depth focal lengths
differ. The proper optical-to-body mount has an additional three-axis rotation
and a nonzero three-axis camera origin.

The synthetic camera transform has rotation vector `[.0096,-.0072,.0088]`
radians and optical translation `[.0096,-.0072,.0064]` metres. These values are
used only to generate images and qualify the independent oracle. Source inputs
contain no truth pose or registration transform. The initial estimate is tilted
and translated. Eight held IMU intervals precede the second image. Its
stationary inertial prior deliberately leaves a visual innovation; this is an
innovation and geometry regression, not a physically exact IMU trajectory or a
renderer/photometric-warp test. Marker patches preserve descriptor identity
between exposures to isolate correspondence and calibrated geometry.

Rounding projected marker centres to integer RGB pixels changes the bearing.
The oracle fits the sampled points by independent SO(3) Gauss–Newton least
squares and pivoted Gaussian solves, rather than copying the source's
Horn/Jacobi registration. Qualification bounds are 0.005 radians and 0.012 m
between this fit and continuous motion; measured errors are 0.00257 radians and
0.00179 m. The fit RMS is 0.00756 m, below the unmodified source's 0.02 m gate.
The source transform must match the independent sampled-point fit within
`2e-8`; covariance/filter comparisons use `3e-8`–`4e-8`, and transformed world
points use `8e-8`. These are numerical comparison tolerances, separate from
pixel quantization. The oracle also checks that reversing the transform raises
the residual, and that all six visual innovation coordinates are nonzero.

The actual-artifact test checks full descriptor/point arrays; rigid-transform
direction; sandwich covariance; corrected position, velocity, quaternion,
rotation and biases; all 225 current, 90 cross and 36 reference covariance
entries; all masks and matched pixel associations; calibrated world points;
readonly P; consumed-pair refusal; atomic fresh-reference snapshot; and reset
replay. It checks every output against independent test mathematics or an
explicit source transaction invariant. It does not assert full FAST selection,
persistent mapping, loop closure or complete SLAM acceptance.

Run the gate with an existing accepted core artifact:

```sh
RUMOCA_LOCALIZATION_SOURCE=/path/to/source.mo \
RUMOCA_LOCALIZATION_ARTIFACT=/path/to/native.json \
RUMOCA_MOVING_LOCALIZATION_REPORT=/path/to/report.json \
node node_modules/vitest/vitest.mjs run \
  --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-rgbd-moving-localization.test.ts
```

Current verification: one independent fixture test passed, one actual-artifact
test explicitly skipped; TypeScript and diff whitespace checks passed. The
durable fixture-only result is
`dev/rgbd-moving-localization-fixture-verification.json`: actual numerical
cases **0**, module hash **null**, source SHA
`97f44b0e4650a83da5c7812b271460e7e2fef9a06a4bc46080ed81a1585dba02`.
The actual moving core gate remains unrun until its artifact exists.
