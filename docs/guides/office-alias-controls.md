# Freeze and extract same-observation alias controls

This separate manual adapter prepares **unlabelled control candidates** from
actual native loop attempts outside the scheduled late-return window. It does
not render a scene, force a pair, label an alias, invoke the consensus probe or
change production/CI behavior. The default late-window extractor, workflow,
settings and descriptor/matcher/covariance kernels remain byte-identical.

Freeze selection before truth labels or offline probe outcomes:

```sh
alias_root="$HOME/scratch/slam_web/profiles/office-alias-NEW"
mkdir -p "$alias_root"
node dev/rumoca-bounded-run.mjs --seconds 90 --rss-mib 512 \
  --available-mib 512 --log "$alias_root/selection.log" -- \
  node scripts/freeze-office-alias-controls.mjs /path/to/capture \
    "$alias_root/selection" --max-cases 64 --seconds 60
```

The capture is read only. Selection scans the receipted contiguous prefix at
5 Hz, epochs 0..1174 (time less than 235 s), and accepts only successful,
matching-epoch image traces with an explicit native `loopAttempted` flag and
bounded candidate rank. Candidate IDs/current ID come from native arrays or
indexed typed lanes, bound to `previousCatalog.nextId`; a parsed pose estimate
or localization match count is never substituted. Only native reasons
0, 6, 7, 8, 9 and 11 reached descriptor matching. Earlier-stage refusals,
missing attempt flags, invalid identities, empty queries and unrequested
frames remain explicit events. Zero candidates without a request is not
failed retrieval.

`case-manifest.json` fixes membership by epoch then rank, including current and
reference IDs/epochs, native reason/count availability, native reference-payload
binding and frame hashes. `case-manifest.sha256` and `selection-receipt.json`
bind that exact manifest and selector implementation. Frame hashes cover the
stored JSON wholesale; selection does not inspect its truth/pose values or
offline registration outcomes. Keep the manifest unchanged after freezing;
labels belong in a later sidecar keyed by its hash and case key.

The default cap is the first 64 eligible attempts. Choose another fixed cap
**before** freezing/looking at outcomes, up to the domain bound of 4,700
(1,175 epochs times four ranks). A cap of zero inventories omissions without
selecting cases. `omittedCases` lists the exact remaining observed attempts;
they are not silently replaced by successful extractions. Missing counts or
reference payloads remain in the selected set and are rejected explicitly at
extraction. Invalid identities that cannot name a real native pair are events,
not invented cases. Bounded selection may leave an unscanned recorded suffix;
partial capture leaves an unrecorded suffix. Both epoch ranges and counts are
disclosed in `coverage`. No claim covers those omissions.

Then extract using only that frozen selection:

```sh
node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 2048 \
  --available-mib 512 --log "$alias_root/extraction.log" -- \
  node scripts/extract-office-alias-controls.mjs /path/to/capture \
    "$alias_root/selection" "$alias_root/pairs" --seconds 120
```

Each output/selection directory must be fresh. `--seconds` is a cooperative
budget checked between units of work; the external owner above supplies the
hard time/RSS boundary for synchronous native compilation/evaluation. The
scripts accept at most 600 cooperative seconds. Input JSON/image artifacts are
bounded to 8 MiB each; no resolution, frame rate or pair settings are altered
to meet a budget. Selection and extraction receipts checkpoint progress.
After a hard kill, `running` with pending cases or an absent complete manifest
is unfinished work; keep the external resource log. Do not infer absence or
acceptance from interrupted output.

The extractor verifies the frozen manifest/receipt, source implementation,
capture receipt/native manifest, actual candidate membership, frame/payload/
image hashes and native module/source identity.
The frozen frame inventory must be a complete, ordered contiguous prefix with
valid hashes and consistent case bindings. Both current and reference frame
JSON must match that inventory, including all metadata bytes, before any strict
promotion. Changing only reference truth metadata after freezing is refused
even if raw images, kernel outputs and native matched counts are unchanged.
It calls the unchanged
`loopPairReconstructionSource`/`instantiateLoopPairKernel` owners. Native catalog
reference descriptors/points/masks/counts are used directly. A retained current
payload is preferred; otherwise actual sparse native pixels bypass FAST and
the reconstructed enabled mask must equal the native mask across all 350 slots.
The opaque disabled domain is padded to 350 and identified as such. Camera
calibration/noise and loop settings/rank seed use the existing exact adapters.
No predicted-pose matching, truth-based correspondences or kernel changes occur.

