model RGBDGraphMeasurementAcceptance
  output Boolean checks[20];
equation
  checks = RGBDGraphMeasurementTests.Run(time);
end RGBDGraphMeasurementAcceptance;
