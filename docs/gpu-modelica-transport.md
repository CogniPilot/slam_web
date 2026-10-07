# GPU camera transport into Modelica

The first transport candidate is raw RGBA8 and axial-depth Float32, copied into
compiler-issued f64 input fields with two bulk `Float64Array.set` calls. This
removes application per-pixel conversion arithmetic while keeping image
processing and estimation in Modelica. The issued RGB shape must accept four
channels; the Modelica algorithm owns which channels it uses.

A bounded native V8 microbenchmark measured the complete 160×90 buffers:

| Operation | Warm median milliseconds/call |
|---|---:|
| RGBA8 and Float32 depth bulk conversion into f64 | 0.011196 |
| Equivalent JavaScript scalar loops | 0.029777 |
| Already packed f64 byte copies | 0.013998 |

The executed benchmark used Node 24.21.0, one CPU at nice 15, 300 warmups and
12 alternating blocks of 1,000 calls. All input values and 12 Float32 IEEE edge
cases passed independent integer-bit checks; NaN classification was checked,
without promising its payload. It finished in 0.823 seconds with a 63,536 KiB
RSS peak under a 10-second/256-MiB guard. Shared host load was not isolated.
These numbers measure native V8 conversion only: they exclude GPU rendering,
readback, worker copies, browser execution, Modelica computation and total frame
time. [Executed source, report and resources](../dev/gpu-f64-transport-verification.json).

GPU f64 packing is a separate, unimplemented proposal. A WebGL2 shader can emit
the two integer words of each f64 into RGBA32UI. For a normal binary32 word with
sign `s`, exponent `e` and fraction `m`, its f64 words are
`low=m<<29` and `high=s|((e+896)<<20)|(m>>3)`. This exactly widens the captured
binary32 value using integer operations; zero, subnormal and special-value cases
need their explicit branches. The proof begins with authoritative integer bits,
and does not imply that all shader float operations preserve every special bit.
[GLSL ES precision and bit conversions](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf).

Two current format boundaries matter. Sampling the sRGB RGB target returns
linear values, so gamma re-encoding is insufficient for an unconditional raw-byte
claim. An exact proposed route reads encoded RGBA bytes into a GPU pixel-pack
buffer, uploads those bytes to an integer texture and packs from integer samples.
Also, raw axial Float32 differs from the current 24-bit depth encoding followed
by host f64 decoding. That change needs an explicit sensor format and geometry
validation. [GLES texture and pixel-transfer contracts](https://registry.khronos.org/OpenGL/specs/es/3.0/es_spec_3.0.pdf).

Packed f64 requires 576,000 bytes per frame, versus 115,200 bytes for raw
RGBA8/depth32: five times the readback payload before UI buffers and GPU passes.
The separate sensor and Modelica workers also require an owned-buffer transfer
and a bulk copy into the module's nonshared memory. GPU readback is a copy and
synchronization boundary; it is not zero copy. [WebGL2 buffer readback](https://registry.khronos.org/webgl/specs/2.0.0/).

The [full audit and proposed GPU test plan](../dev/artifacts/gpu-f64-transport/design.md)
cover named dimensions, separate RGB/depth optics, row orientation, framebuffer
capabilities, exact byte/IEEE tests, failure handling and matched end-to-end
measurements. No GPU or browser proof has run, and this audit changed no
application or compiler code. Depth noise remains a separate Modelica migration
requirement; representation shaders must not implement CV or SLAM algorithms.
