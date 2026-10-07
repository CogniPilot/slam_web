# Graph processing and acquisition source review

2026-10-06. Read-only peer review of `RGBDGraphProcessing` and the new
`RGBDFastSLAMReset`, `Initialize`, `Step`, and `Interface` models. Only this
review document was written during the initial inspection. The follow-up below
also adds a separate constructor probe and its runner/evidence. No production
or compiler source was edited by the reviewer; no browser execution occurred.

The initial processing composition was coherent by source inspection. One historical
receipt validation gap was repaired during review; one low-severity fresh-state
constructor gap remained in that checkpoint. The follow-up records its repair
and bounded constructor qualification. This is not execution qualification of
the complete processing or acquisition models.

**Concrete findings**

1. **Historical anchor slot validation: repaired by inspection, regression
   pending.** The initial processing source
   `3831e86e79355a2d506a82bd43fc6dc3d79dd099bdb487b83cf7651378be5e42`
   allowed an otherwise valid last-accepted anchor receipt with `slot=0` to
   pass `Valid`. The reviewed updated source `de5204b3…7a80` adds the historical
   ID upper bound, slot domain `1..128`, and
   `slot = mod(id-1,128)+1`. Its lower ID bound follows from the validated
   selected binding and equality of the two anchor IDs. A regression should
   mutate the slot to zero and to a different valid slot, reject both, and
   retain a valid receipt after its anchor has been evicted. Requiring that
   historical ID to belong to today's ring would reject legitimate ordinary
   capture advancement.

2. **Custom reset seed is not certified by the constructor: low severity,
   open.** `RGBDFastSLAMReset` exposes custom initial rotation, covariance,
   means, and biases. `EmptyEstimator` copies them; `GraphProcessing.Empty`
   asserts fresh chronology and `ValidHeader`, but does not call
   `ValidEstimator`. A negative covariance diagonal or improper seed rotation
   therefore produces a fresh `State` whose subsequent `Valid` is false.
   `Initialize` and `Step` refuse such a state before publication, so this does
   not admit a bad numerical transaction. Add a `ValidEstimator` constructor
   assertion or explicitly document a valid-seed precondition. Constructor
   controls should cover improper rotation, negative covariance, and the
   valid default seed.

3. **Vocabulary lifecycle is an acknowledged integration dependency.** The
   interface still takes externally supplied vocabulary arrays with no
   default or durable state owner. The separately owned measured-image
   vocabulary bootstrap is not yet session wiring. This review does not
   treat that already identified dependency as a new processing defect.

**Warm start, gauge, and index mapping**

`Correct` first obtains the actual `PrepareProblem` from the catalog and graph.
It replaces active graph means from the durable corrected `PoseView`, using
each graph row's `catalogSlot`. It never reconstructs retained corrected means
from raw captures. Optimizer output is mapped back through the same slots;
the chronological oldest retained row is required to preserve its position
and rotation exactly. Reference membership and birth epoch are checked before
forming its chronological graph selector. Current and reference sequences
come from the actual capture ledger, not IDs or epochs.

The graph problem remains the full 128-node/256-factor representation. No
alternate small graph or selected-only optimizer is introduced. The actual
typed `FromCapture`, `ContextFromLedger`, and `SelectFromAnchor` chain checks
the numerical anchor against the proposal's fixed anchor mean and actual
catalog/ledger metadata before selected covariance transport. The adapter
retains all 144 selected covariance entries and nonzero uncertain-anchor
contributions. Same-capture selection uses the existing exact duplicate
binding/mean/covariance checks; filter correction uses the single six-dimensional
measurement branch with the full 21-state prior and gain.

**Revision and historical receipt semantics**

The context and selected binding intentionally identify the **input**
`PoseView` revision. A proposal may increment its output revision only if an
active mean changes, and `Commit` checks that transition before publication.
The fixed anchor still has its input mean. Assigning the proposed output
revision to the input context would violate this existing commit contract.

`Valid` certifies current estimator/view/ledger state and historical receipt
lineage; it does not certify cached receipt mean/bound arrays as a current
graph estimate. Ordinary capture may evict a historical anchor or advance
graph/view revisions. Every successful correction regenerates the anchor
bound and selected result from actual current inputs; previous cached payloads
serve only whole-value retention on refusal. No cached numerical payload is
used as a successful shortcut. A historical receipt should consequently
retain intrinsic domains and internal binding consistency without requiring
current ring membership.

