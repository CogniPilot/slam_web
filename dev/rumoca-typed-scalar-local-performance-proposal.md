# Typed-call scalar temporaries in WASM locals: review hypothesis

Read-only investigation, 2026-10-05. No compiler source edits, Cargo, new profile or model preparation ran. Covariance retains compiler source/build ownership. This is a proposed backend experiment, not an admission change or measured speedup.

The actual accepted full-21 baseline is bound by [the transaction evidence](modelica-schmidt-reference-transaction-verification.json): source `f8fe0faaed21654ce80f440434bf1685a6572dfd74f9e9199507262b9e2f96b1`, module `b57eed180b9e04613f3d22d043a31e9ecea04f99aefaec534c356ac831e14751`, 788,486 bytes. The [completed profile record](schmidt-transaction-profile-verification.json) measures an isolated complete-step median of 1.05221643 ms, including actual returned-state copies. Its exact warm sampling interval attributes 73.60% self samples to nine PSD helper owners and 20.49% to `eval_assignments`. These percentages do not independently measure memory latency. The Scratch-only PSD branch variant passes all20 independent fixture expectations and measures 1.02648460 ms in a separate unpaired run; this does not establish a causal speedup. It remains unpromoted and does not remove the generated scalar scratch traffic being investigated.

## Observed representation and hotspot

The inspected immutable profile inputs are:

| Scratch-relative file | SHA-256 |
|---|---|
| `profiles/schmidt-transaction/module.wat` | `70d2ee45b7e33fbce6e8c5a568b8679bb86dd842448e7a6a321f7bd377287df3` |
| `dev/artifacts/schmidt-transaction-profile/owner-source-map.json` (repository-relative; lossless decimal source identities) | `9405dd694c660ae3ccf8f61b09a47eb36d1b5a89fc3f44cc9afc6e8037e65868` |
| `profiles/schmidt-transaction/perf-hot/psd21-annotate-whole.txt` | `f9db51a0efa4ed0c5585e5186e032c33ac6b54672953bb695f11695c934dfd27` |

The earlier retained `JS:wasm-function[29]-29-turbofan` annotation shows sampled addition-result stores and successive eight-byte scratch copies. The completed `perf-hot` annotation listed above covers the whole process for that symbol; the separate perf report restricts samples to the declared warm interval. Nearby instructions load scratch cells and compute addresses. Symbol-local percentages are neither whole-step percentages nor proof of DRAM stalls. The original diagnostic `pure-call-inventory.json` rounded64-bit source IDs when rewritten through JavaScript numbers and is not an exact wire/provenance authority. Use the lossless archived owner-source map and original Solve record instead.

The generic responsible implementation is under `crates/rumoca-exec-wasm/src/typed_call/`:

- `emit.rs:50–69`, `compile_owner`, declares only fixed scratch locals: parameters 0–2, index/status local 3, four I64 scratch locals 4–7, two F64 scratch locals 8–9.
- `layout.rs:15`, `FramePlan`, represents **every** register as `CellRange`; `plan_operation_registers` around lines 290–320 allocates or safely borrows a memory range even for rank-zero temporaries. Checked SSA issuance order and lifetime ownership remain authoritative.
- `emit.rs:175–203`, `reg`, `address`, `load_cell`, therefore resolves scalar values through memory. `numbers.rs:55–87` emits the destination address and F64/I64 store for every numerical result; operands load via the same range machinery.
- `emit.rs:430–435`, Load/Store, copies between slot and register memory. Exact eight-byte copies already use one I64 load before store; this preserves overlap but still materializes scalar temporaries.
- `control.rs:105`, `region_body`, switches program/frame while emitting nested regions into the same WASM function. Bare register ordinal is **not** a unique local identity across parent/child bodies. Fold captures and carried tuple copies implement immutable old-state snapshots and exact source-domain order.
- `calls.rs:7–40` copies arguments into private callee spans, propagates nonzero status immediately and copies destinations only after success. Nested calls have distinct checked owner/frame identities.

## Bounded first experiment

Add an owner-local register location plan with `Memory(CellRange)` or `ScalarLocal { index, scalar_type }`. Eligibility is checked rank-zero Real/Integer/Boolean register type; a one-element array is not a scalar merely because it occupies eight bytes. Keep arrays, slots, private output publication, counters and all existing frame spans memory-backed in this first experiment. Keep scratch size and ABI guards unchanged initially, including otherwise unused scalar ranges: separating execution representation from frame shrinking makes error/overlap equivalence independently reviewable.

Assign checked local indices from 10 upward across the **complete owner function**, using exact region path plus register ordinal. Count/index arithmetic must be checked. No local reuse/liveness allocator is needed initially. Each helper function owns its own locals; neither names nor historically equal raw pointers establish identity. A Fold re-executes the same region definitions into those locals each iteration; legal dominance must still come solely from the existing typed body.

