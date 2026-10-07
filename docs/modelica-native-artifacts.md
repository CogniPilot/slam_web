# Portable Modelica assignment artifacts

`NativeAssignments` executes Rumoca's `native-direct-assignments-f64-v1`
artifact. It preserves the compiler's stage order and exact target ranges,
reuses a fixed unshared WASM memory, and exposes named input/output views.
The host does not discover a solve order or rewrite Modelica mathematics.

This is a component execution interface. The complete Modelica-only full-SLAM
runtime remains integration work; Python and Rust algorithm execution are retired.
Reviewed compilers supply `prepare_native_assignments`; the application's older
pinned package does not. The earlier `94cff417cec6` profile supports stateless
native array programs and refuses mixed scalar/tensor programs. The fresh
`943aa7d7b745` package admits certified scalar and array assignments together,
including the single-module interface described below. Unsupported function
folds, stateful integration, events and external tables still require explicit
refusal.

```ts
import {NativeAssignments} from '../src/modelica-native-artifact';

// Prepare once in the compiler worker. The compiler owns all stages/layouts.
const artifact = JSON.parse(compiler.prepare_native_assignments(source, modelName));

// This component bundle can be stored locally and reloaded as ordinary JSON.
const saved = JSON.stringify({source, artifact});
const bundle = JSON.parse(saved);
const node = await NativeAssignments.instantiate(bundle.artifact, bundle.source);

// Views retain their buffer across frames. Copy sensor channels without math.
const rgb = node.input('rgb');
rgb.set(channels);
node.evaluate(sensorTimestamp);
const scores = node.output('score');
const retainedScores = scores.slice(); // only when retaining a previous frame
```

Input/output views follow the compiler's contiguous array storage order;
individual scalar aliases such as `rgb[2,3,3]` are also available. Parameter
defaults are restored by `reset()`. Parameters that are not declared inputs
cannot be written through the input API. Output views are overwritten by the
next evaluation; the lockstep worker must finish consumers before reusing them.

Import checks cover source/module hashes, schema/profile, bounded memory,
variable addresses, complete nonoverlapping stage targets and permitted pure
math imports. This validates the portable execution interface; it does not
recompile the source or authenticate the bundle's author.

The staged single-program consumer also supports schema73 typed Integer and
Boolean inputs through cached `integerInput(name)` and `booleanInput(name)`
views. These use the compiler's declared typed buffer base, preserving exact
i64 state without Number conversion. The [transport qualification](../dev/native-typed-input-consumer-2026-10-07.md)
covers reset, exact checkpoints and browser-worker IndexedDB persistence.
Compiler-issued cross-entrypoint record transfer and raw camera ingress remain
separate acceptance work; the production package pin is unchanged.

The actual reviewed WASM test covers a two-dimensional RGB array, exact ordered
grayscale/nonlinear output values across eight input frames, JSON save/reload,
edited Modelica parameter defaults, reset, live-view reuse, scalar aliases,
private execution metadata, stale source, corrupt module bytes, overlapping
targets and fixed memory bounds.

```sh
RUMOCA_BRANCH_PKG=/path/to/review/package nix develop path:.#ci -c \
  npx vitest run --config tests/compiler-probes/vitest.config.ts \
  tests/compiler-probes/modelica-native-artifact.test.ts
```

Full estimator composition, graph/project integration and native Linux loading
remain necessary before a complete Modelica pipeline can be accepted. The retired Python companion is unavailable and Docker deployment is removed; there is no fallback.

The staged [single-program consumer](../src/modelica-native-program.ts) now
passes the actual review-WASM full 160×90 mixed-program probe on compiler
revision `943aa7d7b745`. One compiler-issued executable owns both complete array
families and three scalar consumers, stores directly into shared Y, and is
called once per evaluation. Every one of its 28,803 outputs matches the older
multi-module interface bit for bit across eight changing frames; independent
grayscale/score checks, source edits, persistence, reset and refusal checks pass.
The [verification record](../dev/modelica-fusion-eigen6-verification.json)
retains source/compiler hashes and resource evidence, including the corrected
overlap-refusal fixture. These probes run actual WASM under Node; complete
browser-graph, stateful estimator and Linux/NXP acceptance remain pending.
