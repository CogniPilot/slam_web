# Typed input consumer integration

The single-program consumer now supports Rumoca's schema73 typed input lanes.
Integer inputs use cached `BigInt64Array` scalar views, Boolean inputs use cached
`Uint8Array` scalar views, and evaluation passes the compiler-declared typed
buffer base as its fifth argument. The executable continues to own all math.
Ordinary Real inputs retain their existing P views. The production compiler pin
has not changed.

The [review receipt](artifacts/native-typed-input-integration-2026-10-07/review.json)
binds the consumer and test sources to four passing unit tests, 27 passing
existing consumer checks (three optional compiler probes skipped), TypeScript,
a production build, and Node plus a dedicated Chromium worker transport check.
The latter exercises 16 mixed scalar transfers, full-width signed i64 values,
exact reset/checkpoint reload, IndexedDB persistence, readonly inputs, and atomic
invalid-Boolean and checked Integer-to-Real refusals. These transport fixtures
are handcrafted WASM; they do not qualify compiler-issued Modelica execution.

Admission checks reject overlapping or misaligned regions, inconsistent field
inventories, aliases into typed input P slots, unsafe Integer defaults, and
Boolean defaults other than zero or one. Exact Integer state written through
the typed views never passes through a JavaScript Number. The current default
contract still uses JSON f64 parameters, so unsafe defaults are refused pending
an exact compiler-owned representation.

Two producer requests are recorded in the append-only
[compiler handoff](rumoca-agent-handoff.md): pad the typed input region to eight
bytes before placing typed outputs, and supply exact typed defaults or refuse
unrepresentable defaults. Browser typed array views require alignment even
though WASM loads can access unaligned addresses. The application does not
repair producer layouts by copying or rewriting executable metadata.

This work does not yet implement complete record interchange between different
compiled entrypoints, raw RGB8/Z16 input storage, the full browser SLAM session,
or a throughput benchmark. The downloaded PR390 CI package is qualified
separately; availability alone does not authorize a production pin promotion.

The first actual PR390 delivery now compiles all three nested State fixtures in
a browser worker. [Reset numerical execution](artifacts/native-state-carry/ci-a391c2e20/reset-execution/report.json)
passes 45 field checks each in Node and Chromium, including exact large
Integers. Initialize and Step exhibit the reported producer alignment defect
and remain inadmissible. The complete SLAM source additionally refuses a FAST
function conditional; a tiny reproducer and compiler CPU profile are recorded
in the handoff. These results qualify Reset, not complete carried State.

The subsequent mixed-input numerical probe exposes a separate compiler
correctness failure in both Node and Chromium: Integer input bytes retain
`9007199254740993n` exactly, but an actual compiled Integer-to-Real use succeeds
with a rounded result instead of returning the promised checked-conversion
fault. Seven safe-input numerical checks per engine pass, invalid Boolean bytes
correctly refuse, and exact input checkpoint reload works. The complete mixed
input acceptance deliberately remains failing. No host range check masks this
compiler error.

The [CI delivery review](artifacts/native-state-carry/ci-a391c2e20/review.json)
binds the actual issued modules to their execution reports, the three compiler
blockers (output alignment, checked conversion, FAST conditional), and the full
Reset compile profile. The latter places 83.594% of weighted self samples in
`wasm-function[11482]`; the optimized package lacks a name section, so its Rust
symbol is not inferred. This measures compilation CPU, not SLAM runtime speed.

Further inspection verifies the complete 212-byte hot function directly against
the original optimized module. Vector growth/zero-fill and a generation counter
make `StampTable::begin_pass` in Rumoca's expression visitor a strong candidate.
The PR source's nested visitor fallback allocates a fresh full-arena table;
repeating that path could explain the cost. Source-symbol recovery and allocation
counts remain work for the compiler agent. The exact disassembly and byte check
are retained beside the profile; the whole disassembler timed out after emitting
this function, and target completeness was verified independently.

The [Integer-only component](artifacts/native-state-carry/ci-a391c2e20/integer-counter/checked-boundaries/report.json)
now passes six boundary cases and both signed overflow checks in each of Node
and Chromium. Inputs, outputs, reset and checkpoints preserve full i64 values;
overflow rejects atomically in this component. Integer arithmetic itself is
working. The earlier mixed-expression test concerns the advertised checked
Real-view policy and explicitly requests Real arithmetic; the compiler agent
has been asked to distinguish intentional source-level coercion from implicit
ABI rounding. No host conversion policy is substituted for the compiler's.

The FAST definedness investigation also isolates a tiny repeated scratch-array
loop, with no Boolean guard or conditional result writes. Rumoca refuses that
case in Node and a browser worker while an independent OpenModelica reference
passes all eight checks across the reduced functions and controls. These
reproductions and the pending State layout contract are in the same handoff.
