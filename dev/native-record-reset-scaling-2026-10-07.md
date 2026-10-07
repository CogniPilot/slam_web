# Full reset and generic record scaling, 2026-10-07

Full browser SLAM remains unqualified. Actual CI compiler33467086deca
(PR390/a391c2e20, WASM SHA c5177288...) still does not issue the complete
RGBDFastSLAMReset within a180-second observation window. This is a compiler
timeout, not an observed memory refusal or a runtime SLAM benchmark.

The unchanged59-file native source has SHA
01a6ffc7a8ad9708e904bef83552c150ea27adf81b476008833f46c34a6d3dcd.
35229 browser-worker samples over180.024seconds put90.078% of sampled self
time in wasm-function[11482]. The same original212-byte body was previously
verified against the module bytes. Its structural resemblance to
StampTable::begin_pass remains an inference; the release has no source names.
The longer window strengthens the hotspot evidence without identifying its
Rust owner or proving how many scratch allocations occur.

Evidence: `dev/artifacts/native-state-carry/ci-a391c2e20/full-program/reset-180s/`.
The bounded job exited after181.2seconds; peak aggregate RSS2,023,524KiB,
minimum available memory58,789,152KiB. It ran at nice15 on cores8,9 and did not
touch the compiler checkout or the user's browser. No artifact was emitted.

## Generic constructor control

`tests/compiler-probes/fixtures/NativeRecordResetScaling.mo` removes the SLAM
algorithms entirely. A nested record contains Real descriptors/points,
Integer IDs and Boolean occupancy. Two pure constructors fill the arrays and
carry an Integer generation. Only test copies vary capacity; production
capacities, images and algorithms remain unchanged.

| Capacity | Real output cells | Compiler preparation | Issued memory | Scratch bytes |
| ---: | ---: | ---: | ---: | ---: |
| 16 | 832 | 707ms | 131,072 | 83,512 |
| 64 | 3,328 | 1,594ms | 393,216 | 333,544 |
| 256 | 13,312 | 5,142ms | 1,507,328 | 1,333,672 |
| 1,024 | 53,248 | Exceeded20-second window | Not issued | Not issued |

The first three artifacts were compiled in actual browser workers and admitted
unchanged by NativeProgram. This control checks issuance/layout admission,
not function values or cross-entrypoint State transfer. Timings are individual
observations, not repeated statistical estimates or proof of a complexity
class. Compiler initialization is outside the successful prepare call timings;
timeout observations include worker initialization.

At capacity256, published Real output storage is106,496bytes, while the
compiler advertises1,333,672scratch bytes, about12.52times as much. That is an
actual issued layout for this small constructor, **not an allocation count or
an inferred full-SLAM layout**. It makes a useful ownership/liveness test.

The1024 control's3901samples have a different hotspot distribution:
wasm-function[82]25.17%, [4081]13.84%, [1556]12.75%, [1421]9.64% and
[18794]8.15%. It does **not** reproduce the full reset's90%[11482] hotspot.
The agent should keep the full source/profile for that bug and use this
smaller control to study array/record construction and storage independently.

Evidence: `dev/artifacts/native-record-reset-scaling-2026-10-07/`, including
exact sources, original artifacts, reports, profile and resource receipt.
The complete control run took32.63seconds with peak aggregate RSS1,549,792KiB
and minimum available memory59,207,968KiB. All jobs are terminal.

## Reproduction and memory bound

Run `dev/probe-native-record-reset-scaling.mjs COMPILER_DIRECTORY OUTPUT_DIRECTORY`
through dev/rumoca-bounded-run.mjs with a short scratch TMPDIR and CHROMIUM_PATH.
The control stops before launching larger cases after a refusal/timeout.
`dev/issue-native-program-browser.mjs` now accepts RUMOCA_BROWSER_TIMEOUT_MS
from1000 to300000, defaulting to the previous60000, and records that window.
This is diagnostic-only; no application timeout or compiler path changed.

The current RGB3 source memory audit is separately reproducible with
`node dev/audit-native-slam-memory.mjs`. It verifies that just descriptors,
optical points and native f64 camera inputs require68,935,680bytes under the
existing three-materialized-catalog-copy assumption. That exceeds64MiB
before the remaining State and helpers. This conditional source bound is
for Step, not Reset; a compiler-issued retained/aliased memory plan can
supersede it. See `dev/native-slam-memory-budget.md` for exact assumptions.

Compiler priorities remain complete function/loop lowering, bounded preparation
cost, memory ownership, raw typed image ingress and compatible typed State
transfer. No package pin or production Modelica source changed in this pass.