`office-alias-pairs.json` is written only when at least one loop has valid
matcher outputs and an independently supplied native candidate matched count
that agrees exactly. Count agreement is the existing count identity gate;
unavailable native partner arrays are not claimed independently observed.
Missing/invalid counts, mismatches, mask/payload errors and unfinished cases
stay outside this strict file. The adapter does not write reconstruction-only
cases, and it never reads or merges the default CI `office-pairs.json` or
`reconstruction-only.json`. All strict cases retain the frozen manifest hash,
raw observation/reference hashes, effective settings and kernel/compiler IDs.

Read `extraction-receipt.json` even if the process exits successfully. It gives
each selected case's outcome, processed and pending inventories, case errors,
missing counts and the original omitted/unscanned/unrecorded coverage. A strict
file can represent only a processed subset after interruption. Its nonempty
existence or the receipt status is not an alias-acceptance result. No eligible
strict cases means no strict file, with explicit absence/rejection receipts.

For bounded work across the frozen domain, an optional `--partition FILE`
accepts exactly `schemaVersion: 1`, `selectionManifestSha256` and `ordinals`.
Ordinals must be a nonempty increasing list of unique indexes into the
unchanged `case-manifest.json` cases, with no labels, replacement cases or
settings overrides. Declare the subset rule before inspecting outcomes;
independent label sidecars must not be used to retain only favorable labels.
Bind the partition to the original manifest hash, not a rewritten selection.

```sh
node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 2048 \
  --available-mib 512 --log "$alias_root/partition-extraction.log" -- \
  node scripts/extract-office-alias-controls.mjs /path/to/capture \
    "$alias_root/selection" "$alias_root/partition-pairs" --seconds 120 \
    --partition /path/to/predeclared-partition.json
```

The receipt preserves all original members and coverage. Every member outside
the partition remains pending; it is never counted as tested. Partition hash,
ordinals, requested/completed cases, unfinished requested keys and outside count
are explicit. A completed proper partition still has `status: partial` and
`stopReason: declared-partition-complete`. A budget stop remains
`cooperative-time-budget`. This is neither automatic resume nor a coverage
claim for the other members. Use a fresh output directory for every run.

Only after verifying this gate may the existing bounded consensus diagnostic
be run on the separate strict file:

```sh
node dev/rumoca-bounded-run.mjs --seconds 300 --rss-mib 2048 \
  --available-mib 512 --log "$alias_root/consensus.log" -- \
  node scripts/probe-loop-consensus.mjs "$alias_root/pairs/office-alias-pairs.json" \
    "$alias_root/alias-consensus"
```

Skip that command when no nonempty strict file exists. Never use sequential or
reconstruction-only pairs as substitutes. Probe `pass` means the original and
observed kernels agree, including when both refuse; read the actual geometric
result. Preserve all native rejections and aliases that pass geometry, since
later pose/graph guards may be their only protection.

After freezing, independently adjudicate candidates as genuine overlap,
distinct repeated scene/alias, or ambiguous from the saved images, scene
geometry and measured truth used **only for evaluation**. A manifest entry is
not automatically an alias. Do not use labels to change its membership or
match settings. Any empty/ambiguous/omitted label coverage remains an acceptance
gap. Native reason 11 alone does not distinguish estimator drift from an alias.
Office acceptance still needs actual late committed edges and correction
evidence, plus no false committed loop/correction on the labelled controls.
This adapter does not replay the hidden pose/graph stages or produce that
end-to-end acceptance evidence by itself.

Controls, kept separate from the default CI scripts:

```sh
node --test --test-concurrency=1 scripts/office-alias-controls.test.mjs scripts/office-alias-partition.test.mjs
node dev/rumoca-bounded-run.mjs --seconds 45 --rss-mib 2048 \
  --available-mib 512 --log "$alias_root/native-control.log" -- \
  node --test --test-concurrency=1 scripts/office-alias-controls-native.test.mjs
node dev/rumoca-bounded-run.mjs --seconds 45 --rss-mib 2048 \
  --available-mib 512 --log "$alias_root/reference-negative.log" -- \
  node --test --test-concurrency=1 scripts/office-alias-reference-frozen.negative.test.mjs
```

The native control uses synthetic image/trace fixtures with the real pinned
kernels. It checks retained and reconstructed current payloads, a sparse
interior hole/final slot, native-count mismatch, absent counts, mask/reference
failures, a frozen manifest unaffected by extraction, and an explicit unfinished
budget receipt. Its supplied baseline counts exercise transport; they are not
independent observations of native Verify on an office flight. No browser,
actual office capture or alias/closure acceptance is claimed by these controls.
