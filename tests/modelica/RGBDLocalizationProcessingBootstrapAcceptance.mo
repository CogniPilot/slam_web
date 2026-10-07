model RGBDLocalizationProcessingBootstrapAcceptance
  output Boolean checks[3];
algorithm
  when initial() then checks := RGBDLocalizationProcessingTests.Bootstrap(time); end when;
end RGBDLocalizationProcessingBootstrapAcceptance;
