# Remaining full-frame Modelica compiler requests

The initial read-only review on 2026-10-05 checked current source hashes against retained evidence. A subsequent unchanged-source depth probe and actual profile are now recorded below. Neither review nor probe changed compiler or Modelica source. The findings distinguish language-construction refusals from preparation timeouts; neither is a new native acceptance result.

## Feature selection: checked counter bounds and ordered While ownership

The [standalone arithmetic prerequisite](feature-selection-progress-arithmetic-verification.json)
now passes four controls, including literal-While differential checks, empty
and negative-start intervals, and final-increment overflow. The helper remains
unwired. Its 160×90 visit bound assumes separately proved positive immutable
steps; it supplies no source guard, counter or selector-admission certificate.
The exact first source-analysis gap is branch-local guarded conversion facts,
followed by nested raster progress and ordinary While ownership.

The [three staged guarded-conversion patches](rumoca-guarded-conversion-review-verification.json)
now pass an independent sequential application check on exact source copies.
They wire a private reaching-definition flow into assignment bounds, install
exact FunctionParam lexical endpoint bindings, and release old invalidation
only for a proved single top-level scalar-local definition with both RHS arms
bounded. Twenty controls remain unexecuted. No main compiler files changed,
and these prerequisites supply no raster/heap While or candidate-counter proof.

Current [FeatureSelection.mo](../models/FeatureSelection.mo) has SHA-256 `be0d24d9b48176b6dad8dc44ce19f1355268a62e5f6ea2fb6c607efd298ecc23`: full 160×90 scores and output capacity 14,400. The [retained final-source gate](modelica-feature-selection-owner-final-verification.json) used immutable producer `4881367e2c25d9a0c7f88f09d09216c2a0201cdd6f9c1e3a9db4594c74fd5799`, source closure `8f719cbb04e631199e01a30d8bf5c7e405ca8ed430c22bd53d01c7867da4c855`. Its unchanged-source attempt refused in ToDae after 46.33 ms:

> `SelectRasterFeatures` requires a compact dependent-domain transition; scalar statement expansion is prohibited

No Solve/native artifact or numerical result followed. The earlier [native review](modelica-feature-selection-native-verification.json) also retains the small `RuntimeCandidateCount` reproducer and producer `27df64656c5c504de5dc181f6ec89664ad597f582105865b9bb65e8cdbe6fd63`.

The current owner is `crates/rumoca-phase-dae/src/construction/analysis/loop_compaction/mod.rs:141–154`: `first_dependent_loop_range` finds a domain without a construction-issued envelope. `construction/function_shapes/integer_bounds/flow.rs:8` deliberately invalidates mutable self/loop-written recurrences; `integer_bounds.rs:119` uses that result. This is missing induction/progress authority, not a proven binder-identity defect. Current `integer_bounds/finite_for.rs:13` handles finite For counters; it does not prove the original nested runtime While raster.

In the original source, `candidateCount` starts at zero, increments conditionally at line 97 inside nested raster While loops, and supplies later For ranges at lines 109, 131 and 159. Generic typed-loop emission cannot alone establish its legal dynamic array indices and finite loop domain.

The requested generic construction fix must prove positive raster spacing, immutable guarded limits, progress on every continuing branch, finite visit count bounded by the source score extent, and point-specific counter bounds with checked arithmetic. It must preserve original header evaluation, lazy branches, tuple/state updates, indexed-store faults and source order. Bounds must survive the conditional increment without guessing from one iteration or publishing an unchecked global fact.

A second obligation is ordinary bounded While ownership. The retained raster-While isolator refused in the special arithmetic-series route at `construction/analysis/function_reductions.rs:10,20` (`validate_integer_reduction` / `validate_while_sum`). That isolator has a different topology from the original. Declining the series optimization alone does not supply a checked ordinary-While owner. Tests must cover nested raster progress, zero/negative spacing, missing progress, mutable limits, overflow and heap sift termination, then the unchanged full selector's ranking, ties, NMS, domain and grid fixtures. No maximum-range rewrite, source-name bypass, reduced capacity or host selection is requested.

