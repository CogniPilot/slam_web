# Matched compiler canary

The final `06617147…` source freeze has a new fixed-20 run recorded in
[the private-arena canary evidence](../dev/rumoca-private-arena-msl-canary-verification.json).
All 20 outcomes and diagnostics match both preserved baselines. Eleven models
compile, nine complete simulation and agree with OMC across 175 channels, and
the same nine ToDae and two Solve refusals remain. All nine emitted trace files
are byte-identical to the original baseline. The common comparator reports no
outcome, band or channel-coverage regressions.

Cargo JSON selected and verified all five executables against the final source.
Their hashes are unchanged from `a5a1bf42…`: the 27 added or changed files are
all in `rumoca-exec-wasm`, which is absent from this canonical MSL feature union.
Consequently, this canary does not exercise pooled browser arenas or the new
typed-view WASM emission. Those have separate
[actual browser evidence](../dev/rumoca-private-arena-browser-verification.json).

The single attempt retained the 10-second phase, 12-second solver and 14-second
simulation-parent limits, with four requested/environment workers and two
effective compile workers. The root-assigned affinity was CPU 6/7 with nice 15;
the earlier run used CPU 10/11 with nice 10. All source, binary, target, corpus
and OMC identities passed before/after checks. The run exited zero in 32.485
seconds with peak RSS 2,716,764 KiB; its focused quality ratchet was skipped.
These shared-host resources are not a performance comparison.

Current cached OMC reuse leaves state-selection comparison unmeasured because
the fresh results directory lacks the cached models' initialization XML files.
The historical state-set/count comparison below remains separate; it is not
silently carried into the new report. No model or OMC attempt was retried.
Full MSL, production-pin qualification, full SLAM and the 10× target remain
outside this partial canary evidence.

## Preserved A5A matched run

The fixed 20-model canary now has a measured, matched delta from the frozen
`ebbaa651…` compiler to frozen `a5a1bf42…`. All 20 model outcomes and diagnostics
are unchanged. Both sides compile 11 models, complete nine simulations, refuse
nine models at ToDae and refuse two during Solve. The canonical common-tool
comparison reports no phase, simulation or high-band gains or regressions, no
lost compared models and no lost channel coverage.

The nine completed models remain in the high band across 175 channels, with
zero bad or severe channels. Their times, channel names, numerical data and
variable metadata match the baseline exactly. Exact state-set agreement with
OMC is eight of nine, while all nine state counts agree; numerical agreement
does not erase that representation difference. The 11 unsuccessful models
remain visible in the [matched verification record](../dev/rumoca-matched-msl-canary-verification.json)
and [canonical transition report](../dev/artifacts/msl-canary-matched/transitions.md).

The candidate used freshly built MSL executables selected from Cargo JSON and
a matching xtask, all copied and hashed before execution. Its source manifest
contains 2,404 files and was identical before and after the build. The later
tensor-view patch is outside this binary freeze and outside this canary result.
The same fixed targets, MSL source files, OMC executable, phase budgets, CPU
affinity and worker policy were checked on both sides. The baseline comparator
replayed the candidate's copied results using nine valid cached OMC references;
it ran no new OMC batch or Rumoca model attempt.

The candidate workflow exited successfully after 37.546 seconds with peak RSS
3,489,308 KiB. Its full quality ratchet explicitly skipped this focused partial
scope, so exit zero is not a full quality-gate pass. The common comparator replay
took 1.928 seconds with peak RSS 24,312 KiB. These are guarded workflow resources,
not an attributed compiler or website speedup. External heavy builds and desktop
applications were observed and left untouched.

This delta covers the complete change set between the two named freezes. It
does not establish full MSL parity, Tier 2 capability completion, or a gain from
any single compiler change. The checked-in 566-model snapshot remains a ratchet
input, not the matched cohort. No snapshot was promoted or production pin
changed; full SLAM and the 10× target remain pending.

The original baseline attempt and its comparator-only continuation are preserved
below. Their original infrastructure failure is not retroactively changed by
the successful candidate workflow.

The single Rumoca attempt compiled 11 models and wrote nine simulation traces.
Nine models failed at ToDae; two compiled models refused during Solve evaluation.
There were no simulation timeouts or nonfinite completions. The initial quality
gate exited with failure because the CI shell did not provide `omc`; its
unmeasured snapshot remains unchanged.

A separate continuation added the existing pinned OMC executable to PATH and
compared the nine original traces. It reran no Rumoca model phase or solver.
The canonical partial band table covers all 20 selected models: nine high-band
comparisons, nine absent because simulation was not reached, and two absent
because simulation failed. The nine comparisons contain 175 channels, with zero
bad or severe channels, missing traces, skipped models or exclusions. All nine
original trace files and the original model-results JSON remain byte-identical.
The partial band-table writer and checker both passed.

Both runs use immutable executables built against the restored `ebbaa651…`
compiler source closure. The four MSL executables came from exact Cargo JSON
artifact paths, and xtask was rebuilt against the same source. The fixed target
list is unchanged. Per-phase attempts retain 10 seconds, the solver 12 seconds,
and the simulation parent watchdog 14 seconds. Environment worker settings and
requested stage/simulation workers are four; the harness explicitly capped
compile workers at two for the CPU 10/11 affinity. The 600-second outer guard
retains an 8 GiB RSS ceiling and 16 GiB host reserve.

The 11 failures remain visible in the
[per-model verification record](../dev/rumoca-compact-msl-canary-verification.json).
They include nested function return, impure-call context, unresolved enum
references, discrete coordinate/SSA construction, partial function application,
and balance refusals. The two Solve refusals are the structurally singular
`OpAmpCircuits.Add` and an unsupported affine derivative coefficient in
`TransformerYD`. These are recorded failures, not silently excluded models or
closed bug classifications.

The original gate took 57.990 seconds and peaked at 2,719,616 KiB RSS. The
comparator-only continuation took 27.742 seconds and peaked at 1,765,416 KiB.
These are guarded workflow resources, not compiler or website speedup claims.
The initial unsupported 1,800-second guardian request failed before spawning
any model attempt and is also retained.

The checked-in 566-model snapshot was pinned as the existing ratchet input; it
is not a matched 20-model baseline. The new delta uses this preserved measured
20-model run and the separately frozen candidate described above. It uses a
common fail-closed comparator with matching corpus, OMC, phase budgets,
resources and affinity. No snapshot was promoted, production pin changed, or
full-SLAM/10× claim made.
