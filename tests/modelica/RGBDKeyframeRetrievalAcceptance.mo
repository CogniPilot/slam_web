model RGBDKeyframeRetrievalAcceptance
  parameter Integer initialGeneration = 1;
  output Boolean checks[20];
equation
  checks = RGBDKeyframeRetrievalTests.Run(initialGeneration);
end RGBDKeyframeRetrievalAcceptance;
