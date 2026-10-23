# Replay the saved office observations in pinned Chromium

This separate manual diagnostic replays the fixed office capture from run
39910422572, source head `73323cd717b085c689bb5b0bbc4e1e76af33e1e2`,
artifact 12483154021. It creates no new observations and imports no World or
renderer. Modelica mathematics, production defaults and the normal browser
checks remain unchanged.

Dispatch `pages.yml` on the reviewed side branch with
`skip_browser_checks=false`, `office_loop_diagnostic=true`, and
`office_saved_replay=true`. The existing office job then restores the saved
artifact and replays it instead of capturing another mission. With the new
input false, the original capture path is unchanged. Either diagnostic input
prevents deployment. Setting replay true without office_loop_diagnostic true
does not run a replay; both inputs are required.

The artifact ID, archive size/SHA256, source run/head, original seal-manifest
SHA256 and exact Chromium version `154.0.8037.92` are fixed in
`scripts/office-replay-contract.mjs`. Restoration verifies the GitHub API
identity and archive digest before safe ZIP extraction. The replay checks all
3,801 entries of the original seal, retaining its one previously identified
root `seal.log` exception: expected empty, actual SHA256
`88b1420f9c1ecb3ced654d6e77cff7b342e5b33fcea2be60239d1b5869f47b88`.
Every other file must match. The original archive and extracted files are
read only. The current restored static build supplies native assets only;
its 424x240 profile must equal the saved manifest, and every decoded asset
must match the native loader's original declared hash and byte count.

The browser IIFE bundles the production `ModelicaSlamSession`, packet
adapters and existing readonly native observation wrapper. The build refuses
changes to eleven original source files pinned to the capture head. It runs
on a blank loopback page in sandboxed Chromium, with external requests
blocked and GPU disabled. Each saved RGB8/Z16 packet is hash checked. The
initial image is passed once to initialization; later held IMU intervals
predict all but the last interval, then the production advance path consumes
the final interval and its original camera image. No extra native entry,
image capture, synthetic measurement, FAST reselection or truth input occurs.

Every epoch requires exact equality of the captured native pose, presented
diagnostics, graph and loop candidates, raw derived outputs, small inputs,
full sparse outputs and retained catalog payloads. The observer also checks
the actual large RGB/depth native input lanes against their saved pixels.
Only wall-clock `stepMsMax` and `stepMsTotal` are excluded; `stepCalls`, every
gate/reason/ID/count/mask and every other captured float remain exact. A
single differing float stops replay and records its dotted path and IEEE754
hex values. There is no tolerance or fallback to a different browser.

Observed-field equality explicitly reproduces the original JSON serialization:
signed zero becomes zero, nonfinite Numbers become null, and undefined object
fields are omitted. This is a recorded-representation check, not bit identity
for values whose original encoding lost information. Finite nonzero ULP
differences remain failures. The receipt discloses this normalization; it never
applies to newly captured state bytes.

At epochs 80,90,121,122,1175,1200,1205,1206,1250, readonly copies retain all
declared state runs from previous offsets after the original carry and before
the original image entry, and next offsets after the same entry returns.
No scratch locations are read. Copies preserve raw typed bytes, including
Integer lanes, instead of rounding them through JSON numbers. Each compressed
binary has a JSON index of run names/lanes/counts and byte offsets, raw and
compressed hashes, model and state-name identity. These snapshots observe
declared state only. Transient prepared measurements and verified proposal
records are not declared outputs and are not recovered by this packet.

Snapshots are initially written under `snapshots-unqualified/`; per-file
metadata records `qualified:false` at write time. Only a complete 1,251-frame
exact pass with every requested previous/next pair permits renaming the
directory to `snapshots/` and setting the authoritative replay receipt's
`qualified:true`. An incomplete, failed or killed run never qualifies them.
The original capture did not export the full hidden state, so this gate
establishes exact recorded baseline equivalence before observing new named
state, not a byte comparison to unrecorded original hidden state. No proposal
identity, numerical correction benefit or altered-policy safety is implied.

The initial replay limit is 600 seconds and 3,072 MiB under the existing
process-group resource guard, with a 512 MiB available-memory floor. This is
a chosen CI envelope, not demonstrated complete-replay throughput. Dependency
setup and artifact restoration remain inside the existing 75-minute job.
Resource failure, browser/version mismatch and numerical mismatch retain
partial logs/receipts through the existing always-upload step. A `running`
receipt after interruption is incomplete. Do not rerun with weaker bounds or
float comparisons without a separately reviewed decision.

Successful replay output receives its own SHA256SUMS. Only that output root's
active seal.log, final pipeline-status.json and manifest are excluded; original
nested manifests and logs stay covered. A failed baseline cannot be sealed as
a qualified replay.

Local controls:

```sh
node --test scripts/office-replay.test.mjs scripts/office-native-observation.test.mjs
node scripts/build-office-replay.mjs "$HOME/scratch/slam_web/build/office-replay.js"
```

The controls exercise exact comparison, entry/carry ownership, raw image
stride, snapshot qualification and the actual emitted IIFE boot contract.
They do not establish a successful browser replay. The real CI receipt is
the actual-data gate. Existing alias manifests, independent labels and
strict-pair outputs are preserved and are not inputs to this replay.
