# Typed-call scalar-local scratch review

A separate scratch-only compiler patch implements the first bounded stage in [the performance proposal](rumoca-typed-scalar-local-performance-proposal.md). Review bundle: `$HOME/scratch/slam_web/tmp/typed-scalar-local-review`; patch `typed-scalar-locals.patch`, SHA-256 `2167863a42ec1a16e301a6f4257e6f94be892c1f555619f7b61471f956b07d89`. The bundle includes five original preimages, nine final files, hash manifests and detailed review/gate instructions. The sibling compiler remains untouched; its source and Cargo gates belong to the covariance owner.

The patch plans unique rank-zero locals per checked owner, exact nested region path and register ordinal. Every frame-slot overlap and every operand/result of an unsupported or address-taking operation keeps its original memory location. The checked IR's exhaustive register visitors provide this exclusion, including call/region tuples, dynamic indices and view-axis inputs. Arrays, slots, scratch layout, ABI guards, publication order and fault identities remain unchanged. Central scalar reads/writes preserve raw transport bits and existing arithmetic/guard order. Complete-owner checked local counts cap total parameters plus locals at 50,000, with deterministic memory fallback rather than a new refusal. There is no production toggle; test-only scoped controls select the original memory paths and reduced caps.

Staged, unrun controls compare exact raw statuses/output bytes and complete fault/layout identities against the memory-only plan, plus the canonical evaluator. They cover every admitted scalar operation, slot mutation snapshots, exact NaN payload/signed-zero transport, input/ABI/domain errors, budget fallback, nested Conditional/Fold/Map paths, scalar/array calls and recovery. Explicit recursive alias assertions include an actual wrapped-region output alias; one-element arrays and an address-escaping Fill require identical memory-plan bytes.

Rustfmt parsing/formatting, whitespace checks, source-preimage verification and copied-tree patch application checks passed. Rust compilation and tests have **not run**. Focused future gate selectors are `cargo test -p rumoca-exec-wasm --lib typed_call::scalars::tests`, `--lib typed_call::emit::tests`, and `--test typed_calls`, followed by the existing applicable broader gates and unchanged original-source artifact checks.

The [independent root review](rumoca-typed-scalar-local-review-verification.json)
now archives the frozen patch and manifests, checks all five current compiler
preimages, applies it to a fresh owned copy and verifies all nine resulting
file hashes. The four new files remain absent from the main compiler checkout.
This remains an uncompiled review result; actual local counts, numerical
execution and performance still require the compiler-owner gates.

The separate [engine-limit probe](wasm-scalar-local-limit-verification.json) establishes only the recorded Node/Chromium boundary. The [original full21 register inventory](schmidt-scalar-register-inventory-verification.json) gives 150 rank-zero registers per profiled PSD owner as a complete-owner upper bound. Neither establishes this patch's eligibility counts, semantics or speed. Actual native artifact and performance evidence remain pending successful compiler-owner gates.
