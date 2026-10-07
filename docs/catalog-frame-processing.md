# Every-frame Modelica mapping

`RGBDCatalogFrameStep` projects calibrated optical points and dispatches each
camera observation through `RGBDCatalogFrame.Advance`. The computation remains
authored Modelica; Rumoca owns production compilation and execution. These
outputs are still proposals for the enclosing estimator's atomic commit.

`RGBDKeyframePolicy.Select` uses the estimated body pose, enabled geometry,
sensor identity and the estimator's image-consumption gate. It selects the first
eligible frame, then waits at least0.5seconds between captures. Translation
of0.6meters, rotation of0.25radians or a maximum2second interval selects a later
capture. All thresholds are named parameters. Image freshness must come from
the consumption ledger, rather than being inferred from a wall-clock timestamp.
The capture owner remains responsible for descriptors, calibration and covariance
admission; the selection policy does not duplicate that full validation.

This policy preserves history independently of camera rate. Capturing every90Hz
image would retain only about1.4seconds in128slots, shorter than the default
five-second loop-retrieval age. The minimum interval instead permits about a
minute of retained capture history, and stationary maximum-interval captures
retain about four minutes. Every due image still runs its frame transaction.

On a capture, the dispatcher runs the existing appearance retrieval, calibrated
sequential/loop verification, catalog admission, measured graph admission and
anchored map transaction. Feature matching and96-hypothesis verification are
inside this branch. A map refusal after successful visual capture holds every
old owner and clears the optimizer proposal.

Between captures, `RGBDCatalogObservation.Update` calls the existing
`UpdateKeyframeLandmarks` with capture disabled. It preserves the complete
catalog and measured graph, keeps the pose revision, and advances the accepted
map-observation counter by one. The sensor epoch remains a separate Integer,
so a gap in acquisition identities never becomes a gap in map update counters.
New points use the latest retained stable anchor; merged points keep their old
anchor-local coordinates. Empty observations can prune the map, and fewer than
eight features need no descriptor/histogram admission. Replay or any late map
failure holds old state. Noncapture output has a canonical empty optimizer
proposal.

## Current evidence

The keyframe policy passes30 independent reference controls at full128catalog
and350feature capacity. A180observation90Hz sweep verifies the minimum interval;
129 actual Store transitions retain254seconds of history after ring wrap. The
noncapture owner passes18 full14400map/350feature/128catalog/256edge checks:
sparse and dense geometry, calibrated independent coordinates, stable anchors,
confidence once per image, empty pruning, sensor-epoch replay, malformed final
slots and complete owner holds. Root verified current source hashes, fresh
strict CSV and actual simulation-success receipts. These measurements include
reference preparation/build/execution; they do not establish WASM throughput.

- [Policy evidence](../dev/artifacts/modelica-keyframe-policy-semantics/README.md)
- [Observation evidence](../dev/artifacts/modelica-catalog-observation-semantics/README.md)
- [Actual dispatch-function evidence](../dev/artifacts/modelica-catalog-frame-semantics/README.md)

The actual dispatcher also passes six full-capacity function checks. Two fresh
noncapture images accept with deliberately invalid capture-only vocabulary,
seeds and registration configuration; a due capture runs the actual visual and
map owners once. Late map failure, stale map epoch and stale graph binding hold
all owners. This qualifies function semantics rather than instruction timing
or execution of the public projection wrapper.

The exact25-file public source export is produced by
`dev/export-rgbd-catalog-frame-source.mjs`. Actual Chromium compilation on the
published PR382 module refuses unresolved lexical dimensions in the nested map
records and the package-qualified seed array. The source SHA is
`fe2e3d23b08e53db36793a0237bd99bb6c6a928a4f79f59a10929a395f804f88`.
[Browser receipt](../dev/artifacts/pr382-9714034-browser-source-gates/catalog-frame/report.json)
records1093.5ms to refusal and no issued artifact. This exact composition was
added to the Rumoca agent's shared handoff. The production compiler pin and
runtime have not changed.

The newly completed rebased PR382 WASM package was also tested on that same
frozen source. It reports mergec016732d5b50 over main3c16819a3 and PR head89f1f9f22;
the GitHub parents and actual module hashes were verified. It still refuses
those dimensions in971.2ms and issues no artifact.
[New compiler evidence](../dev/artifacts/pr382-89f1f9f-browser-source-gates/README.md)
preserves the separate run. The constant-evaluator and conditional dependency
fixes acknowledged by the Rumoca agent are ongoing work beyond that build.

## Remaining integration

The actual dispatch function's reference gate does not execute the complete
public projection wrapper in WASM. Full
SLAM still requires nonlinear optimization, graph uncertainty and consistent
current/reference corrections, coherent publication, tracking-loss recovery,
source editing/reset/reload, moving-image browser acceptance and whole-step
performance measurements. Capture selection assumes an accepted estimated
pose; relocalization must be a distinct path while tracking is lost.

The map kernel now admits the empty first observation at exact simulation time
zero. Seven connected `Advance` bootstrap controls verify capture, replay
refusal, the next90Hz observation and late failure with complete owner holds.
This does not permit equal timestamps on subsequent observations or alter any
sensor timestamp. Current evidence is in
`dev/artifacts/modelica-catalog-frame-bootstrap-semantics/catalog-frame-bootstrap-semantics-e58fiI/`.
The source-owned localization initializer and enclosing publication models are
now written; complete browser execution remains unqualified. See
[localization and mapping publication](localization-catalog-publication.md).
