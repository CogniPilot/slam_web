The app includes an unmodified, pinned copy of [CogniPilot Modelica Models](https://github.com/CogniPilot/modelica_models).
Its package layout, license, notice and file hashes are retained in `CogniPilot/`.
Library sources are available in the editor and saved with each new project.

Update from a committed upstream checkout:

```sh
node scripts/sync-modelica-models.mjs ../modelica_models FULL_COMMIT_SHA
```

The updater copies library packages, including their examples and tests. It does
not copy uncommitted changes, compiler outputs or upstream tooling.
