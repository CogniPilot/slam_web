#!/usr/bin/env bash
# Run inside `nix develop`; CI uses this same pinned environment and command.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
case "${1:-}" in
  '') browser=true ;;
  --build-only) browser=false ;;
  *) echo "Usage: scripts/verify.sh [--build-only]" >&2; exit 2 ;;
esac
if (( $# > 1 )); then echo "Unexpected extra arguments" >&2; exit 2; fi
npm ci
npm run assets
npm test
npm run build
if "$browser"; then npm run test:browser; fi
