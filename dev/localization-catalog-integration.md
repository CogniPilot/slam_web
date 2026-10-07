# Localization → catalog composition review

Source review and staged composition implementation, 2026-10-06. The new
`RGBDLocalizationCatalog` State/Publish owner and public
`RGBDFastCatalogLocalizationInitialize`/`RGBDFastCatalogLocalizationStep` models
now implement the frame/receipt/publication join described below. The separate
time-zero initializer is also written. Controlled publication proposals have
reference evidence; actual full producer-to-publication execution, compiler
issuance and browser integration remain separate qualification gates. Details:
`docs/localization-catalog-publication.md` and `dev/localization-initialization.md`.
No compiler, worker or runtime was changed. Remaining graph correction and
batch/restore duties below are still designs. The original frozen 18-file
localization gate source is
`97f44b0e4650a83da5c7812b271460e7e2fef9a06a4bc46080ed81a1585dba02`.
Its latest documented browser preparation times out at 60 seconds. That hash
is historical after adding the live source's `currentCount` outputs; it must not
label a new export. Catalog
function reference acceptance, including time-zero bootstrap, does not qualify
this connected graph in Rumoca. Compiler ownership and current package evidence
are recorded in [the handoff](rumoca-agent-handoff.md).

## Existing owners and the exact join

| Owner | Source interface relevant to the join |
| --- | --- |
| `RGBDFastInertialLocalizationStep` | Original 90×160×4 RGB, 90×160 depth; `FastNativeFrame` → `FeatureSelection` → `RGBDInertialLocalizationStep`. `currentCount` now exposes the selected domain extent. Enabled-slot pixel values are retained in existing `features[:,1:2]`; no redundant `currentPixels` array was added. |
| `RGBDInertialLocalizationStep` | `currentDescriptor[350,49]`, `currentPoint[350,3]`, `currentEnabled[350]`; complete current/reference `next*` state; calibrated reference snapshot; `predictionAccepted`, `observationAccepted`, `captureAccepted`, pair diagnostics. `mapCandidatePoint` is a per-image projection, not the retained map (`models/RGBDInertialLocalizationStep.mo:70–100,175–180,222–233`). |
| `SchmidtImagePairGate` | `valid`, `eligible`, `captureFresh` from availability, reference/current epochs, `referenceUsed`, `lastUsedEpoch` (`models/SchmidtReferenceState.mo:222–247`). |
| `ES15SchmidtReferenceStep` | Prediction → relative correction → optional reference capture; `nextCovariance[15,15]`, `nextCrossCovariance[15,6]`, `nextReferenceCovariance[6,6]` and nominals. An eligible evaluated pair advances the consumption ledger even if the innovation is rejected (`models/SchmidtReferenceState.mo:249–358`). |
| `RGBDKeyframes.Frame` | Generation/stable proposal ID/image epoch/time; sparse domain extent and masks; descriptors, optical points, zero-based Integer pixels; both calibrations, optical→body transform, origin, noise model; body pose, full pose6 covariance, vocabulary version/histogram (`models/RGBDKeyframes.mo:15–38`). |
| `RGBDCatalogFrame.Advance` | Old catalog/graph/map, one measured Frame, vocabulary, calibrated world candidate points/masks, `imageFresh`, `poseAccepted`, requested/configuration. Returns one `RGBDCatalogMapping.Result` plus `RGBDKeyframePolicy.Decision` (`models/RGBDCatalogFrame.mo:4–56`). |
| `RGBDCatalogFrameStep` | Existing source-owned optical→body→world projection and mask conversion before `Advance` (`models/RGBDCatalogFrameStep.mo:34–56`). |

The proposed join is a Modelica Frame-builder and enclosing step, not a TS
descriptor/geometry adapter. Build the Frame inside the compiled source from
the same frontend values that the relative update uses. Call `Advance` once,
after the final accepted prediction interval, using the same previous
catalog/graph/map snapshot. Do not call localization a second time to obtain a
different capture result; that would predict twice or evaluate the same pair
twice. Do not Store the catalog before calling `Advance`: its capture branch
already owns retrieval, one Store, raw-edge admission and map publication.

