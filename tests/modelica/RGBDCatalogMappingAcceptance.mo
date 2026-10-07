model RGBDCatalogMappingAcceptance
  parameter Integer trials = 96;
  output Boolean checks[18];
equation
  checks = RGBDCatalogMappingTests.Run(trials);
end RGBDCatalogMappingAcceptance;
