# Native short-copy experiment

The generic short-copy emission patch was **reverted because browser benefit
was not confirmed**. Its correctness controls passed, but two unchanged-artifact
Chromium comparisons moved in opposite directions. The production compiler pin
and preview were never changed.

Each comparison executes the complete, unchanged 14,400-point Modelica rigid
registration schedule in a dedicated worker, after 100 warm calls per module.
Six alternating blocks per module contain 100 calls each. Both reports retain
every block; no outliers were removed and no further repeat was run.

| Engine/run | Original mean | Candidate mean | Original/candidate |
| --- | ---: | ---: | ---: |
| Node 24 | 8.941 ms | 8.601 ms | 1.040× |
| Chromium, first run | 9.010 ms | 9.499 ms | 0.949× |
| Chromium, one serial repeat | 8.069 ms | 7.809 ms | 1.033× |

These times cover `NativeProgram.evaluate`, excluding input copies, preparation,
feature matching, filtering, sensors and rendering. They establish neither a
website throughput gain nor complete SLAM or the 10× target. The earlier
[post-emission rewrite diagnostic](../dev/registration-small-copy-diagnostic-verification.json)
is separate evidence; its roughly 12% Node improvement cannot be substituted for
this production-emitter browser result.

The candidate used existing root ABI guards to prove bounds for equal 16-, 24-
and 32-byte copies. It loaded all cells into dedicated integer locals before
storing any, preserving overlaps and raw bits. Unproved and larger copies kept
`memory.copy`. Static copy sites fell from 89 to 53, while code size increased
from 71,577 to 73,811 bytes. Scratch remained 1,859,016 bytes. These are static
instruction counts, not measured memory traffic.

Eight added controls and the fixed-four-worker affected gate passed: 1,804 tests,
one ignored, strict Clippy for nine packages, and formatting. Actual source-issued
baseline and residual-threshold edit artifacts passed admission. Seventeen Node
cases preserved every output bit and immutable inputs. Chromium also passed full
non-axis transforms, sparse late-slot masks, nonfinite/refusal cases, recovery,
reset, four raw ABI faults, metadata validation, source binding and JSON reload.
The independently constructed full-domain reflection has best proper-fit RMS
0.26: the original threshold rejects it and the edited threshold accepts it.

The exact reviewed patch was reversed after the repeat. Every entry of the
previous 2,390-file compact-state source manifest matches again; all three added
helper/test files are absent. Previous compact-state controls and strict checks
therefore qualify the restored bytes without another build. Fixed-20 canary
evidence remains pending.

The [durable verification record](../dev/rumoca-small-copy-emitter-verification.json)
links both complete browser reports, Node results, resource guards, candidate
source/binary/artifact hashes, the archived patch and byte-restoration proof.
Candidate artifacts remain archived review evidence and are not selected for
production.
