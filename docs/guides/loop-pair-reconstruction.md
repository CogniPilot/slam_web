# Readonly boundary and CPU pair reconstruction

The published native layout does not declare the sequential
`RGBDLoopVerification.Verify` matched count or the current descriptor temporary.
`imageFrom().matchCount` belongs to visual localization, which uses a different
reference. It cannot certify sequential matching. Native scratch addresses have
no persistent per-function ABI and may be reused before the entry returns.

Use two readonly observations around the existing image-on `eval_assignments`
call, without another evaluation:

1. **After host carry, before entry:** copy reference matcher payloads with
   `snapshotPriorCatalogReference(layout, memory)`. It reads named runs at
   `previous` offsets, selects `(nextId-2) mod capacity + 1`, and validates
   occupied/id/generation. For a retrieved candidate, pass `{referenceId}`.
   The result contains copied flat arrays, not live views. Its `frame` contains
   matcher data and calibration, not a complete certified Modelica Frame.
2. **After successful image entry, before next carry:** call
   `snapshotSparseImageOutputs(layout, memory)` and copy declared statuses and
   loop candidates. It preserves all 350 slots of `features` and
   `featureEnabled`. Calling `imageFrom` and saving only its returned compact
   rows loses slot identity. Saving the prior catalog only afterwards can
   capture a newly admitted frame rather than the actual reference.

The helpers are in `scripts/loop-catalog-snapshot.mjs` and are browser safe.
Insert them in the research worker at the original `this.entry(...)` boundary
inside `SlamNativeProgram.step`, after its existing carry loop. A wrapper around
`step()` before that carry is a different boundary. Derive all addresses from
the manifest belonging to the actual module, including carry aliases. The
initializer's existing observation may be copied after its successful call;
do not acquire another t=0 camera image. Keep the original call arguments,
return status, input writes and carry order unchanged.

CPU wrappers in `scripts/loop-pair-reconstruction.mjs` compose the shipped
Modelica owners without editing them:

```js
const prepared = await loopPairReconstructionSource(240, 424);
const descriptorArtifact = JSON.parse(compiler.prepare_native_program(
  prepared.source, 'LoopCurrentDescriptorProbe'));
const descriptorKernel = await instantiateLoopPairKernel(
  descriptorArtifact, prepared.source, descriptorDefaults, descriptorOutputs);
const matcherArtifact = JSON.parse(compiler.prepare_native_program(
  prepared.source, 'LoopPairMatcherProbe'));
const matcherKernel = await instantiateLoopPairKernel(
  matcherArtifact, prepared.source, matcherDefaults, matcherOutputs);
```

Initialize the repository-pinned compiler as in `probe-loop-consensus.mjs`.
Every kernel invocation requires every input or an explicit wrapper default;
outputs are copied and input storage is checked for mutation.

For the current image supply raw RGB8 values, raw Z16 codes, calibration and
noise values from that image, and the 350 native pixel rows from
`snapshot.features` (first two columns). Repack padded rows exactly as
`ModelicaSlamSession.writeImage` does. Do not normalize the whole image or
convert Z16 to meters while also applying `depthUnits`. The descriptor owner
applies the recorded scale, near/far limits and contrast threshold.

The public feature output masks and zeros disabled pixels. Reconstruct with
the full padded domain (`activeCount=350`) only when the exact selected extent
is unavailable. Require reconstructed `enabled` to equal the original native
`featureEnabled` in every slot. This does not recover the original extent or
its invalid-count diagnostic: record `extentPolicy=padded-disabled-domain`.
Passing 350 to the matcher is equivalent for its enabled-slot search only
because disabled slots do not participate. Do not label this a byte-exact copy
of the original current Frame. A full original pixel/extent snapshot is better
when the harness has one.

For the reference use copied catalog descriptors, optical points, enabled
mask and count directly; no reference image reselection is needed. Supply the
reconstructed current descriptor/point/enabled arrays to `LoopPairMatcherProbe`.
That model calls `MatchRGBDDescriptors` with `usePrediction=0` and computes
matched-point covariances through `RGBDOpticalPointCovariance`. It uses separate
source/current focal lengths, disparity noise, reference focal and baseline.
Disabled covariance slots and metric-mode covariance outputs remain zero.
Do not call this a reproduction of pre-matcher identity/calibration gates.