## Frame-building contract

The reusable source-owned `RGBDLocalizationFrame` builder has checked inputs
and `(measurement, accepted, rejectionReason)` outputs. The staged enclosing
`RGBDFastCatalogLocalizationStep` now contains the full FAST/selection/localization
and catalog publication owners. Source existence does not prove execution of
this full model or browser integration.

| Frame field | Exact proposed binding |
| --- | --- |
| `generation` | Outer source/world/reset generation, equal to catalog, graph and map. |
| `id` | `previousCatalog.nextId`; this is a capture proposal ID. It may remain the same across many noncapture images. Never use ring slot or camera sequence as this field. |
| `epoch`, `imageTime` | Checked acquisition identity and calibrated acquisition timestamp, equal to the final accepted prediction time. Epoch is independent of elapsed/wall time. |
| `count`, `pixels` | Actual selected-domain extent and enabled-slot pixels, before viewer compaction: live `currentCount` and `features[:,1:2]`. Core exposes `activeCount` when image-enabled (including invalid values for bridge refusal), full wrapper forwards selected domain extent, never enabled/matched count. Disabled builder slots are canonical and do not read pixel payload. |
| `enabled`, `descriptor`, `opticalPoint` | Exact 0/1 mask → Boolean; `currentDescriptor`, `currentPoint`, all 350 slots. Enabled features must lie within `count`. Preserve slot identity, including sparse slot350. |
| `rgbSize`, `depthSize` | `{90,160}` for these current sources. Do not infer one sensor's intrinsics from the other. |
| `rgbCalibration`, `depthCalibration`, `opticalToBody`, `cameraOriginBody`, `disparityNoise`, `noiseReferenceFx`, `baseline` | The current frame's measured configuration, copied into the Frame. Optical points remain optical-Z RDF; extrinsic and lever arm are applied by existing Modelica projection/registration owners. |
| `bodyPosition`, `bodyRotation` | Localization's accepted post-prediction/post-relative-update `nextPosition`, `nextRotation`, at this image's acquisition time. No ground truth or catalog-corrected pose substitution. |
| `poseCovariance` | Select rows/columns `{1,2,3,7,8,9}` from the **same full** `nextCovariance`: position, right-local body attitude and both off-diagonal position↔attitude blocks. This is not `relativeCovariance`, `conditionalObservationCovariance`, or block-diagonal viewer uncertainty. |
| `vocabularyVersion`, `histogram` | Version bound to the retained catalog/vocabulary. Initialize histogram to canonical zeros in the unprepared measurement. `RGBDKeyframeRetrieval.PrepareCapture` computes the histogram and checks the prepared Frame only in the capture branch. Do not run BoW for noncapture observations. |

`matchCount` and `mapCandidateCount` are not the feature extent. Counting
enabled slots does not identify the last sparse slot. The TS Estimate's
compacted points/features/tracking arrays cannot reconstruct a Frame.
`RGBDKeyframes.ValidFrame` requires a valid SPD pose6 matrix and normalized
enabled descriptors, at least eight enabled features and a normalized prepared
histogram (`models/RGBDKeyframes.mo:195–254`). Preserve its refusal when the
selected pose block is singular; do not inject covariance jitter. Noncapture
mapping intentionally does not impose the full stored-Frame/BoW admission.

The builder must check Real `currentCount` is finite, exactly integer-valued
and in0..350 **before** calling `integer(currentCount)`. Certify enabled-slot
pixels are exact integers in0..159/0..89 before conversion; inactive pixel
payload may be canonical zero without inspecting an invalid inactive selector.
Acquisition identity is supplied as an Integer within the catalog's1e9 bound,
then separately bound by exact equality to core Real `currentEpoch`. Do not
round a floating sensor identity into a catalog epoch. Mask conversions must
refuse any enabled value other than exact0/1. These checks and covariance
selection execute in Modelica, not in a TS Frame reconstruction.

