# Exact initializer reference preparation

This diagnosis uses the unchanged full90×160 RGBA/depth, 350-feature Case1
from `localization-initialize-semantics-rVlfJZ`. Every one of its18 Modelica
source preimages and original driver digest was verified against the archived
report before copying to scratch. Source math, cases and capacities did not
change. These phase probes are **not numerical acceptance**.

`dev/diagnose-modelica-localization-initialize.mjs` separates `checkModel` and
`translateModel`. Both keep the original frontend flags and documented
`--preOptModules-=evalFunc`. Only `execstat` logging was added. Each phase has
a30s/8GiB limit,16GiB host reserve, CPUs8/9, nice15 and OMP1. An8s perf sample
attaches only to the newly owned OMC command whose exact script argument
matches this probe. Source/runner controls are never reduced. The original
120s numerical timeout remains a failure.

| Probe | Result | Elapsed | Peak owned RSS |
| --- | --- | ---: | ---: |
| `localization-initialize-check-12sqeT` | checkModel returned, status0 |22.281s |1,400,328KiB |
| `localization-initialize-translate-ptEfqU` | watchdog timeout, status124 |30.224s |1,635,676KiB |

Source bookends match the immutable receipt for both. `checkModel` reports
273,204 equations and variables, including192,370 trivial equations. It
therefore establishes source checking/balance for Case1, not successful
translation, a solved initialization or any of the20 numerical assertions.
`execstat` records6.062GB cumulative allocations by counting completion;
this is allocation traffic, **not6GB retained memory**. NFConvertDAE accounts
for1.015GB and NFScalarize for0.5461GB in that log.

The early check sample has1,346 samples and zero lost. It includes frontend
work (51.71% inclusive runFrontEnd,43.00% NFInst,16.95% NFScalarize) and
GC_mark_from at28.70% self. Nested percentages cannot be added. It does not
locate the later translation stall.

The translation sample, collected approximately15..23s after process start,
has789 samples and zero lost. **valueCompare is98.57% self /98.97% inclusive.**
The actual stack enters:

```
SimCodeMain.translateModelCallBackendOB
  BackendDAECreate.lower / lower2 / lowerEqn
    ExpressionSimplify.simplifyAddSymbolicOperation
      simplify / simplifyWithOptions / simplify1FixP
        Expression.traverseExpBottomUp
          simplifyRelation / simplifyRelation2
            simplifyCall / simplifyBuiltinCalls
              List.union / unionElt / listMember / valueEq / valueCompare
```

This is earlier backend equation lowering and builtin-expression
simplification, not the backend `evalFunc` module, generated simulation
execution, covariance propagation or image sampling execution.

