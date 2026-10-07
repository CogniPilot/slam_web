// Isolate validation without altering the complete optimizer.
model PoseGraphValidationStorage
  constant Integer nodeCapacity = 128;
  constant Integer edgeCapacity = 256;
  input Real position[nodeCapacity,3];
  input Real rotation[nodeCapacity,3,3];
  input Real nodeMask[nodeCapacity];
  input Real edgeMask[edgeCapacity];
  input Real fromNode[edgeCapacity];
  input Real toNode[edgeCapacity];
  input Real translation[edgeCapacity,3];
  input Real measuredRotation[edgeCapacity,3,3];
  input Real information[edgeCapacity,6,6];
  output Integer source[edgeCapacity];
  output Integer target[edgeCapacity];
  output Real status;
  output Real activeNodes;
  output Real activeEdges;
equation
  (source,target,status,activeNodes,activeEdges) = PGValidateGraph(position,rotation,
    nodeMask,edgeMask,fromNode,toNode,translation,measuredRotation,information);
end PoseGraphValidationStorage;
