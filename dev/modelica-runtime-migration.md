# Full Modelica runtime migration

Current-source note (2026-10-07): unused raster/thumbnail vision, CPU depth-noise
models and the partial SLAM placeholder have been deleted. Older sections below
are historical measurements or requests, not available execution paths. Current
source and runtime status are in [the composition](../docs/rgbd-inertial-slam-composition.md).

The requested default is Modelica physics, sensor processing and full RGB-D /
airframe IMU SLAM compiled to WASM. Python execution, Rust algorithm nodes,
legacy editor presets, graph fallback paths, deployment dependencies and Docker
execution are being removed immediately. Three.js renders the 3D world and
synthetic cameras. Unavoidable browser UI, I/O, memory ownership and
worker/compiler plumbing remain host glue; physics, sensor processing and all
algorithm mathematics belong in editable Modelica sources.

This migration is not complete. Removal of the old execution paths does not
establish a complete Modelica SLAM replacement. A nominal inertial baseline
must remain an explicitly named INS example, never a substitute advertised as
RGB-D SLAM. Unsupported complete profiles must fail explicitly until admitted.

## Required behavior for complete Modelica acceptance

| Component | Current evidence | Remaining work |
| --- | --- | --- |
| Physics and clock | Rumoca WASM, synchronized RGB/depth at selectable 15/30/60/90 Hz; independent LiDAR 5/10/20 Hz, IMU and GPS rates. GPU browser gates verify exact simulation timestamps, complete held-IMU intervals and the lockstep barrier; viewer remains independent at 30 Hz | Preserve every due event, state and project settings through migration; lower-rate throughput is a different workload |
| Sensor noise, tour and evaluation | IMU/GPS observations, roof availability and runtime evaluation now execute in Modelica sessions on the shipped compiler. Actual browser source edits, save/reload and replay origins pass; numerical fixtures cover 90 frames and every axis/covariance. Tour also passes its integrated whole-plant/browser gates; the Modelica LCG component passes 990 bit-exact steps | Random stream ownership/batching, full-depth admission and full-pipeline throughput |
| Feature detection | Existing Modelica Harris/FAST paths run; complete native-array Harris source compiles | Whole-frame admission, numerical/source-edit parity and compilation performance |
| RGB-D observations | `RGBDFeatureObservation.mo` passes sixteen actual review-WASM numerical fixtures: calibrated sampling, inverse-depth gates, extrinsics, descriptors, changed calibration and recovery | Batch execution, source-edit/persistence integration and worker integration |
| Relative visual body pose | `RGBDRelativePose.mo` passes 26 independent actual browser-compiler/WASM cases, including camera lever arm, arbitrary optical extrinsics, 6-DOF motion, retained-pose sequence, invalid transforms and recovery. Edited Modelica body, stale artifact refusal and JSON artifact reload pass. [Evidence](modelica-rgbd-relative-pose-verification.json) | Connect calibrated descriptors and accepted registration; obtain conservative observation covariance; integrate retained estimator/keyframe state |
| Connected visual observation | `RGBDVisualObservation.mo` wires calibrated raw RGB/depth descriptors, full-350-slot matching, masked rigid registration and relative body pose in Modelica. The sparse mask retains the full slot domain. A separate actual Node WASM registration-to-body-pose chain passes 21 full-14,400-slot cases, including sparse late slots and retained observations. [Chain proof](modelica-registration-relative-pose-chain-verification.json) | Review graph source admission and execution not yet verified. Matcher preparation times out in dependency projection; a generic cache fix is under test. The two-program chain proof does not certify the single compiled graph or production integration |
| Complete registration model | The unchanged full-14,400-pair model now emits a source-issued v3 executable with 12 output stages sharing a complete typed call. Nine Chromium numerical cases, four raw ABI atomicity faults and six metadata refusals pass; 20 warmed complete-model calls average 8.995 ms. [Evidence](rumoca-native-horn-whole-program-verification.json) | Fresh browser compiler build/source production, broad upstream validation, calibrated matcher integration and the separately configured 350-feature frontend. Full14400 timing is not full-SLAM throughput |
| 15-state prediction | F/G, nominal prediction, SO(3) covariance reset and complete generic covariance now pass actual WASM oracles; browser package `94cff417cec6` checks all 675 covariance/transition/noise entries against independent continuous Lyapunov solutions | Compiled fast execution: covariance cold preparation 45.8 s and calls 189–227 ms remain too slow |
| Pose correction | Full review-WASM gate passes: 29 observation cases, all 225 Joseph/posterior entries, 6×16 Modelica solve, all 15 correlated corrections, gates, exact rejection, quaternion branches and recovery | Compiled fast execution and integration with prediction/frontend |
| Registration uncertainty | The unchanged full350 source and an actual Modelica parameter edit pass 28 Node/Chromium worker cases, all 5040 matrix cells, invalid inputs, raw ABI atomicity/recovery, reset and IndexedDB/page/worker source/artifact/state reload. [Browser evidence](modelica-original350-uncertainty-browser-verification.json) | Connect calibrated matched points to the correlated filter with an explicit policy for reused image noise. This conditional unweighted covariance is not an independent absolute pose measurement; live frontend, browser compilation, runtime integration and full14400 admission remain separate |
| Correlated reference correction | Complete `SchmidtRelativePoseCorrection.mo` emits a source-issued 15+6-state executable. Node and Chromium worker gates pass 35 independent cases with all 225 current, 90 cross and 36 reference covariance cells; common global-position uncertainty is preserved. Browser reset, recovery, immutable inputs and IndexedDB/page/worker reload pass. [Browser evidence](modelica-schmidt-browser-verification.json) | Propagate current/reference cross-covariance through prediction, define reference creation/replacement, connect verified conditional registration uncertainty and compose persistent filtering. Reused image measurements need an explicit temporal-correlation policy; this stateless component alone does not establish consistent full SLAM |
| Composed filter core | `ES15FilterStep.mo` connects nominal prediction, F/G, covariance propagation and both 6×16 Cholesky solves to pose correction entirely within Modelica. The unchanged source emits one 636,340-byte native module. Nine independent Node/browser-worker cases pass, including all 225 covariance entries, 252 public outputs, explicit inputs, recovery and atomic ABI refusal. Actual browser source compilation, edited body, IndexedDB source/artifact save and page/worker reload now also pass in an isolated review consumer. [Numerical record](rumoca-native-filter-core-verification.json), [browser compiler record](rumoca-native-filter-browser-import-verification.json) | Warm dedicated-worker execution averages 0.2241 ms/step, 0.2273 ms including filter input/output copying, after the compiler build. This excludes GPU sensors, registration, rendering and the rest of SLAM. Complete-app project persistence, Tier1 canary, reviewed production package and runtime integration remain pending; RGB-D frontend/mapping/loop closure and 10× whole-pipeline throughput are unfinished |
| Map-frame correction | `ES15Reanchor.mo` passes actual pinned WASM: all 225 covariance entries, tilted frames, position/velocity/gravity transport, local attitude/bias basis and nonnegative uncertainty inflation | Compose with verified graph correction in the full estimator |
| Registration | `PointToPlaneRow.mo` passes actual pinned-WASM: all six Jacobians, 36 normal entries, robust weights/cost, finite-difference derivatives, invalid rows and recovery. Full unchanged Eigen6 passes fresh review943 WASM: seven spectra, all 42 outputs, planar nullspace, orthonormality, eigenpair residual and reconstruction. See [the record](modelica-fusion-eigen6-verification.json) | Native function execution, complete registration/observability and geometric/degeneracy tests. A correspondence row and eigensolver do not implement a registration pipeline |
| Relocalization and loops | Modelica appearance retrieval, measured loop verification and bounded128/256 factor admission have separate reference gates. Full128/256 nonlinear optimizer passes20 reference controls including perturbed noncommuting attitudes, loop factors and reversed edges | Actual Rumoca/browser composition, selected covariance convergence qualification, retained gauge bound, same-capture clone handling, relocalization and loop sequences |
| Map | Modelica bounded14400 anchored storage/pruning and corrected-pose mapping have reference gates. Full21-state/map14400 atomic correction passes21 controlled-proposal checks; subsequent corrected-pose frames/capture pass13 | Connect the pose view and capture ledger through outer publication/session save/restore; actual frontend/browser sequences and uncertainty provenance |
| Projects, graph and editors | Modelica LSP and artifact persistence exist for supported components; execution paths are being restricted to Modelica | Complete-SLAM artifact/schema integration, explicit legacy migration rejection and fresh cutover checks |
| Native array artifact execution | Reusable stage loader and single-program consumer pass actual reviewed WASM source probes. The unchanged 160×90 mixed program executes one compiler-issued module with 28,803 outputs, all-output bit comparisons, independent numerical checks, source edits, JSON reload, reset and refusal gates. Full Eigen6 also passes the fresh WASM probe. See [the record](modelica-fusion-eigen6-verification.json). Consumers remain staged outside the application | Complete tensor/function/state profiles, connected estimator composition, actual browser graph/project and deployment integration; broad combined upstream gates |
| Deployment | Portable component artifacts exist; retired Python/Docker setup is unavailable | Same complete Modelica estimator on browser and Linux/NXP hardware, replacement camera/ROS 2 transport |

