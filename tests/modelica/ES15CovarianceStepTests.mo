// Full-capacity extraction control. The frozen equation model and the function
// receive the same runtime-varying matrices; no truth or estimator host path.
model ES15CovarianceStepTests
  Real F[15,15];
  Real G[15,12];
  Real factor[15,15];
  Real P[15,15];
  Real density[12];
  Real dt;
  output Real stepPhi[15,15];
  output Real stepQ[15,15];
  output Real stepPredicted[15,15];
  output Real referencePhi[15,15];
  output Real referenceQ[15,15];
  output Real referencePredicted[15,15];
  output Real adapterPhi[15,15];
  output Real adapterQ[15,15];
  output Real adapterPredicted[15,15];
  output Real zeroPhi[15,15];
  output Real zeroQ[15,15];
  output Real zeroPredicted[15,15];
  output Real analyticPhi[15,15];
  output Real analyticQ[15,15];
  output Real analyticPredicted[15,15];
  ES15CovariancePredictionOriginal reference(F=F,G=G,P=P,dt=dt,density=density);
  ES15CovariancePrediction adapter(F=F,G=G,P=P,dt=dt,density=density);
equation
  dt = if time < 0.04 then 0.0 else if time < 0.08 then 1e-7
    else if time < 0.12 then 0.001 else if time < 0.16 then 0.005
    else if time < 0.20 then 1.0/90.0 else 0.02;
  for i in 1:15 loop
    for j in 1:15 loop
      F[i,j] = (if i == j then -0.2*i else 0.0)
        +0.17*sin(3*i+7*j+2*time)+0.03*cos(5*i-j-time);
      factor[i,j] = (if i == j then 0.4+0.01*i else 0.0)
        +0.03*cos(i+2*j+time);
      P[i,j] = sum(factor[i,k]*factor[j,k] for k in 1:15)
        +(if i == j then 0.1+0.01*i else 0.0);
    end for;
    for j in 1:12 loop
      G[i,j] = 0.13*sin(2*i+3*j-time)+0.07*cos(7*i-j+3*time);
    end for;
  end for;
  for j in 1:12 loop
    density[j] = if time < 0.12 then 0.0
      else (0.002+0.003*j)*(1.0+0.2*sin(j+time));
  end for;
  (stepPhi,stepQ,stepPredicted) = ES15CovarianceStep(F,G,P,dt,density);
  referencePhi = reference.Phi;
  referenceQ = reference.Q;
  referencePredicted = reference.predicted;
  adapterPhi = adapter.Phi;
  adapterQ = adapter.Q;
  adapterPredicted = adapter.predicted;
  (zeroPhi,zeroQ,zeroPredicted) = ES15CovarianceStep(fill(0.0,15,15),G,P,dt,density);
  for i in 1:15 loop
    for j in 1:15 loop
      analyticPhi[i,j] = if i == j then 1.0 else 0.0;
      analyticQ[i,j] = dt*sum(G[i,k]*G[j,k]*density[k]^2 for k in 1:12);
      analyticPredicted[i,j] = 0.5*(P[i,j]+P[j,i]+analyticQ[i,j]+analyticQ[j,i]);
    end for;
  end for;
end ES15CovarianceStepTests;
