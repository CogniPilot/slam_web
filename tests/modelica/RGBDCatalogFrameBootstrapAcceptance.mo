model RGBDCatalogFrameBootstrapAcceptance
  parameter Integer trials = 96;
  output Boolean checks[7];
equation
  checks = RGBDCatalogFrameBootstrapTests.Run(trials);
end RGBDCatalogFrameBootstrapAcceptance;
