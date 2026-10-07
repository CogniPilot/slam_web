# Readable Modelica vision kernels

Current image algorithms live in [HarrisNativeFrame.mo](../models/HarrisNativeFrame.mo)
and [FastNativeFrame.mo](../models/FastNativeFrame.mo). The D435 wrappers supply
native camera dimensions from [D435ImageProfile.mo](../models/D435ImageProfile.mo).
Use structural image parameters and `size(array,axis)` for traversals. Kernel
radii, channel count and feature/keyframe/map capacities describe separate
algorithm choices.

Harris expresses grayscale, centered gradients, tensor averaging and
`det(M)-k*trace(M)^2` as compact array equations. FAST uses a sixteen-sample
circle offset table and ordered sliding windows. Its optional conservative
selection gate rejects impossible nine-sample arcs without changing admitted
features, including rounded-rank ties. Neither implementation downsamples the
native input. Removed thumbnail and raster implementations are not fallbacks.

Three.js shaders create RGB8 and Z16 camera output, including depth measurement
noise and quantization. Rumoca owns compilation of the Modelica algorithms;
JavaScript transports the declared raw buffers. The application-owned vision
adapter and source generator are removed.

The editor, diagnostics and persistence are available. Full native detector and
SLAM execution in browser WASM remain pending. Component/reference receipts
qualify their exact scope; they do not establish full camera ingress, carried
SLAM state or realtime throughput.
