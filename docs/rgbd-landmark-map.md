[RGBDLandmarkMap](../models/RGBDLandmarkMap.mo) defines an editable, bounded persistent map step. It receives all 350 world-ENU candidate slots from [RGBDLandmarkProjection](rgbd-landmark-projection.md) and retains up to 14,400 landmark slots (`imageHeight*imageWidth`, with named constants 90 and 160). There is no ground-truth input, host mapping algorithm or production runtime activation.

This is staged source, **not an admitted executable**. Six independent full-capacity oracle/fixture tests pass. The actual source-issued native preparation attempt timed out at 180.26 seconds and issued no artifact; zero Modelica numerical cases executed. The [verification record](../dev/modelica-rgbd-landmark-map-verification.json) retains this distinction, earlier construction failures, source/compiler hashes and a bounded preparation profile. The four actual native numerical test groups are present but skipped until artifacts exist.

The persistent state is `point[14400,3]`, `occupied`, `confidence`, `lastSeen`, `lastFrame`, plus `nextTime`, `nextFrame` and `nextWorldFrame`. These arrays contain 100,800 doubles (806,400 bytes); the full result adds the confirmation mask and diagnostics for 115,213 scalar outputs. The caller later retains accepted outputs as the next call's `previous*` inputs. No TypeScript state adapter is activated by this change.

The Modelica step makes these decisions in order:

1. Validate settings, accepted pose flag, finite estimated body position, integer candidate count, retained occupied-slot state, world-frame identity and increasing time with exactly the next frame number. A rejected call preserves every persistent state field, including its timestamp and frame identity; callers must not publish derived diagnostics as a replacement state. Rejected malformed state may retain nonfinite payloads for explicit recovery/reset.
2. Remove landmarks older than their lifetime or farther than `maximumDistance` from the supplied estimated body position. Boundaries are inclusive. Canonicalize accepted empty slots to zero. Reset instead discards the complete old map, including malformed old payload, and starts frame 1 in the supplied world-frame identity.
3. Process candidates in original slot order, including sparse final slots. Disabled points never enter geometry. Malformed enabled flags or nonfinite/beyond-limit coordinates increment `invalidCandidateCount`; candidates beyond the distance horizon are ignored.
4. Search all map slots for the first spatial duplicate: either the same three-dimensional voxel, using mathematical floor for negative coordinates, or Euclidean distance at most `mergeRadius`. The earliest matching slot wins; otherwise the earliest vacant slot wins. Existing coordinates remain their original anchor, so a sequence of near matches cannot walk an anchor through the city.
5. Refresh matched timestamps and add confidence at most once per frame. Repeated candidate slots in one frame cannot confirm a landmark. Insert unmatched candidates as tentative only while both full storage and the tentative quota allow; otherwise increment `droppedCount`. Confirmation requires repeated accepted frames.

Defaults are editable Modelica parameters:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `voxelWidth` / `mergeRadius` | 0.25 m / 0.15 m | Voxel or spatial duplicate gate |
| `confirmationObservations` / `maximumConfidence` | 3 / 8 | Distinct-frame confirmation and saturated confidence |
| `tentativeLifetime` / `confirmedLifetime` | 0.5 s / 5 s | Maximum absence before removal |
| `maximumTentative` | 700 | Bound on unconfirmed occupancy; all 14,400 slots remain available to confirmed landmarks |
| `maximumDistance` | 80 m | Estimated-pose-centered local horizon |
| `coordinateLimit` | 1,000,000 m | Finite arithmetic and coordinate domain |

The fixed world ENU basis belongs to `worldFrame`. `candidatePoint`, map points and estimated `bodyPosition` must share that basis and acquisition timestamp. Camera extrinsics are already applied by the projection stage. Changing the frame identity requires explicit reset; transporting a retained map through a pose-graph frame correction is a separate pending Modelica stage. New IDs must never silently relabel existing coordinates.

Confidence, tentative quota and absence/distance pruning bound transient occupancy. They do not establish a semantic moving-object classifier, depth-ray free-space pruning, descriptor/keyframe retrieval, covariance-aware landmark fusion or loop closure. Confirmed moving-object false positives remain possible and age out. Spatial dedup also deliberately merges distinct surfaces within one voxel; it is not correspondence identity proof.

The first algorithm scans 14,400 slots for each of 350 candidates: 5,040,000 slot visits per call. It preserves all actual storage and candidate slots rather than hiding work with a smaller fixture. Aggregate-carry copying and helper-call costs have not been measured because native preparation is blocked. This is not a fast-map or 90 Hz claim.

Run the independent oracle fixtures:

```sh
mkdir -p "$HOME/scratch/slam_web/tmp/landmark-map"
TMPDIR="$HOME/scratch/slam_web/tmp" \
RUMOCA_MAP_REPORT="$HOME/scratch/slam_web/tmp/landmark-map/oracle-report.json" \
node dev/rumoca-bounded-run.mjs --seconds 180 --rss-mib 4096 \
  --log "$HOME/scratch/slam_web/tmp/landmark-map/oracle.log" -- \
  nice -n 10 taskset -c 10 node node_modules/vitest/vitest.mjs run \
  --config dev/vitest-landmark-map.config.ts
```

Once an actual compiler issues `baseline.json` and `edited.json`, set `RUMOCA_MAP_ARTIFACT_DIRECTORY` to that directory for the same test. The edited source changes confirmation from three observations to two while retaining every capacity. The staged actual gate checks all public outputs against an independent object/slot oracle, immutable input bytes, full storage refusal/reuse, sparse late slots, malformed state/pose/time/frame refusals, reset/recovery and source-bound JSON artifact reload. An oracle-only pass cannot satisfy this executable gate.

The exact final source is SHA256 `110ecb3c5ddb053e498268c6cea722a3a9921c10c50b3c3f718df63ec4c7842a`. The timed-out producer was immutable binary `745f8942e586d94a697e81aca41f2044b52781c608d3059f9f4a549fa1c58bf2`, from compiler source manifest `53db01b95ff69ab59122c068b5697c162a199c2f3937bfc3dca4a57e1d2eacd8`. A 15-second, 1,462-sample profile with zero lost samples identifies dependency projection, Fold graph enqueueing and hashing as sampled hot owners. It does not identify the precise compile/Solve phase boundary or prove a new compiler revision fixes it. Native admission, actual numerical/source-edit/reload execution, persistent runtime integration and complete SLAM remain pending.
