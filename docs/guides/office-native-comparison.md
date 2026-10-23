# Compare an isolated office loop-anchor candidate

This manual diagnostic builds its own native exporter and compares fixed saved
observations. It supplies no native executable or asset archive from outside
the run, creates no new rendered capture and cannot deploy the application.
Normal build/unit checks and all four sandboxed browser shards remain enabled.

Dispatch the existing `pages.yml` on the reviewed comparison branch:

```text
skip_browser_checks=false
office_loop_diagnostic=true
office_saved_replay=false
office_candidate_comparison=true
```

The new input defaults off. Saved replay and candidate comparison are mutually
exclusive. With both false, the original office capture path is unchanged.

The source-only transport contains a two-line canonical patch and the exact
already reviewed commit object `34c26cb4b3ad6f16a072582115acc68d35178d1f`.
A fresh scratch clone checks the patch tree, imports that existing object and
checks out its exact identity; it does not mint a new commit or push a branch.
The unmodified upstream exporter reads the committed revision and creates
compatibility files in scratch. No generated repository files are edited.
The delta enables the existing guarded loop-anchor policy. Its thresholds,
capacities and guard definitions are unchanged; its existing component,
gauge, covariance and commit paths become active.

The job builds `native_step` at source
`278475ff0d39f648f7b98c76abdc4da9a712ee62` with nightly-2026-02-27, the
verified compiler commit, native allocator, packaging and all other original
default features except the unused gamepad chain. The before/after dependency
feature trees must show only that exact removal. The new binary receives its
own hash. It must export the original baseline with identical compact layouts
and all 15 raw module/parameter/state hashes before any candidate export.
The candidate export must use that same binary and match the locally reviewed
canonical/source/profile identities and complete static manifest.

The initial build envelope is 600 seconds, 4,096 MiB aggregate owned-process
RSS, four Cargo jobs and a 6,144 MiB owned build-cache ceiling. The available
memory floor is 512 MiB. This is a stricter wall envelope than the prior local
build and complete cold-CI throughput is unproved. Each native export retains
600 seconds/3,072 MiB; parity and asset preparation retain 60 seconds/2,048 MiB.
The browser comparison retains 600 seconds/3,072 MiB. Existing guard code is
unchanged. A guard or identity refusal stops the pipeline; there is no automatic
retry, budget increase, compiler substitution or relaxed float comparison.
Nix provisioning and data restoration remain inside the existing 75-minute job.

The fixed input is qualified replay artifact 12488340648 from run 39921157453,
head `43148671d4a77aa89aa2d4df276b016047ae5d6c`. Its archive digest, API
identity, seal-manifest digest and all 3,850 sealed files are checked. It contains
the original 1,251 RGB8/Z16/held-IMU observations, native baseline and qualified
declared-state snapshots. The browser is pinned to sandboxed Chromium
154.0.8037.92, on a blank loopback page with external requests blocked. There
is no World, renderer, GPU work, new route, feature reselection in host code,
truth input, scratch decoding or extra native entry call.

Every saved image hash and original small native input must match. Epochs
0–1205 must match the original presented/native/sparse/reference observations
exactly in their original JSON encoding; finite ULP differences fail. At seven
predivergence targets, both raw declared states must match, and previous state
before the epoch-1206 entry must also match: 15 full named-state checks.
The cutoff was frozen from all baseline frames before a candidate run: no earlier
graph-capture refusal has two distinct verified loop references. The original
JSON encoding loses signed zero/nonfinite representation; new typed state bytes
retain it. No full original hidden state was recorded at every epoch.

Later divergence is collected rather than automatically accepted. The output
retains candidate frame/graph diagnostics, immutable raw images, native
reference payloads and 18 lossless declared-state snapshots. Additional readonly
declared outputs include graph costs and all candidate RMS lanes; unavailable
outputs are explicit, never zero-filled. These are candidate observations and
do not backfill values absent from the original capture. The failed external
component-proposal projection remains unqualified.

The always-upload artifact keeps compiler provenance, logs, both exports,
baseline parity, canonical source receipts, the qualified input and candidate
capture even on failure. Build caches and source worktrees stay outside that
artifact; a running receipt after interruption is incomplete. A complete seal
checks snapshot indexes/compressed/raw hashes and excludes only its own active
root log, final pipeline-status file and manifest. Nested original seals stay
covered.

Collection success is not loop-closure acceptance. Review actual late committed
edge endpoints, accepted canonical correction and subsequent persistence, using
the saved observations and truth only for evaluation. Preserve all 32 frozen
control identities/labels and distinguish unattempted cases from refusals.
Those controls precede the first potential policy divergence and cannot alone
establish alias safety afterwards. No production merge, released consumer pin,
deployment, release or numerical improvement follows from this diagnostic.