**Acquisition and transactional publication**

`Initialize` and `Step` bind proposed estimator fields to the actual compiled
localization outputs and construct frames from actual selected image features,
calibration, image epoch/time, pose, and covariance. `LocalizationProcessing`
passes the corrected view explicitly to ordinary mapping, advances the actual
ledger, retains all unaffected corrected rows, and replaces only the newly
captured ring slot. A failed outer transaction suppresses the inner accepted
receipt and holds the previous authoritative state.

`Step` requests graph correction only after an accepted publication with
mapping acceptance and exactly one new catalog capture. Noncapture IMU/image
steps do not trigger it. `Initialize` leaves graph correction idle because one
capture cannot form the relative graph. Both orientation components read
`next.estimator.localization.estimator.rotation`; for `Step`, `next` is the
postgraph result. No stale raw capture mean is used as an orientation fallback.
`Step.accepted` reports ordinary publication acceptance independently of
`graphCorrectionAccepted`; a graph refusal retains the already accepted
ordinary publication.

The persistent attempt owner is updated when `Commit` reports `attempted`,
including a later filter/map refusal. The numerical estimator and bound
receipts are published only on complete commit acceptance. Earlier optimizer,
anchor, or selection refusal does not consume a filter factor. Restore must
carry the complete `State`, including corrected means and consumed attempts;
calling fresh `Reset` is not restoration.

**Qualification still required**

Composition controls should exercise a wrapped 128-slot ring with nontrivial
`catalogSlot` mapping, corrected warm start, an evicted historical receipt,
input/output view revision separation, same-capture correction, final
postgraph quaternion, capture-only triggering, and restored attempts after a
late map refusal. Full-state retention on disabled/refused acquisition and
graph paths must be checked against execution. Existing adapter reference
gates do not qualify these new models. Numerical bounds remain conditional
first-order error second-moment bounds; `roundoffCertified=false` conveys no
rigorous rounding enclosure, global nonlinear guarantee, or independent
covariance convergence proof. Rumoca SolveIR/WASM and browser qualification
remain separate obligations.

Reviewed source hashes (full SHA-256):

| Source | SHA-256 |
| --- | --- |
| `models/RGBDGraphProcessing.mo` | `de5204b3f39a5f0f09a7de05006333f39b2fbc2118ab130d2e52d487f4637a80` |
| `models/RGBDFastSLAMReset.mo` | `423ecc5773b3b0d2df48a504ed9226d18b6e2b7afb6d964908c122fe8261069c` |
| `models/RGBDFastSLAMInitialize.mo` | `463024bd90ab5dcee335f1e91b2cc3796c24a729d02184f043205e42c4215d0c` |
| `models/RGBDFastSLAMStep.mo` | `e86f034210d5332487e93b1bff917cf5fb9a8eb19f799460b36c4e42896f5c56` |
| `models/RGBDFastSLAMInterface.mo` | `fe89fc6ecb302ca6e5dd535999aebe987fffbf2cbe2cc9b55a1196f81a88485e` |
| `models/RGBDLocalizationProcessing.mo` | `436b608d087b5260d7360f6ed3b6291417420f1fb8ab8c8ea19881c124e07040` |
| `models/RGBDGraphEstimatorCommit.mo` | `85a408671e610f4ddc0d8088dc97ec4097d7e9cb4b7f2efafd245d621fc8bf9b` |
| `models/RGBDGraphSelectedGauge.mo` | `98b74ad75376c317cc36df81bf5162c9954fad9d61e31b4661a7a8d9bb2d8861` |
| `models/RGBDGraphAnchorBound.mo` | `a135420ce919436edd59bb4e9ab1bc5d7b9a234038db6d0f5bdc57c9de9bcdc8` |
| `models/RGBDGraphCaptureLedger.mo` | `77fde2f25fe5e7d6ad6e764a668db149215da8eed6bff9522a3ef0867bd83dc0` |
| `models/GraphGaugeUncertainty.mo` | `9b346a47823c6cc5ed0bbaf3562d3f946a27ffd729ccc8a14ed063530dc13ba3` |
| `models/SchmidtGraphPoseCorrection.mo` | `27788a60bae368a305974506d03b3ce002347224a53df45ae7de49797d721ed8` |
| `models/ModelicaPoseGraph.mo` | `c93b6acbbe1f8f699fd6f79bb5bfbcf8f80dffb2830ee6666426a98751785932` |
| `models/ModelicaPoseGraphCovariance.mo` | `87c5fc7def8604e9108322ce7a6f9348d659dad69e77eaa0cd44f9a174e61f81` |

