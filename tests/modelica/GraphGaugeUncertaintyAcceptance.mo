model GraphGaugeUncertaintyAcceptance
  output Boolean checks[37];
equation
  checks = cat(1,GraphGaugeUncertaintyTests.Run(time),GraphGaugeUncertaintyTests.CloneRun(time));
end GraphGaugeUncertaintyAcceptance;
