# Native certification of Move-packed scalar tuples

The isolated compiler now certifies an original scalar residual tuple packed
through SSA `Move` operations when every cell has an exact direct subtraction
isolator. This addresses the first
[full-frame FAST refusal](fast-native-frame.md). Full-frame admission and the
separate duplicated call-body frontier still require their own evidence.

The new profile follows earlier immutable Move definitions to a scalar
subtraction. One operand must be the exact original Y target, optionally through
Moves; the opposite value must be independent of the entire target tuple.
All selected cells must be Move-packed, and the original targets must form the
existing checked dense range. Nonlinear or mixed producers, partial tensor
producers, wrong targets, coupling, register rewrites, invalid bounds, effects
and overflow remain refused.

Complete register-flow and call-argument checks apply, including unused call
arguments and unused fault-sensitive prefixes. Every original operation executes
in order. Only after that complete prefix does private value packing occur,
followed by one output-range store. The original program, store tuple and source
identity remain in one family; no per-coordinate source owners or kernels are
introduced. The existing tensor path and numerical emitter are unchanged.

The [verification record](../dev/rumoca-move-packed-tuples-verification.json)
retains the initial incorrect test target inventory and its exact coupling
refusal, then the corrected same-source gates:

| Gate | Executed result |
| --- | --- |
| Seven constructor controls | PASS; includes 3/160/14,400-cell construction, original order/store identity, coupling/SSA/bounds/effects and checked overflow |
| Two native Wasmi controls | PASS; 160-cell two-stage tuples, 960 canonical IEEE output comparisons, immutable inputs, late consumer fault after producer completion, full-Y rollback and recovery |
| Actual Modelica source/edit control | PASS; original Move-packed four-output source through linked v3 ABI, three input frames and edited arithmetic/source binding |
| Affected suites | 1,890 PASS; one existing ignored |
| Strict checks and formatting | Nine packages, all targets/features, warnings denied; formatter PASS |

Final tests took 48.530 seconds, strict checks 33.394 seconds, and formatting
9.742 seconds. The tests used four build/test/Rayon workers, CPUs 6/7 at nice 15,
an 8 GiB RSS guard and 16 GiB host reserve. These are verification timings.

All final gates bind source closure
`99cad954a3dd9cf147997f57a0e8e5c61b25f67eb706c9c8fdc85fa17ce05436`
(2,428 files), verified unchanged before and after. The actual Cargo-JSON-linked
producer is frozen at
`$HOME/scratch/slam_web/tmp/move-packed-tuple-gate/final-producer`, SHA256
`cc841585b854941579091183df935491e04049d67927b2260e45445f268f9a4f`.
The previous `662903…` producer remains unchanged.

The 14,400-cell constructor control is not numerical full-frame acceptance;
the new Wasmi and actual-source fixtures exercise their stated shapes. The
original failed full FAST capture remains historical evidence. No model source,
compiler schema, call-body storage, production pin or renderer was changed.
Full SLAM, application throughput and the 10× target remain incomplete.

The subsequent [unchanged full-frame attempt](../dev/rumoca-fast-native-frame-move-packed-verification.json)
passed assignment certification and stopped at the separate typed Map emitter
boundary. It took 245.353 seconds with peak 7,445,636 KiB; no native artifact or
numerical full-frame result was produced. The exact Solve wire remained
byte-identical to the original capture.
