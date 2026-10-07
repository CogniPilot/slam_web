# Modelica source guide

The source tree follows the responsibilities of a robotics library. Start with the vehicle, sensor, or estimator entrypoint, then open its mathematical dependencies.

| Directory | Contents |
| --- | --- |
| Examples | Selectable top-level experiments, starting with inertial navigation |
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

`Examples/package.mo` is a Modelica package: choose `Examples.InertialOnly`, `Examples.ResponsiveInertial`, or `Examples.SmoothedInertial` as the entry point. Compose components and wire their arrays in Modelica; the host provides sensor inputs and displays outputs. These examples currently implement inertial navigation. The full RGB-D SLAM lifecycle is staged separately.

The other directories group existing standalone classes and inline packages by responsibility. Their public names remain stable. Moving them into a qualified library namespace requires coordinated compiler workspace loading and saved-project migration.

[Source locations](../src/modelica-source-locations.mjs) provide one inventory for dynamic tooling. Saved flat-directory workspace paths migrate to the new locations without changing any source text. Historical compiler receipts and numerical evidence retain their original paths and hashes.
