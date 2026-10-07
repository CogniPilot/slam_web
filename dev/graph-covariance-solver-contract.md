# Selected graph covariance: matrix-free variational/tree contract

2026-10-06. Proposed source owner `ModelicaPoseGraphCovariance.mo`, full128
nodes/256 factors, up to762 free coordinates, selected12-dimensional **joint**
block. This is a conditional local covariance calculation, not global nonlinear
SLAM consistency. The numerical source/gate is being implemented; no reference,
Rumoca or browser acceptance is implied by this derivation.

## Existing source boundary

`ModelicaPoseGraph.mo:91` (`PGEdge`) supplies the actual residual and Jacobians:
`[Ri'*(pj-pi)-tij, Log(Zij'*Ri'*Rj)]`. Translation errors are additive in
world coordinates; rotation errors are right-local body angles. This is a
product residual, not the coupled SE(3) logarithm. `PGLog` refuses its near-pi
chart. `PGLinearize`/`PGNormalProduct` retain all active factors; gauge row1 is
fixed, with zero coordinates and zero operator output. The optimizer's
`PGDampedFactor`/`PGPCG` damping is not statistical information.

`RGBDGraphMeasurements.PrepareProblem` already divides each raw information
matrix by the number of active factors, accounting conservatively for arbitrary
edge-error correlations conditional on valid individual edge bounds. The new
owner receives **that** information, does not divide again, and does not claim
independence from the inertial/filter estimate or the absolute anchor.

At the accepted final poses, independently re-evaluate every active `PGEdge`
and require its chart validity; the existing `PGLinearize` currently discards
that flag. On active, non-gauge coordinates define

```
H = sum_e J_e' W_e J_e,     W_e = already-inflated information,
B = S',                    Q = B' H^-1 B.
```

S selects current/reference world-position/right-local-angle blocks in that
order. An anchor selection contributes six zero columns to B, not artificial
unit information. Duplicate selections may repeat the same block and yield a
singular12D covariance; downstream provenance may impose distinct identities.
Inactive nodes never enter H. No dense762-square production object is needed.

The first profile requires exactly symmetric finite active W and checked SPD6
pivots. Existing `PGCholesky` permits approximate symmetry, which alone is not
an exact symmetric-operator certificate; this owner must not silently apply
ordinary CG to that nonsymmetric product. Refusing asymmetric information is
an explicit stricter covariance gate, not changing stored raw factors. A later
source-owned canonicalization needs its own statistical/roundoff contract.

## Stronger than a global coercivity constant

Choose a connected spanning tree rooted at gauge1, preserving each selected
edge's original direction and both6-by6 Jacobians. For tree child v, write its
row as `A_v x_parent + C_v x_v`; C is whichever endpoint Jacobian belongs to
the child. Do not reverse a measurement or assume C=identity. The tree Jacobian
T is square block lower triangular in discovery order, with diagonal C_v.
Require every C_v nonsingular and every tree W_v SPD. Then

```
H_T = T' W_T T > 0,
H - H_T = sum_non_tree J_e' W_e J_e >= 0,
0 < H^-1 <= H_T^-1.
```

