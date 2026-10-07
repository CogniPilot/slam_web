// Small dot-product control for signed-zero changes observed in LabQuadrotor.
// The initial comparison agrees here; this is not a plant-bug reproducer.
// A zero sign can become a finite heading difference at atan2's branch cut.
model NativeZeroDotProduct
  input Real value[3] = {1.0,0.0,0.0};
  parameter Real rotation[3,3] = [0.0,-1.0,0.0;1.0,0.0,0.0;0.0,0.0,1.0];
  output Real rotated[3];
  output Real direct;
  output Real bearing;
equation
  rotated = rotation*value;
  direct = 0.0*value[1]-value[2]+0.0*value[3];
  bearing = atan2(rotated[1],-1.0);
end NativeZeroDotProduct;
