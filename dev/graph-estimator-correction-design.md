# Graph-to-estimator correction: proposed owner and acceptance contract

Status: staged implementation. `GraphGaugeUncertainty.mo` now implements the
two-pose uncertain-anchor transport below; all37 reference controls pass, including
full joint off-diagonal terms and independently differentiated noncommuting
rotations. `SchmidtGraphPoseCorrection.mo` implements the complementary
current/reference fusion and passes54 independent full21/12 reference controls,
including signed unknown-cross covariance extremes and dual attitude resets. Neither is
integrated into the browser session. The full128/256 optimizer now passes20
reference controls, including noncommuting perturbed attitudes and loop factors.
The atomic graph-pose/filter21/map14400 commit passes30 controlled-proposal
reference checks. The actual optimizer/anchor/selected-bound/commit composition
passes31 controls, and ordinary publication/bootstrap pass12+3 controls through
corrected-pose observations and actual capture129/anchor eviction. Owned
vocabulary publication adds15 passing learning/persistence/rollback controls.
The selected graph covariance owner executes at full capacity but still
fails six strict convergence checks; its reference qualification remains incomplete.
Retained anchor-bound ownership and same-capture clone fusion now exist;
raw-camera public-model and browser session execution remain unqualified.
See [the current composition](../docs/modelica-slam-processing.md).
These source/reference results do not
establish full browser SLAM or throughput.
All numerical owners belong in Modelica and must eventually issue Rumoca SolveIR
WASM. OpenModelica and independent test algebra are reference tools.

Current transport evidence and conditional scope:
`dev/artifacts/modelica-graph-gauge-uncertainty-semantics/README.md`.

Current optimizer evidence:
`dev/artifacts/modelica-pose-graph-semantics/pose-graph-semantics-OvxCeK/`.
Current atomic commit evidence:
`dev/artifacts/modelica-graph-estimator-commit-semantics/graph-estimator-commit-semantics-dKLVDB/`.
Corrected-pose mapping evidence:
`dev/artifacts/modelica-catalog-pose-mapping-semantics/README.md`.

The actual public defaults may capture a new local reference on the same image
that becomes a catalog keyframe. After Publish, currentId and referenceId can
therefore be equal. Exact identity now admits that case through a one6D branch;
duplicating the same six-dimensional measurement into an SPD12 solve would be
incorrect: the duplicated graph uncertainty and exact reference clone can be
singular. The implemented owner consumes one6D measurement while updating the
complete correlated21-state prior, both means and both attitude resets. The
same-capture graph-processing fixture exercises the actual optimizer and
selected-bound chain, but the complete raw-camera execution remains unqualified.

## Recommended next policy

Implement conservative unknown-correlation fusion of **two graph poses together** into the complete current/reference21-state estimate, with uncertain-gauge transport before fusion. Use the full gain so prior cross-correlation can correct current velocity and biases as well as both poses; apply the existing nominal-domain checks and transport every covariance block. This is a real reconditioning update, not a coordinate-frame rotation. Refuse until graph covariance, anchor uncertainty and timestamp/identity/provenance requirements are available. Do not substitute optimized pose plus registration covariance into ES15PoseCorrection. A constrained-gain variant can be an explicit experiment, not a silent reduction of the full estimator.

