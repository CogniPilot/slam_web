# Native typed Map execution

The isolated compiler executes construction-issued finite typed Maps through
the existing native function backend. Domains retain their original binder
order and attained endpoints. Each iteration runs its complete region and packs
one scalar or array result into fresh private output storage. Captures remain
immutable; binder and counter storage are independent. Calls, lazy branches,
dynamic bounds, fault provenance and success-only output publication keep their
canonical contracts.

The [verification record](../dev/rumoca-typed-map-emission-verification.json)
binds 1,901 passing affected tests, one existing ignored test, strict checks
across nine packages and formatting to an unchanged compiler source manifest.
Ten new constructor/Wasmi controls cover Cartesian and descending domains,
extreme endpoints, array results, aliases, nested calls and math imports,
late faults, complete public-Y/P rollback and recovery. A 14,400-value typed Map
preserves raw IEEE bytes; that control is distinct from full-frame FAST.

An actual Modelica source control requires a compiler-issued Map for the
original 22-point adjacent comparison shape. Baseline and edited comparisons
pass 352 independent output checks through the native v3 program. The complete
unchanged FAST frame remains a separate source-admission gate.

Empty Map result shapes are still rejected by the original checked tensor type
constructor. Negative controls retain exact `InvalidMap` spans for empty,
zero-rank, zero-step and overflowing domains. The historical reviewed Map-plus-
Reduce fixture now reaches its original unsupported Reduce; its source and
independent numerical oracle remain unchanged. Reduction, call-body sharing,
assertion-predicate admission and model rewrites are outside this change.

The frozen producer is
`$HOME/scratch/slam_web/tmp/typed-map-gate/final-producer`, SHA256
`f189cd3c6019065db1dab7c45cd4e9dcf7438960fe73b64553cf7581206c2072`.
It binds source closure `698314b4…` (2,436 files). The preceding `cc841585…`
producer and failed full-frame captures remain unchanged. No production pin,
application activation, full SLAM or 10× performance claim follows from these
scoped controls.

The subsequent [unchanged full-frame attempt](../dev/rumoca-fast-native-frame-typed-map-verification.json)
passed assignment certification and stopped at the 8 GiB RSS guard after
258.979 seconds, before any native artifact was issued. Its complete Solve wire
remained byte-identical to the earlier captures. Zero full-frame numerical cases
executed, and the resource stop supplies no exact opcode refusal.
