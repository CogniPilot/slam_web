# Readable Harris source

The selectable Harris source is [HarrisNativeFrame.mo](../models/HarrisNativeFrame.mo),
with native camera dimensions supplied by [D435HarrisFeatures.mo](../models/D435HarrisFeatures.mo)
and [D435ImageProfile.mo](../models/D435ImageProfile.mo).
Image extents are structural parameters. Traversals use those extents or
`size(array,axis)`; kernel radii and RGB channel count describe the algorithm.

Grayscale, centered gradients, gradient products and tensor averages are
separate array equations. The response is `xx*yy-xy*xy-harris_k*(xx+yy)^2`.
The editable Modelica file is authoritative; there is no source generator or
application-owned vision compiler. The thumbnail, NMS, pixel and staged-raster
implementations have been deleted.

Source editing, Rumoca diagnostics and local project persistence work. Native
whole-frame execution is pending compiler integration. The installed
Rumoca 0.10.0 package traps on the array-reduction compilation probe; this is
not a working detector or full-SLAM claim. Historical numerical receipts remain
review evidence for their exact original sources and compiler versions.
