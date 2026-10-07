# Calibrated noisy loop verification and graph admission

The raw RGB-D frontend now accepts physically plausible noisy depth, but the
loop path still had independent fixed metric gates. Consensus required an
8 cm inlier radius and a 3 cm final RMS. Graph admission rechecked both limits.
A calibrated frontend alone therefore could not make noisy loop measurements
usable by the graph.

## Production change

`RGBDLoopVerification.Consensus` and `ScorePairs` now support optional per-pair
source/current covariance and squared whitened residuals. Their generic default
retains the historical metric behavior. The full frame verifier defaults to
calibrated residuals, constructing covariance from each retained frame's own
RGB focal lengths, stereo reference focal length and measured optical points.
It retains the existing common-disparity/common-baseline compatibility check.

Calibrated scoring uses `rᵀ (R C_reference Rᵀ + C_current)⁻¹ r ≤ 9` through the
shared scaled Cholesky helper. Metric RMS no longer rejects a hypothesis before
its calibrated test. The transform remains an unweighted rigid fit. Sampling
still uses the caller's bounded deterministic seed stream; default work is 96
hypotheses and four refinements. Majority/minimum-count, stable-mask, rank and
eigensolver requirements remain. Generic metric comparisons remain selectable.

`RGBDCatalogLoopVerification` and `RGBDCatalogGraphCapture` forward the same
policy. Graph admission independently reconstructs point covariance and checks
every retained pair against its own policy using catalog-bound frame identities.
It also recomputes metric RMS and verifies body/optical transport, unique partner
indices, epochs, generation, covariance/information consistency and graph
invariants. Changing only the verifier's Boolean cannot admit an inconsistent
proposal. Failed admission preserves the entire prior catalog and graph.

Calibration policy inputs are explicit scalar arguments. Proposal records,
persistent State layouts, camera transport and application/compiler boundaries
are unchanged. No JavaScript numerical implementation or compiler fallback was
added. Radius 3 in whitened 3D space is an engineering gate, not a 99% coverage
claim. Unweighted fitting and independent conservative point covariance remain
limitations; association/selection correlations are not newly modeled.

## Reference evidence

The new `RGBDNoisyLoopAcceptance` fixture exercises full 128-slot catalogs,
350-feature domains, four retrieved loop proposals and 256-edge graphs. Its
controlled descriptors and optical points use native D435 image dimensions and
separate focal lengths. Axial errors of ±12 cm follow optical rays at roughly
6–7 m range. These are controlled geometric measurements, not captured images.

All 32 checks pass in
`artifacts/modelica-noisy-loop/noisy-loop-8sLMU8/report.json`:

- All 32 physical pairs remain usable in the no-outlier case at 0.1213 m RMS.
- Eight deliberate lateral mismatches are excluded, leaving 24 pairs at
  0.1200 m RMS; stricter support requirements refuse the proposal.
- Retrieval, sequential admission, four loop admissions and graph preparation
  complete through actual production Modelica functions.
- Graph admission refuses a tampered lateral pair even after its reported RMS
  is recomputed, as well as invalid calibration and invalid normalized policy.
- Invalid descriptors, incompatible noise metadata and idle requests preserve
  the complete prior catalog and graph.
- The actual Modelica pose-graph optimizer takes eight accepted iterations on
  the resulting 128-node/256-edge problem. Cost drops from 1,960,780.27 to
  1,808,869.02 while the gauge node remains fixed. This proves objective
  reduction, not convergence or physical trajectory accuracy.

The first fixture revision had six failed checks: its large outlier offsets
left the image domain, and it incorrectly assumed the metric verifier must
refuse rather than fit a half-noise subset. The corrected fixture keeps outliers
inside the image and compares retained physical inlier inventories. The initial
failure remains in `artifacts/modelica-noisy-loop/noisy-loop-v5Oe9D`; production
noise thresholds were unchanged during the correction.

Existing proposal controls pass 29 checks, catalog retrieval/loop controls pass
10, and graph measurement/admission controls pass 20. The complete raw RGB8/Z16
processing graph passes all 30 checks, including its actual graph correction,
with 78 matches and 42 map landmarks. These 121 checks are bound by
`artifacts/loop-covariance-2026-10-07/review.json`, including source preimages and
unchanged source hashes at completion. Owned jobs ran sequentially on two
low-priority cores with resource guards. The noisy optimizer fixture took
7.25 seconds including reference compilation, peak aggregate RSS 399,212 KiB;
the complete raw graph check took 12.20 seconds, peak RSS 991,424 KiB.

All results are native OpenModelica reference execution. They do not establish
Rumoca WASM issuance, browser estimator execution, rendered loop-closure
accuracy, long-flight drift, portable GPU behavior or 10× full-simulation speed.

## Compiler handoff

The new immutable 59-file native source snapshot is
`artifacts/loop-covariance-2026-10-07/native-source/source.mo`, 731,091 bytes,
SHA256 `f3272ea69928df2fbb3030e1d289b83bf1d34dd8283782e4d153711fb1aa1841`.
The adjacent manifest binds every authored source file. Relative to `6009ec10`,
only these production files change: `RGBDLoopVerification.mo`,
`RGBDCatalogLoopVerification.mo`, `RGBDGraphMeasurements.mo` and
`RGBDCatalogGraphCapture.mo`. Older immutable snapshots and their evidence remain.
The active app compiler pin stays unchanged. The next critical delivery is
Rumoca-native full-State issuance and browser integration of this math.