The present frontend has two intrinsic calibrations but one optical→body
extrinsic: its RGB/depth projection assumes common optical axes/origin. This
matches the current simulator geometry. A physical pair with separate optical
origins needs an explicit calibrated RGB↔depth transform/alignment owner; two
different focal lengths alone do not describe that geometry. Preserve the
current single-optical-frame contract rather than silently binding unaligned
physical pixels to this Frame.

## Freshness, reference cadence and image consumption

There are three different decisions: image acquisition, local Schmidt
reference replacement, and catalog keyframe capture. Keep them distinct.
`RGBDKeyframePolicy.Select` chooses catalog capture with minimum interval0.5s,
maximum2s, motion/quality gates and freshness. Local reference replacement
cannot wait for that cadence: the existing pair policy uses each reference
noise only once. Tying every local replacement to a catalog capture would
artificially suppress most relative updates.

A first composition can reuse the existing localization transaction exactly
once with a Modelica-owned reference-refresh request on enabled images. The
existing `frameValid` and Schmidt gates still decide whether replacement
accepts. There must be **two separately named freshness contracts**:

- Independent reference birth: existing `SchmidtImagePairGate.captureFresh`,
  with `currentEpoch > usedEpochAfterAttempt` when capture is attempted. A raw
  image consumed by an accepted **or rejected** evaluated pair cannot become
  another fresh independent local reference.
- Catalog/map processing: a new acquisition receipt, bound to outer generation,
  exact epoch and acquisition time. The image may already have participated in
  the filter pair. It is still eligible for one catalog/map transaction; that
  retained graph information is correlated with the filter.

The policy input comments (`RGBDKeyframePolicy.mo:18`, also
`RGBDCatalogFrameStep.mo:10`) now explicitly distinguish catalog acquisition
receipts from Schmidt independent raw-noise eligibility. For the
composition, `imageFresh` means **not previously processed for this
catalog/map transaction**, not unused raw noise. In particular, do not bind it
to `currentEpoch > localization.nextLastUsedEpoch`: that would prohibit catalog
capture after every accepted relative correction. Recommended source receipt:

```modelica
// Proposed outer-state fields; not an existing compiled implementation.
catalogImageFresh = imageOn and generation == previous.generation
  and imageEpoch > previous.lastProcessedImageEpoch
  and imageEpoch > previous.catalog.lastEpoch
  and imageEpoch > previous.map.imageEpoch;
```

The expression is accompanied by exact identity/range/chronological checks,
not used in place of them. Store `lastProcessedImageEpoch` and its timestamp
after a completed, accepted-prediction image evaluation even if optional
catalog/map admission refuses; success-only catalog/map epochs alone do not
record that attempted acquisition. A backend fault is not a completed source
receipt. This closes duplicate proposal/reload processing without inventing
another independent-noise measurement. Reset changes generation atomically.

Do not use `observationAccepted == 0` as independent-reference freshness: a
rejected innovation may have consumed the pair. Do not rerun `captureFresh`
with the newly captured
`nextReferenceEpoch == currentEpoch`, which would incorrectly label a lawful
same-transaction reference/catalog capture as stale. A successfully evaluated
pair consumes the current image and old reference even when catalog/map later
declines it. `nextReferenceUsed`/`nextLastUsedEpoch` are authoritative; no host
may clear them to produce another visual update.

An initial conservative pose gate preserves today's localization projection
policy: source frame valid, prediction accepted, and either relative correction
or reference capture accepted. A general prediction-only map pose policy would
be a separate explicit source change with its own uncertainty/quality controls;
do not silently equate `predictionAccepted` with all visual quality gates, or
use `confidence` (categorical accepted relative correction) as a covariance.

