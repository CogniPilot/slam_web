# Rumoca CI WASM qualification, 2026-10-07

The PR #382 CI package substantially reduces the time spent advancing the actual
Modelica quadrotor, but it is **not accepted for the application**. The current
SLAM source still fails native issuance, and the strict full-plant comparison
finds signed-zero differences. The live compiler remains 0.10.0/e1e7783f1fb4.

## Immutable package and source identity

Downloaded only `wasm-package` from
[workflow 37596624531](https://github.com/CogniPilot/rumoca/actions/runs/37596624531),
artifact 11471883423. Its matching `release-full-web` JS/WASM pair lives under
`$HOME/scratch/slam_web/downloads/rumoca-ci-37596624531`.
The compiler reports 0.10.2/ca6f4019adb8. GitHub confirms that this is the merge
of PR head f2b85462d2f348b167590c18f485ef4c9d741cd6 into main c14e08281ce5788ca49e4dd4b5bf27781280a3fb.
WASM SHA256 is
`e0b912583e08af2f6945a232b98c489bd1cc63387a4a9fb1610e2af32deb9fa2`;
JS SHA256 is
`4c3d0e9c5eda733c36ae48034edb45fe403697ece3a3e30ee497c7672c4eba97`.
Build WASM succeeded. At inspection, Lint failed and the workflow was still
running. A build success is not an assertion that CI is green.

No external compiler checkout, dependency pin, public asset, production
numerical model or application execution path changed in this campaign.
Large downloads, builds and raw profiles remain in scratch.

## Native SLAM issuance

An actual Chromium dedicated worker calls Rumoca's `prepare_native_program`
on `RGBDFastSLAMReset`, using the current 59-file source
SHA 865e41108e8f62cbca2c482499d8a3751c67676553924c2fd6d9224b46c4e119.
It refuses in ToDae after 2.024 s:

> unsupported Flat semantic owner `function assignment target`

The diagnostic says a mutable function value must resolve to one value or one
exact record field. No executable was issued, so no consumer ABI or numerical
acceptance follows. This is consistent with response 27's nested-record fixes
being local and unpushed; it does not invalidate those local results.
See [issuance receipt](artifacts/rumoca-ci-37596624531/slam-reset.json).

## Unchanged full-plant comparison

The same dedicated worker runs baseline/candidate/candidate/baseline over the
unchanged `LabQuadrotor.mo`, with the same solver/tolerances and held commands.
Each run has930 camera frames and1860 physics endpoints. The recorded
clock configuration is camera60 Hz, LiDAR20 Hz, IMU90 Hz and GPS10 Hz; this isolated
test generates no sensor images or LiDAR. All269 visible fields are compared
at1860 endpoints:500,340 cells.

The original comparison assumed both packages exposed
`withInteractiveConfiguration`. The0.10.0 baseline does not. The harness now
uses its public `withInteractiveOptions` default and records that constructor;
the candidate uses explicit `auto` or `interpreter`. The initial harness failure
is retained in scratch, together with the subsequent strict signed-zero failure.

With the candidate's automatic policy, mean advance time was3.213 ms per camera
frame for the baseline and0.348 ms for the candidate, a9.24× ratio **for advancing
physics only**. This is a diagnostic observation, not accepted performance:
there are256 signed-zero differences, no differences above the2e-9 scaled
numerical tolerance, and a maximum scaled numerical difference of 4.55e-13.
The affected observations include `vehicle.gravity_b[2]` and `orientation[1,2]`.

With explicit interpreter policy, the candidate has exactly the same 256
signed-zero differences and otherwise zero numerical difference. A second
actual-browser probe confirms the sign changes through both scalar `get` and
`state_json` on the unchanged plant; this rules out a serializer-only change.
A small dot-product/atan2 control agrees across packages and policies, so it
is retained as a negative control, not presented as a minimal bug reproducer.
There is no observed heading/roll difference in these plant samples. Whether
the changed signs represent an intended canonicalization or a compiler defect
still needs compiler-owner review; the app does not silently relax the gate.

Receipts:
[automatic policy](artifacts/rumoca-ci-37596624531/physics-diagnostic/report.json),
[interpreter policy](artifacts/rumoca-ci-37596624531/physics-interpreter/report.json),
[scalar/snapshot and dot-product control](artifacts/rumoca-ci-37596624531/zero-dot-product-plant-qualified.json).
The updated comparison records all mismatch counts, a bounded sample of values
with explicit signed-zero strings, and failure reports for constructor/worker
errors. Failed parity never receives a passing status or zero exit code.

## Profiling the candidate

A separate900-frame/1800-endpoint run uses CDP worker sampling plus Linux perf.
Observed wall time per endpoint is0.173 ms for `advance_to`,0.214 ms for
`state_json`,0.109 ms for snapshot parsing/extraction and0.054 ms for `set_inputs`.
The complete measured loop is1.111 ms per camera frame. These instrumented
values include scheduling/timer effects and are not a whole-app benchmark.

CDP records846 samples, including execution inside four generated WASM module
URLs as well as the compiler/runtime module. Their URLs are sampling identities,
not verified native artifact inventories. The stripped compiler functions
cannot be assigned to named projection/linear-solver owners; zero named-group
counts do not prove those paths are absent. Perf has867 cycle samples and zero
lost samples. Its full-process scope includes preparation and browser JIT work,
so the background compiler-thread share is not a steady-state CPU-load result.

Snapshot creation plus extraction now exceeds advance time. A reusable checked
selection/batch observation API is therefore an actionable follow-up in Rumoca;
this package still lacks `values_for`. Typed native image ingress and complete
State issuance remain higher priorities for getting visual SLAM running.

Raw CPU profiles, perf traces, complete logs and the paired package are under
`$HOME/scratch/slam_web/profiles/rumoca-ci-37596624531` and the download directory
above. The [consolidated review](artifacts/rumoca-ci-37596624531/review.json)
binds durable receipts and source identities. Jobs run sequentially, with
nice 15, two CPU cores, bounded RSS and a16 GiB host memory reserve.

These results establish neither browser visual SLAM nor10× full-simulation
throughput. The next integration input is a paired browser compiler package
containing the local nested-record, typed-register and compact-kernel fixes.
