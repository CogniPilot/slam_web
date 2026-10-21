#!/usr/bin/env bash
set -euo pipefail
node --test scripts/rgbd-registration.test.mjs
node --test scripts/prepare-slam-comparison.test.mjs
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/evaluate-slam-comparison.test.py
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/evaluate-modelica-worker.test.py
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/audit-native-graph-edges.test.py
