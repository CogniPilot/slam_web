model RGBDLocalizationCatalogAcceptance
  parameter Integer trials = 96;
  output Boolean checks[24];
equation
  checks = RGBDLocalizationCatalogTests.Run(trials,time);
end RGBDLocalizationCatalogAcceptance;
