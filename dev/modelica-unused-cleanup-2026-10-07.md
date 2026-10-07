# Unused Modelica source removal

Deleted 18 unused Modelica implementation files, including raster/thumbnail Harris
variants, the obsolete FAST raster adapter models, Grid, CPU depth-noise models,
unused tour/RNG/registration experiments and the non-executable SLAM placeholder.
Removed the duplicated depth-noise models from SensorObservations.mo; that file
now contains the active IMU/GPS observation mathematics only. Depth measurement
noise and quantization run in the Three.js shader.

The editor offers current native Harris/FAST source and the runnable inertial
baseline. Full SLAM remains accessible through its complete source workspace.
The partial SLAM placeholder and its automatic starter substitution are removed.
Saved student source still loads without silent replacement.

Thirteen component issuance surfaces for current SLAM functions are now explicit
fixtures under tests/compiler-probes/fixtures/components. Their bytes are
unchanged, all ten affected source exporters pass, and the application loader
cannot bundle these test-only models. Obsolete probes were deleted; no new
legacy source archive was created. Historical numerical evidence remains bound
to its original sources.

The file-level dependency audit finds 74 current Modelica files, 68 application
roots and no unreachable files. This conservative symbol audit is not a
compiler or proof that every declaration is live. The canonical 59-file native
SLAM composition is unchanged by this cleanup.

The production build and TypeScript check pass, as do 76 focused unit tests and
three hardware-browser checks against the new static build: camera/INS startup,
exact saved-source build/refusal, and complete source editor/LSP/save/download/
reload. The optional separate candidate-compiler browser test was skipped.
The production bundle contains none of the deleted detector/depth/placeholder
model definitions.

The installed Rumoca 0.10.0 compiler still traps on the current Harris
array-reduction probe. This failing numerical probe is retained and recorded;
it has not been converted to a success or hidden by the cleanup. A separate
stale workspace test was corrected to verify current sources against current
files, then independently restore every byte of a frozen earlier delivery.
Historical source is not treated as a golden for later algorithm edits.

[Removal inventory and hashes](artifacts/modelica-unused-cleanup-2026-10-07/removals.json),
[source audit](artifacts/modelica-unused-cleanup-2026-10-07/source-inventory.json),
and [qualification review](artifacts/modelica-unused-cleanup-2026-10-07/review.json)
retain passing and failing evidence. Builds and browser artifacts stay under
$HOME/scratch/slam_web. Full browser SLAM and 10× realtime remain pending.