`Advance` currently rejects capture when the caller supplies `imageFresh=false`;
it does not itself inspect the Schmidt ledger. Its noncapture branch may still
run when the policy is valid but freshness is false. Therefore the new outer
acquisition receipt must gate **requested for the whole call**, as well as
`imageFresh` for catalog capture. Preserve existing catalog/map epoch and
timestamp guards. `RGBDCatalogObservation` owns successful map receipts:
`measurement.epoch > previous.map.imageEpoch`, one consecutive map counter
increment, strict later acquisition time and no raw catalog/graph mutation.
Mapping or graph storage of filter-consumed imagery is not a second independent
ES15 observation; eventual graph correction must use the correlation policy
below. Do not change Schmidt independence gates to enable catalog storage.

## Carried state and atomic publication

Define one Modelica-owned outer State/Result API with these complete owners:

- Current nominal position/velocity/rotation/body biases, `Pcc[15,15]`,
  `Pcr[15,6]`, `Prr[6,6]`, reference nominal and availability. Together these
  represent all21 correlated error coordinates; retain every cross entry.
- Reference descriptor/optical point/mask/pixels/domain extent and all RGB,
  depth, noise and extrinsic configuration; `referenceEpoch`, `referenceUsed`,
  `lastUsedEpoch`.
- Source-bound generation; exact prediction timestamp; camera epoch/sequence;
  `lastProcessedImageEpoch`/time and its completed-attempt receipt;
  `RGBDKeyframes.Catalog`, `RGBDGraphMeasurements.State`,
  `RGBDCatalogMapping.State`, vocabulary identity, configuration and seeds.
- A referenceBirth token issued on accepted reference capture: generation,
  image epoch, capture sequence and a stable catalog capture ID **only if** the
  same image was admitted to the catalog. Use an explicit unavailable catalog
  binding for ephemeral local references, not a guessed latest ID. Later
  admitted same-transaction catalog capture may fill this binding atomically.
- Separate graph measurement revision, catalog/map pose-correction revision,
  graph-correction attempt/consumption ledger and factor/source provenance.

The existing localization snapshot has no generation, stable catalog binding,
birth token, catalog/map/graph state or correction revision. Its state cannot
serve as this API merely by adding display fields.

One final result publishes a complete tuple plus outcomes. Accepted IMU
prediction may commit despite a rejected visual innovation or rejected catalog
proposal. For that transaction commit localization state **and its consumption
ledger** together; use the unchanged old catalog/graph/map from the refused
catalog proposal. If catalog accepts, commit its three proposed owners in the
same publication. Reference snapshots change solely on actual accepted local
reference capture. Do not require successful optional mapping to retry an
already evaluated visual pair. Preserve source diagnostics as outcomes rather
than treating proposed insertion counts as committed map counts.

A backend/status fault, invalid output or rejected prediction interval holds
the pre-frame numerical tuple and whole linear memory, as the current session
does. It must not publish an earlier interval if a later interval fails. A
completed semantic rejection is different from that execution failure; the
source returns a durable evaluated-pair ledger. Any future global numerical
rollback policy must explicitly retain successful evaluation consumption
outcomes, rather than silently restoring freshness.

The eventual graph correction is its own all-or-nothing proposal against the
accepted frame tuple: optimize → valid graph uncertainty → gauge transport →
full21 fusion → catalog/map correction. Refusal holds that proposal's numerical
input tuple; its attempt ledger is durable outcome metadata. Do not undo the
already accepted IMU/image transaction. If the application instead requests one
larger transaction, its source must declare the same numerical versus attempt
ledger distinction explicitly.

## Time-zero and chronological execution

Catalog time0 bootstrap is implemented, not a remaining map-kernel defect:
`RGBDLandmarkMap.mo:89,119–121` permits only an empty first observation at zero;
`RGBDCatalogFrameBootstrapTests.mo` exercises full128/256/350/14400 capacities,
first epoch0, replay refusal and later noncapture updates. The localization
adapter still demands `dt>0` and `frame.time>state.time`
(`src/modelica-localization-session.ts:146–149`); its current core needs
`0<h<=0.02` and accepted prediction. Thus it cannot process a time0 image with
initial time0. Do not synthesize a negative initialization time, fake an IMU
interval or add an epsilon timestamp.

