# Capture the complete office return in CI

The normal recording UI retains 300 frames. At the minimum 5 Hz camera rate it
cannot retain the 250 s office mission through its return. This opt-in diagnostic
captures the initializer's actual time-zero image plus 1,250 lockstep updates at
424×240, using sandboxed Chromium with verified SwiftShader WebGL. It does not
change the recording UI, production worker, Modelica owners or estimator gates.

Dispatch the existing Pages workflow on a reviewed source branch:

```sh
gh workflow run pages.yml --ref REVIEWED_BRANCH \
  -f skip_browser_checks=false -f office_loop_diagnostic=true
```

The workflow retains its ordinary build and four browser shards. The diagnostic
job restores the same run's digest-verified static build, runs separately, and
uploads `office-loop-software-RUN-ATTEMPT` for seven days even after a failure.
The diagnostic dispatch cannot deploy Pages. Existing workflow dispatch is used
because GitHub requires the workflow file to exist on the default branch before
it can be dispatched on another ref.

For an equivalent local run inside the pinned CI development shell:

```sh
mkdir -p "$HOME/scratch/slam_web/profiles"
nix develop --no-update-lock-file .#ci --command \
  bash scripts/run-office-ci.sh "$HOME/scratch/slam_web/profiles/office-NEW"
```

The output directory must not already exist. The runner resolves Chromium from
`CHROMIUM_PATH` or the image PATH with its namespace sandbox enabled. The software
flags belong only to this diagnostic; its renderer receipt must identify
SwiftShader. Native GPU/WebGPU acceptance is a separate experiment.

The prepared `OfficeLoopProfile` is composed into the existing physics model.
Default project source dependencies are retained. The scene is `office-loop`,
one vehicle, 5 Hz RGB-D, 10 Hz IMU, seed 7, zero manual commands and autopilot off.
Moving actors, LiDAR and depth-cloud display are disabled. The initial camera
image is the one consumed by native initialization, not a second acquisition.
Every later step retains raw RGB8 and Z16, calibration, contiguous IMU intervals,
truth, estimate, native statuses and sparse feature outputs. Truth is used only
for reporting the achieved flight extent and return error, never for matching.

A separately bundled diagnostic worker observes the original native entry once:
previous catalog state is copied after carry and before entry; declared outputs
and next state are copied after successful return. Snapshots preserve all 350
feature slots and retain candidate references with typed-lane fallbacks. Asset
hashes are checked against the actual module layout. No native scratch offsets
are guessed, and the published worker is unchanged.

The CPU bridge uses copied reference descriptors and actual current pixels. When
the current catalog payload is unavailable, its descriptors are reconstructed
with the shipped Modelica owner over a padded disabled domain and an exact
native enabled-mask check. The shipped matcher and covariance functions run with
recorded settings. Only loops with independently identical native/reconstructed
matched counts enter the original-versus-observed consensus probe. Sequential
Verify counts are not exported by the current ABI; those reconstructions stay
separate and never enter that probe. See [the pair boundary](loop-pair-reconstruction.md)
and [consensus interpretation](loop-registration-diagnostics.md).

Important artifacts:

- `pipeline-status.json`: last stage and process result, including interruption.
- `capture/receipt.json`: completeness, renderer, source identities and measured
  flight extent/return; a partial capture is not a complete mission.
- `capture/frames/`: 1,251 frame records and raw RGB/depth bytes, starting at t=0.
- `capture/native-frames/`: content-hashed catalog matcher payloads.
- `pairs/extraction-receipt.json`: selection, refusals, absent candidates,
  extraction errors, missing original counts and identity-checked case counts.
- `pairs/office-pairs.json`: nonempty identity-checked loops only, if available.
- `pairs/reconstruction-only.json`: separate sequential transport evidence.
- `consensus/`: probe input, output identity checks and reason/subreason evidence;
  `no-eligible-pairs` records absence without fabricating a test case.
- `summary.json` and `SHA256SUMS`: completed acquisition and artifact integrity.

Capture is bounded to 30 minutes and 2 GiB raw images, with disk guards. Extraction
has a 10 minute/4 GiB owned-RSS limit, and consensus a 5 minute/2 GiB limit.
Individual component controls run first under a separate 2 GiB limit. The job
has a 75 minute outer limit. Partial files and stage logs remain available after
failure; the workflow does not automatically retry or silently reduce resolution,
frame count or mission duration.

A green acquisition/probe job establishes evidence transport and output identity.
It does not establish successful office loop closure. Inspect the achieved route,
late committed edges, registration decisions and correction effects, and compare
alias controls on the same observations before making that claim. Early matches
near the starting corner do not establish a completed return.
