# Native WASM scalar copy and loop audit

Read-only review of the accepted full original FAST module and current compiler. No compiler/source/cache changes, builds, numerical reruns, or speedup claim.

The central fixes are **already present**: `crates/rumoca-exec-wasm/src/typed_call/emit.rs:209` replaces an eight-byte copy with `i64.load` followed by `i64.store`; `cells:228` executes a one-cell body at counter zero and leaves counter one without a loop. Current source hashes `3b9e107b…` and test hash `a047203d…` match the final producer's frozen source inventory. Its actual `broad.log` records all four existing emitter controls passing: overlap/raw-bit preservation, bounds traps without publication, larger bulk-copy fallback, and counter behavior for counts 0/1/2. They were not rerun for this audit.

## Actual module evidence

The module pinned by `dev/artifacts/native-stage-outlining/full-original-numerical/review.json` is SHA `d6ecf6e1f13a1fb78263cd8abf5f9fd0258f0e5df73754d3ea85074e60fed09f`, 14,990,200 bytes and 99 function bodies. `dev/artifacts/native-cell-emitter-audit/inventory.mjs` extracts only its byte array from the existing 50 MB artifact, checks that digest, and decodes it with installed WABT 1.0.39. It does not compile or execute the target module. The final read-only audit took 6.28 seconds and peaked at 1,359,048 KiB RSS on CPU 12/nice 15; no full JSON object or WAT file was retained. Two initial decoder attempts declined because their WABT feature options omitted bulk-memory/multi-memory support; the final decoding used those options without modifying module bytes.

Static operator counts in `module-inventory.json`:

| Pattern | Count |
|---|---:|
| `loop` instructions | 27,567 |
| `memory.copy` sites | 1,010 |
| Static eight-byte copies | 672 |
| Eight-byte copies inside loops | 672 |
| Nearby loop guards with `i32.const 1; i32.ge_u; br_if` | 12,936 |
| Corresponding one-extent i64 guard candidates | 0 |

Each of the 84 typed helper bodies contains eight remaining eight-byte bulk copies. The first site's recorded instructions compute a destination from the Map's memory counter times eight, then push a source and `i32.const 8; memory.copy`. This matches `typed_call/control/map.rs:70–88`. Static counts are not dynamic invocation counts, and the guard pattern is a local instruction candidate rather than an independent source-owner certificate.

The retained JIT report has 1,998 samples/zero lost: 61.7% WASM functions, 5.36% memory-copy wrapper, 2.7% memmove and 20% V8 compilation. Its scope includes loading, initial compilation, warmup and background optimization. These percentages do not identify eight-byte sites, assign steady-state wall time, or establish the benefit of either proposal below.

## Two narrow remaining candidates

**Map scalar result publication.** `typed_call/control/map.rs:85` directly emits bulk copy for its dynamically computed destination, bypassing the central `Emitter::copy` specialization. A small common emitter operation consuming already-pushed destination/source addresses and a checked byte width can emit the existing `i64.load; i64.store` sequence for exactly eight bytes and bulk copy otherwise. Both static `copy` and Map can use it. Keep Map's checked count×output-width equality, counter/domain order, capture snapshots, final-binder behavior, addresses, region path and fault records unchanged. Do not fabricate a static `CellRange` for a dynamic address. One eight-byte load reads the complete source before any store, so even unaligned overlapping source/destination ranges retain memmove behavior and NaN payloads/signed zero remain raw bits.

**Outer scalar transfer loops.** `emit/compute.rs:160–185` still always emits the general paired loop. `compute/call_program/transfer.rs:120` and `:185` use it for each argument/result, including scalar results. Therefore the typed emitter's existing `cells(1)` change does not remove these loops. Prefer a bounded scoped cell-loop helper for these transfer callers, preserving extent checks, counter initialization, complete ordered body emission, and successful counter end value. Start with count one and zero start; keep count zero and larger counts on the unchanged path. Keep the original increment operation when reproducing counter state; do not assume an arbitrary emitted body leaves the counter unchanged. Do not drop instructions independently in `loop_start` or `loop_end`, which currently have no shared extent token. General arena, affine and conditional loops can remain unchanged for this first stage. The transfer bodies themselves only read their loop counter; Integer packing retains its original checked conversion and status-two order.

A one-iteration Fold/Map optimization is a separate, less relevant change: its memory-resident counter, carried tuple snapshots and source binders have different semantics. The current FAST inventory found no one-extent i64 guard candidates. Avoid folding that larger control-flow change into these two candidates.

## Required controls and limits

For the Map copy, compare copied production emission with the old bulk-copy path and an independent snapshot-memmove oracle: all displacements −7…7, same address, unaligned addresses, quiet/signaling NaN bit patterns, both zeros, arbitrary Integer/Boolean bits, and source/destination/end-of-memory overflow. Keep larger/zero-width fallback. Also execute a construction-issued scalar-result Map at several domains, with a failing final iteration: complete output must remain unpublished, fault owner/region/operation/status must match, P stays read-only, and the next invocation recovers.

For outer transfers, retain a test-only original general-loop oracle independent of the specialized path. Compare counts 0/1/2, body entry index and final counter, untouched adjacent locals/arena cells, Real raw bits, Boolean conversion and valid/invalid Integer domains, checked overflow/refusal order and unchanged fault table. Include a late fault and successful recovery across forced outlined groups. Then rerun the unchanged full FAST source/module numerical gate and separate Node/Chromium timing; no tolerance or source-domain changes.

Do not generalize the one-load result into sequential larger copies: overlapping 16/24/32-byte ranges need **all** reads before writes, and out-of-bounds stores could otherwise partially publish. The earlier larger-copy candidate is explicitly `REVERTED_BROWSER_BENEFIT_UNCONFIRMED` in `dev/rumoca-small-copy-emitter-verification.json`; conflicting browser comparisons provide no basis to restore it here.

These are final-emission representation choices under accepted SPEC_0007, SPEC_0032 and the SOLVE-C51/C52/C53 owner contracts. They change neither Modelica arithmetic nor canonical tensor/loop/call owners, bounds validation, fault provenance, or whole-program publication. Any implementation and actual gates remain with the compiler source/Cargo owner.
