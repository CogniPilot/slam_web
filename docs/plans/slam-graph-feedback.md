# Graph feedback diagnosis after the first hallway comparison

The600-second native baseline fails return localization. A40-second cadence
intervention prevents catalog starvation but does not fix accuracy. Keep those
observations separate from the finite-capacity design question.

|40-second configuration|Retained graph keyframes|Endpoint error|Final accel-bias norm|
|---|---:|---:|---:|
|Original2 s /0.6 m capture policy|10|0.250 m|See full recorded diagnostics|
|0.6 s /0.2 m capture policy|61|0.775 m|0.893 m/s²|
|Same cadence; graph feedback disabled|60|0.307 m|0.0127 m/s²|
|Same cadence; direct velocity/bias gain rows constrained|61|0.610 m|0.816 m/s²|

These are deterministic-observation, one-configuration-per-run diagnostic
interventions, not a validated production fix or a full-mission counterfactual.
Disabling feedback also removes a required global-correction capability. The
constrained-gain intervention does not isolate indirect covariance/reference
effects. Its failure does not establish a bug in the gain-mask implementation.

An evaluator-only audit of all80 admitted measurements in the cadence prefix
finds60 sequential edges and20 loops. The largest loop measurement discrepancy
against truth is0.033 m and0.0068 rad. This does not support blaming every loop
on perceptual aliasing. One sequential edge has0.085 m /0.0119 rad discrepancy
and covariance-normalized squared residual50.45. Treat normalized residuals as
descriptive: Gaussian coverage, independence and whole-mission false-closure
performance are not established by this prefix.

## Candidate mechanism from the source

The verified exported source uses a21-state current/reference correction with
covariance intersection. In `SchmidtGraphPoseCorrection.Correct`, it sets
`weightedPrior = prior / weight`, forms the innovation/gain, optionally zeros
velocity/bias gain rows, and uses a Joseph covariance update with that weighted
prior. The reset acts on attitude coordinates, not the nuisance bias coordinates.

For constrained nuisance rows, `K_n = 0`, hence `A_n = I_n` in `A = I-KH` and
the nuisance covariance block before reset is exactly `P_nn / weight`.
At the configured weight0.5, one such fusion doubles this block even though its
direct nuisance mean correction is zero. This is an algebraic consequence of
the implemented rule, not yet a measurement of every internal covariance in the
flight. Prediction, visual updates and other transport operations also occur;
the observed bias trajectory cannot be inferred by simply exponentiating2.

The component reproduction `CINuisanceProfile` executed the same exported Modelica
source after lowering by pinned Rumoca5c68a1c67524. All nine constrained nuisance
variances scaled by4,2 and1.25 at weights0.25,0.5 and0.8, with zero nuisance mean
change. This independently executes the component rule on synthetic SPD inputs;
it does not expose the archived flight module’s intermediate covariance.

This gives a specific hypothesis for the indirect feedback seen in the probes.
An additional shadow test executes the archived flight WASM itself. At four
selected accepted corrections (1.2,6.2,21.8,38.2 s), a separate instance receives
the same memory image with only the graph-correction request zeroed. All nine
nuisance variances in the live result are exactly twice the shadow values, and
the nuisance means are equal. The actual201-frame replay retains exact
non-timing estimate parity. This confirms four events, not a full-flight
causal attribution or an implementation-contract violation.

Next trace the effect on subsequent visual-update gains, verify
the frame/reference binding, and reduce the problematic event to a component
case. Do not remove covariance inflation or clip a block while claiming the
existing conservative joint bound is preserved. No canonical estimator source
or production parameter default has changed in this work.

## Research constraint on a repair

[Julier and Uhlmann,2007](https://doi.org/10.1016/j.robot.2006.06.011) describe
CI for unknown cross-correlation and SCI when error components can be separated.
The latter requires justified information about the correlation structure;
calling two reused image contributions independent would not supply it.

[Trumpf, Zamani and Manzie,2025](https://arxiv.org/abs/2507.16216) prove
optimality results for conservative unbiased linear fusion of partial estimates
and characterize determinant/trace weight optimization. Those assumptions do
not prove this nonlinear SLAM pipeline is unbiased or globally consistent. They
also do not justify selectively retaining a smaller covariance without the
necessary structural assumptions.

The [SplitCIF authors' implementation](https://github.com/LI-Hao-SJTU/SplitCIF)
provides a research reference for explicitly separated independent/dependent
components. It is not adopted here; a Modelica implementation would need its own
state-ownership/correlation contract, proof obligations and runtime validation.

Candidate repairs to review are correlation-aware partial fusion with justified
structure, principled weight selection, or separating the global map-to-odometry
correction from the inertial estimator. Each changes behavior/uncertainty
semantics and requires evidence. A benchmark-specific switch that merely reduces
the observed error is insufficient for the requested replacement claim.
