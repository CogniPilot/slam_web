# Reset preparation narrowed to a full-capacity frame constructor

The newer PR391 WASM build still does not issue `RGBDKeyframes.EmptyFrame` within
the browser bound. A 2,619-byte reproducer preserves its complete authored body,
constants and output record. Rumoca emits its balanced DAE quickly, but the
Solve-lowering API also exceeds its separate bound. This gives the compiler
agent a smaller target than the complete Reset's 4 GiB register-allocation trap.

## Exact build and observations

Official PR391 artifact 11521767605 from run 37709291389, head `f7e3be38979b`.
Its actual compiler is 0.10.2 / merge `51e9876d699e`, parents `0195b6720a91` and
`f7e3be38979b`. Compiler WASM SHA256:
`5881cda81a2387227f431295560e8230f531535ee6412d3a170b6d0e8b5bc87a`.
It does not include the reviewed scratch-sharing merge requested for paired
runtime qualification. The production package pin stays unchanged.

| Diagnostic scope | Observation |
| --- | --- |
| Full source, actual `EmptyEstimator` call | Browser issuance and consumer ABI admission pass in 3.681 s; 8,784-byte module |
| Full source, actual `EmptyFrame` call | Browser issuance exceeds its 60 s bound; no executable returned |
| Isolated unchanged `EmptyFrame` | Browser issuance exceeds its 30 s bound; no executable returned |
| Isolated source, Rumoca `compile` | Balanced DAE returned in 0.424 s; 19,587 unknowns/equations |
| Isolated source, `lower_model_to_solve_json` | No result before the separate 25 s process bound |
| Isolated source, OMC `translateModel` | Successful C-source generation; whole command 4.544 s |

The earlier PR391 merge `079fca089429` gives the same admission pattern:
estimator 3.498 s, frame exceeds 60 s. Both admitted estimator modules have
identical executable hashes. These are diagnostic roots with complete outputs,
not smaller replacements for Reset or numerical execution of the constructors.
The runner stops at the first failed owner; Graph, Map and Catalog roots were
not attempted. No production Modelica source or capacity changed.

OMC C generation and Rumoca WASM issuance produce different artifacts. These
times establish a preparation problem, not a matched runtime speed ratio.
The first OMC invocation lacked `omc` on PATH and exited 127; the table uses the
subsequent successful explicit Nix-store compiler invocation. Browser timeouts
bound worker issuance, including setup; they are not observed compiler traps.

## Narrowing evidence and perf

The isolated native DAE contains 23 variables, 152 expression nodes, one function
and one aggregate assignment in that function. A single authored whole-record
call has ten DAE call nodes and 23 field projections across typed outputs.
That inventory warrants investigating repeated constant-record/field lowering;
it does not prove how many times a callee executes or folds.

A separate original-WASM `perf` capture samples the Solve-lowering API for ten
seconds, then deliberately stops its owned process. All 1,292 samples are within
the logged lowering observation; zero are lost and 40 unresolved leaves remain
in the denominator. Main-thread weighted cycles are 79.58%, with V8 worker
threads accounting for the remainder. Largest weighted leaves:

| Compiler WASM function | All sampled cycles |
| --- | ---: |
| 3417 | 22.48% |
| 3342 | 9.67% |
| 6421 | 6.63% |
| 8012 | 6.06% |
| 7045 | 5.00% |

These stripped function numbers have no independently verified Rust symbol
mapping. Exact original WAT bodies are retained for the compiler agent to bind.
Perf reports 1,292 throttle and 1,291 unthrottle records. This short window is
not whole-compilation cost, CPU utilization, SLAM runtime or a compiler failure.
All heavy probes use cores 8–9, nice 15, bounded owned RSS and a 16 GiB host
reserve. The newer full-source frame run peaks at 1,402,652 KiB owned RSS and
retains over 41 GiB available; it is distinct from Reset's allocation trap.

## Compiler request and reproduction

Localize the measured functions in this exact merge. Inspect constant aggregate
folding, field projections and scalar/register expansion after DAE compilation.
Keep zero/fill arrays and record ranges compact; preserve source value identity
across typed projections. Prove counts and allocation by source owner before
choosing a fix. The ten DAE call nodes are a hypothesis lead, not a runtime count.
Retain Integer/Boolean semantics and every authored output/capacity.

`dev/probe-reset-constructor-owners.mjs COMPILER_DIRECTORY NEW_OUTPUT_DIRECTORY`
runs the full-source diagnostic roots through actual browser issuance, bounded
individually. `dev/reduce-reset-frame.mjs NEW_OUTPUT_DIRECTORY` extracts the exact
authored constructor and writes the standalone source and OMC translation script.
Run these in the Nix `.#ci` environment. The reducer never edits production files.
`dev/analyze-compiler-perf.mjs PROFILE_DIRECTORY REPORT` checks both original
trap windows and the deliberately stopped lowering window, with distinct scopes.
`dev/test-compiler-perf.mjs TRAP_PROFILE LOWERING_PROFILE REPORT` accepts both
original receipts and rejects ten corrupted ownership, timing, phase and sample
receipts. These controls and byte-identical standalone extraction pass under Nix.

Durable receipts and the standalone source are under
`dev/artifacts/rumoca-reset-constructor-owners-2026-10-07/`.
Large compiler/artifact/trace files remain under `$HOME/scratch/slam_web/`:
`downloads/rumoca-pr391-f7e3be389/`, `tmp/reset-constructor-owners-f7e3be389-2026-10-07/`,
`tmp/reset-frame-isolated-f7e3be389-2026-10-07/` and
`profiles/reset-frame-lowering-f7e3be389-2026-10-07/`.
The complete lifecycle, six faster-than-OMC runtime gates and 10× realtime
remain unqualified; these diagnostics replace none of those requirements.
