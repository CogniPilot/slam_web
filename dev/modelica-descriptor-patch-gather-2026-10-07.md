# Modelica descriptor patch gathering

`models/Vision/Matching/RGBDFeatureMatching.mo` now gathers RGB only for selected
7×7 descriptor neighborhoods. It no longer creates a full grayscale image in
`DescribeRGBDFrame`. Image dimensions remain array-derived; the descriptor
kernel retains its existing fixed 7×7 definition. Calibration, depth units,
depth interpolation, invalid-data admission, normalization order, feature masks
and public output shapes retain their original contracts. The gray-input
function shares admission and normalization with the RGB-input function.

For 350 features in an 848×480 image, the authored RGB conversion workload is
at most 17,150 patch pixels instead of 407,040 image pixels. Overlapping patches
may read the same pixel more than once. The removed dense Real buffer accounts
for 3,256,320 bytes with f64 storage. These are source-level counts, **not a
measured speedup**, and exclude detector, selection, depth qualification,
matching, estimation and mapping work. No vision mathematics moved into JS/TS.

## Numerical comparison

The frozen pre-change owner is the test-only fixture
`tests/compiler-probes/fixtures/RGBDFeatureMatchingDenseReference.mo`, SHA-256
`c2007359260543f725df3d297c920b1cdfd89ef36a48b11decc9c15ca0371446`.
The runner verifies this digest and wraps both actual source files in separate
Modelica packages. Its host code prepares inputs and reviews results; both
descriptor implementations execute as Modelica functions in OpenModelica.

The current production owner has SHA-256
`65d066d629fcd515a6d4b87516c6285150800872d8a993e7c4fabeadd56e9a26`.
All **31 finite controls passed**: 15 RGB cases at 13×17 and 16 RGBA cases at
9×11, each with five feature slots. Every case compares all 266 public values
using exact finite equality and an additional signed-zero check. Both baseline
fixtures independently require enabled slots `[1,1,0,0,1]`, so empty output or
losing the final active feature cannot pass. Controls cover sparse/border and
fractional positions, malformed counts, disabled images, flat contrast,
recovery, ignored data and Z16-scale depth conversion.

This finite execution **does not test actual NaN/Infinity**. Those raw values
are retained in adjacent MAT fixtures and in the explicit WASM test, but the
pure OpenModelica scripting controls substitute huge finite out-of-domain
sentinels. The report identifies this substitution. The optional `--raw`
MAT-based mode remains unqualified; no successful raw-mode execution is claimed.

During the refactor, a dynamically sized normalization helper caused
OpenModelica to produce a four-ULP difference from the original constant-size
division. The helper now retains the original constant 49-sample kernel and
source order. The exact comparison passes after that correction. The fixtures
also caught an out-of-range RGB sample in their first version; the corrected
input pattern stays below 255 and restores the required final valid feature.

Reports, frozen inputs, prepared namespace sources and execution logs are at
`dev/artifacts/modelica-descriptor-patch-gather-2026-10-07/`.
`report.json` binds the runner, production/test/reference source, prepared
script, namespace sources and raw fixtures. Its `reviewMs` measures only report
review, not OpenModelica execution or throughput.

To reproduce the finite controls with the project Nix environment:

```sh
nix develop path:.#ci -c node dev/check-modelica-descriptor-patch-gather.mjs --prepare
nix develop path:.#ci -c omc dev/artifacts/modelica-descriptor-patch-gather-2026-10-07/controls.mos \
  > dev/artifacts/modelica-descriptor-patch-gather-2026-10-07/controls.log 2>&1
control_status=$?
printf '%s\n' "$control_status" \
  > dev/artifacts/modelica-descriptor-patch-gather-2026-10-07/controls.exitstatus
nix develop path:.#ci -c node dev/check-modelica-descriptor-patch-gather.mjs --review
```

An installed Modelica 4.1.0 library is required by this runner. This session used
already installed Nix-store Node and OpenModelica executables because the
sandbox denied the Nix daemon. It was not a fresh Nix environment validation.
The script evaluation generated no native build output. Large builds and
profiling data remain assigned to HOME-derived scratch storage.

## Compiler and full graph status

Additional checks passed:

- Rumoca 0.10.0 parses the modified owner and comparison fixture.
- OpenModelica checks the unchanged 350-feature `RGBDDescriptorFrame` at
  90×160×4: 91,265 equations and variables. Existing notifications about
  default-bound calibration inputs remain. This is a balance check, not
  execution at full capacity.
- TypeScript compilation succeeds.
- Twenty source-composition/edit-validation tests pass. The two scratch-writing
  exporter tests were excluded because scratch is not writable in this session.
- The independently exported current 59-file native D435 source has verified
  per-file hashes and aggregate SHA-256
  `5303fe73ac9ce7d4b51cceb32c47cac44f01e0633527cecd33b35f8c414c0416`
  (737,625 bytes), at the adjacent `native-source/source.mo` and manifest.

`tests/compiler-probes/modelica-rgbd-patch-gather.test.ts` uses Rumoca's
`prepare_native_program` and the existing validated native WASM loader. It
requires bit-identical public outputs, tests actual NaN/Infinity and recovery,
and preserves the full production function bodies. It is an explicit compiler
probe, separate from routine demo CI. The pinned 0.10.0 package lacks this
producer API. The already downloaded PR390 CI package from run 37625070049
(0.10.2/33467086deca) exposes it, but refuses the **frozen dense reference** in
ToDae: `DescribeRGBDFrame has a conditional branch without a value definition`.
Both shape cases fail before numerical assertions. This older CI package is
not a test of the later compiler revisions described in response 32.

The existing full-350 native descriptor gate now checks the complete public
output contract without requiring the removed private grayscale buffer. When
explicitly given a historical artifact and its matching frozen source, it
still checks that artifact's grayscale intermediate. Source/module binding,
public shapes, invalid-data fixtures and parameter-storage checks remain.
No fresh full-350 native descriptor artifact has been admitted here.

Full native D435 execution, actual nonfinite equivalence, browser integration,
the first failed keyframe-capture diagnosis, sustained full SLAM and 10× realtime
remain outstanding. This change is local and does not update the published
Pages demo or the production compiler pin. The session still denies scratch
writes and GitHub access, preventing the new native replay/build and publishing.
