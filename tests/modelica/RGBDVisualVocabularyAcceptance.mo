model RGBDVisualVocabularyAcceptance
  output Boolean checks[RGBDVisualVocabularyTests.checkCount];
equation
  checks = RGBDVisualVocabularyTests.Run(time);
end RGBDVisualVocabularyAcceptance;
