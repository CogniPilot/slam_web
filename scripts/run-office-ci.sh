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
# Evaluation only: replace the build's native SLAM with a candidate exported here from OFFICE_CI_CANDIDATE
# (source snapshot + reset state), using an exporter built in this job. The capture then flies the same mission.
if [[ -n "${OFFICE_CI_CANDIDATE:-}" ]]; then
  candidate="$PWD/$OFFICE_CI_CANDIDATE"
  mkdir -p "$HOME/scratch/slam_web/tmp"
  candidate_work=$(mktemp -d "$HOME/scratch/slam_web/tmp/office-candidate-XXXXXXXX")
  export OFFICE_NATIVE_BUILD_WORK="$candidate_work/compiler"
  export OFFICE_NATIVE_BUILD_RECEIPTS="$OFFICE_CI_OUTPUT/compiler"
  stage compiler env GH_TOKEN= nix-shell scripts/office-native-build-env.nix --run '
    node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 4096 --available-mib 512 \
      --cache-dir "$OFFICE_NATIVE_BUILD_WORK" --cache-mib 6144 \
      --log "$OFFICE_NATIVE_BUILD_RECEIPTS-resource.log" -- \
      node scripts/build-office-native-step.mjs "$OFFICE_NATIVE_BUILD_WORK" "$OFFICE_NATIVE_BUILD_RECEIPTS"
  '
  node --input-type=module -e 'import{readFile}from"node:fs/promises";const p=JSON.parse(await readFile(process.argv[1]));if(p.status!=="built-unqualified")process.exit(1);' "$OFFICE_CI_OUTPUT/compiler/provenance.json"
  # Reset state for the candidate layout: the released reset plus zero-initialized arrays, names hash 8ad289e707119f89.
  stage candidate-reset node --input-type=module -e 'import{readFile,writeFile}from"node:fs/promises";import{gunzipSync}from"node:zlib";import{createHash}from"node:crypto";const b=gunzipSync(await readFile(process.argv[1]));if(b.length!==11875192||createHash("sha256").update(b).digest("hex")!=="0911f1e67ff3e457172ff78a430ffe1c95d4a437c4c0529d5f14d6002be48e96")throw Error("Candidate reset identity differs");await writeFile(process.argv[2],b,{flag:"wx"});' "$candidate/state-init.bin.gz" "$OFFICE_CI_OUTPUT/state-init.bin"
  stage candidate-export node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 3072 --available-mib 512 --log "$OFFICE_CI_OUTPUT/candidate-export-resource.log" -- \
    node scripts/export-slam-profiles.mjs --binary "$OFFICE_CI_OUTPUT/compiler/native_step" --reset-bin "$OFFICE_CI_OUTPUT/state-init.bin" --state-hash 8ad289e707119f89 \
    --source-root "$candidate/source" --output "$OFFICE_CI_OUTPUT/candidate-export" --resolution 424x240 --revision 278475ff0d39f648f7b98c76abdc4da9a712ee62 --private-bytes 134217728
  stage static-compiler node scripts/assets.mjs
  stage candidate-assets node dev/rumoca-bounded-run.mjs --seconds 60 --rss-mib 2048 --available-mib 512 --log "$OFFICE_CI_OUTPUT/candidate-assets-resource.log" -- \
    node scripts/slam-native-assets.mjs --exports "$OFFICE_CI_OUTPUT/candidate-export" --source-root "$candidate/source" --destination dist/vendor/slam --require
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
if [[ -n "${OFFICE_CI_CANDIDATE:-}" ]]; then
  # Pair extraction rebuilds its loop kernels from this repository's SLAM source, not the candidate's, and refuses the
  # capture; the evaluation reads the capture itself. Require a complete capture, then seal everything produced.
  stage seal node --input-type=module -e 'import{readFile,readdir,writeFile}from"node:fs/promises";import{createReadStream}from"node:fs";import{join}from"node:path";import{createHash}from"node:crypto";const root=process.argv[1],r=JSON.parse(await readFile(join(root,"capture/receipt.json")));if(!r.complete||r.failure||r.framesCompleted!==1251)throw Error("Office capture incomplete");const skip=new Set(["SHA256SUMS","pipeline-status.json","seal.log"]),files=[];async function visit(d,rel){for(const e of await readdir(d,{withFileTypes:true})){const p=join(d,e.name),q=rel?rel+"/"+e.name:e.name;if(e.isSymbolicLink())throw Error("symlink "+q);if(e.isDirectory())await visit(p,q);else if(!(rel===""&&skip.has(e.name)))files.push(q);}}await visit(root,"");const lines=[];for(const f of files.sort()){const h=createHash("sha256");for await(const c of createReadStream(join(root,f)))h.update(c);lines.push(h.digest("hex")+"  "+f);}await writeFile(join(root,"SHA256SUMS"),lines.join("\n")+"\n");console.log(JSON.stringify({sealedFiles:files.length,frames:r.framesCompleted}));' "$OFFICE_CI_OUTPUT"
else
  stage pairs node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 4096 --available-mib 512 --log "$OFFICE_CI_OUTPUT/pair-extraction.log" -- node scripts/extract-office-loop-pairs.mjs "$OFFICE_CI_OUTPUT/capture" "$OFFICE_CI_OUTPUT/pairs"
  stage consensus node dev/rumoca-bounded-run.mjs --seconds 300 --rss-mib 2048 --available-mib 512 --log "$OFFICE_CI_OUTPUT/consensus.log" -- node scripts/run-office-consensus.mjs "$OFFICE_CI_OUTPUT/pairs" "$OFFICE_CI_OUTPUT/consensus"
  stage seal node scripts/verify-office-ci-artifacts.mjs "$OFFICE_CI_OUTPUT"
fi
export OFFICE_CI_STAGE=complete
