# Development

Students use the static browser site; maintainers use the pinned Nix shell:

```sh
nix develop --no-update-lock-file path:.#ci
npm ci
npm run assets
npm run dev
```

The shell uses `$HOME/scratch/slam_web` for temporary files and default Cargo/npm
caches. Explicit cache overrides are preserved. Profiling traces, large compiler
outputs, downloads, and disposable worktrees also belong there. Keep source and
durable review evidence in the repository.

## Checks and deployment

Run the same locked environment as CI, including bounded software-rendered browser
smoke checks, before pushing:

```sh
CI=1 nix develop --no-update-lock-file .#ci --command bash scripts/verify.sh
```

Use an unused `SLAM_PREVIEW_PORT` if a local preview already occupies 4173.
For individual checks inside the shell:

```sh
npm test
npm run build
npm run test:browser
```

GitHub Actions checks the pinned toolchain, runs these supported-demo gates, and
deploys the static `dist` directory to GitHub Pages after they pass on `main`.
Pull requests run CI without deploying. Browser runtimes, workers, editor assets,
and scene assets load from the same origin; no application backend is required.
Browser smoke checks run in two shards against the same uploaded build; deployment
waits for both. Each shard has a six-minute test budget. The local verification
script runs the supported gates sequentially by default.

For an explicitly requested time-sensitive demo, a manual workflow dispatch
can set `skip_browser_checks` to true. This skips browser jobs while retaining
the Nix build and unit gate. It defaults to false; ordinary pushes and pull
requests keep the browser smoke checks.

Browser CI uses SwiftShader for isolated shader-format and transfer checks plus
configuration, project validation, editor, build and startup behavior. It does
not run the full graphics/sensor matrix or qualify hardware throughput. Sensor
component fixtures suspend unrelated continuous viewer rendering.

Run the complete supported browser suite on a machine with a hardware GPU:

```sh
SLAM_BROWSER_GPU=1 nix develop --no-update-lock-file .#ci --command npm run test:browser:gpu
```

This explicit suite includes native sensor resolutions, full scenes and graphics
performance checks, with a 30-minute overall budget. It requires the GPU opt-in;
verify the browser uses hardware acceleration on the test machine. Both suites
exercise real browser code and shaders.

CI caches content-addressed Nix outputs and npm downloads keyed by the lockfile.
It still runs `npm ci`, checks, and the production build for every revision;
`dist` and `node_modules` are not reused as verification results.

The experimental full-SLAM compiler checks remain a strict, separately reported
admission suite:

```sh
npm run test:compiler-admission
```

These currently fail with pinned Rumoca 0.10.0 and do not gate the inertial demo.
Required browser editor checks cover physics, sensors, native-resolution Harris,
inertial propagation and evaluation, including syntax errors and recovery.
Passing language-server checks does not qualify numerical CV execution or full
browser SLAM.

## Reviewing a local Rumoca build

Copy a complete wasm-pack package rather than mixing compiler versions:

```sh
npm run assets -- --rumoca-dir "$HOME/scratch/slam_web/build/rumoca-review/pkg"
npm run build
```

`RUMOCA_WASM_PACKAGE` also selects the package for asset copying. Without an
override, assets come from the installed npm package. Use `--destination` to
stage an isolated review directory. The generated compiler manifest records
file hashes without machine-local paths.

Browser workers use the copied package. Node tests importing
`@cognipilot/rumoca` still use the installed npm package. A candidate compiler
needs dedicated browser compiler, LSP, and algorithm validation before the
production pin changes.

Generated research artifacts remain ignored under `dev/artifacts/`. Small
historical fixtures needed by ordinary tests are committed; optional probes may
require local receipts. Old numerical evidence is not a new runtime measurement.

## Further reading

- [Modelica migration and remaining integration work](../dev/modelica-runtime-migration.md)
- [RGB-D/inertial SLAM composition](rgbd-inertial-slam-composition.md)
- [Camera formats and calibration](camera.md)
- [Geometry validation](geometry-validation.md)
- [Recorded performance and measurement limits](performance.md)
- [Robot deployment requirements](deployment.md)
- [Rumoca compiler-agent handoff](../dev/rumoca-agent-handoff.md)

All commits use `git commit -s` and the repository's configured DCO identity;
see [AGENTS.md](../AGENTS.md).
