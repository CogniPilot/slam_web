#!/usr/bin/env bash
# Opt-in software diagnostic. Does not deploy Pages or alter browser smoke gates.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# != 1 ]]; then echo 'Usage: run-office-ci.sh NEW_OUTPUT' >&2; exit 2; fi
export OFFICE_CI_OUTPUT="$1"
mkdir "$OFFICE_CI_OUTPUT"
export OFFICE_CI_STAGE=setup
preview_pid=''
finish() {
  local result=$?
  trap - EXIT
  if [[ -n "$preview_pid" ]]; then kill "$preview_pid" 2>/dev/null || true; wait "$preview_pid" 2>/dev/null || true; fi
  OFFICE_CI_EXIT="$result" node --input-type=module <<'JS'
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
await writeFile(join(process.env.OFFICE_CI_OUTPUT,'pipeline-status.json'),JSON.stringify({schemaVersion:1,stage:process.env.OFFICE_CI_STAGE,exitCode:Number(process.env.OFFICE_CI_EXIT),finishedAt:new Date().toISOString(),scope:'Software diagnostic only; no GPU, accuracy or closure acceptance.'},null,2)+'\n');
JS
  exit "$result"
}
trap finish EXIT
stage() { export OFFICE_CI_STAGE="$1"; shift; "$@" 2>&1 | tee "$OFFICE_CI_OUTPUT/$OFFICE_CI_STAGE.log"; }
stage dependencies npm ci
stage contracts npm run test:office-ci
if [[ "${OFFICE_CI_SCENE:-office-loop}" == office-loop-two-circuit ]]; then
  # Phase B checks and the route binding are tested before anything is acquired.
  stage phase-b-contracts node --test --test-concurrency=1 scripts/office-phase-b-checks.test.mjs scripts/environment-scale-scenes.test.mjs
fi
stage kernels node dev/rumoca-bounded-run.mjs --seconds 120 --rss-mib 2048 --available-mib 512 --log "$OFFICE_CI_OUTPUT/kernel-controls.log" -- npm run test:office-ci-kernels
if [[ "${OFFICE_CI_REUSE_DIST:-0}" == 1 ]]; then
  [[ -n "${GITHUB_RUN_ID:-}" && -f dist/index.html ]] || { echo 'Expected the same-run restored CI build' >&2; exit 1; }
  node --input-type=module <<'JS'
import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
await writeFile(join(process.env.OFFICE_CI_OUTPUT,'build-origin.json'),JSON.stringify({source:'same-run digest-verified Pages artifact',runId:process.env.GITHUB_RUN_ID,head:process.env.GITHUB_SHA})+'\n');
JS
else
  stage assets npm run assets
  stage build npm run build
fi
stage trace-worker node scripts/build-office-ci-trace.mjs "$OFFICE_CI_OUTPUT/native-trace.worker.js"
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort > "$OFFICE_CI_OUTPUT/preview.log" 2>&1 &
preview_pid=$!
stage preview-ready node --input-type=module <<'JS'
import {setTimeout} from 'node:timers/promises';
for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:4173/',{signal:AbortSignal.timeout(1000)})).ok)process.exit(0);}catch{}await setTimeout(1000);}
throw Error('Office preview did not become available');
JS
export OFFICE_CI_TRACE_WORKER="$OFFICE_CI_OUTPUT/native-trace.worker.js"
stage capture timeout --signal=TERM --kill-after=15s 1860s node scripts/capture-office-ci.mjs "$OFFICE_CI_OUTPUT/capture"
if [[ "${OFFICE_CI_SCENE:-office-loop}" == office-loop-two-circuit ]]; then
  # Phase B job 1: the flight envelope and lap returns are checked on the captured truth before anything else.
  # A refusal exits nonzero and stops the job; there is no second capture.
  mkdir "$OFFICE_CI_OUTPUT/flight"
  stage flight-envelope node scripts/office-phase-b-checks.mjs envelope --capture "$OFFICE_CI_OUTPUT/capture" --route two-circuit --out "$OFFICE_CI_OUTPUT/flight/envelope"
  stage flight-return node scripts/office-phase-b-checks.mjs return --capture "$OFFICE_CI_OUTPUT/capture" --route two-circuit --out "$OFFICE_CI_OUTPUT/flight/return"
else
  stage pairs node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 4096 --available-mib 512 --log "$OFFICE_CI_OUTPUT/pair-extraction.log" -- node scripts/extract-office-loop-pairs.mjs "$OFFICE_CI_OUTPUT/capture" "$OFFICE_CI_OUTPUT/pairs"
  stage consensus node dev/rumoca-bounded-run.mjs --seconds 300 --rss-mib 2048 --available-mib 512 --log "$OFFICE_CI_OUTPUT/consensus.log" -- node scripts/run-office-consensus.mjs "$OFFICE_CI_OUTPUT/pairs" "$OFFICE_CI_OUTPUT/consensus"
fi
stage seal node scripts/verify-office-ci-artifacts.mjs "$OFFICE_CI_OUTPUT"
export OFFICE_CI_STAGE=complete
