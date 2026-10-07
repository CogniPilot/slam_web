# Measured-image vocabulary bootstrap

`models/RGBDVisualVocabulary.mo` owns a bounded appearance dictionary for the
existing `NormalizeVisualWord` / `RetrieveVisualWords` functions. It takes only
measured descriptor records, their masks/domain extent, and explicit ownership
metadata. It consumes no pose, trajectory, scene identifier or truth signature.

The dimensions reuse `RGBDKeyframes` constants: 350 measured feature slots,
49 descriptor components and 256 words. `State` stores Integer generation,
sourceRevision and version; words and Real masks; Integer count; and Boolean
ready. `Empty(generation=1,sourceRevision=1,version=1)` creates empty storage.
Invalid supplied identities remain invalid and are refused by `Valid`/`Learn`.

`Learn` and its `Bootstrap` alias return `(next,accepted,reason)` from:

```
previous, descriptor[350,49], descriptorEnabled[350], descriptorCount,
generation, sourceRevision, version, requested=true,
minimumMeasuredDescriptors=8, minimumDistanceSquared=0.04
```

The Real count is the full domain extent, including disabled sparse slots. It
must be an exact Integer in 0..350 before conversion. Every mask must be exactly
0 or 1; masks past the extent must be zero. Enabled descriptors normalize
through the existing helper. Constant/zero-energy, excessive or nonfinite
active values refuse the complete transaction. Disabled descriptor payload is
opaque and is never passed to normalization.

On a valid learning call, raster-order samples are retained as words only when
their nearest squared normalized distance is at least the configured threshold;
no word is replaced. All candidates are checked before the first insertion.
At most 256 words are stored. Readiness requires at least the configured number
of valid measured records **in that call**, plus at least one learned word.
Repeated identical measured descriptors can therefore freeze a one-word
dictionary; 256 distinct measurements are not required. A low-feature call
can retain useful words but cannot become ready by counting the same small
measurement set across calls. Diversity is a bounded representative policy,
not a clustering or generalization guarantee.

Ready dictionaries hold unchanged forever under `Learn`. Active request inputs
are still validated before an already-ready success; malformed data refuses
while holding state. Restored dictionaries require bounded identities/count,
contiguous exact masks, and zero-mean/unit-energy finite active words. Disabled
word payload remains opaque. `requested=false` holds the full previous state
without checking data or restored state. A rejected restored state is held for
the owner to replace explicitly; it is never silently repaired or published as
accepted. Word uniqueness/diversity cannot be reconstructed from stored state
without storing its bootstrap history; `Valid` checks the normalized dictionary
interface, not a claim about how an external restore was acquired.

| reason | Meaning |
| --- | --- |
| 0 | Idle, complete hold, accepted=false |
| 1 | Learned and frozen now |
| 2 | Valid learning transaction, not yet ready |
| 3 | Already frozen, complete hold |
| -1 | Malformed previous dictionary |
| -2 | Invalid or mismatched ownership identity |
| -3 | Invalid bootstrap configuration |
| -4 | Invalid measured domain/mask/active payload |

The public graph owner must retain this state atomically with its generation
and source revision. It must suppress histogram capture until `ready`, then
bind `words/enabled/version` to the existing retrieval interface. Resetting
the dictionary requires a new explicit `Empty` and clearing all histogram
owners, even if an application would otherwise reuse a version number. Word
identities never drift after a histogram has been stored. The public
`RGBDGraphProcessing.State` now owns this dictionary, and
`RGBDLocalizationProcessing.Publish` stages learning before the first histogram
and commits it with the complete localization transaction. Its15 additional
learning/persistence controls,12 corrected publication controls and3 bootstrap
controls pass; see
[publication evidence](artifacts/modelica-localization-processing-semantics/README.md).
These controlled-producer reference results do not establish zero-setup browser
capture readiness or the raw-camera producer.

The independent OMC gate is `dev/check-modelica-visual-vocabulary.mjs`. Its
43 controls retain all dimensions, including 350 distinct candidate slots and
the 256-word capacity; check known normalized vectors, disabled poison, sparse
slot350, complete holds/refusals and malformed restore; and execute the actual
`RetrieveVisualWords` three times. The expected initial histogram is (1/2,1/2),
the changed current histogram (0,1) retrieves the stored image at cosine
1/sqrt(2), and the revisit retrieves it at cosine 1. These are appearance
proposals only, not independent geometric loop constraints. The runner caps
120s/8GiB on CPUs8/9 and writes scratch plus durable source-bookended receipts.
Reference results are reported separately; this gate issues no Rumoca artifact
and provides no browser/camera/full-SLAM qualification.

## Reference receipt

`visual-vocabulary-semantics-oFcILG` completed all **43/43** controls with the
full domains above, process status0, three strict CSV rows, a successful
simulation and equal source/runner bookends. OMC version was a96aa1a-cmake;
elapsed3.316s, peak owned RSS222,316KiB. The source hash is
`fa28cd4dac6185db7addcd053918170851fd75e0f232dfa3e493ecbd5587fbd3`.
The report, raw CSV, source snapshots, command, MOS and resource receipt are
under `dev/artifacts/modelica-visual-vocabulary-semantics`. This is a
reference function acceptance result, not an issued native artifact, public
persistence integration or measured camera/browser acceptance.
