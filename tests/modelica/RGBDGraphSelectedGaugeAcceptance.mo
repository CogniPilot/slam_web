model RGBDGraphSelectedGaugeAcceptance
  output Boolean checks[RGBDGraphSelectedGaugeTests.checkCount];
equation
  checks = RGBDGraphSelectedGaugeTests.Run(time);
end RGBDGraphSelectedGaugeAcceptance;
