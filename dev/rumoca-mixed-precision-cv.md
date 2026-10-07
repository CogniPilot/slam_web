# Float32 computer vision, Float64 dynamics and estimation

## Requested execution policy

The user requested this precision split on 2026-10-05. It supersedes bulk
Float32-to-Float64 image ingestion as the preferred production path.

Keep GPU RGB as packed U8 until compiler-generated conversion into Float32
CV storage. Keep GPU axial depth and LiDAR coordinates as Float32, including
their validity information. Feature scoring, descriptors, image processing
and dense sensor intermediates should use Float32 storage and arithmetic.
Retain Float64 for time, quadrotor dynamics, integration, pose/covariance
estimation and pose-graph optimization. Promote small selected observations
at their compiler-owned boundary; do not expand whole images or point clouds
to Float64 by default. Integer indexing and counters remain exact integers.

This is a requested compiler capability, not an integrated preview feature.
The current preview and existing F64 artifact profiles are unchanged.

## What Modelica specifies

Modelica defines `Real` through a machine representation named `RealType`;
it does not expose a standard `Float32` declaration or a standard per-variable
precision attribute. The specification recommends the range of IEEE double
precision for floating literals, and specifies `double` for the external C
mapping. These provisions do not prescribe every internal storage cell as
eight bytes. A selectable single-precision execution profile must nevertheless
document its reduced range and rounding, and preserve external ABI mappings.
[Real type](https://specification.modelica.org/maint/3.6/class-predefined-types-and-declarations.html#real-type),
[floating literals](https://specification.modelica.org/maint/3.6/lexical-structure.html#floating-point-numbers).

A Rumoca-specific precision annotation or explicit compiler graph configuration
can express this policy while keeping the algorithms in Modelica. Annotation
syntax/semantics have not been implemented or chosen here; `type X = Real`
alone does not select a storage width. Modelica provides a mechanism for
[vendor annotations](https://specification.modelica.org/maint/3.6/annotations.html#vendor-specific-annotations).

## User selection and precedent

The user also requested selectable precision. Expose **Computer vision
precision** in the existing Configuration pane with **Float32** (preferred
default once supported) and **Float64** (comparison/reference). Show physics
and estimation precision as Float64. Keep this choice independent of graphics
quality and sensor rates so numerical experiments do not silently change
the scene or workload.

Persist the requested precision in the project. Include it in source-bound
compilation requests, artifact validation, cache identity and exported build
metadata. A change recompiles the CV partition and resets incompatible CV
state at a lockstep boundary. Report the effective compiled precision; refuse
an unsupported profile explicitly rather than silently running F64 beneath
a Float32 selection. Do not enable a working-looking selector before the
backend and acceptance gates exist. Optional per-node overrides can follow
after partition ownership and cross-profile edges are implemented.

There is a concrete Dymola ecosystem precedent: the Modelica Association's
[2025 Dymola and Software Production Engineering tutorial](https://www.efmi-standard.org/media/resources/eFMI-Tutorial-2025-Part-3.pdf)
generates both 32-bit and 64-bit floating-point production code, exposes both
through Modelica software-in-the-loop proxies, and selects the production
code with `__defining_code` (PDF pages 10, 18 and 25, zero-based). This is an
embedded algorithm code-generation workflow, not evidence of an ordinary
Dymola per-variable precision switch. The
[eFMI resources](https://www.efmi-standard.org/resources/) also document
validated 32/64-bit production-code variants from the same algorithm.

OpenModelica's documented
[`-single` option](https://openmodelica.org/doc/OpenModelicaUsersGuide/latest/simulationflags.html#single)
selects single precision for MAT result-file output. It does not document
Float32 solver arithmetic or per-subsystem execution. No equivalent OMC
mixed-precision compiler selector was verified in this research. FMI Float32
interface support is a separate capability and does not establish internal
Modelica arithmetic precision.

## Existing compiler owners and actual gaps

Paths below are relative to the authoritative Rumoca checkout.

- `crates/rumoca-ir-solve/src/typed_program/types.rs` already defines
  `SolveRealFormat::{Binary32,Binary64}`, arithmetic profiles, typed tensor
  shapes and `Real32` value bits. Reuse these owners rather than adding a
  parallel CV-specific IR.
- `crates/rumoca-eval-solve/src/typed_program/number.rs` already evaluates
  Real32 unary/binary operations with f32 arithmetic. This is useful as an
  independent execution reference; it does not prove the WASM path works.
- Modelica typed-function lowering currently selects Binary64. The source
  precision policy must reach this construction point and nested calls.
- `crates/rumoca-exec-wasm/src/typed_call/program.rs` explicitly rejects
  non-Binary64 arithmetic. `typed_call/emit.rs` rejects Real32 constants.
- `typed_call/layout.rs` and `typed_call/numbers.rs` use eight-byte cells;
  numeric operations emit F64 instructions. Removing the rejection alone
  would produce the wrong storage and arithmetic.
- The legacy scalar program and native whole-model P/Y layout are F64.
  `src/modelica-native-program.ts` also exposes Float64Array fields. Raw GPU
  F32 bytes cannot be reinterpreted as these existing inputs.

## Implementation sequence

The user explicitly requires the WASM backend to consume Solve IR. The
production path is Modelica source -> source-owned typed Solve IR -> WASM.
Precision belongs in canonical Solve IR arithmetic profiles, value types,
operations and checked layouts. Extend its existing Binary32 machinery;
do not introduce a separate CV IR, hand-written algorithm WASM or an
application-side WAT generator as the implementation. A raw transport
canary does not establish this compiler path. Acceptance must demonstrate
actual source lowering and WASM emission from the resulting Solve IR.

The app's older `modelica-export.ts`, the now-removed `modelica-state-export.ts`,
`modelica-raster-export.ts`, `modelica-staged-raster-export.ts`,
`modelica-feature-raster-export.ts` and `modelica-separable-raster-export.ts`
already consume compiler-exported Solve IR. They are separate application-side
WASM emitters, not a second path compiling Modelica equations without Solve
IR. Some additionally construct raster addressing/loops or ODE integration
machinery in TypeScript. Consolidate those responsibilities into Rumoca's
Solve IR/backend owners, and retire the emitters and their cached profiles
as compiler-issued replacements become executable. The detector still calls
these emitters. The inertial worker now delegates to Rumoca's Solve IR
simulation session; its TypeScript WAT/RK4 generator is removed. That session
owns integration but does not guarantee native generation for every kernel.

1. Issue precision from resolved Modelica declaration/function/region owners.
   Preserve source IDs, provenance, dimensions and the selected profile in
   artifacts and cache keys. Initially support an explicit stateless CV
   partition and F64 dynamics partition; one linker can assemble them into
   one processing graph without separate application processes.
2. Add an optional checked typed WASM profile with four-byte Real32 fields
   and registers. Preserve current F64 profiles. Compute widths, alignment,
   stride, lifetime allocation, borrowed views, call frames, output scratch,
   copies and bounds from scalar types rather than changing every cell to
   four bytes. Integer/Boolean representations need their own fixed contract.
3. Emit actual F32 loads/stores/constants/arithmetic/comparisons. Carry the
   correct profile through Map, Fold, nested calls and reductions. Preserve
   defined accumulation order and per-operation rounding; SIMD must retain
   the selected numerical contract. Handle imported math explicitly rather
   than silently computing all intermediates as F64.
4. Bind packed RGB U8 and raw F32 depth/LiDAR input views to exact source
   fields. Accept GPU row orientation through compiler-issued strides so
   host JavaScript does not flip, unpack or convert every pixel. Compile
   U8-to-F32 conversion into the same partition. Validate the full capture
   descriptor before publishing results and preserve input immutability.
5. Issue checked F32-to-F64 edges for selected observations, with explicit
   narrowing on the reverse edge when required. Avoid per-pixel widening
   at existing F64 pure-call boundaries. Co-locate capture and the compiled
   graph in one worker to permit direct readback into issued WASM views.

## Acceptance and profiling

Use actual Modelica source fixtures, source edits and native/browser runs.
Check raw incoming F32 bits, signed zero, finite/subnormal values, row
orientation, strides, RGB channel order and alpha omission. Check F32 results
against an F32 reference with stated rounding and accumulation order; do not
require F64 numerical equality after intentionally changing precision. Retain
NaN/invalid-sensor policy and exact integer bounds/fault ordering.

Test wrong source/profile/shape/buffer ownership, overlap, late faults,
transactional output rollback, reset and persistence. Verify F64 dynamics
remain numerically unchanged. Inspect emitted instructions and layouts to
prove four-byte CV storage and F32 arithmetic, rather than relying on an
artifact label or a JavaScript typed array.

Matched ABBA/BAAB measurements should separate GPU rendering, readback,
compiled U8 ingestion, CV, observation promotion and F64 estimation. Report
bytes, allocations, CPU load and complete lockstep throughput. Four-byte
storage halves the bytes for those Real buffers; it does not guarantee a
twofold compute gain or the 10x realtime goal.

The [direct GPU-to-WASM experiment](gpu-wasm-handoff-verification.json)
established raw transport only. Its approximate 0.05–0.07 ms savings do not
establish a full-model speedup. Bulk conversion has not been established as
the dominant bottleneck; removing it and reducing storage remain concrete
changes to measure alongside the compiler and rendering work.
