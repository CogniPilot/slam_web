# Local research evidence

This directory holds generated numerical receipts, compiler snapshots and
historical profiling summaries. Bulk artifacts are ignored by Git and are not
needed to build or use the website. Existing local evidence is retained.

Four small, immutable historical files are committed because the ordinary
unit suite uses them to verify saved-project compatibility and numerical
equivalence. Keep those original bytes unchanged:

- `modelica-owned-vocabulary-source/source-manifest.json`
- `modelica-raw-image-inputs/native-source-2026-10-07/source-manifest.json`
- `modelica-raw-image-inputs/native-source-2026-10-07/source.mo`
- `modelica-harris-nms-native-refactor/preimages/HarrisNativeFrame.mo`

Optional compiler probes can generate or consume additional local evidence.
Their absence must not be interpreted as passing full browser SLAM. Store
large builds, raw profiling traces and disposable captures under the HOME-derived
scratch directories described in the main README.
