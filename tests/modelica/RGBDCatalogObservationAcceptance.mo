model RGBDCatalogObservationAcceptance
  parameter Integer slots = 14400; parameter Integer features = 350;
  parameter Integer nodes = 128; parameter Integer edges = 256;
  output Boolean checks[18];
equation
  checks = RGBDCatalogObservationTests.Run(slots,features,nodes,edges);
end RGBDCatalogObservationAcceptance;
