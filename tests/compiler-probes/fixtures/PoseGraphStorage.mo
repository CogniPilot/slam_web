// Full production shapes. Separate roots isolate compiler storage planning;
// they are diagnostics, not replacement optimizer paths.
model PoseGraphLinearizeStorage
  constant Integer nodeCapacity = 128;
  constant Integer edgeCapacity = 256;
  input Real position[nodeCapacity,3];
  input Real rotation[nodeCapacity,3,3];
  input Real edgeMask[edgeCapacity];
  input Integer source[edgeCapacity];
  input Integer target[edgeCapacity];
  input Real translation[edgeCapacity,3];
  input Real measuredRotation[edgeCapacity,3,3];
  input Real information[edgeCapacity,6,6];
  output Real gradient[nodeCapacity,6];
  output Real blocks[nodeCapacity,6,6];
  output Real sourceJacobian[edgeCapacity,6,6];
  output Real targetJacobian[edgeCapacity,6,6];
equation
  (sourceJacobian,targetJacobian,gradient,blocks) = PGLinearize(
    position,rotation,edgeMask,source,target,translation,measuredRotation,information);
end PoseGraphLinearizeStorage;

model PoseGraphPCGStorage
  constant Integer nodeCapacity = 128;
  constant Integer edgeCapacity = 256;
  input Real gradient[nodeCapacity,6];
  input Real blocks[nodeCapacity,6,6];
  input Real nodeMask[nodeCapacity];
  input Real edgeMask[edgeCapacity];
  input Integer source[edgeCapacity];
  input Integer target[edgeCapacity];
  input Real sourceJacobian[edgeCapacity,6,6];
  input Real targetJacobian[edgeCapacity,6,6];
  input Real information[edgeCapacity,6,6];
  input Real damping = 0.001;
  input Real tolerance = 1e-5;
  input Integer maximumPCG = 48;
  output Real delta[nodeCapacity,6];
  output Real iterations;
  output Real initialNorm;
  output Boolean valid;
equation
  (delta,iterations,initialNorm,valid) = PGPCG(gradient,blocks,nodeMask,edgeMask,
    source,target,sourceJacobian,targetJacobian,information,damping,tolerance,maximumPCG);
end PoseGraphPCGStorage;

model PoseGraphStepStorage
  constant Integer nodeCapacity = 128;
  constant Integer edgeCapacity = 256;
  input Real position[nodeCapacity,3];
  input Real rotation[nodeCapacity,3,3];
  input Real nodeMask[nodeCapacity];
  input Real edgeMask[edgeCapacity];
  input Integer source[edgeCapacity];
  input Integer target[edgeCapacity];
  input Real translation[edgeCapacity,3];
  input Real measuredRotation[edgeCapacity,3,3];
  input Real information[edgeCapacity,6,6];
  input Real currentCost;
  input Real damping = 0.001;
  input Real maximumPositionStep = 0.5;
  input Real maximumAngleStep = 0.2;
  input Real pcgTolerance = 1e-5;
  input Integer maximumPCG = 48;
  input Integer maximumBacktracks = 8;
  output Real nextPosition[nodeCapacity,3];
  output Real nextRotation[nodeCapacity,3,3];
  output Real nextCost;
  output Real nextDamping;
  output Real accepted;
  output Real iterations;
  output Boolean running;
equation
  (nextPosition,nextRotation,nextCost,nextDamping,accepted,iterations,running) = PGStep(
    position,rotation,nodeMask,edgeMask,source,target,translation,measuredRotation,information,
    currentCost,damping,maximumPositionStep,maximumAngleStep,pcgTolerance,maximumPCG,maximumBacktracks);
end PoseGraphStepStorage;

model PoseGraphRunStorage
  constant Integer nodeCapacity = 128;
  constant Integer edgeCapacity = 256;
  input Real position[nodeCapacity,3];
  input Real rotation[nodeCapacity,3,3];
  input Real nodeMask[nodeCapacity];
  input Real edgeMask[edgeCapacity];
  input Integer source[edgeCapacity];
  input Integer target[edgeCapacity];
  input Real translation[edgeCapacity,3];
  input Real measuredRotation[edgeCapacity,3,3];
  input Real information[edgeCapacity,6,6];
  input Real initialCost;
  input Real initialDamping = 0.001;
  input Real maximumPositionStep = 0.5;
  input Real maximumAngleStep = 0.2;
  input Real pcgTolerance = 1e-5;
  input Integer maximumIterations = 8;
  input Integer maximumPCG = 48;
  input Integer maximumBacktracks = 8;
  output Real nextPosition[nodeCapacity,3];
  output Real nextRotation[nodeCapacity,3,3];
  output Real cost;
  output Real acceptedIterations;
  output Real pcgIterations;
equation
  (nextPosition,nextRotation,cost,acceptedIterations,pcgIterations) = PGRun(
    position,rotation,nodeMask,edgeMask,source,target,translation,measuredRotation,information,
    initialCost,initialDamping,maximumPositionStep,maximumAngleStep,pcgTolerance,
    maximumIterations,maximumPCG,maximumBacktracks);
end PoseGraphRunStorage;