The review [persistent filter session](../src/modelica-filter-session.ts) now
retains Modelica-produced state and all 225 covariance entries across held IMU
intervals. Six actual Node WASM cases pass independent prediction/correction
oracles, final-interval observation, atomic batch rollback and source-bound
reload. A Chromium worker gate also passes IndexedDB state/source/artifact
save and page/worker reload. [Node evidence](modelica-filter-session-verification.json),
[browser evidence](modelica-filter-session-browser-verification.json).
This adapter remains outside production. Its core requires held intervals of
at most 20 ms; supporting the selectable 30 Hz IMU rate needs Modelica-owned
substeps. It does not provide descriptors, matching, keyframes or loop closure.

The registration-to-body-pose-to-filter connection now passes nine independent
full-14,400-pair frames in both Node WASM and a Chromium worker, with all retained
nominal fields and 225 covariance cells checked. Rejected registration skips the
visual update; recovery and sparse late slots pass. Browser IndexedDB persistence
also survives page/worker reload midway through the sequence. [Node chain](modelica-visual-filter-chain-verification.json),
[browser chain](modelica-visual-filter-chain-browser-verification.json).
This connects three precompiled modules. Known point correspondences and explicit
fixture covariance still stand in for the pending image frontend and uncertainty
estimation. Reference correlations, mapping and loop closure are not covered.

