model RGBDCatalogLoopAcceptance
  parameter Integer trials = 96;
  output Boolean checks[10];
equation
  checks = RGBDCatalogLoopTests.Run(trials);
end RGBDCatalogLoopAcceptance;
