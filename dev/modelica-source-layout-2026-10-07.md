# Modelica source organization

The 71 application source files are grouped into 13 topic directories. See the
[human source guide](../models/README.md). Vision kernels, filtering, mapping,
loop retrieval and graph optimization can now be browsed independently.

The source-location inventory is shared by dynamic browser/Node tooling.
Static imports, compiler probes, source generators, profiling scripts, and
browser file selection use the new paths. The compiler's ordered source
composition and public Modelica identifiers remain unchanged.

Saved workspaces from the flat directory are accepted through a path-key
migration. Every saved dependency remains owned by the project: no text is
filled from the current bundle, and Unicode, BOM, CRLF and empty edits remain
exact. Duplicate old/new identities are refused without executing getters.
Historical compiler receipts and reference fixtures remain unchanged.

This is a source-directory organization, not yet an MSL-style qualified package
namespace. A namespace migration needs coordinated Rumoca workspace loading,
model selection and editable-document dependency support. Empty `package.mo`
files beside global classes would incorrectly imply a valid Modelica package.

Validation:

- All 203 existing supported unit tests passed.
- Both new saved-path migration checks passed; the workspace suite passed42 tests.
- Production TypeScript/Vite build passed.
- Browser source edits, actual language-service diagnostics, project download,
  local reload, desktop startup and phone startup passed (three browser tests).
- Conservative source dependency audit reached all74 files, including the three
  vendored upstream sources.
- All moved source bytes match the preceding revision except for the separately
  prepared removal of the unused D435FastNativeFrame wrapper from D435ImageProfile.

These checks qualify source loading and project persistence, not full browser
SLAM execution, a generated FMU, or a new performance result.
