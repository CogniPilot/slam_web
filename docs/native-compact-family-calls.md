# Native calls inside compact assignment families

The isolated Rumoca backend now certifies primal pure calls inside existing
`Map` and `AffineStencil` assignment families when their complete call inputs
are independent of the family's own targets. This removes a generic admission
restriction encountered by the unchanged 21-state Schmidt filter. The full
filter's preparation and numerical acceptance remain separate gates.

The original failed source capture is retained in the
[family inventory](../dev/artifacts/schmidt-reference-family-inventory/manifest.json).
Its source SHA256 is
`f8fe0faaed21654ce80f440434bf1685a6572dfd74f9e9199507262b9e2f96b1`.
The first unsupported operation was a `PureCall` in Map node 133, operation 27:
`SLAMExactRealEqual(referenceAvailable, 0.0)`. The family iterates over `i = 1:3`;
the call's flag input and constant zero are independent of its three output
targets. Other operands vary across the original domain.

## Certification and execution

The constructor still checks the original complete domain, load bounds, target
coverage, store identity and residual isolator. It records the dependency of
each original Y/P load over that whole domain, then checks the call's complete
argument ranges against those facts. It does not apply the scalar load checker
to the base index of an affine template.

Register-flow validation checks argument/result shapes and available SSA
definitions; the immutable producer inventory separately rejects overlapping
destination versions. Every call argument matters, including unused formals
and cells of tensor inputs. A call that captures its own target remains refused.
All original operations remain in order, including unused calls that can fail.
The affine emitter continues to use no scalar memo.

The binding now detects calls in Map/AffineStencil prefixes as well as scalar
programs, so a Map-only schedule uses the existing linked v3 call ABI. There is
no new numerical emitter, model rewrite, per-coordinate kernel, function-name
whitelist or compiler schema change. Existing unsupported callee, directional
and assertion-predicate restrictions remain.

## Executed evidence

The [verification record](../dev/rumoca-compact-family-primal-calls-verification.json)
and [archived files](../dev/artifacts/compact-family-primal-calls/manifest.json)
bind all final results to source closure
`1f3a82c9c92139993740a7e7dfe497d920fba25c6f69e8b9769ef0c1eef2f75a`
(2,423 Rust/Cargo/toolchain files).

| Gate | Actual scope | Result |
| --- | --- | --- |
| Constructor controls | Eight controls for full-domain bounds/coupling, complete unused arguments, Move dependencies, malformed registers, overlapping SSA and domain overflow | PASS |
| Wasmi execution | Both 14,400-point Map and AffineStencil families, changing P and prior-stage Y, Real/Boolean results, 115,200 canonical output comparisons | PASS |
| Fault and recovery | Late integer conversion in an unused call prefix; exact source fault, immutable inputs, full-Y rollback and subsequent recovery | PASS |
| Actual Modelica source API | Three-element Map-only source, three input frames, edited source, source binding and linked v3 routing | PASS |
| Affected libraries and integrations | Nine libraries plus exact assignment, native array, native program and typed-call suites | 1,880 PASS; one existing ignored |
| Strict checks | Nine packages, all targets/features, Clippy with warnings denied; canonical formatter | PASS |

The final affected gate took 44.865 seconds including compilation, with sampled
owned-process peak RSS 1,182,144 KiB. Strict checks took 8.046 seconds; formatting
took 10.532 seconds. Compiler gates used four build/test/Rayon workers, CPUs 6/7,
nice 15, an 8 GiB RSS guard and 16 GiB host reserve. These timings describe
verification, not application throughput.

The initial missing-provenance fixture, malformed-register expectation,
nonexistent conversion-enum fixture, nesting lint errors and formatting-only
failure are preserved in the record. Their corrections were followed by final
tests, strict checks and formatting on one unchanged source closure.

## Frozen handoff and limits

The binding test producer was selected from actual Cargo JSON, copied to
`$HOME/scratch/slam_web/tmp/compact-family-calls-gate/final-producer`, and verified
with SHA256
`662903fba5e22be694ae1103834a3d9048da11503015a14b197f93ac0bb32952`.
Its Cargo artifact enables `default`, `console_error_panic_hook` and
`native-assignments`; the exact artifact metadata is archived. Compiler source
and Cargo ownership were released after all gates terminated.

The small actual Modelica fixture proves source routing and edits. The
14,400-point controls prove execution against canonical checked tables and
families. Neither substitutes for the unchanged full 21-state source's next
admission, numerical and browser tests. Opt-in full-source tests without their
fixture environment are not counted as full-source acceptance.

FAST `currentScore` has a separate coupled-target recurrence and remains
refused. This change leaves that boundary intact. Production compiler selection
is unchanged; full SLAM and the 10× target remain incomplete.
