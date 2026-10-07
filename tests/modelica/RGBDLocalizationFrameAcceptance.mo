model RGBDLocalizationFrameAcceptance
  output Boolean checks[30];
equation
  checks = RGBDLocalizationFrameTests.Run(time);
end RGBDLocalizationFrameAcceptance;
