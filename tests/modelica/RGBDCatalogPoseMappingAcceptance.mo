model RGBDCatalogPoseMappingAcceptance
  parameter Integer trials = 96;
  output Boolean checks[13];
equation
  checks = RGBDCatalogPoseMappingTests.Run(trials);
end RGBDCatalogPoseMappingAcceptance;
