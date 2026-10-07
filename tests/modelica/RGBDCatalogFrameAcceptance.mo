model RGBDCatalogFrameAcceptance
  parameter Integer trials = 96;
  output Boolean checks[6];
equation
  checks = RGBDCatalogFrameTests.Run(trials);
end RGBDCatalogFrameAcceptance;
