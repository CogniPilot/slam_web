# Editable Modelica pose-graph numerical component

[ModelicaPoseGraph.mo](../models/Optimization/ModelicaPoseGraph.mo) implements bounded nonlinear
pose-graph optimization in Modelica. Its **full optimizer is not yet numerically
accepted**: exact128-node/256-edge preparation times out in structural incidence.
The source-issued manifold edge component has passed actual WASM residual and
Jacobian tests. The [verification report](../dev/modelica-pose-graph-verification.json)
keeps these claims separate.

## Pose and edge convention

Each pose stores a world position p and a proper body-to-world rotation R. Updates
are p'=p+dp and R'=R Exp(dtheta), matching ES15 world-additive position and
right-local attitude. An edge i→j measures translation z in body i and the
relative rotation Z=RiᵀRj. Its six residuals are

```
t = Riᵀ (pj - pi)
E = Zᵀ Riᵀ Rj
r = [t - z; Log(E)]
cost = 1/2 Σ rᵀ information r
```

This is a product of a body-relative translation residual and an SO(3) logarithm;
it is **not** the full coupled SE(3) logarithm, whose translation uses V⁻¹. The
[Ceres pose-graph example](https://github.com/ceres-solver/ceres-solver/blob/master/examples/slam/pose_graph_3d/pose_graph_3d_error_term.h)
also expresses relative translation in the reference pose axes. The rotation
residual here specifically uses SO(3) Log rather than quaternion vector error.

The analytic manifold Jacobian blocks, in [dp,dtheta] order, are

```
Ji = [-Riᵀ, skew(t); 0, -Jl⁻¹(Log(E)) Zᵀ]
Jj = [ Riᵀ,      0; 0,  Jr⁻¹(Log(E))   ]
```

The inverse left/right SO(3) Jacobians use their small-angle series and the
standard half-angle expression; the right convention follows the
[primary GTSAM SO(3) derivation](https://borglab.github.io/gtsam/so3/). The tests
independently differentiate quaternion residuals. The nonunique logarithm chart
within0.001rad of π is explicitly refused, rather than choosing an unstable axis.

## Bounded sparse optimizer

Named nodeCapacity/edgeCapacity parameters default to128/256. Node and edge masks
must be exactly0 or1. Endpoints are exact, one-based indices into stable input
slots; they are independent of active counts, including sparse holes and the
256th edge. The host must preserve those slot identities when copying graph
state. Disabled edge padding is not a constraint.

Node1 is active and fixed exactly, in both position and attitude. All other
active nodes must connect to it. Modelica validates finite bounded active poses,
proper rotations, endpoints, full symmetric positive-definite6×6 information,
and connectivity. Singular/indefinite information is refused; a caller must not
invent full observability for a degenerate geometric measurement.

The numerical stages are explicit functions: validation, edge linearization,
block factorization, sparse normal products, PCG, manifold retraction and descent
selection. The operator sums edge JᵀΩJ products and diagonal damping without
constructing a768×768 Hessian. PCG uses full6×6 block Cholesky preconditioning,
including translation/rotation cross terms. Inner loops have hard16 outer,
96PCG and12backtracking ceilings; default budgets are8/48/8. Damping, relative
residual stopping, bounded position/angle increments and exact objective descent
checks control updates. A truncated PCG direction is usable only if the real
nonlinear objective accepts its trial.

Inputs are prior graph state plus measured edge constraints; Modelica owns all
optimization math. It returns prior poses unchanged on an invalid graph or when
no descent is accepted. Node1 and inactive slots retain their input values. A
later failed trial retains the best earlier accepted iterate. There is no pose
clamping, truth input, JavaScript optimizer or Python production path.

| Status | Meaning |
| --- | --- |
| 2 | At least one objective-decreasing manifold step accepted |
| 1 | Valid graph, no accepted descent; prior state retained |
| -1 | Invalid node/configuration input |
| -2 | Invalid edge/mask/endpoint/rotation/information |
| -3 | Active graph disconnected from the fixed gauge |
| -4 | Initial objective/logarithm chart unusable |

status1 is not a convergence guarantee. The bounded budgets can leave residual
error; costBefore/costAfter, acceptedIterations and pcgIterations expose the
actual numerical result. The edge diagnostic model's valid output reports its
logarithm chart, while the full graph validates proper input rotations first.

## Verification and present compiler frontier

The independent test oracle uses quaternion residuals, central finite-difference
Jacobians and a pivoted dense solve for a small rotated graph. It is confined to
tests. Its loop fixture has biased odometry and an independent relative-pose
closure; cost and pose error decrease with an exact first-node gauge. Separate
full128/256 fixtures include a late edge, sparse slots, correlated SPD
information, malformed masks/endpoints, disconnected nodes, reflections,
singular/indefinite matrices, nonfinite inputs and near-π rotations. An LDL/BFS
oracle checks refusal fixtures independently of Modelica's Cholesky/propagation.

Actual source-issued ModelicaPoseGraphEdge WASM checks16 rotated/small-angle
residuals and analytic Jacobians against those independent oracles, plus P-byte
immutability, near-π rejection/recovery, reset, JSON artifact reload and stale
source refusal. Its fixed3×3 Modelica helpers use explicit SO(3) arithmetic;
currently unsupported typed transpose/multiaxis views are not replaced by host
math. Graph-capacity loops remain intact.

Full ModelicaPoseGraph preparation on immutable producer3f6b4c3 timed out at
60.097seconds (peak66184KiB), with no native/Solve artifact. A normally finalized
15-second perf window has zero lost samples. Actual diagnostics identify
structural incidence expression2816 -> OptimizeModelicaPoseGraph ->
PGValidateGraph/PGProperRotation/PGCholesky fold walks, already on selected
scalar0; membership visits reach142.4million. Leading self symbols are hashing
(23.11%) and projection expression traversal(21.49%). No runtime optimizer
performance or complete graph numerical acceptance follows from this profile.

The original draft conditional-loop/Boolean-output refusals, matrix/view
capability refusals, tooling failure and corrected final gate are preserved in
the evidence. The actual full optimizer numerical test remains skipped until a
matching complete source-issued artifact exists. No production compiler pin or
runtime is changed by this component.

## Running the explicit numerical gates

```
RUMOCA_POSE_GRAPH_EDGE_ARTIFACT=/path/to/source-issued-edge.json \
  node node_modules/vitest/vitest.mjs run \
  --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-pose-graph.test.ts
```

Add RUMOCA_POSE_GRAPH_ARTIFACT for the full graph gate and optional
RUMOCA_POSE_GRAPH_REPORT / RUMOCA_POSE_GRAPH_EDGE_REPORT to save numerical results.
The full gate checks independent optimization agreement, all128nodes/256edge
storage, invalid-state preservation, no-descent preservation, gauge/SO(3),
recovery/reset/reload and source binding. Compiler issuance is separately bounded
under the native producer; no Cargo or upstream edits were made for this source.

This component does not detect or accept loop closures. Appearance retrieval
must be followed by descriptor/geometric verification before a loop edge enters
this graph. Production map reanchoring and the complete retrieval→verification→
optimization→map chain remain required integration work.
