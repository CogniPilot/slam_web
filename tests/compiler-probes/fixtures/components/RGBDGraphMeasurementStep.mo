// This stateless proposal wrapper never publishes graph/catalog/filter state.
// The outer lockstep transaction owns publication after all owners accept.
model RGBDGraphMeasurementStep
  input RGBDKeyframes.Catalog previousCatalog = RGBDKeyframes.Empty();
  input RGBDKeyframes.Catalog capturedCatalog = RGBDKeyframes.Empty();
  input RGBDGraphMeasurements.State previous = RGBDGraphMeasurements.Empty();
  input RGBDLoopVerification.Proposal sequential = RGBDLoopVerification.EmptyProposal(7);
  input RGBDLoopVerification.Proposal loops[RGBDGraphMeasurements.proposalCapacity];
  input Boolean requested = false;
  input Boolean reset = false;
  parameter Real inlierDistance = 0.08;
  parameter Real maximumRms = 0.03;
  output RGBDGraphMeasurements.Update update;
  output RGBDGraphMeasurements.Problem problem;
equation
  update = RGBDGraphMeasurements.Capture(previousCatalog,capturedCatalog,previous,
    sequential,loops,requested,reset,inlierDistance,maximumRms);
  problem = RGBDGraphMeasurements.PrepareProblem(capturedCatalog,update.state,update.accepted);
end RGBDGraphMeasurementStep;
