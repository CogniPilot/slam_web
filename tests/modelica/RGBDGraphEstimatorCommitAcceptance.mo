model RGBDGraphEstimatorCommitAcceptance
  output Boolean checks[30];
algorithm
  when initial() then
    checks := cat(1,RGBDGraphEstimatorCommitTests.Run(time),RGBDGraphEstimatorCommitTests.CloneRun(time));
  end when;
end RGBDGraphEstimatorCommitAcceptance;
