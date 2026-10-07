model RGBDGraphProcessingAcceptance
  output Boolean checks[RGBDGraphProcessingTests.checkCount];
algorithm
  when initial() then
    checks := RGBDGraphProcessingTests.Run(time);
  end when;
end RGBDGraphProcessingAcceptance;
