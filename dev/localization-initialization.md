# Source-owned time-zero localization initialization

Implemented 2026-10-06, numerical/compiler qualification pending. These new
sources do not modify the existing step models, compiler, worker or runtime.
They close the missing **source representation** of zero-time initialization,
not connected browser acceptance or full graph correction.

`models/RGBDInertialLocalizationInitialize.mo` extends the current
`RGBDInertialLocalizationInterface`, preserving its complete input/output
state and viewer interface. It adds external `pixels[350,2]`, `activeCount`,
optional `featureScore[350]`, `imageTime=0`, `initializationRequested=1`, and
outputs `initializationAccepted`/`initializationRejected`.
`models/RGBDFastInertialLocalizationInitialize.mo` owns the full90×160
`FastNativeFrame` and `FeatureSelection`, feeds the selected domain into the
core initializer, and exposes the same inherited outputs plus `selectionValid`
and initialization outcomes. It preserves the step wrapper's selection
parameters. There is no smaller image/feature profile.

## Acceptance and state semantics

The initializer does not instantiate `ES15NominalPrediction`,
`ES15SchmidtPrediction`, dynamics, covariance prediction, registration, a
relative-pose update or graph correction. Inherited `h`, `accel` and `gyro`
are unused. No zero/negative/fake duration or altered timestamp is supplied
to a positive-duration owner. `predictionAccepted`, `observationAccepted`
and `observationRejected` are exactly0; `initializationAccepted` is a
distinct source outcome, not a mislabeled prediction.

Initialization requires requested exactly1, time exactly0, a valid image
ledger and frameEnabled exactly0 or1. It validates proper current/reference
rotations and bounded positions, velocity, biases, gravity and density using
the step's existing domains. It validates current15 covariance and the whole
joint21 matrix `[[Pcc,Pcr],[Pcr',Prr]]` with the existing
`SLAMCovariancePSDCheck`. Unlike the step's opaque unavailable-reference
buffers, **all supplied reference nominal/covariance buffers are checked at
initialization**, including when unavailable. Default cold zero cross/reference
covariance is legal PSD. A corrupt supplied prior is refused, not erased.

`initializationAccepted=1` means the supplied time-zero prior and ledger are
valid. An optional unusable image/reference request may still have
`captureRejected=1`, while the prior initializes intact. The outer publication
owner may explicitly require captureAccepted for a catalog bootstrap; it must
not interpret a valid prior as measured image geometry.

Raw images, selected pixels and current calibration feed the existing
`RGBDDescriptorFrame`. The enabled-image count is preserved in `currentCount`
for downstream bridge checks, including invalid values; the frontend receives
zero activeCount if initialization is disabled/refused. Frame admission uses
the same≥3 enabled geometry and noise/extrinsic/origin constraints as the
existing localization step. No descriptor or depth arithmetic moves to the
host. There is no≥8 catalog admission here.

`SchmidtReferenceCapture` performs the existing clone on valid fresh image
capture: current covariance is unchanged, `Pcr=Pcc*S'`, `Prr=S*Pcc*S'`, and
reference nominal equals current nominal in the same right-local tangent.
The complete clone can be singular PSD; this initializer adds no independent
reference covariance and no jitter. The helper also validates the proposed
joint covariance. Current position, velocity, rotation and biases never change.

The existing `SchmidtImagePairGate` must be valid and captureFresh for capture.
It rejects consumed/same-epoch reference rebirth. No image pair is evaluated,
so `lastUsedEpoch` stays unchanged, imagePairEligible/reuseRejected are0 and
relative confidence is0. Accepted capture sets referenceEpoch to currentEpoch,
referenceUsed to0 and commits the entire descriptor/point/mask/pixels/count,
RGB/depth calibration, sigma/noiseFx/baseline and extrinsic/origin snapshot
together. Refusal holds every incoming reference field, cross/reference
covariance, epoch and use ledger. Relative transform/covariance outputs are
canonical identity/zero placeholders under visualValid0, not observations.

