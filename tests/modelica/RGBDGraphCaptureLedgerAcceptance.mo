model RGBDGraphCaptureLedgerAcceptance
  output Boolean checks[16];
equation
  checks = RGBDGraphCaptureLedgerTests.Run();
end RGBDGraphCaptureLedgerAcceptance;
