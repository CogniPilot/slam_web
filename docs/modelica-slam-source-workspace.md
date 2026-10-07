# Editing the Modelica SLAM source workspace

Open **Files** in the editor and browse **SLAM sources** for the full frontend,
localization, vocabulary, mapping and graph implementation. The **Examples**
folder contains runnable inertial experiments. **Run model** selects the
Modelica entry point independently of the file being edited.

Opening a new workspace snapshots all59 native D435 dependency files, including
`D435FastSLAM`, `D435ImageProfile` and `RGBDFastSLAMIntervals`, and files you
have not opened. Edits are autosaved with the project; **Save project** saves
immediately. **Download** exports a portable project that can be reopened with
**Open project**. The saved dependency texts are retained on reload rather than
silently replaced by a newer site's defaults. **Export source** exports
the file currently being edited.

New workspaces use schemaVersion2. Older schemaVersion1 projects retain their
exact56-file inventory and saved text; loading them does not inject the newer
native entrypoints. Both versions support local saves and portable downloads.

Source files are grouped by responsibility: `Vision/Features`,
`Estimation/Inertial`, `Mapping`, `LoopClosure`, `Optimization`, and `SLAM`.
The explorer shows those paths. Projects saved with the original flat
`models/` paths migrate their path keys when opened; every edited source byte
and the original dependency inventory remain intact. Conflicting old and new
keys are rejected. See [the source guide](../models/README.md).

The workspace is separate from the active estimator. Its execution button says
**Full SLAM execution pending** until the compiled full-state program is
integrated and qualified. The usable experiment remains Modelica inertial
propagation. Opening or editing the workspace does not replace that estimator.

**Check WASM build** sends the complete saved workspace to Rumoca in a dedicated
browser worker. It checks each lifecycle entrypoint and the resulting executable
ABI, and shows the exact source hash, compiler version and any compilation error.
**Cancel build** terminates the compiler worker even during a synchronous WASM
call; it remains available when you switch files. A build uses a snapshot
of the source. Editing during compilation makes the result stale and requires a
new check. Build results do not activate an estimator or alter saved source.

The installed Rumoca0.10.0 package does not yet expose native program compilation.
The current PR382 CI package exposes it, but still rejects the full Reset model
at nested record assignment lowering. These errors are displayed explicitly;
there is no server compiler or alternate application compiler. A successful
build check will still need numerical and full-state runtime qualification.

Source assembly joins the saved texts in the corresponding manifest's order.
The native composition matches the59-file compiler-review export. The API
`assembleRGBDSlamWorkspace` selects the inventory from the saved schema version. It
performs no lowering or numerical processing; Rumoca owns compilation. The
workspace stores source, not live estimator state, executable WASM, a compiler
version or a deployment artifact. See [processing status](modelica-slam-processing.md)
for the remaining compiler/runtime and numerical qualification work.

The language-server worker synchronizes the companion files through Rumoca's
workspace API. The active file remains its current document, avoiding duplicate
class declarations. Companion sources are reused during typing and replaced
when a file or workspace changes. Returning to **Active estimator** clears the
SLAM companions. Completion and hover replies from an older file/context are
discarded.

The actual static application passed the
[browser workspace check](../dev/artifacts/modelica-slam-workspace-browser/browser-E85yjw/report.json):
native D435 file selection, live errors and correction, completion/hover,
stale reply rejection, download of all59 exact dependency texts, IndexedDB
save/reload and preservation of the active estimator. It also imports a saved
schemaVersion1 project while a native-only file is open, restoring its exact56
sources and returning safely to the active estimator. Scene/quality changes
preserve the pending execution control. The fixture uses economical software
graphics; this is an editor/persistence check, not graphics or SLAM throughput
evidence. Earlier browser-FJPBNm and browser-td7sj2 receipts remain historical.
