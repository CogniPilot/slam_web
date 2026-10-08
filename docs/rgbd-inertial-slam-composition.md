# Full Modelica SLAM composition

The full algorithm is the source-owned graph in
[RGBDFastSLAMInterface.mo](../models/SLAM/RGBDFastSLAMInterface.mo), with reset,
initialization, step and held-IMU interval entrypoints. Native D435 wrappers
are in [D435FastSLAM.mo](../models/SLAM/D435FastSLAM.mo). The non-executable
RGBDInertialSLAM placeholder has been deleted; it is no longer a selectable
estimator preset.

The 59-file native source manifest includes FAST selection, RGB-D descriptors
and matching, calibrated robust registration, inertial prediction and visual
correction, keyframes, appearance retrieval, verified loop proposals, graph
optimization and an anchored/pruned landmark map. All numerical mathematics
is Modelica. Component-only probe models live under test fixtures and are not
bundled by the application source loader.

The complete native-camera reference flight replay passes 24 checks and preserves
its published outputs after the latest FAST and descriptor-matching optimizations. This is an
independent native reference run, not a browser runtime measurement. Controlled
loop tests do not prove a loop closure on a long rendered flight.

The [descriptor-matching reference](../dev/modelica-descriptor-matching-bound-2026-10-07.md)
also retains every compared output bit and complete loss/recovery replay output.
Its measured native CPU improvement does not establish browser throughput.

Full Rumoca WASM issuance, typed raw sensor ingress and exact carried State
remain pending. The static preview runs Modelica inertial propagation with
Three.js GPU sensors. The SLAM source menu supports editing, LSP diagnostics,
project persistence and a cancellable browser WASM build check. It does not
activate an unqualified SLAM artifact. Full browser SLAM and 10× realtime have
not been achieved.

[The native frame boundary](../src/modelica-slam-frame.ts) prepares positive-duration
camera observations for the interval entrypoint without scanning or converting
pixels. It preserves RGB8/Z16 views, row strides, depth units and every held IMU
interval, and excludes renderer and truth metadata. Its GPU capture and recording
tests qualify transport only. Initial camera acquisition, compiler ABI binding,
complete State lifecycle and live backend activation still require integration.
