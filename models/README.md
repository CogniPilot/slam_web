# Modelica source guide

The source tree follows the responsibilities of a robotics library. Start with the vehicle, sensor, or estimator entrypoint, then open its mathematical dependencies.

| Directory | Contents |
| --- | --- |
| Vehicles | Quadrotor dynamics and teaching controller |
| Sensors | D435 image constants, observations and availability |
| Vision/Features | Harris and FAST kernels and feature selection |
| Vision/Matching | Calibrated RGB-D descriptors and patch tracking |
| Math | Rigid registration and symmetric matrix solves |
| Estimation/Inertial | Inertial propagation and error-state/Schmidt filtering |
| Estimation/Localization | RGB-D relative pose and localization transactions |
| Mapping | Landmark catalogs, spatial indexing and anchor ownership |
| LoopClosure | Keyframes, visual words, retrieval and verification |
| Optimization | Pose graph, covariance and graph transactions |
| SLAM | Public reset, initialization and step entrypoints |
| Scene | Deterministic actor motion |
| Evaluation | Teaching metrics |
| upstream | Exact vendored sources, licenses and provenance |

This reorganization preserves the existing Modelica class names and exact mathematical source. These are source directories, not yet qualified Modelica packages: the browser currently compiles editable standalone documents. A package namespace migration must coordinate Rumoca workspace loading, compiler model names, editor dependency context and saved projects; an empty `package.mo` beside global classes would not be a valid Modelica library.

[Source locations](../src/modelica-source-locations.mjs) provide one inventory for dynamic tooling. Saved flat-directory workspace paths migrate to the new locations without changing any source text. Historical compiler receipts and numerical evidence retain their original paths and hashes.
