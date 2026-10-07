# GPU to Rumoca WASM handoff

This is the historical160×90 experiment. The current848×480 camera has a much
larger payload; use [native transport findings](artifacts/native-gpu-transport/README.md)
and `dev/probe-native-gpu-transport.mjs`. The old probe now refuses mismatched
target dimensions so it cannot report a thumbnail crop as a full native frame.

The 2026-10-05 hardware experiment reads the current scene's rendered RGB,
axial depth and optional 64-beam LiDAR targets into contiguous, nonshared
`WebAssembly.Memory` views. One pooled packed PBO and one `getBufferSubData`
call write the entire capture directly to those views. Source and destination
offsets are checked; ordinary callers retain the existing staging route.
No simulation time advances during this transport experiment.

Eleven readback controls and the hardware raw-byte/guard comparisons pass.
Two sensor loads each used ABBA then BAAB with 100 warm and 1,000 timed
captures per window, 16,000 timed reads total. The targets were already
rendered: these timings exclude rendering, GPU render waits, physics,
algorithm execution and worker messaging.

| Raw target transport | Buffered plus WASM copy | Direct WASM destination |
| --- | ---: | ---: |
| RGB-D, 115,200 bytes | 0.353 ms | 0.283 ms |
| RGB-D and LiDAR, 1,163,776 bytes | 0.680 ms | 0.631 ms |

The RGB-D windows vary considerably, including a slower first buffered
window. Treat the absolute saving of roughly 0.05–0.07 ms as a measured
component result, not a promised pipeline gain. The production preview has
not been switched to this transport route.

## API findings

Three.js recommends its asynchronous render-target read method. Our installed
0.180.0 implementation allocates a PBO per call, inserts a fence, then copies
into the supplied typed array. The application already pools PBOs and batches
multiple sensors. Switching APIs alone does not remove the transfer.
[Three.js documentation](https://threejs.org/docs/pages/WebGLRenderer.html)

WebGL's `getBufferSubData` accepts a supplied buffer view, including shared
views, and blocks until prior buffer writes finish. The specification suggests
a fence before readback and a READ allocation hint; it also notes possible
inter-process round-trip cost. The existing implementation uses `STREAM_READ`.
The direct route removes host copies after the GPU transfer; it does not
provide a shared GPU/WASM address space.
[WebGL 2 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)

## Next compiler and execution work

The actual production raster input writer currently expands RGBA8 to RGB
Float64 values in a JavaScript loop. Native Modelica program inputs also use
F64 parameter storage. Direct raw U8/F32 capture therefore cannot yet be
passed to those inputs without an ingestion boundary. This experiment does
not execute Rumoca on the captured bytes.

The preferred execution path co-locates sensor rendering and the compiled
Modelica processing graph in one worker. Readback writes into compiler-issued
input storage, then invokes the graph before releasing the lockstep frame.
Send bounded display snapshots and diagnostics to the viewer rather than
routing every raw sensor buffer through the main thread and separate workers.
Retain a portable unshared-memory path; shared memory must remain optional.

Rumoca should provide source-bound packed external-input descriptors for U8
and F32 data, with exact shapes, strides, row orientation, immutable source
identity, buffer bounds and numeric promotion. Generated loads or a compiled
ingestion stage must own conversion to Modelica Integer/Real semantics.
Keep the original equations, ordered faults, parameter immutability and
transactional state behavior. Do not interpret raw F32 bytes as F64 inputs,
erase sensor invalid flags, or make host JavaScript implement CV algorithms.

An alternative worth measuring is GPU packing into the current F64 wire
representation. That trades extra transfer bytes for eliminating CPU
conversion and requires exact bit-promotion controls. It is not implemented
or assumed faster.
