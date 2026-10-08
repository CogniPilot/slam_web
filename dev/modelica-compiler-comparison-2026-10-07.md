# Matched optimizer runtime: OMC and Rumoca

Rumoca's current CPU WASM takes 3.2–12 times as long as optimized OMC native C
on six matched `PGRun` workloads. Both execute the same production Modelica
function with full 128-node/256-edge storage and identical runtime inputs.
This is a component comparison, not full SLAM throughput or equivalent targets.

| Input | OMC C median | Rumoca WASM median | Rumoca / OMC |
| --- | ---: | ---: | ---: |
| Eight-pose rotated correlated loop | 49.56 ms | 558.85 ms | 11.28 |
| 128 nodes, late 256th loop | 591.93 ms | 3190.78 ms | 5.39 |
| All 128 nodes and all 256 edges | 427.96 ms | 1366.00 ms | 3.19 |
| One optimizer iteration | 6.12 ms | 73.51 ms | 12.02 |
| Stationary optimum | 0.614 ms | 4.176 ms | 6.80 |
| Disabled NaN padding | 48.50 ms | 549.06 ms | 11.32 |

Each case runs OMC/WASM/WASM/OMC blocks, two warmups and three measured calls
per block. Medians combine six measurements per engine. Timings exclude input
generation/loading, binary transport, numerical oracles and output serialization.
Every call retains its output; repeated results are bit-stable within each
engine, and all Real/Integer input bytes remain unchanged. Each block passes
the independent quaternion/objective/gauge/budget oracle. Active pose differences
between engines are at most 4.44e-15; accepted and PCG iteration counts match.
Dense output also passes the independent known-geometry convergence check.

Host: Ryzen 9 5950X, affinity 6–7, nice15, shared host load (end load averages
5.12/6.46/8.49). OMP/OpenBLAS/GC marker threads are limited to one. The bounded
69.26-second comparison peaks at 165112 KiB process-tree RSS and retains more
than 53 GiB available host memory. This is not an isolated-machine benchmark.

OMC identifies as `a96aa1a-cmake`; its generated function C is rebuilt with
GCC15.2.0, `-O3`, without fast-math or LTO. The driver uses OMC's normal array
and allocation runtime. Rumoca is actual merged-main 0.10.2 / `f0e83f00ab21`,
executed by Node24.21.0. No comparable OMC WASM build was measured, so the ratio
includes target/compiler/runtime differences and does not isolate WASM overhead.

The Rumoca module is 244114 bytes and uses 16121856 bytes of linear memory.
The unstripped OMC driver ELF is 86160 bytes, with 68342648 bytes of shared
dependency files identified by `ldd`. Those dependency file sizes are neither
resident memory nor a standalone bundle size; Rumoca also requires a host JS
engine. These figures do not establish a portable artifact-size winner.

## Compilation and generated work

Fresh OMC `buildModel(PoseGraphRunStorage)` took 82.05 seconds and about 1.29 GiB
peak RSS. This builds a full simulation executable with thousands of scalar
inputs and its generated wrapper; the separately linked `-O3` function driver
build takes 1.25 seconds. Rumoca prepares its direct-assignment module for this
root in 2.023 seconds. These are different output scopes; neither ratio is a
fair general compiler speed comparison.

For complete optimizer admission, the existing OMC acceptance model compiles in
about 2.447 seconds and passes 20 checks; Rumoca still refuses the full production
root above 64 MiB scratch. Its separately issued PGRun does not replace complete
optimizer validation and atomic publication.

The earlier [generated-code profile](modelica-pose-graph-storage-2026-10-07.md)
explains a concrete reusable optimization opportunity: dense Rumoca PGRun
performs 27387125288 logical copied bytes per evaluation, and stationary PGRun
still performs 182717504. Original-module perf attributes 35.49% of weighted
leaf cycles to memmove. Logical widths are not measured DRAM traffic. The
comparison strengthens the request for readonly views, alias-safe array
updates, lazy domains and safe scratch lifetime reuse; it does not establish
how much speedup any single fix will deliver.

## Evidence and reproduction

Frozen reports, inputs, generated C, source preimages and hash manifest:
`dev/artifacts/modelica-compiler-comparison-2026-10-07/`.
Large generated simulator files and executables remain in
`$HOME/scratch/slam_web/tmp/pose-graph-compiler-comparison/`.
Production optimizer SHA256 is
`c93b6acbbe1f8f699fd6f79bb5bfbcf8f80dffb2830ee6666426a98751785932`.

Load that production source and `tests/compiler-probes/fixtures/PoseGraphStorage.mo`
with OMC using the flags recorded in `compile.mos`, then build
`PoseGraphRunStorage`. From its generated directory, build the driver using
`dev/pose-graph-omc-benchmark.makefile` with `DRIVER_SOURCE` set to the absolute
path of `dev/benchmark-pose-graph-omc.c`. Run under the Nix CI shell and the
bounded resource wrapper, with the affinity/thread limits above:

```sh
node dev/benchmark-pose-graph-compilers.mjs \
  "$artifact" "$exactSource" "$generatedDirectory/pgrun-driver" "$reportDirectory" \
  --require-faster-than-omc
```

The optional flag requires Rumoca's median to be strictly below OMC on **every**
workload. A missed target exits nonzero after retaining the numerical report and
`performance-gate.json`; numerical success alone remains a separate result.
Each block must also match accepted/PCG iteration counts across engines.
`node dev/pose-graph-performance-gate.mjs "$reportDirectory/runtime-comparison.json"`
checks an existing trusted receipt without rerunning it. It requires all six
workloads, four ABBA blocks and six finite measurements per engine, recomputes
medians, and rejects divergent iteration counts or pose comparisons. It does not
authenticate a supplied receipt or certify full-SLAM execution.

The artifact must be the actual compiler-issued `PoseGraphRunStorage` program,
bound to its exact source. Full browser SLAM remains unverified; no production
compiler pin, Modelica algorithm, capacity or acceptance gate changed.
