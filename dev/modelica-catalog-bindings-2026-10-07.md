# Catalog equations and native SLAM reset

The Rumoca agent's response27 identified a source error in
`RGBDKeyframes.Catalog`: seven field declarations had value bindings while
models assigned the complete output record through `Empty`. Modelica treats
binding equations outside functions as equations, including those inherited
from record fields ([equation classification](https://specification.modelica.org/maint/3.6/equations.html),
[declaration equations](https://specification.modelica.org/maint/3.6/class-predefined-types-and-declarations.html)).
The two definitions overdetermine the model. This is an authored Modelica
error; the compiler must continue refusing it.

The seven bindings are removed. `RGBDKeyframes.Empty` already explicitly
initializes generation, vocabulary version, next ID/slot, last image epoch/time
and every occupancy value, alongside the remaining record payload. Its math
and values are unchanged. No capacities, image formats, algorithm policies or
compiler pin changed. Existing saved source stays as authored; this change
does not silently rewrite a student's workspace.

The replacement immutable native source is
[source.mo](artifacts/modelica-catalog-bindings-2026-10-07/native-source/source.mo),
with its [manifest](artifacts/modelica-catalog-bindings-2026-10-07/native-source/source-manifest.json):
59 files,714400 bytes, SHA256
`865e41108e8f62cbca2c482499d8a3751c67676553924c2fd6d9224b46c4e119`.
Only `models/RGBDKeyframes.mo` differs from the historical SHA9cd25ba7
composition. Earlier snapshots and their qualification receipts remain intact.

## Evidence

The language-balance [regression](artifacts/modelica-catalog-bindings-2026-10-07/catalog-bindings-vFUkPh/report.json)
loads the actual Catalog/Empty package with explicitly small diagnostic
capacities. The fixture uses the same model-level whole-record equation as
`RGBDFastSLAMReset`, rather than a function-only assignment. The old source
has336 equations and327 variables and fails overdetermination. The corrected
source has327 equations and327 variables, simulates, and passes all seven
initialization checks. Three occupied slots account for three of the nine
extra equations; the other six are scalar field bindings.

Two preliminary fixture runs hit an OpenModelica C-generation error for
record-array slices. Using the same disabled `preOptModules evalFunc` setting
as the established full-graph reference resolves it without changing source
math or reducing the checks. Both failed receipts remain beside the passing
run. This is reference-tool behavior, not a newly asserted Rumoca defect.

The [full-capacity initialization differential](artifacts/modelica-catalog-bindings-2026-10-07/full-capacity-initialization/report.json)
checks every field of all128 keyframe slots, including350×49 descriptor
payloads, against the frozen initialization reference for three generation/
vocabulary configurations. All three checks pass, validating384 slots. It
takes3.62s and peaks at181612KiB owned RSS.

The [full raw SLAM composition](artifacts/modelica-full-raw-composition/full-raw-composition-raw-graph-MZ2mn0/report.json)
retains128 keyframes,256 vocabulary words and14400 map slots on its90×160
diagnostic input. All30 checks pass, exercising78 matches, visual correction,
keyframe/vocabulary publication,42 mapped landmarks and graph correction.
It takes11.34s and peaks at1011744KiB owned RSS. These are Modelica reference
results, not execution of the complete public model in Rumoca WASM.

The actual browser workspace test passes after the fix: editable59-file
dependencies, Rumoca LSP diagnostics/hover/completion, portable download,
local save and reload. Every unedited file matches current authored source,
including this Catalog. The test takes about15s within a two-core, low-priority
guard. This verifies source authoring and persistence, not native SLAM.

The compiler agent has the new snapshot/hash through
`dev/rumoca-agent-handoff.md`. Remaining native issuance gaps include dependent
raster selection domains, typed native registers and missing typed WASM
operations. Full browser SLAM and10× realtime remain unaccepted.

The [consolidated review](artifacts/modelica-catalog-bindings-2026-10-07/review.json)
binds the current source hashes to these reference and browser receipts.
