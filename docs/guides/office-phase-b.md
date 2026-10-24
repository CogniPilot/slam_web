# Office Phase B: look-alike rejection after recovery

Phase B asks whether loop-anchored capture still refuses look-alike corridors
after it has recovered at the start corner. It flies the office rectangle twice
in 250 s, so the second lap is flown after the recovery at about 125 s. The
pass, fail and inconclusive rules, the windows and the blind labelling are fixed
in the reviewed Phase B contract before any capture. A pass would hold only for
this build's catalog at double speed, not for a build that fixes the catalog
freeze or for the original speed.

It runs as three separate dispatches of `pages.yml`, each with
`office_loop_diagnostic=true`, `office_phase_b_job` set to the job, and
`office_phase_b_head` set to the frozen branch head. Every job refuses to run on
any other commit, and it refuses saved replay or candidate comparison. Phase B
never deploys.

## Freeze the head first

The saved replay accepts a capture only when it replays on the commit that made
it. Freeze one branch head before job 1 and run all three jobs on it. A source
change after job 1 leaves the capture unreplayable under this contract, so no
fix or recapture can be slipped between the jobs.

## Job 1: `capture`

Captures the `office-loop-two-circuit` scene in software WebGL at 424x240. Its
plant swaps the same four mission references as the reviewed two-circuit
physics preflight; a test binds it to the source that preflight simulated. The
Phase B checks are tested before acquisition. After capture, the flight
envelope and both lap returns are checked on the captured truth; a refusal
stops the job. The capture is sealed only when both pass. The capture's
recorded baseline outputs are baseline pass 1. There is one capture.

## Job 2: `pass1`

Takes `office_phase_b_pin`, the job-1 capture pin, and its sha256 in
`office_phase_b_pin_sha256`. The pin names the job-1 run, head, artifact,
archive digest, seal-manifest sha256, sealed file count and Chromium version,
with `experiment: phase-b-baseline-pass-2` and `snapshotPlanSha256: null`.
The job builds the pinned exporter and the reviewed candidate exactly as the
Phase A comparison does, verifies the restored capture, and recomputes the
boundary B from the capture's baseline outputs. The candidate must reproduce the
baseline outputs exactly before B; D, the first frame where they differ, must
not precede B. The job then writes the snapshot plan.

## Job 3: `pass2`

Takes the job-1 pin again, now with `snapshotPlanSha256` set to the sha256 of
job 2's `plan/plan-receipt.json`, and `office_phase_b_second_grant` with its
sha256, carrying the job-2 candidate pin: job 2's run, head, artifact, archive digest, seal, file count and
candidate manifest, with `experiment: phase-b-candidate-pass-1`. It has no
capture, compiler or export stage. It replays the capture through the saved
baseline replay with snapshots at the plan's epochs, which must match the
captured outputs exactly; this is baseline pass 2 and the cross-runner check.
It then runs job 2's exact candidate assets on that replay root, and requires
pass 1 and pass 2 to be identical on all 1251 frames before any snapshot counts.

Any failure from the baseline replay on is an infrastructure stop, not a
result; job 3 may be dispatched once more, because it acquires nothing. Earlier
failures, such as a mistyped grant, are pre-run refusals.

Repeat a job only as a new dispatch, never with GitHub's re-run. The artifact
name carries the run attempt, and every pin requires attempt 1.

## The one admitted job-1 exception

The original job-1 capture recorded `{stage: seal, exitCode: 1}`: the CI
artifact verifier threw on its final diagnostic line after writing the seal
manifest. Its bytes and status are never edited. A separately reviewed,
read-only check, `scripts/admit-phase-b-capture.mjs`, run on the exact
original zip (its granted digest, size, run, attempt 1 and the capture head),
confirms that the artifact's inventory equals its seal manifest apart from
`pipeline-status.json` and `seal.log`, that every sealed hash matches, that the
status is exactly seal/1 and `seal.log`'s only error is that ReferenceError at
line 54, and that the repaired verifier and both flight checks regenerate the
archived summary, seal manifest and flight receipts byte for byte. It writes
an admission receipt.

Job 2 then takes that receipt as `office_phase_b_second_grant`; its capture
loader accepts seal/1 only with a granted receipt bound to the same archive and
seal, and the existing complete/0 rule stands otherwise. Jobs 2 and 3 may run
on a successor of the capture commit only if `git diff` from it touches just
the exact paths listed in `scripts/office-phase-b-admission.mjs`, and
`package.json` only in its `test:office-ci` line. The replay and comparison
bundles, drivers, contracts, run scripts and `src/` are not on that list, so
everything they read stays byte-identical to the capture commit.

## Grants and blindness

Each pin is passed as exact JSON bytes and its granted sha256, which is the
sha256 of exactly those input bytes with no trailing newline. The workflow
writes the bytes to a file and refuses a hash mismatch; every loader checks the
hash again and refuses unknown or missing fields. Plans, boundaries, recovery
events and decoded state in these artifacts name loop evidence, so they stay
with the coordinator and are not posted until the blind labels are sealed.
Blindness is procedural, not enforced by file permissions.

Each Phase B step has an explicit deadline, and each job's cap is its worst
case: setup, its run step and a 15-minute upload, so the one-shot capture always
reaches the upload. The capture job is capped at 90 minutes, pass 1 at 105 and
pass 2 at 92. Each Phase B dispatch has its own concurrency group, so no other
run can cancel it.
