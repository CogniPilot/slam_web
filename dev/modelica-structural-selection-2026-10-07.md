# Structural selection and keyframe-refusal diagnosis

Rumoca response 31 requested a structural lower bound for the feature-selection
grid loop. `FeatureSelection.minimumBorder` now has `annotation(Evaluate = true)`.
The numerical kernel, image dimensions, capacities and settings are unchanged.
This annotation allows `FastFeatureSelection` to retain its inherited
`minimumBorder=3` modification; making the base declaration `final` would
prevent that modification.

The exact 59-file native-camera composition is retained at
`artifacts/modelica-structural-selection-2026-10-07/native-source/source.mo`,
with its adjacent source manifest. Its SHA-256 is
`984532dc806cfbdebfbdb697db5abe7e71bf4eabf0c9f2bd955ed42a05ff26d8`;
the source is 735,124 bytes. Exporting source does not compile or admit it.

Validation completed with already installed Nix-store tools:

- Rumoca 0.10.0 parses the modified selection source successfully.
- OpenModelica checks `FeatureSelection`, `FastFeatureSelection` and
  `GridFeatureSelection`: each remains balanced at 57,611 equations/variables.
  Its existing notifications about default-bound top-level inputs remain.
- Twenty browser source-composition/edit-validation tests pass. The two tests
  that write disposable scratch exports were excluded from this invocation.
  The complete native export above was separately generated and hash-bound.

These are syntax, balance and composition checks. They do not establish the
latest Rumoca branch's native issuance, numerical WASM execution or speed.

## First failed keyframe capture

The 91-frame reference flight previously refused mapping at epochs 76–90.
An optional test-only diagnostic now repeats the production descriptor, frame,
keyframe-policy and graph-capture owners at the **first** completed image whose
mapping failed. It uses the accepted estimated pose/covariance and raw sensor
data. It never publishes the diagnostic catalog or graph, uses no oracle pose,
and leaves all original checks and numerical CSV columns intact.

Enable it alongside the extended replay:

```sh
SLAM_REFERENCE_CAPTURE_DIAGNOSTIC=1 \
SLAM_REFERENCE_SCENARIO=flight-extended \
SLAM_REFERENCE_CFLAGS=-O2 SLAM_REFERENCE_SECONDS=500 \
node dev/check-modelica-rendered-flight-slam.mjs \
  "$HOME/scratch/slam_web/tmp/flight-OIdp94/output"
```

The existing runner requires an independently installed OpenModelica and
Modelica 4.1.0; set `OMC_BIN` when necessary. Builds and replay data stay under
HOME-derived scratch storage. The report's `captureFailureDiagnostic` includes
the trace receipt and its ordered field names: frame acceptance/reason, policy
validity/request/reason, visual-capture acceptance/reason, retrieval reason,
sequential-verification reason, graph reason, sequential matches and inliers.
The updated 26-field trace additionally checks frame binding using the actual
observation/capture receipts, runs the production landmark projector, and
reports mapping admission plus catalog/update/map/anchor reasons. Projection
and mapping run only after visual capture accepts. Zero-filled stages after a
refused prerequisite were not executed. Diagnostic proposals are never committed.

The reference runner decodes these receipts and checks the logged epoch against
the first accepted/completed image with mapping refused in the numerical output.
It rejects malformed, truncated, duplicate or inconsistent receipts. Three
decoder tests pass, including the distinction between graph-capture refusal,
later mapping refusal and a policy hold. This does not execute those Modelica
owners or identify the actual refusal cause in the retained flight.

Rumoca parses all three modified test fixtures. OpenModelica checks the enclosing
replay with the extended diagnostic; the replay remains balanced at 544
equations/variables. JavaScript syntax and whitespace checks pass. The new
diagnostic has **not** yet run against the full flight. No specific capture
refusal cause or mapping fix is claimed.

Two diagnostic domain controls are staged in
`../tests/modelica/RGBDRenderedCaptureDiagnosticsTests.mo`: a valid empty image
must stop at the minimum-feature policy, and an invalid epoch must stop at
frame admission. An attempted direct OpenModelica scripting evaluation hit
the declared 4 GiB virtual-memory ceiling while its old frontend instantiated
the full catalog descriptor record. OpenModelica returned process status zero
but emitted an out-of-memory error and no Boolean result: this is a failed
control attempt, not a pass. The process is terminal; the limit was not raised
and State capacities were not reduced. Execute these controls through the
native compiled reference path when scratch builds are available again.

At this checkpoint, the session sandbox denies scratch writes, the Nix daemon
socket and GitHub network access. The already installed Nix-store Node and
OpenModelica executables allowed the checks above; this was not a fresh
`nix develop` run. Full replay, new compiler-artifact validation and publishing
remain outstanding. Full browser SLAM and 10x realtime are not qualified.
