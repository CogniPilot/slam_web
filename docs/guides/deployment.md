# Hosting and deployment

SLAM Lab builds into a static website. Simulation and compilation run in the
visitor's browser using WebAssembly; no simulation or compiler service is needed.

## Build the website

Use the pinned Nix environment:

```sh
nix develop --no-update-lock-file path:.#ci
npm ci
npm run assets
npm run build
npm run preview
```

The build initializes the pinned `modelica_models` Git submodule automatically.
It needs Git and network access once; subsequent builds reuse that checkout.

Publish the contents of `dist/` to a static host. This repository deploys to
GitHub Pages after CI passes on `main`. The deployed site includes the compiler,
Modelica source and rendering assets.

`npm run assets` also publishes the native SLAM programs when a Rumoca
`native_step` export of `D435FastSLAMInitialize` and `D435FastSLAMStep` exists
(`SLAM_NATIVE_EXPORTS`, default `~/scratch/slam_web/build/slam-native-exports`,
with `init-named` and `step-named` directories). The programs are content
addressed, gzip compressed (about 18 MB) and listed in
`public/vendor/slam/manifest.json` together with the SLAM source hash they were
compiled from. Without an export the site builds normally and the estimator
selector reports native SLAM as unpublished.

## Running on a robot

The Modelica library is maintained independently in
[CogniPilot Modelica Models](https://github.com/CogniPilot/modelica_models).
**Download SLAM FMU** in the Embedded deployment panel serves the FMI-LS
WebAssembly package of `D435FastSLAMStep` (FMI 3 co-simulation,
`binaries/wasm32-wasip2/` component, `modelDescription.xml` with Int64 Integer
and Boolean variables) when the site publishes it. `npm run assets` copies
`package/published/D435FastSLAMStep.fmu` from the export directory next to the native
programs. The package is the compiler's current build (about 7 MB zipped, a 28 MB
component): functionally complete, but not yet wired to CPU/GPU execution
planning or hardware sensor interfaces on a host.
The header **Download** button still exports the project, not the FMU.
