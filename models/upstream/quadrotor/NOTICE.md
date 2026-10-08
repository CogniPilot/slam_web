# Vendored quadrotor plant

QuadrotorSIL is copied unchanged from the CogniPilot Rumoca interactive quadrotor example. Its revision, source path and hashes are recorded in provenance.json. The Apache-2.0 license is included here.

Rigid-body dynamics, quaternion math, position and attitude control, body-rate control and motor allocation come from the local [CogniPilot Modelica Models library](../../Libraries/README.md). The application wrapper supplies references and the ENU interface; actual motor dynamics drive the plant.