This proves anchored rank without guessing a Hessian condition number. All
original active factors remain in H; the tree is a preconditioner and error
majorant, not a substitute graph. Support theory studies these PSD
comparisons and factored preconditioners generally; the specific bound below
is derived here for this owner. [Boman and Hendrickson, Support Theory for
Preconditioning](https://doi.org/10.1137/S0895479801390637).

A cheap checked6-by6 approximate inverse D can certify C's nonsingularity in
real arithmetic when `||I-D C||_inf < 1`; then
`||C^-1||_inf <= ||D||_inf/(1-eta)`. The same condition with a rigorously
**enclosed** eta is a finite-precision proof. An unrounded measured eta is a
numerical diagnostic only. This distinction follows the verified inverse
norm/Neumann argument in [Rump, Verified Bounds for Singular Values, Lemma2.1](https://www.tuhh.de/ti3/paper/rump/Ru10a.pdf).

No spanning tree with invertible child blocks is a conservative refusal for
this first profile. It does not prove that a more general partially observable
factor graph is singular. Current PGEdge is full relative6D on admitted charts;
more general partial factors need a different rank certificate.

## Exact residual upper bound for arbitrary selected iterates

Let X contain12 arbitrary approximate solutions (including X=0), and recompute
R from the actual undamped operator, not the PCG recursive residual:

```
R = B - H X,
L = B' X + X' B - X' H X,
Q = L + R' H^-1 R,
U = R' H_T^-1 R,
L <= Q <= L+U.
```

Proof: substitute `X=H^-1 B-E`, expand L, and cancel both linear terms.
`Q-L=E' H E=R' H^-1 R` is PSD. Inverse-order reversal and congruence give
`R' H^-1 R <= R' H_T^-1 R`. The result is a **matrix** inequality for the
whole12D joint covariance, including every off-diagonal correlation, not
12 scalar variance tolerances. Approximate `S X` alone has no such guarantee.
Independent RHS PCG need not give exactly symmetric `S X`; the symmetric
variational expression is authoritative.

Consequences: X=0 gives the exact selected tree inverse upper bound; exact
convergence gives U=0 and Q=L; early termination is safe in real arithmetic
but may produce an unacceptably loose bound. An iteration cap is not proof of
convergence. Standard CG error estimators also distinguish residuals from
energy error and require justified upper-bound parameters. [Meurant, Papez
and Tichy, Accurate Error Estimation in CG](https://arxiv.org/abs/2101.03931).

## Linear-time tree operations

Store parent, original edge index, discovery order, C inverse/factor, A and W
Cholesky per active nonroot node. For f with root zero, solve `T' q=f` in
reverse discovery order:

```
q_v = C_v^-T (f_v - sum_child A_child' q_child).
```

For a full preconditioner application, let `w_v=W_v^-1 q_v` through two6D
triangular solves, then forward discovery order:

```
x_root=0,
x_v=C_v^-1 (w_v-A_v x_parent).
```

For U only, no forward pass is required. For all12 residual columns let
`z_v=L_Wv^-1 q_v`; accumulate `U=sum_v z_v' z_v`. This is the full Gram
matrix, not a diagonal approximation. Parent-before-child ordering is required
irrespective of numerical node IDs or edge direction.

Use independent PCG with H and this SPD tree preconditioner; hold X[128,6,12]
and bounded work vectors. Clamp neither eigenvalues nor covariance. Reject
nonfinite arithmetic, nonpositive direction curvature, bad pivots/closures,
invalid endpoints/masks/chart, disconnected active nodes and out-of-domain
selectors. Recompute HX/R at completion. A requested=false call returns a
canonical invalid/zero result without reading optional poisoned graph payload.
Refusal publishes no partial covariance and does not mutate the graph.

With N<=128, E<=256, d=6 and k<=12: tree discovery via bounded edge scans
costs O(N E), factor preparation O(N d^3+E d^3), each PCG iteration per RHS
O(E d^2+N d^2), and selected-Gram/error assembly O(E d^2 k+N d k^2).
Storage is O(E d^2+N d^2+N d k+k^2), under a few hundred KiB of F64 numerical
arrays. No N-square array is allocated. Twelve separate solves are the first
simple owner; block-CG is an optional later optimization with its own rank and
roundoff treatment. No runtime/10x throughput is inferred from these counts.

## Floating-point certificate boundary

The displayed inequalities are exact-real identities over the issued final
Jacobians/information. Ordinary binary64 Cholesky, PCG, residual recomputation
and Gram accumulation **do not** turn them into an outward enclosure. A fixed
small diagonal added to L+U is not a proof and is not part of this contract.
The first numerical owner exposes `roundoffCertified=false`; consumers must
not advertise its output as a rigorous binary64 covariance bound. Numerical
acceptance tests establish toleranced agreement only.

A complete outward implementation can enclose the small C inverse/SPD factors,
residual R, backward tree q, and z using directed-rounding interval operations
(or a separately proved compiler-safe operation-error enclosure). If Z is an
exact enclosed residual transform, `Z=Zhat+Delta` with certified
`||Delta||_F<=delta`, then

```
Z' Z <= Zhat' Zhat + (2||Zhat||_F delta+delta^2) I.
```

Add a separately enclosed spectral error for the computed L/Gram sums. Such
roundoff compensation is a quantified numerical error bound, not observation
noise or retained covariance jitter. It must preserve the root's exact-zero
selected directions: calculate only nonroot selected coordinates, then embed
zero rows/columns. Bound overflow/underflow and arithmetic reassociation as
well as ordinary rounding; WebAssembly's lack of rounding-mode control makes
an explicit enclosure helper/compiler arithmetic contract necessary. Rump's
paper explicitly separates approximate factors from verified inclusions;
reference success alone cannot discharge that backend requirement.

## Acceptance and smallest full-fidelity implementation

1. New editable source package with the complete128/256 interface, checked final
   relinearization, connected oriented-tree factors, zero-damping matrix-free
   H, twelve tree-preconditioned solves and variational full12D upper/error
   output. Default F64; no global/state profile changes.
2. Independent reference gate retains128/256 storage and compares all144 cells
   with a test-only independent dense762 Cholesky solve. Verify PSD gaps
   `Q-L` and `L+U-Q`, early X=0 and tight converged X, noncommuting rotations,
   translation/attitude correlations, reversed tree edges/order, anchor/current/
   reference/duplicate selections, inactive poison, disconnection, singular W,
   asymmetric W, near-pi and pivot refusal, canonical idle/failure publication.
3. Actual Rumoca source admission and browser execution on the same complete
  source, plus an explicit outward certificate if a rigorous binary64 bound
   is required. No reduced graph, diagonal marginal or damped inverse qualifies.
4. Feed the selected conditional joint block into GraphGaugeUncertainty with
   a retained uncertain-anchor bound, then the full21-state unknown-cross
   fusion and the root-owned atomic graph/catalog/map/filter transaction.
   This solver alone does not validate correspondence/noise bounds, anchor
   provenance, selected identity/time, map uncertainty or optimizer convergence.

### Required gauge chart conversion

This owner's position-error blocks are in the graph input's world coordinates,
not automatically the anchor's body coordinates. The documented
`GraphGaugeUncertainty` transport uses anchor-relative translations. Form
`t_i=R_anchor'*(p_i-p_anchor)` and `Q_i=R_anchor'*R_i`, and rotate the complete
selected covariance by `D=diag(R_anchor',I3,R_anchor',I3)` before that transport.
Then its `C=diag(R_anchor,I3,R_anchor,I3)` restores world-additive coordinates.
Supplying this owner's world covariance directly as relative covariance would
double-rotate position blocks for a nonidentity anchor. Both off-diagonal
position/attitude and current/reference blocks must follow the same conversion.

## Breadth-first-only numerical reference (preserved earlier source)

`models/ModelicaPoseGraphCovariance.mo` implements the complete fixed128/256
storage contract and selected12-dimensional joint result. Its tree is now
breadth-first, with original edge ordinal breaking equal-depth parent ties;
both PCG and the residual Gram use that same checked tree. All original active
factors remain in H. No dense graph matrix occurs in production source.

The breadth-first-only OMC reference completed all19cases in60.098s and
224,796KiB peak owned RSS. All full144-cell tight comparisons and PSD-gap,
zero/early-iterate, rank/configuration refusal and anchor checks pass. The gate
is nevertheless **13/19, not accepted**: six strict1e-10 convergence assertions
still fail at the unchanged96-iteration cap. No threshold was relaxed. The
largest tight difference from the independent dense inverse is6.407e-8.
Full receipt: `dev/artifacts/modelica-graph-covariance-semantics/graph-covariance-semantics-QwrrJk`.
See `dev/graph-covariance-reference-diagnosis.md` for preserved earlier failures,
backend preparation diagnosis and the independent tree/convergence probes.

The reference harness disables OMC's documented backend `evalFunc` partial
evaluation pass and returns plain function tuples rather than a mixed-record
equation; production covariance math is unchanged by that compiler workaround.
This is only an OMC numerical reference. Rumoca compilation, browser execution,
overall SLAM integration and a directed-rounding enclosure remain unqualified.

## Stronger solve policies and implementation scope

The actual residual-export receipt is
`dev/artifacts/modelica-graph-covariance-semantics/graph-covariance-semantics-LOyR5G`.
It completed in59.451s with224,216KiB peak owned RSS,475strict columns and40rows.
All19criteria remain unchanged and the gate is still13/19. Final recomputed
Modelica residual norms across nonanchor columns are6.583e-7..1.248e-6 for the
full graph,5.235e-7..1.015e-6 for reversed edges and4.119e-9..8.042e-9 for the
active96-node case. Those columns all reached96iterations; anchored columns are
exactly zero. The independent finite-difference diagnostic's decreasing history
is consistent with these actual results, but is not a source iteration trace.
Residual replacement is therefore not established as the missing improvement.

Two policies can change iteration behavior without changing H, the selected12D
quantity, the tree covariance majorant or the acceptance threshold. The minimal
six-direction balancing policy is now implemented and qualified only as an
operator below; it did not meet the convergence target or improve reference
runtime. Block CG and clustered/multilevel extensions remain review-only.
Connectedness/SPD alone does not guarantee convergence in96iterations.

### Block solve with explicit selection/rank ownership

Solve all selected columns together with block preconditioned CG. Matrix-free
edge application can reuse each6x6Jacobian/information block across the12columns,
reducing repeated slicing and factor loads. Storage remains O(N*d*12+E*d*d),
with small12x12Gram matrices; no762x762production array is required. Block Krylov
methods must handle dependent residual/search columns rather than invert a
singular full12Gram matrix. This is a real issue for duplicate selections and
anchor columns, not an exceptional malformed graph. [Dubrulle's original
block-CG paper](https://etna.ricam.oeaw.ac.at/vol.12.2001/pp216-233.dir/pp216-233.pdf)
describes orthogonalized formulations and the rank-breakdown problem.

The initial selection matrix has an exact structural rank: retain each unique
nonroot coordinate once and carry an explicit12-column reconstruction map.
Anchor columns map to zero; repeated coordinates map to the same retained
column. Later numerical rank loss requires a checked orthogonalization/deflation
policy, retaining every original right-hand side and its reconstruction. A
discarded search direction must never discard an original residual or selected
cross-covariance output. Recompute the entire original `R=B-HX`, retain all144
entries of L/U, and test convergence on each original column. On breakdown,
retain the last valid X/bound; do not manufacture a zero residual or add Gram
jitter. Full128/256tests must include changing block rank, duplicates, anchor
columns, mixed convergence and complete144-cell comparisons. The96-step work
policy must count block operations explicitly and be compared with the current
twelve scalar solves; an iteration count alone is not a throughput claim.

### Small checked coarse correction with the existing tree solve

An alternative keeps scalar PCG and augments the tree preconditioner with a
small coarse basis Z of full column rank. Define `F=HZ`, `E=Z'F`,
`K=E^-1`, `Q=ZKZ'` and `P=I-HQ`. The symmetric balancing inverse
preconditioner is

```
C = Q + P' H_T^-1 P.
```

This is the balancing construction studied by [Nabben and Vuik,
2006](https://diamhomes.ewi.tudelft.nl/~kvuik/papers/Nab06V.pdf). Its singular
deflated counterpart needs a projected solve and reconstruction; adopting that
counterpart would need a separate checked iteration contract. The symmetric
form keeps ordinary SPD PCG, with one fixed preconditioner during each solve.

For this application, the following exact-arithmetic SPD proof is direct. For
any v, `v'Cv=(Z'v)'K(Z'v)+(Pv)'H_T^-1(Pv)`. Both terms are nonnegative. If both
vanish, `Z'v=0`, hence `Qv=0`, `Pv=v`, and SPD of `H_T^-1` implies v=0. The same
argument holds for any fixed symmetric SPD K, although an inaccurate coarse
solve can weaken convergence. A checked small Cholesky therefore owns rank,
pivot and finite-value refusal; no damping/noise inflation belongs in E. This
preconditioner is not itself the covariance majorant: U still uses the original
checked tree inverse, so the established arbitrary-X bound remains applicable.

A minimal basis has six shared rigid-motion directions on nonroot vertices:
world translation `dp=a, dtheta=0` and world rotation
`dp=-skew(p_i-p_anchor)*w, dtheta=R_i'*w`, with the root explicitly zero. At any
nonroot vertex, the six-coordinate basis block is invertible for a proper R_i,
so these six columns are independent. For a stronger graph-level policy,
partition active nonroot vertices into disjoint nonempty clusters and give each
cluster its own six directions; disjoint support preserves rank. Cluster
construction must be deterministic and graph/source owned, with empty clusters
excluded and a declared bounded coarse capacity. This is a basis for iteration,
not an approximation to the selected marginal or a replacement for full graph
factors. It offers no automatic96-iteration guarantee.

Precompute F using the full matrix-free H, and assemble the small E. For an
input v, compute `a=K Z'v`, `w=H_T^-1(v-Fa)`, then
`Cv=Za+w-Z K F'w`. This uses one tree solve, coarse matrix/vector products and
O(N*d*m)basis contractions per application. Retaining Z and F costs O(N*d*m),
and E's factor costs O(m*m); there is no full graph inverse. A fixed six-column
first profile has particularly small storage/setup. Preserve `X=0` when
`maximumPCG=0` so the existing zero-iterate tree-bound control stays exact; do
not silently replace it with a coarse initial guess.

For extensions beyond the implemented six-direction profile, independent full-domain tests should compare the
coarse operator with a test-only dense construction, check transpose consistency
and positive quadratic forms, verify anchor/single-root/cluster-rank refusal,
and repeat all19unchanged residual and144-cell criteria at96iterations. Ordinary
floating evaluation still exposes `roundoffCertified=false`; this proposal adds
neither an interval certificate nor statistical independence assumptions.

## Minimal six-direction balancing implementation and result

`Coarse`, `BuildCoarse` and `BalancedSolve` now implement the six rigid-motion
columns, normalize each nonzero column, precompute full undamped HZ, and factor
the symmetric6x6Galerkin operator with checked `PGCholesky`. Nonfinite/rank/pivot
failure is a refusal, with no tree-only fallback pretending to qualify the new
profile. `Select` retains the existing public inputs/outputs and status domain;
coarse preparation failures use the existing tree/pivot status. The basis and
coarse factor remain fixed throughout each twelve-column solve.

`maximumPCG=0` skips coarse preparation and keeps X=0; anchor-only graphs also
skip the nonexistent free coarse subspace. Every original active edge stays in
H, all selected12D/cross blocks remain intact, and U still uses the checked tree
inverse. No optimizer damping, diagonal noise or covariance inflation was added.

The separate full128/256operator reference
`graph-coarse-semantics-khcmND` passed4/4 in3.924s/311,516KiB. It compares the
actual Modelica operator with independent finite-difference Jacobians, full
dense H, dense tree inverse and direct `Q+P'TreeInverseP` application. Two
nontrivial vectors compare all1,524free coordinates on full/reversed graphs and
1,140on the active96-node graph. Symmetry, positive quadratic forms, exact zero
gauge/inactive rows and canonical zero-H coarse rank refusal pass. This does
not certify all floating quadratic forms or an outward enclosure; the
exact-arithmetic SPD argument and ordinary floating admission scope remain
distinct.

The subsequent unchanged19-case covariance gate
`graph-covariance-semantics-ThDvSm` completed71.197s/230,136KiB with equal source
bookends and40strict475-column rows, but remains **13/19, not qualified**.
The only six failures are the same1e-10convergence assertions at96iterations.
Maximum recomputed residuals are1.085e-6(full),1.098e-6(reversed) and8.421e-9
(active96); the largest144-cell tight difference is6.411e-8. All covariance
comparisons/bounds/refusals and the exact zero-iterate tree bound still pass.

The minimal coarse choice is therefore an implemented, independently checked
operator, **not a demonstrated convergence or performance fix**. Reference
elapsed time increased about19.8% versus the59.451sresidual-export baseline;
the runs were sequential with the same limits, but are not an alternating
benchmark. Current covariance source SHA is
`87c5fc7def8604e9108322ce7a6f9348d659dad69e77eaa0cd44f9a174e61f81`.
No further production changes or full runs are authorized by this receipt.

## Paired full-H principal-block preconditioner

`Pairs`, `BuildPairs`, `PairSolve` and `BalancedPairSolve` now retain the complete
free128-node domain while partitioning its coordinates into64small blocks:
free nodes(2,3),(4,5),...,(128,padding). Each physical block is the corresponding
principal submatrix of the full undamped H. Every active original edge contributes
its endpoint diagonal blocks; an edge with both free endpoints in one pair also
contributes both off-diagonal blocks. No loop is omitted from H or these diagonal
contributions. Checked12D Cholesky factors replace a dense graph inverse.

Let D be the direct sum of physical principal blocks. For an SPD anchored H,
each nonempty principal block is SPD, hence D is SPD on the free subspace.
The preconditioner is C=Q+(I-QH)D^-1(I-HQ), Q=Z(Z'HZ)^-1Z'. Its quadratic form
is x'Qx+[(I-HQ)x]'D^-1[(I-HQ)x], which is strictly positive for nonzero free x:
if both terms vanish, Qx=0 and (I-HQ)x=x=0. The same fixed factors and coarse
basis are used throughout PCG. Range/mask/active-endpoint checks precede array
indexing; invalid principal factors produce canonical empty Pairs and Select
refusal, without an alternate preconditioner fallback.

Inactive/padded coordinates have zero physical coupling and zero right-hand
side/output. Their artificial positive diagonal equals the maximum active
physical diagonal in the pair (or1for a wholly inactive pair). It cannot change
the physical solve; scaling it avoids spurious relative-pivot rejection of valid
large-information singleton/mixed-active blocks. Active principal SPD checks
and the1e-12relative threshold remain unchanged.

This numerical C is not substituted into the covariance error bound. The checked
spanning-tree T, Backward and whitening still form R'T^-1R for R=B-HX, with the
same L=X'B+B'X-X'HX and U=L+R'T^-1R. Since H>=T>0 on free coordinates,
the existing exact-real majorant derivation is unaffected. Ordinary floating
results remain explicitly `roundoffCertified=false`. Defaults48, maximum96,
strict residual1e-10 and original19-case all144/PSD/early-bound/refusal criteria
are preserved. Independent pair operator11PASS and final full-gate receipts
are documented in graph-covariance-reference-diagnosis.md; a historical19PASS
before the last padding fix must not substitute for the final-source gate.

Final current-source evidence: pair operator11 `graph-pair-semantics-9fekYS`,
original strict19 `graph-covariance-semantics-gaFAHN`, and actual omitted-parameter
48default19 `graph-covariance-default-semantics-5mQTLG` all PASS with source
`0860150bdf5c8046067068032c2093d9caa30e52acbd804649eddd2ce56f83b0`.
The earlier pending/historical evidence is superseded only for these exact
fixture scopes; all receipts remain preserved.
