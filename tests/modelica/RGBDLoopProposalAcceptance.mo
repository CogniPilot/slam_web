// Independent OMC semantics fixture; production compilation remains Rumoca.
// Instantiating a model gives helper calls their actual argument dimensions.
model RGBDLoopProposalAcceptance
  parameter Integer trials = 96;
  output Boolean checks[29];
algorithm
  checks := RGBDLoopVerificationTests.Run(trials);
end RGBDLoopProposalAcceptance;
