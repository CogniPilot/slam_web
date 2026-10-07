# Calibrated residuals for noisy RGB-D registration

The first complete native noisy camera replay rejected every visual correction.
This investigation uses the captured 848×480 RGB8/Z16 images without changing
the shader, image resolution, feature capacity, estimator inputs or acceptance
requirement. All estimator computation remains Modelica. JavaScript analysis
below is an independent development oracle and is never imported by the app.

## Evidence and cause

The diagnostic replay `artifacts/modelica-rendered-flight-slam/rendered-flight-slam-kmf897`
preserves the exact sparse 350-slot first matched-pair matrix. The separate
captured oracle poses establish reference-to-current camera geometry for
analysis only. Among 184 candidates, 34 have Euclidean residual at most 2 cm;
177 have squared whitened residual at most 9 under the existing calibrated
point covariance. Median Euclidean residual is 5 cm, while the 95th percentile
is 21.6 cm. The fixed metric gate rejects depth-dependent measurement noise
even when a correspondence agrees with the independent camera geometry.

`analyze-rendered-registration-pairs.mjs` independently decodes the MAT matrix,
checks capture/replay bookends and hashes, and evaluates each residual using
`S = R C_reference Rᵀ + C_current`. Its report is
`artifacts/registration-covariance-2026-10-07/first-pairs-analysis.json`.
Adding the 1 mm quantization variance does not change the 177-pair count.
This diagnoses the metric gate; it does not establish that all matches are
correct or that a fitted pose will be accepted by the inertial filter.

## Modelica change

`FitRigidPointPairsRobust` now accepts optional point covariances and a squared
whitened-residual radius. The generic default preserves the historical metric
fit, operation order and clean-case results. The raw RGB-D function defaults
to the calibrated mode and constructs each covariance with the same
`RGBDOpticalPointCovariance` used by its uncertainty calculation. The older
equation components retain their explicit baseline behavior.

The rigid transform is still estimated by the unweighted Horn fit. Hypothesis
admission, consensus membership and final certification in calibrated mode use
per-pair `rᵀ S⁻¹ r ≤ 9`. Three-point hypotheses and refinement no longer fail
the unrelated 2 cm RMS before this test runs. Bounded 64-hypothesis sampling,
majority support, rank/eigensolver refusal and stable-mask certification remain.
The returned RMS is still in meters and can legitimately exceed 2 cm.
Registration, sandwich covariance and tracking share the certified sparse mask.

Whitening uses a scaled Cholesky solve; no explicit inverse, damping or invented
isotropic noise floor is introduced. Invalid, asymmetric, nonfinite or singular
enabled covariances refuse. Disabled sparse slots may contain NaN. Radius 3
in whitened 3D space is a declared engineering gate, not a claim of 99% coverage.
The point covariance remains a conservative disparity model without reduction
by interpolation neighbor count. Selection/association correlations and
covariance-weighted pose fitting remain limitations.

## Qualification so far

`artifacts/modelica-covariance-registration/covariance-registration-bhChfl`
passes 24 checks covering independent correlated-covariance scores, scale
equivalence, singular/asymmetric/nonfinite refusal, anisotropic noisy geometry,
lateral outliers, insufficient consensus, disabled NaN slots and clean parity.
The actual captured-pair fit retains 143 candidates, rejects 41 and has maximum
translation-component error 0.020223 m against the separate oracle. Every
retained pair satisfies the calibrated gate. This is a reference-only native
OpenModelica execution, not a Rumoca WASM or browser SLAM claim.

`artifacts/modelica-robust-registration/robust-registration-GejOF8` passes all
24 historical generic controls with unchanged acceptance requirements.
The existing visual-relative oracle explicitly selects the historical metric
mode, preserving its separate geometric/noise-refusal contract. The full native
noisy 13-frame RGB-D/IMU replay is the integration gate for the new default;
its six-correction/six-capture requirement remains unchanged.

The completed integration receipt is
`artifacts/modelica-rendered-flight-slam/rendered-flight-slam-P85rPz/report.json`:
all 24 checks pass, with six actual visual corrections and six reference
captures after initialization. The map grows from 161 to 884 occupied slots.
Ten of twelve frontend registrations pass; two still refuse consensus and
follow the existing capture path. All 13 images retain native 848×480 RGB8/Z16
format, GPU noise, distinct calibration and explicit millimeter scale. The 36
held intervals use 37 raw modeled IMU samples without stochastic IMU noise.
No oracle pose enters the estimator. Separate evaluation gives a final
position error of 0.061787 m. This 0.4-second sequence does not certify drift,
loop closure, dynamic scenes, arbitrary computers or full browser execution.

The reference run takes 147.17 seconds including compilation and replay,
with peak aggregate RSS 1,480,304 KiB under the two-core/low-priority guard.
This is OpenModelica generated C, not Rumoca throughput. A ten-second attached
perf sample has zero lost samples. Self samples are 26.40% generic base-index
calculation and 22.07% generic array reads. Inclusive samples attribute 82.37%
to FAST frame scoring, 7.62% to descriptor matching, 1.31% to bounded rigid
registration and 0.55% to its whitening helper. Inclusive shares overlap and
must not be added. The generated C retains runtime array indexing calls and
guarded loops; this evidence must not be attributed to Rumoca code generation.
Raw trace and flat/inclusive reports remain in owned scratch profiling storage.

The old visual-relative runner executes all 300 numerical checks successfully
but its overall historical-prefix gate refuses: the earlier RGB8/Z16 image
parameterization changed `RGBDVisualObservation.mo` before this work. That
failure is retained in `artifacts/rgbd-relative-function/rgbd-relative-function-j2qy2O`;
the prefix assertion was not relaxed. Nine project/source persistence unit
checks pass. Review receipts are bound in
`artifacts/registration-covariance-2026-10-07/review.json`.

The immutable 59-file native source snapshot for compiler review is in
`artifacts/registration-covariance-2026-10-07/native-source`. Older snapshots are
retained. No application compiler, numerical fallback or compiler-pin change
is introduced. Browser full SLAM and the 10× realtime goal remain unqualified.
