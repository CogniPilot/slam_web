# Canonical Modelica sources

Reusable SLAM algorithms now live in [CogniPilot/modelica_models](https://github.com/CogniPilot/modelica_models).
Its `Vision` and `SLAM` packages contain the feature, registration, estimator,
mapping and graph models. Edit those packages in that repository.

The existing `models/...` paths here are generated compatibility snapshots.
They preserve the application's flat class names and source-menu identities;
they are not another authored implementation. `models/slam-provenance.json`
records the exact canonical commit, source hashes and class mapping.

Refresh them from a committed local library checkout:

```sh
node scripts/sync-slam-models.mjs "$modelica_models_checkout" FULL_COMMIT_SHA
```

The sync script executes the exporter from that exact commit and does not copy
uncommitted library changes. Set `PYTHON` if Python is not available as `python3`.
Temporary files use `TMPDIR` or `$HOME/scratch/slam_web/tmp`.

Browser rendering, transport, editing and runtime orchestration remain here.
Local loose/tight visual correction qualification runs from Modelica in
`modelica_models`; moving source does not qualify the full browser SLAM runtime.
Existing compiler-admission and performance limitations remain in force.
