# Full raw RGB-D relative-observation function reference

`ObserveRGBDRelativeFrame` in `models/RGBDVisualRelativeObservation.mo` now
orders the existing Modelica description, descriptor matching, rigid fit,
calibrated body-pose conversion and registration sandwich functions in one
pure Modelica call. `RGBDRelativeBodyPose` is appended to
`models/RGBDRelativePose.mo`. The complete original equation-model prefixes,
and the complete `RGBDVisualObservation.mo` file, remain byte-identical to
the frozen preimages in `dev/artifacts/rgbd-relative-function/preimages.json`.

The new interface uses named constants for the full 90×160 RGBA/depth image,
350-feature domain and 7×7 descriptor. It preserves all original settings
and defaults. Description alone obeys `imageEnabled`; matching and fitting
still execute and report their original refusals. Fit and sandwich calls
consume all 350 pair slots, never the match count as a prefix. Relative
covariance uses optical translation/left-angle coordinates; the separate
body observation covariance is conditional on the retained estimated pose,
and must not be used as fresh independent absolute-pose noise.

## Actual reference results

The full-camera function gate passed **25/25 scenarios, 12 check groups per
scenario**, in 12.775 seconds with peak owned RSS 1,285,276 KiB. Its receipt is
`dev/artifacts/rgbd-relative-function/rgbd-relative-function-fjADtO/report.json`.
The strict CSV has 4,376 columns and three rows; its SHA-256 is
`46796d99e9575d6981bdf4a53db9a52b2462f26e126e0f1ddd6b083305a20d91`.

The fixture constructs two distinct full raw images with calibrated,
noncoplanar points and six distinguishable measured patches at sparse slots
`{1,7,63,173,299,350}`. Independent image/geometry expectations check every
current descriptor, point, enabled mask and association over the complete
350 domain, including canonical inactive payloads. The known optical
transform is `diag(-1,-1,1)` with translation `{0.1,-0.2,0}`. A nonzero
three-axis camera origin and nonidentity retained body pose give the
independent expected body position `{1.28,-2,0.84}` and rotation
`[0,1,0;1,0,0;0,0,-1]`.

The covariance oracle explicitly accumulates its independently defined
Jacobians and calibrated measurement covariance, solves the full 6×6
normal matrix by partial-pivot Gauss-Jordan elimination, and checks every
cell of both 6×6 output covariances. It does not call the production noise,
pose-conversion or rigid-registration helpers for expected values.
Descriptor/point tolerance is 1e-12; rigid/body tolerance is 2e-10; both
covariance checks use 2e-9 times `(1+abs(expected))`. The test includes bad
counts/masks/calibration/rotations, poison in disabled and rejected payloads,
the last slot, insufficient matches, prediction gates, altered depth and
patches, uncertainty-only refusal and held nondefault settings.

The first numerical run is retained as
`rgbd-relative-function-u1SzT9`: 23/24 scenarios passed. Its one failing
expectation assumed that a correct prediction with a 0.5 m gate could match
with only one eligible candidate. The original matcher requires a finite
second nearest candidate. The fixture now checks both correct prediction
with a 20 m gate and the original narrow-gate refusal (scenario 25). No
production setting or algorithm was changed to make this test pass.

A separate dynamic comparison against the untouched equation
`RGBDRelativePose` passed **18/18 cases**, in 1.545 seconds with peak RSS
144,600 KiB. Its receipt is
`dev/artifacts/rgbd-relative-function/rgbd-relative-pose-function-blouuy/report.json`.
This compares general proper rotations and extrinsics, acceptance masks,
rotation-tolerance boundaries, input/output overflow, nonfinite rejection
and recovery at 2e-13 tolerance. Its 142-row CSV SHA-256 is
`89ded05885678b53c6e508d1e7d41f68ee9cafdcdbd94e44ab122045f040f5b9`.

## Input ownership and replay

Both runs used the installed OMC reference, `-O0`, disabled frontend
function evaluation and `--preOptModules-=evalFunc`, under the existing
120 s/8 GiB/16 GiB available-memory guard, nice 15, CPUs 10/11, OMP one
thread. Exact options, commands, source hashes, logs, raw CSV and resources
are retained with each receipt. Generated C/H remains in the matching
owned `$HOME/scratch/slam_web/tmp/<receipt-name>` directory; the full-camera
report records its hashes and sizes.

The passed runner loaded the live app paths and verified equal before/after
hashes for every reported input. Its immutable snapshot has now been
completed with the exact reported runner and bounded-runner bytes, in both
the durable and scratch `source-preimages/dev` directories. The first
failed runner was recovered from the two case-count/scope text changes and
verified against its originally reported SHA before archival; this is
reconstructed evidence, not a claim it was copied before execution. The
passed reports and their old runner hashes were not rewritten.

The current full-camera runner additionally freezes **every** `sources`
entry, verifies those copies, and loads Modelica and the watchdog from the
frozen paths. This ownership-only runner change has passed Node syntax
checking; it has **not** had a further numerical run. The archived passed
runner is the authority for the results above.

This qualifies the full raw pure function under the OMC reference and the
calibrated pose helper against its original model. It does not qualify the
whole original `RGBDVisualRelativeObservation` equation model by direct
differential execution, connected localization/filter updates, Rumoca
WASM emission, browser integration, complete SLAM or runtime speed.
