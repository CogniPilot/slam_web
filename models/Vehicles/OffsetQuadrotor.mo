model OffsetQuadrotor
  "Quadrotor with a shared world ENU plant and reference spawn position"

  parameter Real initialPosition[3] = {0, 2, initialHeight}
    "Initial world ENU position [m]";

  extends LabQuadrotor(
    vehicle(p_start = transpose(worldToEnu) * initialPosition),
    pathPosition(start = initialPosition),
    targetPosition = initialPosition);
end OffsetQuadrotor;
