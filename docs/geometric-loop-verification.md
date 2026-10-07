`RGBDLoopVerification.Verify` turns a retrieved keyframe pair into a geometric
measurement proposal. Retrieval scores do not create graph constraints. All
matching, sampling, fitting, refinement and covariance math is Modelica; the
export script only joins authored sources for Rumoca.

Each frame retains its own descriptors, optical points, mask, image identity,
calibration and camera extrinsics. The verifier checks generation, vocabulary,
ordered identities, image epochs and minimum age before matching. It uses no
estimated-pose prediction to decide the correspondence geometry. Different
RGB intrinsics and camera extrinsics are supported. The current noise model
requires equal stereo baseline and disparity noise across the pair and
explicitly refuses a mismatch.

Descriptor matching preserves the complete 350-slot domain. A sampling index
contains only enabled correspondence indices; it never changes the meaning
of a sparse final slot. Each hypothesis uses three distinct correspondences
and a rigid fit, then scores every enabled original correspondence. The best
support wins, with squared residual cost breaking ties. Park–Miller sampling
uses Schrage decomposition so signed 32-bit Integer intermediates suffice.
The seed is explicit state; disabled and invalid configuration paths do not
consume it.

The best mask is refined by fitting all its inliers and rescoring the full
domain. Acceptance requires the mask to stabilize within the configured
refinement budget, sufficient support and bounded RMS. Covariance is computed
from precisely that final fit and mask. The optical transform follows
`q_current = C*q_reference + t`; covariance is transported into the body's
pose-graph product residual by `RGBDOpticalToBodyEdge`, preserving cross terms
and differing lever arms. See [the transport convention](body-relative-edge.md).

The proposal publishes stable image identities, sparse partners, inlier mask,
optical/body transforms, covariance and information only after every geometric
and uncertainty gate succeeds. Rejected proposals retain canonical identity
rotations and zero measurement matrices. Matching diagnostics and the consumed
sampling seed may still be returned; consumers must check `verified`.

Finite sampling can miss a valid loop. Coherent moving-object correspondences
can form a geometrically valid consensus. The covariance is conditional on
the chosen correspondences and fit; it does not make reused images independent.
Graph admission, duplicate/eviction policy, image-noise correlations and an
atomic graph/filter/map correction remain separate required owners. A verified
proposal alone must not mutate estimator or optimizer state.

Independent semantics checks retain the full 350-feature domain. The 20
matching/consensus controls cover clean sparse and dense geometry, final-slot
partners, outliers, degeneracy, deterministic sampling, refinement and
malformed-input refusals. The complete 29-case suite additionally checks frame
metadata, uncertainty, physical body-point consistency, covariance/information
and disabled paths. Run it with `node dev/check-modelica-loop-verification.mjs`
in an environment providing `omc` (or set `OMC_BIN`). Its default complete
proposal mode uses a normally instantiated OMC model; all29 controls pass with
unchanged source hashes before and after. The script-function
native/interpreter modes remain explicit diagnostics. OMC is only an
independent semantics tool, never application compilation or execution.

Actual Rumoca browser preparation currently refuses a record dimension during
Flatten. Exact source/module identity and the failure are in
[the browser receipt](../dev/artifacts/pr382-87b5570-browser-source-gates/loop-verification-report.json).
Independent OMC evidence does not establish a Rumoca artifact, moving-camera
browser SLAM, persistent graph integration or runtime throughput.
