# Canonical assignment certificate analysis

The compiler branch now reuses canonical prefix analysis while validating rows
from one immutable source program. Each output and target still uses the original
shape constructor. A source or store-position change replaces the cached
analysis; only one prefix remains resident. Compact output metadata preserves
the original zero-stride and overflow-filter behavior. If its optional ordinal
index overflows, the original single-query derivation remains authoritative.
Source-output checks and diagnostic order remain unchanged.

This addresses repeated construction work identified by reading the owner after
the full 14,400-pixel depth probe timed out. Its earlier 905-sample profile contains
dependency evaluation and register/set publication beneath assignment derivation.
The profile does not itself prove how many repeated constructor calls occurred.

Six new differential controls and all 415 IR tests pass. The full-array control
requests every output and confirms one prefix analysis. Source changes, overwritten
registers, invalid dependencies, ordinal overflow, and first diagnostics are
checked against the unchanged owner. Strict checks, formatting, and whitespace
checks also pass. The initial two-CPU build reached its 600-second limit before
tests ran; a four-CPU continuation reused completed build outputs. A subsequent
Clippy failure was corrected using equivalent checked division, then all IR tests
and strict checks passed again. These failed attempts remain in the evidence.

This is a generic compiler optimization, with no change to Modelica image sizes,
numerical operations, public ABI, or production package pin. Full-frame native
issuance and numerical execution have not yet been demonstrated for this change.
The next source gate will include the target-value and call-table ownership work,
so its results must identify that combined compiler state. A matched fixed-20 MSL
delta and actual browser integration remain pending. Unit analysis reuse is not
an end-to-end speedup or complete SLAM claim.

[Verification and preserved evidence](../dev/rumoca-canonical-prefix-cache-verification.json)
record the source and patch hashes, completed checks, failures, and remaining gates.
