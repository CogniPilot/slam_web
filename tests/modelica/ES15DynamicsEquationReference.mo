// Frozen original equation model before pure-function extraction.
// Original SHA256: 50c29cf0059d9316010e676a37aac2bc94937eb0b9f97140865460bf9cbbcdbf
// Continuous error dynamics for the RGB-D / airframe IMU teaching filter.
// Error order: world dp, world dv, right-local dtheta, body dba, body dbg.
// R_true = R * Exp(dtheta); measurements are true body values + bias + noise.
// Noise order: acceleration white, gyro white, acceleration bias walk,
// gyro bias walk. These conventions differ from a right SE_2(3) filter.
// A host retains the filter state; all F/G mathematics below is Modelica.
model ES15DynamicsEquationReference
  input Real rotation[3,3] = identity(3);
  input Real force[3] = {0.0,0.0,9.81};
  input Real omega[3] = {0.0,0.0,0.0};
  output Real F[15,15];
  output Real G[15,12];
protected
  Real forceSkew[3,3];
  Real omegaSkew[3,3];
equation
  forceSkew = [0.0,-force[3],force[2];
               force[3],0.0,-force[1];
               -force[2],force[1],0.0];
  omegaSkew = [0.0,-omega[3],omega[2];
               omega[3],0.0,-omega[1];
               -omega[2],omega[1],0.0];
  for i in 1:3 loop
    for j in 1:3 loop
      F[i,j] = 0.0;
      F[i,j+3] = if i == j then 1.0 else 0.0;
      F[i,j+6] = 0.0;
      F[i,j+9] = 0.0;
      F[i,j+12] = 0.0;
      F[i+3,j] = 0.0;
      F[i+3,j+3] = 0.0;
      F[i+3,j+6] = -(rotation[i,1]*forceSkew[1,j]
                      +rotation[i,2]*forceSkew[2,j]
                      +rotation[i,3]*forceSkew[3,j]);
      F[i+3,j+9] = -rotation[i,j];
      F[i+3,j+12] = 0.0;
      F[i+6,j] = 0.0;
      F[i+6,j+3] = 0.0;
      F[i+6,j+6] = -omegaSkew[i,j];
      F[i+6,j+9] = 0.0;
      F[i+6,j+12] = if i == j then -1.0 else 0.0;
      F[i+9,j] = 0.0;
      F[i+9,j+3] = 0.0;
      F[i+9,j+6] = 0.0;
      F[i+9,j+9] = 0.0;
      F[i+9,j+12] = 0.0;
      F[i+12,j] = 0.0;
      F[i+12,j+3] = 0.0;
      F[i+12,j+6] = 0.0;
      F[i+12,j+9] = 0.0;
      F[i+12,j+12] = 0.0;

      G[i,j] = 0.0;
      G[i,j+3] = 0.0;
      G[i,j+6] = 0.0;
      G[i,j+9] = 0.0;
      G[i+3,j] = -rotation[i,j];
      G[i+3,j+3] = 0.0;
      G[i+3,j+6] = 0.0;
      G[i+3,j+9] = 0.0;
      G[i+6,j] = 0.0;
      G[i+6,j+3] = if i == j then -1.0 else 0.0;
      G[i+6,j+6] = 0.0;
      G[i+6,j+9] = 0.0;
      G[i+9,j] = 0.0;
      G[i+9,j+3] = 0.0;
      G[i+9,j+6] = if i == j then 1.0 else 0.0;
      G[i+9,j+9] = 0.0;
      G[i+12,j] = 0.0;
      G[i+12,j+3] = 0.0;
      G[i+12,j+6] = 0.0;
      G[i+12,j+9] = if i == j then 1.0 else 0.0;
    end for;
  end for;
end ES15DynamicsEquationReference;
