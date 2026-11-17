#!/usr/bin/env bash
set -euo pipefail
node --test scripts/rgbd-registration.test.mjs
node --test scripts/prepare-slam-comparison.test.mjs
node --test scripts/environment-scale-scenes.test.mjs
node --test scripts/hardware-browser.test.mjs
node --test scripts/browser-launch.test.mjs
node --test scripts/browser-launch-playwright.test.mjs
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/evaluate-slam-comparison.test.py
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/evaluate-modelica-worker.test.py
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/audit-native-graph-edges.test.py
"${SLAM_COMPARISON_PYTHON:-python3}" scripts/run-rtabmap-comparison.test.py