## Seeded depth: exact dependency incidence and per-output reuse

Current [SeededDepthFrame.mo](../models/SeededDepthFrame.mo) has SHA-256 `c161609d472a93d1417d97c1424c71fbee57009d3452c4cd18de2db9b5187a4d`. It preserves full 14,400 depth cells and sequential seeded draw consumption: invalid depth draws zero times, dropout once, accepted depth three times.

The historical `depth` section of [portable-target verification](modelica-portable-target-values-verification.json) used producer `1a694546b68dea4d82d2902b3b3d85f9564a405d6a542455cc3de4fcc1f039df`: 60.090 seconds, peak RSS 93,292 KiB, timeout with no Solve/native artifact. Its positive diagnostic proves the original indexed-write certificate fired: `update=162 value=159 carried=4 domain_points=14400 extent=14400`. Possible shared-host CPU overlap is explicitly recorded; this is not isolated throughput evidence.

The [new unchanged-source probe](modelica-seeded-depth-map-profile-verification.json) uses immutable typed-Map producer `f189cd3c6019065db1dab7c45cd4e9dcf7438960fe73b64553cf7581206c2072`, source closure `698314b47a9aa02c52dd28d081d1090f63415e295da4f3c3ebc49bd21b37af09`. It stops at the 180-second watchdog (180.254 seconds measured), peak RSS 101,768 KiB, with no Solve/native artifact. Source and producer identities match before and after. An actual partial `perf` recording has 816 samples, zero lost: `pure_call` 15.20%, `set_register` 12.99%, BTree terminal iteration 8.33%, drop 7.35%, bulk construction 6.99%, dependency union 6.13%. The target watchdog ended the requested 12-second recording after approximately 9.164 seconds; recorder exit 128/SIGTERM is retained, not presented as a completed capture. Caller stacks contain unknown/invalid frames, so identified self symbols are the useful evidence rather than a complete causal chain. This is compiler preparation, not runtime sensor or SLAM throughput.

The earlier [compact-state profile](modelica-small-dependency-verification.json) used producer `b5a9a4964ac6a21388e4da19f7b6fe0fa3a2533506a42912049d74cdea43c807`. Its finalized 25–35-second window had 905 samples, zero lost: `pure_call` 14.70%, `set_register` 11.82%, plus substantial terminal BTree bulk construction/destruction. This establishes a historical IR-Solve structural dependency traversal/materialization frontier, not a language refusal or unsafe native-family coupling diagnosis.

Current `crates/rumoca-ir-solve/src/structural_pattern.rs:2471` (`pure_call`) eagerly unions every scalar of every argument before applying checked per-output summaries; `pure_call_output` starts at line 2508. The narrow generic request is exact dependency reuse across immutable invocation/register versions and checked per-element output summaries. Deferring an unused whole-input union is sound only if every original argument/register/category validation still occurs eagerly in the same order, unknown whole-input summaries retain their full fallback, and summary/index/fault traversal remains unchanged. All five dependency categories and public ordered sets remain authoritative.

Depth RNG state carries dependencies from earlier pixels. Prefix dependencies cannot be dropped, replaced with independent pixels or erased because a measured-depth output selects one index. A useful optimization must share repeated exact requests/materialization while retaining that chain; it must demonstrate benefit on the unchanged original source. The immutable typed-Map producer is now measured above; subsequent live compiler changes remain unmeasured. Reprobe only after a relevant generic fix, then run full-frame numerical seeded-stream/reset/source-binding gates if an artifact is issued. Recent Map/PureCall support alone has not resolved this preparation cost.

Three separate dependency patches have now passed an independent sequential apply check against copies of current compiler sources. The [first review](rumoca-pure-call-dependency-review-verification.json) binds demanded whole-input snapshots and whole-only output reuse. The [follow-up review](rumoca-dependency-followup-review-verification.json) binds the full14,400 coordinate-only validation controls and a private register-Y membership capsule. The capsule retains exact shared dependency states instead of materializing owned sets for its sole membership consumer; missing facts and whole-analysis failures still fail closed. These patches remain scratch-only and uncompiled, with no numerical acceptance or measured preparation gain. Apply and validate them under the existing compiler owner after the camera-slice source freeze, then measure the unchanged depth source.

