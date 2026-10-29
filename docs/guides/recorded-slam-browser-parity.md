# Verify the recorded office route in a browser worker

This opt-in job replays the existing 2,501 RGB8/Z16 and IMU observations from
0–500 seconds through the production `ModelicaSlamClient` and Chromium Web
Worker. It compares every pose, quaternion, deterministic diagnostic, loop
proposal and retained graph size exactly with the saved Node result, then
compares the entire final graph. Timing fields are excluded. There is no
interpolation or numerical tolerance. The expected output stays in the Node
evaluator and is never served to the browser.

An exact comparison mismatch is recorded while later frames continue within
the original operation bounds. Every mismatch still makes the final result
fail. `completed` counts processed frames; `matchedFrames` counts exact matches.
`frameMismatches`, `graphMismatch` and the first five mismatch messages accompany
the complete raw observations and final graph. Input, transport, nonfinite-value
or resource failures still stop immediately. This preserves loop-section
evidence when early numerical differences would otherwise truncate the route.

`recorded-slam-parity.json` pins the recording archive, sensor metadata,
production source inventory, published kernel manifest and canonical revision.
The browser receives only hash-checked sensor observations and published
programs. The fixture contains no ground-truth input and collects no new images.

After the fixture asset and reviewed source branch are published:

```sh
gh workflow run pages.yml --ref REVIEWED_BRANCH -f recorded_worker_parity=true
```

Leave the other diagnostic inputs false. This dispatch runs only the recorded
worker job. It cannot deploy the website and does not cancel ordinary site CI.
The namespace sandbox remains enabled; the existing hosted-runner setup permits
user namespaces. GPU execution is disabled for this CPU parity check.

One operation uses two actually allowed CPUs, a 5.5 GiB process-tree RSS stop,
a 1,200-second wall deadline, 64 MiB output/file stops and tracked child cleanup.
Exclusive START records prevent replay into the same result directory. Fixture
preparation separately streams a size/hash-checked archive and validates regular
whitelisted members within a 600-second preparation deadline. All temporary
storage is task-owned under the runner's temporary directory.

Inspect `OPERATION-TERMINAL.json` and `output/RESULT.json` together. A pass
requires all 2,501 frames through 500 seconds, 49 accepted corrections,
19 retired factors, exact scientific-output/final-graph parity and no surviving
tracked processes. Failures retain their partial observations and raw terminal
logs. This does not qualify scene rendering, real camera input, GPU/stress or
browser throughput, or reconcile the canonical branch with newer main changes.