The compiler's matching primary
[ExpressionSimplify source](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/FrontEnd/ExpressionSimplify.mo#L1157)
deduplicates max/min array operands with `List.union`. Its
[List implementation](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/Util/List.mo#L1532)
uses repeated linear membership tests, giving quadratic equality work for
distinct operands. This directly matches the sampled owner chain. The frozen
acceptance source has several `max(abs(...))` comparisons over350×49 arrays
(for example held reference descriptors and captured descriptor oracles).
Those reductions are plausible large operand sources; the sample does not
identify which exact expression is being processed. Do not attribute the
stall to one particular assertion or call it a production initializer bug.

Installed `omc --help` documents `--noSimplify`, `--scalarizeMinMax`, and debug
help documents `dumpSimplify`. They were inspected only. In the matching
[simplifyWithOptions implementation](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/FrontEnd/ExpressionSimplify.mo#L122),
noSimplify still falls through to basic simplify1. Consequently it is not
proven to avoid the measured builtin-array rule. Neither changing
scalarizeMinMax nor enabling a large expression dump is a demonstrated fix.

The next supported action is a reviewed **test-harness-only** equivalent
comparison helper: iterate over every original descriptor cell and accumulate
the same strict `abs(actual-expected) < tolerance` predicate. For these fixed
nonempty arrays that has the same finite-value acceptance as the existing
max comparison, and NaN comparisons must still refuse. Keep all17,150 cells,
all full-domain controls and all original tolerances; preserve lazy guarded
fixture branches. That isolates the reference compiler's symbolic max-array
deduplication without changing the production Modelica initializer. It has
not been authored or executed by this diagnosis. Alternatively, investigate
the generic OMC simplifier's deduplication implementation independently.
No further full initializer run is justified before reviewing that change.

Durable reports, owner records, commands, exact MOS, logs and text perf
reports are under `dev/artifacts/modelica-localization-initialize-diagnosis`.
Large raw perf data stays under `$HOME/scratch/slam_web/tmp`; each durable
`raw-profile.json` gives its HOME-relative location, byte count and SHA256.
The original frozen source snapshots remain in the rVlfJZ receipt and are
included in the diagnosis manifest. Both owned OMC processes terminated;
no numerical/browser/Rumoca/full-SLAM result is claimed.

## Authorized exhaustive-comparison follow-up

After the phase diagnosis,43 test-only array max comparison sites were replaced
by `CloseVector`, `CloseMatrix`, `ZeroVector` and `ZeroMatrix` helpers in
`RGBDLocalizationInitializeTests.mo`. All original90×160/350/49 domains,
20 initializer checks,28 scenarios, independent descriptor/point oracles and
strict comparison tolerances remain. Production Modelica sources are unchanged.
These helpers are read-only predicates, not a replacement numerical frontend.

The independent helper gate `localization-comparison-semantics-nh5Qin` passes
**14/14** with three strict CSV rows, process0, source bookends equal,
1.753s/169,468KiB. It checks a mismatch at cell[350,49], exact strict tolerance
boundaries, vector/matrix shape refusals, a separate four-cell original max
comparison and actual runtime Infinity/NaN rejection. The first helper attempt
`q9DEJa` passed11 and failed3 because the test injection `infinity-infinity`
was itself simplified to zero by OMC (retained generated C proves this).
The corrected test uses runtime `sin(exp(1000+clock))`, preserving genuine
nonfinite input without external C or an invalid compile-time literal.

Actual unchanged-production initializer Case1 then ran once:
`localization-initialize-semantics-LxXBeE`, **timeout124**,120.737s,
peak5,526,800KiB, source bookends equal, no CSV and **zero numerical assertions
executed**. No remaining scenarios were launched. This is not a partial
initializer numerical pass; only its comparison helpers are qualified.

An8s sample from that same owned run has1,462 samples/zero lost. The previous
valueCompare-dominated frontier is absent from the reported measured window;
new self costs include GC_mark_from38.91%, List_map14.86%,
GC_header_cache_miss9.95%, and allocator/reclaim routines. Most caller stacks
are unavailable in this recording, so a specific remaining OMC phase or
producer owner cannot be identified. Nor does this sample prove that the
previous hotspot can never recur later. Do not equate allocator traffic with
the measured retained RSS or attribute it to application algorithm execution.

No further producer runs were started. A future diagnostic should expose
phase markers and capture deeper caller stacks under the same resource bounds
before selecting another change. Increasing limits, shrinking the camera,
dropping comparison cells or altering production mathematics is unsupported
by this evidence. All current numerical/browser/Rumoca/full-SLAM qualification
flags remain false. Current source snapshots, helper receipts and the failed
Case1 receipt are included in the diagnosis manifest; raw sampled data remains
on scratch with durable hashes.

## Array-preserving backend diagnostic, 2026-10-06

Installed `omc --version` returns `a96aa1a-cmake`. Its local help explicitly
documents `--newBackend` as experimental array handling, `nfScalarize`,
`vectorizeBindings`, and late `--simCodeScalarize`. Matching primary
[NFInst.resetGlobalFlags](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/NFFrontEnd/NFInst.mo#L309)
disables frontend scalarization for the new backend unless forced, enables
vectorized bindings, and suppresses expansion when scalarization is off.
[SimCodeMain](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/SimCode/SimCodeMain.mo#L1207)
passes the array FlatModel directly to NBackendDAE. This avoids the old
NFConvertDAE/BackendDAECreate route. The C runtime still requires late SimCode
scalarization; disabling it is supported there only for the C++ target.

The driver now has an explicit `OMC_INITIALIZE_BACKEND=new` diagnostic option;
its default old-backend flags are unchanged. The single authorized run used
the same18 Modelica sources as LxXBeE, unchanged full90×160/350/49 domains,
all20 checks, and Case1 of the original28 controls. Exact options were:

```
--newBackend=true --simCodeTarget=C --simCodeScalarize=true --preOptModules-=evalFunc
-d=gen,execstat,dumpBackendClocks,-evalfunc,-nfEvalConstArgFuncs,-nfExpandFuncArgs,-nfExpandOperations,-nfScalarize
--numProcs=2 --vectorizationLimit=1
```

`localization-initialize-semantics-1OgAHo` ended with watchdog **timeout124**
after120.347s, peak1,510,804KiB owned RSS and minimum57,288,984KiB available
RAM. The original120s/8GiB/16GiB-reserve limit, CPUs8/9, nice15 and OMP1 were
preserved. Source bookends match, no CSV was produced, and **zero numerical
assertions executed**. No other scenario was launched. This does not qualify
initialization, even though memory usage was lower than the prior attempt.

One8s sample attached only after verifying the owned OMC command's exact MOS
argument. It contains1,103 samples and zero lost, with32KiB DWARF stacks.
`NBAdjacency.Mode.keyEqual` accounts for71.80% self and `UnorderedMap.find`
for14.32% self. The actual chain is:

```
UnorderedMap.find / addUpdate
  NBSlice.addMatrixEntry / resolveAllReduced / resolveDependency / upgradeRow
    NBAdjacency.Matrix.upgradeRow / upgrade / fullToFinal
      NBCausalize.causalizePseudoArray
        NBackendDAE.main / SimCodeMain.translateModelCallBackendNB
```

This identifies **new-backend pseudo-array dependency causalization** as an
actual preparation frontier. It is not initializer arithmetic or generated
simulation execution. Primary [NBSlice.addMatrixEntry](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/NBackEnd/Util/NBSlice.mo#L1698)
adds scalar adjacency and mode-map entries; [Mode](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/NBackEnd/Util/NBAdjacency.mo#L321)
hashes integer pairs as `31*equationIndex+variableIndex` and compares the two
integers exactly. The sample demonstrates lookup/equality cost, but does not
measure entry counts or collision multiplicities. A quadratic allocation or
particular source expression is therefore not established.

Although installed matching help lists `SBGraph`, matching primary
[NBCausalize.getModule](https://github.com/OpenModelica/OpenModelica/blob/a96aa1a/OMCompiler/Compiler/NBackEnd/Modules/1_Main/NBCausalize.mo#L207)
accepts only `PFPlusExt` and `pseudo`, both selecting this same implementation.
`SBGraph` would be an unsupported-option refusal in this revision, not an
evidence-based next experiment. C++ late array storage would retain this same
earlier causalization path. Local help's `keepArrays` flag alone is not the
frontend `nfScalarize` control, and no verified old-backend bypass was found.

No further full run is justified by these flags alone. A useful next OMC
diagnostic would measure mode-map cardinality, bucket lengths and reduced
dependency sizes at the now-identified owner before selecting a generic
compiler optimization. The separate actual Rumoca core acceptance remains
necessary; this OMC reference timeout must not be represented as a numerical
failure of the initializer itself or as successful application admission.

The durable receipt includes local installed help, exact MOS/command/options,
source preimages, resource report, bounded perf text and raw-profile digest.
Raw36,578,288-byte perf data remains under `$HOME/scratch/slam_web/tmp`, outside the
repository. The32-file receipt manifest SHA256 is
`3a2ff31f568871b12c2a56de981ba0d46faa934feab3f3d46f0c3a5d76991139`.
All owned processes terminated. Production Modelica and compiler source were
not edited.

## Guarded array-function descriptor retry, 2026-10-06

Production RGBDDescriptorFrame now delegates grayscale and description to
DescribeRGBDFrame, guarded by camera acquisition and accepted initialization.
Its full90x160RGBA/depth,350x49 output function gate passes16 cases and native
debugger controls observe zero descriptor calls while disabled. This is separate
from the complete initializer; source and evidence are documented in
`dev/artifacts/modelica-image-acquisition-guard/README.md`.

The actual full Case1 initializer was retried with the changed source and the
original old backend/disabled partial function evaluation, without changing
cases or capacities. `localization-initialize-semantics-rvWURS` still reached
its120s preparation bound (121.36s observed,8328516KiB owned peak), without CSV
or numerical checks. Host available memory remained above29239756KiB, so the
host reserve did not stop this attempt. Its frozen sources/command/resources
and failure report are preserved under
`dev/artifacts/modelica-localization-initialize-semantics/localization-initialize-semantics-rvWURS/`.
No new preparation-frontier attribution was measured, and the unchanged attempt
will not be repeated without a justified compiler/source change. This is an
OpenModelica reference preparation result, not a Rumoca failure or runtime speed.

## Ordered-initializer phase sample, 2026-10-06

The exact w6LTA0 source, with the actual initializer expressed as one ordered
algorithm, was profiled in translate-gne7Bn under a30s/8GiB/16GiB reserve cap.
The owned process reached the30s limit at1,305,588KiB peak; no numerical result.
The8s sample at approximately15..23s has zero lost samples. Its observed path
enters BackendDAEUtil.causalizeDAE (56.51% inclusive), including singularSystemCheck
(38.18%) and scalar adjacency construction (18.24%). List.fold has25.79% self
under absAdjacencyMatrix. These nested percentages must not be added. This
locates the sampled preparation work; it does not identify every expression
responsible or measure actual RGB-D execution. Raw21.9MB perf data stays on
scratch with its HOME-relative path/hash in the durable raw-profile.json.

An earlier profiler launch19mk6o lacked perf on PATH and failed before sampling;
its verified detached owned OMC group was terminated and failure evidence retained.
The driver now checks perf availability before launching and records sampling
errors without abandoning the owned bounded process. PERF_BIN selects the
installed executable; OMC_INITIALIZE_RECEIPT selects a frozen receipt explicitly.

The complete initializer algorithm was then extracted unchanged into production
InitializeRGBDLocalization with a complete model adapter. Actual wrapper case1
XJVnTL still reached8GiB at38.2s without CSV; no unchanged retry followed.
A separately labeled direct-function reference executes the same full-size
math and passes28 scenarios x20 checks. This removes neither the failed model
gate nor the Rumoca/browser requirements. Its source/body/binding audit and
retained fixture failures are in dev/artifacts/modelica-initializer-function/.