Settings mapping:

| Owner input | Sequential source | Retrieved-loop source |
| --- | --- | --- |
| Descriptor ratio/distance | Capture `descriptorRatio`, `maximumDescriptorDistance` | Same shared inputs |
| `seed` | Actual `sequentialSeed` | Actual `seeds[rank]` |
| `trials`, `refinements` | Capture inputs | Same shared inputs |
| Minimum inliers/fraction, inlier distance, RMS | Unprefixed Capture inputs | `loopMinimumInliers`, `loopMinimumFraction`, `loopInlierDistance`, `loopMaximumRms` |
| Calibrated residuals, normalized squared limit | Unprefixed Capture inputs | `loopCalibratedResiduals`, `loopMaximumNormalizedSquared` |
| Coordinate/rank/pivot limits | Capture inputs | Same shared inputs |
| Localization sigma/depth inflation | Capture inputs | Same shared inputs |

Copy actual effective values. The tested source defaults are reference values,
not permission to replace recorded settings. Age, appearance and pose screens
belong in provenance; they are not consensus inputs.

Use `pairMatchIdentity(extracted, originalMatchedCount)` before classification.
The count must come from the actual matching invocation being diagnosed.
An absent baseline returns `reconstruction-only`, a different count returns
`count-mismatch`, and invalid matcher outputs return `extraction-invalid`.
Only `count-identical` can enter the identity-gated probe artifact. Native loop
candidate counts can provide this baseline. Sequential counts require an
additional actual output or an ABI-aware hook inside the specific module; the
readonly host snapshots alone cannot supply them. Upload reconstruction-only
pairs separately without interpreting their consensus result as the original
sequential refusal.

`consensusInputsFromPairs(extracted, recordedControls)` reshapes compiler arrays
to the existing 350-slot JSON schema and requires all 13 consensus controls.
It performs transport only; the caller must enforce the identity gate first.

Validation:

```sh
node --test scripts/loop-catalog-snapshot.test.mjs
node --test scripts/loop-pair-reconstruction.test.mjs
node --test scripts/office-pair-adapter.test.mjs
```

The controls test distinct previous/next addresses, immutable snapshots,
424x240 raw-image descriptors, 350 matches, a sparse interior hole, the last
allocated slot, separate calibration covariances, metric mode and missing or
mismatched counts. They do not constitute an office capture, an observed native
sequential count or software/GPU performance acceptance.

The capture-trace adapter consumes the `capture-office-ci` directory:

```sh
node scripts/extract-office-loop-pairs.mjs /path/to/capture /path/to/new-pairs
```

It verifies capture completeness, native source/module identity and referenced
artifact hashes. It uses `nativeTrace.outputs.features` directly, without FAST
reselection, and requires an exact enabled-mask match after reconstruction.
When `nativeTrace.retainedCurrent` exists, its actual descriptors and count are
used directly. Sequential reference identity is `previousCatalog.nextId-1`;
loop identities and original counts come from actual typed or Real outputs.
The first attempted sequential reason-7 frame is retained for reconstruction;
loop candidates are selected in the recorded 235–250 s window. No truth is read
for choosing or matching a candidate.

Only loop cases whose independent original matched count agrees are written to
`office-pairs.json`. Sequential cases go to `reconstruction-only.json`, which
must not be fed to the identity-gated probe. Absent/unattempted/mismatched cases
and extraction errors are explicit events in `extraction-receipt.json`.
An empty strict result produces `no-identity-verified-candidates` in that receipt
and no `office-pairs.json`. The workflow should then emit a corresponding
consensus receipt/log without invoking the probe or fabricating a case.
`caseErrors` and `missingLoopCountBaselines` summarize rejected extractions
separately from successfully identity-checked cases.

Adapter tests use controlled trace-format fixtures, explicitly marked as such.
Their metadata covers 1,251 file names to exercise the artifact contract; no
flight, native sequential refusal or office closure was executed in those
fixtures. The positive control checks that one matching loop enters the strict
file and one sequential reconstruction stays outside it.