Acceptance includes actual browser room-loop and moving-city sequences, finite
covariance, correct sensor/world coordinates, source edits changing results,
save/reload, rejection recovery and exact selected-rate lockstep timing. Report
full-step throughput separately from individual kernels. The 10× realtime
target remains unmet.

Legacy projects containing Python or retired Rust algorithm execution must
receive an explicit migration error; saved source must remain recoverable for
manual porting. No Python fallback, silent source relabeling or substitution
with an inertial baseline is permitted. Runtime removal requires fresh source,
build and actual-browser checks; old runtime performance and geometry evidence
remain historical and cannot certify the replacement.
Compiler capability probes remain separate from production tests until the
required upstream package is validated and pinned.

## Remaining host mathematics

Removing Python does not make the active runtime's mathematics Modelica-only.
The following owners still contain numerical decisions outside Three.js
rendering; their replacement and integration remain required:

| Host owner | Mathematics still present | Required Modelica replacement |
| --- | --- | --- |
| `src/runtime.ts` depth branch and `src/packet.ts::seededRandom` | Depth Box–Muller noise, disparity uncertainty, dropout and deterministic random stream. IMU/GPS equations have moved to Modelica | `models/SensorObservations.mo` owns complete three-axis IMU/GPS observations in the active runtime. The equivalent separate-loop `models/SensorDepthFrame.mo` passes full 14,400-pixel numerical/source-edit gates on reviewed943 with unchanged native module digests. The complete two-source probe takes 31.11 s and 1.16 GiB peak owned RSS, versus reviewed94's 58 s/3.6 GiB per preparation; these are different timing scopes, not an isolated causal comparison. Kernel evaluation averages 0.70 ms in the fresh shared-machine run. See [the new record](modelica-depth-frame-compact-verification.json). Production integration and random-state/batch ownership remain pending; no per-pixel session fallback |
| `src/world.ts::captureAsync` | Camera depth arithmetic has moved to the GPU: little-endian IEEE754 words pass through RGBA8 and are viewed directly as Float32Array after row byte copies. No per-pixel numeric depth decoder remains | [Raw-depth component checks](raw-axial-depth-verification.json) and [built dedicated sensor-worker startup](raw-depth-application-verification.json) pass. Depth is optical-axis Z, invalid returns are zero, and dense depth-cloud XYZ comes from a GPU shader. GPU readback/row copies, runtime depth noise and the pending typed compiler input boundary still require full-pipeline performance/integration qualification |
| `models/LabQuadrotor.mo` tour setpoints | Indoor command intervals and sinusoidal circuit height command | Integrated into the physics model with held start-of-frame timestamp. Actual pinned-WASM command boundaries/manual override and whole-plant/IMU differential checks pass; runtime host tour equations removed. `models/RuntimeTour.mo` supplies an independently tested scalar component |
| `src/evaluation.ts` and comparison owners | General anchor alignment. Runtime initial-heading truth alignment, quaternion products and ATE/orientation error have moved to Modelica | `models/RuntimeEvaluation.mo` executes runtime truth-reference/error equations, including changed replay origins and accumulator reset. General comparison alignment remains pending. Evaluation truth never becomes estimator input |
| `src/world-navigation.ts::gpsAvailable` | A retained host helper; the active sensor path calls Modelica availability | `models/SensorAvailability.mo` now evaluates the inclusive gate in the runtime before independent GPS draw consumption. Actual shipped-WASM boundary/disabled/changed-geometry fixtures and browser replay pass; numerical navigation validity gates remain separate |
| `src/world-navigation.ts::NavigationHandoff` | GPS/SLAM innovation and covariance gates, bounded weighted rigid fit, robust trimming, frame-change recovery and uncertainty propagation | Complete bounded Modelica navigation handoff with unchanged motion-observability and rejected-innovation fixtures; not yet implemented |
| `src/modelica-feature-raster-export.ts`, `src/modelica-raster-export.ts`, `src/modelica-export.ts` | Score threshold, ties-to-even ranking, deterministic sort, NMS/occupancy and top-feature selection | `models/FeatureSelection.mo` retains the full 14,400-score raster and editable cap through 14,400, with O(N log N) heap sorting, exact square suppression and grid traversal. Independent fixtures pass; reviewed compiler ToDae rejects its dependent function-loop domain before numerical execution. Full-frame and bounded WASM acceptance remain blocked. Legacy thumbnail Euclidean selection is separate and still needs migration |
| Retired `src/modelica-state-export.ts` | TypeScript WAT/RK4 generator deleted; INS now delegates compilation, Solve IR evaluation and integration to Rumoca `WasmSimulationSession` | Actual source edits, analytic dynamics, reset/replay, whole-batch validation and browser cache migration pass. Auto execution is not native-RHS admission. Nonzero replay starts need compiler `reset_at`; measured matched worker cost increases from 0.106 to 0.373 ms. Vision emitters remain pending migration |
| `src/covariance.ts` | Covariance validation/eigendecomposition for display axes | Rendering can consume Modelica-produced axes; numerical validity decisions used by navigation must move with that algorithm |
| `src/comparison.ts` and `src/main.ts` stream comparison | Common-time anchor transform, paired position-error/RMS | Modelica alignment/error outputs; timestamp matching and display remain host glue |
| `src/world-actors.ts` | Six actor trajectories and absolute animation clocks now owned by editable `models/ActorMotion.mo`; Three.js applies returned frames and presents authored assets | Integrated and verified: 4 actual-pin adapter/sensor/evaluation tests, 6 asset/RPC/project tests, 2 final sensor-RPC tests, build and 2 RTX 3090 browser checks pass. All six actor/RGB-D timestamps match the 90 Hz committed time; edited source persists and replays. [Integration proof](modelica-actor-motion-integration-verification.json), [INS-only profile](modelica-actor-motion-performance.json): 21.774 ms/frame, 0.5092 times realtime, viewer 30.49 FPS on a shared machine. Full SLAM and the 10 times realtime target remain pending; [actor details](../docs/actor-motion.md). |
| `src/lidar.ts` | No per-beam host numerical loop remains. GPU shaders create FLU XYZ and packed radial codes and clear invalid samples; the host transfers the original dense buffer | Compiled Modelica consumption of raw `[64,columns,4]` samples remains pending. Rendering binds the interleaved GPU buffer directly; range decoding/selection must stay in Modelica, without reintroducing host compaction |

