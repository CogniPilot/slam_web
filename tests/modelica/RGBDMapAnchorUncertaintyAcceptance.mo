model RGBDMapAnchorUncertaintyAcceptance
  output Boolean checks[33];
equation
  checks = RGBDMapAnchorUncertaintyTests.Run();
end RGBDMapAnchorUncertaintyAcceptance;
