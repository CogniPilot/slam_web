#!/usr/bin/env bash
# Build and compare inside CI. No supplied native bytes or external release.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ $# != 1 || "${GITHUB_ACTIONS:-}" != true || "${GITHUB_REPOSITORY:-}" != CogniPilot/slam_web ]]; then
  echo 'Usage: reviewed CI run-office-comparison.sh NEW_OUTPUT' >&2; exit 2
fi
export OFFICE_COMPARE_OUTPUT="$1"
mkdir "$OFFICE_COMPARE_OUTPUT"
comparison_work=$(mktemp -d "$HOME/scratch/slam_web/tmp/office-comparison-XXXXXXXX")
export OFFICE_COMPARE_STAGE=setup
finish() {
  local result=$?
  trap - EXIT
  OFFICE_COMPARE_EXIT="$result" node --input-type=module <<'JS'
import{writeFile}from'node:fs/promises';import{join}from'node:path';
await writeFile(join(process.env.OFFICE_COMPARE_OUTPUT,'pipeline-status.json'),JSON.stringify({stage:process.env.OFFICE_COMPARE_STAGE,exitCode:Number(process.env.OFFICE_COMPARE_EXIT),scope:'Candidate comparison collection; inspect prefix, native parity and late-edge/correction evidence before acceptance.'},null,2)+'\n');
JS
  exit "$result"
}
trap finish EXIT
stage() { export OFFICE_COMPARE_STAGE="$1"; shift; "$@" 2>&1 | tee "$OFFICE_COMPARE_OUTPUT/$OFFICE_COMPARE_STAGE.log"; }
stage dependencies npm ci
stage controls node --test scripts/office-compare-contract.test.mjs scripts/office-replay.test.mjs scripts/office-native-observation.test.mjs
stage restore node scripts/restore-office-comparison-input.mjs "$OFFICE_COMPARE_OUTPUT/input" "$comparison_work/qualified-baseline.zip"
qualified="$OFFICE_COMPARE_OUTPUT/input/qualified"
capture="$qualified/input/original/capture"
stage canonical node scripts/prepare-office-canonical.mjs models/Libraries/CogniPilot "$comparison_work/canonical"
stage snapshot python3 "$comparison_work/canonical/tools/slam/export_legacy_sources.py" --repository "$comparison_work/canonical" --revision 34c26cb4b3ad6f16a072582115acc68d35178d1f --output "$OFFICE_COMPARE_OUTPUT/candidate-source"
export OFFICE_NATIVE_BUILD_WORK="$comparison_work/compiler"
export OFFICE_NATIVE_BUILD_RECEIPTS="$OFFICE_COMPARE_OUTPUT/compiler"
stage compiler env GH_TOKEN= OFFICE_REPLAY_ARTIFACT_TOKEN= nix-shell scripts/office-native-build-env.nix --run '
  node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 4096 --available-mib 512 \
    --cache-dir "$OFFICE_NATIVE_BUILD_WORK" --cache-mib 6144 \
    --log "$OFFICE_NATIVE_BUILD_RECEIPTS-resource.log" -- \
    node scripts/build-office-native-step.mjs "$OFFICE_NATIVE_BUILD_WORK" "$OFFICE_NATIVE_BUILD_RECEIPTS"
'
binary="$OFFICE_COMPARE_OUTPUT/compiler/native_step"
binary_sha=$(node --input-type=module -e 'import{readFile}from"node:fs/promises";const p=JSON.parse(await readFile(process.argv[1]));if(p.status!=="built-unqualified")process.exit(1);console.log(p.binarySha256)' "$OFFICE_COMPARE_OUTPUT/compiler/provenance.json")
reset_file=$(node --input-type=module -e 'import{readFile}from"node:fs/promises";import{join}from"node:path";const m=JSON.parse(await readFile(process.argv[1]));console.log(join(process.argv[2],m.profiles["424x240"].models.initialize.files.state_init.file))' "$capture/native-manifest.json" dist/vendor/slam)
stage reset node --input-type=module -e 'import{readFile,writeFile}from"node:fs/promises";import{gunzipSync}from"node:zlib";import{createHash}from"node:crypto";const b=gunzipSync(await readFile(process.argv[1]));if(b.length!==11873144||createHash("sha256").update(b).digest("hex")!=="6e614cc25574c99a4c9659184c974b813f95fb954ff81399499a5a0ead6be4b1")throw Error("Reset identity differs");await writeFile(process.argv[2],b,{flag:"wx"});' "$reset_file" "$OFFICE_COMPARE_OUTPUT/state-init.bin"
export_native() {
  node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 3072 --available-mib 512 --log "$OFFICE_COMPARE_OUTPUT/$1-resource.log" -- \
    node scripts/export-slam-profiles.mjs --binary "$binary" --reset-bin "$OFFICE_COMPARE_OUTPUT/state-init.bin" --state-hash fd47d214c702c25b \
    --source-root "$2" --output "$OFFICE_COMPARE_OUTPUT/$1" --resolution 424x240 --revision 278475ff0d39f648f7b98c76abdc4da9a712ee62 --private-bytes 134217728
}
stage baseline-export export_native baseline-export "$PWD"
stage baseline-parity node dev/rumoca-bounded-run.mjs --seconds 60 --rss-mib 2048 --available-mib 512 --log "$OFFICE_COMPARE_OUTPUT/baseline-parity-resource.log" -- \
  node scripts/check-office-baseline-export.mjs "$OFFICE_COMPARE_OUTPUT/baseline-export" "$capture/native-manifest.json" "$binary_sha" "$OFFICE_COMPARE_OUTPUT/baseline-parity"
stage candidate-export export_native candidate-export "$OFFICE_COMPARE_OUTPUT/candidate-source"
stage candidate-identity node scripts/check-office-candidate-export.mjs "$OFFICE_COMPARE_OUTPUT/candidate-export" "$OFFICE_COMPARE_OUTPUT/compiler/provenance.json" "$OFFICE_COMPARE_OUTPUT/baseline-parity/receipt.json" scripts/office-candidate.json "$OFFICE_COMPARE_OUTPUT/candidate-identity"
stage static-compiler node scripts/assets.mjs
stage candidate-assets node dev/rumoca-bounded-run.mjs --seconds 60 --rss-mib 2048 --available-mib 512 --log "$OFFICE_COMPARE_OUTPUT/candidate-assets-resource.log" -- \
  node scripts/slam-native-assets.mjs --exports "$OFFICE_COMPARE_OUTPUT/candidate-export" --source-root "$OFFICE_COMPARE_OUTPUT/candidate-source" --destination "$OFFICE_COMPARE_OUTPUT/candidate-assets" --require
stage bundle node scripts/build-office-compare.mjs "$OFFICE_COMPARE_OUTPUT/comparison.js"
stage comparison node dev/rumoca-bounded-run.mjs --seconds 600 --rss-mib 3072 --available-mib 512 --log "$OFFICE_COMPARE_OUTPUT/comparison-resource.log" -- \
  node scripts/compare-office-browser.mjs "$qualified" "$OFFICE_COMPARE_OUTPUT/candidate-assets" "$OFFICE_COMPARE_OUTPUT/comparison" "$OFFICE_COMPARE_OUTPUT/comparison.js" scripts/office-candidate.json
stage seal node scripts/seal-office-comparison.mjs "$OFFICE_COMPARE_OUTPUT"
export OFFICE_COMPARE_STAGE=complete
