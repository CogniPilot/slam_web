model RGBDMapClockAcceptance
  output Boolean checks[14];
equation
  checks = RGBDMapClockTests.Run(14400,350);
end RGBDMapClockAcceptance;
