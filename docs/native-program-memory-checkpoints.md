# Binary checkpoints of compiler-issued WASM memory

`NativeProgram.snapshotMemory()` captures an owned byte copy of its imported
WASM memory. `restoreMemory()` checks the exact source/module, all issued
metadata including layout and defaults, byte length, and payload SHA256 before
writing. The metadata digest is computed lazily and reused; ordinary execution
does not hash or snapshot memory. Checkpoints preserve raw bits, including
Integer/Boolean output lanes, signed zero, NaN payloads and opaque padding.

The returned `NativeProgramMemorySnapshot` is structured-clone compatible:
store it directly in IndexedDB or transfer it to a worker. Do not JSON-stringify
its `Uint8Array`. The snapshot owns its bytes, and restore takes its own copy
before awaiting verification. Serialize restore/reset/evaluate calls in the
owning worker; restore is asynchronous. Snapshots capture memory at invocation,
before asynchronous hashing starts. While a restore is pending, the API refuses
input access, reset, evaluation, another snapshot and overlapping restore.
Previously retained writable views and public WASM memory still require caller
exclusivity; do not write them during restoration. Output reads expose the
previous memory until the validated restore commits. Digests detect accidental corruption and
identity mismatches; they do not authenticate the author or validate SLAM math.

```ts
const checkpoint = await program.snapshotMemory();
// Store checkpoint through IndexedDB structured clone.
const reloaded = await NativeProgram.instantiate(artifact, source);
await reloaded.restoreMemory(checkpoint);
```

This is a same-artifact **memory** checkpoint, not a complete SLAM session.
Session timestamps/counters and simulation state must be saved by their owners.
It does not capture WASM globals/tables or restore graphics/physics. Separate
Reset, Initialize and Step executables cannot exchange whole memory images:
their layouts differ. Likewise restoring Step's memory leaves its old input
`previous` and output `next` in their separate storage. The next invocation
still needs compiler-described complete record transfer. That transfer must
preserve the complete returned State even when a graph correction is refused
after consuming an attempt.

The current native-program ABI lacks a complete record member/type/storage
manifest and has only f64 input P storage. Exact i64 output lanes alone cannot
round-trip arbitrary i64 input values through f64. Rumoca must publish a lossless
typed record boundary and compatible record identities across entrypoints.
The app will consume that metadata; it will not parse Modelica record fields,
invent layouts or implement SLAM calculations in JavaScript.

The [browser probe](../dev/probe-native-program-memory.mjs) uses the retained
actual compiler-issued `Edge` executable. It saves a binary checkpoint in
IndexedDB, terminates its worker, reloads the page, and restores in a fresh
worker. It verifies complete-memory equality, Integer9007199254740993,
Boolean output, raw negative-zero/NaN padding bits and subsequent moving-input
execution. Its source/module/consumer/probe identities and results are in
[the receipt](../dev/artifacts/native-program-memory-checkpoint/browser-Gyml6k/report.json).
This is a64KiB component proof, not full-catalog performance or full browser
SLAM acceptance. The production compiler pin and runtime selection are unchanged.

The22 Node transport controls use actual retained typed-output and checked-gather
modules. They include an accepted Node Buffer/subview, caller mutation during
await, complete-memory refusals, defaults/layout identity, restore exclusion and
guard release after failure. Their first run exposed Buffer.slice aliasing
(19/20); the owning Uint8Array copy fixes it. The current browser receipt above
uses that fix and the restore guard; iJy0Hv is the preserved earlier plain-array
browser receipt. Existing checked-gather controls also pass (25 tests combined).
