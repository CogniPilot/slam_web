model RGBDKeyframePolicyAcceptance
  output Boolean checks[30];
equation
  checks = RGBDKeyframePolicyTests.Run(time);
end RGBDKeyframePolicyAcceptance;
