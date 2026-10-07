model RGBDMapAnchorUncertaintyAcceptance
  output Boolean checks[32];
equation
  checks = RGBDMapAnchorUncertaintyTests.Run();
end RGBDMapAnchorUncertaintyAcceptance;
