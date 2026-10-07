model SchmidtGraphPoseCorrectionAcceptance
  output Boolean checks[54];
equation
  checks = cat(1,SchmidtGraphPoseCorrectionTests.Run(time),SchmidtGraphPoseCorrectionTests.CloneRun(time));
end SchmidtGraphPoseCorrectionAcceptance;
