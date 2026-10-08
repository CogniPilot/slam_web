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

## Running on a robot

The Modelica library is maintained independently in
[CogniPilot Modelica Models](https://github.com/CogniPilot/modelica_models).
A downloadable full SLAM FMU using FMI-LS WebAssembly, CPU/GPU execution planning
and hardware sensor interfaces are planned. They are not available deployment
features yet. Today's **Download** exports a project, not a robot-ready FMU.
