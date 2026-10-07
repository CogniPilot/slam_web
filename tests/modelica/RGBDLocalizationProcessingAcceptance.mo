model RGBDLocalizationProcessingAcceptance
  output Boolean checks[12];
algorithm
  when initial() then checks := RGBDLocalizationProcessingTests.Main(time); end when;
end RGBDLocalizationProcessingAcceptance;
