model RGBDMapClockReceiptAcceptance
  output Boolean checks[17];
equation
  checks = RGBDMapClockTests.Receipts();
end RGBDMapClockReceiptAcceptance;
