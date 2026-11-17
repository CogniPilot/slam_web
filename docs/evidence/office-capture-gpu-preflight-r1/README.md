# Office capture and hardware preflight checks

Base: `be78374dc0bb9e6aaf4ceebde273456ea3bde236`.

The office capture route and scene/sealing/replay support were restored from a
previously prepared local patch. The current checks reproduce its office
physics source hash and unchanged hallway source hash. This is a source
transformation check, not a newly executed flight simulation.

The new shared launcher selects the flake browser and an installed Vulkan
manifest, verifies the actual renderer before application loading, and
records both accepted and refused preflights. Hardware capture and profiling
call it automatically. Controls cover matching/mismatched driver packages,
explicit and automatic selection, ambiguous/malformed manifests, software and
unknown renderers, and resource cleanup on rejection or probe failure.

`comparison-tests.log` records `scripts/test-slam-comparison.sh`: 54 tests,
53 passed and one skipped. The skip requires the unavailable sealed hallway
capture (`SLAM_SEALED_HALLWAY`). There are 26 Node tests, including eight
hardware-launcher controls and five scene tests, plus 28 Python tests. Browser
launches in these controls use fakes; they do not establish hardware access.
JavaScript syntax and patch whitespace checks also pass.

Environment: Node 22.23.3 and Nix-store Python 3.13.15 with NumPy 2.4.4.
The first suite attempt stopped on missing NumPy in the default interpreter;
rerunning with the existing NumPy environment passed. The flake shell now
includes NumPy. Nix evaluation was unavailable in this runtime and remains to
be checked with the pinned flake.

No live GPU/browser capture or performance result is claimed. This fresh
runtime has no exposed NVIDIA/DRI devices, Chromium executable or nix command;
`CHROMIUM_PATH` is unset. The selection preflight refuses before browser
launch (`environment-preflight.json`). A full office capture, independent
estimator replays and real GPU throughput measurement remain pending a
suitable runtime and restoration of the capture template/compiled caches.
