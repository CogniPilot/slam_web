# Modelica graph compiler admission

Full browser SLAM remains blocked on Rumoca compilation. Production stays on
Rumoca 0.10.0; no host algorithm or compiler fallback was added.

`RGBDGraphProcessing.Correct` now uses its fixed node capacity and guards the
active prefix in both warm-start and corrected-pose publication. This removes
the two runtime loop bounds identified by the compiler agent. State layout,
capacities, optimizer math and acceptance thresholds are unchanged.

All **33 OpenModelica graph-processing checks pass**. The original 31 controls
are joined by 33-node and 127-node catalogs with the full 128/256/350/14400
storage. Both correct their active poses and reproject all map points while
preserving raw owners and deliberately invalid inactive pose payloads. The
bounded reference run took 42.4 seconds and peaked at 1.01 GiB RSS; this includes
reference compilation and checks, and is not production throughput.

The exact 59-file native snapshot has SHA256
`5d485ddd965180a6eb5f8ffd7b3fcae6425cc590994966583fd2ef00915282ff`.
Installed Rumoca parses it. PR 390's CI WASM package, run 37684703486/artifact
11511416451, reports merge revision `7e8ec61d2adf`. Preparing
`D435FastSLAMStep` now refuses in ToDae because it cannot prove that a guarded
`problem.nodeCount` is defined. The refusal takes 5.66 seconds, about 635 MiB
peak RSS. This is a different failure from the removed runtime loop bounds.

[GuardedProblem.mo](../tests/compiler-probes/fixtures/GuardedProblem.mo) reduces
that failure to an outer request and successive validity guards around a
prepared record. OpenModelica returns the expected values for all 14 cases;
the current Rumoca package refuses before execution. Its strict regression is
`tests/compiler-probes/modelica-guarded-problem.test.ts`. The compiler agent has
the exact source, receipt and reproducer in [the handoff](rumoca-agent-handoff.md).

The paired package also passes both small RGB descriptor WASM comparisons
(13×17 RGB and 9×11 RGBA), including every public f64 bit and invalid-input
recovery. Its direct f64 schema73/profilev2 ABI retains the reviewed five
arguments and Y/P layout; the loader now admits that combination. An actual
90×160 connected-array artifact passes eight moving frames, readonly input,
checkpoint reload, reset and stale-source checks in Node. A static browser
worker separately checks 86400 exact values over three moving frames, readonly
inputs and whole-memory checkpoint reload. The compiler emits
28803 scalar stages and a 2.35 MB module here, so compactness remains work for
Rumoca. These controls do not qualify native848/full350 vision or browser SLAM.

The startup recovery test now waits until the loading screen closes before
checking workspace controls. All 20 browser smoke tests pass, with one optional
compiler-candidate test skipped. All 215 unit tests and the production build pass.

Detailed local receipts, frozen sources and the issued f64 artifact are under
`dev/artifacts/modelica-graph-bounds-2026-10-07/`. The full graph receipt is
`dev/artifacts/modelica-graph-processing-semantics/graph-processing-semantics-ZtAyrm/report.json`.

```sh
OMC_BIN=/path/to/omc nix develop --no-update-lock-file .#ci --command \
  node dev/check-modelica-graph-processing.mjs
```
