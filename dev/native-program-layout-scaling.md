# Large carried-state metadata transport

`src/modelica-native-program.ts` previously scanned the entire `input_names`
array for each derived Integer/Boolean output during artifact validation.
For N scalar inputs and M typed outputs this added O(N*M) name comparisons.
The full catalog alone retains128×350×49 descriptor cells; metadata admission
must not multiply input and output inventories. These are source-level costs,
not a measured full-SLAM profile or throughput result.

That redundant scan is removed. The preceding validation already requires
every input name to have an ordinary P binding; checking whether a derived
output has any ordinary binding therefore also catches every input conflict.
Malformed input and output collisions retain the same rejection rules. Derived
output view lookup also uses a name map built once, replacing a linear scan on
every access. Representation checks and cached exact typed views remain.

No numerical algorithm, compiler, SolveIR lowering, generated module or ABI
changed. These changes affect host metadata validation and typed view access.
Compact aggregate metadata and compiler-managed state/buffer liveness remain
upstream requirements; this does not make the full application executable.

Validation after the change:

- TypeScript `tsc --noEmit` passes.
- Native-program consumer probe selection:5 passed,4 explicitly skipped
  without their opt-in compiler/artifact inputs.
- The typed-output suite with retained actual browser-issued `Edge` artifact
  `pr382-4b42587c-typed-program-admission/final-artifact.json` executes all3
  tests, including the actual compiler module's moving inputs, exact64-bit
  Integer output, Boolean output, readonly input storage, reset and source
  rejection. The other2 tests are explicitly handcrafted transport controls.
- The checked-gather controls above use retained actual compiler-issued
  modules and check runtime faults, rollback and recovery.

This evidence establishes consumer behavior on those modules. No new full
SLAM artifact, performance benchmark, browser session or10x claim is implied.
