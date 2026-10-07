# Vendored quadrotor plant

QuadrotorSIL is copied from the CogniPilot Rumoca interactive quadrotor example. RigidBody6DOF and quaternion functions are copied from CogniPilot Modelica Models (CMM). Both projects use Apache-2.0; the license is included here. Exact revisions, source paths, hashes and packaging changes are recorded in provenance.json.

The plant, motor, aerodynamic and ground-contact equations are unchanged. The two CMM quaternion functions are nested into their original qualified package names so the dependency closure is one browser-readable Modelica source. Only the application controller/frame/interface wrapper is new.
