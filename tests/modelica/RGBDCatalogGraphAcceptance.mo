model RGBDCatalogGraphAcceptance
  parameter Integer trials = 96;
  output Boolean checks[10];
equation
  checks = RGBDCatalogGraphTests.Run(trials);
end RGBDCatalogGraphAcceptance;
