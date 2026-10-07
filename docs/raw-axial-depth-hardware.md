# Hardware follow-up for raw axial depth

The unchanged camera component from the [software verification](raw-axial-depth-transport.md)
also passed on the reported NVIDIA GeForce RTX 3090 through Chromium's ANGLE
OpenGL ES 3.2 backend. The earlier software record remains unchanged.

The test exercised all 16 uniform IEEE word cases across all 14,400 camera
pixels and cloud depth channels. Raw bits, sync/async/debug buffers, static
batching, skinning, near/far clipping, background zeros, row orientation,
distinct RGB/depth optics, lockstep rejection and render-fault recovery passed.
The analytic tilted-plane error was 20.298 micrometers; cloud XYZ error was
at most 0.4621 micrometers. Cloud depth matched camera depth bit for bit.
The precision budget came from the renderer's queried subpixel precision and
Float32 transform allowance, independently of the observed error.

This is a component test using current source, with no numerical backend
started. It does not measure capture throughput, GPU utilization or full SLAM,
and does not verify the built application's dedicated sensor-worker path.
The depth format changes the former 24-bit quantization explicitly; runtime
depth noise and eventual Modelica input transport still need integration.

Run the same test with the pinned development environment:

```sh
SLAM_BROWSER_GPU=1 nix develop path:.#ci --command \
  npx playwright test tests/browser/raw-axial-depth.spec.ts --reporter=line
```

The environment flag requests a hardware backend. Inspect the recorded renderer;
the flag alone does not establish hardware acceleration. Results, source hashes
and resource records are in `dev/raw-axial-depth-hardware-verification.json` and
`dev/artifacts/raw-axial-depth-hardware/manifest.json`.