World map candidates use the existing calibrated `RGBDLandmarkProjection`
and only accepted reference capture as its pose gate. Features retain raw
enabled-slot pixel coordinates with canonical disabled viewer payload;
tracking is empty because initialization performs no relative registration.
Position/attitude display covariance comes directly from the unchanged prior.

## Outer composition duties and next execution

The enclosing Modelica owner must choose initialization once for a fresh
generation, bind the exact acquisition epoch/time, supply an estimated prior
(never truth), and commit the initializer, Frame builder and any accepted
catalog/map proposal atomically. The initializer alone cannot detect whether
a persisted outer generation was previously initialized. It never guesses a
stable catalog reference ID; referenceBirth binding remains the enclosing
catalog transaction's duty. Catalog replay freshness remains separate from
Schmidt independent-reference freshness.

Initialization→positive-duration prediction must preserve all21 correlations,
reference snapshot and ledger. The first later interval starts at exact time0;
oversized h remains refused by the step until source-owned substepping is
implemented. Reference-qualified catalog time0 bootstrap is already present,
but execution of that owner combined with this initializer is still unverified.

Required independent controls: full90×160/350 frontend; late sparse350 and
dense350; nonzero15 covariance/cross terms; exact selection-Jacobian clone,
singular21 PSD; no current mean/covariance or IMU propagation; unused h/IMU
cannot influence outputs; optional invalid image holds prior; malformed
current/joint covariance, rotations and ledger refuse with complete input
state hold; capture snapshot/calibration exactness; consumed epoch refusal;
full FAST→selection initialization; time0 catalog/map join; first later
prediction, reset/reload and actual source-issued browser artifact execution.
The author staged the full core reference gate in
`tests/modelica/RGBDLocalizationInitializeAcceptance.mo` and
`dev/check-modelica-localization-initialize.mjs`. It preserves raw90×160RGBA/depth,
the350 selected-slot domain (enabled1/37/350), calibrated nonuniform depth,
nontrivial estimated pose/velocity, a full nonzero21 prior, all reference
snapshot fields, and independent descriptor/point/clone oracles. It has28
controls; no FAST detector is instantiated. Constant case-specific subclasses
avoid duplicating28 frontend instances. The runner requires every requested
case to produce strict numeric CSV rows with all20 checks true; full core
qualification additionally requires all28 cases. A selected-case pass cannot
qualify the complete gate.

Two actual OpenModelica attempts on2026-10-06 reached the120-second watchdog
before generated simulation code or numerical results: the initial changing
scenario (`localization-initialize-semantics-8rdp4O`) and the constant case1
(`localization-initialize-semantics-SYwEO1`). Both preserved exact source
bookends, stayed around1.46GiB RSS, and produced no CSV. Durable receipts are
under `dev/artifacts/modelica-localization-initialize-semantics/`. These are
preparation timeouts, not successful numerical or compiler acceptance and not
an8GiB memory-limit failure. The original syntax-failure attempt is separately
retained. A later fixture revision binds the same raw images through Modelica
constant array comprehensions rather than whole-array fixture-function
parameter results; evaluation flags and production sources are unchanged.
The constant-comprehension case1 attempt also reached the120-second watchdog
before generated simulation code or CSV (`localization-initialize-semantics-hsUbmp`),
with equal source bookends and peak1,617,980KiB RSS. Removing the whole-array
fixture function projections did not establish the cause or unblock this
reference compiler. Its source/command/log/resource/report receipts remain
separate from the previous attempts. No initializer numerical controls passed;
all28 controls remain unqualified. No further blind reference runs were made.
Rumoca/browser qualification,
full FAST initialization and enclosing publication remain separate gates.

Full SLAM still requires the graph uncertainty/gauge/full21 correction and
publication owners in [graph-estimator-correction-design.md](graph-estimator-correction-design.md).
