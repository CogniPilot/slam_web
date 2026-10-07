model RGBDGraphSelectedGaugeAnchorAcceptance
  output Boolean checks[RGBDGraphSelectedGaugeAnchorTests.checkCount];
equation
  checks = RGBDGraphSelectedGaugeAnchorTests.Run(time);
end RGBDGraphSelectedGaugeAnchorAcceptance;