**Vocabulary integration follow-up and constructor probe**

The root/pose owners subsequently repaired the custom seed constructor by
adding `ValidEstimator` to the actual `GraphProcessing.Empty` assertion and
integrated the measured vocabulary into the durable session. This follow-up
supersedes the open constructor finding and external-dictionary API dependency
above. No new blocker was found by inspection of the frozen integration.

`State.vocabulary` is the single dictionary owner. Its generation, source
revision, and version must match the actual localization/catalog owner.
`Empty` constructs those bindings from its localization input. `Valid`
requires a ready dictionary whenever the catalog is nonempty; merely restoring
matching version numbers with `ready=false` cannot admit retained histograms.
Enabled word payloads must be normalized with an exact dense-prefix mask;
disabled padding remains opaque.

Outer publication attempts learning only before readiness and only for an
actual fresh, accepted producer frame: the gate checks chronology,
`ValidEstimator(proposed)`, and the shared `FrameBound` predicate over image
identity/time, vocabulary version, pose, and pose covariance. The final wrapper
also requires exact legal observation/capture flags `(1,0)` or `(0,1)` before
learning and requires observation zero during initialization. Invalid or
simultaneously asserted flags cannot mutate pending words. `Learn` validates
the active descriptor domain before changing its pending dictionary.
`frameAccepted and dictionary.ready` gates the catalog/map call, so an
unready dictionary cannot create a histogram. A completed localization step
may still advance while vocabulary learning is incomplete or optional
mapping refuses. Pending words are included only in the accepted outer
candidate, alongside the actual ledger and pose-view transition. Failure of
that outer publication retains the original dictionary and complete state.
An already ready dictionary bypasses `Learn`; later images cannot reassign
historical word identities through this path.

When a producer frame is bound but words remain unready, the final wrapper
reports frame reason 9 (warming); a frame binding mismatch remains reason 8.
Both paths suppress histogram/map admission without confusing incomplete
vocabulary with a wrong frame identity. These changes were reviewed in final
wrapper `5463a6ed…2a84`; the earlier `302244f1…5563` review snapshot is
historical. They do not change the constructor probe closure, whose
localization catalog remains byte-identical to the final catalog.

The public initialization/step models now remove externally supplied
dictionary arrays and pass `minimumMeasuredDescriptors` and
`minimumWordDistanceSquared` to the actual publication owner, exposing
`vocabularyReason`. The model interface, publication signature, and result
field agree by inspection. Restore still requires the complete `State`,
including words and histograms together. Domain/header validation is not
authentication of a substituted, normalized same-version dictionary; no
claim that independently restored payloads can safely be mixed is made.

The numerical `Correct` body through the package end is byte-identical to the
earlier frozen `graph-processing-semantics-mluQxc` source; both hashes are
`b982c279cefe962ab87bcff84a3fe7b76d0906b4610725f9d0acc0bae465830e`.
Thus the vocabulary cutover does not change graph warm start, index mapping,
fixed gauge, typed selection, or attempt consumption algorithms. Whole-state
copies also retain the frozen dictionary across graph acceptance/refusal.

The new `RGBDGraphResetConstructorProbe.Run(time,scenario)` calls the actual
full production `EmptyEstimator` → localization `Empty` → processing `Empty`
chain. A valid default seed completes simulation with `marker=1` in all three
CSV rows. A negative covariance diagonal and an improper rotation separately
terminate at initialization with the exact production constructor assertion.
Generated code retains the dynamic `Run(time)` call, actual constructor call,
and `ValidEstimator`/assertion path. These are constructor rejection controls,
not complete acquisition execution.

