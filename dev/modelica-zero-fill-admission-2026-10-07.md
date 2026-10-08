# Native issuance narrowed to a standalone zero-filled array

The newest tested PR391 build still cannot issue the complete SLAM lifecycle.
A 326-byte standalone model also exceeds its browser issuance bound: it only
initializes the authored 350×49 descriptor array to zero. There are no records,
imports or functions. This moves the investigation beyond function inlining
and record-return projection alone, without changing any production math.

## Exact current artifact

Official artifact 11523801169, [run 37714315493](https://github.com/CogniPilot/rumoca/actions/runs/37714315493),
PR391 head `06cdfe3121144c56a31551514d0e57968eada285`.
Actual compiler 0.10.2 / merge `42729cb4f520023f7cd5f2110579191861e84fc6`,
parents `d7f16c00e203` and `06cdfe312114`. This includes the merged record-copy
ordering fix, but not the reviewed scratch-sharing merge. Production remains
on its existing compiler pin. Compiler WASM SHA256:
`2fa706579c6f6fe4fb947e764f1eb953ddfa00d39422d605b3aab180469266b7`.

| Actual browser diagnostic | Observation |
| --- | --- |
| Unchanged full-source `D435FastSLAMStep` | ToDae refusal in 5.854 s: `RGBDGraphProcessing.Correct` reads `problem__nodeCount`, defined by only some branches at byte 659592 |
| Original isolated `ResetFrameOwner` | No artifact within 30 s |
| Standalone `DescriptorZeroFill` | No artifact within 20 s |

The full source still hashes to
`5d485ddd965180a6eb5f8ffd7b3fcae6425cc590994966583fd2ef00915282ff`.
The [standalone fixture](../tests/compiler-probes/fixtures/DescriptorZeroFill.mo)
hashes to `1a2ef18f7b32b15f27a92301e56c6cca495cd57023668db280dc28d018035f85`.
Both named capacities are checked against the authored `RGBDKeyframes` source.
The descriptor-only fixture isolates one owner; it replaces no SLAM entry point.

Rumoca `compile` returns the fixture's balanced DAE in 0.237 s: 17,150 scalar
unknowns/equations, three variables including the two constants, zero functions,
ten expression nodes and one structured row-major equation operation. The API
calls are separate cold processes; this is phase narrowing, not subtraction of
timings or a matched runtime benchmark.

## Same-size array controls

Further controls retain all 17,150 output cells on the same compiler:

| Source form | Actual browser result |
| --- | --- |
| Rank-one `zeros(featureCapacity*descriptorSize)` | Exceeds 20 s |
| Original matrix shape, `fill(0.0,featureCapacity,descriptorSize)` | Exceeds 20 s |
| Original matrix shape, copy a runtime input array | Issuance and consumer admission pass in 2.3755 s |
| Original matrix shape, `fill(value,...)` with runtime scalar input | Two admissions pass in 2.250 and 2.543 s; identical 428-byte modules |

The runtime-copy module is 418 bytes, SHA256
`8f3bc4b0d773f5c8284bd7703914665d54b73f404aa3ced4b92e155fcbb6b890`.
It executes in Chromium with all 17,150 output cells compared byte for byte
across three full-input patterns and reset/replay: 68,600 checked output values.
Inputs remain readonly; signed zero, subnormals and maximum finite values are
preserved; memory stays fixed. Outputs are poisoned before every invocation.
This is array-copy execution, not SLAM, Float32 or a throughput qualification.

The [runtime-fill control](../tests/compiler-probes/fixtures/DescriptorRuntimeFill.mo)
also executes with every output compared byte for byte: ten finite input values
and reset/replay check 188,650 output values. These cover both signed zeros,
positive/negative subnormals and maximum finite values. The scalar input remains
readonly, including replay, and memory stays fixed. Its module SHA256 is
`32855ec3471ee74a0b0fe62a6f3461f560ce252bafc9003add5f8e37f48c5552`.
Thus the same shaped `fill` generator admits and executes when its value is a
runtime scalar. Investigate constant variability/propagation paths specifically;
changing production constants into host inputs is not a fix.

The comparison makes constant-array construction/materialization a stronger
lead than array rank or general input/output movement. Re-evaluating a complete
constant array for each scalar projection remains a hypothesis, not an observed
count. The exact compiler source already has `pack_tensor_generator` and
`TensorFill` in `lower/scalar/builtins.rs`; simply adding a fill opcode is not
the missing deliverable. Measure whether its `(context_id, expression)` cache
is reused across output projections and whether preparation reaches this path.
The Rust owner of the sampled WASM functions is still unverified.

Reproduce with `dev/probe-descriptor-array-forms.mjs COMPILER_DIRECTORY NEW_OUTPUT_DIRECTORY`.
An optional list of model names selects individual forms. Run
`dev/check-descriptor-copy-browser.mjs ARRAY_FORMS_DIRECTORY NEW_REPORT [MODEL]`
to execute the exact browser-issued artifact without compiling again; the model
defaults to `DescriptorCopyMatrix`, with `DescriptorRuntimeFill` also supported.
Source forms change
rank, initializer and input ownership explicitly; no application source changes.
Receipts and verified exact compiler source blobs are under
`dev/artifacts/rumoca-array-form-control-2026-10-07/`.
Its 68-file manifest preserves the originally executed and updated probes
separately. Four corrupted source, artifact, consumer and shape receipts are
refused without writing a passing execution report.

## Removing the record-returning call is insufficient

On the prior exact merge `51e9876d699e`, a diagnostic initializes every Frame
field with its unchanged constructor RHS as equations. All 23 fields and their
capacities remain; the original package and constructor text are retained.
Its DAE returns in 0.538 s with zero functions, 118 expression nodes and the same
19,587 unknowns/equations. Solve lowering exceeds 35 s, and actual browser native
issuance exceeds 20 s. A separate descriptor-only output retaining that package
also exceeds 20 s. These observations do not establish which internal operation
is responsible, or numerical execution equivalence between source forms.

`dev/reduce-reset-frame.mjs NEW_OUTPUT_DIRECTORY --equations` reproduces the
direct-field source. Without the flag it still reproduces the original source,
binding and OMC script byte for byte. Unexpected constructor statements or
missing/duplicate field assignments are refused rather than silently dropped.

## Original native-compilation profile

A fresh ten-second `perf` window samples the unmodified current compiler's
`prepare_native_program` call on the standalone fixture. The owned process is
deliberately stopped after observation; this is neither a trap nor proof of
nontermination. All 1,258 samples lie inside the recorded preparation interval;
zero are lost, and 35 unresolved leaves remain in the denominator. Main-thread
weighted cycles are 79.80%; V8 workers account for the remainder.

| Compiler WASM function | All sampled cycles |
| --- | ---: |
| 3420 | 30.00% |
| 3346 | 9.83% |
| 6425 | 7.82% |
| 8014 | 7.17% |
| 7045 | 5.00% |

Exact original WAT bodies are retained. Rust names remain unmapped; no source
owner is inferred from nearby function numbers in older builds. This window is
not whole-compilation cost, CPU utilization or SLAM execution throughput.
The profile peaks at 639,420 KiB owned RSS and retains over 41 GiB available.
All heavy probes use cores 8–9, nice 15 and a 16 GiB host memory reserve.

## Compiler request and evidence

Localize these functions and report per-owner lowering/register/allocation counts
for the standalone array. Keep zero-filled shaped arrays compact through native
issuance; investigate repeated per-element work without assuming the record call
is necessary. Preserve shapes, source identity, typed semantics and complete
output. Qualify issuance and all 17,150 zero outputs, then the original full-frame
and complete SLAM lifecycle. The Step conditional-definition fix remains separate.
All prior numerical, readonly/atomicity and faster-than-OMC gates still apply.

`dev/rumoca-phase-probe.mjs` now exposes phase `program` for the real native API.
The perf analyzer admits this deliberately stopped phase with a distinct status.
Under Nix, both original receipts pass and ten corrupted receipts are rejected
for each of the lowering and native-preparation paths. These gates do not compile
or execute replacement SLAM algorithms.

Frozen receipts: `dev/artifacts/rumoca-zero-fill-admission-2026-10-07/`.
Large raw traces, maps and WAT remain in
`$HOME/scratch/slam_web/profiles/descriptor-zero-fill-native-06cdfe312-2026-10-07/`.
The current official package is under
`$HOME/scratch/slam_web/downloads/rumoca-pr391-06cdfe312/`.
Full browser SLAM and 10× realtime remain unqualified.
