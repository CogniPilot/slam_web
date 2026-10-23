#!/usr/bin/env bash
# Opt-in saved-observation replay; no simulation or rendering.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# != 1 ]]; then echo 'Usage: run-office-replay.sh NEW_OUTPUT' >&2; exit 2; fi
if [[ "${GITHUB_ACTIONS:-}" != true || "${GITHUB_REPOSITORY:-}" != CogniPilot/slam_web ]]; then
  echo 'Saved-observation full replay is restricted to the reviewed CI job' >&2; exit 2
fi
export OFFICE_REPLAY_OUTPUT="$1"
mkdir "$OFFICE_REPLAY_OUTPUT"
export OFFICE_REPLAY_STAGE=setup
finish() {
  local result=$?
  trap - EXIT
  OFFICE_REPLAY_EXIT="$result" node --input-type=module <<'JS'
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
await writeFile(join(process.env.OFFICE_REPLAY_OUTPUT,'pipeline-status.json'),JSON.stringify({stage:process.env.OFFICE_REPLAY_STAGE,exitCode:Number(process.env.OFFICE_REPLAY_EXIT),scope:'Saved-observation replay only; inspect replay receipt before interpreting snapshots.'},null,2)+'\n');
JS
  exit "$result"
}
trap finish EXIT
stage() { export OFFICE_REPLAY_STAGE="$1"; shift; "$@" 2>&1 | tee "$OFFICE_REPLAY_OUTPUT/$OFFICE_REPLAY_STAGE.log"; }
stage dependencies npm ci
stage contracts node --test scripts/office-replay.test.mjs
stage restore node scripts/restore-office-replay-input.mjs "$OFFICE_REPLAY_OUTPUT/input"
stage bundle node scripts/build-office-replay.mjs "$OFFICE_REPLAY_OUTPUT/replay.js"
stage replay node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 3072 --available-mib 512 \
  --log "$OFFICE_REPLAY_OUTPUT/replay-resource.log" -- \
  node scripts/replay-office-browser.mjs "$OFFICE_REPLAY_OUTPUT/input/original" dist/vendor/slam \
  "$OFFICE_REPLAY_OUTPUT/replay" "$OFFICE_REPLAY_OUTPUT/replay.js"
stage seal node scripts/seal-office-replay.mjs "$OFFICE_REPLAY_OUTPUT"
export OFFICE_REPLAY_STAGE=complete
