# Physical flight replay and browser compilation

The capture harness now loads the same pinned CogniPilot library as the app.
It records the exact compiled workspace, checks all 641 Modelica sources against
the frozen files, and retains upstream provenance. The reference replay verifies
those identities before accepting the capture.

The new RTX 3090 capture contains 13 synchronized 848×480 RGB8/Z16 frames and
36 held IMU intervals from the actual Modelica controller, motors and plant.
OpenModelica replay passes all 24 checks, with six visual updates, feature
matching and map growth from 161 to 540 points. This 0.4-second sequence does
not establish loop closure, long-flight accuracy or browser WASM throughput.

Local evidence:

- `dev/artifacts/modelica-rendered-flight-frames/flight-GTxral/`
- `dev/artifacts/modelica-rendered-flight-slam/rendered-flight-slam-CzULRY/`

The official Rumoca PR396 package from run 37718588656 reports
`0.10.2/85090ddc2e45`. Its archive hash matches GitHub's artifact digest.
Unchanged full-capacity browser-worker checks still fail:

| Entry point | Result |
| --- | --- |
| `D435FastSLAMStep` | ToDae refuses a guarded `problem.nodeCount` read after 5.71 s |
| `D435FastFeatures` | No artifact within 60 s |
| `RGBDFastSLAMReset` | No artifact within 30 s |
| Periodic controller clock | At 1.1 s, 101 ticks instead of 111 |

During the profiled FAST attempt, WASM function 87 owns 77.65% of weighted self
samples, rising to 93.17% in the 5–30 s window. Its complete disassembly was
checked byte-for-byte against the original compiler module. The Rust owner
still needs a matching symbolized build; no compiler phase is inferred here.

The source, receipts, profiles, exact body and hash manifest are retained in
`dev/artifacts/rumoca-pr396-85090-browser-2026-10-07/`. The compiler requests
are in `dev/rumoca-agent-handoff.md`. Production remains pinned to its existing
compiler; full browser SLAM and 10× realtime remain unqualified.
