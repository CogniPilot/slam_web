// Normal model instantiation binds every array to its original complete domain.
model RGBDKeyframeLandmarkAcceptance
  parameter Integer slots = 14400;
  parameter Integer features = 350;
  parameter Integer nodes = 128;
  output Boolean checks[16]; output Integer slotsValidated;
algorithm
  (checks,slotsValidated) := RGBDKeyframeLandmarkTests.Run(slots,features,nodes);
end RGBDKeyframeLandmarkAcceptance;