The three cases share one 120-second/8 GiB guardian, CPUs 4/5, at most two OMC
workers, and one OpenMP thread. Final run `graph-reset-constructor-xXfy3L`
passed in 15.88 seconds, with peak aggregate RSS 381528 KiB, guardian exit zero,
and equal source bookends. Its durable
[report](artifacts/modelica-graph-reset-constructor/graph-reset-constructor-xXfy3L/report.json)
SHA-256 is `cd56c270102cdcdd634cde0e142e6e323459c998771e79adf528df9b37c62754`.
The earlier `2AoAXd` receipt remains preserved: its simulations had the same
expected behavior, but the first evidence parser searched `.c` files only
and missed the assertion string in OMC's generated literals header. The
probe-only parser was corrected before the fresh successful run.

Follow-up source hashes (final wrapper inspected after the constructor run):

| Source | SHA-256 |
| --- | --- |
| `models/RGBDGraphProcessing.mo` | `f91b1a809b6353e83186f4811c2a8fe7b91611fe3986e95f201de1cad8a7721a` |
| `models/RGBDVisualVocabulary.mo` | `fa28cd4dac6185db7addcd053918170851fd75e0f232dfa3e493ecbd5587fbd3` |
| `models/RGBDLocalizationCatalog.mo` | `21721df70c2699db7b98473bfd5443b77eacf6d852f9e70b7d2ca48a1a50314b` |
| `models/RGBDLocalizationProcessing.mo` | `5463a6ed1a8300ebb289c0df1fd50f5fa89760f21ec1e2edc611e551dcde2a84` |
| `models/RGBDFastSLAMInterface.mo` | `ed396afb2d03edc90369dca0aec0b6dab016be34dd8bdff8dc6df6e1b4a2b51f` |
| `models/RGBDFastSLAMInitialize.mo` | `34d65ba215e482f0ec1555dc9364b040cc4ef01cbe03bd5a09927c4c8329c32f` |
| `models/RGBDFastSLAMStep.mo` | `ad145d78e82485bc6edc698ecda4798f5697ec937d5cbc48ac39bd00a06cb50f` |
| `tests/modelica/RGBDGraphResetConstructorProbe.mo` | `06c90f981fdefb83f4238e147982bd9ead26c06e9e4e01d5142b208ebeb16643` |
| `dev/check-modelica-graph-reset-constructor.mjs` | `130e11e835ee1f37b5e8cde838614fa4c73c9a2584daee4e9aa75baf5e28cf3e` |

The separately owned controlled-producer publication gates are now complete
on that final wrapper, catalog `21721df7…314b`, and processing source
`f91b1a80…721a`:

| Receipt | Controls | Report SHA-256 |
| --- | --- | --- |
| [learning oZZMbM](artifacts/modelica-localization-processing-semantics/localization-processing-learning-semantics-oZZMbM/report.json) | 15 PASS | `3233768c4ff2d3bfee58c14d0357fc8a49508a8a0c576af355c6d16fa53577f6` |
| [main 1GNxRJ](artifacts/modelica-localization-processing-semantics/localization-processing-processing-semantics-1GNxRJ/report.json) | 12 PASS | `5f66caf187aef3e8e66380562a8fa392abab579347e6cfb26dfecec1f535b3d4` |
| [bootstrap 5HPcDN](artifacts/modelica-localization-processing-semantics/localization-processing-bootstrap-semantics-5HPcDN/report.json) | 3 PASS | `b8a59cdeec9b62831d773127862c5b0154f7557bcabf7df3f1a4bb28c76dad7f` |
| [graph vG3jes](artifacts/modelica-graph-processing-semantics/graph-processing-semantics-vG3jes/report.json) | 31 PASS | `25bb5373ee0ad9fbf178a3e9b586dec16ed5dfc27f5a858ceaf4754e4065d18e` |

During this document refresh, the reviewer read the four reports and checked
their retained raw CSV digest/header/three passing rows, simulation success
logs, and guardian exit zero with no signal. Each report records matching
source bookends. No gate was rerun. The publication phases exercise controlled
accepted producer outputs, learning/freeze/retention/refusal, corrected-view
ordinary mapping, capture-slot reuse, and complete outer rollback. The graph
receipt exercises the actual optimizer/typed covariance/anchor/commit chain
on fixed full-domain controlled inputs. These receipts do not execute the raw
camera producer and do not establish a full-session or independent covariance
convergence guarantee. Actual acquisition, Rumoca SolveIR/WASM, and browser
qualification remain separate obligations; the trusted whole-State restore
scope above is unchanged.
