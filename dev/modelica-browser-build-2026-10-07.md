# Browser Modelica build integration

The full source workspace now has **Check WASM build**. It submits the exact
saved dependency snapshot to Rumoca in a dedicated browser worker, checks the
compiler-issued executable ABI and returns a source-bound receipt. Cancellation
terminates the owned worker, including synchronous compiler execution. No
numerical server, application compiler or alternative numerical backend is used.

This closes the browser build-request gap; it does not establish successful SLAM
compilation or execution. The installed0.10.0 package has no native producer API.
The downloaded PR382 CI package0.10.2/edc9b8ea7b08 exposes that API but refuses the
current full Reset model in ToDae at a nested function assignment target. The
direct probe took2.151s in the compiler and issued no executable. The package
was downloaded from workflow37603821354, artifact11475440849, with paired WASM
SHA2565486e3afead83060bbcca4b3c8a37ce53afa3d961fb9f940d31af8a5f7b954d0.

All59 authored Modelica files still match native source
SHA256f3272ea69928df2fbb3030e1d289b83bf1d34dd8283782e4d153711fb1aa1841.
No algorithm, capacity, physics source or production compiler pin changed.
Complete native State issuance, lossless cross-entrypoint transfer, raw-image
ingress and numerical browser execution remain required. There is no new
full-SLAM throughput result or10× realtime claim.

## Qualification

The actual built application passes three checks with hardware rendering:
installed-compiler failure reporting without changing the saved project;
actual CI compilation with concurrent source edits, cancellation, confirmed
worker termination and retry; and the existing59-file editor/LSP/local save/
download/reload check, including historical56-file imports.

All three also pass with software rendering before a final CSS visibility fix.
The same production compiler/client logic is unchanged. Final hardware checks
add assertions that Cancel is visible during a build and hidden after completion.
Visual review caught the global button style overriding the HTML hidden
attribute; the scoped CSS correction and updated screenshots are retained.
TypeScript checking passes.

Software test startup required43–47s on two low-priority CPU cores with
SwiftShader. Earlier45s setup failures and an unbounded worker-close-notification
wait are preserved. The final test uses the existing90s baseline startup
allowance and bounded polling of the specific worker handle. This is a real
software startup limitation, not a performance acceptance. Final runs took
164.85s/software and61.68s/hardware, with aggregate owned peak RSS about3.82GiB
and3.92GiB respectively. Both used an8GiB RSS guard and16GiB host reserve.

[Bound review and receipts](artifacts/modelica-browser-build-2026-10-07/review.json)
include source/package identities, retained failures, final screenshots and
resource summaries. Heavy builds, browser profiles and logs remain in
`$HOME/scratch/slam_web`.

The existing preview at http://localhost:4173 serves the new controls. Choose
the SLAM node, open a **Modelica source** file, then **Check WASM build**. The
installed compiler's unavailable-API message is expected. The active estimator
remains Modelica inertial propagation.
