The browser source gate can sample the actual dedicated Rumoca compiler worker
through Chrome's [Target](https://chromedevtools.github.io/devtools-protocol/tot/Target/)
and [Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)
protocols. This diagnoses compilation, including compiler initialization. It
does not measure sensor/SLAM runtime throughput or establish numerical acceptance.

Set `RUMOCA_BROWSER_PROFILE` to a fresh JSON path under
`$HOME/scratch/slam_web/profiles/`, then run
`dev/issue-native-program-browser.mjs` under the existing resource guardian.
Keep the original source, model, 60-second browser timeout and resource limits.
Use fresh artifact/report paths as well. Profiling changes execution overhead;
label that attempt diagnostic and retain the ordinary unprofiled source gate.

The probe samples the dedicated worker at a 5 ms interval and stops the profiler
before closing the owned browser, including after an issuance timeout. Failure
reports retain the compiler identity received before compilation starts. A
protocol failure produces a `WORKER_CPU_PROFILE_FAILED` receipt, not an empty
successful profile. No artifact means zero numerical cases.

Aggregate call-tree nodes by function before drawing conclusions:

```sh
node dev/summarize-browser-cpu-profile.mjs \
  "$HOME/scratch/slam_web/profiles/example/worker.json" \
  "$HOME/scratch/slam_web/profiles/example/self-summary.json"
```

Release WASM without a name or debug section gives `wasm-function[index]` labels.
These identify functions only in that exact module, bound by SHA-256. They do not
identify a Rust routine. Request a symbolized compiler build or a native profile
of the same frozen source from the compiler owner before naming the slow phase.
Raw profiles remain in scratch; source manifests, module identity, summaries and
bounded command receipts belong in `dev/artifacts/`.
