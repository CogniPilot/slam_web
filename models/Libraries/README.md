# Modelica library

`CogniPilot/` is the pinned
[modelica_models](https://github.com/CogniPilot/modelica_models) Git submodule.
The build initializes it automatically and bundles its Modelica sources into the
static website. Visitors need no Git checkout or server.

To update the pin deliberately:

```sh
git -C models/Libraries/CogniPilot fetch origin main
git -C models/Libraries/CogniPilot checkout --detach FULL_COMMIT_SHA
git add models/Libraries/CogniPilot
```

After switching branches or pulling a changed pin, run
`git submodule update --init -- models/Libraries/CogniPilot`.
The build preserves an existing checkout and local edits. Upstream's nested
benchmark submodules are not needed and are not initialized.

Generated compatibility entrypoints retain a separate revision in
`models/slam-provenance.json`. Refresh them with upstream's Node exporter or a
verified export snapshot:

```sh
node scripts/sync-slam-models.mjs models/Libraries/CogniPilot FULL_COMMIT_SHA [EXPORTED_SNAPSHOT]
```

The consumer checks the revision, class mapping and source hashes before writes.
Algorithm changes belong upstream; browser project edits remain saved locally.
