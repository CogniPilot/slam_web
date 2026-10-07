# SLAM Lab

Phones start in the city with Low graphics; desktop starts in the city with Balanced graphics. Scroll below the viewer for the editor and Configuration. Saved projects keep their settings. Real-device mobile performance is not yet qualified.

[**Open the browser demo →**](https://cognipilot.github.io/slam_web/)

[![Scan to open SLAM Lab](docs/demo-qr.svg)](https://cognipilot.github.io/slam_web/)

Open the link or scan the QR code, wait for **Run** to become available, then
click **Run**. No installation or initial **Apply & reset** is required.
The current demo runs Modelica quadrotor physics and inertial propagation with
Three.js RGB-D rendering. Full visual SLAM in WASM is still under development.
Graphics quality and sensor rates are available in **Configuration**.

A browser UAV robotics lab with editable Modelica physics and algorithm sources, RGB-D cameras, a separate airframe IMU, a typed node graph and saved projects. Three.js renders the world and sensors; Rumoca compiles Modelica to WASM; local typed data flows directly between graph nodes.

The application is moving to **Modelica-only physics, sensor and algorithm mathematics**. Three.js supplies 3D rendering; browser UI, I/O, workers and compiler plumbing remain host glue. Python execution, Rust algorithm nodes, legacy editor presets, old deployment dependencies and Docker execution have been removed. The complete RGB-D/IMU SLAM pipeline is still being integrated and verified. Nominal inertial propagation is an INS example: it does not provide visual registration, Kalman covariance, mapping, relocalization or loop closure. Removing the old runtime does not establish that its replacement is complete.

Saved projects containing Python or retired Rust algorithm execution require an explicit migration error. Their source must remain recoverable for manual porting; loading must never execute a fallback, silently substitute an inertial example or relabel old source as Modelica.

The complete Modelica SLAM workspace includes visual registration, inertial
correction, mapping, retrieval and graph optimization. The native D435
reference flight replay passes 24 checks with visual corrections and mapping;
its controlled loss/recovery replay also passes. These independent reference
runs do not establish browser WASM execution, long-flight accuracy or realtime
throughput. Full Rumoca WASM issuance and carried-state integration remain
pending. See [the current composition](docs/rgbd-inertial-slam-composition.md).

New projects prepare **Medium · balanced** graphics and **Modelica inertial propagation** automatically; click **Run** to start camera/physics and
sensor experiments. The legacy vision adapter is removed; native feature
detection and full visual SLAM are explicitly pending. Harris and FAST source
remain editable and persistent. Every editable node uses Modelica and Rumoca LSP.
The raw depth-point display starts off. Selecting a preset compiles and starts
the experiment automatically; click **Run** to start. Edited source uses **Apply & reset**. Saved estimator source and imported projects retain their settings.
Rejected saved projects disable automatic saving and retain a **Download saved
project** action for recovering the original source.

The SLAM editor's **Modelica source** menu opens the native D435 algorithm
workspace with59 files. Older56-file project workspaces remain exact. It supports live Rumoca diagnostics/completion and saves every
dependency with the project. **Active estimator** returns to the runnable
experiment. **Check WASM build** requests compilation of the complete saved
workspace in a browser worker, with cancellation and explicit compiler errors;
full-workspace execution remains pending. See
[source workspace instructions](docs/modelica-slam-source-workspace.md).

## Development

Students use the deployed static site. Maintainers use the pinned Nix environment:

```sh
nix develop --no-update-lock-file path:.#ci
npm ci
npm run assets
npm run dev
```

The shell places temporary files and default Cargo/npm caches under
`$HOME/scratch/slam_web`. Explicit Cargo and npm cache overrides are preserved.

Build the static application with `npm run build`. WASM runtimes, editor assets and scene assets load from same-origin files. GitHub Actions checks the pinned Nix toolchain, runs unit and browser tests, and deploys the verified build to GitHub Pages after CI succeeds on `main`. Pull requests run CI without deploying.

Generated research artifacts remain local under ignored `dev/artifacts/` paths;
the small historical fixtures required by ordinary tests are committed. Optional
compiler probes and historical evidence links may require locally generated
receipts. Profiling traces, compiler caches and large disposable outputs belong
under `$HOME/scratch/slam_web`.

To review a locally built Rumoca branch, copy its complete wasm-pack package:

```sh
npm run assets -- --rumoca-dir "$HOME/scratch/slam_web/build/rumoca-review/pkg"
npm run build
```

`RUMOCA_WASM_PACKAGE` also selects the package for the asset-copy step. Without
an override, assets come from the installed npm package. The generated
`vendor/rumoca/compiler-manifest.json` records both file hashes without storing
machine-local paths. Use `--destination` to stage an isolated review directory.
Browser workers load both copied files; Node tests that import
`@cognipilot/rumoca` still use the installed npm package. A branch package needs
the dedicated browser compiler, LSP and algorithm checks before changing the
production compiler pin.

## Modelica sources and integration status

Physics, the motor response and velocity controller already run through Rumoca WASM. Modelica Harris and FAST components remain available as editable vision math. The application-owned vision compiler, raster adapters and worker are removed; old generated detector caches are discarded while saved source is preserved. The current camera/INS baseline emits no feature observations. Native Rumoca detector issuance and complete-pipeline integration remain pending.

The full 160×90 `models/HarrisNativeFrame.mo` declares grayscale, gradients, gradient products and ordered Harris response as ten array families. Compilation and compiler performance evidence do not establish whole-frame native admission or a complete SLAM frontend. Matrix, observation, prediction, correction and reanchoring components have separate actual-WASM numerical oracles. Their integration status and remaining acceptance gates are recorded in [the migration ledger](dev/modelica-runtime-migration.md).

A complete estimator must compose calibrated RGB-D observations, matching and rank-aware registration with all 15 error states, the full 15×15 covariance, innovation gating, Joseph updates and attitude reset. It must also own bounded landmarks/keyframes, tracking loss, relocalization, geometric loop verification, pose-graph optimization and map-frame correction in editable Modelica. Supported numerical components and nominal INS alone do not satisfy this contract.

The [visual catalog/graph capture](docs/catalog-graph-capture.md) connects appearance retrieval, geometric loop verification, consecutive visual measurements and measured graph admission in Modelica. Ten full-capacity reference checks pass; the separate graph owner passes twenty. The full128/256 nonlinear optimizer now passes20 reference controls, including noncommuting perturbed attitudes, loop factors and reversed edges. Actual browser compilation remains blocked by Rumoca constant/record-dimension handling; whole-session graph correction remains incomplete.

The [capture/mapping composition](docs/catalog-mapping-capture.md) also stages anchored-map updates with that visual proposal. Eighteen full-domain mapping checks and two separate projection checks pass. It preserves sensor epochs separately from the consecutive map counter and holds catalog, graph and map together on failure. The joined source still cannot issue a browser artifact.

The [every-frame dispatcher](docs/catalog-frame-processing.md) now adds Modelica keyframe selection and mapping between captures. Thirty policy checks, eighteen noncapture checks and six actual dispatch-function checks pass at full capacities. Expensive visual capture runs only on the selected branch; other images can update/prune anchored landmarks while retaining the catalog and raw graph. The exact public source still encounters Rumoca nested record dimensions during browser compilation, so these reference results do not establish running browser SLAM.

The [localization/catalog publication](docs/localization-catalog-publication.md)
now connects estimator state, reference-image ownership, camera-attempt receipts
and optional catalog/map publication. Nineteen full-capacity reference checks pass
using controlled estimator proposals. The separate time-zero initializer and
combined public models are written, but their complete numerical/browser execution
is unqualified. Compiler fixes alone will not complete SLAM: browser session
integration and coordinated graph/filter/map execution still need acceptance.
The complete raw RGB-D initialization math now runs in the reusable Modelica
`InitializeRGBDLocalization` function. Its full90x160/350-domain reference gate
passes28 scenarios and20 checks. The public model wrapper still exceeds the
reference compiler's preparation limit; this does not establish browser SLAM.
See [initializer evidence](dev/artifacts/modelica-initializer-function/README.md).
The connected `InitializeFastRGBDLocalization` function also passes22 reference
scenarios with24 checks over the complete image, selection and descriptor
domains. It owns FAST detection, feature selection and initialization entirely
in Modelica. This qualifies initialization math, not repeated-frame tracking or
browser execution; see [FAST initializer evidence](dev/artifacts/modelica-fast-initializer-function/README.md).
The public localization Step models now call ordered Modelica functions. The
full raw core advance passes16 scenarios/all57 outputs with an independent math
oracle. FAST advance passes14 scenarios, including actual FAST initialization,
measured image translation and a nonzero accepted correction; its filter-output
comparison depends on the separately qualified core. All public adapter bindings
are reviewed. These are reference function checks, not a continuous browser SLAM
trajectory; see [ordered localization evidence](dev/artifacts/modelica-ordered-localization/README.md).
The complete ordered raw-camera lifecycle also passes reference initialization,
one-frame tracking/map publication, and a two-keyframe graph correction. Its
public models now forward directly to the tested Modelica functions. A separate
seven-call sequence covers reference changes, a blank frame, recovery and stale
images in the lower localization core. Browser full-State transport/execution
remain pending; see [raw composition evidence](dev/artifacts/modelica-full-raw-composition/README.md).
A controlled six-second raw-image revisit also passes30 complete-State
advances, bag-of-words retrieval/geometric loop verification and graph
correction; see [loop composition evidence](dev/artifacts/modelica-full-raw-loop/full-raw-loop-FqegCy/README.md).
The source-owned held-IMU camera transaction also passes26 reference scenarios,
including complete-State sequential equivalence, late-failure rollback and
retention of a rejected graph factor's attempt receipt. It is available as an
explicit57-file compiler-review export and in new59-file native D435 browser
workspaces. Older saved workspaces retain their original56-file inventory. See [batching evidence](dev/artifacts/modelica-full-raw-intervals/README.md).
The separate full21-state/map14400 atomic correction passes30 controlled-proposal
checks. The new [persistent processing composition](docs/modelica-slam-processing.md)
passes31 checks through the actual optimizer, anchor/selected bound and atomic
commit; ordinary publication/bootstrap pass12+3 checks including corrected poses
surviving capture129 and anchor eviction. These are reference executions, with
the raw-camera public models still unqualified. The updated selected covariance
solver passes all19 strict reference checks, including a separate run at its
actual default48-iteration limit; these fixtures reach1e-10 residual in42–46
iterations. Measured-image vocabulary bootstrap
passes43 checks. The public Modelica State now owns its dictionary;15 additional
publication controls verify learning, restore, first histogram and rollback.
Callers no longer provide a dictionary. Complete browser session wiring remains
pending.
The runnable default remains inertial
propagation.

Source edits must change compiled results, invalidate stale artifacts and survive save/reload. Compiler capability probes remain separate from production acceptance until the corresponding compiler package is validated and pinned. Unsupported source or execution profiles must report an explicit error.

## Browser and sensor contracts

Sensors run at independently selected rates on an exact **180 Hz integer clock grid**: synchronized RGB/depth pairs at15/30/60 Hz, LiDAR at5/10/20 Hz, airframe IMU at30/60/90/180 Hz and GPS at1/5/10 Hz. Physics advances to each due timestamp and waits for its sensor capture and processing before continuing. Camera frames await connected algorithm execution and local typed output delivery. Expensive work slows simulated progress; no due sensor samples or frames are dropped. **As fast as possible** removes wall-time pacing while preserving this barrier. The requested10× realtime full-pipeline throughput remains unmet.

The **Configuration** tab groups scene/display controls, Flight settings and independent Sensor rates. Quality defaults are Low: 15/10/90/5 Hz, Medium: 30/10/90/5 Hz and High: 60/20/90/10 Hz, in camera/LiDAR/IMU/GPS order. Custom rates are saved with the project and override these defaults until **Use quality defaults** is selected. The **Editor** tab retains source editing and compilation controls.

The viewer targets **30 FPS independently**. Supported OffscreenCanvas workers separate viewer and sensor work; sensing always uses the committed pose and timestamp. Display interpolation affects presentation only. Actual renderer, completed capture rate and simulation/wall-time measurements determine performance. [Recorded measurements](docs/performance.md) retain their original graphs, workloads and limitations.

The simulated camera renders **848×480 RGB/depth**, a native common D435 resolution, with separate pinhole intrinsics, optical-axis depth and seeded noise/dropouts. Live images are GPU-packed **RGB8 and Z16**, with explicit strides, depth scale and simulation timestamps; their previews also run on the GPU. Historical RGBA/float-depth datasets remain readable. Native Rumoca raw-image ingestion remains pending; see [the output contract](dev/realsense-output-formats.md). Resolution stays fixed across graphics quality levels. Balanced defaults to30 Hz; paired acquisition is limited to60 Hz by the color stream. The D435-inspired depth optics are87°×58°, RGB optics are69°×42°, with a50 mm stereo baseline. The D435 itself has no IMU: inertial data comes from the airframe. Distortion, rolling shutter, exposure and stereo matching are outside this ideal pinhole simulation. Ground truth feeds sensor generation and evaluation only. See [camera modes and reference-evidence limits](docs/camera.md).

World coordinates are ENU, body coordinates FLU, and Hamilton quaternions use wxyz order. Camera optical coordinates are right/down/forward. RGB-D lifting must preserve calibrated continuous rays, inverse-depth interpolation, invalid samples and depth discontinuities. Single-plane registration must preserve its unobservable motion modes. These contracts and the historical independent fixtures remain acceptance requirements in [geometry validation](docs/geometry-validation.md).

City detail, lighting, deterministic cars/people, optional LiDAR, graph arrangement, recording and project persistence are host features. They do not substitute for algorithm source. Recordings preserve sensor timestamps and keep any evaluation reference separate from estimator inputs. The optional 64-beam LiDAR uses GPU cube-view sampling and remains disabled by default. It transfers the unmodified dense RGBA32F buffer (FLU XYZ plus a packed radial code); no host range decoding or point compaction runs. Invalid returns are zeroed on the GPU. LiDAR estimation integration remains pending. Camera disparity noise, dropout and depth-unit quantization now run in a GPU shader before readback, with an independent seed/pixel/simulation-time random stream; see [the measurement contract](dev/gpu-depth-noise-2026-10-07.md).

Choose **Big city · furnished interiors** for a generic 18-building scene with
an enterable market, loft/mezzanine and conference room. **Graphics quality**
offers Low, Medium and High: Low reduces overview resolution, disables shadows
and normal maps, and removes decorative geometry while preserving those rooms.
Cloud shading uses one, two or three noise layers at Low, Medium or High;
daylight skips invisible moon and star calculations. The selected budget is
shown below the toolbar and saved with the project.
The scene-detail changes also affect sensor imagery; calibrated RGB-D dimensions
remain fixed. Quality supplies default sensor rates; saved custom rates take precedence. Cars and people can be toggled separately.
An **Inspect Big city** selector moves the viewer into each furnished room without
moving the simulated drone. Three editable Modelica roof gates suppress simulated
GPS indoors; visual SLAM navigation remains pending. See [the scene documentation](docs/big-city.md).

The Main Street scene uses an 11.4 m road, 3 m sidewalks and storefronts 7.4 m wide and 10 m deep. Shops have 3.65 m ground floors, 3.35 m upper floors and 2.05 m tall windows. Modelica cars stay in their lanes and recycle at x = ±33 m before the training enclosure at x = 36 m; pedestrians cross at x = −29.8 and 32 m. LiDAR scans are idealized instantaneous snapshots without rolling beam timestamps. The simulated 5 Hz option is an additional experiment setting; [Ouster OS1 specifications](https://ouster.com/products/hardware/os1) describe the hardware rather than this simulator.

Keyboard controls default to the independent viewer camera: WASD moves, Q/E changes yaw, R/F changes altitude and Shift increases speed, including while simulation is paused. Select **Drone commands** explicitly to control the drone; commands require a running simulation with Flight tour off.

The Modelica editor runs Rumoca's language server in a browser worker. Source inspection, completion and diagnostics are separate from successful compilation and executable-profile admission. [Actor credits](public/models/licenses/ACTORS.md), [drone credits](public/models/licenses/DRONE.md) and [material credits](public/textures/pbr/ATTRIBUTION.txt) retain bundled licenses.

## Deployment and ROS 2

The retired Python companion, camera launcher, ROS bridge and Docker launch paths are unavailable. Their old installation, launch and package instructions must not be used. Portable Modelica component artifacts provide a starting point; complete Modelica Linux/NXP deployment and replacement camera/ROS 2 transport still require integration and target verification.

The replacement must execute source-matched compiler-issued artifacts with bounded memory, explicit unsupported-profile errors and the same algorithm semantics as the browser. Physical camera mounting, factory depth/color geometry, source clocks and airframe IMU synchronization need measured calibration. RT1064/Zephyr flight-controller firmware is a separate deployment target from Linux companion hardware.

See [deployment requirements and historical evidence](docs/deployment.md), [physical capture contracts](docs/camera.md) and [ROS 2 contracts](docs/ros2.md). Previously verified emulation and DDS message transport do not prove a complete Modelica estimator, hardware capture or NXP/RDD2 interoperability.

## Verification

Current source checks run through the JavaScript/Modelica suites and actual browser WASM gates. Complete acceptance requires unchanged full-size numerical oracles, covariance/degeneracy/recovery checks, source edits and persistence, room-loop and moving-city sequences, the multi-rate processing barrier and separately measured whole-step throughput. The Python-free cutover must receive fresh build and browser checks; retired-runtime test results remain historical evidence only.

The [architecture](docs/architecture.md), [portable native artifacts](docs/modelica-native-artifacts.md) and [migration ledger](dev/modelica-runtime-migration.md) distinguish supported components from remaining full-SLAM work. Compiler fixes are developed upstream on the existing Rumoca performance branch, with strict source ownership and numerical validators.

## References

Editing is informed by the [Rumoca fixed-wing workbench](https://github.com/CogniPilot/rumoca_fixed_wing); dynamics and estimator work draw on [Rumoca interactive simulation](https://cognipilot.github.io/rumoca/user-guide/simulation/interactive.html) and [CogniPilot StrapdownINS](https://github.com/CogniPilot/modelica_models/tree/main/Estimation/StrapdownINS). Imported assets retain their bundled credits and licenses.

Apache-2.0. Upstream dependencies retain their own licenses.

The supported inertial demo gates deployment with `npm test`, the production build and browser tests. `npm run test:compiler-admission` retains three strict experimental CV/ESKF numerical tests that currently fail with the pinned Rumoca 0.10.0 compiler. CI reports this suite separately; its result is not evidence that full browser SLAM works.