The INS adapter now recognizes Rumoca's proposed `values_for` and `reset_at`
APIs. It requests all sixteen outputs in one compiler observation when that
API exists, propagates errors without scalar retries, and delegates nonzero
initialization to the compiler's absolute clock. The old public pin retains
scalar reads and refuses nonzero initialization. Thirteen focused tests pass,
including the actual pinned-compiler analytic/source-edit controls and separate
transport-boundary controls. This prepares integration; the new compiler APIs,
rebuilt browser package and measured batch speedup remain unverified. No host
state snapshot, equation evaluator or code generator was added.

ABI addresses, buffer ownership, serialization, scheduling and compiler
validation remain host plumbing. Browser random-stream transport may pass
explicit replayable uniform draws, but must not retain sensor-noise equations
or silently consume draws for dropped/invalid pixels. The seeded generator's
state transition is also mathematics: `models/UniformRandomStep.mo` now supplies
an editable owner and passes bit-exact 32-bit arithmetic oracles, but runtime
batching and conditional consumption remain pending. Neither component source files nor small scalar controls certify
full-frame execution, source-edit persistence, Linux/NXP deployment or full SLAM.

The browser graph now forwards the same typed frame buffers directly to its
connected nodes. Zenoh, local message encoding/decoding and remote-session code
have been removed. Five hardware-browser checks on 2026-10-04 pass: direct
buffer identity/no broker, 90 Hz lockstep with independent near-30 FPS display,
live diagnostics on physics/sensor/detector/estimator/evaluation editors,
actual sensor/evaluation source edits with persistence and replay, and rejected
saved-project recovery. Separate worker copies/session serialization still
exist. RUM-011 requests one compiler-issued connected executable; that fusion
and complete Modelica SLAM remain unfinished.

The [sensor verification record](modelica-sensor-migration-verification.json)
pins source/compiler hashes and bounded phase evidence. Three-session sensor
preparation measured 211 ms after the LCG probe in the same process, rather than
a cold package start; IMU/GPS/roof `set_inputs`/advance/state extraction averaged
0.27 ms and peaked at 3.08 ms over 90 calls on one CPU. These measurements
exclude whole-frame depth, draw transport, rendering, workers/Zenoh and SLAM;
they cannot establish complete 90 Hz or 10× operation.

The [selection verification record](modelica-feature-selection-verification.json)
retains the full source, exact compiler/source hashes and separate strict
bounded/full-frame WASM gates. ToDae currently requires static function-loop
domains, and native emission still refuses FunctionFold/PureCall dynamic
storage. The required upstream path is a source-owned compact dependent-domain
transition and bounded array-backed loop execution; scalar expansion or host
sorting is not an acceptable substitute.