Add an explicit Modelica initialization transaction: validate the estimated
prior and actual frame, run the unchanged full frontend, perform permitted
reference capture and catalog/map bootstrap without prediction, and retain
exact prediction time0. Later frame transactions require all held IMU
intervals to cover the previous accepted time→image time exactly. The current
TS `imuIntervals` validates transport and does not subdivide; oversized held
intervals refuse. A source-owned bounded substep/batch owner is necessary if
the application needs intervals longer than0.02s. No host numerical integration
or clipping is authorized by this composition design.

Unify the source identity domain deliberately: catalog epochs/generations/IDs
are bounded by1e9, while the Schmidt gate and adapter currently accept larger
exact Real/safe-Integer epochs. Check the narrower range before conversion;
never wrap or derive an identity from time. Later map timestamps must increase
even though image-epoch gaps are allowed; map `frame` advances by one, not by
the image-epoch gap. Restore/reset must validate all owners together and reset
generation/source-bound identities without accidentally retaining old receipts.

## Graph correction is a real missing owner

This join would provide visual-inertial localization, retained keyframes,
measured graph proposals and anchored geometry. It is not completed full SLAM.
The full optimizer, graph uncertainty and estimator correction remain required
as specified in [graph-estimator-correction-design.md](graph-estimator-correction-design.md):

1. Actual full128/256 nonlinear optimizer acceptance, then an undamped selected
   **joint12×12** current/reference graph covariance, with its off-diagonal block,
   rank and solve-error/bound contract. Optimizer damping is not covariance.
2. An identity-bound uncertain gauge/anchor6 bound and joint transport to ENU;
   a fixed graph row has zero conditional coordinate error, not zero absolute
   uncertainty. Registration covariance is not an automatic anchor bound.
3. Full21 unknown-cross fusion (or a genuine augmented estimator), complete
   position/velocity/bias gains and dual right-local attitude injection/reset;
   retain all `Pcc/Pcr/Prr` correlations. Reused images are not independent noise.
4. Exact current/reference capture-time and birth identities; absent/evicted
   graph reference endpoints refuse the two-node update. Ephemeral tracking
   references are not automatically graph nodes. Delayed correction needs
   retained pose/IMU replay or smoothing, not a latest-image pose substituted
   into a later propagated state.
5. Atomic catalog/map/filter/reference correction and a consumed graph-revision
   ledger. Raw optical geometry/calibration/factors remain immutable; map
   reprojection uses retained anchor-local points. Map uncertainty/correlation
   is required before visualization landmarks become filter measurements.

## Recommended next implementation and acceptance

Implement the Frame builder plus explicit State/Result join first, with local
reference refresh independent of catalog cadence and no optimizer correction
enabled. Bind to one compiler-issued graph/module; the host only transports raw
arrays, copies returned typed state and publishes a validated result. Preserve
the original90×160 image domain,350 feature slots,128 catalog slots,256 edges
and14400 landmarks. Add initialization separately rather than weakening the
existing positive-duration step.

The next actual connected gate must prove changing calibrated moving RGB-D,
late sparse350, full6 pose covariance including off-diagonal blocks, all21
state correlations, time0 initialization, multiple IMU intervals, accepted
prediction with rejected observation, consumed rejected pair, separate local
  reference/keyframe cadence, catalog capture of a filter-consumed image
  without independent reference rebirth, separate catalog attempt/replay
  receipts, noncapture map receipts, poisoned inactive
capture-only inputs, late map failure, generation/reset/reload and full-memory
rollback on backend faults. Reference comparison must execute this new
composition itself, not infer it from individual owner passes. Rumoca source
issuance and actual browser module execution remain mandatory; only then may
the staged worker replace the explicitly labeled inertial baseline. Graph
correction acceptance is a subsequent required full-SLAM gate, not a UI toggle.

## Implemented bridge, unqualified until independent execution

