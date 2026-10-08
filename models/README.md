# Modelica sources

The canonical library is maintained in
[CogniPilot Modelica Models](https://github.com/CogniPilot/modelica_models).
`Libraries/CogniPilot` is a Git submodule pinned by this repository. Its sources
are bundled with the static website and remain editable in saved projects.

The other directories contain generated compatibility snapshots from that
library. `slam-provenance.json` records their upstream revision, class mapping
and hashes. Algorithm changes belong upstream, rather than in these snapshots.

Use **Docs** in the app to browse package help and **Files** to edit your project
copy. Saved projects retain their own source when the bundled library changes.
The web app owns rendering, transport, editing and presentation. Source migration
does not establish full browser SLAM execution.
