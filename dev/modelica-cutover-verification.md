# Modelica runtime cutover verification

The executable Python application and Rust SLAM fallback have been removed.
There are no Python/Pyodide/Pyright dependencies, Python source/stub files,
Python browser worker/editor assets, Rust algorithm crate or Docker launch
requirements in the application. Production presets and editable nodes use
Modelica. Browser UI, files, workers, transport, compiler plumbing and Three.js
rendering remain host code. Host numerical algorithms still listed in
[the migration ledger](modelica-runtime-migration.md) are unfinished work.

The default full-SLAM model is explicitly partial and unavailable. Selecting
the separately labeled inertial propagation example enables sensor/physics and
detector experiments; it does not enable visual SLAM, covariance, a map or
loop closure. Removed runtime code is not silently substituted or relabeled.

## Checks on 2026-10-03

- `npm run build`: TypeScript and production Vite bundle pass. The rebuilt
  preview responds at port 4173; retired runtime assets are absent from `dist`.
- Nix flake checks: native x86_64 Node 24 and Rust-to-WASM compiler toolchain
  execution pass without Python or Docker. The aarch64 target was not measured.
- Five detector/project suites: eight tests pass, preserving numerical
  Harris/FAST/Grid score and ranking fixtures with independent JS oracles.
- Stateful artifact/LSP suites: seven tests pass. The separate larger portable
  export run reached its 60-second watchdog before completion; not a pass.
- Final hardware browser smoke: three tests pass in 37.9 seconds. Physics,
  detector and estimator editors receive live Rumoca diagnostics; rejected
  saved projects preserve original storage across edits/autosave debounce;
  RGB/depth have identical 90 Hz simulation timestamps and the physics barrier
  remains held until delayed processing returns. A dedicated Three.js worker
  stays near 30 FPS during delayed processing and an induced main-thread stall.
  Graphics report NVIDIA RTX 3090 through WebGL2/ANGLE, not WebGPU.
- Earlier software-rendered smoke exposed a premature runnable-project state
  before Zenoh/viewer initialization. Transport starts immediately and an
  initialization barrier now protects compilation. Full software-rendered
  browser acceptance has not yet been repeated; the final smoke used hardware.
- `PointToPlaneRow.mo`: actual pinned-WASM correspondence mathematics pass,
  including finite differences and rejected-row recovery. Not full registration.
- Flight tour: integrated into `LabQuadrotor.mo` with held start-of-frame
  command time. Boundary setpoints/manual override pass actual pinned WASM;
  plant state and body IMU match independent manual control within 2e-8,
  substantially below the solver's 1e-6 relative tolerance. The coherent truth
  snapshot suite also passes. Runtime TypeScript tour equations are removed.

The complete Modelica estimator, custom graph execution, embedded deployment
and 10× realtime target remain pending. Historical removed-runtime throughput,
geometry and loop results do not certify this replacement. Numerical oracles
are independent verification code, not production algorithm fallbacks.

## Checks on 2026-10-04

- Zenoh dependency, WASM asset, session/broker runtime and connection controls
  are removed. Graph edges forward numerical objects and typed camera buffers
  directly; the data-flow monitor records only activity and buffer sizes.
  No graph message is encoded or decoded for local delivery. Separate worker
  message copies and Rumoca session input/output serialization still exist.
- TypeScript and production build pass (Vite 15.64 s); scans find no Zenoh,
  Pyodide, Pyright or retired algorithm-worker assets in the rebuilt `dist`.
- Actual shipped Rumoca 0.10.0 runtime-math/project tests: three files, five
  tests pass. Coverage includes 90 sensor/evaluation frames, all IMU/GPS
  axes/covariances, exact draw scheduling, source edits, accumulation,
  same-timestamp input changes, invalid input refusal and changed origins.
- Five hardware-browser tests pass in 1.6 minutes on WebGL2/ANGLE RTX 3090:
  direct frame/RGB/depth object identity at connected detector/estimator
  dispatch, no WebSocket or Zenoh requests, synchronized 90 Hz camera/physics
  barrier, independent viewer near 30 FPS under processing/main-thread holds,
  live Rumoca diagnostics in all five editable built-in numerical nodes,
  actual edited sensor bias/evaluation scaling with saved-source reload,
  unchanged replay IMU/timestamps, changed truth-reference origin and reset ATE,
  and preservation of rejected stored sources across attempted edits/autosave.
