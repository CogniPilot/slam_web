# Compiler capability checks

These checks exercise the Modelica algorithms with a reviewed Rumoca package.
They are separate from the ordinary application tests; a passing component check
does not establish full SLAM execution or throughput.

Run a specific check in the reproducible environment:

```sh
RUMOCA_BRANCH_PKG=/path/to/review/package \
  nix develop --no-update-lock-file .#ci --command \
  node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 8192 -- \
  npx vitest run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-rgbd-observation.test.ts
```

Use the external watchdog for expensive preparations. The test names identify
coverage: calibrated observations, feature detection, matching, registration,
covariance, map updates, pose graph and compiler-issued WASM programs. Tests keep
independent numerical expectations and reject missing compiler capabilities.

The production compiler pin stays unchanged until its required checks pass.
Local compiler coordination and profiling receipts belong in ignored `dev/`.