This is preferable as the next bounded implementation to reconstructing every historical filter/graph cross-correlation. A joint augmented graph/inertial estimator remains the stronger long-term option: retain current15 errors, historical6D pose clones, raw factor provenance and all required joint covariance blocks; clone at capture with the exact selection Jacobian, propagate current↔clone cross blocks, consume each raw factor once and jointly condition. Marginalizing/removing a clone must retain the induced prior and correlations. Existing21-state storage only covers one reference; it cannot silently stand in for this128-pose augmented owner. Schmidt methods specifically retain active↔nuisance cross-correlation even when freezing nuisance means/covariance. [Geneva, Maley and Huang, original CVPR2019 paper](https://openaccess.thecvf.com/content_CVPR_2019/papers/Geneva_An_Efficient_Schmidt-EKF_for_3D_Visual-Inertial_SLAM_CVPR_2019_paper.pdf).

Unknown-cross fusion can remain conservative only when each input covariance is a valid error bound in the same linearized coordinates. Covariance intersection addresses missing cross-correlation; it does not repair biased estimates or invalid input bounds. [Conservative Quantization of Covariance Matrices, original research article](https://pmc.ncbi.nlm.nih.gov/articles/PMC8125543/). The algebra below is this project's proposed update and optional gain constraint, derived explicitly rather than attributed to that paper.

## What existing sources actually own

- ModelicaPoseGraph fixes chronological row1 exactly, solves measured relative factors and emits means/cost/status only. It does not emit a graph marginal, absolute gauge covariance or filter cross-covariance. Its damping/preconditioner is an optimization device, not posterior information.
- RGBDGraphMeasurements retains raw measured body edges, identities and epochs. PrepareProblem scales every active raw information matrix by1/E and preserves raw payload. Conditional on valid marginal edge bounds, arbitrary edge cross-correlation satisfies C≤E blockdiag(R_e). It does **not** bound graph↔filter dependence or the uncertain ENU gauge.
- RGBDCatalogGraphCapture returns a catalog/graph proposal. Its optical/body registration covariance is a conditional first-order estimate. It is not a certified bound for correspondence/robust selection, wrong matches, calibration bias, dynamic objects or nonlinear error. See [registration uncertainty](../docs/registration-uncertainty.md) and [measured graph](../docs/measured-pose-graph.md).
- SchmidtReferenceState owns15×15 current covariance,15×6 cross and6×6 reference covariance. Capture selects current position/right-local attitude: Pcr=Pcc Sᵀ and Prr=S Pcc Sᵀ. Prediction advances Pcr with Φ and keeps the reference frozen.
- SchmidtRelativePoseCorrection gives the reference zero gain and preserves its mean/covariance while updating current/reference cross terms. A graph correction moving both poses needs a different owner; composing two independent ordinary updates loses the12D graph correlation and is incorrect.
- ES15PoseCorrection injects world-additive position/velocity and right-local attitude, resets all attitude cross terms, and can update biases. Its independent-observation noise assumption does not apply to a reused-image graph estimate.
- RGBDMapAnchors.Reproject retains anchor-local geometry, reconstructs world points per corrected anchor and prunes lost identities. It currently owns geometry, not landmark/anchor/filter covariance. Reprojection alone cannot establish stochastic map consistency.

## State, tangent and time contract

Write the prior error as e=[dp_c,dv_c,dθ_c,dba,dbg,dp_r,dθ_r], dimension21, with P=[[Pcc,Pcr],[Pcrᵀ,Prr]]. Positions/velocity are additive in the existing absolute ENU frame; attitude errors are body right-local: R_true=R_nom Exp(dθ). Biases remain body coordinates.

The graph estimate must select the **same** current and retained-reference image poses, stable IDs, generation and exact capture epochs, as those represented by the prior. It must also bind graph revision, catalog pose revision, anchor ID/epoch, source digest and raw-factor provenance. Add a durable referenceBirth token (generation, stable captureID, imageEpoch, captureSequence), bound when SchmidtReferenceCapture creates the retained reference, and require the selected graph reference to match that exact birth token. Ring slot or current generation alone does not identify a reference incarnation. Optical frames, descriptors, calibration and rawimage epochs remain immutable; only separately versioned graph body-pose metadata may change during catalog correction. A live current state propagated beyond the newest graph image cannot be corrected using that image's graph pose as if simultaneous. The first implementation should schedule this transaction at the capture timestamp while a matching current pose is still represented. Delayed asynchronous correction needs a retained pose clone and IMU replay or a joint smoothing owner; it must refuse rather than freeze IMU time or invent zero process covariance.

If no reference is available, use an explicit6D current-only branch and leave unavailable buffers untouched. If the reference identity was evicted or its generation/epoch does not match, refuse the two-node update; do not attach its covariance to a reused ring slot. Replacing a reference is a separate post-correction capture at a fresh image epoch, using the exact selection identities above. It is not equivalent to copying an optimized catalog6×6 covariance into Prr.

## Graph uncertainty required before fusion

At the accepted solution relinearize **all active factors**, in the optimizer's additive-world/right-local chart. Remove gauge row1 and form undamped H=ΣJ_eᵀ(W_e/E)J_e on the762 free coordinates for128 nodes. Check connectivity, finite Jacobians and identifiable rank. Under the stated local, zero-mean edge-bound model, H⁻¹ bounds the free-state covariance: with D=E blockdiag(R_e), weighted least-squares sensitivity L=H⁻¹JᵀD⁻¹ gives L C Lᵀ≤L D Lᵀ=H⁻¹. This argument is conditional on the Jacobians, fixed correspondences and error model, not a global nonlinear guarantee.

Return the selected **12×12 joint** block for current/reference, including their6×6 off-diagonal block. Two separate marginals with a guessed zero cross block are inadequate. Do not invert the damped iteration matrix, use diagonal preconditioner blocks as covariance, or equate PCG convergence with an inverse bound. A selected solve can solve H X=Sᵀ for12 RHS and return S X; use the full128-node/256-edge matrix-free normal product (gauge components zero, damping zero) and sparse edge Jacobians, storing at most12 solution vectors plus bounded preconditioning workspace. Do not materialize or invert the762×762 matrix in production. An independent dense inversion is test-only. For a selected endpoint that is row1, its corresponding conditional RHS/block is zero; it must certify solve error/rank or conservatively bound residual error. A merely approximate numerical inverse is not automatically a PSD upper bound. For the full-capacity acceptance reference, compare to an independent undamped dense solve and test rank/refusal; production can use a Modelica sparse selected-solve owner with an explicit error contract.

A fixed row has **zero conditional coordinate error**, not zero ENU pose error. Retain an anchor6×6 covariance **bound** plus its provenance at capture; do not infer that bound from a conditional catalog pose covariance without reviewing its construction. Let a=(p_a,R_a), and selected graph-relative poses be (t_i,Q_i), so p_i=p_a+R_a t_i, R_i=R_a Q_i. For anchor error [dp_a,dθ_a] the per-pose transport is

```
B_i = [ I  -R_a skew(t_i) ]
      [ 0          Q_iᵀ  ].
```

For graph-relative error [dt_i,dθ_i], C_i=diag(R_a,I). Stack B for both selected nodes and C for their joint graph block. If anchor↔graph errors are unknown-correlated, choose fixed0<β<1 and use

```
Q_abs = B P_anchor Bᵀ / β + C Q_relative Cᵀ / (1-β).
```

This follows covariance Cauchy–Schwarz and includes the shared uncertain anchor correlation between both nodes. If known anchor↔relative cross blocks exist, transport them exactly instead. If an endpoint is the anchor, its relative error block is zero but its absolute covariance remains. Anchor eviction changes the graph's computational gauge; the uncertainty owner must transport the new anchor and selected covariance, or refuse. Changing which row is fixed must not reset gauge uncertainty to zero.

## Conservative21-state fusion algebra

Construct graph pose innovation

```
z = [p_c^g-p_c, Log(R_cᵀ R_c^g), p_r^g-p_r, Log(R_rᵀ R_r^g)].
```

Transport graph covariance into this prior-centered innovation chart. Away from zero orientation difference the rotational blocks require the derivative of Log(Exp(-dθ_prior)R_priorᵀ R_graph Exp(dθ_graph)); use the relevant inverse SO(3) Jacobians, not identity. Define H as the actual prior-error Jacobian in z=H e+n and Q as the transported graph-noise bound. At coincident small-angle means H is the12×21 selection of positions/attitudes; derive and finite-difference the nonzero-residual implementation. Reject the near-π logarithm, excessive corrections and failed linearization checks. [Solà's original quaternion/error-state derivation](https://arxiv.org/html/1711.02508v1) provides local perturbation, right-Jacobian and injection/reset conventions.

For a fixed0<ω<1, define P1=P/ω and Q1=Q/(1-ω). Compute K=P1 Hᵀ(H P1 Hᵀ+Q1)⁻¹ using a validated SPD12 solve. Prior position/attitude correlations can legitimately correct ENUvelocity and bodybiases through this full gain under the same unknown-cross bound. Keep the existing full15-state IMU prediction and qualified relative-pose correction, including their velocity/bias gains. Test graph reconditioning's bias/velocity domains and temporal links against an independent21D oracle. An optional constrained variant sets velocity/bias gain rows to zero while retaining pose rows. That constraint minimizes the separable rowwise quadratic objective among gains with those zero rows for fixedω, but loses useful indirect corrections and increases reported covariance. It is not required for CI and does not prove those quantities unobservable. Deterministic gauge transport must leave bodybiases unchanged; actual measurement reconditioning can change them.

With A=I-KH, output the **whole** covariance bound

```
P_bar = A P Aᵀ / ω + K Q Kᵀ / (1-ω).
```

Proof: the corrected linear error is A e-K n. For any test vector u, the variance of uᵀ(Ae-Kn) is bounded by (sqrt(uᵀA P Aᵀu)+sqrt(uᵀK Q Kᵀu))², which is at most the displayed weighted sum. Thus arbitrary unknown graph↔prior cross-correlation is covered without assuming independence. In the constrained variant, zero gain rows retain nominal velocity/bias but their covariance can increase by1/ω and all cross terms still change. Never restore old covariance blocks after fusion to conceal that increase. Use a fixedω initially, e.g.0.5; optimizing ω is optional later and must depend on covariance/provenance rather than repeatedly selecting the smallest innovation. Include an explicit no-fusion endpoint returning the complete original tuple unchanged.

Inject δ=Kz: p_c+=δp_c, v_c+=δv_c, ba+=δba, bg+=δbg, R_c+=R_c Exp(δθ_c); p_r+=δp_r, R_r+=R_r Exp(δθ_r). Enforce finite geometry and the existing bias/velocity domains before publication. The optional constrained variant holds v_c,ba,bg. Reset both attitude tangents with the SO(3) right Jacobian

```
Jr(d)=I-(1-cos|d|)/|d|² skew(d)+(|d|-sin|d|)/|d|³ skew(d)²,
G=diag(I3,I3,Jr(δθ_c),I3,I3,I3,Jr(δθ_r)),
P_next=G P_bar Gᵀ.
```

The series limits must be continuous at zero. Return Pcc/Pcr/Prr extracted from this one symmetric21×21 result, never recompute cross entries independently. Validate finite geometry, bias domains, the complete prior/proposed joint PSD and actual SPD solve; a numerical PSD-check tolerance must never become retained covariance jitter. The nonlinear mean/error reset remains a first-order tangent covariance approximation even when Jr is evaluated in closed form.

## Gauge change versus measurement reconditioning

A **deterministic** world-frame change (A,t) sends p→A p+t, v→A v, R→A R for current/reference/catalog/map, rotates gravity, and leaves body biases unchanged. For right-local attitude the infinitesimal attitude coordinate does not rotate: the21-state coordinate Jacobian is diag(A,A,I,I,I,A,I). Transform the entire joint covariance with this Jacobian, including Pcr. Relative raw body measurements remain unchanged. This operation adds no information and must preserve every relative residual. With a fixed ENU convention, only declared coordinate changes are permitted; arbitrary tilt without changing gravity/navigation convention is invalid.

An estimated alignment has its own uncertainty and cross-correlation and must be transported/augmented conservatively; treating its fitted transform as deterministic is false. A nonrigid loop correction uses different anchor transforms and cannot be represented by one global(A,t). Never rotate velocity by an arbitrary latest-node loop correction and call that a gauge transform. The recommended policy keeps ENU fixed and corrects velocity through the prior cross-correlation and measurement gain.

## Catalog, map and lifecycle publication

Publish optimized catalog poses and the fused current/reference estimates as **distinct estimates in the same ENU frame**, with explicit owner/revision labels. The graph pose and filter pose of the same image need not be numerically equal after conservative fusion. Consumers must not substitute catalog bodyPosition/bodyRotation for the correlated Schmidt reference, or pretend catalog covariance equals Prr. If a product requires one shared pose estimate for every owner, the next required owner is conservative fusion of the full catalog joint state, including current/reference selected blocks and cross-covariances; the selected12D interface alone cannot promise that stronger invariant.

The map follows its catalog anchor means: world landmark y_i=p_anchor+R_anchor l_i. Retain raw anchor-local l_i and never derive a new local observation by inverting a corrected pose through an already-corrected world point. Its covariance needs J_anchor=[I,-R_anchor skew(l_i)] and J_local=R_anchor, plus anchor↔local cross terms or an unknown-cross bound of the same weighted-sum form. Reprojection currently supplies no such covariance. Until a map uncertainty owner exists, geometry-only map outputs are permissible for visualization/indexing but cannot become independent estimator measurements. Multiple landmarks sharing an anchor require joint correlation accounting or conservative bounds when consumed together. If later map observations depend on current/filter pose, preserve or conservatively account for map↔filter cross-correlation as well.

Introduce one outer Modelica proposal owner whose input is a complete versioned tuple: catalog, raw graph, anchored map, current/reference nominals and all covariance blocks, generation, capture IDs/epochs, prediction timestamp, consumed graph revision and raw-image provenance. Stage optimize→relinearize/covariance→anchor transport→21-state fusion→catalog pose proposal→map reprojection/uncertainty proposal. All identity/domain/PSD/geometry gates must pass before **one** publication. Store graph revision separately from catalog pose/map correction revision: graph captures alter measurements; pose corrections must not manufacture graph edges or require a fabricated capture. Preserve raw edges bit-for-bit.

Any stale generation/epoch/revision, absent selected node, changed raw source, invalid covariance, bad marginal solve, excessive correction, failed map anchor/reprojection, mismatched IMU time or refused optimizer holds the entire incoming numerical tuple, including inactive payload and counters. Successful publication increments one correction revision and atomically commits catalog/map/filter/reference with the graph measurement revision it used. The host only copies validated returned state and performs persistence/version comparison; it never runs numerical fusion.

Keep the existing image-pair lifecycle: an eligible evaluated raw pair is consumed even if its innovation is rejected; a corrected current frame cannot be captured immediately as a fresh independent reference. Graph storage may legitimately reuse images, but then those graph observations are not fresh independent ES15 measurements. Graph fusion preserves referenceEpoch/referenceUsed/lastUsedEpoch and never clears that ledger. A successful corrected pose does not create a new image epoch. Add a graph-correction attempt ledger keyed by generation+graphRevision+factor provenance so reloads and repeated optimization cannot recondition on the same graph proposal accidentally. Attempt consumption is durable outcome metadata even when the numerical tuple rolls back; its transaction contract must explicitly distinguish that audit ledger from retained numerical state, as the existing image gate already does.

## Concrete next source owners and tests

1. `ModelicaPoseGraphCovariance.mo`: undamped full128/256 final relinearization, selected12D joint solves, solve/rank/error-bound validation, gauge-row/selected-node handling. Extend optimizer acceptance to actual full-capacity nonlinear execution before its result can trigger corrections.
2. `GraphGaugeUncertainty.mo`: identity-bound anchor covariance/provenance, relative-to-ENU joint transport, reanchor/eviction, singular-gauge and unknown-cross policies. The required anchor bound is currently missing; registration conditional covariance is not a substitute. Inputs must include anchorCaptureID/epoch/generation, anchor nominalENUpose,6×6 error bound, covariance chart, bound provenance, and either known anchor↔selected-relative cross blocks or the explicit unknown-crossβ policy. Outputs include transported12×12 selected absolute bound and reanchor diagnostics.
3. `SchmidtGraphPoseCorrection.mo`: SPD12 solve, exact input identity/time gating, full gain with optional explicit constraint, full21D conservative covariance, dual right-local injection/reset, complete nominal-domain validation and rollback. Inputs include all15 current nominal components, retained6Dreference nominal, all441jointcovariance cells, selected12D means/covariance, both birth/time tokens, gain policy andω; outputs include every nominal/Pcc/Pcr/Prr component and acceptance reason. No cross block is reconstructed from marginals.
4. `RGBDMapAnchorUncertainty.mo`: local landmark noise, anchor↔local/filter uncertainty policy and covariance output; retain geometry-only consumers separately. Reused-pixel/map updates need their own provenance assumptions.
5. `RGBDGraphEstimatorCommit.mo`: one atomic versioned proposal containing catalog/map/rawgraph/filter/reference and lifecycle diagnostics, then source-issued host persistence only.

Independent acceptance must retain128 nodes,256 edges,350 feature slots and the existing full landmark domain. Test analytically solvable graphs with uncertain translated/rotated gauge; gauge row changes after129 captures; full two-node off-diagonal covariance; arbitrarily positive/negative graph↔filter correlations at PSD extremes; identical fully-correlated estimates (no fictitious independent information gain); constrained zero gain rows with changed covariance cross terms; noncommuting right-local rotations and both resets; variableENUvelocity and preserved body biases; nonrigid multiple-anchor deformation; anchor eviction and landmark pruning; stale reference/current epochs; missing nodes; nearπ, rank-deficient and non-SPD refusals; failed last-stage map rollback; consumed-image/graph replay after reload; fresh-generation reset; complete input/output bytes and all inactive payload; source edit/reset/reload and browser source-issued artifact execution. Use independently differentiated manifold maps and independently pivoted solves; covariance MonteCarlo is supporting evidence, not a proof of bound validity. State explicitly which conditional zero-mean/raw-noise assumptions are exercised and which full registration/correspondence bounds remain unproven.

This design identifies the next implementable conservative policy and its missing owners. It does not establish consistent fullSLAM, general registration covariance bounds, production source admission or throughput.
