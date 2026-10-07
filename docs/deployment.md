# Modelica deployment requirements and historical evidence

The Python companion runtime, Rust algorithm nodes, camera/ROS launchers and Docker execution paths are retired. Their package, installation, offline-bundle and launch instructions are removed. There is no supported Python fallback for a deployed or saved project.

Complete deployment of the editable Modelica RGB-D/IMU SLAM pipeline to Linux/NXP remains pending. Portable, source-matched component WASM is available as a building block; component execution does not establish the full estimator. Follow the [migration ledger](../dev/modelica-runtime-migration.md) for actual numerical and integration status.

## Replacement acceptance

- Browser and target must execute the same source-matched compiler-issued Modelica mathematics, with explicit profiles, compiler provenance and artifact hashes.
- Loading must validate imports, bounded memory, layouts and stage ownership; unsupported models must fail explicitly before activation. Nominal inertial propagation must not stand in for complete SLAM.
- Sensor transport must retain calibration and source timestamps, enforce frame/IMU validity and reject incomplete or reordered data. Deployment requires an explicit activation acknowledgement and persistent source/artifact identity.
- Target results must pass the same full-size independent numerical oracles, changed-source and save/reload checks, rejection recovery and complete graph tests as the browser.
- Physical D435 capture, measured mounting and clock mappings, USB throughput and NXP/RDD2 interoperability need hardware evidence. Linux companion deployment and RT1064/Zephyr firmware remain distinct targets.
- Report full-step latency, sensor rate, memory and CPU on the actual target. Browser kernel timings, software rendering and emulation do not prove hardware throughput or the requested 10× rate.

The browser graph uses local direct typed data flow and requires no Zenoh service or remote transport endpoint. A future hardware or ROS bridge must define its authenticated connection and preserve source-time and lockstep semantics under remote backpressure. Deployment secrets must remain outside saved projects.

## Retired implementation evidence

Before removal, the Linux aarch64/x86_64 package assembled a pinned Python/NumPy/Zenoh/Wasmtime runtime; its camera variant included the RealSense binding. Offline bundles contained the closure, path/hash inventory, runtime manifest, lockfile and checksums. These are historical packaging results, not currently available deployment directions.

Cortex-A53 QEMU emulation verified ARM NumPy SVD, Zenoh delivery, binary RGB-D calibration round trips, unchanged Rust WASM, stationary estimates, arbitrary mounting and IMU-overflow recovery. A real browser deployed Harris/Rust and an edited persistent Modelica inertial component to that emulated companion; each matched browser/native output over eight frames. All ten native ESKF tests passed, and the offline bundle imported into an empty local Nix store with all 40 requisite paths.

The recorded package versions were Python 3.14.7, NumPy 2.5.2, Zenoh 1.10.0, Wasmtime Python 48.0.0 and RealSense SDK 2.57.7. No connected NXP board or physical camera was used. These results establish compatibility of the retired implementation under emulation; they do not validate the replacement Modelica SLAM runtime or physical capture.