`models/RGBDLocalizationFrame.mo` now provides
`RGBDLocalizationFrame.Build`. It receives Integer generation/proposal ID/image
epoch and vocabulary version, exact core Real epoch/image time/count, raw
descriptor/optical-point/Real-mask/pixels arrays, actual image sizes/calibrations,
extrinsic/origin/noise configuration, estimated body pose, full current15
covariance, a Real accepted-pose flag and Boolean requested. It returns Frame,
Boolean accepted and Integer rejectionReason. This is a pure Modelica function;
no TS covariance, descriptor, geometry or frame math was added.

The call's metadata comes from the checked outer catalog owner. Build rechecks
its ranges and exact epoch equality, but cannot certify correspondence with a
catalog it is not passed. Outer composition must bind `generation`, `id` and
`vocabularyVersion` directly to the actual catalog, not unrelated valid values.
Chronology, acquisition freshness and prediction acceptance remain outer
transaction duties. The existing source output `features[:,1:2]` is the pixel
binding; disabled slots are opaque. `currentCount` deliberately propagates an
invalid enabled-frame count so Build can reject it rather than silently clip.

Checks proceed metadata → exact count/masks → calibration/extrinsic/noise →
accepted pose → selected covariance SPD → enabled feature payload. Its
configuration bounds preserve the core's sigma(0,1], noiseFx[1e-6,1e6],
baseline[1e-6,1] and origin≤10m contract, with the existing calibration/proper
rotation helpers. All casts occur after their complete domain checks. Only
enabled slots have normalized/zero-mean descriptor, positive optical-Z,
bounded geometry and exact in-image pixel checks. Slot350 is preserved when
enabled; disabled payload remains the canonical empty Frame value.

The builder selects all36 entries of the pose covariance through constant
indices `{1,2,3,7,8,9}`, including both position↔attitude cross blocks, then
calls `RGBDUncertaintyInverse6` without jitter. It does **not** certify complete
15 or21 covariance; the producer owns that prior's acceptance. It accepts
zero or fewer-eight-feature geometry frames, leaves histogram canonical zero,
and never calls stored `ValidFrame`/BoW admission. Capture-only preparation
retains its separate feature/histogram requirements.

Idle or any failure returns `RGBDKeyframes.EmptyFrame()` exactly; no partial
candidate is published. Reasons are0 accepted,1 idle,2 metadata,3 count/mask,
4 calibration/extrinsic/noise,5 pose,6 selected covariance,7 enabled feature
payload. Independent full-domain reference tests are assigned separately;
no compiler or numerical execution was run by the bridge author. This source
addition does not close current connected preparation, receipt, initialization
or graph-correction gaps.

## Reviewed source bookends

These are the original review preimages, not post-addition live export hashes.

| Source | SHA-256 at original review |
| --- | --- |
| `models/RGBDInertialLocalizationStep.mo` | `5dc8fb1cad43bd9f782d0f3de17f810841aeaa897ba76e4d323021c40ded7d7b` |
| `models/RGBDFastInertialLocalizationStep.mo` | `0f93cb037eb40a191b2356f8145b50a12db6c0b7653a0baef26c45f8420e48d6` |
| `models/SchmidtReferenceState.mo` | `7c60e7f7acc36eaf06b99316e0aac73018da669c51c11ef0de8ed62e9695b2aa` |
| `models/RGBDKeyframes.mo` | `f478504753d3ead17a870dff52c26d79f4251c250acda7ac5d4b722d698ca28a` |
| `models/RGBDCatalogFrame.mo` | `b87685664113c41a2f0b0920cdc1c5bc70276936f973afdd70738d0aeda92210` |
| `models/RGBDCatalogFrameStep.mo` | `130d356a283be00c83b1b41b443611dcb802d510edb869dcd4b87bfb02147166` |
| `models/RGBDKeyframePolicy.mo` | `6d756fe26b307f569bbe53a675ea9b1579a75ecc921042f7d9e16a7f64600c41` |
| `models/RGBDCatalogObservation.mo` | `c1efb73856603e69c3a1267e76d1c5f0f47f66a48ab4ab81a49cff1faa24fca8` |
| `models/RGBDCatalogMapping.mo` | `7b83ae46f1574a531e4c3a8b90f119c96c20e293302f621846814951a391dc51` |
