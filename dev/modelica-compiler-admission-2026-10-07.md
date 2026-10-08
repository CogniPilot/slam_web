# Full SLAM compiler admission: register allocation failure

The newer PR391 WASM build still cannot issue the complete SLAM lifecycle.
Reset's failure is now localized to Solve IR scalar-register metadata growth,
separate from the runtime scratch-layout fix in PR396. The production compiler
pin and application algorithms remain unchanged.

## Exact artifact and original failures

Compiler: Rumoca 0.10.2, actual merge `079fca0894299718a29505bfb67a9ada11d87257`
(main `0195b672`, PR391 head `79b1a350`). Build WASM succeeded in
[run 37705791646](https://github.com/CogniPilot/rumoca/actions/runs/37705791646),
artifact 11520339497. This artifact does not contain PR396.

| Entry point | Original compiler result | Preparation time | Final linear memory |
| --- | --- | ---: | ---: |
| D435FastSLAMStep | ToDae conditional-definition refusal | 5.694s | 162,267,136B |
| RGBDFastSLAMReset | Allocation trap | 49.056s | 3,925,934,080B |
| D435FastSLAMInitialize | Trap | 98.437s | 4,294,967,296B |

The minimized GuardedProblem reproduces Step's `problem__nodeCount` refusal in
0.286s. Initializing the official panic hook reproduces Reset's same trap and
offsets without an additional panic message. These are not watchdog kills.
Initialize's allocation owner has not been independently established.

## Reset's allocation owner

Exact merge source `crates/rumoca-phase-solve/src/lower/scalar.rs:1622` defines
`ScalarCompiler::register`: increment the register index, then append to Integer,
Real and negation metadata vectors. Original compiler WASM function 10657 matches
these operations and its unique `Solve register index overflow` literal.
The trap stack passes through 10657 →14278 →18852 →17442 →18412.

Diagnostic-only global stores observe the live compiler object and allocation
error arguments at the same failure, without replacing instructions or adding
calls. Original imports and exports are preserved; a separate small control
produces bit-identical runtime module bytes and identical ABI through both
original and observed compilers.

| Metadata | Length | Capacity | Bytes per cell | Reserved bytes |
| --- | ---: | ---: | ---: | ---: |
| Integer | 16,777,217 | 33,554,432 | 16 | 536,870,912 |
| Real | 16,777,216 | 16,777,216 | 16 | 268,435,456 |
| Negation | 16,777,216 | 16,777,216 | 8 | 134,217,728 |

`next_register` is 16,777,217. Integer growth completed; Real growth fails at
the next vector expansion. Raw allocation-error arguments are 8 and 536,870,912,
consistent with 8-byte alignment and a 512 MiB request. The three arrays already
reserve 896 MiB; the observed compiler has 3,923,836,928 bytes linear memory.
This does not attribute all compiler memory to these arrays or prove the
diagnostic run's timing equals a cold original compilation.
The particular source construct responsible for this register count remains
unlocalized; compact aggregate lowering is the compiler investigation requested.

The first observation harness accidentally reused wasm-bindgen's cached original
instance and stopped before preparing Reset. The successful harness imports the
same glue under separate module URLs and checks the diagnostic exports before
recording the result. Only its successful receipt is used here.

## Original compiler perf captures

Two bounded runs sample the unmodified official compiler at 99 Hz with
`cycles:u`, monotonic timestamps and frame-pointer stacks. Every sampled period
falls within its recorded preparation interval; all threads and unresolved
leaves stay in the denominator. Both runs end with the original Reset trap.

| Window | Samples | Lost | Unresolved leaves | Main thread's weighted cycles |
| --- | ---: | ---: | ---: | ---: |
| First 10s of preparation | 1,340 | 0 | 41 | 72.57% |
| 25–35s into preparation | 1,017 | 0 | 21 | 99.99% |

Early samples include V8 compiler tiering workers. In the late window, compiler
WASM function 67 has 18.82% of weighted leaf cycles and function 12166 has 13.87%.
These stripped functions have no independently verified Rust source mapping;
their exact WAT is retained without guessing owner names. The register-allocation
owner above is established independently from the trap, literal, emitted
instructions and live metadata. Neither ten-second window estimates complete
compilation time or SLAM runtime. Peak owned RSS stays below 4.1 GiB, with over
49 GiB host memory available; affinity is cores 8–9, nice 15.

`dev/analyze-compiler-perf.mjs PROFILE_DIRECTORY REPORT` checks phase/process
ownership, sample inventory, lost records and reported source/compiler consistency;
it records input digests. Raw data/maps:
`$HOME/scratch/slam_web/profiles/pr391-reset-2026-10-07/` and
`pr391-reset-late-2026-10-07/`. Frozen summaries, executed scripts, logs and
resource receipts are in the evidence directory below.

## Compiler requests and acceptance

1. Keep aggregate construction/reset and array ranges compact through Solve
   lowering. Report per-owner register growth and allocation high-water marks;
   fail with a bounded source diagnostic before exhausting WASM memory.
2. Reduce constant metadata overhead where possible, while fixing the underlying
   scalar expansion. Smaller metadata alone does not remove millions of operations.
3. Fix the conditional problem-field definition and typed-call correctness
   blockers, then qualify full Reset/Initialize/Step and the lossless State ABI.

The [runtime perf findings](modelica-pose-graph-perf-hotspots-2026-10-07.md) remain
separate priorities: one authored product executes 4,653 times for 247 iterations;
inactive array carries alone copy 7.09 GB logical bytes. Reuse source values safely,
retain inactive values without cloning, and reuse scratch by proven lifetimes.
Do not reduce capacities, remove guards or move compilation/math into this app.

After correctness and operation-count gates pass, rerun the unchanged six-case
ABBA comparison with `--require-faster-than-omc`. Current Rumoca CPU WASM is slower
than native OMC C; these targets differ, and full SLAM throughput is unqualified.

## Reproduction and evidence

Run `dev/probe-native-program.mjs COMPILER_DIRECTORY SOURCE MODEL REPORT` inside
`nix develop --no-update-lock-file .#ci`, through `dev/rumoca-bounded-run.mjs` with
120s/8GiB limits, 16 GiB available-memory reserve, cores 8–9 and nice 15.
The probe now initializes the official panic hook and records monotonic
preparation boundaries for profiler correlation.

Frozen 59-file production source, original/hooked probe preimages, exact merge
Rust source, selected original WAT functions, diagnostic scripts, provenance,
receipts and SHA256 manifest:
`dev/artifacts/rumoca-pr391-admission-2026-10-07/`.
Large original/observed compiler modules and disassembly remain under
`$HOME/scratch/slam_web/tmp/pr391-79b1a350-admission/`.

Compiler WASM SHA256:
`e7606813769242f23b2b011c98d291532dd0f0c6f96daf03c209d9a58ed8d50f`.
Production source SHA256:
`5d485ddd965180a6eb5f8ffd7b3fcae6425cc590994966583fd2ef00915282ff`.
Compiler-agent request: `dev/rumoca-agent-handoff.md`, PR391 admission section.
