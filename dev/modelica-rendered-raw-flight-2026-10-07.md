# Native RGB8/Z16 flight replay with GPU depth noise

The current camera output now has a complete rendered-flight reference test.
It captures13 native848×480 RGB8/Z16 frames from the actual Rumoca quadrotor
and replays all36 held IMU intervals through the complete Modelica processing
composition. Shader depth noise is enabled, with the same seed7, disparity
sigma0.08px, dropout0.005 and1mm depth scale as the live runtime. No source
model, compiler pin, algorithm capacity or sensor cadence was reduced.

The numerical replay **fails**: every one of its12 visual updates rejects the
geometric fit. There are descriptor matches, but no accepted visual corrections.
This is an application algorithm issue to resolve alongside native compiler
issuance; a functioning browser compiler alone will not fix it.

## Capture and format boundary

The hardware capture reports NVIDIA RTX3090/WebGL2 and passes its source/asset
bookends. RGB is top-down RGB8 with2544-byte rows; depth is top-down little-endian
Z16 with1696-byte rows and0.001m/unit. RGB and depth retain their distinct optics;
there is no host image alignment, resizing or row reversal.

The new producer uses `World.captureSensorPair(false,'sync',false,true,false)`
after configuring `GpuDepthNoise`. Captured raw bytes are preserved unchanged.
The test screenshot expands RGB into RGBA only for display; that buffer never
enters the dataset or Modelica. Calibration, source/session identity, all37
actual IMU samples and their36 previous-sample hold intervals are retained.
Pose truth is stored separately for evaluation and never enters the estimator.

The OMC-only MAT transport preserves each RGB byte and Z16 code exactly as a
mathematical Real value; it does not multiply a depth image by its scale. The
authored Modelica sample-reading functions receive `depthUnits=0.001` and apply
the scale themselves. This reference transport is not a proposed browser ABI.
The complete native image grid is retained in every frame.

`RGBDRenderedFrameInput.Read` now accepts the channel count explicitly, and the
flight/diagnostic reference functions accept three-channel RGB and depth units.
Defaults preserve the historical RGBA/metric recordings. The older finite,
nonfinite and signed-zero input reader checks still pass after this extension.

## Failed numerical acceptance

The full13-frame replay completes with all CSV/clock/source bookends valid.
It passes23 of24 checks and fails check23, which requires six independent visual
corrections and six new references. Actual results are zero visual corrections
and12 new references. This check remains unchanged; it was not relaxed to count
successful inertial propagation or new keyframes as visual localization.

Across the12 updates there are63–200 descriptor candidate matches,321–350
enabled features, rank3 and registration refusal7: no admissible stable consensus
within the declared bounds. The first update has184 candidate matches and
original fit RMS0.581m. Robust fitting is already present:64 deterministic
hypotheses, a50% minimum consensus and a fixed0.02m residual gate. No additional
RANSAC implementation is implied by this finding.

The sensor noise is depth dependent. In the first noninitial depth image, the
5th/50th/95th percentiles of all positive pixels are2.722/4.627/9.740m. The shader
model's axial standard deviation `z²*disparitySigma/(referenceFx*baseline)` at
those distances is0.0265/0.0767/0.3397m. This histogram is **not** the matched
feature population, and inverse-depth interpolation changes the sample noise;
it is evidence that a universal2cm gate needs investigation, not proof that
every rejected correspondence is correct. Repeated textures and wrong matches
remain competing explanations for the large raw fit residuals.

Next numerical work is to retain the actual sparse matched point pairs from
this failing case, evaluate their noise and residuals, and qualify a bounded
covariance-based consensus gate in Modelica. For a candidate transform, the
residual covariance should include both transformed reference-point and
current-point covariance, with explicit pixel localization and depth-unit
quantization assumptions. A normalized residual test must retain strict domain,
rank and invalid-input rejection. Clean existing fixtures, outliers and
degenerate geometry must remain independently tested. Changing thresholds just
to make this recording pass is not acceptance.

## Resources and evidence

Capture took11.1s with peak aggregate RSS2.14GiB. The complete OMC reference,
including source/C preparation and all13 frames, took146.8s with peak aggregate
RSS1.52GiB. Jobs ran sequentially, nice15, at most two assigned CPU cores and a
16GiB host memory reserve. These are test-resource observations, not browser
SLAM throughput or limited-laptop qualification.

A10-second perf attachment to the owned reference executable reports about1K
cycle samples and zero lost samples. Generic array indexing accounts for52.2%
of sampled cycles (`calc_base_index_va` and `generic_array_get`); `FastPatchScore`
accounts for16.1%. This is generated OpenModelica C, not Rumoca WASM. It supports
keeping compiler-owned compact array/stencil execution work a priority, but
does not establish a Rumoca performance defect.

The [consolidated review](artifacts/rendered-raw-flight-2026-10-07/review.json)
binds the passing hardware capture, failing full numerical replay, old-reader
regression, depth summary and perf summary. Large builds, expanded MAT matrices
and raw profiling traces remain under `$HOME/scratch/slam_web`.
The production59-file source remains SHA256
`865e41108e8f62cbca2c482499d8a3751c67676553924c2fd6d9224b46c4e119`.
No native artifact, browser SLAM or10× result is qualified by these tests.
