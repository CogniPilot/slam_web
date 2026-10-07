The smallest existing Tier 1 MSL canary is the fixed roster `../rumoca-native-functions/infra/verification/msl-canary-20.json`, SHA256 `536004933ce502f7a8a4317e5dd6de2b700a6b176e84d2d6e7bbe0dcdf61eafa`. SPEC0033 §6a requires one attempt per phase, 10 seconds per non-Sim phase, 12-second solver budget/14-second parent watchdog, and fixed Cargo/test/Rayon concurrency 4. Timeouts and refusals remain failures. This is a regression tripwire, never a full-cohort parity claim.

Read-only audit on 2026-10-05. No builds, canary execution, cache changes or compiler edits were performed.

Canonical current-source command, for the compiler/cache owner after its source freeze, from the sibling compiler root:

```sh
CARGO_TARGET_DIR="$HOME/scratch/slam_web/build/rumoca-native-target" \
TMPDIR="$HOME/scratch/slam_web/tmp" \
CARGO_BUILD_JOBS=4 RUST_TEST_THREADS=4 RAYON_NUM_THREADS=4 \
cargo xtask verify msl-parity \
  --sim-targets-file infra/verification/msl-canary-20.json \
  --results-dir "$HOME/scratch/slam_web/tmp/msl-canary-current/results" \
  --stage-parallelism 4 --sim-parallelism 4 \
  --model-attempt-timeout-secs 10 --ir-solve-timeout-secs 10 --sim-timeout-secs 12
```

Do not use timeout retries, reduced target limits, extra exclusions, or the unmeasured-parity success flag for this gate.

`crates/xtask/src/verify_cmd.rs:1337` owns the locked `target/msl/parity-config.json` channel through the complete run. Without prebuilt options it builds optimized artifacts through `verify_cmd/msl_local_run.rs:42`, then invokes exactly `balance_pipeline::balance_pipeline_core::test_msl_all`. The necessary source build is:

```sh
cargo build --locked --profile msl-fast -p rumoca-worker -p rumoca-test-msl \
  --features rumoca-test-msl/msl-full-test --bin rumoca-worker \
  --bin rumoca-sim-worker --bin rumoca-msl-tools --test msl_tests \
  --message-format json-render-diagnostics
cargo build --locked -p xtask --message-format json-render-diagnostics
```

For an already qualified frozen build, avoid recompilation by invoking its `xtask verify msl-parity` with the same roster/budgets and `--prebuilt-test-binary "$CANARY_BIN/msl_tests" --prebuilt-model-worker "$CANARY_BIN/rumoca-worker" --prebuilt-sim-worker "$CANARY_BIN/rumoca-sim-worker"`. The tools binary must sit beside the copied test binary: `verify_cmd.rs:1398` resolves sibling `rumoca-msl-tools`. `$CANARY_BIN` should contain all five source-bound executables, selected from Cargo JSON and hashed; a native-preparation producer or arbitrarily newest binary is not an MSL runner. The current child PATH contains neither Cargo nor OMC; the root's qualified tool environment is required.

Current prerequisites:

- MSL 4.1.0 is present. `target/msl` is an existing symlink into `$HOME/scratch/slam_web/tmp/msl-canary-prerequisites-compact/cache`; its MSL entry points to the existing library checkout. Required `Complex.mo` and `Modelica 4.1.0/package.mo` are readable. Archive SHA is pinned in `examples/modelica_dependencies.toml`. Existing evidence records 2556 Modelica source files; this audit did not rehash the complete corpus.
- The historical OMC binary remains readable and was rehashed: `/nix/store/6iggbkckmny55dwflvz73pmjq45j8whw-openmodelica-unstable-2026-07-21/bin/omc`, SHA `840e73b72019550d8ad43cfc50dcac3bb882c395a306cd8be5a3ab25659afca6`. It must be provisioned on PATH, with its supporting runtime environment, before the gate.
- **Missing:** `target/msl/OpenModelica-ModelicaServices-4.1.0+maint.om/ModelicaServices/package.mo`. Current `verify_cmd.rs:1352` automatically ensures this pinned library before running; the owner may provision it through `cargo xtask repo modelica-deps ensure`. Its pinned archive hash is `e1c9f6da69f089328917e6ec2b147f4dbf4730eec8683addfe727be40f6ba5e6`. SPEC0050 requires these tool-specific services loaded before MSL and refuses another source.
- The historical OMC reference cache exists under `cache/omc_parity_cache/simulation/1f795613952c4de2*`, with nine successful traces. Current `rumoca-test-msl/src/msl_tools/omc_simulation_reference.rs:642` changes the cache-key domain to `omc-pinned-tool-services/required-result-file/v2`; its comment explicitly excludes old generic/host-dependent services and incomplete-success references. Therefore those old references must not be assumed reusable by the current producer. Preserve them as historical evidence; qualify current references with the current owner.

The pre-fix baseline exists: source closure `ebbaa651a9e2bc1d51872106094c400f6bdce5f50ce1666870af1cd67287607f`, five binaries in `$HOME/scratch/slam_web/tmp/msl-canary-prerequisites-compact/binaries`, original results and nine raw Rumoca traces in `dev/artifacts/msl-canary-compact`. All five baseline binary hashes were independently rechecked and match `dev/rumoca-matched-msl-canary-verification.json`. Its original missing-OMC gate failure remains retained; comparator-only measurement later used the original trace bytes without rerunning model phases.

The later frozen source `066171474e5d97c199c7c7cffb90426fe252d359b67167a2acd000dec120b2cf` also has five binaries and durable results in `dev/artifacts/msl-canary-private-arena`, described by `dev/rumoca-private-arena-msl-canary-verification.json`: 20 selected, 11 compiled/balanced, 9 ToDAE failures, 9 successful simulations, 2 solver failures, 0 timeouts; historical comparator 9 strict-high and 11 absent, zero band/outcome regressions. This is an older whole-change baseline, not the immediately preceding source for the latest fixes. Recompare retained raw before traces under one current comparator/reference contract before forming a new delta; disclose the full source-change scope and changed reference policy. Do not overwrite/promote these partial baselines.

| Change | What fixed20 can establish | Required separate evidence |
| --- | --- | --- |
| Solve memory/cache allocation | Native compile/lower/simulation outcome and timeout regression tripwire. Existing artifacts include outer peak RSS, but phases are small and resource-capped. | Exact large full-source preparation/allocation controls; matched per-phase resources for a memory claim. |
| Array/scalar division | General front-end/lowering/trace regression if the selected source reaches that operation. | Original source-issued 347/3 and 394/3 strict-bit quotients plus tiny/IEEE/source-edit controls; canary traces do not prove that arithmetic frontier. |
| Borrowed constant subscripts | General Flatten/DAE outcome and native trace tripwire. | Owned/copied differential constant/subscript controls, shapes, errors and source mutation; no guaranteed focused coverage in the 20 roster. |
| Generic BroadcastBinary WASM emission | Canonical phase changes may affect canary lowering; native MSL does not qualify the WASM emitter. | Source-issued native modules and strict tensor/quotient controls. |
| WASM stage outlining | Not exercised: native MSL simulation selects native Cranelift; `rumoca-sim/Cargo.toml:62` uses exec-wasm only for wasm32. The archived private-arena verification explicitly excludes exec-wasm changes. | Actual production WASM stage/module/fault/order/transaction and browser controls, including the full source target. |

The fixed20 run supplies a meaningful native regression delta once current prerequisites and references are qualified. It cannot isolate the latest five fixes from earlier compiler changes or substitute for their focused WASM/source evidence.
