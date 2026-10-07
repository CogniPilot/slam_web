model RGBDGraphSelectedGaugeContextAcceptance
  output Boolean checks[RGBDGraphSelectedGaugeContextTests.checkCount];
equation
  checks = RGBDGraphSelectedGaugeContextTests.Run(time);
end RGBDGraphSelectedGaugeContextAcceptance;
