model ModelicaPoseGraphCovarianceAcceptance
  output Integer scenario;
  output Real upper[12,12]; output Real lower[12,12]; output Real residualUpper[12,12];
  output Boolean accepted; output Integer status; output Integer treeEdges; output Integer activeNodes;
  output Boolean roundoffCertified; output Boolean converged[12]; output Integer iterations[12];
  output Real residualNorm[12];
equation
  (scenario,upper,lower,residualUpper,accepted,status,treeEdges,activeNodes,
   roundoffCertified,converged,iterations,residualNorm)=ModelicaPoseGraphCovarianceTests.AtTime(time);
end ModelicaPoseGraphCovarianceAcceptance;
