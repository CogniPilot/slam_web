#!/usr/bin/env bash
# Run inside `nix develop`; CI uses this same pinned environment and command.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
npm ci
npm run assets
npm test
npm run build
npm run test:browser
