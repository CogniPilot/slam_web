#!/usr/bin/env bash
set -euo pipefail
node --test scripts/rgbd-registration.test.mjs
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/evaluate-slam-comparison.test.py