- The first no-Zenoh browser attempt exposed a stale removed-panel UI reference
  and was stopped after the startup failure. The reference was fixed before
  the final passing build/browser run. The earlier runtime-math smoke also
  exposed a test replay request during an active auto-run step; the final
  replay test pauses and waits for the real barrier before loading.
- Unused host-computed INS speed/filtered-IMU norms are removed. The host now
  returns model and state-count metadata only. The state-artifact suite passes
  all three tests, including 3,000 changing-input steps against Rumoca,
  bit-exact direct replay, resets and refusal without state mutation (4.03 s).
  The subsequent TypeScript/production rebuild passes; numerical state/source
  and interfaces remain the ones checked by the browser run.
- Current baseline profiling uses city/high detail, ordered full-resolution
  Harris, cars/people, daylight and no LiDAR, with every 90 Hz lockstep sample.
  On RTX 3090 and two allowed browser CPU cores, 120 profiled frames measure
  26.88 ms / 0.413× with asynchronous readback and 22.51 ms / 0.492× with
  synchronous readback in the sensor worker. Both viewer windows stay around
  30 FPS. Camera/readback dominates; these are sequential shared-machine
  observations with CDP/perf overhead, not a complete SLAM benchmark or proof
  of an isolated speedup. These profiles predate the worker-default change
  recorded below.
- On the rebuilt preview, the dedicated sensor-worker readback parity browser
  check passes (17.6 s): RGB, axial depth and 64-beam LiDAR match exactly
  between asynchronous and synchronous modes, including repeat captures and
  LiDAR timestamps. This preserves graphics/capture semantics; it is not SLAM.
- Full depth-noise native component: the equivalent separate-loop source
  passes 2,592,000 independent output checks across 90 frames, changed
  calibration, edge cases, defaults, JSON reload and an actual recompiled
  dropout-threshold edit across every pixel. Two complete 14,400-target
  modules occupy 675/381 bytes. Preparation is 57.7 s/3.6 GiB and mean native
  execution with target copies is 0.60 ms; GPU/draws/workers/SLAM are excluded.
  The source is staged, not integrated into the preview, and the production
  compiler pin remains unchanged. The first numerical run passed the frame
  checks but had an incorrect positive-noise assumption in its reset test;
  the corrected independent default-noise oracle passes.

Checked-in reports: [asynchronous](modelica-direct-flow-performance.json),
[synchronous](modelica-direct-flow-sync-performance.json). They retain all five
Modelica source hashes, graph hash, settings, renderer and measurement limits.

The standard production-node suite passes all 61 tests across 29 files
(80.32 s, aggregate peak RSS 2.47 GiB). Compiler capability probes remain a
separate gate. The staged one-program consumer and full-frame comparison probe
pass TypeScript checks only; their new upstream API has not yet been executed.

Following the matched readback checks, hardware-reported dedicated sensor
workers now select synchronous direct readback at initialization; software or
unknown drivers and the main-thread fallback retain asynchronous reads.
Profiling can still override the implementation choice. The sensor worker
queue/transfer/error unit suite passes both tests and the production build
passes (Vite 14.62 s). Three actual hardware-browser checks pass in 58.9 s on
this new default: 90 Hz lockstep/independent viewer near 30 FPS with verified
synchronous camera method, direct frame/buffer identity, and exact RGB/depth /
LiDAR readback parity. The earlier five-test run supplies the source-edit/LSP /
persistence evidence; it predates this driver-policy change.

These tests exercise the explicitly labeled Modelica inertial baseline and
sensor/vision plumbing, not complete SLAM. IMU/GPS and runtime evaluation math
now execute in editable Modelica sessions; depth noise, random-stream state,
feature selection and other owners in the migration ledger remain unfinished.
Compilation of the connected numerical pipeline into one WASM executable is
requested in RUM-011; the current preview still uses separate compiled owners.
The generic single-program consumer and a full-size mixed-array comparison
probe are staged with passing TypeScript checks, awaiting an actual validated
upstream package. They are not activated or counted as numerical acceptance.
