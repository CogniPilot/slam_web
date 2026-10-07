# Full-frame FAST native preparation

The latest unchanged full-frame attempt passes assignment certification, then
hits the 8 GiB RSS guard before issuing a native artifact. Generic Move-packed
tuple certification and typed Map execution have passed their scoped controls;
full-frame numerical acceptance remains unmeasured.

The unchanged `models/FastNativeFrame.mo` was attempted once at its full 160×90
RGBA size with the frozen compact-call compiler producer. Source preparation
completed, but native schedule certification refused
`native tensor residual has no direct elementwise isolator`. No native artifact
was issued and no numerical fixture executed.

The [verification record](../dev/rumoca-fast-native-frame-preparation-verification.json)
binds the source SHA256
`d42da6959fee8a629c6a9850fef31559ba692f5bafd3001ba69106200f34ea11`
to compiler source closure `1f3a82c9…` and producer `662903fb…`. It records the
single 247.718-second attempt, sampled peak RSS 7,444,588 KiB, and successful
compiler source checks before and after. The guard allowed 600 seconds and
8 GiB RSS with a 16 GiB host reserve; four workers used CPUs 6/7 at nice 15.
These are preparation resources, not execution throughput.

The complete checked Solve payload was retained before refusal. It is
1,822,514,705 bytes with SHA256
`f9e02852e6d5abd0890e39a2f0801f45951318f95066e4aa073762c015863c84`.
That payload and the 36 MiB source inventory remain under
`$HOME/scratch/slam_web/tmp/fast-native-frame-compact-calls`.
[Small exact slices and summaries](../dev/artifacts/fast-native-frame-compact-calls/manifest.json)
are archived for review. The full wire was streamed, never loaded into a Node
JSON parser or reserialized into compiler authority.

Two independent frontiers are visible:

| Frontier | Retained evidence | Required generic work |
| --- | --- | --- |
| Tuple certification | Node 0, scalar program 0 has 8,187 operations and a terminal `StoreOutputRange(start=8026,count=160,stride=1)`. The selected first producer is `Move(dst=8026,src=2)`; register 2 holds a scalar subtraction. The isolator requires a directly selected tensor subtraction. | Prove original Move-packed scalar residual tuples against the complete original target/store inventory, retaining ordered prefixes and fault dependencies. |
| Representation duplication | 12,936 patch-call sites have 12,936 distinct owner IDs. The first two owners each contain an exactly byte-identical 133,037-byte body. The pure-call table occupies approximately 1.73 GB of the wire. | Investigate checked body storage and helper compilation reuse while preserving distinct owner identities, contexts, call interfaces and fault provenance. |

The source inventory contains 85 scalar programs with 687,719 operations and
13,448 outputs, plus 96 compact Map families. Only the first two complete owner
bodies were compared; whole-table sharing equivalence has not been proved.
Matching function names or source spans cannot establish that equivalence.

The first refusal occurs before a patch-call capability rejection. It differs
from the separately retained FAST `currentScore` coupled-target recurrence;
neither boundary was weakened. This attempt supplies no phase-specific timing,
numeric acceptance, production integration, full SLAM or 10× performance claim.

After the generic [Move-packed tuple fix](native-move-packed-tuples.md), one
unchanged full-frame attempt passed assignment certification, then refused
native emission at canonical typed `Map`: owner 0, operation 95, source bytes
1351–1355 (`1:22`). The region reads a captured `Real[24]`, compares adjacent
elements in source order, and lazily selects each of 22 results. At that
checkpoint, frame planning and emission did not support this typed Map operation.

The [after-fix record](../dev/rumoca-fast-native-frame-move-packed-verification.json)
retains the 245.353-second attempt, peak 7,445,636 KiB, unchanged compiler source
bookends, and exact native refusal. Its complete Solve is byte-identical to the
earlier capture, so the retained representation counts and owner slices still
apply. No native artifact was issued; zero numerical cases executed. Generic
typed Map execution and repeated call-body storage were separate frontiers;
the following scoped Map work addressed the former.

After [generic typed Map execution](native-typed-map.md) passed its scoped
gates, one further unchanged full-frame attempt stopped at the RSS limit after
258.979 seconds. Peak sampled RSS was 8,462,916 KiB, a small sampling overshoot
of the 8 GiB guard; host reserve remained above 49 GiB. The complete Solve again
had the same exact wire digest, and assignment certification passed. No native
artifact or numerical result was issued, so this resource stop identifies no
specific unsupported opcode.

The [typed-Map full-frame record](../dev/rumoca-fast-native-frame-typed-map-verification.json)
binds frozen producer `f189cd3c…` to unchanged source closure `698314b4…` and
retains the full raw capture in Scratch. It preserves the 12,936-owner/body
representation frontier without merging owners or rewriting the model. The
separate [original patch-function numerical proof](../dev/modelica-fast-patch-verification.json)
does not replace this full frame gate. It verifies276 raw-bit checks for the
unchanged function and a compiled source edit in Node and Chromium workers,
including IndexedDB reload. Full160×90 admission and numerical correctness
remain unverified.
