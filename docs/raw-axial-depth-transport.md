# Raw axial Float32 camera transport

The depth camera now writes the IEEE754 word of its axial optical-Z value into
four little-endian RGBA8 bytes. `floatBitsToUint` runs in the camera fragment
shader; `GpuDepthCloud` uses `uintBitsToFloat` on the same bytes. RGB keeps its
separate sRGB attachment and optics. `Calibration.depthEncoding` and capture
results identify this format as `axial-f32-le-rgba8`.

The valid range is `near <= z < far`. Background, nonfinite values and values
outside that range produce the all-zero word. The depth pass uses NoColorSpace,
NoBlending, high precision and disabled dithering. It sets the scene background
to null and clears transparent black: a black THREE.Color background would
otherwise write alpha one, which is part of the encoded word. Background,
override material, clear color/alpha and dithering are restored after the pass.
The existing batching, morph and skinning vertex chunks remain active.

The host copies whole rows to maintain the existing top-down camera convention,
then constructs a Float32Array view over those bytes. It does not decode pixels
or strip RGB alpha. Little-endian typed-array storage is required explicitly.
The sensor-worker transfer retains this encoding metadata. This changes the
former 24-bit range quantization; old depth24 bit parity is not asserted.
Readback, row copies, worker transfer, downstream noise processing and eventual
Float32-to-Float64 input copying still have costs. This is not zero-copy or a
completed direct GPU-to-Modelica production path.

`tests/browser/raw-axial-depth.spec.ts` bundles the actual World component and
uses the preview's existing assets without starting a numerical backend. The
final pinned-Nix Chromium run passed on ANGLE SwiftShader, a software renderer:

- All 16 uniform IEEE word cases matched at all 14,400 camera pixels and all
  cloud depth channels, including one-ULP differences and invalid values.
- Synchronous, asynchronous and debug camera buffers matched exactly. Static
  batching preserved RGB, depth and cloud bytes. A skin-weighted optical-Z
  translation of 0.375 m was recovered exactly.
- Empty background and near/far rejection produced zero depth and cloud values.
  A finite patch verified distinct RGB/depth fields of view. Camera row order,
  cloud row order, lockstep rejection and render-fault recovery passed.
- The independent tilted-plane ray oracle had a worst error of 0.25336 mm.
  Cloud XYZ differed by at most 0.0005875 mm, and its depth channel matched every
  camera Float32 word exactly.

The initial 0.04 mm plane tolerance failed twice; both results are retained in
the evidence. Raster geometry and byte encoding are separate checks. OpenGL ES
exposes screen-coordinate subpixel precision through SUBPIXEL_BITS (minimum
four bits); the tested renderer reported four. [OpenGL ES 3.0 specification,
table 6.28](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf).
For this plane, inverse depth is affine:
`q(u,v) = (1 - b*(u-cx)/fx - d*(v-cy)/fy)/a`. A one-grid-step displacement of
each screen vertex bounds its inverse-depth perturbation by
`dq = (abs(b)/fx + abs(d)/fy)/a * 2^-SUBPIXEL_BITS`; convex perspective
interpolation then gives the depth bound `zMax^2*dq/(1-zMax*dq)`. This is
1.43133 mm here. A separate 64-Float32-epsilon transform/clipping roundoff
allowance gives the 1.47171 mm test budget. Neither bound uses the measured
error. The uniform word test isolates transport from raster interpolation.

Durable results and hashes are in
`dev/raw-axial-depth-verification.json` and
`dev/artifacts/raw-axial-depth/manifest.json`. Hardware-backed verification,
dedicated-worker built-application regression and matched capture timing remain
separate follow-ups. No performance improvement is claimed by this component
test.
