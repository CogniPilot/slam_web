model RGBDMapClockLegacyAcceptance
  output Boolean checks[29];
equation
  checks = RGBDMapClockTests.Legacy();
end RGBDMapClockLegacyAcceptance;
