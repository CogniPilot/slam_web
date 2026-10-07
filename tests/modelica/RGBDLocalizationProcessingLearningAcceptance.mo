model RGBDLocalizationProcessingLearningAcceptance
  output Boolean checks[15];
algorithm
  when initial() then checks := RGBDLocalizationProcessingTests.Learning(time); end when;
end RGBDLocalizationProcessingLearningAcceptance;