The [actual Node/Chromium engine-boundary probe](wasm-scalar-local-limit-verification.json)
now confirms that the budget includes parameters: three parameters, seven fixed
locals and49,990 extra locals total50,000 and execute successfully; one more
local is rejected during compilation. This is consistent with the current
[V8 limit source](https://chromium.googlesource.com/v8/v8/+/refs/heads/main/src/wasm/wasm-limits.h).
Use checked complete-owner accounting and a deterministic memory representation
for otherwise eligible registers beyond the budget. The probe tests tiny
hand-encoded modules, not Rumoca semantics, memory-plan parity or performance.
It does not prove other engines' behavior.

The [source-bound full21 register inventory](schmidt-scalar-register-inventory-verification.json)
counts all nested regions in the original39-owner Solve artifact. Each of the
nine profiled PSD helpers has150 rank-zero registers across its complete owner,
well below that engine budget. This is an upper bound, not a local-eligibility
result: address-escaping uses and existing frame-slot aliases must still retain
the memory plan. The inventory reads no u64 source/identity field as authority
and binds helper names through the separate lossless owner/source map. It does
not measure instruction elimination or a runtime gain.

Centralize scalar reads/writes: numerical scalar operands use `local.get`; scalar results use `local.set`; a mutable memory-slot Load snapshots its value at that exact source operation. Stores to slots remain explicit memory writes. Do not cache scalar slots across writes, treat a local as a mutable-slot alias, reassociate arithmetic, introduce FMA, or bypass integer/Boolean/domain guards. Real transport must preserve bits, including signed zero and NaN payloads; reinterpret only at existing raw-cell boundaries.

The location plan must cover all address-taking consumers before a register is eligible. For the first gate, an exact use analysis may leave address-escaping registers memory-backed. Alternatively, explicit bridges can materialize a local into its existing reserved range immediately before the checked consumer and load a successful returned scalar into its local. The latter needs **per-consumer** proofs, not an implicit `reg()` spill on every access: control captures/destinations, call tuples, aggregate construction/fill, index selectors, views, tensor operations and raw bit copies must be audited. Never expose a stale mirror or read a destination before a successful producer. If classification is incomplete, retain that register's original memory representation at compile time; never retry interpreter execution after an admitted fault.

Region captures and Fold carried outputs keep their existing simultaneous tuple publication: all source values refer to the prior tuple, including repeated receivers. Nested helper return status must precede any destination-local publication. Existing range reuse is a memory allocation fact, not a license to merge live local definitions. Fixed index/status local 3 and scratch locals 4–9 remain reserved; count-one loop final local-3 semantics remain unchanged.

Promoting mutable scalar slots, reducing scratch spans or optimizing tuple/control bridges would be separate measured stages. They are not required to prove private register locals first. This avoids changing bounds/alias guards or public transaction atomicity while investigating the observed stores.

## Required controls and acceptance

1. Differential actual Wasmi execution of the same checked owner through memory-only and local plans: Real raw bits (NaN payloads, ±0), ordered arithmetic, Integer boundary arithmetic/conversion faults, Boolean values and invalid-input classification. Do not compare only constructor acceptance.
2. Mutable scalar slot Load before/after Store, old SSA value used after slot mutation, a scalar returned through multiple outputs, and exact repeated-receiver/alias behavior. Inputs and guarded external outputs must remain unchanged on faults.
3. Nested lazy Conditional with unused failing arm; overlapping region register ordinals; zero/one/multiple-iteration Fold; invariant captures, scalar carried state and mixed array/scalar tuples. Compare canonical values, first fault/status/provenance and recovery after reset.
4. Nested calls with scalar and array arguments/results, same-owner recursion/refusal rules unchanged, earlier-success/later-failure tuples and status propagation. Frame/input/output/scratch overlap, bounds and size-overflow refusals must match the reference path exactly.
5. Every admitted scalar consumer must have a bridge/use control. Unsupported shapes stay on the existing memory plan; arrays keep full dimensions. No source matching, model bypass or dropped operation.
6. Reissue the unchanged full transaction from a frozen joint producer, run the independent 20-case model gate and persistent session Node/browser tests, then compare identical complete-step fixtures and transport before/after. Verify WAT/JIT load/store reductions and the actual selected local count; a component-only result does not establish full-SLAM or 10× throughput.

AGENTS routes this work to accepted SPEC_0007 (typed/finite-domain IR ownership), SPEC_0032 (source/domain order and shape), SPEC_0029 (backend crate ownership), and SPEC_0033 (source-frozen bounded evidence). SPEC_0036 and SPEC_0037 currently have DRAFT status; their construction/reference-proof discussion is design context, not an additional governing rule. The emitter changes execution representation only; it must consume the existing checked program and owner identities without weakening their contracts. A patch and build require the explicit future source/Cargo handoff.
