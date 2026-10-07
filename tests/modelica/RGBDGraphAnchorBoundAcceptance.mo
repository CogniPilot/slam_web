model RGBDGraphAnchorBoundAcceptance
  output Boolean checks[25];
equation
  checks = RGBDGraphAnchorBoundTests.Run(time);
end RGBDGraphAnchorBoundAcceptance;
