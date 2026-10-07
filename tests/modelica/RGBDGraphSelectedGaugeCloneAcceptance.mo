model RGBDGraphSelectedGaugeCloneAcceptance
  output Boolean checks[RGBDGraphSelectedGaugeCloneTests.checkCount];
equation
  checks = RGBDGraphSelectedGaugeCloneTests.Run(time);
end RGBDGraphSelectedGaugeCloneAcceptance;
