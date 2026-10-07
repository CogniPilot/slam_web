model RGBDKeyframeInitializationAcceptance
  parameter Integer generation = 1;
  output Boolean checks[3];
  output Integer slotsValidated;
algorithm
  (checks,slotsValidated) := RGBDKeyframeInitializationTests.Run(generation);
end RGBDKeyframeInitializationAcceptance;
