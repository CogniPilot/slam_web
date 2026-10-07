// Full catalog semantics through normal model instantiation; no smaller domains.
// Production compilation/runtime remains Rumoca SolveIR WASM.
model RGBDKeyframeAcceptance
  parameter Integer initialGeneration = 1;
  output Boolean checks[20];
algorithm
  checks := RGBDKeyframeTests.Run(initialGeneration);
end RGBDKeyframeAcceptance;
