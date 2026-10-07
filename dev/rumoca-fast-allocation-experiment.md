# Root execution: full FAST allocation comparison

The driver is authored and syntax-checked only. No private compiler copy, build,
producer, profiler, or cache write was executed by its author. The root agent must
wait for the authoritative current main Cargo gate and source bookends to close,
then confirm exclusive ownership of the selected Cargo target. The coverage-index
focused 68-case pass alone is not broader compiler qualification.

Run from the app repository in its pinned CI environment. Use a fresh owned
destination. These variables derive machine paths from HOME and preserve the
original full-frame source; substitute the actual qualified terminal manifest
path if the owner used a different filename.

```bash
allocation_directory="${HOME}/scratch/slam_web/tmp/fast-retained-allocation-comparison"
allocation_target="${HOME}/scratch/slam_web/build/rumoca-native-target"
allocation_manifest="${HOME}/scratch/slam_web/tmp/native-coverage-index-v2-gate/source-after.sha256"

node dev/rumoca-fast-allocation-experiment.mjs prepare \
  --directory "$allocation_directory" --target "$allocation_target" \
  --source-manifest "$allocation_manifest"

node dev/rumoca-fast-allocation-experiment.mjs build \
  --directory "$allocation_directory" --target "$allocation_target" --variant baseline

node dev/rumoca-fast-allocation-experiment.mjs run \
  --directory "$allocation_directory" --target "$allocation_target" --variant baseline
```

`prepare` validates the supplied exact source manifest and all seven counter
preimages before copying. It excludes `.git`, `target`, `node_modules`, and `.venv`,
preserves relative symbolic links, and independently compares a complete copied
file/symlink manifest so `include_str!`/`include_bytes!` templates and fixtures are
not omitted by the narrower Rust/Cargo manifest. The only current nonexcluded
symlink observed is `docs/dev-guide/live -> ../user-guide/live`, which stays within
the copied tree. Targets inside either source tree are refused. It does not
overwrite an existing experiment or the old immutable diagnostic producer.

Build commands retain the original dev/test profile and eval-dae opt-level3,
full-web features, four Cargo/test/Rayon workers, nice15, and CPU6,7 affinity.
Every heavy command has the existing 600-second/8192-MiB guard and 16-GiB host
reserve. CargoJSON selects the exact executable, which is copied and hashed before
use. Because `.git` is excluded, the embedded copied-build revision may be
`unknown`; external source manifests and selected binary hashes are the evidence.

While the original producer is running, the root may capture the requested
eight-second CPU profile in a second terminal. Inspect the actual host PID and
pass the producer PID, not the guardian or Cargo PID. The mode verifies that
`/proc/PID/exe` resolves to the selected immutable variant producer, records its
birth identity, and attaches without restarting the producer:

```bash
node dev/rumoca-fast-allocation-experiment.mjs profile \
  --directory "$allocation_directory" --target "$allocation_target" \
  --variant baseline --pid "$allocation_producer_pid"
```

Wait for the baseline resource record and inspect its actual phase frontier before
the next commands. The baseline may legitimately exit137 from the memory guard;
do not describe that as preparation success. `apply-lazy` requires a terminal
baseline record, validates its selected producer and exact instrumented model.rs,
then deliberately reconciles the counter patch with the OnceLock proposal. The
lazy constructor records a deferred cache; the accessor records actual first
demand. Diagnostic observation itself does not initialize it.

```bash
node dev/rumoca-fast-allocation-experiment.mjs apply-lazy \
  --directory "$allocation_directory" --target "$allocation_target"

node dev/rumoca-fast-allocation-experiment.mjs lazy-controls \
  --directory "$allocation_directory" --target "$allocation_target" --variant lazy

node dev/rumoca-fast-allocation-experiment.mjs build \
  --directory "$allocation_directory" --target "$allocation_target" --variant lazy

node dev/rumoca-fast-allocation-experiment.mjs run \
  --directory "$allocation_directory" --target "$allocation_target" --variant lazy

node dev/rumoca-fast-allocation-experiment.mjs summarize \
  --directory "$allocation_directory" --target "$allocation_target"
```

Do not continue after a failing build, a source/binary bookend mismatch, or failing
lazy controls. The five cache controls cover cold construction, exact rectangular
rows, empty dimensions, clone ownership, and simultaneous consumers. Qualify the
lazy producer independently; the baseline binary stays immutable. Both variants
use source SHA d42da6959fee8a629c6a9850fef31559ba692f5bafd3001ba69106200f34ea11
and the same existing source-inventory test binding.

Collect `preparation-resource.json`, `allocation-counters.log`, source manifests,
producer freezes, optional perf reports, and the comparison summary. Counters are
shallow capacity estimates, not additive total memory. If artifacts are issued,
compare exact native module digests and all source-bound schedule/layout data
before any numerical acceptance test. This driver performs **zero numerical
cases** and cannot establish full FAST or full SLAM acceptance by itself.
