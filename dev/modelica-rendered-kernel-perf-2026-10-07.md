# Full rendered SLAM: native kernel baseline and compiler targets

OMC's generated native code spends most sampled cycles on array indexing and
copies. This gives Rumoca a concrete optimization target, but Rumoca has not
beaten OMC or issued the full browser SLAM lifecycle yet.

## Workload and timing

Replay the qualified actual out-and-back flight: 97 captured 848×480 RGB8/Z16
pairs at 15 Hz, with 576 held IMU intervals at 90 Hz. The unchanged Modelica
performs feature detection, matching, inertial estimation, keyframe retrieval,
graph correction and mapping. No truth poses or supplied loop edges enter it.
The complete reference previously verified an actual loop and accepted graph
correction; this timing driver compares 24 observable metrics per frame against
all three reference result rows, rather than independently validating full State.

| Measurement | Native OMC generated C, `-O2` |
| --- | ---: |
| Mean processing call | 1051.076 ms |
| Median processing call | 1027.002 ms |
| 96 processing calls | 100.903 s |
| Simulated duration | 6.4 s |
| Kernel-only simulation/wall ratio | 0.06343× |
| First-image initialization, separately | 953.695 ms |
| Metric comparisons | 6,984 pass; maximum difference 4.44e-16 |

One cold sequential replay on a shared Ryzen 5950X, cores 8–9, nice 15.
Input loading, RGB8/Z16-to-Real reference-ABI conversion, metrics extraction,
diagnostic output, GPU rendering and physics are outside timed calls. Generated
functions and record helpers were compiled fresh from the hash-checked reference
C, not old objects. This is neither browser throughput nor a Rumoca comparison.
Ten times realtime at this workload allows only 6.67 ms per camera interval;
eliminating copies alone cannot close the roughly 158-fold gap.

## Profile and authored owners

A separate `perf record --clockid mono -F 99 -e cycles:u --call-graph fp`
capture includes 9,934 samples inside the 96 processing calls. It excludes 163
samples outside those windows; there are zero lost records. All included periods
belong to the main thread, and 56 unresolved leaves remain in the denominator.
The profiled replay also passes all metric and readonly-camera checks.
Perf records 10,097 throttle and 10,097 unthrottle events over the whole capture;
sample shares locate hotspots and do not measure CPU utilization or exact costs.

| Exclusive leaf category | Weighted processing cycles |
| --- | ---: |
| Array indexing helpers | 45.49% |
| Memory copies | 29.16% |
| Allocation and GC helpers | 5.60% |
| Other resolved leaves | 19.25% |
| Unresolved leaves | 0.51% |

The three largest individual leaves are `memmove` (29.16%),
`calc_base_index_va` (21.51%) and `generic_array_get` (16.42%).
Stack attribution resolves these runtime costs to authored work:

- `RGBDKeyframes_Catalog_copy_p` is the nearest generated owner for 25.83% of
  all processing cycles; memmove below it alone is 25.57%. A checked stack passes
  through `RGBDCatalogGraphCapture.Capture`, catalog publication and frame advance.
  Generated `records.c:185` copies every catalog array, including the
  128×350×49 descriptor array (17,561,600 bytes at the reference Real ABI).
  This is the array width, not a measured copy count or physical DRAM traffic.
- Inclusive `FastFrameScores` stacks account for 39.53%. Generated
  `functions.c:5866` uses generic `real_array_get` operations for grayscale
  conversion and the radius-three stencil. The authored kernels are in
  `models/Vision/Features/FastNativeFrame.mo`; bounds derive from array sizes.
- Nearest-source owners for `MatchRGBDDescriptors` and `RetrieveVisualWords`
  account for 6.74% and 2.90%, respectively, including their runtime helpers.

These stack views overlap the leaf categories and must not be added to them.
They locate cost in this OMC executable, not in Rumoca's unissued full pipeline.

## Requests to Rumoca

1. Preserve immutable record/array values by reference and transfer owned
   buffers when legal. A refused or idle capture must not clone every catalog
   payload. A slot update should materialize its changed ranges while preserving
   previous-State snapshots, rollback and readonly camera inputs. Expose copied
   bytes and allocation high-water counts per source owner.
2. Lower shaped image/stencil accesses to direct typed offsets. Prove radius,
   shape, overflow and index bounds at region entry, hoist invariant strides,
   and preserve necessary dynamic checks. Reuse tiny FAST scratch arrays across
   pixels instead of allocating them at every call. Preserve ordered comparisons,
   signed-zero behavior and existing invalid-input semantics before SIMD/fusion.
3. Retain the already measured WASM fixes: one normal-product evaluation per
   authored PCG iteration, reference carries on inactive branches, and scratch
   reuse by proven lifetime. The prior actual Rumoca profile places 90.80% in
   normal-product/copy owners; this native profile does not replace those receipts.
4. First unblock full Reset/Initialize/Step admission. Reset still expands over
   16.8 million registers and exhausts WASM memory in catalog construction; the
   source-bound allocation report and conditional-definition reproducer remain
   in `modelica-compiler-admission-2026-10-07.md`.

Keep authored capacities, algorithms, rates and numerical budgets unchanged.
Qualify reviewed, revision-bound artifacts with all six existing paired
unprofiled ABBA medians faster than OMC, product counts 247/111/0, unchanged
correctness/readonly/atomicity checks, and FAST 480×848 preparation under 60 s.
When the full lifecycle issues, replay these same captured inputs and add a
matched full-pipeline OMC/Rumoca comparison; separate native-C versus CPU-WASM
target differences. No whole-pipeline performance win is established today.

## Reproduction and receipts

Use the Nix `.#ci` environment and `dev/rumoca-bounded-run.mjs` for heavy work.
The generated C and raw capture from the qualified reference are reused as-is.
`dev/pack-rendered-slam-benchmark.mjs` validates their hashes and packages raw
camera bytes/calibration/held IMU without oracle data. Build
`dev/rendered-slam-omc-benchmark.makefile` in the generated reference directory,
setting `DRIVER_SOURCE` and `DRIVER_OUTPUT`; run the driver with packed input and
an output CSV. Verify with `dev/verify-rendered-slam-benchmark.mjs`.

`dev/analyze-rendered-slam-perf.mjs` checks sample inventory, monotonic processing
windows and zero lost records, retaining unresolved leaves and all threads.
`dev/test-rendered-slam-benchmark.mjs` accepts the two valid receipts and rejects
nine corrupted inputs/reports. These checks run no compiler or SLAM workload.

Frozen summaries, executed driver/makefile/packer preimages, CSVs, resource
receipts, source excerpts and hashes are in
`dev/artifacts/modelica-rendered-kernel-perf-2026-10-07/`.
Large raw input, executable and traces remain under
`$HOME/scratch/slam_web/tmp/rendered-slam-native-benchmark/`.
The executed packer predates a stricter reference-check guard; its frozen
preimage matches the packaging report. The stricter packer reproduces the exact
same 197,453,096-byte input and SHA256. Later verifier/analyzer tightening was
rerun against both original CSVs and did not rerun or change the computation.

See also [the actual rendered reference](modelica-rendered-revisit-2026-10-07.md),
[Rumoca runtime hotspots](modelica-pose-graph-perf-hotspots-2026-10-07.md) and
[the matched compiler comparison](modelica-compiler-comparison-2026-10-07.md).
