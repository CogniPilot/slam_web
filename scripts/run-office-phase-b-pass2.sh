#!/usr/bin/env bash
# Phase B job 3: baseline and candidate pass 2 of the sealed two-circuit capture, with the sealed plan's snapshots.
# Replays only granted, hash-pinned inputs; there is no capture, compiler or export stage. A pass-equality refusal is an
# infrastructure stop, not a result: the plan allows one re-dispatch of this job, and the capture is never repeated.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# != 1 || "${GITHUB_ACTIONS:-}" != true || "${GITHUB_REPOSITORY:-}" != CogniPilot/slam_web ]]; then
  echo 'Usage: reviewed CI run-office-phase-b-pass2.sh NEW_OUTPUT' >&2; exit 2
fi
for name in OFFICE_PHASE_B_PIN OFFICE_PHASE_B_PIN_SHA256 OFFICE_PHASE_B_CANDIDATE_PIN OFFICE_PHASE_B_CANDIDATE_PIN_SHA256; do
  [[ -n "${!name:-}" ]] || { echo "$name is required" >&2; exit 2; }
done
export OFFICE_PHASE_B_PASS=2
export OFFICE_PHASE_B_OUTPUT="$1"
mkdir "$OFFICE_PHASE_B_OUTPUT"
mkdir -p "$HOME/scratch/slam_web/tmp"
pass2_work=$(mktemp -d "$HOME/scratch/slam_web/tmp/office-phase-b-pass2-XXXXXXXX")
export OFFICE_PHASE_B_STAGE=setup
finish() {
  local result=$?
  trap - EXIT
  OFFICE_PHASE_B_EXIT="$result" node --input-type=module <<'JS'
import{writeFile}from'node:fs/promises';import{join}from'node:path';
const stage=process.env.OFFICE_PHASE_B_STAGE,exitCode=Number(process.env.OFFICE_PHASE_B_EXIT);
await writeFile(join(process.env.OFFICE_PHASE_B_OUTPUT,'pipeline-status.json'),JSON.stringify({stage,exitCode,
 infrastructureStop:stage==='pass-equality'&&exitCode!==0,
 scope:'Phase B pass 2. A pass-equality refusal is an infrastructure stop, not a result; inspect pass-equality/ before anything else.'},null,2)+'\n');
JS
  exit "$result"
}
trap finish EXIT
stage() { export OFFICE_PHASE_B_STAGE="$1"; shift; "$@" 2>&1 | tee "$OFFICE_PHASE_B_OUTPUT/$OFFICE_PHASE_B_STAGE.log"; }
stage dependencies npm ci
stage controls node --test --test-concurrency=1 scripts/office-phase-b-checks.test.mjs scripts/office-phase-b-replay-pin.test.mjs \
  scripts/office-phase-b-compare.test.mjs scripts/office-replay.test.mjs scripts/office-compare-contract.test.mjs
# Job 2's artifact: pass-1 candidate frames, the exact candidate assets and the sealed plan.
stage restore-pass1 node scripts/restore-office-comparison-input.mjs "$OFFICE_PHASE_B_OUTPUT/pass1-input" "$pass2_work/pass1.zip"
pass1="$OFFICE_PHASE_B_OUTPUT/pass1-input/qualified"
export OFFICE_PHASE_B_PLAN="$pass1/plan/plan-receipt.json"
# Baseline pass 2: the saved replay of the granted capture, qualified by exact equality with the captured outputs, which
# also makes it the cross-runner check. Snapshots only at the plan's epochs.
stage baseline bash scripts/run-office-replay.sh "$OFFICE_PHASE_B_OUTPUT/baseline"
# Candidate pass 2 on that replay root with job 2's assets, byte for byte.
stage bundle node scripts/build-office-compare.mjs "$OFFICE_PHASE_B_OUTPUT/comparison.js"
stage comparison env OFFICE_PHASE_B_PASS1_ROOT="$pass1" node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 3072 --available-mib 512 \
  --log "$OFFICE_PHASE_B_OUTPUT/comparison-resource.log" -- \
  node scripts/compare-office-browser.mjs "$OFFICE_PHASE_B_OUTPUT/baseline" "$pass1/candidate-assets" "$OFFICE_PHASE_B_OUTPUT/comparison" \
  "$OFFICE_PHASE_B_OUTPUT/comparison.js" scripts/office-candidate.json
# Pass 1 and pass 2 must be identical on all 1251 frames before any pass-2 snapshot counts.
stage pass-equality node dev/rumoca-bounded-run.mjs --seconds 300 --rss-mib 2048 --available-mib 512 \
  --log "$OFFICE_PHASE_B_OUTPUT/pass-equality-resource.log" -- \
  node scripts/compare-replay-passes.mjs "$pass1/comparison/capture" "$OFFICE_PHASE_B_OUTPUT/comparison/capture" "$OFFICE_PHASE_B_OUTPUT/pass-equality"
stage seal node scripts/seal-office-comparison.mjs "$OFFICE_PHASE_B_OUTPUT"
export OFFICE_PHASE_B_STAGE=complete