These requests follow accepted SPEC_0007's explicit loop-carried finite-domain ownership, SPEC_0032's source-preserving compact domains/order, and SPEC_0033's exact-source evidence discipline. SPEC_0036's checked-construction proposal remains draft and is context, not an accepted requirement. Compiler ownership and current build reservations remain unchanged.

## Full-frame FAST: select templates using exact reachable call profiles

The [frozen-producer parity corpus](inactive-call-template-parity-verification.json)
confirms six regressions between the typed-Map producer `f189cd3c…` and the
conditional-template producer `30630f5a…`. The earlier producer prepares all
six tiny models and admits their native schedules. Four candidate cases fail in
ToDae because an inactive template call lacks a checked call-shape certificate.
Cases include valid scalar calls, vectorized actuals, incompatible fixed array
arguments, and one callable with a live three-element input profile and an
inactive two-element profile. Callable reachability alone cannot distinguish
the last case.

The fifth and sixth models contain inactive `edge(inputBoolean)` and
`der(inputReal)` expressions. Their candidates fail when planning/lowering
analyzes expressions absent from the original rows. Exact result shapes alone
cannot certify temporal/state ownership; template eligibility must also retain
the original effect/operator authority or decline such expressions.

The correction needs one constructor-local selected-family view, based on
original family identities and exact call profiles under the shared affine
slice shape authority. Every template-dependent planner and lowerer must use
that selection before publishing expression/event/derived owners. Materialized
families whose template cannot be proved retain their original rows;
non-materialized families require their checked original template. A late
lowering-only fallback would leave inconsistent earlier planning. The
[compiler correction](rumoca-conditional-affine-template-verification.json)
now passes 2,574 affected tests, strict checks and formatting. An independent
[final-producer replay](conditional-template-parity-replay-verification.json)
admits native schedules for all six exact archived regression sources. Full FAST
admission and numerical execution remain separate gates; the public compiler pin
has not changed.

The [one full-frame retry with the final frozen producer](rumoca-fast-native-frame-selected-template-verification.json)
stops at the 8 GiB RSS guard after 252.379 seconds without a native artifact.
The emitted Solve wire is byte-identical to the preceding typed-Map attempt;
the source correction has not compacted this detector. A bounded eight-second
`perf` interval records 727 samples with zero lost and approximately 78.29%
ordered-tree self samples, including caller evidence for `UniqueProgram::new`.
Its callers rebuild unique producer indexes for distinct output prefixes.
Source-scoped reuse must preserve early output validity when later operations
overwrite registers, exact source position filters and fail-closed ambiguity.
Numerical/full-frame execution remains pending, with no runtime throughput gain
established by this preparation profile.

A complementary [unchanged lazy-window inventory](lazy-window-compact-diagnostic-verification.json)
extracts the original 9×10 source from the compiler's 7×7 window test. It prepares
in 62.863 ms with one call owner for all twelve active windows and issues a
54,791-byte native module. This isolates a compact positive case; it does not
execute new numerical cases or replace the full FAST requirement. The full
source's difference must be diagnosed directly rather than assuming every
guarded 7×7 slice requires per-pixel owners.

The [settled-radius fix](rumoca-settled-affine-radius-verification.json) now
passes exact-source DAE ownership: all 180 image families retain one body,
with named Integer constants/parameters checked through their exact settled
declarations. The next unchanged full-source attempt is recorded in
[the terminal derivative-read refusal](rumoca-fast-native-frame-settled-radius-verification.json).
It ends in 148.284 seconds at 4,790,508 KiB RSS with row1120 resolving index
-2 outside extent160; neither Solve output nor a native artifact is issued.
The next owner to diagnose is derivative-read/static index resolution in the
original conditional/binder context. Preserve inactive-branch laziness, active
index faults and the original source; do not substitute literal radii, clamp
indices or claim compact DAE eligibility as executable acceptance.
