The staged adapter is `src/modelica-localization-session.ts`, with optional browser transport in `src/modelica-localization-client.ts` and `src/modelica-localization.worker.ts`. It does not select an application node or replace a refused source with another estimator.

`ModelicaLocalizationSession.create(artifact, source, {time, inputs?})` verifies the native v3 module/source binding and complete input/output shapes. Initial state and gravity/noise configuration come from the compiler-issued Modelica input defaults. Optional `inputs` are explicit estimated initialization overrides. `snapshot()`, `restore(snapshot)` and `reset()` retain the source identity and immutable configuration. The initialization pose is an estimated origin; no truth field is accepted.

`advance(frame)` takes raw `Uint8Array` RGBA and `Float32Array` axial depth, image sequence/time/dt, held IMU measurements, explicit RGB/depth `(fx,fy,cx,cy)` calibration, optical-to-body rotation, body camera origin, disparity noise, noise-reference focal length and stereo baseline. The core additionally requires flattened pixels and active count, and optionally source scores. The FAST wrapper owns pixel selection and rejects externally supplied features. Calibration tuples are already in the measured image's pixel coordinates; the adapter does not derive alignment, extrinsics or intrinsic scaling.

Each actual measured interval is passed unchanged to Modelica. The current source accepts `0<h<=0.02`; a longer held interval is refused. The adapter does not subdivide it numerically. Only the last interval enables the image/capture request. All source `next*` fields, including reference pixels, descriptors, point/mask/count, calibration/noise/extrinsics and correlated reference state, commit together after the entire frame succeeds. A rejected image may still have a valid inertial prediction, as decided by the source. Execution faults or invalid output transport restore the complete WASM memory and retained state.

Estimate position, normalized quaternion `[w,x,y,z]`, covariance blocks, confidence, features, tracking endpoints and candidate map points come directly from Modelica outputs. Masks are used only to format rows for the viewer. Confidence is the source's categorical accepted-correction indicator. These candidates are not a persistent map or loop closure.

The worker initializes same-origin Rumoca lazily and calls `prepare_native_program(source, model)` followed by `NativeProgram.instantiate`. A saved source-matching artifact can skip preparation. The pinned0.10 compiler lacks this API and receives an explicit unavailable error. The client bounds requests to one active and one waiting request. Accepted raw image buffers transfer ownership by default, including when queued; use `step(frame, false)` deliberately to copy instead. The session can run inside an existing sensor worker to avoid that transport hop. No TypeScript emitter, image arithmetic, solver or feature algorithm is added.

Current native v3 input storage is Binary64: raw U8/F32 inputs copy directly into the declared Real inputs. This adapter does not claim packed ingress or Float32 CV computation. That compiler profile remains separate.

TypeScript checking passes. Four full-raster adapter controls exist in `tests/compiler-probes/modelica-localization-session.test.ts`; their actual native execution is **UNRUN** because no complete localization artifact has been issued. The explicit gate currently skips all four tests. Run it only after a qualified producer creates `source.mo` and `native.json` in an artifact directory:

```sh
RUMOCA_LOCALIZATION_ARTIFACT_DIRECTORY="$HOME/scratch/slam_web/tmp/localization-adapter-artifact" \
node node_modules/vitest/vitest.mjs run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-localization-session.test.ts
```

The controls require the full90×160×4 raster and350×49 descriptor interface, real source initialization/stationary prediction, readonly inputs, final-interval image gating, complete late-fault rollback, recovery, source-bound persistence and malformed transport refusal. They do not replace the independent Modelica capture/correction numerical controls or full FAST source acceptance maintained by the source owner.
