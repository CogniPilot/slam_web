model RGBDLoopAnchorEvictionAcceptance
  output Boolean checks[8];
equation
  checks = RGBDLoopAnchorEvictionTests.Run(time);
end RGBDLoopAnchorEvictionAcceptance;
