# Diagnose refused loop registration

An office-loop candidate with verification reason 7 failed geometric consensus
or refinement. The verifier matches optical descriptors without a predicted
pose; estimated drift is screened separately, after registration, as reason 11.
Reason 7 alone does not establish that drift caused registration to fail.

The offline probe exposes the consensus subreason, best sampled inlier count,
sampled cost, refinement count and last fit acceptance. Cost sums squared
normalized residuals in calibrated mode, or squared meters in metric mode;
it is not RMS. It compiles the shipped
Modelica owner twice: unchanged, and with four observation outputs in a private
source string. Every original output, including the mask and next random seed,
must agree exactly before a case's diagnostics enter the receipt. Neither
published models nor estimator gates are changed.

Run the analytic component controls with the repository's pinned compiler:

```sh
npm run test:loop-consensus
```

These controls use the full 350-slot domain with 32 active pairs, including
the last allocated slot. They check known rotation/translation, eight outliers,
an insufficient consensus fraction, too few matches, collinear geometry,
singular covariance, a refused weighted solve, idle/invalid settings, disabled
poisoned slots and recovery. This establishes component behavior, not closure
of a rendered office run.

For captured data, supply a JSON object with `schemaVersion: 1`, `capacity`
(3 through 350), and `cases: [{name, inputs}]`. Each case requires
`sourcePoint`, `targetPoint` (capacity by 3 optical coordinates in meters),
and `pairEnabled` (capacity entries). Preserve the original sparse slots.
Use the exact pairs emitted by `MatchRGBDDescriptors`, with source in the
retained image and target in the current image. Supply both
`sourceCovariance` and `targetCovariance` (capacity by 3 by 3) for the default
calibrated residual test. Omitted covariances become zero, which refuses
enabled calibrated pairs; the probe never invents measurement noise.

The remaining `inputs` keys override the declared consensus settings in
`scripts/loop-consensus-probe.mjs`. Copy settings from the actual run. Integer
and Boolean controls are checked before calling Modelica. Do not substitute
ground-truth poses or motion-predicted correspondences.

```sh
node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 2048 \
  --available-mib 512 --log "$HOME/scratch/slam_web/loop-probe.log" -- \
  nice -n 15 node scripts/probe-loop-consensus.mjs \
  /path/to/matched-pairs.json "$HOME/scratch/slam_web/office-consensus-r1"
```

The output directory must be new. It contains original and observed sources,
compiler artifacts and a receipt with input/source/module/compiler hashes,
identity results and failure labels. Compilation and execution are CPU only.
The probe diagnoses supplied pairs; it does not extract descriptors from raw
images, test retrieval, certify body-frame uncertainty, apply the pose screen
or admit a graph edge.

For the office investigation, retain the first refused sequential pair after
the catalog stops growing, and return candidates against the initial retained
keyframes. Keep frame epochs, times, descriptor counts and settings with those
pairs. A valid mission-return claim additionally needs a completed flight with
return position and orientation, late committed loop edges and correction
effects, plus alias controls on the same observations. Early matches within
the starting corner do not establish a return closure.
